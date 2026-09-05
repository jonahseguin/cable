//! Chunked storage for `DELTA` blobs.
//!
//! A commit's LTX delta is stored as ordered `CHUNK_SIZE` chunk rows under `DELTA/{txid}/{chunk_idx}`
//! and reassembled on read, so no single FDB value approaches the 100 KB per-value cap. This module
//! owns that encoding: how a blob splits into rows, how rows reassemble into a blob, and what makes a
//! row set well formed. Callers address a delta by `(branch_id, txid)` and never build or parse a
//! chunk key themselves.
//!
//! Holding the format in one place is what keeps a second delta layout tractable. `shard_blob` is the
//! worked example on the SHARD side, where a legacy bare-key row and a chunked row coexist behind one
//! module rather than a discriminator repeated at every call site.

use std::collections::BTreeMap;

use anyhow::{Context, Result, ensure};
use universaldb::utils::CHUNK_SIZE;

use super::{
	keys,
	types::{DatabaseBranchId, DirtyPage},
};

/// Splits a blob into pre-segmentation chunk rows, in ascending chunk order.
///
/// Nothing writes this layout any more: a commit stores its pages as one blob per shard-aligned page
/// range. It survives so tests can author rows in the old shape and prove readers still serve the
/// commits already on disk in it.
#[cfg(test)]
pub(crate) fn split_delta_chunks(
	branch_id: DatabaseBranchId,
	txid: u64,
	blob: &[u8],
) -> Result<Vec<(Vec<u8>, Vec<u8>)>> {
	ensure!(!blob.is_empty(), "sqlite delta blob must not be empty");
	blob.chunks(CHUNK_SIZE)
		.enumerate()
		.map(|(chunk_idx, chunk)| {
			let chunk_idx = u32::try_from(chunk_idx).context("delta chunk index exceeded u32")?;
			Ok((
				keys::branch_delta_chunk_key(branch_id, txid, chunk_idx),
				chunk.to_vec(),
			))
		})
		.collect()
}

/// Cuts a commit's dirty pages into the shard-aligned runs that become its segments.
///
/// `pages` must be sorted ascending by page number and free of duplicates, which the commit path
/// already guarantees. Each returned run starts on a `SHARD_SIZE` boundary and spans at most
/// `COMMIT_SEGMENT_MAX_SHARDS` shards, so no shard's pages are ever split across two segments. That
/// is what lets compaction fold any prefix of a commit's segments and write complete shard images
/// from each.
///
/// Cutting is by shard span, not by page count, so a sparse commit produces sparse segments rather
/// than being packed into fewer, wider ones. Packing would be cheaper to store and wrong: it would
/// place two distant shards in one blob, so folding either would have to read both.
/// Delegates to `depot_client_types::cut_page_segments` so the writer here and the client staging a
/// large commit cut on identical boundaries.
pub(crate) fn cut_page_segments(pages: &[DirtyPage]) -> Vec<&[DirtyPage]> {
	depot_client_types::cut_page_segments(pages, |page| page.pgno)
		.into_iter()
		.map(|(_, segment)| segment)
		.collect()
}

/// The page number a segment is keyed by: the start of the shard holding its first page.
///
/// Keying by the shard boundary rather than by the first page present makes the key a property of
/// the page range the segment owns, not of which pages inside it happen to be dirty. Two commits
/// dirtying different pages of the same shard run therefore agree on the key.
pub(crate) fn segment_first_pgno(pages: &[DirtyPage]) -> Result<u32> {
	let first = pages.first().context("delta segment must not be empty")?;

	Ok(first.pgno - first.pgno % keys::SHARD_SIZE)
}

/// Splits one segment's blob into the chunk rows that store it.
///
/// `first_pgno` must be the lowest page the segment carries, and segments of a commit must be
/// disjoint and shard-aligned: the read path locates a page by taking the last segment starting at
/// or below it, which is only correct when no two segments can hold the same page.
pub(crate) fn split_delta_segment_chunks(
	branch_id: DatabaseBranchId,
	txid: u64,
	first_pgno: u32,
	blob: &[u8],
) -> Result<Vec<(Vec<u8>, Vec<u8>)>> {
	ensure!(
		!blob.is_empty(),
		"sqlite delta segment blob must not be empty"
	);
	blob.chunks(CHUNK_SIZE)
		.enumerate()
		.map(|(chunk_idx, chunk)| {
			let chunk_idx = u32::try_from(chunk_idx).context("delta chunk index exceeded u32")?;
			Ok((
				keys::branch_delta_segment_chunk_key(branch_id, txid, first_pgno, chunk_idx),
				chunk.to_vec(),
			))
		})
		.collect()
}

