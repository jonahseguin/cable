#![cfg(feature = "test-faults")]

use std::{collections::BTreeSet, sync::Arc};

use anyhow::{Context, Result};
use depot::{
	cold_tier::{ColdTier, FilesystemColdTier},
	conveyer::{Db, branch},
	keys::{self, PAGE_SIZE, SHARD_SIZE},
	types::{BucketId, DatabaseBranchId, DirtyPage},
	workflows::compaction::{
		DbColdCompactorWorkflow, DbHotCompactorWorkflow, DbManagerWorkflow, DbReclaimerWorkflow,
		DepotCompactionTestDriver, ForceCompactionWork,
	},
};
use gas::prelude::{Id, Registry, TestCtx};
use rivet_pools::NodeId;
use tempfile::Builder;
use uuid::Uuid;

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

async fn read_database_branch_id(
	test_ctx: &TestCtx,
	database_id: &str,
) -> Result<DatabaseBranchId> {
	let db = test_ctx.pools().udb()?;
	let database_id = database_id.to_string();
	db.txn("test_shard_lru_branch", move |tx| {
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

/// Reads the per-shard LRU index: returns `(SHARD_ACCESS buckets by shard, SHARD_LRU (bucket, shard)
/// entries)`.
async fn read_shard_lru_index(
	test_ctx: &TestCtx,
	branch_id: DatabaseBranchId,
) -> Result<(std::collections::BTreeMap<u32, i64>, BTreeSet<(i64, u32)>)> {
	let udb = test_ctx.pools().udb()?;
	udb.txn("test_shard_lru_read", move |tx| async move {
		use universaldb::options::StreamingMode;
		use universaldb::utils::IsolationLevel::Serializable;
		let informal = tx.informal();

		// SHARD_ACCESS rows.
		let access_prefix = keys::branch_shard_access_key(branch_id, 0);
		// branch_shard_access_key appends a u32, so strip the trailing 4 bytes to get the family
		// prefix.
		let access_prefix = access_prefix[..access_prefix.len() - 4].to_vec();
		let access_subspace = universaldb::Subspace::from(
			universaldb::tuple::Subspace::from_bytes(access_prefix.clone()),
		);
		let mut access_stream = informal.get_ranges_keyvalues(
			universaldb::RangeOption {
				mode: StreamingMode::WantAll,
				..universaldb::RangeOption::from(&access_subspace)
			},
			Serializable,
		);
		let mut access = std::collections::BTreeMap::<u32, i64>::new();
		while let Some(entry) = futures_util::TryStreamExt::try_next(&mut access_stream).await? {
			let suffix = entry
				.key()
				.strip_prefix(access_prefix.as_slice())
				.context("shard access key prefix")?;
			let shard_id = u32::from_be_bytes(suffix.try_into()?);
			let bucket = i64::from_le_bytes(entry.value().try_into()?);
			access.insert(shard_id, bucket);
		}

		// SHARD_LRU rows.
		let (lru_start, lru_end) = keys::branch_shard_lru_range(branch_id);
		let mut lru_stream = informal.get_ranges_keyvalues(
			universaldb::RangeOption {
				mode: StreamingMode::WantAll,
				..universaldb::RangeOption::from((lru_start, lru_end))
			},
			Serializable,
		);
		let mut lru = BTreeSet::<(i64, u32)>::new();
		while let Some(entry) = futures_util::TryStreamExt::try_next(&mut lru_stream).await? {
			lru.insert(keys::decode_branch_shard_lru_key(branch_id, entry.key())?);
		}

		Ok((access, lru))
	})
	.await
}

async fn force_hot_compaction(test_ctx: &TestCtx, branch_id: DatabaseBranchId) -> Result<()> {
	let driver = DepotCompactionTestDriver::new(test_ctx);
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
	assert!(result.terminal_error.is_none());
	Ok(())
}

/// With a cold tier configured, reading cache-backed shard pages dual-writes the per-shard LRU index:
/// an authoritative `SHARD_ACCESS/{s}` bucket plus a `SHARD_LRU/{bucket}/{s}` recency entry for each
/// touched shard.
#[tokio::test]
async fn read_dual_writes_shard_lru_index_when_cold_enabled() -> Result<()> {
	let cold_root = Builder::new().prefix("shard-lru-cold").tempdir()?;
	let cold_tier: Arc<dyn ColdTier> =
		Arc::new(FilesystemColdTier::new(cold_root.path().to_path_buf()));

	let mut test_ctx = TestCtx::new(build_registry()).await?;
	let database_id = "shard-lru-cold-on";
	let db = make_db_with_cold_tier(&test_ctx, database_id, cold_tier)?;

	// Touch two distinct shards (page 1 -> shard 0, page SHARD_SIZE+1 -> shard 1).
	db.commit(
		vec![dirty_page(1, 0x22), dirty_page(SHARD_SIZE + 1, 0x33)],
		SHARD_SIZE + 2,
		1_000,
	)
	.await?;
	let branch_id = read_database_branch_id(&test_ctx, database_id).await?;

	// Materialize SHARD rows so reads fall back to the shard cache and mark it touched.
	force_hot_compaction(&test_ctx, branch_id).await?;

	// Read both shards' pages. This is the dual-write trigger.
	db.get_pages(vec![1, SHARD_SIZE + 1]).await?;

	let (access, lru) = read_shard_lru_index(&test_ctx, branch_id).await?;
	assert!(
		access.contains_key(&0) && access.contains_key(&1),
		"both touched shards must have a SHARD_ACCESS bucket, got {access:?}"
	);
	for (&shard_id, &bucket) in &access {
		assert!(
			bucket > 0,
			"shard {shard_id} access bucket should be positive"
		);
		assert!(
			lru.contains(&(bucket, shard_id)),
			"SHARD_LRU must hold ({bucket}, {shard_id}); lru = {lru:?}"
		);
	}

	test_ctx.shutdown().await?;
	Ok(())
}

/// Without a cold tier there is nowhere to demote to, so the read path must not write the per-shard
/// LRU index at all.
#[tokio::test]
async fn read_skips_shard_lru_index_when_cold_disabled() -> Result<()> {
	let mut test_ctx = TestCtx::new(build_registry()).await?;
	let database_id = "shard-lru-cold-off";
	let db = make_db(&test_ctx, database_id)?;

	db.commit(
		vec![dirty_page(1, 0x22), dirty_page(SHARD_SIZE + 1, 0x33)],
		SHARD_SIZE + 2,
		1_000,
	)
	.await?;
	let branch_id = read_database_branch_id(&test_ctx, database_id).await?;
	force_hot_compaction(&test_ctx, branch_id).await?;

	db.get_pages(vec![1, SHARD_SIZE + 1]).await?;

	let (access, lru) = read_shard_lru_index(&test_ctx, branch_id).await?;
	assert!(
		access.is_empty() && lru.is_empty(),
		"cold-disabled reads must not write the per-shard LRU index, got access={access:?} lru={lru:?}"
	);

	test_ctx.shutdown().await?;
	Ok(())
}
