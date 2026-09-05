#![cfg(feature = "test-faults")]

use std::{path::Path, sync::Arc};

use anyhow::{Context, Result};
use depot::{
	cold_tier::{ColdTier, FilesystemColdTier},
	conveyer::{Db, branch},
	keys::{self, PAGE_SIZE, SHARD_SIZE, branch_compaction_cold_shard_key},
	types::{
		BucketId, DatabaseBranchId, DirtyPage, FetchedPage, GetPagesOptions, PageSourceKind,
		SnapshotSelector, decode_cold_shard_ref, decode_commit_row, decode_compaction_root,
		decode_fold_index_entry,
	},
	workflows::compaction::{
		CompactionJobKind, DbColdCompactorWorkflow, DbHotCompactorWorkflow, DbManagerWorkflow,
		DbReclaimerWorkflow, DepotCompactionTestDriver, ForceCompactionWork, test_hooks,
	},
};
use gas::prelude::{Id, Registry, TestCtx};
use rivet_pools::NodeId;
use rivet_test_deps::TestDeps;
use tempfile::Builder;
use uuid::Uuid;

fn test_bucket() -> Id {
	Id::v1(Uuid::from_u128(0x9abd), 1)
}

fn build_registry() -> Registry {
	let mut registry = Registry::new();
	registry.register_workflow::<DbManagerWorkflow>().unwrap();
	registry
		.register_workflow::<DbHotCompactorWorkflow>()
		.unwrap();
	registry
		.register_workflow::<DbColdCompactorWorkflow>()
		.unwrap();
	registry.register_workflow::<DbReclaimerWorkflow>().unwrap();
	registry
}

fn dirty_page(pgno: u32, fill: u8) -> DirtyPage {
	DirtyPage {
		pgno,
		bytes: vec![fill; PAGE_SIZE as usize],
	}
}

fn make_db(test_ctx: &TestCtx, database_id: impl Into<String>) -> Result<Db> {
	let udb_pool = test_ctx.pools().udb()?;
	Ok(Db::new(
		Arc::new((*udb_pool).clone()),
		test_bucket(),
		database_id.into(),
		NodeId::new(),
	))
}

fn make_db_with_cold_tier(
	test_ctx: &TestCtx,
	database_id: impl Into<String>,
	cold_tier: Arc<dyn ColdTier>,
) -> Result<Db> {
	let udb_pool = test_ctx.pools().udb()?;
	Ok(Db::new_with_cold_tier(
		Arc::new((*udb_pool).clone()),
		test_bucket(),
		database_id.into(),
		NodeId::new(),
		cold_tier,
	))
}

async fn test_ctx_with_cold_tier(root: &Path) -> Result<TestCtx> {
	let mut test_deps = TestDeps::new().await?;
	let mut config_root = (**test_deps.config()).clone();
	config_root.sqlite = Some(rivet_config::config::Sqlite {
		workflow_cold_storage: Some(rivet_config::config::SqliteWorkflowColdStorage::FileSystem(
			rivet_config::config::SqliteWorkflowColdStorageFileSystem {
				root: root.display().to_string(),
			},
		)),
		..Default::default()
	});
	test_deps.config = rivet_config::Config::from_root(config_root);
	TestCtx::new_with_deps(build_registry(), test_deps).await
}

async fn read_compaction_root_txid(test_ctx: &TestCtx, branch_id: DatabaseBranchId) -> Result<u64> {
	let udb = test_ctx.pools().udb()?;
	udb.txn("test_depotfold_index_root", move |tx| async move {
		let bytes = tx
			.informal()
			.get(
				&keys::branch_compaction_root_key(branch_id),
				universaldb::utils::IsolationLevel::Serializable,
			)
			.await?
			.map(Vec::<u8>::from)
			.context("compaction root must exist after cold publish")?;
		Ok(decode_compaction_root(&bytes)?.cold_watermark_txid)
	})
	.await
}

async fn read_database_branch_id(
	test_ctx: &TestCtx,
	database_id: &str,
) -> Result<DatabaseBranchId> {
	let db = test_ctx.pools().udb()?;
	let database_id = database_id.to_string();
	db.txn("test_depotfold_index_branch", move |tx| {
		let database_id = database_id.clone();
		async move {
			branch::resolve_database_branch(
				&tx,
				BucketId::from_gas_id(test_bucket()),
				&database_id,
				universaldb::utils::IsolationLevel::Serializable,
			)
			.await?
			.context("database branch should exist")
		}
	})
	.await
}