/// One delta blob of a commit, with the key identifying it among its siblings.
///
/// A pre-segmentation commit yields exactly one of these covering every page it wrote; a segmented
/// commit yields one per shard-aligned page range. Readers treat the two identically: each is a
/// complete, independently decodable LTX blob, and `key` is the stable identity a caller can use to
/// dedup loads or cache decoded content.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct DeltaSegment {
	/// First page the segment covers, or `None` for a legacy blob spanning the whole commit.
	pub(crate) first_pgno: Option<u32>,
	pub(crate) key: Vec<u8>,
	pub(crate) blob: Vec<u8>,
}

/// Reassembles one txid's chunk rows into its delta blobs, ascending by page range.
///
/// `rows` may arrive in any order and is sorted here, so callers that scanned in reverse (the read
/// path's descending history walk) do not have to re-sort. Within each blob the chunk index must run
/// contiguously from zero: a gap means the blob is torn, and serving a short blob from it would
/// decode as a valid LTX file that is silently missing pages, so this fails instead. An empty result
/// means the txid has no rows at all, which is an ordinary miss rather than an error.
///
/// A txid is written in one layout or the other, never both, so a mix of legacy and segmented rows
/// under one txid is corruption and is rejected rather than merged.
pub(crate) fn reassemble_delta_segments(
	branch_id: DatabaseBranchId,
	txid: u64,
	rows: impl IntoIterator<Item = (Vec<u8>, Vec<u8>)>,
) -> Result<Vec<DeltaSegment>> {
	let mut by_segment = BTreeMap::<Option<u32>, BTreeMap<u32, Vec<u8>>>::new();
	for (key, value) in rows {
		let chunk_ref = keys::decode_branch_delta_chunk_ref(branch_id, txid, &key)?;
		ensure!(
			by_segment
				.entry(chunk_ref.first_pgno())
				.or_default()
				.insert(chunk_ref.chunk_idx(), value)
				.is_none(),
			"sqlite delta {txid} repeated chunk {}",
			chunk_ref.chunk_idx()
		);
	}
	ensure!(
		by_segment.len() <= 1 || !by_segment.contains_key(&None),
		"sqlite delta {txid} mixes legacy and segmented chunk rows"
	);

	by_segment
		.into_iter()
		.map(|(first_pgno, chunks)| {
			let mut blob = Vec::new();
			for (expected_idx, (chunk_idx, value)) in chunks.into_iter().enumerate() {
				let expected_idx =
					u32::try_from(expected_idx).context("delta chunk index exceeded u32")?;
				ensure!(
					chunk_idx == expected_idx,
					"sqlite delta chunks must be contiguous from chunk 0 (txid {txid}, segment {first_pgno:?}, found chunk {chunk_idx} at position {expected_idx})"
				);
				blob.extend_from_slice(&value);
			}

			Ok(DeltaSegment {
				first_pgno,
				key: match first_pgno {
					Some(first_pgno) => {
						keys::branch_delta_segment_prefix(branch_id, txid, first_pgno)
					}
					None => keys::branch_delta_chunk_prefix(branch_id, txid),
				},
				blob,
			})
		})
		.collect()
}

/// The segment of `segments` that can hold `pgno`, or `None` when no segment covers it.
///
/// Segments are ascending and disjoint, so the last one starting at or below `pgno` is the only
/// candidate. A legacy blob covers the whole commit and therefore always matches. Returning a
/// candidate is not a promise the page is present: a sparse commit leaves gaps inside a segment's
/// range, and the caller still has to ask the decoded blob.
pub(crate) fn segment_for_page(segments: &[DeltaSegment], pgno: u32) -> Option<&DeltaSegment> {
	segment_index_for_page(segments, pgno).map(|idx| &segments[idx])
}

/// Position of the segment that can hold `pgno`, for callers that need to group pages by segment
/// before decoding. Same rule as `segment_for_page`.
pub(crate) fn segment_index_for_page(segments: &[DeltaSegment], pgno: u32) -> Option<usize> {
	segments
		.iter()
		.rposition(|segment| segment.first_pgno.is_none_or(|first| first <= pgno))
}

/// Groups mixed chunk rows spanning several txids into that txid's blobs.
///
/// Compaction scans a whole window of DELTA rows at once, so it holds rows for many txids and needs
/// them split before any can decode.
pub(crate) fn reassemble_delta_segments_by_txid(
	branch_id: DatabaseBranchId,
	rows: &[(Vec<u8>, Vec<u8>)],
) -> Result<BTreeMap<u64, Vec<DeltaSegment>>> {
	let mut rows_by_txid = BTreeMap::<u64, Vec<(Vec<u8>, Vec<u8>)>>::new();
	for (key, value) in rows {
		let txid = keys::decode_branch_delta_chunk_txid(branch_id, key)?;
		rows_by_txid
			.entry(txid)
			.or_default()
			.push((key.clone(), value.clone()));
	}

	rows_by_txid
		.into_iter()
		.map(|(txid, rows)| Ok((txid, reassemble_delta_segments(branch_id, txid, rows)?)))
		.collect()
}

#[cfg(test)]
#[path = "../../tests/inline/conveyer_delta_blob.rs"]
mod tests;
