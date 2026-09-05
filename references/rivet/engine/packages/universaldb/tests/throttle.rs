//! The cluster-wide byte-rate throttle (`universaldb::throttle`).
//!
//! Two families of behavior are covered here. The first is the limiter itself: the windowed counter,
//! the sliding-window estimate, the probabilistic ramp, class budgets, stale-window cleanup, and the
//! absence of conflicts between concurrent chargers.
//!
//! The second is the accounting contract, which is the part that is easy to get quietly wrong. Reads
//! are charged for every attempt, including attempts that never commit and attempts whose future is
//! dropped, because those bytes came out of storage regardless. Writes are charged exactly once, and
//! only if the transaction commits, because an aborted attempt writes nothing. Getting the write side
//! wrong does not fail loudly: it silently multiplies a retried transaction's charge and strangles the
//! budget.
//!
//! Time is injected, so windows are simulated by moving a clock rather than sleeping, and the flusher
//! is driven directly rather than waited on.

use std::sync::{
	Arc,
	atomic::{AtomicI64, AtomicU64, Ordering},
};

use anyhow::{Ok, Result};
use universaldb::{
	Database, ThrottleCharge, ThrottleClass, ThrottleConfig, ThrottleKind,
	error::DatabaseError,
	options::MutationType,
	throttle::{admit_probability, window_counter_key, window_index},
	utils::IsolationLevel::Serializable,
};
use uuid::Uuid;

const THROTTLE: &str = "test_throttle";
const WINDOW_MS: i64 = 10_000;

/// A clock the test moves by hand, so a charge lands in a known window.
#[derive(Clone)]
struct TestClock(Arc<AtomicI64>);

impl TestClock {
	fn new(now_ms: i64) -> Self {
		TestClock(Arc::new(AtomicI64::new(now_ms)))
	}

	fn set(&self, now_ms: i64) {
		self.0.store(now_ms, Ordering::SeqCst);
	}
}

async fn database(budget_bytes_per_second: Option<u64>, clock: &TestClock) -> Result<Database> {
	let test_id = Uuid::new_v4();
	let (db_config, _docker_config) = rivet_test_deps_docker::TestDatabase::FileSystem
		.config(test_id, 1)
		.await?;
	let rivet_config::config::Database::FileSystem(fs_config) = db_config else {
		unreachable!()
	};
	let driver = universaldb::driver::RocksDbDatabaseDriver::new(fs_config.path).await?;

	let clock_for_config = clock.clone();
	// No background flusher: these tests drive the flush themselves so a charge reaches the counters at
	// a known point rather than on a timer.
	let config = ThrottleConfig::new(Arc::new(move |_name, _kind| budget_bytes_per_second))
		.with_window_ms(WINDOW_MS)
		.without_flusher()
		.with_clock(Arc::new(move || clock_for_config.0.load(Ordering::SeqCst)));

	Ok(Database::new(Arc::new(driver)).with_throttle(config))
}

/// Per-window byte budget for a rate, mirroring the throttle's own derivation.
fn budget_for(bytes_per_second: u64) -> i64 {
	bytes_per_second as i64 * WINDOW_MS / 1000
}

/// Reads a window counter as a signed little-endian i64, treating an absent key as zero.
async fn read_window(db: &Database, kind: ThrottleKind, at_ms: i64) -> Result<Option<i64>> {
	let key = window_counter_key(THROTTLE, kind, window_index(at_ms, WINDOW_MS));

	db.txn("test_read_window", move |tx| {
		let key = key.clone();
		async move {
			let Some(value) = tx.informal().get(&key, Serializable).await? else {
				return Ok(None);
			};
			let bytes: [u8; 8] = Vec::from(value).try_into().expect("counter is 8 bytes");

			Ok(Some(i64::from_le_bytes(bytes)))
		}
	})
	.await
}

/// Charges bytes by hand and flushes them, the shortest path to a populated window.
async fn charge(db: &Database, kind: ThrottleKind, bytes: u64) -> Result<()> {
	db.txn("test_charge", move |tx| async move {
		tx.charge_throttle(THROTTLE, ThrottleCharge::Both)?;
		tx.charge_throttle_bytes(kind, bytes);

		Ok(())
	})
	.await?;

	db.flush_throttle().await
}