/// After a hot compaction, every fold the install materialized must be recorded in the `CMP/fold`
/// index with exactly the shard ids that have a live `SHARD` row at that fold txid, and with the
/// fold commit's versionstamp.
#[tokio::test]
async fn fold_index_matches_shard_layout_after_hot_compaction() -> Result<()> {
	let mut test_ctx = TestCtx::new(build_registry()).await?;
	let database_id = "fold-index-hot";
	let db = make_db(&test_ctx, database_id)?;

	// Touch two distinct shards (page 1 -> shard 0, page SHARD_SIZE+1 -> shard 1) so the fold
	// records more than one shard id.
	db.commit(
		vec![dirty_page(1, 0x22), dirty_page(SHARD_SIZE + 1, 0x33)],
		SHARD_SIZE + 2,
		1_000,
	)
	.await?;
	let database_branch_id = read_database_branch_id(&test_ctx, database_id).await?;

	let driver = DepotCompactionTestDriver::new(&test_ctx);
	let manager_workflow_id = driver.start_manager(database_branch_id, None, true).await?;
	let result = driver
		.force_compaction(
			manager_workflow_id,
			database_branch_id,
			ForceCompactionWork {
				hot: true,
				cold: false,
				reclaim: false,
				final_settle: false,
			},
		)
		.await?;
	assert!(result.terminal_error.is_none());

	let udb = test_ctx.pools().udb()?;
	let branch_id = database_branch_id;
	let (fold_count, max_shards) = udb
		.txn("test_depotfold_index_verify", move |tx| async move {
			use universaldb::options::StreamingMode;
			use universaldb::utils::IsolationLevel::Serializable;

			let informal = tx.informal();

			// Collect live SHARD rows grouped by as_of txid.
			let shard_prefix = keys::branch_shard_prefix(branch_id);
			let shard_subspace = universaldb::Subspace::from(
				universaldb::tuple::Subspace::from_bytes(shard_prefix.clone()),
			);
			let mut shard_stream = informal.get_ranges_keyvalues(
				universaldb::RangeOption {
					mode: StreamingMode::WantAll,
					..universaldb::RangeOption::from(&shard_subspace)
				},
				Serializable,
			);
			let mut shards_by_txid: std::collections::BTreeMap<
				u64,
				std::collections::BTreeSet<u32>,
			> = std::collections::BTreeMap::new();
			while let Some(entry) = futures_util::TryStreamExt::try_next(&mut shard_stream).await? {
				let (shard_id, as_of, _) =
					keys::decode_branch_shard_row_key(branch_id, entry.key())?;
				shards_by_txid.entry(as_of).or_default().insert(shard_id);
			}

			// Verify every fold row against the live SHARD layout and the COMMITS versionstamp.
			let fold_prefix = keys::branch_compaction_fold_prefix(branch_id);
			let fold_subspace = universaldb::Subspace::from(
				universaldb::tuple::Subspace::from_bytes(fold_prefix.clone()),
			);
			let mut fold_stream = informal.get_ranges_keyvalues(
				universaldb::RangeOption {
					mode: StreamingMode::WantAll,
					..universaldb::RangeOption::from(&fold_subspace)
				},
				Serializable,
			);
			let mut fold_count = 0usize;
			let mut max_shards = 0usize;
			while let Some(entry) = futures_util::TryStreamExt::try_next(&mut fold_stream).await? {
				let as_of = keys::decode_branch_compaction_fold_txid(branch_id, entry.key())?;
				let fold = decode_fold_index_entry(entry.value())?;

				let expected = shards_by_txid
					.get(&as_of)
					.cloned()
					.unwrap_or_default()
					.into_iter()
					.collect::<Vec<_>>();
				assert_eq!(
					fold.shard_ids, expected,
					"fold index shard set must match live SHARD rows at txid {as_of}"
				);

				let commit_bytes = informal
					.get(&keys::branch_commit_key(branch_id, as_of), Serializable)
					.await?
					.map(Vec::<u8>::from)
					.context("fold txid must have a COMMITS row")?;
				let commit = decode_commit_row(&commit_bytes)?;
				assert_eq!(
					fold.versionstamp, commit.versionstamp,
					"fold versionstamp must match the commit at txid {as_of}"
				);

				fold_count += 1;
				max_shards = max_shards.max(fold.shard_ids.len());
			}

			Ok((fold_count, max_shards))
		})
		.await?;

	assert!(
		fold_count >= 1,
		"hot compaction must record at least one fold"
	);
	assert!(
		max_shards >= 2,
		"the boundary fold must record both touched shards"
	);

	test_ctx.shutdown().await?;
	Ok(())
}

/// Cold compaction plans its work-set from the fold index (selection via a `limit=1` range read and
/// collection via point reads), not by scanning the whole `SHARD/*` prefix. Driving a real cold pass
/// to completion proves the new read path finds the boundary and its shards: it must write cold shard
/// refs and advance the cold watermark.
#[tokio::test]
async fn cold_compaction_runs_via_fold_index() -> Result<()> {
	let cold_root = Builder::new().prefix("fold-index-cold-").tempdir()?;
	let mut test_ctx = test_ctx_with_cold_tier(cold_root.path()).await?;
	let database_id = "fold-index-cold";
	let tier = Arc::new(FilesystemColdTier::new(cold_root.path()));
	let db = make_db_with_cold_tier(&test_ctx, database_id, tier)?;

	db.commit(
		vec![dirty_page(1, 0x44), dirty_page(SHARD_SIZE + 1, 0x55)],
		SHARD_SIZE + 2,
		1_001,
	)
	.await?;
	// Keep the commit metadata pinned until cold publish validates it.
	let restore_point = db.create_restore_point(SnapshotSelector::Latest).await?;
	let database_branch_id = read_database_branch_id(&test_ctx, database_id).await?;

	let driver = DepotCompactionTestDriver::new(&test_ctx);
	let manager_workflow_id = driver.start_manager(database_branch_id, None, true).await?;
	let result = driver
		.force_compaction(
			manager_workflow_id,
			database_branch_id,
			ForceCompactionWork {
				hot: true,
				cold: true,
				reclaim: false,
				final_settle: false,
			},
		)
		.await?;
	assert!(result.terminal_error.is_none(), "cold pass must not error");
	assert!(
		result
			.attempted_job_kinds
			.contains(&CompactionJobKind::Cold),
		"a cold job must run"
	);

	let udb = test_ctx.pools().udb()?;
	for shard_id in [0u32, 1u32] {
		let cold_ref = udb
			.txn("test_depotfold_index_cold_ref", move |tx| async move {
				Ok(tx
					.informal()
					.get(
						&branch_compaction_cold_shard_key(database_branch_id, shard_id, 1),
						universaldb::utils::IsolationLevel::Serializable,
					)
					.await?
					.map(Vec::<u8>::from))
			})
			.await?;
		assert!(
			cold_ref.is_some(),
			"cold shard ref for shard {shard_id} must be written via the fold-index path"
		);
	}

	assert!(
		read_compaction_root_txid(&test_ctx, database_branch_id).await? >= 1,
		"cold watermark must advance past the published fold"
	);

	db.delete_restore_point(restore_point).await?;
	test_ctx.shutdown().await?;
	Ok(())
}

