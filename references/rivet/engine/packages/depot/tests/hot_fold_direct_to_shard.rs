#![cfg(feature = "test-faults")]

//! Direct-to-shard hot folds: the stage transaction writes each folded shard image straight into the
//! live `SHARD` tier and the install publishes it without copying the bytes a second time.
//!
//! The two properties worth pinning are that the image is published at all (a fold whose blob never
//! lands leaves its pages resolving to an older image once the install clears their PIDX rows), and
//! that the orphan-staging reclaim lane does not treat a *successful* job's images as scratch. That
//! lane runs on every finished job, so under direct folds the versions its refs name may be live data.

use std::collections::BTreeSet;
use std::sync::Arc;

use anyhow::{Context, Result};
use depot::{
	conveyer::{
		Db, branch,
		ltx::{LtxHeader, encode_ltx_v3},
	},
	fault::{DepotFaultController, DepotFaultPoint, HotCompactionFaultPoint},
	keys,
	types::{
		BucketId, CompactionRoot, DatabaseBranchId, DirtyPage, decode_compaction_root,
		decode_fold_index_entry, encode_compaction_root,
	},
	workflows::compaction::{
		DbColdCompactorWorkflow, DbHotCompactorWorkflow, DbManagerWorkflow, DbReclaimerWorkflow,
		DepotCompactionTestDriver, ForceCompactionWork, test_hooks,
	},
};
use gas::prelude::{Id, Registry, TestCtx};
use rivet_pools::NodeId;
use universaldb::{options::StreamingMode, utils::IsolationLevel::Serializable};
use uuid::Uuid;

const PAGE_SIZE: u32 = keys::PAGE_SIZE;