fn class(budget_multiplier: f64, admit_soft_util: f64) -> ThrottleClass {
	ThrottleClass {
		budget_multiplier,
		admit_soft_util,
	}
}

#[tokio::test]
async fn admits_below_soft_mark_and_denies_at_budget() -> Result<()> {
	let clock = TestClock::new(0);
	let bytes_per_second = 1_000u64;
	let budget = budget_for(bytes_per_second);
	let db = database(Some(bytes_per_second), &clock).await?;
	let class = class(1.0, 0.5);

	// A fresh window is empty, so admission is certain and the budget is surfaced.
	let decision = db.check_throttle(THROTTLE, ThrottleKind::Write, class);
	assert!(decision.allowed, "empty window must admit");
	assert_eq!(decision.estimate_bytes, 0);
	assert_eq!(decision.budget_bytes, budget);
	assert_eq!(decision.admit_probability, 1.0);

	// At the soft mark admission is still certain.
	let soft_bytes = (0.5 * budget as f64) as u64;
	charge(&db, ThrottleKind::Write, soft_bytes).await?;
	let decision = db.check_throttle(THROTTLE, ThrottleKind::Write, class);
	assert_eq!(decision.estimate_bytes, soft_bytes as i64);
	assert_eq!(decision.admit_probability, 1.0);
	assert!(decision.allowed);

	// At budget the probability is zero, so it always denies.
	charge(&db, ThrottleKind::Write, budget as u64 - soft_bytes).await?;
	let decision = db.check_throttle(THROTTLE, ThrottleKind::Write, class);
	assert_eq!(decision.estimate_bytes, budget);
	assert_eq!(decision.admit_probability, 0.0);
	assert!(!decision.allowed);
	assert_eq!(
		read_window(&db, ThrottleKind::Write, 0).await?,
		Some(budget)
	);

	Ok(())
}

#[tokio::test]
async fn unconfigured_axis_is_unthrottled() -> Result<()> {
	let clock = TestClock::new(0);
	let db = database(None, &clock).await?;

	// Charging still runs; it simply has no budget to be measured against.
	charge(&db, ThrottleKind::Write, 1_000_000).await?;

	let decision = db.check_throttle(THROTTLE, ThrottleKind::Write, class(1.0, 0.5));
	assert!(decision.allowed, "an unconfigured axis must never deny");
	assert_eq!(decision.budget_bytes, 0);
	assert_eq!(decision.admit_probability, 1.0);

	Ok(())
}

#[tokio::test]
async fn sliding_window_pays_back_overshoot_over_the_next_window() -> Result<()> {
	let clock = TestClock::new(0);
	let bytes_per_second = 1_000u64;
	let budget = budget_for(bytes_per_second);
	let db = database(Some(bytes_per_second), &clock).await?;
	let class = class(1.0, 0.5);

	charge(&db, ThrottleKind::Write, budget as u64).await?;

	// At the boundary the previous window carries at full weight, so nothing is admitted yet.
	clock.set(WINDOW_MS);
	db.flush_throttle().await?;
	let decision = db.check_throttle(THROTTLE, ThrottleKind::Write, class);
	assert_eq!(decision.estimate_bytes, budget);
	assert_eq!(decision.admit_probability, 0.0);

	// Halfway through, half the previous window has aged out and admission resumes.
	clock.set(WINDOW_MS + WINDOW_MS / 2);
	let decision = db.check_throttle(THROTTLE, ThrottleKind::Write, class);
	assert_eq!(decision.estimate_bytes, budget / 2);
	assert_eq!(decision.admit_probability, 1.0);

	// Nine tenths through, only a tenth remains.
	clock.set(WINDOW_MS + 9 * WINDOW_MS / 10);
	let decision = db.check_throttle(THROTTLE, ThrottleKind::Write, class);
	assert_eq!(decision.estimate_bytes, budget / 10);

	Ok(())
}

