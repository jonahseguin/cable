//! Inline tests for the DELTA chunk encoding. These live inline because `delta_blob` is
//! crate-private.

use std::collections::BTreeSet;

use uuid::Uuid;

use super::*;
use crate::conveyer::{constants::COMMIT_SEGMENT_MAX_SHARDS, keys};

fn branch() -> DatabaseBranchId {
	DatabaseBranchId::from_uuid(Uuid::from_u128(0x0011_2233_4455_6677_8899_aabb_ccdd_ee07))
}

/// A blob must survive the round trip through the rows that store it, including a blob large enough
/// to span several chunks. This is the property every reader depends on.
#[test]
fn splits_and_reassembles_round_trip() {
	let branch_id = branch();
	for len in [
		1,
		CHUNK_SIZE - 1,
		CHUNK_SIZE,
		CHUNK_SIZE + 1,
		CHUNK_SIZE * 3 + 17,
	] {
		let blob = (0..len).map(|i| (i % 251) as u8).collect::<Vec<u8>>();
		let rows = split_delta_chunks(branch_id, 42, &blob).expect("split");
		assert_eq!(
			rows.len(),
			len.div_ceil(CHUNK_SIZE),
			"chunk count for {len}"
		);
		let segments = reassemble_delta_segments(branch_id, 42, rows).expect("reassemble");
		assert_eq!(segments.len(), 1, "legacy rows are one blob for {len}");
		assert_eq!(
			segments[0].first_pgno, None,
			"legacy blob has no segment identity"
		);
		assert_eq!(segments[0].blob, blob, "round trip for {len}");
	}
}

/// Rows arrive in key order from a forward scan and in reverse from the descending history walk, so
/// reassembly must not depend on the order it is handed.
#[test]
fn reassembles_regardless_of_row_order() {
	let branch_id = branch();
	let blob = (0..CHUNK_SIZE * 3)
		.map(|i| (i % 97) as u8)
		.collect::<Vec<u8>>();
	let rows = split_delta_chunks(branch_id, 9, &blob).expect("split");

	let mut reversed = rows.clone();
	reversed.reverse();

	let segments = reassemble_delta_segments(branch_id, 9, reversed).expect("reassemble");
	assert_eq!(segments.len(), 1);
	assert_eq!(segments[0].blob, blob);
}

/// A torn delta must fail rather than return a short blob. A prefix of an LTX file decodes as a
/// valid file that is silently missing pages, so returning it would serve stale content instead of
/// surfacing the gap.
#[test]
fn rejects_a_gap_in_the_chunk_index() {
	let branch_id = branch();
	let blob = (0..CHUNK_SIZE * 3)
		.map(|i| (i % 89) as u8)
		.collect::<Vec<u8>>();
	let mut rows = split_delta_chunks(branch_id, 5, &blob).expect("split");
	rows.remove(1);

	let err = reassemble_delta_segments(branch_id, 5, rows).expect_err("gap must be rejected");
	// The phrase is asserted verbatim by `conveyer_read::missing_delta_chunks_fail_loudly`, which
	// reaches this error through the whole read path.
	assert!(
		err.to_string()
			.contains("sqlite delta chunks must be contiguous"),
		"unexpected error: {err}"
	);
}

/// A row set that starts above chunk zero is the same tear seen from the other side: the walk lost
/// the head of the blob rather than its tail.
#[test]
fn rejects_a_missing_first_chunk() {
	let branch_id = branch();
	let blob = (0..CHUNK_SIZE * 2)
		.map(|i| (i % 83) as u8)
		.collect::<Vec<u8>>();
	let mut rows = split_delta_chunks(branch_id, 5, &blob).expect("split");
	rows.remove(0);

	assert!(reassemble_delta_segments(branch_id, 5, rows).is_err());
}

/// No rows is an ordinary miss (the txid's delta was reclaimed), not a tear, so the caller gets
/// `None` and falls through to its next source rather than failing the read.
#[test]
fn no_rows_is_a_miss_not_an_error() {
	assert!(
		reassemble_delta_segments(branch(), 1, Vec::new())
			.expect("empty is not an error")
			.is_empty()
	);
}