/// Cold-object reclaim must not delete a pinned shard version's S3 object just because the cold
/// watermark advanced past it. A restore point keeps txid 1 a live fold; after the watermark advances
/// to txid 2 and reclaim runs, the txid-1 cold ref and its S3 object must both survive so the
/// restore point's fork read still resolves.
#[tokio::test]
async fn reclaim_keeps_pinned_cold_object_below_watermark() -> Result<()> {
	let cold_root = Builder::new().prefix("fold-index-reclaim-pin-").tempdir()?;
	let tier = Arc::new(FilesystemColdTier::new(cold_root.path()));
	let mut test_ctx = test_ctx_with_cold_tier(cold_root.path()).await?;
	let database_id = "fold-index-reclaim-pin";
	let db = make_db_with_cold_tier(&test_ctx, database_id, tier.clone())?;

	db.commit(vec![dirty_page(1, 0x61)], 2, 1_001).await?;
	// Pin txid 1 and keep the pin for the whole test so it stays a live fold.
	let restore_point = db.create_restore_point(SnapshotSelector::Latest).await?;
	let database_branch_id = read_database_branch_id(&test_ctx, database_id).await?;
	let driver = DepotCompactionTestDriver::new(&test_ctx);
	let manager_workflow_id = driver.start_manager(database_branch_id, None, true).await?;
	let _grace_guard =
		test_hooks::override_cold_object_delete_grace_for_test(database_branch_id, 0);

	// Hot + cold the first commit so a cold ref and S3 object exist for the pinned txid 1.
	driver
		.force_compaction(
			manager_workflow_id,
			database_branch_id,
			ForceCompactionWork {
				hot: true,
				cold: true,
				reclaim: false,
				final_settle: false,
			},
		)
		.await?;
	let pinned_ref = read_cold_shard_ref(&test_ctx, database_branch_id, 0, 1)
		.await?
		.context("pinned txid-1 cold ref should exist after the first cold pass")?;
	assert!(
		tier.get_object(&pinned_ref.object_key).await?.is_some(),
		"pinned cold object should be uploaded"
	);

	// Advance the cold watermark past the pinned txid, then reclaim. The watermark cutoff alone
	// would now delete the txid-1 cold object; the pin must veto that.
	db.commit(vec![dirty_page(1, 0x62)], 2, 1_002).await?;
	let result = driver
		.force_compaction(
			manager_workflow_id,
			database_branch_id,
			ForceCompactionWork {
				hot: true,
				cold: true,
				reclaim: true,
				final_settle: false,
			},
		)
		.await?;
	assert!(result.terminal_error.is_none());
	assert!(
		result
			.attempted_job_kinds
			.contains(&CompactionJobKind::Reclaim)
	);
	assert!(
		read_compaction_root_txid(&test_ctx, database_branch_id).await? >= 2,
		"cold watermark must advance past the pinned txid for this test to exercise the bug"
	);

	assert!(
		read_cold_shard_ref(&test_ctx, database_branch_id, 0, 1)
			.await?
			.is_some(),
		"pinned txid-1 cold ref must survive reclaim"
	);
	assert!(
		tier.get_object(&pinned_ref.object_key).await?.is_some(),
		"pinned txid-1 cold object must survive reclaim"
	);

	db.delete_restore_point(restore_point).await?;
	test_ctx.shutdown().await?;
	Ok(())
}

