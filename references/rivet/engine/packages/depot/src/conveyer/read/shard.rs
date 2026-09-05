use std::{
	collections::{BTreeMap, BTreeSet},
	sync::Arc,
};

use anyhow::Result;
use futures_util::{StreamExt, TryStreamExt, future::try_join_all, stream};
use universaldb::utils::IsolationLevel::Serializable;

use crate::conveyer::{
	db::{DeltaSegmentLayoutCache, LtxBlobCache},
	delta_blob, keys, shard_blob,
	types::{DatabaseBranchId, decode_compaction_root},
};

use super::plan::{ReadSource, StorageScope};

/// Maximum number of concurrent shard-version floor reads issued while bounding a source's
/// DELTA-history walk. Each read is a single-row reverse range read, so this only caps how many
/// shards of one read are probed at once.
const SHARD_FOLD_FLOOR_FETCH_CONCURRENCY: usize = 32;

/// Loads the blobs of one commit that can hold `pgnos`, in ascending page-range order.
///
/// A pre-segmentation commit yields one blob covering everything it wrote; a segmented commit yields
/// one per shard-aligned page range, and only the ranges covering a requested page are materialized.
/// The caller picks among them with `delta_blob::segment_for_page`, so it never has to know which
/// layout the commit used.
///
/// A commit already in cache costs no FDB read: its cached layout says which blob holds each page
/// and the blob cache holds those blobs. Both caches are keyed by immutable content, so a hit is
/// always current. If any blob the caller needs has been evicted, the whole commit is re-read rather
/// than served partially, since a missing blob is indistinguishable from a page the commit never
/// wrote.
///
/// On a cache miss the whole txid is scanned rather than range-read to the covering segments,
/// because at the current commit size cap a commit's segments are few and the scan costs what the
/// pre-segmentation scan cost. Once commits can be large, this is where a reverse range read on
/// `branch_delta_segment_prefix` belongs.
pub(super) async fn tx_load_delta_blob(
	tx: &universaldb::Transaction,
	source: ReadSource,
	txid: u64,
	pgnos: &[u32],
	blob_cache: &LtxBlobCache,
	layout_cache: &DeltaSegmentLayoutCache,
) -> Result<DeltaBlobLoad> {
	let ReadSource::Branch(branch_source) = source;
	let branch_id = branch_source.branch_id;
	let delta_prefix = keys::branch_delta_chunk_prefix(branch_id, txid);

	if let Some(layout) = layout_cache.get(&delta_prefix).await
		&& let Some(segments) = load_cached_segments(&layout, pgnos, blob_cache).await
	{
		return Ok(DeltaBlobLoad {
			segments,
			chunk_rows_scanned: 0,
		});
	}

	let delta_chunks = super::tx::tx_scan_prefix_values(tx, &delta_prefix).await?;
	let chunk_rows_scanned = delta_chunks.len();
	let segments = delta_blob::reassemble_delta_segments(branch_id, txid, delta_chunks)?;
	if !segments.is_empty() {
		layout_cache
			.insert(
				delta_prefix,
				Arc::new(
					segments
						.iter()
						.map(|segment| (segment.first_pgno, segment.key.clone()))
						.collect(),
				),
			)
			.await;
	}

	Ok(DeltaBlobLoad {
		segments,
		chunk_rows_scanned,
	})
}

/// Rebuilds the segments covering `pgnos` from a cached layout, or `None` when the blob cache no
/// longer holds one of them and the commit has to be re-read.
///
/// Only the covering segments are materialized. A commit that wrote a wide page range holds many
/// blobs, and a read that wants one page must not pay to copy the rest.
async fn load_cached_segments(
	layout: &[(Option<u32>, Vec<u8>)],
	pgnos: &[u32],
	blob_cache: &LtxBlobCache,
) -> Option<Vec<delta_blob::DeltaSegment>> {
	let mut needed = BTreeSet::new();
	for pgno in pgnos {
		// Mirrors `delta_blob::segment_for_page`: the last entry starting at or below the page is
		// the only one that can hold it, and a legacy entry covers every page.
		if let Some(idx) = layout
			.iter()
			.rposition(|(first_pgno, _)| first_pgno.is_none_or(|first| first <= *pgno))
		{
			needed.insert(idx);
		}
	}
	if needed.is_empty() {
		return None;
	}

	let mut segments = Vec::with_capacity(needed.len());
	for idx in needed {
		let (first_pgno, key) = &layout[idx];
		let blob = blob_cache.get(key).await?;
		segments.push(delta_blob::DeltaSegment {
			first_pgno: *first_pgno,
			key: key.clone(),
			blob: blob.bytes().to_vec(),
		});
	}

	Some(segments)
}

pub(super) struct DeltaBlobLoad {
	pub(super) segments: Vec<delta_blob::DeltaSegment>,
	pub(super) chunk_rows_scanned: usize,
}

