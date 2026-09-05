use std::collections::{BTreeMap, BTreeSet};

use anyhow::{Context, Result};
use universaldb::{error::DatabaseError, utils::IsolationLevel::Serializable};

use crate::compaction::shared::shard_version_is_retained;
use crate::conveyer::{
	history_pin::read_db_history_pins,
	keys::{self, SHARD_SIZE},
	ltx::{decode_ltx_v3, encode_ltx_v3},
	pitr_interval::scan_pitr_interval_coverage,
	shard_blob,
	types::DatabaseBranchId,
};

use super::helpers::{
	decode_branch_pidx_pgno, tracked_entry_size, tx_get_value, tx_scan_prefix_values_from,
};

#[derive(Default)]
pub(super) struct TruncateCleanup {
	pub(super) pidx_clears: Vec<ObservedCleanupRow>,
	pub(super) shard_clears: Vec<ObservedCleanupRow>,
	/// Chunk rows of the pruned boundary shard version. Written plainly, without a fence, because
	/// every pre-existing row of that version is fenced and cleared through `shard_clears` in the
	/// same transaction.
	pub(super) shard_writes: Vec<(Vec<u8>, Vec<u8>)>,
	pub(super) truncated_pgnos: Vec<u32>,
	pub(super) added_bytes: i64,
	pub(super) deleted_bytes: i64,
}

pub(super) struct ObservedCleanupRow {
	pub(super) key: Vec<u8>,
	value: Vec<u8>,
}

pub(super) async fn collect_truncate_cleanup(
	tx: &universaldb::Transaction,
	branch_id: DatabaseBranchId,
	previous_db_size_pages: u32,
	new_db_size_pages: u32,
) -> Result<TruncateCleanup> {
	if new_db_size_pages >= previous_db_size_pages {
		return Ok(TruncateCleanup::default());
	}

	let mut cleanup = TruncateCleanup::default();
	// Scan only the PIDX rows above the new EOF. PIDX keys are `pgno`-ordered, so the above-EOF rows
	// are the contiguous tail at or after `new_db_size_pages + 1`, and a shrinking commit no longer
	// materializes the entire (size-scaling) PIDX keyspace just to discard the live rows.
	let pidx_scan_start = keys::branch_pidx_key(branch_id, new_db_size_pages + 1);
	for (key, value) in
		tx_scan_prefix_values_from(tx, &keys::branch_pidx_prefix(branch_id), &pidx_scan_start)
			.await?
	{
		let pgno = decode_branch_pidx_pgno(branch_id, &key)?;
		if pgno > new_db_size_pages {
			cleanup.deleted_bytes += tracked_entry_size(&key, &value)?;
			cleanup.truncated_pgnos.push(pgno);
			cleanup.pidx_clears.push(ObservedCleanupRow { key, value });
		}
	}

	let boundary_shard_id = new_db_size_pages / SHARD_SIZE;
	// Scan only the boundary shard and the shards above it. SHARD keys are `shard_id`-ordered, so the
	// boundary shard's versions plus every fully-above shard form the contiguous tail at or after the
	// boundary shard's version prefix.
	let shard_scan_start = keys::branch_shard_version_prefix(branch_id, boundary_shard_id);
	let mut shard_rows = Vec::new();
	for (key, value) in
		tx_scan_prefix_values_from(tx, &keys::branch_shard_prefix(branch_id), &shard_scan_start)
			.await?
	{
		let (shard_id, _, _) = keys::decode_branch_shard_row_key(branch_id, &key)?;
		if shard_id >= boundary_shard_id {
			shard_rows.push((key, value));
		}
	}

	// A shrink only removes pages from the branch head. Every version at or above the new EOF is
	// still the image some earlier point in history reads through, so deleting or pruning it
	// unconditionally is what makes a restore point or fork below the shrink resolve those pages to
	// zeros. Retain exactly the versions a pin or an unexpired PITR interval still covers, and delete
	// the rest here: the dead-shard sweep only retires a version when a later fold lists its shard
	// again, and a shard above the new EOF is never folded again, so anything left behind would leak
	// for the life of the branch.
	let retained_txids = truncate_retained_txids(tx, branch_id).await?;
	let mut version_txids_by_shard = BTreeMap::<u32, BTreeSet<u64>>::new();
	for (key, _) in &shard_rows {
		let (shard_id, as_of_txid, _) = keys::decode_branch_shard_row_key(branch_id, key)?;
		version_txids_by_shard
			.entry(shard_id)
			.or_default()
			.insert(as_of_txid);
	}

	// The rows span whole versions (legacy single-value or chunked). A version above the boundary
	// shard is dropped outright; the boundary shard's own versions keep the pages below the new EOF,
	// so they are pruned and rewritten instead.
	for (shard_id, as_of_txid, version) in
		shard_blob::group_shard_version_rows(branch_id, shard_rows)?
	{
		let superseded_by_txid = version_txids_by_shard
			.get(&shard_id)
			.and_then(|txids| txids.range(as_of_txid.saturating_add(1)..).next().copied());
		if shard_version_is_retained(&retained_txids, as_of_txid, superseded_by_txid) {
			continue;
		}

		if shard_id > boundary_shard_id {
			for (key, value) in version.rows {
				cleanup.deleted_bytes += tracked_entry_size(&key, &value)?;
				cleanup.shard_clears.push(ObservedCleanupRow { key, value });
			}
			continue;
		}

		let pruned_value = prune_truncated_shard_value(&version.blob, new_db_size_pages)
			.context("prune sqlite boundary shard after truncate")?;
		let Some(pruned_value) = pruned_value else {
			continue;
		};
		for (key, value) in version.rows {
			cleanup.deleted_bytes += tracked_entry_size(&key, &value)?;
			cleanup.shard_clears.push(ObservedCleanupRow { key, value });
		}
		if !pruned_value.is_empty() {
			for (chunk_idx, chunk) in shard_blob::split_shard_blob(&pruned_value)? {
				let chunk_key = keys::branch_shard_chunk_key(
					branch_id,
					boundary_shard_id,
					as_of_txid,
					chunk_idx,
				);
				cleanup.added_bytes += tracked_entry_size(&chunk_key, chunk)?;
				cleanup.shard_writes.push((chunk_key, chunk.to_vec()));
			}
		}
	}

	Ok(cleanup)
}

