#![cfg(feature = "test-faults")]

//! SHARD blobs are stored as chunk rows so a dense shard image (up to ~256 KB plus LTX framing)
//! never exceeds FDB's 100 KB per-value cap. These tests drive a dense 64-page shard (a >100 KB
//! image, the direct repro of the oversized-value commit failure) through hot compaction staging,
//! install, the live read path, legacy single-value compatibility, and truncate pruning.

use std::sync::Arc;

use anyhow::{Context, Result};
use depot::{
	conveyer::{Db, branch},
	keys,
	types::{BucketId, DatabaseBranchId, DirtyPage, FetchedPage},
	workflows::compaction::{
		DbColdCompactorWorkflow, DbHotCompactorWorkflow, DbManagerWorkflow, DbReclaimerWorkflow,
		DepotCompactionTestDriver, ForceCompactionWork,
	},
};
use gas::prelude::{Id, Registry, TestCtx};
use rivet_pools::NodeId;
use universaldb::{
	options::StreamingMode,
	utils::{CHUNK_SIZE, IsolationLevel::Serializable},
};
use uuid::Uuid;

const PAGE_SIZE: u32 = keys::PAGE_SIZE;
const SHARD_SIZE: u32 = keys::SHARD_SIZE;

fn test_bucket() -> Id {
	Id::v1(Uuid::from_u128(0x5c4d), 1)
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

/// Deterministic pseudo-random page content. LTX compresses page frames, so a dense shard image
/// only exceeds the FDB value cap when the pages are incompressible, matching real SQLite content.
fn page_bytes(pgno: u32) -> Vec<u8> {
	let mut state = u64::from(pgno).wrapping_mul(0x9e37_79b9_7f4a_7c15) | 1;
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

fn dirty_page(pgno: u32) -> DirtyPage {
	DirtyPage {
		pgno,
		bytes: page_bytes(pgno),
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
	db.txn("test_depotshard_chunking_branch", move |tx| {
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

/// Every physical `SHARD` row of one branch: `(shard_id, as_of_txid, chunk_idx, key, value)`.
async fn scan_shard_rows(
	test_ctx: &TestCtx,
	branch_id: DatabaseBranchId,
) -> Result<Vec<(u32, u64, Option<u32>, Vec<u8>, Vec<u8>)>> {
	let udb = test_ctx.pools().udb()?;
	udb.txn("test_depotshard_chunking_scan", move |tx| async move {
		let prefix = keys::branch_shard_prefix(branch_id);
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
		let mut rows = Vec::new();
		while let Some(entry) = futures_util::TryStreamExt::try_next(&mut stream).await? {
			let (shard_id, as_of_txid, chunk_idx) =
				keys::decode_branch_shard_row_key(branch_id, entry.key())?;
			rows.push((
				shard_id,
				as_of_txid,
				chunk_idx,
				entry.key().to_vec(),
				entry.value().to_vec(),
			));
		}
		Ok(rows)
	})
	.await
}

async fn seed_rows(test_ctx: &TestCtx, writes: Vec<(Vec<u8>, Vec<u8>)>) -> Result<()> {
	let udb = test_ctx.pools().udb()?;
	udb.txn("test_depotshard_chunking_seed", move |tx| {
		let writes = writes.clone();
		async move {
			for (key, value) in writes {
				tx.informal().set(&key, &value);
			}
			Ok(())
		}
	})
	.await
}

async fn clear_keys(test_ctx: &TestCtx, clears: Vec<Vec<u8>>) -> Result<()> {
	let udb = test_ctx.pools().udb()?;
	udb.txn("test_depotshard_chunking_clear", move |tx| {
		let clears = clears.clone();
		async move {
			for key in clears {
				tx.informal().clear(&key);
			}
			Ok(())
		}
	})
	.await
}

fn expect_page(fetched: &FetchedPage, pgno: u32) {
	assert_eq!(fetched.pgno, pgno);
	assert_eq!(
		fetched.bytes.as_deref(),
		Some(page_bytes(pgno).as_slice()),
		"page {pgno} must read back its committed bytes"
	);
}

/// Commits a fully dense shard 1 (pages 64..=127, a ~256 KB image) and hot-compacts it.
async fn setup_dense_shard(test_ctx: &TestCtx, database_id: &str) -> Result<DatabaseBranchId> {
	let db = make_db(test_ctx, database_id)?;
	let pages = (SHARD_SIZE..SHARD_SIZE * 2).map(dirty_page).collect();
	db.commit(pages, SHARD_SIZE * 2, 1_000).await?;
	let branch_id = read_database_branch_id(test_ctx, database_id).await?;

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
	assert!(
		result.terminal_error.is_none(),
		"hot compaction of a dense >100 KB shard must succeed: {:?}",
		result.terminal_error
	);

	Ok(branch_id)
}

/// The direct repro of the FDB oversized-value failure: staging and installing a dense 64-page
/// shard image (>100 KB) must succeed, every installed row must stay within the chunk size, and
/// the image must read back byte-identical through the live read path.
#[tokio::test]
async fn dense_shard_hot_compaction_round_trips_as_chunk_rows() -> Result<()> {
	let mut test_ctx = TestCtx::new(build_registry()).await?;
	let database_id = "shard-chunking-dense";
	let branch_id = setup_dense_shard(&test_ctx, database_id).await?;

	let rows = scan_shard_rows(&test_ctx, branch_id).await?;
	assert!(!rows.is_empty(), "install must write SHARD rows");
	for (shard_id, as_of_txid, chunk_idx, _, value) in &rows {
		assert!(
			chunk_idx.is_some(),
			"new writes must be chunked, found a bare legacy row at shard {shard_id} txid {as_of_txid}"
		);
		assert!(
			value.len() <= CHUNK_SIZE,
			"no SHARD value may exceed CHUNK_SIZE, found {} bytes",
			value.len()
		);
	}
	let dense_chunks = rows
		.iter()
		.filter(|(shard_id, _, _, _, _)| *shard_id == 1)
		.count();
	assert!(
		dense_chunks > 1,
		"a >100 KB shard image must split into multiple chunk rows, found {dense_chunks}"
	);

	// PIDX is cleared by the install, so these reads resolve through the chunked SHARD store.
	let db = make_db(&test_ctx, database_id)?;
	let pgnos = (SHARD_SIZE..SHARD_SIZE * 2).collect::<Vec<_>>();
	let fetched = db.get_pages(pgnos.clone()).await?;
	assert_eq!(fetched.len(), pgnos.len());
	for (fetched, pgno) in fetched.iter().zip(pgnos) {
		expect_page(fetched, pgno);
	}

	test_ctx.shutdown().await?;
	Ok(())
}

/// A pre-chunking shard version stored as a single value at the bare version key must stay
/// readable through the live read path without any migration.
#[tokio::test]
async fn legacy_single_value_shard_version_reads_back() -> Result<()> {
	let mut test_ctx = TestCtx::new(build_registry()).await?;
	let database_id = "shard-chunking-legacy";
	let branch_id = setup_dense_shard(&test_ctx, database_id).await?;

	// Rewrite the installed chunked version into the legacy single-value layout. The image itself
	// exceeds the FDB cap, but the RocksDB test driver does not enforce it, which is exactly how
	// pre-chunking rows look in an existing store.
	let rows = scan_shard_rows(&test_ctx, branch_id).await?;
	let version_txid = rows
		.iter()
		.find(|(shard_id, _, _, _, _)| *shard_id == 1)
		.map(|(_, as_of_txid, _, _, _)| *as_of_txid)
		.context("dense shard version should exist")?;
	let mut legacy_blob = Vec::new();
	let mut clears = Vec::new();
	for (shard_id, as_of_txid, _, key, value) in rows {
		if shard_id == 1 && as_of_txid == version_txid {
			legacy_blob.extend_from_slice(&value);
			clears.push(key);
		}
	}
	clear_keys(&test_ctx, clears).await?;
	seed_rows(
		&test_ctx,
		vec![(
			keys::branch_shard_key(branch_id, 1, version_txid),
			legacy_blob,
		)],
	)
	.await?;

	let db = make_db(&test_ctx, database_id)?;
	let fetched = db.get_pages(vec![SHARD_SIZE, SHARD_SIZE * 2 - 1]).await?;
	expect_page(&fetched[0], SHARD_SIZE);
	expect_page(&fetched[1], SHARD_SIZE * 2 - 1);

	test_ctx.shutdown().await?;
	Ok(())
}

/// A truncate that shrinks into a dense chunked boundary shard must prune the surviving pages,
/// leave no stale tail chunk from the longer pre-prune chunking, and keep reads correct at and
/// above the new EOF.
#[tokio::test]
async fn truncate_prunes_chunked_boundary_shard_without_stale_tail() -> Result<()> {
	let mut test_ctx = TestCtx::new(build_registry()).await?;
	let database_id = "shard-chunking-truncate";
	let branch_id = setup_dense_shard(&test_ctx, database_id).await?;

	// Shrink into the middle of dense shard 1: pages above 96 fall away, so the boundary shard's
	// image roughly halves and its chunk count drops.
	let new_db_size = SHARD_SIZE + SHARD_SIZE / 2;
	let db = make_db(&test_ctx, database_id)?;
	db.commit(vec![dirty_page(1)], new_db_size, 2_000).await?;

	let rows = scan_shard_rows(&test_ctx, branch_id).await?;
	let boundary_rows = rows
		.iter()
		.filter(|(shard_id, _, _, _, _)| *shard_id == 1)
		.collect::<Vec<_>>();
	assert!(
		!boundary_rows.is_empty(),
		"the pruned boundary shard version must survive"
	);
	let mut pruned_blob = Vec::new();
	for (expected_idx, (_, _, chunk_idx, _, value)) in boundary_rows.iter().enumerate() {
		assert_eq!(
			*chunk_idx,
			Some(expected_idx as u32),
			"pruned boundary shard chunks must be contiguous from chunk 0 with no stale tail"
		);
		assert!(value.len() <= CHUNK_SIZE);
		pruned_blob.extend_from_slice(value);
	}
	let decoded = depot::ltx::decode_ltx_v3(&pruned_blob)?;
	assert!(
		decoded.pages.iter().all(|page| page.pgno <= new_db_size),
		"pruned boundary shard must only keep pages at or below the new EOF"
	);
	assert!(
		decoded.pages.iter().any(|page| page.pgno == new_db_size),
		"the page at the new EOF must survive the prune"
	);

	let db = make_db(&test_ctx, database_id)?;
	let fetched = db.get_pages(vec![new_db_size]).await?;
	expect_page(&fetched[0], new_db_size);

	test_ctx.shutdown().await?;
	Ok(())
}