pub(super) async fn tx_load_latest_shard_blob(
	tx: &universaldb::Transaction,
	scope: &StorageScope,
	shard_id: u32,
) -> Result<ShardBlobLoad> {
	let StorageScope::Branch(plan) = scope;

	// Scan every source's latest shard version concurrently. Each scan is a
	// reverse range limited to one row, so it reads only the newest version at or
	// below the source's cap instead of streaming every historical version.
	let per_source = try_join_all(
		plan.sources
			.iter()
			.map(|source| tx_load_source_shard_blob(tx, *source, shard_id)),
	)
	.await?;

	// Sources are ordered most specific first, so the first source with a hit
	// wins, matching the sequential fallback order.
	let mut rows_scanned = 0usize;
	let mut latest = None;
	for (source, found) in per_source {
		rows_scanned += found;
		if latest.is_none() && source.is_some() {
			latest = source;
		}
	}

	Ok(ShardBlobLoad {
		source: latest,
		rows_scanned,
	})
}

/// Reads the txid below which each shard's pages are already covered by a shard version, without
/// materializing any shard blob. The DELTA-history walk uses these as its lower bound, so a floor may
/// only be reported where the shard image is known to hold every page written at or below it:
///
/// - the newest shard version at or below the source's cap bounds it from above, because that version
///   is the one the SHARD fallback will serve, and
/// - the source's hot compaction watermark bounds it too, because that watermark is what licenses
///   compaction to clear a folded page's PIDX row in the first place. Hand-written or half-installed
///   shard versions sit above the watermark and yield no floor, so the walk still reads the history
///   they would otherwise hide.
///
/// A shard with no version, or a branch that has never folded, maps to no entry: no floor at all.
pub(super) async fn tx_load_source_shard_fold_floors(
	tx: &universaldb::Transaction,
	source: ReadSource,
	shard_ids: &BTreeSet<u32>,
) -> Result<BTreeMap<u32, u64>> {
	let ReadSource::Branch(branch_source) = source;

	let hot_watermark_txid = tx_load_branch_hot_watermark_txid(tx, branch_source.branch_id).await?;
	if hot_watermark_txid == 0 {
		return Ok(BTreeMap::new());
	}

	let floors: Vec<(u32, Option<u64>)> = stream::iter(shard_ids.iter().copied())
		.map(|shard_id| async move {
			let as_of_txid = shard_blob::read_latest_shard_version_txid(
				tx,
				branch_source.branch_id,
				shard_id,
				branch_source.max_txid,
				// TODO: This can probably be made Snapshot again to reduce contention if
				// read side freshness is not worth the cost.
				Serializable,
			)
			.await?;
			Result::<(u32, Option<u64>)>::Ok((shard_id, as_of_txid))
		})
		.buffer_unordered(SHARD_FOLD_FLOOR_FETCH_CONCURRENCY)
		.try_collect()
		.await?;

	Ok(floors
		.into_iter()
		.filter_map(|(shard_id, as_of_txid)| {
			let floor = as_of_txid?.min(hot_watermark_txid);
			(floor > 0).then_some((shard_id, floor))
		})
		.collect())
}

/// The source branch's installed hot fold watermark, or zero when it has never folded.
async fn tx_load_branch_hot_watermark_txid(
	tx: &universaldb::Transaction,
	branch_id: DatabaseBranchId,
) -> Result<u64> {
	let root_bytes =
		super::tx::tx_get_value(tx, &keys::branch_compaction_root_key(branch_id)).await?;
	let Some(root_bytes) = root_bytes else {
		return Ok(0);
	};

	Ok(decode_compaction_root(&root_bytes)?.hot_watermark_txid)
}

async fn tx_load_source_shard_blob(
	tx: &universaldb::Transaction,
	source: ReadSource,
	shard_id: u32,
) -> Result<(Option<(DatabaseBranchId, Vec<u8>, Vec<u8>)>, usize)> {
	let ReadSource::Branch(source) = source;

	// One reverse range scan that stops once the version txid changes, so only the newest
	// version's chunk rows (or its single legacy row) are materialized and reassembled.
	let load = shard_blob::read_latest_shard_blob(
		tx,
		source.branch_id,
		shard_id,
		source.max_txid,
		// TODO: This can probably be made Snapshot again to reduce contention if
		// read side freshness is not worth the cost.
		Serializable,
	)
	.await?;

	// Downstream keys blobs by the bare version key regardless of the on-disk row format.
	let latest = load.version.map(|(as_of_txid, version)| {
		(
			source.branch_id,
			keys::branch_shard_key(source.branch_id, shard_id, as_of_txid),
			version.blob,
		)
	});

	Ok((latest, load.rows_scanned))
}

pub(super) struct ShardBlobLoad {
	/// The winning `SHARD` row, as `(the branch that owns it, key, blob)`.
	///
	/// A read walks its fork ancestry, so the winner often belongs to an ancestor rather than to the
	/// branch being read, and its key carries that ancestor's prefix. Anything that decodes the key,
	/// or looks up the branch's compaction state, has to use this branch id and not the read's own.
	pub(super) source: Option<(DatabaseBranchId, Vec<u8>, Vec<u8>)>,
	pub(super) rows_scanned: usize,
}