#[tokio::test]
async fn admit_probability_ramps_linearly_between_soft_mark_and_budget() {
	let budget = 1_000i64;
	let soft = 0.5;

	assert_eq!(admit_probability(0, budget, soft), 1.0);
	assert_eq!(admit_probability(500, budget, soft), 1.0);
	// Util 0.75 sits halfway between the soft mark and the budget.
	assert!((admit_probability(750, budget, soft) - 0.5).abs() < 1e-9);
	assert_eq!(admit_probability(1_000, budget, soft), 0.0);
	assert_eq!(admit_probability(5_000, budget, soft), 0.0);
	// A non-positive budget admits nothing rather than dividing by zero.
	assert_eq!(admit_probability(0, 0, soft), 0.0);
}

#[tokio::test]
async fn a_boosted_class_admits_where_the_base_class_is_denied() -> Result<()> {
	let clock = TestClock::new(0);
	let bytes_per_second = 1_000u64;
	let budget = budget_for(bytes_per_second);
	let db = database(Some(bytes_per_second), &clock).await?;
	let base = class(1.0, 0.5);
	let boosted = class(1.5, 0.9);

	// Fill the window to exactly the configured budget, the state a backlog settles into.
	charge(&db, ThrottleKind::Write, budget as u64).await?;

	let decision = db.check_throttle(THROTTLE, ThrottleKind::Write, base);
	assert_eq!(decision.budget_bytes, budget);
	assert_eq!(
		decision.admit_probability, 0.0,
		"base class stops at budget"
	);

	// The boosted class reads the same estimate against a larger denominator, so it keeps going.
	let decision = db.check_throttle(THROTTLE, ThrottleKind::Write, boosted);
	assert_eq!(
		decision.estimate_bytes, budget,
		"both classes read one shared counter"
	);
	assert_eq!(decision.budget_bytes, (budget as f64 * 1.5).round() as i64);
	assert_eq!(decision.admit_probability, 1.0);

	// It is still bounded: its own charges raise the same estimate past its own budget.
	charge(&db, ThrottleKind::Write, budget as u64).await?;
	let decision = db.check_throttle(THROTTLE, ThrottleKind::Write, boosted);
	assert_eq!(decision.admit_probability, 0.0);

	Ok(())
}

#[tokio::test]
async fn read_and_write_axes_are_separate_budgets() -> Result<()> {
	let clock = TestClock::new(0);
	let db = database(Some(1_000), &clock).await?;

	charge(&db, ThrottleKind::Read, 5_000).await?;

	assert_eq!(read_window(&db, ThrottleKind::Read, 0).await?, Some(5_000));
	assert_eq!(read_window(&db, ThrottleKind::Write, 0).await?, None);
	assert_eq!(
		db.check_throttle(THROTTLE, ThrottleKind::Write, class(1.0, 0.5))
			.estimate_bytes,
		0,
		"a read charge must not move the write estimate"
	);

	Ok(())
}

#[tokio::test]
async fn flushing_clears_stale_windows_without_a_gc() -> Result<()> {
	let clock = TestClock::new(0);
	let db = database(Some(1_000_000), &clock).await?;

	for window in 0..=3i64 {
		clock.set(window * WINDOW_MS);
		charge(&db, ThrottleKind::Write, 100).await?;
	}

	// A flush clears the windows two and three behind the current one as it ticks, so at most a few
	// windows are ever live and no separate cleanup task is needed.
	assert_eq!(read_window(&db, ThrottleKind::Write, 0).await?, None);
	assert_eq!(
		read_window(&db, ThrottleKind::Write, WINDOW_MS).await?,
		None
	);
	assert_eq!(
		read_window(&db, ThrottleKind::Write, 2 * WINDOW_MS).await?,
		Some(100)
	);
	assert_eq!(
		read_window(&db, ThrottleKind::Write, 3 * WINDOW_MS).await?,
		Some(100)
	);

	Ok(())
}

