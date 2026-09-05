//! The compaction read throttle must be charged what a background transaction actually reads from
//! FDB, not what its candidate set ended up holding.
//!
//! The read axis exists to bound depot's read pressure on FDB. Deriving the charge from the pass's
//! `CompactionBatchBudget` value bytes only accounts for the rows that landed in the delete candidate
//! set, so every read outside that set is free: the history pins, the retained PITR interval rows, the
//! bucket fork proofs, the per-shard cold ref scans, the PIDX ownership probes, and the rows a scan
//! reads and then rejects for exceeding the batch budget. The candidate set is capped at
//! `CMP_FDB_BATCH_MAX_VALUE_BYTES` while those scans are unbounded in branch size, so the throttle
//! admits far more read volume than it is configured for, and it does so worst on the largest
//! branches. This was measured in production at ~228 MiB/s of real `depot_reclaim_fdb` reads against
//! ~7 MiB/s charged.
//!
//! Charging is now automatic: the transaction opts in and UniversalDB charges what it read. These
//! tests drive the real `plan_reclaim_slice_tx` (through `test_hooks::reclaim`) against a real
//! RocksDB-backed UDB and gate that what reaches the shared counter is the transaction's whole read
//! volume. The reclaim pass reads its history pins before it assembles any candidate set, so a branch
//! with many pins reads a large amount and selects nothing: a candidate-set-derived charge is zero
//! there no matter how big the pin population grows.

mod common;

use anyhow::{Context, Result};
use depot::{
	conveyer::Db,
	conveyer::branch,
	keys::{PAGE_SIZE, db_pin_key},
	types::{
		BucketId, DatabaseBranchId, DbHistoryPin, DbHistoryPinKind, DirtyPage,
		encode_db_history_pin,
	},
	workflows::compaction::{PlanReclaimSliceInput, test_hooks},
};
use gas::prelude::Id;
use rivet_config::config::DEPOT_COMPACTION_THROTTLE;
use std::sync::Arc;
use universaldb::{
	ThrottleCharge, ThrottleKind,
	throttle::{DEFAULT_WINDOW_MS, window_counter_key, window_index},
	utils::IsolationLevel::Snapshot,
};

const TEST_DATABASE: &str = "read-throttle-charge";

/// Fixed wall clock so the throttle window a charge lands in is deterministic.
const NOW_MS: i64 = 1_700_000_000_000;

/// Read budget the plan pass is gated against. Large enough that admission is never in question; these
/// tests are about the size of the charge, not the gate.
const READ_BYTES_PER_SECOND: u64 = 1024 * 1024 * 1024;

/// History pins to seed. Each is a small row, so the population is only meaningful in aggregate,
/// which is the point: the uncharged scans in production are millions of tiny rows.
const SEED_PINS: usize = 2_000;

