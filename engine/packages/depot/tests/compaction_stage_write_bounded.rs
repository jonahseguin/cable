#![cfg(feature = "test-faults")]

//! Hot staging and hot install write-size bounds.
//!
//! Staging folds a complete shard image per `(coverage txid, touched shard)` pair, so its write volume
//! scales with how widely a slice's pages scatter across shards, not with the bytes the input read
//! budget admitted. One page dirtied in each of `N` dense shards rewrites `N * SHARD_SIZE * PAGE_SIZE`
//! bytes from a delta of `N` pages. Unbounded, that commits past FDB's 10 MB transaction limit and
//! fails the stage activity with `transaction_too_large` on every retry, which wedges the hot
//! compactor. The stage instead stops each write transaction at `CMP_STAGE_MAX_WRITE_BYTES` and
//! resumes from a `(as_of_txid, shard_id)` cursor.
//!
//! The install then copies every staged image into the live SHARD tier byte for byte, so one install
//! chunk writes exactly what staging wrote for it and is unbounded for the same reason. It stops each
//! transaction at `CMP_INSTALL_MAX_WRITE_BYTES` and resumes from a `(shard_id, as_of_txid)` cursor.
//! Both bounds are measured over the same fold, so both tests drive the same scenario.
//!
//! The probes are process-global, so tests here hold `MEASURE_LOCK` for their whole body.

use std::sync::{Arc, LazyLock};

use anyhow::{Context, Result};
use depot::{
	CMP_INSTALL_MAX_WRITE_BYTES, CMP_STAGE_MAX_WRITE_BYTES,
	conveyer::{Db, branch},
	keys::{PAGE_SIZE, SHARD_SIZE},
	types::{BucketId, DatabaseBranchId, DirtyPage},
	workflows::compaction::{
		CompactionJobKind, DbColdCompactorWorkflow, DbHotCompactorWorkflow, DbManagerWorkflow,
		DbReclaimerWorkflow, DepotCompactionTestDriver, ForceCompactionWork, test_hooks,
	},
};
use gas::prelude::{Id, Registry, TestCtx};
use rivet_pools::NodeId;
use uuid::Uuid;

use test_hooks::{install_write_probe, stage_write_probe, throttle_probe};

/// Dense shards to fill. Their folded images total `SHARD_COUNT * SHARD_SIZE * PAGE_SIZE` = 8 MiB,
/// comfortably over the 4 MiB per-transaction cap, so a correct stage must split the fold.
const SHARD_COUNT: u32 = 32;
/// Pages the seed writes, filling shards `0..SHARD_COUNT` completely. Page 0 does not exist, so the
/// first shard is one page short of dense, which is fine: the bound is what is under test.
const SEED_PAGES: u32 = SHARD_COUNT * SHARD_SIZE;
/// Pages per seed commit, kept under `MAX_COMMIT_DIRTY_PAGES` (320).
const SEED_COMMIT_PAGES: u32 = 256;

static MEASURE_LOCK: LazyLock<tokio::sync::Mutex<()>> =
	LazyLock::new(|| tokio::sync::Mutex::new(()));