#[tokio::test]
async fn concurrent_chargers_are_conflict_free() -> Result<()> {
	let clock = TestClock::new(0);
	// A budget large enough that every charge stays below the soft mark, so admission is deterministic
	// and the test isolates the concurrency property. Under a serializable-read design these
	// transactions would conflict on the shared counter and retry, and a retry reading a higher value
	// would deny, so fewer than `concurrency` would charge.
	let db = Arc::new(database(Some(1_000_000), &clock).await?);
	let chunk = 100u64;
	let concurrency = 32usize;

	let mut handles = Vec::new();
	for _ in 0..concurrency {
		let db = db.clone();
		handles.push(tokio::spawn(async move {
			let decision = db.check_throttle(THROTTLE, ThrottleKind::Write, class(1.0, 0.5));
			if decision.allowed {
				charge(&db, ThrottleKind::Write, chunk).await?;
			}

			Ok(decision.allowed)
		}));
	}

	let mut charged_count = 0u64;
	for handle in handles {
		if handle.await?? {
			charged_count += 1;
		}
	}

	assert_eq!(charged_count, concurrency as u64);
	assert_eq!(
		read_window(&db, ThrottleKind::Write, 0).await?,
		Some(concurrency as i64 * chunk as i64),
		"every atomic add must land with no lost updates"
	);

	Ok(())
}

#[tokio::test]
async fn charges_what_the_transaction_actually_reads() -> Result<()> {
	let clock = TestClock::new(0);
	let db = database(Some(1_000_000), &clock).await?;

	// Seed rows the scan will read and then discard.
	db.txn("test_seed", |tx| async move {
		for idx in 0..64u32 {
			let mut key = b"throttle-read/".to_vec();
			key.extend_from_slice(&idx.to_be_bytes());
			tx.set(&key, &vec![7u8; 512]);
		}

		Ok(())
	})
	.await?;

	let read = db
		.txn("test_scan", |tx| async move {
			tx.charge_throttle(THROTTLE, ThrottleCharge::Read)?;
			for idx in 0..64u32 {
				let mut key = b"throttle-read/".to_vec();
				key.extend_from_slice(&idx.to_be_bytes());
				tx.informal().get(&key, Serializable).await?;
			}

			Ok(tx.read_bytes())
		})
		.await?;
	db.flush_throttle().await?;

	assert!(read > 32 * 512, "the scan must have read the seeded rows");
	assert_eq!(
		read_window(&db, ThrottleKind::Read, 0).await?,
		Some(read as i64),
		"the read axis is charged every byte the transaction read, kept or not"
	);
	assert_eq!(
		read_window(&db, ThrottleKind::Write, 0).await?,
		None,
		"a read-only opt-in must not charge the write axis"
	);

	Ok(())
}

/// The point of charging reads as they happen: a scan that is still running is already visible to the
/// gate, rather than landing only once the attempt ends. A transaction reading hundreds of megabytes is
/// exactly the one other work needs to yield to while it is in flight.
#[tokio::test]
async fn a_check_sees_reads_from_a_transaction_that_is_still_running() -> Result<()> {
	let clock = TestClock::new(0);
	let bytes_per_second = 1_000u64;
	let budget = budget_for(bytes_per_second);
	let db = database(Some(bytes_per_second), &clock).await?;

	let row = vec![4u8; 4096];
	let rows = (budget as usize / row.len()) + 2;
	let row_for_seed = row.clone();
	db.txn("test_seed", move |tx| {
		let row = row_for_seed.clone();
		async move {
			for idx in 0..rows as u32 {
				let mut key = b"throttle-inflight/".to_vec();
				key.extend_from_slice(&idx.to_be_bytes());
				tx.set(&key, &row);
			}

			Ok(())
		}
	})
	.await?;

	let denied_mid_scan = db
		.txn("test_inflight", move |tx| async move {
			tx.charge_throttle(THROTTLE, ThrottleCharge::Read)?;
			for idx in 0..rows as u32 {
				let mut key = b"throttle-inflight/".to_vec();
				key.extend_from_slice(&idx.to_be_bytes());
				tx.informal().get(&key, Serializable).await?;
			}

			// Still inside the attempt, nothing flushed, nothing committed.
			Ok(tx.check_throttle(THROTTLE, ThrottleKind::Read, class(1.0, 0.5))?)
		})
		.await?;

	assert!(
		denied_mid_scan.estimate_bytes >= budget,
		"the scan's own reads must be in the estimate before the attempt ends, got {}",
		denied_mid_scan.estimate_bytes
	);
	assert_eq!(denied_mid_scan.admit_probability, 0.0);

	Ok(())
}