fn test_bucket() -> Id {
	Id::v1(Uuid::from_u128(0x9ad1), 1)
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
	db.txn("test_depot_direct_fold_branch", move |tx| {
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

async fn scan_prefix(test_ctx: &TestCtx, prefix: Vec<u8>) -> Result<Vec<(Vec<u8>, Vec<u8>)>> {
	let udb = test_ctx.pools().udb()?;
	udb.txn("test_depot_direct_fold_scan", move |tx| {
		let prefix = prefix.clone();
		async move {
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
				rows.push((entry.key().to_vec(), entry.value().to_vec()));
			}
			Ok(rows)
		}
	})
	.await
}

/// Every physical row of the branch's `SHARD` prefix, so a test can tell "the image is somewhere in
/// the live tier" from "the image only exists in a staging subspace".
async fn shard_rows(test_ctx: &TestCtx, branch_id: DatabaseBranchId) -> Result<usize> {
	Ok(scan_prefix(test_ctx, keys::branch_shard_prefix(branch_id))
		.await?
		.len())
}

/// Rows under `CMP/stage/`, split into blob rows and everything else. Under direct folds the blob
/// half must stay empty: that is the write pass this change removes.
async fn stage_row_split(
	test_ctx: &TestCtx,
	branch_id: DatabaseBranchId,
) -> Result<(usize, usize)> {
	let rows = scan_prefix(test_ctx, keys::branch_compaction_stage_prefix(branch_id)).await?;
	let blob_rows = rows
		.iter()
		.filter(|(key, _)| {
			key.windows(b"/hot_shard/".len())
				.any(|window| window == b"/hot_shard/")
		})
		.count();
	Ok((blob_rows, rows.len() - blob_rows))
}

async fn page_bytes(db: &Db, pgno: u32) -> Result<Vec<u8>> {
	let pages = db.get_pages(vec![pgno]).await?;
	let page = pages
		.into_iter()
		.find(|page| page.pgno == pgno)
		.with_context(|| format!("page {pgno} should be readable"))?;
	page.bytes
		.with_context(|| format!("page {pgno} should have bytes"))
}

/// A direct fold must land its image in `SHARD` and write no blob into the staging subspace, while
/// still publishing a readable page.
#[tokio::test]
async fn direct_fold_writes_the_image_once() -> Result<()> {
	let mut test_ctx = TestCtx::new(build_registry()).await?;
	let database_id = "direct-fold-once";
	let db = make_db(&test_ctx, database_id)?;

	db.commit(vec![dirty_page(1, 0x41)], 2, 1_000).await?;
	db.commit(vec![dirty_page(2, 0x42)], 2, 1_001).await?;
	let branch_id = read_database_branch_id(&test_ctx, database_id).await?;
	let _direct = test_hooks::override_direct_to_shard_for_test(branch_id, true);

	let driver = DepotCompactionTestDriver::new(&test_ctx);
	let manager_workflow_id = driver.start_manager(branch_id, None, true).await?;
	let result = driver
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
	assert!(
		result.terminal_error.is_none(),
		"hot compaction must not error: {:?}",
		result.terminal_error
	);

	assert!(
		shard_rows(&test_ctx, branch_id).await? > 0,
		"the fold must materialize an image in the live shard tier"
	);
	let (blob_rows, _meta_rows) = stage_row_split(&test_ctx, branch_id).await?;
	assert_eq!(
		blob_rows, 0,
		"a direct fold must not write shard blob bytes into the staging subspace"
	);

	assert_eq!(
		page_bytes(&db, 1).await?,
		vec![0x41; PAGE_SIZE as usize],
		"page 1 must read back through the published fold"
	);
	assert_eq!(
		page_bytes(&db, 2).await?,
		vec![0x42; PAGE_SIZE as usize],
		"page 2 must read back through the published fold"
	);

	test_ctx.shutdown().await?;
	Ok(())
}

/// The orphan-staging reclaim lane runs on every finished job, successful ones included. Under direct
/// folds a successful job's refs name live `SHARD` versions, so a lane that deleted on the ref alone
/// would drop published data. Reclaim must leave the images and the pages readable.
#[tokio::test]
async fn reclaim_keeps_a_successful_direct_job_published() -> Result<()> {
	let mut test_ctx = TestCtx::new(build_registry()).await?;
	let database_id = "direct-fold-reclaim";
	let db = make_db(&test_ctx, database_id)?;

	db.commit(vec![dirty_page(1, 0x51)], 2, 1_000).await?;
	db.commit(vec![dirty_page(2, 0x52)], 2, 1_001).await?;
	let branch_id = read_database_branch_id(&test_ctx, database_id).await?;
	let _direct = test_hooks::override_direct_to_shard_for_test(branch_id, true);

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
	let shard_rows_after_install = shard_rows(&test_ctx, branch_id).await?;
	assert!(
		shard_rows_after_install > 0,
		"the fold must publish before reclaim runs"
	);

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
	assert!(
		result.terminal_error.is_none(),
		"reclaim must not error: {:?}",
		result.terminal_error
	);

	assert_eq!(
		page_bytes(&db, 1).await?,
		vec![0x51; PAGE_SIZE as usize],
		"reclaim must not delete the published image page 1 resolves through"
	);
	assert_eq!(
		page_bytes(&db, 2).await?,
		vec![0x52; PAGE_SIZE as usize],
		"reclaim must not delete the published image page 2 resolves through"
	);

	let (blob_rows, meta_rows) = stage_row_split(&test_ctx, branch_id).await?;
	assert_eq!(blob_rows, 0, "no staged blobs should ever have existed");
	assert_eq!(
		meta_rows, 0,
		"reclaim must clear the finished job's staged ref rows"
	);
	assert_eq!(
		shard_rows(&test_ctx, branch_id).await?,
		shard_rows_after_install,
		"reclaim must not delete any shard rows it cannot prove are scratch"
	);

	test_ctx.shutdown().await?;
	Ok(())
}

/// A drain that spans a flag flip. The config doc promises this works, and the non-obvious part is
/// the merge-base handoff: a slice folding in one mode has to find the previous slice's image
/// wherever the other mode put it, or it merges onto a stale base and silently drops that slice's
/// pages.
#[tokio::test]
async fn a_drain_spanning_a_flag_flip_stays_readable() -> Result<()> {
	let mut test_ctx = TestCtx::new(build_registry()).await?;
	let database_id = "direct-fold-flip";
	let db = make_db(&test_ctx, database_id)?;

	// Two pages in the same shard, so the second fold must merge onto the first fold's image rather
	// than replace it. A stale merge base shows up as page 1 reverting or zero-filling.
	db.commit(vec![dirty_page(1, 0x91)], 3, 1_000).await?;
	let branch_id = read_database_branch_id(&test_ctx, database_id).await?;
	let driver = DepotCompactionTestDriver::new(&test_ctx);
	let manager_workflow_id = driver.start_manager(branch_id, None, true).await?;

	{
		let _staged = test_hooks::override_direct_to_shard_for_test(branch_id, false);
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
	}

	// Flip to direct folds and compact a second commit touching a different page of the same shard.
	db.commit(vec![dirty_page(2, 0x92)], 3, 1_001).await?;
	{
		let _direct = test_hooks::override_direct_to_shard_for_test(branch_id, true);
		let result = driver
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
		assert!(
			result.terminal_error.is_none(),
			"the post-flip drain must not error: {:?}",
			result.terminal_error
		);
	}

	assert_eq!(
		page_bytes(&db, 1).await?,
		vec![0x91; PAGE_SIZE as usize],
		"the page folded before the flip must survive the direct fold's merge base"
	);
	assert_eq!(
		page_bytes(&db, 2).await?,
		vec![0x92; PAGE_SIZE as usize],
		"the page folded after the flip must be readable"
	);

	test_ctx.shutdown().await?;
	Ok(())
}

/// An abandoned direct fold: its image is live in `SHARD`, no install ever published it, and reads
/// must still be correct.
///
/// This is the scenario the safety argument rests on. The image is selectable the moment it is
/// written, because the read path caps version selection at the head rather than at the hot
/// watermark, so "unpublished" does not mean "unreachable". What keeps reads right is that the image
/// is a complete image of its shard and that deltas above the watermark are still replayed over it.
#[tokio::test]
async fn an_unpublished_direct_fold_is_readable_and_correct() -> Result<()> {
	let mut test_ctx = TestCtx::new(build_registry()).await?;
	let database_id = "direct-fold-unpublished";
	let db = make_db(&test_ctx, database_id)?;

	// Fold both pages into the shard tier so neither keeps a PIDX row.
	db.commit(vec![dirty_page(1, 0xa1), dirty_page(2, 0xa2)], 3, 1_000)
		.await?;
	let branch_id = read_database_branch_id(&test_ctx, database_id).await?;
	let _direct = test_hooks::override_direct_to_shard_for_test(branch_id, true);
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

	// Rewrite page 2. Its PIDX row now points at this delta; page 1 still resolves through the shard
	// tier.
	db.commit(vec![dirty_page(2, 0xb2)], 3, 1_001).await?;

	// Stand in for a drain abandoned after staging: a complete image of the shard at the new txid,
	// written straight into `SHARD` with no install behind it. A partial image would be a different
	// bug, so this is complete.
	//
	// Page 2 carries a poison value the delta does not, so the assertion below discriminates. A real
	// fold would have written the delta's value here and the two sources would agree, which would
	// make the test pass whether or not the delta actually won.
	let unpublished = encode_ltx_v3(
		LtxHeader::delta(2, 2, 0),
		&[dirty_page(1, 0xa1), dirty_page(2, 0xee)],
	)?;
	let udb = test_ctx.pools().udb()?;
	udb.txn("test_depot_unpublished_direct_fold", {
		let unpublished = unpublished.clone();
		move |tx| {
			let unpublished = unpublished.clone();
			async move {
				tx.informal().set(
					&keys::branch_shard_chunk_key(branch_id, 0, 2, 0),
					&unpublished,
				);
				Ok(())
			}
		}
	})
	.await?;

	assert_eq!(
		page_bytes(&db, 1).await?,
		vec![0xa1; PAGE_SIZE as usize],
		"a page with no PIDX row must read correctly through the unpublished image"
	);
	assert_eq!(
		page_bytes(&db, 2).await?,
		vec![0xb2; PAGE_SIZE as usize],
		"a page whose delta sits above the watermark must still win over the unpublished image \
		 (0xee would mean the image was served instead)"
	);

	test_ctx.shutdown().await?;
	Ok(())
}

/// Shard versions in the live tier that no `CMP/fold` entry claims: an image no install ever
/// published, which nothing reclaims.
async fn unpublished_shard_versions(
	test_ctx: &TestCtx,
	branch_id: DatabaseBranchId,
) -> Result<Vec<(u32, u64)>> {
	let shard_rows = scan_prefix(test_ctx, keys::branch_shard_prefix(branch_id)).await?;
	let fold_rows = scan_prefix(test_ctx, keys::branch_compaction_fold_prefix(branch_id)).await?;

	let mut folded = BTreeSet::new();
	for (key, value) in &fold_rows {
		let fold_txid = keys::decode_branch_compaction_fold_txid(branch_id, key)?;
		for shard_id in decode_fold_index_entry(value)?.shard_ids {
			folded.insert((shard_id, fold_txid));
		}
	}

	let mut unpublished = BTreeSet::new();
	for (key, _) in &shard_rows {
		let (shard_id, as_of_txid, _) = keys::decode_branch_shard_row_key(branch_id, key)?;
		if !folded.contains(&(shard_id, as_of_txid)) {
			unpublished.insert((shard_id, as_of_txid));
		}
	}
	Ok(unpublished.into_iter().collect())
}

/// A drain abandoned after staging strands its images, and a forced successor does not reclaim them.
///
/// This is the documented exception to reproducibility. The first drain stages directly into `SHARD`
/// and is then abandoned by bumping the manifest generation out from under its install, which is how
/// a real job dies when another install lands first. The head then moves and a second drain runs
/// forced, so it takes the live head rather than a grid point and folds a different boundary.
///
/// The assertion is on versions no `CMP/fold` entry claims, because that is exactly what no
/// reclaimer can see: `read_dead_shard_versions_chunk` seeds `prev` only from fold entries.
#[tokio::test]
async fn an_abandoned_drain_strands_images_a_forced_successor_does_not_reclaim() -> Result<()> {
	let mut test_ctx = TestCtx::new(build_registry()).await?;
	let database_id = "direct-fold-abandon";
	let db = make_db(&test_ctx, database_id)?;

	db.commit(vec![dirty_page(1, 0xc1)], 3, 1_000).await?;
	db.commit(vec![dirty_page(2, 0xc2)], 3, 1_001).await?;
	let branch_id = read_database_branch_id(&test_ctx, database_id).await?;
	let _direct = test_hooks::override_direct_to_shard_for_test(branch_id, true);

	// Hold the first drain between staging and its finish signal: its images are in `SHARD`, no
	// install has run.
	let controller = DepotFaultController::new();
	let pause = controller.pause_handle("staged");
	controller
		.at(DepotFaultPoint::HotCompaction(
			HotCompactionFaultPoint::AfterStageBeforeFinishSignal,
		))
		.database_branch_id(branch_id)
		.once()
		.pause("staged")?;
	let fault_guard = test_hooks::register_workflow_fault_controller(branch_id, controller.clone());

	let driver = DepotCompactionTestDriver::new(&test_ctx);
	let manager_workflow_id = driver.start_manager(branch_id, None, true).await?;

	// Drive the drain and the control sequence on one task: the test driver is not `Send`, so the
	// pause cannot be released from a spawned thread.
	let drain = driver.force_compaction(
		manager_workflow_id,
		branch_id,
		ForceCompactionWork {
			hot: true,
			cold: false,
			reclaim: false,
			final_settle: false,
		},
	);
	let staged_versions_cell = std::cell::RefCell::new(Vec::new());
	let control = async {
		pause.wait_reached().await;
		let staged = unpublished_shard_versions(&test_ctx, branch_id)
			.await
			.expect("staged versions should be readable");
		*staged_versions_cell.borrow_mut() = staged;

		// Abandon it the way a real job dies: the manifest generation moves, so its install rejects.
		let udb = test_ctx.pools().udb().expect("udb pool");
		udb.txn("test_depot_abandon_bump_generation", move |tx| async move {
			// The root row only exists once an install has finalized, and this branch has never
			// gotten that far, so a first drain plans against the default generation of 0.
			let mut root = match tx
				.informal()
				.get(&keys::branch_compaction_root_key(branch_id), Serializable)
				.await?
			{
				Some(bytes) => decode_compaction_root(&bytes)?,
				None => CompactionRoot {
					schema_version: 1,
					manifest_generation: 0,
					hot_watermark_txid: 0,
					cold_watermark_txid: 0,
					cold_watermark_versionstamp: [0; 16],
				},
			};
			root.manifest_generation = root.manifest_generation.saturating_add(1);
			tx.informal().set(
				&keys::branch_compaction_root_key(branch_id),
				&encode_compaction_root(root)?,
			);
			Ok(())
		})
		.await
		.expect("generation bump should commit");

		// Move the head before releasing. Without this the manager re-plans against an unmoved head,
		// folds the same boundary, and overwrites the abandoned images -- which is the adoption path
		// working, not a leak.
		db.commit(vec![dirty_page(1, 0xd1)], 3, 1_002)
			.await
			.expect("a commit during the pause should succeed");
		pause.release();
	};
	let (_drain_result, ()) = tokio::join!(drain, control);
	drop(fault_guard);

	let staged_versions = staged_versions_cell.into_inner();
	assert!(
		!staged_versions.is_empty(),
		"the paused drain should have staged images straight into the shard tier"
	);

	// Drain again. Forced, so it takes the live head rather than a grid point.
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

	let stranded = unpublished_shard_versions(&test_ctx, branch_id).await?;
	assert_eq!(
		stranded, staged_versions,
		"the abandoned drain's images must still be there, claimed by no fold entry, which is what \
		 makes them invisible to the dead-shard sweep"
	);

	// Reads stay correct regardless of what leaked.
	assert_eq!(
		page_bytes(&db, 1).await?,
		vec![0xd1; PAGE_SIZE as usize],
		"page 1 must read its newest value despite the abandoned drain's images"
	);
	assert_eq!(
		page_bytes(&db, 2).await?,
		vec![0xc2; PAGE_SIZE as usize],
		"page 2 must still be readable"
	);

	test_ctx.shutdown().await?;
	Ok(())
}