fn test_bucket() -> Id {
	Id::v1(Uuid::from_u128(0x9ac1), 1)
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

/// LTX compresses each page frame, so pages must be incompressible for a shard image to cost what a
/// real database's would. A cheap deterministic PRNG keyed by `(pgno, generation)` gives pages that
/// are stable across a re-read assertion and do not compress away.
fn page_bytes(pgno: u32, generation: u32) -> Vec<u8> {
	let mut state = u64::from(pgno)
		.wrapping_mul(0x9E37_79B9_7F4A_7C15)
		.wrapping_add(u64::from(generation).wrapping_mul(0xD1B5_4A32_D192_ED03))
		| 1;
	let mut bytes = Vec::with_capacity(PAGE_SIZE as usize);
	while bytes.len() < PAGE_SIZE as usize {
		state ^= state << 13;
		state ^= state >> 7;
		state ^= state << 17;
		bytes.extend_from_slice(&state.to_le_bytes());
	}
	bytes.truncate(PAGE_SIZE as usize);
	bytes
}

fn dirty_page(pgno: u32, generation: u32) -> DirtyPage {
	DirtyPage {
		pgno,
		bytes: page_bytes(pgno, generation),
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
	db.txn("test_depot_stage_write_branch", move |tx| {
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

/// Fills shards `0..SHARD_COUNT` so their installed images are dense. Every later fold of one of these
/// shards rewrites a full `SHARD_SIZE * PAGE_SIZE` image regardless of how few of its pages changed.
async fn seed_dense_shards(db: &Db) -> Result<()> {
	let mut pgno = 1;
	while pgno <= SEED_PAGES {
		let last = (pgno + SEED_COMMIT_PAGES - 1).min(SEED_PAGES);
		let pages = (pgno..=last).map(|pgno| dirty_page(pgno, 0)).collect();
		db.commit(pages, SEED_PAGES, 1_000 + pgno as i64).await?;
		pgno = last + 1;
	}
	Ok(())
}

/// One page dirtied in each seeded shard: a small delta whose fold rewrites every one of those dense
/// shard images. This is the shape that blows a single stage transaction past FDB's limit.
async fn commit_one_page_per_shard(db: &Db) -> Result<()> {
	let pages = (0..SHARD_COUNT)
		.map(|shard_id| dirty_page(shard_id * SHARD_SIZE + 1, 1))
		.collect();
	db.commit(pages, SEED_PAGES, 2_000).await
}

/// Seeds the dense shards, installs them with a first hot pass, then commits one page per shard so the
/// next hot pass folds every dense image from a tiny delta. Returns the pieces a measuring test needs.
async fn set_up_scattered_fold(database_id: &str) -> Result<(TestCtx, Db, DatabaseBranchId, Id)> {
	let test_ctx = TestCtx::new(build_registry()).await?;
	let db = make_db(&test_ctx, database_id)?;

	// Install the dense shard images first, so the scattered commit below folds against them.
	seed_dense_shards(&db).await?;

	let branch_id = read_database_branch_id(&test_ctx, database_id).await?;
	let driver = DepotCompactionTestDriver::new(&test_ctx);
	let manager_workflow_id = driver.start_manager(branch_id, None, true).await?;
	driver
		.force_compaction(manager_workflow_id, branch_id, hot_only_work())
		.await?;

	commit_one_page_per_shard(&db).await?;

	Ok((test_ctx, db, branch_id, manager_workflow_id))
}

fn hot_only_work() -> ForceCompactionWork {
	ForceCompactionWork {
		hot: true,
		cold: false,
		reclaim: false,
		final_settle: false,
	}
}

/// Every page the scattered commit touched reads back with that commit applied, so a bound that splits
/// the fold across transactions did not drop or reorder any of it.
async fn assert_scattered_fold_readable(db: &Db) -> Result<()> {
	for shard_id in 0..SHARD_COUNT {
		let pgno = shard_id * SHARD_SIZE + 1;
		let pages = db.get_pages(vec![pgno]).await?;
		let page = pages
			.first()
			.with_context(|| format!("page {pgno} should be readable after compaction"))?;
		assert_eq!(
			page.bytes,
			Some(page_bytes(pgno, 1)),
			"page {pgno} should hold the post-compaction commit"
		);
	}
	Ok(())
}

#[tokio::test]
async fn stage_write_transactions_stay_under_the_write_cap() -> Result<()> {
	let _measure = MEASURE_LOCK.lock().await;

	let (mut test_ctx, db, branch_id, manager_workflow_id) =
		set_up_scattered_fold("stage-write-bounded").await?;
	let driver = DepotCompactionTestDriver::new(&test_ctx);

	stage_write_probe::reset();
	let result = driver
		.force_compaction(manager_workflow_id, branch_id, hot_only_work())
		.await?;

	let max_staged_bytes = stage_write_probe::max_staged_bytes();
	let writing_transactions = stage_write_probe::writing_transaction_count();

	assert!(result.terminal_error.is_none(), "hot pass must not error");
	assert!(
		result.attempted_job_kinds.contains(&CompactionJobKind::Hot),
		"a hot job must run"
	);
	// A transaction is allowed to overshoot by the one image it was mid-way through admitting, which is
	// what guarantees forward progress on a slice too wide to fit at all.
	let shard_image_slack = u64::from(SHARD_SIZE * PAGE_SIZE) * 2;
	assert!(
		max_staged_bytes <= CMP_STAGE_MAX_WRITE_BYTES + shard_image_slack,
		"a stage transaction staged {max_staged_bytes} bytes; the cap is \
		 {CMP_STAGE_MAX_WRITE_BYTES} plus at most one shard image, and an unbounded stage exceeds \
		 FDB's transaction limit",
	);
	// The fold is ~8 MiB against a 4 MiB cap, so it can only have been staged by several transactions.
	// Without the split this would be one oversized transaction.
	assert!(
		writing_transactions >= 2,
		"the fold of {SHARD_COUNT} dense shards was staged in {writing_transactions} transaction(s) \
		 (max {max_staged_bytes} bytes); it exceeds the {CMP_STAGE_MAX_WRITE_BYTES} byte cap and \
		 must split",
	);

	assert_scattered_fold_readable(&db).await?;

	test_ctx.shutdown().await?;
	Ok(())
}

#[tokio::test]
async fn install_transactions_stay_under_the_write_cap() -> Result<()> {
	let _measure = MEASURE_LOCK.lock().await;

	let (mut test_ctx, db, branch_id, manager_workflow_id) =
		set_up_scattered_fold("install-write-bounded").await?;
	let driver = DepotCompactionTestDriver::new(&test_ctx);

	install_write_probe::reset();
	let result = driver
		.force_compaction(manager_workflow_id, branch_id, hot_only_work())
		.await?;

	let max_copied_bytes = install_write_probe::max_copied_bytes();
	let copying_transactions = install_write_probe::copying_transaction_count();

	assert!(result.terminal_error.is_none(), "hot pass must not error");
	assert!(
		result.attempted_job_kinds.contains(&CompactionJobKind::Hot),
		"a hot job must run"
	);
	// A transaction is allowed to overshoot by the one image it was mid-way through admitting, which is
	// what guarantees forward progress on a chunk too wide to fit at all.
	let shard_image_slack = u64::from(SHARD_SIZE * PAGE_SIZE) * 2;
	assert!(
		max_copied_bytes <= CMP_INSTALL_MAX_WRITE_BYTES + shard_image_slack,
		"an install transaction copied {max_copied_bytes} bytes; the cap is \
		 {CMP_INSTALL_MAX_WRITE_BYTES} plus at most one shard image, and an unbounded install exceeds \
		 FDB's transaction limit",
	);
	// The staged fold is ~8 MiB against a 4 MiB cap, so copying it can only have taken several
	// transactions. Without the split this would be one oversized transaction.
	assert!(
		copying_transactions >= 2,
		"the fold of {SHARD_COUNT} dense shards was copied in {copying_transactions} transaction(s) \
		 (max {max_copied_bytes} bytes); it exceeds the {CMP_INSTALL_MAX_WRITE_BYTES} byte cap and \
		 must split",
	);

	// The install published the whole fold even though it landed across transactions.
	assert_scattered_fold_readable(&db).await?;

	test_ctx.shutdown().await?;
	Ok(())
}

/// Read-axis throttle windows summed around now. The stage write transaction takes its own wall clock,
/// so a test cannot pin which window its charge lands in; a short pass spans at most a couple.
/// Hot staging must charge the read axis for the merge bases it reads, not just the images it writes.
///
/// Staging a shard image is a merge, not a copy: every staged image reads the newest installed and
/// newest already-staged image for that shard. Charging only the write axis left that volume invisible
/// to the read budget that cold staging, cold publish and reclaim are all admitted against, and the
/// ratio does not shrink with the backlog. Dense shards make the merge-base reads dominate, so the
/// read charge must land in the same order as the staged bytes rather than covering only the planning
/// transaction.
#[tokio::test]
async fn stage_write_transactions_charge_their_merge_base_reads() -> Result<()> {
	let _measure = MEASURE_LOCK.lock().await;

	let (mut test_ctx, db, branch_id, manager_workflow_id) =
		set_up_scattered_fold("stage-write-read-charge").await?;
	let driver = DepotCompactionTestDriver::new(&test_ctx);
	stage_write_probe::reset();
	throttle_probe::reset();
	let result = driver
		.force_compaction(manager_workflow_id, branch_id, hot_only_work())
		.await?;

	assert!(result.terminal_error.is_none(), "hot pass must not error");
	let staged_bytes = stage_write_probe::total_staged_bytes();
	assert!(staged_bytes > 0, "the pass must have staged something");

	// Assert the charges themselves, not the window counter. The counter is cluster-wide and the
	// manager refresh ticks it too, so its delta stays comfortably above the write transactions'
	// contribution whether or not they charge anything, and an assertion against it does not gate.
	let write_reads = stage_write_probe::write_read_bytes();
	assert!(
		write_reads.iter().any(|bytes| *bytes > 0),
		"the stage write transactions must have read merge bases; the fixture folds against images \
		 an earlier pass installed, so all-zero here means the scenario stopped exercising merges",
	);

	let mut read_charges = throttle_probe::read_axis_charges();
	for read_bytes in write_reads.iter().filter(|bytes| **bytes > 0) {
		let found = read_charges
			.iter()
			.position(|charged| charged == read_bytes);
		let Some(found) = found else {
			panic!(
				"a stage write transaction read {read_bytes} bytes ({staged_bytes} bytes staged \
				 overall) but no matching read-axis charge was recorded, so its merge-base reads \
				 are invisible to the read budget: charges seen were {read_charges:?}"
			);
		};
		read_charges.remove(found);
	}

	assert_scattered_fold_readable(&db).await?;

	test_ctx.shutdown().await?;
	Ok(())
}
