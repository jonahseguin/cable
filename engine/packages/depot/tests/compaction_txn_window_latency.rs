#![cfg(feature = "test-faults")]

//! SECONDARY timing proof for the large-DB bounded-reads work
//! (`~/.agents/specs/depot-compaction-large-db-test.md` §4b).
//!
//! `Database::txn(...)` reads `UDB_SIMULATED_LATENCY_MS` once per process via `OnceLock`, so this
//! latency-dependent check lives in its own integration-test binary and sets the env var before the
//! first transaction. With per-op latency injected, a full-keyspace scan of a `>> B` seed would blow
//! the ~5 s FDB transaction window; a bounded `<= B`-row read stays well under it. The assertion is
//! simply that each forced pass completes (`terminal_error.is_none()`), which it only can if it never
//! issues the unbounded scan. The deterministic counter in `compaction_large_db_bounded` is the
//! authoritative check; this is a belt-and-suspenders confirmation.
//!
//! `#[ignore]` by default: every op (including the ~hundreds of seeding commits) pays the injected
//! latency, so the binary is slow. Run with
//! `cargo test -p depot --features test-faults --test compaction_txn_window_latency -- --ignored
//! --test-threads=1`.

use std::sync::Arc;

use anyhow::{Context, Result};
use depot::{
	CMP_FDB_BATCH_MAX_KEYS,
	conveyer::{Db, branch},
	keys::PAGE_SIZE,
	types::{BucketId, DatabaseBranchId, DirtyPage},
	workflows::compaction::{
		CompactionJobKind, DbColdCompactorWorkflow, DbHotCompactorWorkflow, DbManagerWorkflow,
		DbReclaimerWorkflow, DepotCompactionTestDriver, ForceCompactionWork, test_hooks,
	},
};
use gas::prelude::{Id, Registry, TestCtx};
use rivet_pools::NodeId;
use uuid::Uuid;

use test_hooks::scan_probe;

const B: u64 = CMP_FDB_BATCH_MAX_KEYS as u64;

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
	db.txn("test_depottxn_window_branch", move |tx| {
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

/// With injected per-op latency, a `>> B` seed forces every compaction read to choose between the
/// bounded path (completes) and a full scan (ages out the window). Asserting the hot pass completes is
/// the timing-side confirmation that it never issues the unbounded scan.
#[tokio::test]
#[ignore = "slow: every op pays UDB_SIMULATED_LATENCY_MS; run with --ignored --test-threads=1"]
async fn hot_pass_completes_under_injected_latency() -> Result<()> {
	// Set before the first `Database::txn`; the value is latched process-wide via `OnceLock`.
	unsafe {
		std::env::set_var("UDB_SIMULATED_LATENCY_MS", "2");
	}

	let mut test_ctx = TestCtx::new(build_registry()).await?;
	let database_id = "txn-window-hot";
	let db = make_db(&test_ctx, database_id)?;
	// `> B` distinct pages so a full PIDX/commit scan would materialize > B rows; an unbounded scan of
	// this seed at 2 ms/op would exceed the ~5 s window.
	let distinct_pages: u32 = 640;
	for pgno in 1..=distinct_pages {
		db.commit(
			vec![dirty_page(pgno, 0x11)],
			distinct_pages + 1,
			1_000 + pgno as i64,
		)
		.await?;
	}
	let branch_id = read_database_branch_id(&test_ctx, database_id).await?;

	let driver = DepotCompactionTestDriver::new(&test_ctx);
	let manager_workflow_id = driver.start_manager(branch_id, None, true).await?;

	scan_probe::reset();
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
		"hot pass must complete under injected latency, which is only possible if every read is bounded"
	);
	assert!(
		result.attempted_job_kinds.contains(&CompactionJobKind::Hot),
		"a hot job must run"
	);
	assert!(
		scan_probe::max_single_scan() <= B,
		"hot pass read {} rows in a single scan under injected latency; it must stay bounded",
		scan_probe::max_single_scan(),
	);

	test_ctx.shutdown().await?;
	Ok(())
}