/// Cold-object reclaim retires a ref only when a newer ref for the same shard exists. Cold publish
/// writes one ref per `(boundary, shard folded at that boundary)`, so a shard folded once and never
/// written again has exactly one ref; retiring it because the cold watermark moved past its txid
/// deletes that shard's only cold coverage, which breaks PITR reads and (once its hot rows are
/// evicted) the shard entirely. The superseded ref of a shard that was rewritten must still go.
#[tokio::test]
async fn reclaim_keeps_newest_cold_object_per_shard() -> Result<()> {
	let cold_root = Builder::new()
		.prefix("fold-index-reclaim-newest-")
		.tempdir()?;
	let tier = Arc::new(FilesystemColdTier::new(cold_root.path()));
	let mut test_ctx = test_ctx_with_cold_tier(cold_root.path()).await?;
	let database_id = "fold-index-reclaim-newest";
	let db = make_db_with_cold_tier(&test_ctx, database_id, tier.clone())?;

	// Touch shard 0 (page 1) and shard 1 (page SHARD_SIZE + 1) so both fold at txid 1.
	db.commit(
		vec![dirty_page(1, 0x61), dirty_page(SHARD_SIZE + 1, 0x71)],
		SHARD_SIZE + 2,
		1_001,
	)
	.await?;
	let database_branch_id = read_database_branch_id(&test_ctx, database_id).await?;
	let driver = DepotCompactionTestDriver::new(&test_ctx);
	let manager_workflow_id = driver.start_manager(database_branch_id, None, true).await?;
	let _grace_guard =
		test_hooks::override_cold_object_delete_grace_for_test(database_branch_id, 0);

	driver
		.force_compaction(
			manager_workflow_id,
			database_branch_id,
			ForceCompactionWork {
				hot: true,
				cold: true,
				reclaim: false,
				final_settle: false,
			},
		)
		.await?;
	let shard0_txid1 = read_cold_shard_ref(&test_ctx, database_branch_id, 0, 1)
		.await?
		.context("shard 0 cold ref at txid 1 should exist after the first cold pass")?;
	let shard1_txid1 = read_cold_shard_ref(&test_ctx, database_branch_id, 1, 1)
		.await?
		.context("shard 1 cold ref at txid 1 should exist after the first cold pass")?;

	// Rewrite shard 0 only. Shard 1 keeps its single txid-1 ref while the cold watermark advances
	// past txid 1, which is exactly the shape the watermark-only cutoff deleted.
	db.commit(vec![dirty_page(1, 0x62)], SHARD_SIZE + 2, 1_002)
		.await?;
	for _ in 0..2 {
		let result = driver
			.force_compaction(
				manager_workflow_id,
				database_branch_id,
				ForceCompactionWork {
					hot: true,
					cold: true,
					reclaim: true,
					final_settle: false,
				},
			)
			.await?;
		assert!(result.terminal_error.is_none());
	}
	assert!(
		read_compaction_root_txid(&test_ctx, database_branch_id).await? >= 2,
		"cold watermark must advance past txid 1 for this test to exercise the bug"
	);

	assert!(
		read_cold_shard_ref(&test_ctx, database_branch_id, 1, 1)
			.await?
			.is_some(),
		"shard 1's only cold ref must survive reclaim"
	);
	assert!(
		tier.get_object(&shard1_txid1.object_key).await?.is_some(),
		"shard 1's only cold object must survive reclaim"
	);

	assert!(
		read_cold_shard_ref(&test_ctx, database_branch_id, 0, 2)
			.await?
			.is_some(),
		"shard 0's newest cold ref must survive reclaim"
	);
	assert!(
		read_cold_shard_ref(&test_ctx, database_branch_id, 0, 1)
			.await?
			.is_none(),
		"shard 0's superseded txid-1 cold ref must be retired"
	);
	assert!(
		tier.get_object(&shard0_txid1.object_key).await?.is_none(),
		"shard 0's superseded txid-1 cold object must be deleted"
	);

	test_ctx.shutdown().await?;
	Ok(())
}

/// A fold above the cold watermark whose shards were all demoted to cold-only (no live `SHARD` rows)
/// must not stall cold compaction. The cold drain advances `cold_watermark_txid` past such a fold
/// without uploading (the watermark-only advance) instead of the selector re-picking the same dead
/// fold forever. This is the PR #350 stall the watermark-only path fixes; demotion is simulated by
/// deleting the `SHARD` rows after the hot pass materializes them, which is exactly what the eviction
/// lane (C5) will do.
#[tokio::test]
async fn cold_watermark_advances_past_fully_demoted_fold() -> Result<()> {
	let cold_root = Builder::new().prefix("fold-index-demoted-").tempdir()?;
	let mut test_ctx = test_ctx_with_cold_tier(cold_root.path()).await?;
	let database_id = "fold-index-demoted";
	let tier = Arc::new(FilesystemColdTier::new(cold_root.path()));
	let db = make_db_with_cold_tier(&test_ctx, database_id, tier)?;

	// Two folds: pin each commit so txid 1 and txid 2 both stay live folds with COMMITS rows that the
	// cold drain's versionstamp scan can read.
	db.commit(vec![dirty_page(1, 0x71)], 2, 1_001).await?;
	let restore_point_1 = db.create_restore_point(SnapshotSelector::Latest).await?;
	db.commit(vec![dirty_page(1, 0x72)], 2, 1_002).await?;
	let restore_point_2 = db.create_restore_point(SnapshotSelector::Latest).await?;
	let database_branch_id = read_database_branch_id(&test_ctx, database_id).await?;

	let driver = DepotCompactionTestDriver::new(&test_ctx);
	let manager_workflow_id = driver.start_manager(database_branch_id, None, true).await?;

	// Hot pass materializes SHARD rows and CMP/fold rows at both fold txids.
	let hot = driver
		.force_compaction(
			manager_workflow_id,
			database_branch_id,
			ForceCompactionWork {
				hot: true,
				cold: false,
				reclaim: false,
				final_settle: false,
			},
		)
		.await?;
	assert!(hot.terminal_error.is_none(), "hot pass must not error");

	// Simulate full demotion: delete every live SHARD row at both folds so the cold drain finds no
	// upload blobs at either boundary even though the fold index still records them.
	delete_shard_versions_at(&test_ctx, database_branch_id, &[1, 2]).await?;

	// Cold pass must advance the cold watermark past both demoted folds without uploading anything.
	let cold = driver
		.force_compaction(
			manager_workflow_id,
			database_branch_id,
			ForceCompactionWork {
				hot: false,
				cold: true,
				reclaim: false,
				final_settle: false,
			},
		)
		.await?;
	assert!(
		cold.terminal_error.is_none(),
		"cold pass must not stall on demoted folds"
	);
	assert!(
		cold.attempted_job_kinds.contains(&CompactionJobKind::Cold),
		"a cold job must run"
	);

	assert!(
		read_compaction_root_txid(&test_ctx, database_branch_id).await? >= 2,
		"cold watermark must advance past the fully demoted folds via the watermark-only advance"
	);

	// Nothing was uploaded, so the demoted folds must not have cold shard refs written for them.
	for as_of in [1u64, 2u64] {
		assert!(
			read_cold_shard_ref(&test_ctx, database_branch_id, 0, as_of)
				.await?
				.is_none(),
			"a fully demoted fold must not write a cold shard ref at txid {as_of}"
		);
	}

	db.delete_restore_point(restore_point_1).await?;
	db.delete_restore_point(restore_point_2).await?;
	test_ctx.shutdown().await?;
	Ok(())
}

