#![cfg(feature = "test-faults")]

//! The install's copy volume is what direct-to-shard folds remove, so this measures it directly.
//!
//! Both modes run inside one test on purpose. `install_write_probe` is process-global, so a sibling
//! test running its own compaction would pollute the samples; keeping this the only test in its
//! binary makes the two measurements comparable and keeps the probe's serial-pass constraint.

use std::sync::Arc;

use anyhow::{Context, Result};
use depot::{
	conveyer::{Db, branch},
	keys,
	types::{BucketId, DatabaseBranchId, DirtyPage},
	workflows::compaction::{
		DbColdCompactorWorkflow, DbHotCompactorWorkflow, DbManagerWorkflow, DbReclaimerWorkflow,
		DepotCompactionTestDriver, ForceCompactionWork, test_hooks,
	},
};
use gas::prelude::{Id, Registry, TestCtx};
use rivet_pools::NodeId;
use test_hooks::install_write_probe;
use universaldb::utils::IsolationLevel::Serializable;
use uuid::Uuid;

const PAGE_SIZE: u32 = keys::PAGE_SIZE;

fn test_bucket() -> Id {
	Id::v1(Uuid::from_u128(0x9ad2), 1)
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
	db.txn("test_depot_direct_copy_branch", move |tx| {
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

/// Folds one branch's commits and returns the bytes the install copied doing it.
async fn hot_compact_measuring_install_copy(
	test_ctx: &TestCtx,
	database_id: &str,
	direct_to_shard: bool,
	fill: u8,
) -> Result<u64> {
	let db = make_db(test_ctx, database_id)?;
	db.commit(vec![dirty_page(1, fill)], 2, 1_000).await?;
	db.commit(vec![dirty_page(2, fill)], 2, 1_001).await?;
	let branch_id = read_database_branch_id(test_ctx, database_id).await?;
	let _direct = test_hooks::override_direct_to_shard_for_test(branch_id, direct_to_shard);

	let driver = DepotCompactionTestDriver::new(test_ctx);
	let manager_workflow_id = driver.start_manager(branch_id, None, true).await?;

	install_write_probe::reset();
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
	let copied = install_write_probe::max_copied_bytes();

	// Prove the fold actually happened, so a zero reading means "nothing was copied" rather than
	// "nothing ran".
	let page = db
		.get_pages(vec![1])
		.await?
		.into_iter()
		.find(|page| page.pgno == 1)
		.context("page 1 should be readable after the fold")?;
	assert_eq!(
		page.bytes.context("page 1 should have bytes")?,
		vec![fill; PAGE_SIZE as usize],
		"the fold must publish a readable page in both modes"
	);

	Ok(copied)
}

#[tokio::test]
async fn direct_fold_removes_the_install_copy() -> Result<()> {
	let mut test_ctx = TestCtx::new(build_registry()).await?;

	let staged_copied =
		hot_compact_measuring_install_copy(&test_ctx, "install-copy-staged", false, 0x71).await?;
	assert!(
		staged_copied > 0,
		"a staged fold's install must copy the image into the shard tier"
	);

	let direct_copied =
		hot_compact_measuring_install_copy(&test_ctx, "install-copy-direct", true, 0x72).await?;
	assert_eq!(
		direct_copied, 0,
		"a direct fold's install must publish without copying any shard bytes \
		 (staged mode copied {staged_copied})"
	);

	test_ctx.shutdown().await?;
	Ok(())
}