/// A check sees this transaction's own charges, not just everyone else's. That is deliberate: those
/// bytes are load the database has already served, so a caller deciding whether to do more expensive
/// work should be measured against them. Excluding them would let a transaction that already spent the
/// budget carry on as though it had not.
///
/// The cost is that a gate placed after a large read is partly gating on that read. Callers put the
/// gate above the unbounded work for that reason, which also keeps a denied pass cheap.
#[tokio::test]
async fn a_check_is_gated_by_its_own_transactions_reads() -> Result<()> {
	let clock = TestClock::new(0);
	let bytes_per_second = 1_000u64;
	let budget = budget_for(bytes_per_second);
	let db = database(Some(bytes_per_second), &clock).await?;

	let row = vec![8u8; 4096];
	let rows = (budget as usize / row.len()) + 2;
	let row_for_seed = row.clone();
	db.txn("test_seed", move |tx| {
		let row = row_for_seed.clone();
		async move {
			for idx in 0..rows as u32 {
				let mut key = b"throttle-self/".to_vec();
				key.extend_from_slice(&idx.to_be_bytes());
				tx.set(&key, &row);
			}

			Ok(())
		}
	})
	.await?;

	// Nothing else has charged this axis, so any denial here is the transaction gating on itself.
	let (before, after) = db
		.txn("test_self_gate", move |tx| async move {
			tx.charge_throttle(THROTTLE, ThrottleCharge::Read)?;
			let before = tx.check_throttle(THROTTLE, ThrottleKind::Read, class(1.0, 0.5))?;
			for idx in 0..rows as u32 {
				let mut key = b"throttle-self/".to_vec();
				key.extend_from_slice(&idx.to_be_bytes());
				tx.informal().get(&key, Serializable).await?;
			}
			let after = tx.check_throttle(THROTTLE, ThrottleKind::Read, class(1.0, 0.5))?;

			Ok((before, after))
		})
		.await?;

	assert_eq!(
		before.estimate_bytes, 0,
		"a check before the transaction reads anything sees an empty window"
	);
	assert_eq!(before.admit_probability, 1.0);
	assert!(
		after.estimate_bytes >= budget,
		"the same check after the read must see the transaction's own bytes, got {}",
		after.estimate_bytes
	);
	assert_eq!(after.admit_probability, 0.0);

	Ok(())
}

/// Where the opt-in sits in the body must not change what is charged, or the call becomes load-bearing
/// in a way nothing checks.
#[tokio::test]
async fn reads_made_before_the_opt_in_are_charged_too() -> Result<()> {
	let clock = TestClock::new(0);
	let db = database(Some(1_000_000), &clock).await?;

	db.txn("test_seed", |tx| async move {
		tx.set(b"throttle-late/row", &vec![6u8; 8192]);

		Ok(())
	})
	.await?;

	let read = db
		.txn("test_late_opt_in", |tx| async move {
			// Read first, opt in afterwards.
			tx.informal()
				.get(b"throttle-late/row", Serializable)
				.await?;
			tx.charge_throttle(THROTTLE, ThrottleCharge::Read)?;
			tx.informal()
				.get(b"throttle-late/row", Serializable)
				.await?;

			Ok(tx.read_bytes())
		})
		.await?;
	db.flush_throttle().await?;

	assert_eq!(
		read_window(&db, ThrottleKind::Read, 0).await?,
		Some(read as i64),
		"both reads must be charged, not just the one after the opt-in"
	);

	Ok(())
}