/// Deletes every live `SHARD/{s}/{as_of}` row whose `as_of` is in `as_of_txids`, simulating the
/// eviction lane demoting those shard versions to cold-only.
async fn delete_shard_versions_at(
	test_ctx: &TestCtx,
	branch_id: DatabaseBranchId,
	as_of_txids: &[u64],
) -> Result<()> {
	let targets: std::collections::BTreeSet<u64> = as_of_txids.iter().copied().collect();
	let udb = test_ctx.pools().udb()?;
	udb.txn("test_depotfold_index_delete_shards", move |tx| {
		let targets = targets.clone();
		async move {
			use universaldb::options::StreamingMode;
			use universaldb::utils::IsolationLevel::Serializable;

			let informal = tx.informal();
			let shard_prefix = keys::branch_shard_prefix(branch_id);
			let shard_subspace = universaldb::Subspace::from(
				universaldb::tuple::Subspace::from_bytes(shard_prefix.clone()),
			);
			let mut shard_stream = informal.get_ranges_keyvalues(
				universaldb::RangeOption {
					mode: StreamingMode::WantAll,
					..universaldb::RangeOption::from(&shard_subspace)
				},
				Serializable,
			);
			let mut to_clear = Vec::new();
			while let Some(entry) = futures_util::TryStreamExt::try_next(&mut shard_stream).await? {
				let suffix = entry
					.key()
					.strip_prefix(shard_prefix.as_slice())
					.context("shard key prefix")?;
				// shard_id (u32 BE) + b'/' + as_of (u64 BE), then an optional chunk index (u32 BE): a
				// version is stored as ordered chunk rows, with the bare key holding only a
				// pre-chunking legacy row. Matching the bare length alone leaves every chunk row of a
				// version a real pass wrote, so the version stays live and nothing is demoted.
				if suffix.len() < 4 + 1 + 8 {
					continue;
				}
				let as_of = u64::from_be_bytes(suffix[5..5 + 8].try_into()?);
				if targets.contains(&as_of) {
					to_clear.push(entry.key().to_vec());
				}
			}
			for key in to_clear {
				informal.clear(&key);
			}
			Ok(())
		}
	})
	.await
}

async fn read_cold_shard_ref(
	test_ctx: &TestCtx,
	branch_id: DatabaseBranchId,
	shard_id: u32,
	as_of_txid: u64,
) -> Result<Option<depot::types::ColdShardRef>> {
	let udb = test_ctx.pools().udb()?;
	udb.txn("test_depotfold_index_cold_ref_read", move |tx| async move {
		let bytes = tx
			.informal()
			.get(
				&branch_compaction_cold_shard_key(branch_id, shard_id, as_of_txid),
				universaldb::utils::IsolationLevel::Serializable,
			)
			.await?
			.map(Vec::<u8>::from);
		match bytes {
			Some(bytes) => Ok(Some(decode_cold_shard_ref(&bytes)?)),
			None => Ok(None),
		}
	})
	.await
}

/// Shard ids that have at least one live version row, and the txids of those versions.
async fn live_shard_versions(
	test_ctx: &TestCtx,
	branch_id: DatabaseBranchId,
) -> Result<std::collections::BTreeMap<u32, std::collections::BTreeSet<u64>>> {
	let udb = test_ctx.pools().udb()?;
	udb.txn("test_depotfold_index_live_shards", move |tx| async move {
		use universaldb::options::StreamingMode;
		use universaldb::utils::IsolationLevel::Serializable;

		let informal = tx.informal();
		let shard_prefix = keys::branch_shard_prefix(branch_id);
		let shard_subspace = universaldb::Subspace::from(universaldb::tuple::Subspace::from_bytes(
			shard_prefix.clone(),
		));
		let mut shard_stream = informal.get_ranges_keyvalues(
			universaldb::RangeOption {
				mode: StreamingMode::WantAll,
				..universaldb::RangeOption::from(&shard_subspace)
			},
			Serializable,
		);
		let mut versions: std::collections::BTreeMap<u32, std::collections::BTreeSet<u64>> =
			std::collections::BTreeMap::new();
		while let Some(entry) = futures_util::TryStreamExt::try_next(&mut shard_stream).await? {
			let (shard_id, as_of, _) = keys::decode_branch_shard_row_key(branch_id, entry.key())?;
			versions.entry(shard_id).or_default().insert(as_of);
		}
		Ok(versions)
	})
	.await
}

