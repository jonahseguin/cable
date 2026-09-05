//! Chunked storage for `SHARD` blobs.
//!
//! A dense shard image (up to `SHARD_SIZE` pages plus LTX framing, ~256 KB) exceeds FDB's 100 KB
//! per-value cap (and its ~10 KB recommended value size), so shard versions are stored as ordered
//! `CHUNK_SIZE` chunk rows under `SHARD/{shard_id}/{as_of_txid}/{chunk_idx}` and reassembled on
//! read, mirroring the DELTA store.
//! A value sitting directly at the bare `branch_shard_key` is a pre-chunking legacy row and is read
//! as a one-chunk blob; new writes are always chunked and legacy rows age out as compaction
//! rewrites shards forward.

use anyhow::{Context, Result, ensure};
use futures_util::TryStreamExt;
use universaldb::{
	RangeOption,
	options::StreamingMode,
	utils::{CHUNK_SIZE, IsolationLevel},
};

use super::{keys, ltx::LtxBlob, types::DatabaseBranchId};

/// One shard version loaded from the hot tier: the physical FDB rows in ascending key order plus
/// the reassembled blob. `rows` lets delete, fence, and quota paths account each row exactly.
pub(crate) struct ShardVersionLoad {
	pub(crate) rows: Vec<(Vec<u8>, Vec<u8>)>,
	pub(crate) blob: Vec<u8>,
}

/// Result of a latest-version lookup: the newest version at or below the cap, if any, plus the
/// number of physical rows the scan consumed (for read-path debug counters).
pub(crate) struct LatestShardBlobLoad {
	pub(crate) version: Option<(u64, ShardVersionLoad)>,
	pub(crate) rows_scanned: usize,
}

/// Splits a shard blob into `CHUNK_SIZE`-sized chunks, indexed contiguously from zero.
pub(crate) fn split_shard_blob(blob: &[u8]) -> Result<Vec<(u32, &[u8])>> {
	ensure!(!blob.is_empty(), "sqlite shard blob must not be empty");
	blob.chunks(CHUNK_SIZE)
		.enumerate()
		.map(|(chunk_idx, chunk)| {
			Ok((
				u32::try_from(chunk_idx).context("sqlite shard chunk index exceeded u32")?,
				chunk,
			))
		})
		.collect()
}

/// Writes one shard version as chunk rows, clearing every pre-existing row of the version first
/// (the legacy single-value row or a previous chunking with a longer tail) so a rewrite that
/// shrinks the chunk count leaves no stale tail chunk. Returns the rows written so callers can
/// account quota per FDB row.
pub(crate) fn write_shard_blob(
	tx: &universaldb::Transaction,
	branch_id: DatabaseBranchId,
	shard_id: u32,
	as_of_txid: u64,
	blob: &[u8],
) -> Result<Vec<(Vec<u8>, Vec<u8>)>> {
	let rows = split_shard_blob(blob)?
		.into_iter()
		.map(|(chunk_idx, chunk)| {
			(
				keys::branch_shard_chunk_key(branch_id, shard_id, as_of_txid, chunk_idx),
				chunk.to_vec(),
			)
		})
		.collect::<Vec<_>>();

	clear_shard_version(tx, branch_id, shard_id, as_of_txid);
	for (key, value) in &rows {
		tx.informal().set(key, value);
	}

	Ok(rows)
}

/// Clears every row of one shard version: the bare legacy key plus all chunk rows under it.
pub(crate) fn clear_shard_version(
	tx: &universaldb::Transaction,
	branch_id: DatabaseBranchId,
	shard_id: u32,
	as_of_txid: u64,
) {
	let (begin, end) = keys::branch_shard_version_range(branch_id, shard_id, as_of_txid);
	tx.informal().clear_range(&begin, &end);
}

/// The page set of the newest folded image of a shard at or below `max_txid`, plus its txid and what
/// reading it cost, or `None` when the shard has no version at all.
///
/// This is the version the read path resolves through: `tx_load_latest_shard_blob` takes one reverse
/// row per source, so the newest version at or below the cap wins outright and whatever it omits is
/// zero-filled. A caller about to drop a page's only pointer therefore has to ask that exact version
/// whether it carries the page. An older version carrying it proves nothing, because the newer sparse
/// one is what a read would land on.
pub(crate) async fn latest_shard_version_page_set(
	tx: &universaldb::Transaction,
	branch_id: DatabaseBranchId,
	shard_id: u32,
	max_txid: u64,
	isolation_level: IsolationLevel,
) -> Result<Option<ShardVersionPageSet>> {
	let load = read_latest_shard_blob(tx, branch_id, shard_id, max_txid, isolation_level).await?;
	let Some((as_of_txid, version)) = load.version else {
		return Ok(None);
	};
	let rows = version.rows.len();
	let value_bytes = version
		.rows
		.iter()
		.map(|(_, value)| u64::try_from(value.len()).unwrap_or(u64::MAX))
		.fold(0_u64, u64::saturating_add);
	let blob = LtxBlob::decode_index(version.blob)
		.with_context(|| format!("decode shard {shard_id} version {as_of_txid} page index"))?;

	Ok(Some(ShardVersionPageSet {
		as_of_txid,
		blob,
		rows,
		value_bytes,
	}))
}