#[tokio::test]
async fn a_retried_transaction_charges_every_attempts_reads_but_one_commits_writes() -> Result<()> {
	let clock = TestClock::new(0);
	let db = database(Some(1_000_000), &clock).await?;

	db.txn("test_seed", |tx| async move {
		tx.set(b"throttle-retry/row", &vec![3u8; 4096]);

		Ok(())
	})
	.await?;

	// Fail the first two attempts after they have read and written, then succeed. This is the shape of
	// an ordinary conflict: work is done, then discarded.
	let attempts = Arc::new(AtomicU64::new(0));
	let attempts_for_tx = attempts.clone();
	let read_per_attempt = Arc::new(AtomicU64::new(0));
	let read_for_tx = read_per_attempt.clone();
	db.txn("test_retry", move |tx| {
		let attempts = attempts_for_tx.clone();
		let read_per_attempt = read_for_tx.clone();
		async move {
			tx.charge_throttle(THROTTLE, ThrottleCharge::Both)?;
			attempts.fetch_add(1, Ordering::SeqCst);

			tx.informal()
				.get(b"throttle-retry/row", Serializable)
				.await?;
			tx.set(b"throttle-retry/out", &vec![1u8; 1024]);
			read_per_attempt.store(tx.read_bytes(), Ordering::SeqCst);

			// A conflict the driver retries, so the attempt's work is done and then discarded.
			Err::<(), _>(DatabaseError::NotCommitted.into())
		}
	})
	.await
	.expect_err("every attempt conflicts, so the transaction never commits");
	let attempt_count = attempts.load(Ordering::SeqCst);
	assert!(
		attempt_count > 1,
		"the driver must have retried, got {attempt_count} attempts"
	);

	db.flush_throttle().await?;

	let charged_reads = read_window(&db, ThrottleKind::Read, 0).await?.unwrap_or(0) as u64;
	let per_attempt = read_per_attempt.load(Ordering::SeqCst);
	assert_eq!(
		charged_reads,
		per_attempt * attempt_count,
		"every attempt's reads must be charged, including the ones that never committed"
	);
	assert_eq!(
		read_window(&db, ThrottleKind::Write, 0).await?,
		None,
		"a transaction that never commits must charge no writes at all"
	);

	Ok(())
}

#[tokio::test]
async fn a_committed_transaction_charges_its_writes_exactly_once() -> Result<()> {
	let clock = TestClock::new(0);
	let db = database(Some(1_000_000), &clock).await?;

	let attempts = Arc::new(AtomicU64::new(0));
	let attempts_for_tx = attempts.clone();
	let written = Arc::new(AtomicU64::new(0));
	let written_for_tx = written.clone();
	db.txn("test_commit_once", move |tx| {
		let attempts = attempts_for_tx.clone();
		let written = written_for_tx.clone();
		async move {
			tx.charge_throttle(THROTTLE, ThrottleCharge::Both)?;
			let attempt = attempts.fetch_add(1, Ordering::SeqCst);

			tx.set(b"throttle-once/out", &vec![9u8; 2048]);
			written.store(tx.write_bytes(), Ordering::SeqCst);

			if attempt < 2 {
				// A conflict the driver retries, so the write is discarded and re-issued.
				return Err(DatabaseError::NotCommitted.into());
			}

			Ok(())
		}
	})
	.await?;
	db.flush_throttle().await?;

	assert_eq!(
		attempts.load(Ordering::SeqCst),
		3,
		"the closure must have been retried before committing"
	);
	assert_eq!(
		read_window(&db, ThrottleKind::Write, 0).await?,
		Some(written.load(Ordering::SeqCst) as i64),
		"a retried write is charged once, not once per attempt"
	);

	Ok(())
}