/// Seed pages across four shards, fold them, then shrink the database down into shard 0. Returns the
/// live shard versions after the shrink.
async fn shard_versions_after_shrink(
	test_ctx: &mut TestCtx,
	database_id: &str,
	pin: bool,
) -> Result<std::collections::BTreeMap<u32, std::collections::BTreeSet<u64>>> {
	let db = make_db(test_ctx, database_id)?;
	// Pages in shards 0 through 3, so the shrink below leaves shards 1-3 entirely above the new EOF.
	let pages = vec![
		dirty_page(1, 0x11),
		dirty_page(SHARD_SIZE + 1, 0x22),
		dirty_page(2 * SHARD_SIZE + 1, 0x33),
		dirty_page(3 * SHARD_SIZE + 1, 0x44),
	];
	db.commit(pages, 4 * SHARD_SIZE, 1_000).await?;
	let database_branch_id = read_database_branch_id(test_ctx, database_id).await?;

	// Pin before folding, so the fold writes coverage at the pinned txid and the pin is what the
	// shrink below has to respect.
	let restore_point = if pin {
		Some(db.create_restore_point(SnapshotSelector::Latest).await?)
	} else {
		None
	};

	let driver = DepotCompactionTestDriver::new(test_ctx);
	let manager_workflow_id = driver.start_manager(database_branch_id, None, true).await?;
	let result = driver
		.force_compaction(
			manager_workflow_id,
			database_branch_id,
			ForceCompactionWork {
				hot: true,
				cold: false,
				reclaim: false,
				final_settle: false,
			},
		)
		.await?;
	assert!(result.terminal_error.is_none());

	let folded = live_shard_versions(test_ctx, database_branch_id).await?;
	assert!(
		folded.contains_key(&3),
		"the fold must produce a version for shard 3 for this test to mean anything"
	);

	// Shrink into shard 0. This is the commit that runs the truncate cleanup.
	db.commit(vec![dirty_page(1, 0x55)], 8, 2_000).await?;

	let after = live_shard_versions(test_ctx, database_branch_id).await?;
	if let Some(restore_point) = restore_point {
		db.delete_restore_point(restore_point).await?;
	}

	Ok(after)
}

/// A shrinking commit must not delete the shard versions a restore point still reads through.
/// Deleting them is what makes a fork or restore below the shrink resolve those pages to zeros.
#[tokio::test]
async fn truncate_keeps_shard_versions_a_restore_point_covers() -> Result<()> {
	let mut test_ctx = TestCtx::new(build_registry()).await?;
	let after = shard_versions_after_shrink(&mut test_ctx, "truncate-pinned", true).await?;

	for shard_id in [1_u32, 2, 3] {
		assert!(
			after.contains_key(&shard_id),
			"shard {shard_id} is above the new EOF but a restore point still covers its version, \
			 so the shrink must not delete it (live shards: {:?})",
			after.keys().collect::<Vec<_>>()
		);
	}

	test_ctx.shutdown().await?;
	Ok(())
}

/// With nothing pinning the pre-shrink history, the same versions must still be deleted. The
/// dead-shard sweep only retires a version when a later fold lists its shard again, and a shard above
/// the new EOF is never folded again, so anything left here would leak for the life of the branch.
#[tokio::test]
async fn truncate_deletes_shard_versions_nothing_covers() -> Result<()> {
	let mut test_ctx = TestCtx::new(build_registry()).await?;
	let after = shard_versions_after_shrink(&mut test_ctx, "truncate-unpinned", false).await?;

	for shard_id in [1_u32, 2, 3] {
		assert!(
			!after.contains_key(&shard_id),
			"shard {shard_id} is above the new EOF and nothing covers it, so the shrink must \
			 delete it (live shards: {:?})",
			after.keys().collect::<Vec<_>>()
		);
	}

	test_ctx.shutdown().await?;
	Ok(())
}

/// A read walks its fork ancestry, so the shard row it selects usually belongs to an ancestor and its
/// key carries that ancestor's prefix. Decoding it with the reading branch's own id never matches, so
/// the fold txid is lost. Provenance is where that loss is observable; the same decode also drives
/// the hot-versus-cold demotion drop, where losing it leaves a hot source the cold tier superseded.
#[tokio::test]
async fn a_forked_read_decodes_its_ancestors_shard_source_key() -> Result<()> {
	let mut test_ctx = TestCtx::new(build_registry()).await?;
	let database_id = "fold-ancestor-source-key";
	let db = make_db(&test_ctx, database_id)?;

	db.commit(
		vec![dirty_page(1, 0x11), dirty_page(SHARD_SIZE + 1, 0x22)],
		SHARD_SIZE + 2,
		1_000,
	)
	.await?;
	let database_branch_id = read_database_branch_id(&test_ctx, database_id).await?;

	// Fold, so the page resolves through a SHARD row rather than through its delta.
	let driver = DepotCompactionTestDriver::new(&test_ctx);
	let manager_workflow_id = driver.start_manager(database_branch_id, None, true).await?;
	let result = driver
		.force_compaction(
			manager_workflow_id,
			database_branch_id,
			ForceCompactionWork {
				hot: true,
				cold: false,
				reclaim: true,
				final_settle: true,
			},
		)
		.await?;
	assert!(result.terminal_error.is_none());

	// A commit above the fold, so the fork has a head commit row to resolve against. The reclaim pass
	// above deletes the folded commit's own row.
	db.commit(vec![dirty_page(2, 0x33)], SHARD_SIZE + 2, 2_000)
		.await?;

	// Fork at the head commit's versionstamp. Resolving `Latest` goes through restore point
	// resolution, which the reclaim pass above has already moved past.
	let udb = test_ctx.pools().udb()?;
	let head_versionstamp = udb
		.txn("test_depotfold_index_head_commit", move |tx| async move {
			let bytes = tx
				.informal()
				.get(
					&keys::branch_commit_key(database_branch_id, 2),
					universaldb::utils::IsolationLevel::Serializable,
				)
				.await?
				.map(Vec::<u8>::from)
				.context("head commit row should exist")?;
			Ok(decode_commit_row(&bytes)?.versionstamp)
		})
		.await?;
	let forked_database_id = branch::fork_database(
		&udb,
		BucketId::from_gas_id(test_bucket()),
		database_id.to_string(),
		depot::types::ResolvedVersionstamp {
			versionstamp: head_versionstamp,
			restore_point: None,
		},
		BucketId::from_gas_id(test_bucket()),
	)
	.await?;
	let forked_db = make_db(&test_ctx, forked_database_id)?;

	let read = forked_db
		.get_pages_with_options(
			vec![1],
			GetPagesOptions {
				collect_provenance: true,
				..Default::default()
			},
		)
		.await?;
	assert_eq!(read.pages[0].bytes, Some(vec![0x11; PAGE_SIZE as usize]));

	let hot_shard = read
		.provenance
		.iter()
		.flat_map(|entry| entry.candidates.iter())
		.find(|candidate| candidate.kind == PageSourceKind::HotShard)
		.context("the forked read should resolve page 1 through the ancestor's shard image")?;
	assert!(
		hot_shard.txid.is_some(),
		"the ancestor's shard source key must decode against the branch that owns it, so the fold \
		 txid survives (got {hot_shard:?})"
	);

	test_ctx.shutdown().await?;
	Ok(())
}