/// Compaction scans a window spanning many txids at once, so grouping must split them apart and
/// leave each blob independently reassembled.
#[test]
fn groups_mixed_rows_by_txid() {
	let branch_id = branch();
	let first = vec![1_u8; CHUNK_SIZE + 5];
	let second = vec![2_u8; 32];

	let mut rows = split_delta_chunks(branch_id, 100, &first).expect("split");
	rows.extend(split_delta_chunks(branch_id, 101, &second).expect("split"));

	let by_txid = reassemble_delta_segments_by_txid(branch_id, &rows).expect("group");
	assert_eq!(by_txid.len(), 2);
	assert_eq!(by_txid[&100][0].blob, first);
	assert_eq!(by_txid[&101][0].blob, second);
}

/// An empty blob has no valid row encoding, so the writer must reject it rather than persist a txid
/// whose delta reassembles to nothing.
#[test]
fn rejects_an_empty_blob() {
	assert!(split_delta_chunks(branch(), 1, &[]).is_err());
}

/// A segmented commit reassembles into one blob per page range, ascending, each independently
/// decodable and carrying its own key.
#[test]
fn reassembles_segmented_rows_in_page_order() {
	let branch_id = branch();
	let low = vec![1_u8; CHUNK_SIZE + 3];
	let high = vec![2_u8; 40];

	// Interleaved and out of order, as a reverse scan would deliver them.
	let mut rows = split_delta_segment_chunks(branch_id, 77, 640, &high).expect("split high");
	rows.extend(split_delta_segment_chunks(branch_id, 77, 0, &low).expect("split low"));
	rows.reverse();

	let segments = reassemble_delta_segments(branch_id, 77, rows).expect("reassemble");
	assert_eq!(segments.len(), 2);
	assert_eq!(segments[0].first_pgno, Some(0));
	assert_eq!(segments[0].blob, low);
	assert_eq!(segments[1].first_pgno, Some(640));
	assert_eq!(segments[1].blob, high);
	assert_ne!(
		segments[0].key, segments[1].key,
		"segments need distinct identities"
	);
}

/// A txid is written in one layout or the other. Rows of both under one txid cannot be reconciled
/// (the legacy blob claims every page the segments also claim), so it is corruption, not a merge.
#[test]
fn rejects_a_txid_mixing_both_layouts() {
	let branch_id = branch();
	let mut rows = split_delta_chunks(branch_id, 3, &[9_u8; 16]).expect("split legacy");
	rows.extend(split_delta_segment_chunks(branch_id, 3, 64, &[8_u8; 16]).expect("split segment"));

	let err =
		reassemble_delta_segments(branch_id, 3, rows).expect_err("mixed layout is corruption");
	assert!(
		err.to_string().contains("mixes legacy and segmented"),
		"unexpected error: {err}"
	);
}

/// Page lookup picks the last segment starting at or below the page. Segments are disjoint, so that
/// is the only one that can hold it; a page below every segment resolves to nothing.
#[test]
fn segment_for_page_picks_the_covering_segment() {
	let branch_id = branch();
	let mut rows = split_delta_segment_chunks(branch_id, 5, 64, &[1_u8; 8]).expect("split");
	rows.extend(split_delta_segment_chunks(branch_id, 5, 320, &[2_u8; 8]).expect("split"));
	let segments = reassemble_delta_segments(branch_id, 5, rows).expect("reassemble");

	assert_eq!(segment_for_page(&segments, 63), None, "below every segment");
	assert_eq!(
		segment_for_page(&segments, 64).unwrap().first_pgno,
		Some(64)
	);
	assert_eq!(
		segment_for_page(&segments, 319).unwrap().first_pgno,
		Some(64)
	);
	assert_eq!(
		segment_for_page(&segments, 320).unwrap().first_pgno,
		Some(320)
	);
	assert_eq!(
		segment_for_page(&segments, 999_999).unwrap().first_pgno,
		Some(320)
	);
}