#[tokio::test]
async fn a_dropped_attempt_still_charges_its_reads() -> Result<()> {
	let clock = TestClock::new(0);
	let db = database(Some(1_000_000), &clock).await?;

	db.txn("test_seed", |tx| async move {
		tx.set(b"throttle-dropped/row", &vec![5u8; 8192]);

		Ok(())
	})
	.await?;

	// Drop the transaction's future mid-flight, the shape of an outer timeout or a cancelled task. The
	// bytes came out of storage all the same, and a throttle that cannot see them is blind exactly when
	// a pass is timing out repeatedly.
	let read = Arc::new(AtomicU64::new(0));
	let read_for_tx = read.clone();
	let pending = db.txn("test_dropped", move |tx| {
		let read = read_for_tx.clone();
		async move {
			tx.charge_throttle(THROTTLE, ThrottleCharge::Read)?;
			tx.informal()
				.get(b"throttle-dropped/row", Serializable)
				.await?;
			read.store(tx.read_bytes(), Ordering::SeqCst);

			// Never resolves, so the future is dropped where it stands.
			std::future::pending::<()>().await;

			Ok(())
		}
	});
	let timeout = tokio::time::timeout(std::time::Duration::from_millis(250), pending).await;
	assert!(timeout.is_err(), "the transaction must not have finished");

	db.flush_throttle().await?;

	let read = read.load(Ordering::SeqCst);
	assert!(read > 0, "the attempt must have read the seeded row");
	assert_eq!(
		read_window(&db, ThrottleKind::Read, 0).await?,
		Some(read as i64),
		"a dropped attempt's reads must still be charged"
	);

	Ok(())
}

#[tokio::test]
async fn a_manual_charge_covers_what_the_operation_size_does_not() -> Result<()> {
	let clock = TestClock::new(0);
	let db = database(Some(1_000_000), &clock).await?;

	// A range clear submits two keys and removes an unbounded amount of data, so the caller reports the
	// removed volume by hand.
	db.txn("test_range_clear", |tx| async move {
		tx.charge_throttle(THROTTLE, ThrottleCharge::Write)?;
		tx.clear_range(b"throttle-range/", b"throttle-range0");
		tx.charge_throttle_bytes(ThrottleKind::Write, 1_000_000);

		Ok(())
	})
	.await?;
	db.flush_throttle().await?;

	let charged = read_window(&db, ThrottleKind::Write, 0).await?.unwrap_or(0);
	assert!(
		charged >= 1_000_000,
		"the manual charge must reach the counter, got {charged}"
	);

	Ok(())
}

#[tokio::test]
async fn a_check_sees_this_processes_unflushed_charges() -> Result<()> {
	let clock = TestClock::new(0);
	let bytes_per_second = 1_000u64;
	let budget = budget_for(bytes_per_second);
	let db = database(Some(bytes_per_second), &clock).await?;

	// Charge without flushing. A limiter that only read the shared counter would see nothing here, and
	// a whole batch of concurrent callers would pass together before any of it landed.
	db.txn("test_unflushed", move |tx| async move {
		tx.charge_throttle(THROTTLE, ThrottleCharge::Both)?;
		tx.charge_throttle_bytes(ThrottleKind::Write, budget as u64);

		Ok(())
	})
	.await?;

	assert_eq!(
		read_window(&db, ThrottleKind::Write, 0).await?,
		None,
		"nothing has been flushed yet"
	);
	let decision = db.check_throttle(THROTTLE, ThrottleKind::Write, class(1.0, 0.5));
	assert_eq!(decision.estimate_bytes, budget);
	assert_eq!(
		decision.admit_probability, 0.0,
		"local charges must gate before they are flushed"
	);

	// Flushing does not double-count them.
	db.flush_throttle().await?;
	let decision = db.check_throttle(THROTTLE, ThrottleKind::Write, class(1.0, 0.5));
	assert_eq!(decision.estimate_bytes, budget);

	Ok(())
}