/// Both tiers can hold an image of the same shard, and the read must serve the newer one. Deciding
/// that needs the cold watermark of the branch the hot row came from, which on a fork is an ancestor
/// and not the branch being read: a fresh fork has no compaction root of its own, so reading its own
/// watermark reports 0 and no ancestor version ever looks superseded. The stale hot image then wins
/// and the read serves pages from before the newer fold.
#[tokio::test]
async fn a_forked_read_prefers_cold_over_an_ancestors_superseded_hot_image() -> Result<()> {
	let cold_root = Builder::new().prefix("fold-index-fork-cold-").tempdir()?;
	let mut test_ctx = test_ctx_with_cold_tier(cold_root.path()).await?;
	let database_id = "fold-index-fork-cold";
	let tier = Arc::new(FilesystemColdTier::new(cold_root.path()));
	let db = make_db_with_cold_tier(&test_ctx, database_id, tier.clone())?;

	db.commit(vec![dirty_page(1, 0x11)], 2, 1_000).await?;
	let database_branch_id = read_database_branch_id(&test_ctx, database_id).await?;
	// Pin txid 1 so the fold covers it too, leaving the shard with versions at both txids.
	let restore_point = db.create_restore_point(SnapshotSelector::Latest).await?;
	db.commit(vec![dirty_page(1, 0x22)], 2, 2_000).await?;

	let driver = DepotCompactionTestDriver::new(&test_ctx);
	let manager_workflow_id = driver.start_manager(database_branch_id, None, true).await?;
	let result = driver
		.force_compaction(
			manager_workflow_id,
			database_branch_id,
			ForceCompactionWork {
				hot: true,
				cold: false,
				reclaim: false,
				final_settle: false,
			},
		)
		.await?;
	assert!(result.terminal_error.is_none());

	// Keep the older version's rows: the cold pass below runs shard cache eviction, which demotes
	// every cold-backed version it finds, and this test needs the hot tier left holding the stale one.
	let stale_rows = read_shard_version_rows(&test_ctx, database_branch_id, 0, 1).await?;
	assert!(
		!stale_rows.is_empty(),
		"the pinned txid must be folded into its own shard version"
	);

	let result = driver
		.force_compaction(
			manager_workflow_id,
			database_branch_id,
			ForceCompactionWork {
				hot: false,
				cold: true,
				reclaim: false,
				final_settle: false,
			},
		)
		.await?;
	assert!(result.terminal_error.is_none());
	assert!(
		read_cold_shard_ref(&test_ctx, database_branch_id, 0, 2)
			.await?
			.is_some(),
		"the newer fold must reach the cold tier for this test to mean anything"
	);

	// The hot tier holds only the older image; the cold tier holds the newer one.
	delete_shard_versions_at(&test_ctx, database_branch_id, &[2]).await?;
	write_raw_rows(&test_ctx, stale_rows).await?;
	let live = live_shard_versions(&test_ctx, database_branch_id).await?;
	assert_eq!(
		live.get(&0).and_then(|txids| txids.iter().max().copied()),
		Some(1),
		"the hot tier must be left holding the stale image (live: {live:?})"
	);

	let udb = test_ctx.pools().udb()?;
	let head_versionstamp = udb
		.txn("test_depotfold_index_fork_head", move |tx| async move {
			let bytes = tx
				.informal()
				.get(
					&keys::branch_commit_key(database_branch_id, 2),
					universaldb::utils::IsolationLevel::Serializable,
				)
				.await?
				.map(Vec::<u8>::from)
				.context("head commit row should exist")?;
			Ok(decode_commit_row(&bytes)?.versionstamp)
		})
		.await?;
	let forked_database_id = branch::fork_database(
		&udb,
		BucketId::from_gas_id(test_bucket()),
		database_id.to_string(),
		depot::types::ResolvedVersionstamp {
			versionstamp: head_versionstamp,
			restore_point: None,
		},
		BucketId::from_gas_id(test_bucket()),
	)
	.await?;
	let forked_db = make_db_with_cold_tier(&test_ctx, forked_database_id, tier)?;

	assert_eq!(
		forked_db.get_pages(vec![1]).await?,
		vec![FetchedPage {
			pgno: 1,
			bytes: Some(vec![0x22; PAGE_SIZE as usize]),
		}],
		"the fork must read the newer cold image, not the ancestor's superseded hot one"
	);

	db.delete_restore_point(restore_point).await?;
	test_ctx.shutdown().await?;
	Ok(())
}