/// One shard version's identity and page index plus the rows and bytes the probe read, so a caller
/// running under a batch budget can charge what it spent.
pub(crate) struct ShardVersionPageSet {
	pub(crate) as_of_txid: u64,
	pub(crate) blob: LtxBlob,
	pub(crate) rows: usize,
	pub(crate) value_bytes: u64,
}

/// Tests whether one shard version has any row in the hot tier without materializing its blob. A
/// dense image is ~256 KB spread over `CHUNK_SIZE` chunk rows, so callers that only need to know
/// whether a version is still live (rather than what it contains) read one chunk instead of all of
/// them. A missing version costs no value bytes at all.
pub(crate) async fn shard_version_exists(
	tx: &universaldb::Transaction,
	branch_id: DatabaseBranchId,
	shard_id: u32,
	as_of_txid: u64,
	isolation_level: IsolationLevel,
) -> Result<bool> {
	let (begin, end) = keys::branch_shard_version_range(branch_id, shard_id, as_of_txid);
	let informal = tx.informal();
	let mut stream = informal.get_ranges_keyvalues(
		RangeOption {
			mode: StreamingMode::Iterator,
			limit: Some(1),
			..(begin.as_slice(), end.as_slice()).into()
		},
		isolation_level,
	);

	let exists = stream.try_next().await?.is_some();

	#[cfg(any(test, feature = "test-faults"))]
	crate::compaction::test_hooks::shard_image_probe::record_existence_probe();

	Ok(exists)
}

/// Reads one shard version's rows and reassembles the blob. Returns `None` when the version has no
/// rows at all.
pub(crate) async fn read_shard_blob_at(
	tx: &universaldb::Transaction,
	branch_id: DatabaseBranchId,
	shard_id: u32,
	as_of_txid: u64,
	isolation_level: IsolationLevel,
) -> Result<Option<ShardVersionLoad>> {
	let (begin, end) = keys::branch_shard_version_range(branch_id, shard_id, as_of_txid);
	let informal = tx.informal();
	let mut stream = informal.get_ranges_keyvalues(
		RangeOption {
			mode: StreamingMode::WantAll,
			..(begin.as_slice(), end.as_slice()).into()
		},
		isolation_level,
	);

	let mut rows = Vec::new();
	while let Some(entry) = stream.try_next().await? {
		rows.push((entry.key().to_vec(), entry.value().to_vec()));
	}
	if rows.is_empty() {
		return Ok(None);
	}

	#[cfg(any(test, feature = "test-faults"))]
	crate::compaction::test_hooks::shard_image_probe::record_image(
		rows.iter()
			.map(|(_, value)| value.len() as u64)
			.sum::<u64>(),
	);

	let blob = assemble_version_rows(branch_id, shard_id, as_of_txid, &rows)?;
	Ok(Some(ShardVersionLoad { rows, blob }))
}

/// Reads only the `as_of_txid` of the newest shard version at or below `max_txid`, without
/// materializing its blob. One reverse range read limited to a single row: the highest key under the
/// shard is a row of the newest version, and every row of a version encodes that version's txid.
/// Callers use this as a coverage floor, so no value bytes are needed.
pub(crate) async fn read_latest_shard_version_txid(
	tx: &universaldb::Transaction,
	branch_id: DatabaseBranchId,
	shard_id: u32,
	max_txid: u64,
	isolation_level: IsolationLevel,
) -> Result<Option<u64>> {
	let begin = keys::branch_shard_version_prefix(branch_id, shard_id);
	let end = keys::branch_shard_version_scan_end(branch_id, shard_id, max_txid);
	let informal = tx.informal();
	let mut stream = informal.get_ranges_keyvalues(
		RangeOption {
			mode: StreamingMode::Iterator,
			reverse: true,
			limit: Some(1),
			..(begin.as_slice(), end.as_slice()).into()
		},
		isolation_level,
	);

	let Some(entry) = stream.try_next().await? else {
		return Ok(None);
	};
	let (_, as_of_txid, _) = keys::decode_branch_shard_row_key(branch_id, entry.key())?;

	Ok(Some(as_of_txid))
}