#[tokio::test]
async fn a_flushed_charge_is_visible_to_another_process() -> Result<()> {
	let clock = TestClock::new(0);
	let bytes_per_second = 1_000u64;
	let budget = budget_for(bytes_per_second);
	let db = database(Some(bytes_per_second), &clock).await?;

	// A second handle on the same driver stands in for another worker: separate books, shared counters.
	let other = Database::new(db.driver_handle()).with_throttle(
		ThrottleConfig::new(Arc::new(move |_name, _kind| Some(bytes_per_second)))
			.with_window_ms(WINDOW_MS)
			.without_flusher()
			.with_clock({
				let clock = clock.clone();
				Arc::new(move || clock.0.load(Ordering::SeqCst))
			}),
	);

	charge(&db, ThrottleKind::Write, budget as u64).await?;

	// The other worker has to refresh before it can see anything; that is the flush interval's cost.
	assert_eq!(
		other
			.check_throttle(THROTTLE, ThrottleKind::Write, class(1.0, 0.5))
			.estimate_bytes,
		0
	);
	other.flush_throttle().await?;
	let decision = other.check_throttle(THROTTLE, ThrottleKind::Write, class(1.0, 0.5));
	assert_eq!(decision.estimate_bytes, budget);
	assert_eq!(decision.admit_probability, 0.0);

	Ok(())
}

#[tokio::test]
async fn charging_requires_a_managed_transaction() -> Result<()> {
	let clock = TestClock::new(0);
	let db = database(Some(1_000), &clock).await?;

	// A manually created transaction has no commit outcome, so a write charge could never be resolved.
	// Failing loudly beats charging nothing and looking like it worked.
	let tx = db.create_txn()?;
	assert!(tx.charge_throttle(THROTTLE, ThrottleCharge::Both).is_err());
	// Checking is still available: it reads process-local state and needs no transaction at all.
	assert!(
		tx.check_throttle(THROTTLE, ThrottleKind::Write, class(1.0, 0.5))?
			.allowed
	);

	Ok(())
}

#[tokio::test]
async fn opting_into_a_second_throttle_is_rejected() -> Result<()> {
	let clock = TestClock::new(0);
	let db = database(Some(1_000), &clock).await?;

	// Repeating the same opt-in is how a retried closure behaves and must be accepted; changing it
	// mid-transaction would silently misattribute the charge.
	db.txn("test_same_opt_in", |tx| async move {
		tx.charge_throttle(THROTTLE, ThrottleCharge::Both)?;
		tx.charge_throttle(THROTTLE, ThrottleCharge::Both)?;

		Ok(())
	})
	.await?;

	let result = db
		.txn("test_conflicting_opt_in", |tx| async move {
			tx.charge_throttle(THROTTLE, ThrottleCharge::Both)?;
			tx.charge_throttle("other_throttle", ThrottleCharge::Read)?;

			Ok(())
		})
		.await;

	assert!(result.is_err());

	Ok(())
}

#[tokio::test]
async fn an_untouched_axis_is_never_written() -> Result<()> {
	let clock = TestClock::new(0);
	let db = database(Some(1_000), &clock).await?;

	// A transaction that never opts in charges nothing, so the throttle costs nothing until used.
	db.txn("test_no_opt_in", |tx| async move {
		tx.set(b"throttle-untouched/row", &[1u8; 128]);

		Ok(())
	})
	.await?;
	db.flush_throttle().await?;

	assert_eq!(read_window(&db, ThrottleKind::Write, 0).await?, None);
	assert_eq!(read_window(&db, ThrottleKind::Read, 0).await?, None);

	Ok(())
}

/// Guards the counter's encoding, which the flusher writes with an atomic add and reads back as a
/// little-endian i64. A mismatch here would be silent: the add would still commit and the estimate
/// would simply be wrong.
#[tokio::test]
async fn window_counters_are_little_endian_i64_atomic_adds() -> Result<()> {
	let clock = TestClock::new(0);
	let db = database(Some(1_000_000), &clock).await?;
	let key = window_counter_key(THROTTLE, ThrottleKind::Write, window_index(0, WINDOW_MS));

	let key_for_tx = key.clone();
	db.txn("test_raw_add", move |tx| {
		let key = key_for_tx.clone();
		async move {
			tx.informal()
				.atomic_op(&key, &1_234i64.to_le_bytes(), MutationType::Add);

			Ok(())
		}
	})
	.await?;

	charge(&db, ThrottleKind::Write, 1_000).await?;

	assert_eq!(
		read_window(&db, ThrottleKind::Write, 0).await?,
		Some(2_234),
		"an external add and a flushed charge must accumulate on one counter"
	);

	Ok(())
}
