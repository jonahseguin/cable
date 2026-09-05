#![cfg(feature = "test-faults")]

//! Cross-slice hot fold completeness.
//!
//! A hot drain stages every slice before the manager installs any of them, so a later slice's fold
//! cannot see an earlier slice's staged shard version as its merge base. When a shard holds one hot
//! page that keeps being rewritten and many cold pages written only in an earlier slice, the later
//! fold materializes just the hot page. That sparse version becomes the shard's latest, and the read
//! path zero-fills every page missing from it once the folded PIDX rows are gone.

use std::sync::Arc;

use anyhow::{Context, Result};
use depot::{
	conveyer::{Db, branch},
	keys::PAGE_SIZE,
	types::{BucketId, DatabaseBranchId, DirtyPage},
	workflows::compaction::{
		DbColdCompactorWorkflow, DbHotCompactorWorkflow, DbManagerWorkflow, DbReclaimerWorkflow,
		DepotCompactionTestDriver, ForceCompactionWork,
	},
};
use gas::prelude::{Id, Registry, TestCtx};
use rivet_pools::NodeId;
use uuid::Uuid;

/// Pages 1..=63 all live in shard 0.
const SHARD0_PAGES: u32 = 63;
/// Pages written per commit. Large commits keep each slice's key budget mostly unspent, so the
/// install still has budget left to clear the folded PIDX rows.
const PAGES_PER_COMMIT: u32 = 24;
/// Enough commits to push one drain past a single slice budget.
const HOT_COMMITS: u32 = 90;
const DB_SIZE_PAGES: u32 = SHARD0_PAGES + HOT_COMMITS * PAGES_PER_COMMIT + 64;

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