/// A legacy blob covers everything its commit wrote, so every page resolves to it.
#[test]
fn segment_for_page_always_matches_a_legacy_blob() {
	let branch_id = branch();
	let rows = split_delta_chunks(branch_id, 5, &[7_u8; 8]).expect("split");
	let segments = reassemble_delta_segments(branch_id, 5, rows).expect("reassemble");

	assert_eq!(segment_for_page(&segments, 1).unwrap().first_pgno, None);
	assert_eq!(
		segment_for_page(&segments, u32::MAX).unwrap().first_pgno,
		None
	);
}

fn page(pgno: u32) -> DirtyPage {
	DirtyPage {
		pgno,
		bytes: vec![0; 8],
	}
}

/// The load-bearing invariant: no shard's pages may span two segments. Compaction folds a segment
/// into a shard image, so a split shard could be folded from one segment and written as an image
/// missing the other's newer pages.
#[test]
fn cuts_only_on_shard_boundaries() {
	let shard = keys::SHARD_SIZE;
	// A dense run wide enough to force several cuts, plus a sparse tail far away.
	let mut pages = (1..=shard * COMMIT_SEGMENT_MAX_SHARDS * 2 + 5)
		.map(page)
		.collect::<Vec<_>>();
	pages.push(page(shard * 40 + 3));
	pages.push(page(shard * 40 + 7));

	let segments = cut_page_segments(&pages);
	assert!(segments.len() > 2, "expected several segments");

	let mut seen_shards = BTreeSet::new();
	let mut last_end_shard = None;
	for segment in &segments {
		let first_shard = segment[0].pgno / shard;
		let last_shard = segment[segment.len() - 1].pgno / shard;
		assert!(
			last_shard - first_shard < COMMIT_SEGMENT_MAX_SHARDS,
			"segment spans too many shards"
		);
		for p in *segment {
			// A shard appearing in two segments is exactly the split this invariant forbids.
			assert!(
				seen_shards.insert(p.pgno / shard) || Some(p.pgno / shard) == last_end_shard,
				"shard {} appears in more than one segment",
				p.pgno / shard
			);
			last_end_shard = Some(p.pgno / shard);
		}
	}
}

/// Every page must land in exactly one segment, in order. A dropped or duplicated page is a lost or
/// double-applied write.
#[test]
fn cut_segments_partition_the_pages() {
	let shard = keys::SHARD_SIZE;
	let pages = [
		1,
		2,
		shard,
		shard * 3,
		shard * 6,
		shard * 6 + 1,
		shard * 100,
	]
	.into_iter()
	.map(page)
	.collect::<Vec<_>>();

	let segments = cut_page_segments(&pages);
	let rejoined = segments
		.iter()
		.flat_map(|segment| segment.iter().map(|p| p.pgno))
		.collect::<Vec<_>>();

	assert_eq!(rejoined, pages.iter().map(|p| p.pgno).collect::<Vec<_>>());
}

/// Segment keys come from the shard boundary, not from whichever page happens to be dirty, so two
/// commits touching different pages of the same shard run agree on the key.
#[test]
fn segment_key_is_the_shard_boundary() {
	let shard = keys::SHARD_SIZE;
	assert_eq!(segment_first_pgno(&[page(shard + 5)]).unwrap(), shard);
	assert_eq!(segment_first_pgno(&[page(shard)]).unwrap(), shard);
	assert_eq!(segment_first_pgno(&[page(1)]).unwrap(), 0);
	assert!(segment_first_pgno(&[]).is_err());
}

/// A commit small enough to fit one segment must produce exactly one, so the common case keeps the
/// single-blob shape it had before segmentation.
#[test]
fn a_small_commit_is_one_segment() {
	let pages = (1..=10).map(page).collect::<Vec<_>>();
	assert_eq!(cut_page_segments(&pages).len(), 1);
}

/// Pages at the very top of the page space must still cut, rather than wrapping into an empty
/// segment and looping.
#[test]
fn cuts_pages_at_the_top_of_the_page_space() {
	let pages = [u32::MAX - 1, u32::MAX]
		.into_iter()
		.map(page)
		.collect::<Vec<_>>();

	let segments = cut_page_segments(&pages);
	assert_eq!(segments.len(), 1);
	assert_eq!(segments[0].len(), 2);
}