/// Loads the newest shard version at or below `max_txid` with a single reverse range scan. The
/// scan stops pulling rows once the version txid changes, so the newest version's rows (which sort
/// last and therefore stream first) are the only ones materialized.
pub(crate) async fn read_latest_shard_blob(
	tx: &universaldb::Transaction,
	branch_id: DatabaseBranchId,
	shard_id: u32,
	max_txid: u64,
	isolation_level: IsolationLevel,
) -> Result<LatestShardBlobLoad> {
	let begin = keys::branch_shard_version_prefix(branch_id, shard_id);
	let end = keys::branch_shard_version_scan_end(branch_id, shard_id, max_txid);
	let informal = tx.informal();
	let mut stream = informal.get_ranges_keyvalues(
		RangeOption {
			mode: StreamingMode::Iterator,
			reverse: true,
			..(begin.as_slice(), end.as_slice()).into()
		},
		isolation_level,
	);

	let mut rows_scanned = 0_usize;
	let mut version_txid = None;
	let mut rows = Vec::new();
	while let Some(entry) = stream.try_next().await? {
		rows_scanned += 1;
		let (_, row_txid, _) = keys::decode_branch_shard_row_key(branch_id, entry.key())?;
		match version_txid {
			None => version_txid = Some(row_txid),
			Some(txid) if txid == row_txid => {}
			Some(_) => break,
		}
		rows.push((entry.key().to_vec(), entry.value().to_vec()));
	}

	let Some(as_of_txid) = version_txid else {
		return Ok(LatestShardBlobLoad {
			version: None,
			rows_scanned,
		});
	};
	// The reverse scan collected the version's rows in descending key order.
	rows.reverse();
	let blob = assemble_version_rows(branch_id, shard_id, as_of_txid, &rows)?;

	Ok(LatestShardBlobLoad {
		version: Some((as_of_txid, ShardVersionLoad { rows, blob })),
		rows_scanned,
	})
}

/// Groups a `SHARD` prefix scan's rows (ascending key order, possibly spanning multiple shards and
/// versions) into whole versions and reassembles each blob.
pub(crate) fn group_shard_version_rows(
	branch_id: DatabaseBranchId,
	rows: Vec<(Vec<u8>, Vec<u8>)>,
) -> Result<Vec<(u32, u64, ShardVersionLoad)>> {
	let mut versions: Vec<(u32, u64, Vec<(Vec<u8>, Vec<u8>)>)> = Vec::new();
	for (key, value) in rows {
		let (shard_id, as_of_txid, _) = keys::decode_branch_shard_row_key(branch_id, &key)?;
		match versions.last_mut() {
			Some((last_shard, last_txid, group))
				if *last_shard == shard_id && *last_txid == as_of_txid =>
			{
				group.push((key, value));
			}
			_ => versions.push((shard_id, as_of_txid, vec![(key, value)])),
		}
	}

	versions
		.into_iter()
		.map(|(shard_id, as_of_txid, rows)| {
			let blob = assemble_version_rows(branch_id, shard_id, as_of_txid, &rows)?;
			Ok((shard_id, as_of_txid, ShardVersionLoad { rows, blob }))
		})
		.collect()
}

/// Reassembles one shard version from its physical rows (ascending key order): either exactly one
/// legacy row at the bare version key, or chunk rows contiguous from chunk zero. The legacy key
/// sorts before its chunk keys, so a mixed version surfaces as a legacy row with extra rows and is
/// rejected.
fn assemble_version_rows(
	branch_id: DatabaseBranchId,
	shard_id: u32,
	as_of_txid: u64,
	rows: &[(Vec<u8>, Vec<u8>)],
) -> Result<Vec<u8>> {
	let mut blob = Vec::new();
	for (expected_idx, (key, value)) in rows.iter().enumerate() {
		let (row_shard_id, row_txid, chunk_idx) =
			keys::decode_branch_shard_row_key(branch_id, key)?;
		ensure!(
			row_shard_id == shard_id && row_txid == as_of_txid,
			"sqlite shard row belongs to a different shard version"
		);
		match chunk_idx {
			None => ensure!(
				rows.len() == 1,
				"legacy sqlite shard row must be its version's only row"
			),
			Some(chunk_idx) => ensure!(
				chunk_idx == u32::try_from(expected_idx).unwrap_or(u32::MAX),
				"sqlite shard chunks must be contiguous from chunk 0"
			),
		}
		blob.extend_from_slice(value);
	}

	Ok(blob)
}

/// Reassembles a chunk-suffixed blob whose rows all sit under `chunk_prefix` (the staged hot shard
/// layout: `{prefix}{chunk_idx:u32be}`), checking chunk contiguity from zero.
pub(crate) fn assemble_chunked_rows(
	chunk_prefix: &[u8],
	rows: &[(Vec<u8>, Vec<u8>)],
) -> Result<Vec<u8>> {
	let mut blob = Vec::new();
	for (expected_idx, (key, value)) in rows.iter().enumerate() {
		let suffix = key
			.strip_prefix(chunk_prefix)
			.context("sqlite shard chunk key did not start with expected prefix")?;
		let chunk_idx = u32::from_be_bytes(
			suffix
				.try_into()
				.context("sqlite shard chunk key suffix should decode as u32")?,
		);
		ensure!(
			chunk_idx == u32::try_from(expected_idx).unwrap_or(u32::MAX),
			"sqlite shard chunks must be contiguous from chunk 0"
		);
		blob.extend_from_slice(value);
	}

	Ok(blob)
}