/// Incompressible, content-addressed page bytes so blob sizes reflect real page counts and a page
/// read back can be attributed to the exact write that produced it.
fn page_bytes(pgno: u32, generation: u32) -> Vec<u8> {
	let mut state = (pgno as u64) << 32 | generation as u64 | 1;
	let mut bytes = vec![0u8; PAGE_SIZE as usize];
	for chunk in bytes.chunks_mut(8) {
		state = state
			.wrapping_mul(6364136223846793005)
			.wrapping_add(1442695040888963407);
		let mixed = state ^ (state >> 33);
		chunk.copy_from_slice(&mixed.to_le_bytes()[..chunk.len()]);
	}
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
	db.txn("test_depot_cross_slice_branch", move |tx| {
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

async fn scan_prefix(
	db: &universaldb::Database,
	prefix: Vec<u8>,
) -> Result<Vec<(Vec<u8>, Vec<u8>)>> {
	db.txn("test_depot_cross_slice_scan", move |tx| {
		let prefix = prefix.clone();
		async move {
			let prefix_subspace =
				universaldb::Subspace::from(universaldb::tuple::Subspace::from_bytes(prefix));
			let informal = tx.informal();
			let mut stream = informal.get_ranges_keyvalues(
				universaldb::RangeOption {
					mode: universaldb::options::StreamingMode::WantAll,
					..universaldb::RangeOption::from(&prefix_subspace)
				},
				universaldb::utils::IsolationLevel::Serializable,
			);
			let mut out = Vec::new();
			while let Some(entry) = futures_util::TryStreamExt::try_next(&mut stream).await? {
				out.push((entry.key().to_vec(), entry.value().to_vec()));
			}
			Ok(out)
		}
	})
	.await
}

/// Fills shard 0 up front so pages 1..=63 are only ever written in the drain's first slice, then
/// keeps rewriting page 2 (the b-tree root analogue) while the database grows, so shard 0 stays hot
/// and the accumulated backlog spans several slices of one drain.
async fn seed_hot_shard_backlog(db: &Db) -> Result<()> {
	for batch in (1..=SHARD0_PAGES).step_by(PAGES_PER_COMMIT as usize) {
		let pages = (batch..=(batch + PAGES_PER_COMMIT - 1).min(SHARD0_PAGES))
			.map(|pgno| dirty_page(pgno, 0))
			.collect::<Vec<_>>();
		db.commit(pages, DB_SIZE_PAGES, 1_000 + batch as i64)
			.await?;
	}

	for i in 0..HOT_COMMITS {
		let mut pages = vec![dirty_page(2, i + 1)];
		for offset in 0..(PAGES_PER_COMMIT - 1) {
			pages.push(dirty_page(
				SHARD0_PAGES + 1 + i * PAGES_PER_COMMIT + offset,
				0,
			));
		}
		db.commit(pages, DB_SIZE_PAGES, 2_000 + i as i64).await?;
	}

	Ok(())
}

/// A hot drain's staging area holds a full shard image per fold, which is far larger than one FDB
/// transaction can clear. The cleanup has to drain it across several bounded transactions, so after a
/// successful install and a reclaim pass no staged rows may remain.
#[tokio::test]
async fn staging_cleanup_drains_a_multi_slice_drain() -> Result<()> {
	let mut test_ctx = TestCtx::new(build_registry()).await?;
	let database_id = "staging-cleanup";
	let db = make_db(&test_ctx, database_id)?;
	seed_hot_shard_backlog(&db).await?;

	let branch_id = read_database_branch_id(&test_ctx, database_id).await?;
	// The seed is large enough that a forced pass exceeds the driver's 5s default wait when this
	// binary's tests run in parallel.
	let driver = DepotCompactionTestDriver::new(&test_ctx)
		.with_wait_timeout(std::time::Duration::from_secs(60));
	let manager_workflow_id = driver.start_manager(branch_id, None, true).await?;
	let result = driver
		.force_compaction(
			manager_workflow_id,
			branch_id,
			ForceCompactionWork {
				hot: true,
				cold: false,
				reclaim: true,
				final_settle: true,
			},
		)
		.await?;
	assert!(result.terminal_error.is_none(), "pass must not error");

	let udb = test_ctx.pools().udb()?;
	let staged_before =
		scan_prefix(&udb, depot::keys::branch_compaction_stage_prefix(branch_id)).await?;
	println!("staged rows right after install: {}", staged_before.len());

	// The cleanup is scheduled by the install and drains across several bounded transactions, so poll
	// for the staging area to empty rather than assuming one pass cleared it.
	let deadline = tokio::time::Instant::now() + std::time::Duration::from_secs(30);
	let mut remaining = staged_before.len();
	while tokio::time::Instant::now() < deadline {
		remaining = scan_prefix(&udb, depot::keys::branch_compaction_stage_prefix(branch_id))
			.await?
			.len();
		if remaining == 0 {
			break;
		}
		tokio::time::sleep(std::time::Duration::from_millis(250)).await;
	}
	assert_eq!(
		remaining, 0,
		"staging area still holds {remaining} rows after cleanup"
	);

	test_ctx.shutdown().await?;
	Ok(())
}

#[tokio::test]
async fn cross_slice_fold_keeps_cold_pages_of_a_hot_shard() -> Result<()> {
	let mut test_ctx = TestCtx::new(build_registry()).await?;
	let database_id = "cross-slice-fold";
	let db = make_db(&test_ctx, database_id)?;

	seed_hot_shard_backlog(&db).await?;

	let branch_id = read_database_branch_id(&test_ctx, database_id).await?;
	// The seed is large enough that a forced pass exceeds the driver's 5s default wait when this
	// binary's tests run in parallel.
	let driver = DepotCompactionTestDriver::new(&test_ctx)
		.with_wait_timeout(std::time::Duration::from_secs(60));
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
	assert!(result.terminal_error.is_none(), "hot pass must not error");

	// Observe the installed fold shape instead of assuming it.
	let udb = test_ctx.pools().udb()?;
	let shard_rows = scan_prefix(&udb, depot::keys::branch_shard_prefix(branch_id)).await?;
	let mut shard0_versions: std::collections::BTreeMap<u64, Vec<u8>> =
		std::collections::BTreeMap::new();
	for (key, value) in &shard_rows {
		let (shard_id, as_of_txid, _chunk) =
			depot::keys::decode_branch_shard_row_key(branch_id, key)?;
		if shard_id == 0 {
			shard0_versions
				.entry(as_of_txid)
				.or_default()
				.extend_from_slice(value);
		}
	}
	let mut fold_shapes = Vec::new();
	for (as_of_txid, blob) in &shard0_versions {
		let decoded = depot::ltx::decode_ltx_v3(blob)?;
		fold_shapes.push(format!(
			"as_of_txid={as_of_txid} pages={}",
			decoded.pages.len()
		));
	}
	assert!(
		shard0_versions.len() > 1,
		"the drain must span multiple slices for this to be a cross-slice case; folds: {fold_shapes:?}"
	);
	println!("shard 0 folds: {fold_shapes:?}");

	let pgnos = (1..=SHARD0_PAGES).collect::<Vec<_>>();
	let pages = db.get_pages(pgnos).await?;
	let mut corrupted = Vec::new();
	for page in &pages {
		let expected = if page.pgno == 2 {
			page_bytes(2, HOT_COMMITS)
		} else {
			page_bytes(page.pgno, 0)
		};
		match &page.bytes {
			Some(bytes) if *bytes == expected => {}
			Some(bytes) if bytes.iter().all(|byte| *byte == 0) => {
				corrupted.push(format!("page {} zero-filled", page.pgno))
			}
			Some(_) => corrupted.push(format!("page {} has unexpected contents", page.pgno)),
			None => corrupted.push(format!("page {} missing", page.pgno)),
		}
	}
	assert!(
		corrupted.is_empty(),
		"shard 0 lost pages after the hot fold (folds: {fold_shapes:?}): {corrupted:?}"
	);

	test_ctx.shutdown().await?;
	Ok(())
}
