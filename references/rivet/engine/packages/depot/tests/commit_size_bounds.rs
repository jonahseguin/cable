//! The commit cap is a real FoundationDB bound, so it is measured rather than assumed.
//!
//! `MAX_COMMIT_DIRTY_PAGES` used to be a compaction artifact: 320 pages, chosen so one commit always
//! fit one compaction batch. Segmented staged commits removed that constraint, and the cap moved to
//! the only place a commit's whole page set is still touched at once, the finalize transaction. What
//! finalize writes is one PIDX row per page plus a fixed tail, so the cap is now whatever keeps that
//! transaction under FDB's 10 MB limit.
//!
//! What the limit charges is not what a commit carries. A PIDX row is a 29 byte key and an 8 byte
//! value, but each `set` also adds an implicit write conflict range and each entry costs a fixed
//! overhead of its own, which together put the real cost near 172 bytes per page. An assertion on
//! the bytes the commit submitted would therefore pass at page counts that fail in production with a
//! non-retryable `transaction_too_large`. `Transaction::approximate_size` is what the limit is
//! actually measured against, so that is what these tests assert on.
//!
//! These tests are deliberately expensive. A commit at the cap is 128 MiB of pages, and there is no
//! way to exercise a bound on a 32,768-page commit without staging 32,768 pages. They live in their
//! own binary so the rest of the suite is not slowed by them.

mod common;

use anyhow::Result;
use depot::{
	MAX_COMMIT_DIRTY_PAGES,
	constants::COMMIT_SEGMENT_MAX_SHARDS,
	error::SqliteStorageError,
	keys::{PAGE_SIZE, SHARD_SIZE},
	metrics::{COMMIT_PATH_STAGED, SQLITE_COMMIT_TRANSACTION_BYTES},
	types::DirtyPage,
};
use gas::prelude::Id;
use rivet_config::config::DEPOT_ACTOR_THROTTLE;
use rivet_metrics::prometheus::core::Collector;
use std::sync::Arc;
use universaldb::{
	ThrottleKind,
	throttle::{DEFAULT_WINDOW_MS, window_counter_key, window_index},
};

const TEST_DATABASE: &str = "commit-size-bounds";

/// Fixed wall clock so every charge lands in one throttle window.
const NOW_MS: i64 = 1_700_000_000_000;

/// Large enough that admission never gates: these tests measure charges, they do not test the gate.
const BYTES_PER_SECOND: u64 = 1024 * 1024 * 1024 * 1024;

/// FDB's hard transaction size limit, which the finalize transaction has to stay under.
const FDB_TRANSACTION_LIMIT_BYTES: i64 = 10 * 1024 * 1024;

/// Pages one staged segment carries when a commit is cut densely, which is the shape that produces
/// the most PIDX rows per segment and therefore the largest finalize transaction.
const PAGES_PER_SEGMENT: u32 = SHARD_SIZE * COMMIT_SEGMENT_MAX_SHARDS;

fn test_bucket() -> Id {
	Id::v1(uuid::Uuid::from_u128(0xb0_u128), 1)
}

/// Pseudo-random page bytes from a cheap xorshift, so pages are incompressible without pulling in a
/// generator and without a fixed seed table.
fn incompressible_page(pgno: u32) -> DirtyPage {
	let mut state = u64::from(pgno).wrapping_mul(0x9e37_79b9_7f4a_7c15) | 1;
	let mut bytes = Vec::with_capacity(PAGE_SIZE as usize);
	while bytes.len() < PAGE_SIZE as usize {
		state ^= state << 13;
		state ^= state >> 7;
		state ^= state << 17;
		bytes.extend_from_slice(&state.to_le_bytes());
	}
	bytes.truncate(PAGE_SIZE as usize);

	DirtyPage { pgno, bytes }
}

async fn charged_window_bytes(udb: &universaldb::Database, kind: ThrottleKind) -> Result<i64> {
	let raw = common::read_value(
		udb,
		window_counter_key(
			DEPOT_ACTOR_THROTTLE,
			kind,
			window_index(NOW_MS, DEFAULT_WINDOW_MS),
		),
	)
	.await?;

	Ok(raw.map_or(0, |bytes| {
		i64::from_le_bytes(bytes.as_slice().try_into().expect("counter is 8 bytes"))
	}))
}

/// Total transaction bytes recorded for commits published on `path`, summed across nodes so the test
/// does not have to know the node id the database was built with.
///
/// Read from the metric rather than returned by `commit_finalize` so this asserts on the same number
/// production reports, not on a parallel one that could drift from it.
fn published_commit_transaction_bytes(path: &str) -> i64 {
	SQLITE_COMMIT_TRANSACTION_BYTES
		.collect()
		.iter()
		.flat_map(|family| family.get_metric())
		.filter(|metric| {
			metric
				.get_label()
				.iter()
				.any(|label| label.name() == "path" && label.value() == path)
		})
		.map(|metric| metric.get_histogram().get_sample_sum() as i64)
		.sum()
}

/// Stages `pages` dirty pages as dense, shard-aligned segments starting at page 1, returning the
/// `first_pgno` of each segment in the order finalize expects them.
async fn stage_dense_commit(
	database_db: &depot::conveyer::Db,
	txid: u64,
	pages: u32,
) -> Result<Vec<u32>> {
	let mut first_pgnos = Vec::new();
	let mut pgno = 1;
	while pgno <= pages {
		let first_pgno = pgno / PAGES_PER_SEGMENT * PAGES_PER_SEGMENT;
		let segment_end = (first_pgno + PAGES_PER_SEGMENT).min(pages + 1);
		let segment = (pgno..segment_end).map(incompressible_page).collect();
		database_db
			.commit_stage_segment(0, txid, first_pgno, segment)
			.await?;
		first_pgnos.push(first_pgno);
		pgno = segment_end;
	}

	Ok(first_pgnos)
}