fn test_bucket() -> Id {
	Id::v1(uuid::Uuid::from_u128(0x5ead), 1)
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

/// Writes `count` history pins for the branch. The reclaim plan reads the whole `DB_PIN` prefix on
/// every pass and charges none of it against the batch budget, so this is read volume the pre-fix
/// charge could never see.
async fn seed_history_pins(
	udb: &universaldb::Database,
	branch_id: DatabaseBranchId,
	count: usize,
) -> Result<()> {
	udb.txn("test_seed_history_pins", move |tx| async move {
		for index in 0..count {
			let pin_id = format!("test-pin-{index:08}");
			let pin = DbHistoryPin {
				at_versionstamp: [0; 16],
				at_txid: 1,
				kind: DbHistoryPinKind::RestorePoint,
				owner_database_branch_id: None,
				owner_bucket_branch_id: None,
				owner_restore_point: None,
				created_at_ms: NOW_MS,
			};
			tx.informal().set(
				&db_pin_key(branch_id, pin_id.as_bytes()),
				&encode_db_history_pin(pin)?,
			);
		}

		Ok(())
	})
	.await
}

/// Reads the read-axis throttle counter for the window `NOW_MS` falls in.
async fn read_charged_window_bytes(udb: &universaldb::Database) -> Result<i64> {
	let raw = common::read_value(
		udb,
		window_counter_key(
			DEPOT_COMPACTION_THROTTLE,
			ThrottleKind::Read,
			window_index(NOW_MS, DEFAULT_WINDOW_MS),
		),
	)
	.await?;

	Ok(raw.map_or(0, |bytes| {
		i64::from_le_bytes(bytes.as_slice().try_into().expect("counter is 8 bytes"))
	}))
}

/// Runs one real reclaim plan pass, returning the bytes its transaction read.
async fn plan_and_measure(udb: &universaldb::Database, branch_id: DatabaseBranchId) -> Result<u64> {
	let input = PlanReclaimSliceInput {
		database_branch_id: branch_id,
		base_lifecycle_generation: 0,
		base_manifest_generation: 0,
		cold_scan_cursor: None,
		commit_scan_cursor: 0,
		cursor_segment_pgno: None,
		skip_commit_delta: false,
	};

	let actually_read = udb
		.txn("test_plan_reclaim_slice", move |tx| {
			let input = input.clone();
			async move {
				tx.charge_throttle(DEPOT_COMPACTION_THROTTLE, ThrottleCharge::Both)?;
				test_hooks::reclaim::plan_slice_tx(&tx, &input, Id::new_v1(1), NOW_MS).await?;

				Ok(tx.read_bytes())
			}
		})
		.await?;
	// Charges accumulate in this process until they are flushed. Production runs the flusher on a
	// timer; a test drives it directly so the counter is exact rather than eventually right.
	udb.flush_throttle().await?;

	Ok(actually_read)
}

/// The charge must equal the transaction's real read volume, including reads that select nothing.
///
/// The seeded pins are read in full and contribute nothing to the candidate set, so a charge derived
/// from the candidate set is zero here while the transaction reads hundreds of kilobytes.
#[tokio::test]
async fn plan_charges_reads_that_select_nothing() -> Result<()> {
	let udb = common::test_db_with_throttle_arc(
		"depot-read-throttle-charge-pins",
		READ_BYTES_PER_SECOND,
		NOW_MS,
	)
	.await?;
	let db: Db = common::make_db(udb.clone(), test_bucket(), TEST_DATABASE);
	db.commit(vec![dirty_page(1, 0x11)], 1, NOW_MS).await?;
	let branch_id = read_database_branch_id(&udb, TEST_DATABASE).await?;

	seed_history_pins(&udb, branch_id, SEED_PINS).await?;

	let before_window = read_charged_window_bytes(&udb).await?;
	let actually_read = plan_and_measure(&udb, branch_id).await?;
	let after_window = read_charged_window_bytes(&udb).await?;

	// The pin scan alone is well past this; the candidate set for this branch is empty.
	assert!(
		actually_read > 100_000,
		"the seeded pin population should make the pass read a meaningful amount, read \
		 {actually_read} bytes"
	);
	assert_eq!(
		after_window - before_window,
		i64::try_from(actually_read).unwrap(),
		"the read axis must be charged every byte the transaction read"
	);

	Ok(())
}

/// The charge scales with the read, so a branch whose uncharged scans grew pays proportionally more.
///
/// This is what a candidate-set-derived charge cannot do: growing the pin population changes what the
/// pass reads without changing what it selects, so the pre-fix charge is flat (zero) across both
/// branches while the real read volume climbs.
#[tokio::test]
async fn charge_grows_with_read_volume_not_with_selection() -> Result<()> {
	let udb = common::test_db_with_throttle_arc(
		"depot-read-throttle-charge-scaling",
		READ_BYTES_PER_SECOND,
		NOW_MS,
	)
	.await?;

	let small_db: Db = common::make_db(udb.clone(), test_bucket(), "small");
	small_db
		.commit(vec![dirty_page(1, 0x11)], 1, NOW_MS)
		.await?;
	let small_branch_id = read_database_branch_id(&udb, "small").await?;
	seed_history_pins(&udb, small_branch_id, SEED_PINS).await?;

	let large_db: Db = common::make_db(udb.clone(), test_bucket(), "large");
	large_db
		.commit(vec![dirty_page(1, 0x11)], 1, NOW_MS)
		.await?;
	let large_branch_id = read_database_branch_id(&udb, "large").await?;
	seed_history_pins(&udb, large_branch_id, SEED_PINS * 4).await?;

	let before_window = read_charged_window_bytes(&udb).await?;
	let small_read = plan_and_measure(&udb, small_branch_id).await?;
	let after_small = read_charged_window_bytes(&udb).await?;
	let large_read = plan_and_measure(&udb, large_branch_id).await?;
	let after_large = read_charged_window_bytes(&udb).await?;

	let small_charged = u64::try_from(after_small - before_window).unwrap();
	let large_charged = u64::try_from(after_large - after_small).unwrap();
	assert_eq!(small_charged, small_read);
	assert_eq!(large_charged, large_read);
	assert!(
		large_charged > small_charged * 3,
		"a branch reading roughly four times as much must be charged roughly four times as much, \
		 got {small_charged} and {large_charged}"
	);

	Ok(())
}

/// Every pin the plan reads is a real row, so the measurement above is not counting an empty scan.
#[tokio::test]
async fn seeded_pins_are_readable() -> Result<()> {
	let udb: Arc<universaldb::Database> = common::test_db_with_throttle_arc(
		"depot-read-throttle-charge-seed",
		READ_BYTES_PER_SECOND,
		NOW_MS,
	)
	.await?;
	let db: Db = common::make_db(udb.clone(), test_bucket(), TEST_DATABASE);
	db.commit(vec![dirty_page(1, 0x11)], 1, NOW_MS).await?;
	let branch_id = read_database_branch_id(&udb, TEST_DATABASE).await?;
	seed_history_pins(&udb, branch_id, SEED_PINS).await?;

	let pins = udb
		.txn("test_read_pins", move |tx| async move {
			depot::conveyer::history_pin::read_db_history_pins(&tx, branch_id, Snapshot).await
		})
		.await?;
	assert_eq!(pins.len(), SEED_PINS);

	Ok(())
}
