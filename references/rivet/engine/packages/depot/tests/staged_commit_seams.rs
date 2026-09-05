//! Seams where the staged commit path has to behave exactly like the single-shot one.
//!
//! A staged commit writes its pages across many transactions and publishes them in one small
//! finalize. Everything downstream of a commit therefore has two producers to keep in step, and each
//! test here pins one place where they diverged and served stale or undecodable bytes without
//! failing anything.

mod common;

use anyhow::{Context, Result};
use depot::{
	constants::COMMIT_SEGMENT_MAX_SHARDS,
	keys::{PAGE_SIZE, SHARD_SIZE},
	types::{DepotReadMode, DirtyPage, GetPagesOptions},
};
use gas::prelude::Id;
use std::sync::Arc;

const TEST_DATABASE: &str = "staged-commit-seams";

/// Pages one dense staged segment carries.
const PAGES_PER_SEGMENT: u32 = SHARD_SIZE * COMMIT_SEGMENT_MAX_SHARDS;

fn test_bucket() -> Id {
	Id::v1(uuid::Uuid::from_u128(0xb1_u128), 1)
}

fn page(pgno: u32, fill: u8) -> DirtyPage {
	DirtyPage {
		pgno,
		bytes: vec![fill; PAGE_SIZE as usize],
	}
}

async fn read_page(db: &depot::conveyer::Db, pgno: u32) -> Result<Vec<u8>> {
	let fetched = db
		.get_pages(vec![pgno])
		.await?
		.into_iter()
		.find(|fetched| fetched.pgno == pgno)
		.with_context(|| format!("page {pgno} was not returned"))?;

	fetched
		.bytes
		.with_context(|| format!("page {pgno} came back with no bytes"))
}

/// Reads a page as of `txid`, which is what forces the descending history walk: the current version
/// is capped away and the page has to be resolved from an older commit's delta.
async fn read_page_at(db: &depot::conveyer::Db, txid: u64, pgno: u32) -> Result<Vec<u8>> {
	let fetched = db
		.get_pages_with_options(
			vec![pgno],
			GetPagesOptions {
				mode: DepotReadMode::DiagnosticNoSideEffects,
				diagnostic_max_txid: Some(txid),
				..Default::default()
			},
		)
		.await?
		.pages
		.into_iter()
		.find(|fetched| fetched.pgno == pgno)
		.with_context(|| format!("page {pgno} was not returned at txid {txid}"))?;

	fetched
		.bytes
		.with_context(|| format!("page {pgno} came back with no bytes at txid {txid}"))
}

/// Stages a commit spanning two segments and finalizes it, returning the pages it wrote.
///
/// Two segments rather than one is the point: a single-segment commit is indistinguishable from the
/// legacy layout on every path that reassembles blobs.
async fn commit_staged_two_segments(
	db: &depot::conveyer::Db,
	expected_head_txid: u64,
	db_size_pages: u32,
	fill: u8,
	now_ms: i64,
) -> Result<Vec<u32>> {
	let txid = db
		.commit_stage_begin(0, Some(expected_head_txid))
		.await
		.context("begin staged commit")?;

	// One page in the first shard-aligned span and one in the next, so the commit is cut into two
	// segments whose chunk indexes both restart at zero.
	let first_pgnos = vec![0, PAGES_PER_SEGMENT];
	let low_pgno = 1;
	let high_pgno = PAGES_PER_SEGMENT + 1;

	db.commit_stage_segment(0, txid, first_pgnos[0], vec![page(low_pgno, fill)])
		.await
		.context("stage first segment")?;
	db.commit_stage_segment(0, txid, first_pgnos[1], vec![page(high_pgno, fill)])
		.await
		.context("stage second segment")?;
	db.commit_finalize(0, txid, db_size_pages, now_ms, first_pgnos)
		.await
		.context("finalize staged commit")?;

	Ok(vec![low_pgno, high_pgno])
}

/// A page written by a staged commit is not served stale after a later single-shot commit.
///
/// The in-process page index is only valid at one head. Finalize used to advance the head without
/// touching it, so the next single-shot commit adopted an index built before the staged commit and
/// stamped it with its own txid. The index then looked current at the new head while still pointing
/// every staged page at its pre-stage owner, and reads trusted it. Nothing failed; the read simply
/// returned the old bytes.
#[tokio::test]
async fn a_staged_commit_is_not_hidden_by_the_next_single_shot_commit() -> Result<()> {
	let udb = Arc::new(common::test_db("depot-staged-cache-seam").await?);
	let db = common::make_db(udb.clone(), test_bucket(), TEST_DATABASE);

	let db_size_pages = PAGES_PER_SEGMENT + 2;
	db.commit(
		vec![page(1, 0x11), page(PAGES_PER_SEGMENT + 1, 0x11)],
		db_size_pages,
		1_000,
	)
	.await?;

	// Warm the index by reading the pages the staged commit will overwrite. Without a warm index
	// there is nothing stale to carry forward and the seam does not exist.
	assert_eq!(read_page(&db, 1).await?[0], 0x11);
	assert_eq!(read_page(&db, PAGES_PER_SEGMENT + 1).await?[0], 0x11);

	let staged_pgnos = commit_staged_two_segments(&db, 1, db_size_pages, 0x22, 1_001).await?;

	// A later commit that touches neither staged page. This is what used to re-stamp the stale
	// index as current.
	db.commit(vec![page(2, 0x33)], db_size_pages, 1_002).await?;

	for pgno in staged_pgnos {
		assert_eq!(
			read_page(&db, pgno).await?[0],
			0x22,
			"page {pgno} was served from before the staged commit"
		);
	}

	Ok(())
}

/// A page from a segmented commit resolves through the descending history walk.
///
/// The walk gathers a txid's rows and used to sort them by chunk index and concatenate. Every
/// segment restarts its chunk index at zero, so a multi-segment commit produced interleaved bytes:
/// the decode either failed the read outright or reported the page absent and fell through to an
/// older version of it.
///
/// The walk is what resolves a page whose index entry has been superseded, so the read here is taken
/// at the staged commit's own txid, after later commits have moved the current version on.
#[tokio::test]
async fn a_segmented_commit_resolves_through_the_history_walk() -> Result<()> {
	let udb = Arc::new(common::test_db("depot-staged-history-walk").await?);
	let db = common::make_db(udb.clone(), test_bucket(), TEST_DATABASE);

	let db_size_pages = PAGES_PER_SEGMENT + 2;
	db.commit(
		vec![page(1, 0x11), page(PAGES_PER_SEGMENT + 1, 0x11)],
		db_size_pages,
		1_000,
	)
	.await?;

	let staged_txid = 2;
	let staged_pgnos = commit_staged_two_segments(&db, 1, db_size_pages, 0x22, 1_001).await?;

	// Move both pages on again, so resolving the staged version requires walking back past this.
	db.commit(
		vec![page(1, 0x44), page(PAGES_PER_SEGMENT + 1, 0x44)],
		db_size_pages,
		1_002,
	)
	.await?;

	for pgno in staged_pgnos {
		assert_eq!(
			read_page_at(&db, staged_txid, pgno).await?[0],
			0x22,
			"page {pgno} did not resolve to the segmented commit that wrote it"
		);
	}

	Ok(())
}