/// The raw rows of one shard version, so a test can put them back after a pass demotes them.
async fn read_shard_version_rows(
	test_ctx: &TestCtx,
	branch_id: DatabaseBranchId,
	shard_id: u32,
	as_of_txid: u64,
) -> Result<Vec<(Vec<u8>, Vec<u8>)>> {
	let udb = test_ctx.pools().udb()?;
	udb.txn("test_depotfold_index_read_version", move |tx| async move {
		use universaldb::options::StreamingMode;
		use universaldb::utils::IsolationLevel::Serializable;

		let prefix = keys::branch_shard_version_prefix(branch_id, shard_id);
		let subspace =
			universaldb::Subspace::from(universaldb::tuple::Subspace::from_bytes(prefix));
		let informal = tx.informal();
		let mut stream = informal.get_ranges_keyvalues(
			universaldb::RangeOption {
				mode: StreamingMode::WantAll,
				..universaldb::RangeOption::from(&subspace)
			},
			Serializable,
		);
		let mut rows = Vec::new();
		while let Some(entry) = futures_util::TryStreamExt::try_next(&mut stream).await? {
			let (_, row_txid, _) = keys::decode_branch_shard_row_key(branch_id, entry.key())?;
			if row_txid == as_of_txid {
				rows.push((entry.key().to_vec(), entry.value().to_vec()));
			}
		}
		Ok(rows)
	})
	.await
}

async fn write_raw_rows(test_ctx: &TestCtx, rows: Vec<(Vec<u8>, Vec<u8>)>) -> Result<()> {
	let udb = test_ctx.pools().udb()?;
	udb.txn("test_depotfold_index_write_rows", move |tx| {
		let rows = rows.clone();
		async move {
			let informal = tx.informal();
			for (key, value) in rows {
				informal.set(&key, &value);
			}
			Ok(())
		}
	})
	.await
}

/// Full eviction is a goal, so a shard's newest image can end up living only in S3. A later commit to
/// that shard still has to fold, and a shard version is a complete image rather than a diff, so the
/// fold must pull the demoted image back. Folding onto nothing would write a version holding only the
/// new commit's pages, and because that version is newer than the cold ref the read path would select
/// it and zero-fill everything else.
#[tokio::test]
async fn a_fold_pulls_back_a_merge_base_eviction_demoted() -> Result<()> {
	let cold_root = Builder::new().prefix("fold-index-cold-base-").tempdir()?;
	let mut test_ctx = test_ctx_with_cold_tier(cold_root.path()).await?;
	let database_id = "fold-index-cold-base";
	let tier = Arc::new(FilesystemColdTier::new(cold_root.path()));
	let db = make_db_with_cold_tier(&test_ctx, database_id, tier)?;

	// Two pages in shard 0. Only page 1 is rewritten later, so page 2 exists solely in the first
	// fold's image and has to survive through the merge base.
	db.commit(vec![dirty_page(1, 0x11), dirty_page(2, 0x22)], 4, 1_000)
		.await?;
	let database_branch_id = read_database_branch_id(&test_ctx, database_id).await?;

	let driver = DepotCompactionTestDriver::new(&test_ctx);
	let manager_workflow_id = driver.start_manager(database_branch_id, None, true).await?;
	let result = driver
		.force_compaction(
			manager_workflow_id,
			database_branch_id,
			ForceCompactionWork {
				hot: true,
				cold: true,
				reclaim: false,
				final_settle: false,
			},
		)
		.await?;
	assert!(result.terminal_error.is_none());
	assert!(
		read_cold_shard_ref(&test_ctx, database_branch_id, 0, 1)
			.await?
			.is_some(),
		"the first pass must upload shard 0 so there is a cold image to fold from"
	);

	// Demote: the cold copy is now the only copy, which is what full eviction produces.
	delete_shard_versions_at(&test_ctx, database_branch_id, &[1]).await?;

	let pulled_before = depot::metrics::SQLITE_HOT_FOLD_COLD_MERGE_BASE_BYTES.get();
	db.commit(vec![dirty_page(1, 0x33)], 4, 2_000).await?;
	let result = driver
		.force_compaction(
			manager_workflow_id,
			database_branch_id,
			ForceCompactionWork {
				hot: true,
				cold: false,
				reclaim: false,
				final_settle: false,
			},
		)
		.await?;
	assert!(
		result.terminal_error.is_none(),
		"the fold must not stall on a merge base that lives only in the cold tier: {:?}",
		result.terminal_error
	);
	assert!(
		depot::metrics::SQLITE_HOT_FOLD_COLD_MERGE_BASE_BYTES.get() > pulled_before,
		"the fold must have pulled the demoted image back from the cold tier"
	);

	// Page 2 was never rewritten, so it survives only if the fold carried the cold image forward.
	assert_eq!(
		db.get_pages(vec![1, 2]).await?,
		vec![
			FetchedPage {
				pgno: 1,
				bytes: Some(vec![0x33; PAGE_SIZE as usize]),
			},
			FetchedPage {
				pgno: 2,
				bytes: Some(vec![0x22; PAGE_SIZE as usize]),
			},
		]
	);

	test_ctx.shutdown().await?;
	Ok(())
}
