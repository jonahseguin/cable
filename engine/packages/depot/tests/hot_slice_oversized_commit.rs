#![cfg(feature = "test-faults")]

//! A commit larger than one hot slice budget must not be skipped.
//!
//! Slice planning admits whole commits against a fixed key and byte budget. When the very first
//! commit in the window does not fit, nothing is selected. That used to read as "window drained",
//! so the install advanced the hot watermark past a commit that was never folded. The commit's pages
//! stayed PIDX-owned, so reads were still correct, but the stale-PIDX sweep later clears any of those
//! rows whose page an older shard image happens to carry, which serves the older page.

use std::sync::Arc;

use anyhow::{Context, Result};
use depot::{
	conveyer::{Db, branch},
	keys::{self, PAGE_SIZE},
	types::{BucketId, CommitOptions, DatabaseBranchId, DirtyPage, decode_compaction_root},
	workflows::compaction::{
		DbColdCompactorWorkflow, DbHotCompactorWorkflow, DbManagerWorkflow, DbReclaimerWorkflow,
		DepotCompactionTestDriver, ForceCompactionWork,
	},
};
use gas::prelude::{Id, Registry, TestCtx};
use rivet_pools::NodeId;
use uuid::Uuid;

/// Incompressible pages at this count exceed both the slice key budget (one commit row plus its
/// delta chunks plus one reserved PIDX row per page) and its byte budget.
const OVERSIZED_COMMIT_PAGES: u32 = 700;

fn test_bucket() -> Id {
	Id::v1(Uuid::from_u128(0x9ac2), 1)
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

/// Commits admitted ahead of the oversized one. Small so they all fit the first slice.
const SMALL_COMMITS: u32 = 20;
const OVERSIZED_GENERATION: u32 = 0xFFFF;

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

fn make_db(test_ctx: &TestCtx, database_id: &str) -> Result<Db> {
	let udb_pool = test_ctx.pools().udb()?;
	Ok(Db::new(
		Arc::new((*udb_pool).clone()),
		test_bucket(),
		database_id.to_string(),
		NodeId::new(),
	))
}

async fn read_database_branch_id(
	test_ctx: &TestCtx,
	database_id: &str,
) -> Result<DatabaseBranchId> {
	let db = test_ctx.pools().udb()?;
	let database_id = database_id.to_string();
	db.txn("test_depot_oversized_branch", move |tx| {
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

async fn read_hot_watermark(test_ctx: &TestCtx, branch_id: DatabaseBranchId) -> Result<u64> {
	let udb = test_ctx.pools().udb()?;
	udb.txn("test_depot_oversized_root", move |tx| async move {
		let bytes = tx
			.informal()
			.get(
				&keys::branch_compaction_root_key(branch_id),
				universaldb::utils::IsolationLevel::Serializable,
			)
			.await?
			.map(Vec::<u8>::from);
		Ok(match bytes {
			Some(bytes) => decode_compaction_root(&bytes)?.hot_watermark_txid,
			None => 0,
		})
	})
	.await
}

#[tokio::test]
async fn oversized_commit_stops_the_drain_below_it() -> Result<()> {
	let mut test_ctx = TestCtx::new(build_registry()).await?;
	let database_id = "oversized-commit";
	let db = make_db(&test_ctx, database_id)?;

	// Ordinary commits first, so the planner admits a drain and the oversized commit is met by the
	// companion's second slice rather than refused at planning time.
	for txid in 1..=SMALL_COMMITS {
		db.commit(
			vec![dirty_page(1, txid)],
			OVERSIZED_COMMIT_PAGES,
			1_000 + txid as i64,
		)
		.await?;
	}
	let dirty_pages = (1..=OVERSIZED_COMMIT_PAGES)
		.map(|pgno| dirty_page(pgno, OVERSIZED_GENERATION))
		.collect::<Vec<_>>();
	db.commit_with_options(
		dirty_pages,
		OVERSIZED_COMMIT_PAGES,
		2_000,
		CommitOptions {
			expected_head_txid: None,
			disable_size_cap: true,
		},
	)
	.await?;

	let branch_id = read_database_branch_id(&test_ctx, database_id).await?;
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

	assert!(
		result
			.attempted_job_kinds
			.contains(&depot::workflows::compaction::CompactionJobKind::Hot),
		"the pass must have planned a hot job: {result:?}"
	);
	assert!(
		result.terminal_error.is_none(),
		"the pass must settle cleanly: {result:?}"
	);
	// Before the fix the drain reported the oversized slice as drained and the install advanced
	// the watermark to the head, past a commit that was never folded.
	assert_eq!(
		read_hot_watermark(&test_ctx, branch_id).await?,
		SMALL_COMMITS as u64,
		"the watermark must stop below a commit that was never folded"
	);

	// A further pass meets the oversized commit first, plans nothing, and leaves the watermark alone.
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
		"the second pass must settle cleanly: {result:?}"
	);
	assert_eq!(
		read_hot_watermark(&test_ctx, branch_id).await?,
		SMALL_COMMITS as u64
	);

	// The oversized commit is still fully readable through its delta.
	let fetched = db.get_pages(vec![1, OVERSIZED_COMMIT_PAGES]).await?;
	assert_eq!(
		fetched[0].bytes.as_deref(),
		Some(page_bytes(1, OVERSIZED_GENERATION).as_slice())
	);
	assert_eq!(
		fetched[1].bytes.as_deref(),
		Some(page_bytes(OVERSIZED_COMMIT_PAGES, OVERSIZED_GENERATION).as_slice())
	);

	test_ctx.shutdown().await?;
	Ok(())
}