/// The txids whose history a truncate must not destroy: every database history pin, plus every PITR
/// interval coverage point the branch has recorded. Expired interval rows are reclaimed on their own
/// stamps, so anything still present here is still readable.
async fn truncate_retained_txids(
	tx: &universaldb::Transaction,
	branch_id: DatabaseBranchId,
) -> Result<BTreeSet<u64>> {
	let mut retained = BTreeSet::new();
	for pin in read_db_history_pins(tx, branch_id, Serializable).await? {
		retained.insert(pin.at_txid);
	}
	for (_, coverage) in scan_pitr_interval_coverage(tx, branch_id, Serializable).await? {
		retained.insert(coverage.txid);
	}

	Ok(retained)
}

pub(super) async fn fence_truncate_cleanup_row(
	tx: &universaldb::Transaction,
	row: &ObservedCleanupRow,
) -> Result<()> {
	let current = tx_get_value(tx, &row.key, Serializable).await?;
	if current.as_deref() != Some(row.value.as_slice()) {
		return Err(DatabaseError::NotCommitted.into());
	}

	Ok(())
}

fn prune_truncated_shard_value(value: &[u8], new_db_size_pages: u32) -> Result<Option<Vec<u8>>> {
	let decoded = decode_ltx_v3(value).context("decode sqlite boundary shard")?;
	let original_page_count = decoded.pages.len();
	let live_pages = decoded
		.pages
		.into_iter()
		.filter(|page| page.pgno <= new_db_size_pages)
		.collect::<Vec<_>>();
	if live_pages.len() == original_page_count {
		return Ok(None);
	}
	if live_pages.is_empty() {
		return Ok(Some(Vec::new()));
	}

	encode_ltx_v3(decoded.header, &live_pages)
		.context("encode pruned sqlite boundary shard")
		.map(Some)
}
