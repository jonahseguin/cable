#![cfg(feature = "test-faults")]

//! Resolving a bucket fork pin must read one VTX row, not the branch's whole commit history.
//!
//! `latest_commit_at_or_before_versionstamp` selects the newest commit at or below a versionstamp
//! cap. It used to do that by scanning the entire `VTX` prefix and keeping the last row under the
//! cap. That loop looked bounded (it broke past the cap and gave up past `CMP_FDB_BATCH_MAX_KEYS`)
//! but the scan helper materializes the whole prefix before the first comparison runs, so the cap
//! bounded CPU and not FDB reads: one key per commit the branch had ever made, inside the reclaim
//! plan and sweep transactions.
//!
//! These tests pin both halves. The read is one row wide regardless of history length, and it still
//! selects the commit the forward scan selected, including at the inclusive cap boundary.

mod common;

use anyhow::{Context, Result};
use depot::{
	conveyer::{Db, branch},
	keys::{self, PAGE_SIZE},
	types::{BucketId, DatabaseBranchId, DirtyPage},
	workflows::compaction::test_hooks,
};
use gas::prelude::Id;
use std::sync::Arc;

use test_hooks::scan_probe;

const TEST_DATABASE: &str = "fork-pin-vtx";
const COMMITS: u64 = 40;
const NOW_MS: i64 = 1_760_000_000_000;

fn test_bucket() -> Id {
	Id::v1(uuid::Uuid::from_u128(0x5eed), 1)
}

fn dirty_page(pgno: u32, fill: u8) -> DirtyPage {
	DirtyPage {
		pgno,
		bytes: vec![fill; PAGE_SIZE as usize],
	}
}

async fn read_database_branch_id(
	udb: &universaldb::Database,
	database_id: &str,
) -> Result<DatabaseBranchId> {
	let database_id = database_id.to_string();
	udb.txn("test_resolve_branch", move |tx| {
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

/// Every `(versionstamp, txid)` the branch committed, oldest first.
async fn read_vtx_rows(
	udb: &universaldb::Database,
	branch_id: DatabaseBranchId,
) -> Result<Vec<([u8; 16], u64)>> {
	let rows = common::read_range(udb, keys::branch_vtx_prefix(branch_id)).await?;
	let mut out = Vec::new();
	for (key, value) in rows {
		let versionstamp: [u8; 16] = key[key.len() - 16..]
			.try_into()
			.context("vtx key ends in a versionstamp")?;
		let txid = u64::from_be_bytes(
			value[..8]
				.try_into()
				.context("vtx value starts with a big-endian txid")?,
		);
		out.push((versionstamp, txid));
	}

	Ok(out)
}

/// Resolves the pin through the real production read and reports the widest range it materialized.
async fn resolve_and_measure(
	udb: &universaldb::Database,
	branch_id: DatabaseBranchId,
	cap: [u8; 16],
) -> Result<(Option<u64>, u64)> {
	scan_probe::reset();
	let resolved = udb
		.txn("test_resolve_fork_pin", move |tx| async move {
			test_hooks::reclaim::latest_commit_at_or_before_versionstamp(&tx, branch_id, cap).await
		})
		.await?;

	Ok((
		resolved.map(|(txid, _, _)| txid),
		scan_probe::max_single_scan(),
	))
}

async fn seed(udb: &Arc<universaldb::Database>) -> Result<DatabaseBranchId> {
	let db: Db = common::make_db(udb.clone(), test_bucket(), TEST_DATABASE);
	for txid in 1..=COMMITS {
		db.commit(vec![dirty_page(1, txid as u8)], 1, NOW_MS)
			.await?;
	}

	read_database_branch_id(udb, TEST_DATABASE).await
}

/// The read stays one row wide no matter how long the branch's history is.
#[tokio::test]
async fn fork_pin_resolution_reads_one_row() -> Result<()> {
	let udb = common::test_db_arc("depot-fork-pin-vtx-bounded").await?;
	let branch_id = seed(&udb).await?;
	let vtx = read_vtx_rows(&udb, branch_id).await?;
	assert_eq!(
		vtx.len() as u64,
		COMMITS,
		"every commit should have written a VTX row"
	);

	// Cap at the newest commit, the worst case for a forward scan.
	let (resolved, widest_scan) =
		resolve_and_measure(&udb, branch_id, vtx.last().unwrap().0).await?;

	assert_eq!(resolved, Some(vtx.last().unwrap().1));
	assert_eq!(
		widest_scan, 1,
		"resolving one fork pin must materialize one row, not one per commit (read {widest_scan} \
		 rows across {COMMITS} commits)"
	);

	Ok(())
}

/// The cap is inclusive, and a cap between two commits selects the older one.
#[tokio::test]
async fn fork_pin_resolution_selects_the_newest_at_or_below_the_cap() -> Result<()> {
	let udb = common::test_db_arc("depot-fork-pin-vtx-boundary").await?;
	let branch_id = seed(&udb).await?;
	let vtx = read_vtx_rows(&udb, branch_id).await?;

	let (middle_versionstamp, middle_txid) = vtx[vtx.len() / 2];
	let (_, previous_txid) = vtx[vtx.len() / 2 - 1];

	let (at_cap, _) = resolve_and_measure(&udb, branch_id, middle_versionstamp).await?;
	assert_eq!(
		at_cap,
		Some(middle_txid),
		"a cap landing exactly on a commit must select that commit"
	);

	// One byte below that versionstamp: the same commit is now out of range.
	let mut just_below = middle_versionstamp;
	for byte in just_below.iter_mut().rev() {
		if *byte > 0 {
			*byte -= 1;
			break;
		}
		*byte = u8::MAX;
	}
	let (below_cap, _) = resolve_and_measure(&udb, branch_id, just_below).await?;
	assert_eq!(
		below_cap,
		Some(previous_txid),
		"a cap just below a commit must select the one before it"
	);

	Ok(())
}

/// A cap older than every commit resolves to nothing rather than to the oldest commit.
#[tokio::test]
async fn fork_pin_resolution_returns_none_below_all_history() -> Result<()> {
	let udb = common::test_db_arc("depot-fork-pin-vtx-empty").await?;
	let branch_id = seed(&udb).await?;

	let (resolved, _) = resolve_and_measure(&udb, branch_id, [0; 16]).await?;
	assert_eq!(resolved, None);

	Ok(())
}