/// A commit at the cap publishes, and the transaction that publishes it stays under the limit.
///
/// The transaction size comes from the database rather than from the page count, because deriving it
/// would only restate the arithmetic the cap was chosen with and would miss the commit row, VTX,
/// quota, and head writes finalize also makes.
///
/// The read figure is checked separately and is the interesting one: it is the stage row and a
/// handful of metadata point reads, not the 128 MiB of pages the commit carries.
#[tokio::test]
async fn a_commit_at_the_cap_publishes_and_finalizes_under_the_fdb_limit() -> Result<()> {
	let udb = Arc::new(
		common::test_db_with_throttle("depot-commit-at-cap", BYTES_PER_SECOND, NOW_MS).await?,
	);
	let database_db = common::make_db(udb.clone(), test_bucket(), TEST_DATABASE);
	let pages = u32::try_from(MAX_COMMIT_DIRTY_PAGES).unwrap();

	let txid = database_db.commit_stage_begin(0, Some(0)).await?;
	let first_pgnos = stage_dense_commit(&database_db, txid, pages).await?;

	udb.flush_throttle().await?;
	let write_before_finalize = charged_window_bytes(&udb, ThrottleKind::Write).await?;
	let read_before_finalize = charged_window_bytes(&udb, ThrottleKind::Read).await?;

	let result = database_db
		.commit_finalize(0, txid, pages, NOW_MS, first_pgnos)
		.await?;
	assert_eq!(result.head_txid, txid);

	udb.flush_throttle().await?;
	let finalize_write_bytes =
		charged_window_bytes(&udb, ThrottleKind::Write).await? - write_before_finalize;
	let finalize_read_bytes =
		charged_window_bytes(&udb, ThrottleKind::Read).await? - read_before_finalize;
	tracing::info!(
		pages,
		finalize_write_bytes,
		finalize_read_bytes,
		"measured the finalize transaction at the commit cap"
	);
	assert!(
		finalize_write_bytes > 0,
		"finalize must charge for the PIDX rows it writes"
	);
	// What the transaction limit is actually measured against, which is several times the keys and
	// values the commit submitted: every PIDX `set` also carries a write conflict range, and every
	// entry a fixed per-entry cost.
	let finalize_transaction_bytes = published_commit_transaction_bytes(COMMIT_PATH_STAGED);
	assert!(
		finalize_transaction_bytes > finalize_write_bytes,
		"the transaction size must exceed the {finalize_write_bytes} bytes of keys and values the \
		 commit submitted, or it is not measuring what the limit charges"
	);
	assert!(
		finalize_transaction_bytes < FDB_TRANSACTION_LIMIT_BYTES,
		"a commit at the cap must finalize inside one transaction, measured at \
		 {finalize_transaction_bytes} bytes against a {FDB_TRANSACTION_LIMIT_BYTES} byte limit"
	);

	// Finalize must not have read the staged payload back. That is the property that keeps the
	// transaction's size independent of the commit's, and 256 MiB of segment blobs would sail past
	// the limit the assertion above checks.
	assert!(
		finalize_read_bytes < FDB_TRANSACTION_LIMIT_BYTES,
		"finalize read {finalize_read_bytes} bytes, which is the staged payload, not bookkeeping"
	);

	// Spot-check both ends and a segment boundary rather than all 65,536 pages, since the point here
	// is that the commit published intact, not that page reads work.
	assert_eq!(
		database_db
			.get_pages(vec![1, PAGES_PER_SEGMENT, PAGES_PER_SEGMENT + 1, pages])
			.await?
			.into_iter()
			.map(|page| page.bytes)
			.collect::<Vec<_>>(),
		vec![1, PAGES_PER_SEGMENT, PAGES_PER_SEGMENT + 1, pages]
			.into_iter()
			.map(|pgno| Some(incompressible_page(pgno).bytes))
			.collect::<Vec<_>>()
	);

	Ok(())
}

/// One page past the cap is refused, and refused while it is being staged rather than at finalize.
///
/// Staging is where it has to happen. By finalize the whole payload has been written and charged
/// against the branch quota, so a commit rejected there would have already cost its full storage.
#[tokio::test]
async fn a_commit_past_the_cap_is_refused_while_it_stages() -> Result<()> {
	let udb = common::test_db_arc("depot-commit-past-cap").await?;
	let database_db = common::make_db(udb.clone(), test_bucket(), TEST_DATABASE);
	let pages = u32::try_from(MAX_COMMIT_DIRTY_PAGES).unwrap() + 1;

	let txid = database_db.commit_stage_begin(0, Some(0)).await?;
	let err = stage_dense_commit(&database_db, txid, pages)
		.await
		.expect_err("a commit past the cap must be refused");
	assert_eq!(
		err.downcast_ref::<SqliteStorageError>(),
		Some(&SqliteStorageError::CommitTooLarge {
			actual_size_bytes: u64::from(pages) * u64::from(PAGE_SIZE),
			max_size_bytes: MAX_COMMIT_DIRTY_PAGES as u64 * u64::from(PAGE_SIZE),
		})
	);

	Ok(())
}
