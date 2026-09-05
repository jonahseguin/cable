#![cfg(feature = "test-faults")]

//! Version-retention sweep (C4): the reclaimer deletes dead `SHARD` versions (superseded with no live
//! coverage txid in the span) and keeps the `CMP/fold` index accurate, crediting the freed bytes back
//! to quota. Coverage is the txid set (pins + unexpired PITR reps + head), not fold-index membership.

use std::sync::Arc;

use anyhow::{Context, Result};
use depot::{
	conveyer::{Db, branch},
	keys,
	types::{BucketId, DatabaseBranchId, DirtyPage, SnapshotSelector},
	workflows::compaction::{
		DbColdCompactorWorkflow, DbHotCompactorWorkflow, DbManagerWorkflow, DbReclaimerWorkflow,
		DepotCompactionTestDriver, ForceCompactionWork,
	},
};
use gas::prelude::{Id, Registry, TestCtx};
use rivet_pools::NodeId;
use universaldb::{options::StreamingMode, utils::IsolationLevel::Serializable};
use uuid::Uuid;

const PAGE_SIZE: u32 = keys::PAGE_SIZE;
const SHARD_SIZE: u32 = keys::SHARD_SIZE;

fn test_bucket() -> Id {
	Id::v1(Uuid::from_u128(0x9abe), 1)
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

async fn read_database_branch_id(
	test_ctx: &TestCtx,
	database_id: &str,
) -> Result<DatabaseBranchId> {
	let db = test_ctx.pools().udb()?;
	let database_id = database_id.to_string();
	db.txn("test_depotdead_shard_branch", move |tx| {
		let database_id = database_id.clone();
		async move {
			branch::resolve_database_branch(
				&tx,
				BucketId::from_gas_id(test_bucket()),
				&database_id,
				Serializable,
			)
			.await?
			.context("database branch should exist")
		}
	})
	.await
}

async fn read_key(test_ctx: &TestCtx, key: Vec<u8>) -> Result<Option<Vec<u8>>> {
	let udb = test_ctx.pools().udb()?;
	udb.txn("test_depotdead_shard_read_key", move |tx| {
		let key = key.clone();
		async move {
			Ok(tx
				.informal()
				.get(&key, Serializable)
				.await?
				.map(Vec::<u8>::from))
		}
	})
	.await
}

/// Reads every physical row of one shard version (a legacy single value or chunk rows).
async fn shard_version_rows(
	test_ctx: &TestCtx,
	branch_id: DatabaseBranchId,
	shard_id: u32,
	as_of_txid: u64,
) -> Result<Vec<(Vec<u8>, Vec<u8>)>> {
	let udb = test_ctx.pools().udb()?;
	udb.txn("test_depotdead_shard_version_rows", move |tx| async move {
		let (begin, end) = keys::branch_shard_version_range(branch_id, shard_id, as_of_txid);
		let informal = tx.informal();
		let mut stream = informal.get_ranges_keyvalues(
			universaldb::RangeOption {
				mode: StreamingMode::WantAll,
				..(begin.as_slice(), end.as_slice()).into()
			},
			Serializable,
		);
		let mut rows = Vec::new();
		while let Some(entry) = futures_util::TryStreamExt::try_next(&mut stream).await? {
			rows.push((entry.key().to_vec(), entry.value().to_vec()));
		}
		Ok(rows)
	})
	.await
}

async fn shard_version_present(
	test_ctx: &TestCtx,
	branch_id: DatabaseBranchId,
	shard_id: u32,
	as_of_txid: u64,
) -> Result<bool> {
	Ok(
		!shard_version_rows(test_ctx, branch_id, shard_id, as_of_txid)
			.await?
			.is_empty(),
	)
}

async fn fold_present(
	test_ctx: &TestCtx,
	branch_id: DatabaseBranchId,
	as_of_txid: u64,
) -> Result<bool> {
	Ok(read_key(
		test_ctx,
		keys::branch_compaction_fold_key(branch_id, as_of_txid),
	)
	.await?
	.is_some())
}

async fn read_branch_quota(test_ctx: &TestCtx, branch_id: DatabaseBranchId) -> Result<i64> {
	Ok(read_key(test_ctx, keys::branch_meta_quota_key(branch_id))
		.await?
		.map(|bytes| {
			let arr: [u8; 8] = bytes.as_slice().try_into().unwrap_or([0; 8]);
			i64::from_le_bytes(arr)
		})
		.unwrap_or(0))
}

async fn retired_cold_object_count(
	test_ctx: &TestCtx,
	branch_id: DatabaseBranchId,
) -> Result<usize> {
	let udb = test_ctx.pools().udb()?;
	udb.txn("test_depotdead_shard_retired", move |tx| async move {
		let prefix = keys::branch_compaction_retired_cold_object_prefix(branch_id);
		let subspace =
			universaldb::Subspace::from(universaldb::tuple::Subspace::from_bytes(prefix.clone()));
		let informal = tx.informal();
		let mut stream = informal.get_ranges_keyvalues(
			universaldb::RangeOption {
				mode: StreamingMode::WantAll,
				..universaldb::RangeOption::from(&subspace)
			},
			Serializable,
		);
		let mut count = 0usize;
		while (futures_util::TryStreamExt::try_next(&mut stream).await?).is_some() {
			count += 1;
		}
		Ok(count)
	})
	.await
}

/// Cold-off primary path: a `SHARD/{0}/1` superseded by `SHARD/{0}/2` with no coverage txid in `[1, 2)`
/// is deleted, its `CMP/fold/1` membership cleared (the fold becomes empty so the row is removed), the
/// freed bytes are credited back to quota exactly once, the newest version survives, and no cold retire
/// record is left behind (cold is disabled, so C4 must use a plain clear with no retire enqueue).
#[tokio::test]
async fn dead_shard_version_deleted_cold_off() -> Result<()> {
	let mut test_ctx = TestCtx::new(build_registry()).await?;
	let database_id = "dead-shard-off";
	let db = make_db(&test_ctx, database_id)?;

	// Two versions of shard 0 (page 1) at txid 1 and txid 2; pin each so both become folds the hot pass
	// materializes.
	db.commit(vec![dirty_page(1, 0x11)], 2, 1_000).await?;
	let restore_point_1 = db.create_restore_point(SnapshotSelector::Latest).await?;
	db.commit(vec![dirty_page(1, 0x12)], 2, 1_001).await?;
	let restore_point_2 = db.create_restore_point(SnapshotSelector::Latest).await?;
	let branch_id = read_database_branch_id(&test_ctx, database_id).await?;

	let driver = DepotCompactionTestDriver::new(&test_ctx);
	let manager_workflow_id = driver.start_manager(branch_id, None, true).await?;
	driver
		.force_compaction(
			manager_workflow_id,
			branch_id,
			ForceCompactionWork {
				hot: true,
				cold: false,
				reclaim: false,
				final_settle: false,
			},
		)
		.await?;

	assert!(shard_version_present(&test_ctx, branch_id, 0, 1).await?);
	assert!(shard_version_present(&test_ctx, branch_id, 0, 2).await?);
	assert!(fold_present(&test_ctx, branch_id, 1).await?);

	// Drop the pin on txid 1 so it is no longer a fold; `SHARD/{0}/1` now sits at a non-fold txid with
	// no coverage in `[1, 2)` and becomes dead.
	db.delete_restore_point(restore_point_1).await?;

	let dead_rows = shard_version_rows(&test_ctx, branch_id, 0, 1).await?;
	assert!(
		!dead_rows.is_empty(),
		"dead shard version should still exist before reclaim"
	);
	let dead_version_bytes: usize = dead_rows
		.iter()
		.map(|(key, value)| key.len() + value.len())
		.sum();
	// The folded deltas (txid 1 and txid 2) are now reclaimed by C6 in the same pass and also credit
	// their freed bytes, so the expected quota delta is the dead shard version's rows plus both delta
	// chunks.
	let delta_1_key = keys::branch_delta_chunk_key(branch_id, 1, 0);
	let delta_1 = read_key(&test_ctx, delta_1_key.clone())
		.await?
		.context("delta 1 should exist before reclaim")?;
	let delta_2_key = keys::branch_delta_chunk_key(branch_id, 2, 0);
	let delta_2 = read_key(&test_ctx, delta_2_key.clone())
		.await?
		.context("delta 2 should exist before reclaim")?;
	let expected_credit = (dead_version_bytes
		+ delta_1_key.len()
		+ delta_1.len()
		+ delta_2_key.len()
		+ delta_2.len()) as i64;
	let quota_before = read_branch_quota(&test_ctx, branch_id).await?;

	let result = driver
		.force_compaction(
			manager_workflow_id,
			branch_id,
			ForceCompactionWork {
				hot: false,
				cold: false,
				reclaim: true,
				final_settle: false,
			},
		)
		.await?;
	assert!(result.terminal_error.is_none(), "reclaim must not error");

	assert!(
		!shard_version_present(&test_ctx, branch_id, 0, 1).await?,
		"the dead shard version must be deleted"
	);
	assert!(
		!fold_present(&test_ctx, branch_id, 1).await?,
		"the emptied fold row must be cleared"
	);
	assert!(
		shard_version_present(&test_ctx, branch_id, 0, 2).await?,
		"the newest shard version must survive"
	);
	assert!(
		read_key(&test_ctx, delta_1_key).await?.is_none(),
		"the folded delta at txid 1 must be reclaimed"
	);
	assert!(
		read_key(&test_ctx, delta_2_key).await?.is_none(),
		"the folded delta at txid 2 must be reclaimed"
	);

	let quota_after = read_branch_quota(&test_ctx, branch_id).await?;
	assert_eq!(
		quota_after,
		quota_before - expected_credit,
		"reclaim must credit the dead shard version and both folded deltas back to quota exactly once"
	);
	assert_eq!(
		retired_cold_object_count(&test_ctx, branch_id).await?,
		0,
		"cold-off C4 must not enqueue a retire record"
	);

	db.delete_restore_point(restore_point_2).await?;
	test_ctx.shutdown().await?;
	Ok(())
}

/// Coverage is the txid SET, not fold-index membership (#4). Shard 0 changes at txid 1 and txid 3 but
/// not at txid 2; an unrelated commit at txid 2 (changing shard 1) is pinned. Because the two commits
/// are folded across two separate hot passes, `CMP/fold/2` does not list shard 0, yet a read as of txid
/// 2 of page 1 resolves to `SHARD/{0}/1`. So the pin at txid 2 keeps `SHARD/{0}/1` alive even though it
/// has no fold row there, and C4 must not delete it.
#[tokio::test]
async fn coverage_txid_outside_fold_keeps_version() -> Result<()> {
	let mut test_ctx = TestCtx::new(build_registry()).await?;
	let database_id = "dead-shard-coverage";
	let db = make_db(&test_ctx, database_id)?;

	// Pass 1: fold shard 0 at txid 1 so its delta is folded away before the second pass.
	db.commit(vec![dirty_page(1, 0x21)], SHARD_SIZE + 2, 1_000)
		.await?;
	let restore_point_1 = db.create_restore_point(SnapshotSelector::Latest).await?;
	let branch_id = read_database_branch_id(&test_ctx, database_id).await?;

	let driver = DepotCompactionTestDriver::new(&test_ctx);
	let manager_workflow_id = driver.start_manager(branch_id, None, true).await?;
	driver
		.force_compaction(
			manager_workflow_id,
			branch_id,
			ForceCompactionWork {
				hot: true,
				cold: false,
				reclaim: false,
				final_settle: false,
			},
		)
		.await?;
	assert!(shard_version_present(&test_ctx, branch_id, 0, 1).await?);

	// An unrelated commit at txid 2 (shard 1) pinned as the coverage point, then shard 0 changes again
	// at txid 3.
	db.commit(
		vec![dirty_page(SHARD_SIZE + 1, 0x22)],
		SHARD_SIZE + 2,
		1_001,
	)
	.await?;
	let restore_point_2 = db.create_restore_point(SnapshotSelector::Latest).await?;
	db.commit(vec![dirty_page(1, 0x23)], SHARD_SIZE + 2, 1_002)
		.await?;
	let restore_point_3 = db.create_restore_point(SnapshotSelector::Latest).await?;
	// Drop the txid-1 pin so the only thing that can keep `SHARD/{0}/1` alive is the txid-2 coverage
	// point landing in `[1, 3)`.
	db.delete_restore_point(restore_point_1).await?;

	// Pass 2 folds txid 2 (shard 1 only) and txid 3 (shard 0). `CMP/fold/2` must not list shard 0.
	driver
		.force_compaction(
			manager_workflow_id,
			branch_id,
			ForceCompactionWork {
				hot: true,
				cold: false,
				reclaim: true,
				final_settle: false,
			},
		)
		.await?;

	assert!(
		shard_version_present(&test_ctx, branch_id, 0, 3).await?,
		"the newest shard-0 version must survive"
	);
	assert!(
		shard_version_present(&test_ctx, branch_id, 0, 1).await?,
		"the txid-2 coverage point keeps SHARD/0/1 alive even though it has no fold row at txid 2"
	);

	db.delete_restore_point(restore_point_2).await?;
	db.delete_restore_point(restore_point_3).await?;
	test_ctx.shutdown().await?;
	Ok(())
}
