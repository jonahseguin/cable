use anyhow::{Context, Error, Result};
use futures_util::TryStreamExt;
use universaldb::{RangeOption, options::StreamingMode, utils::IsolationLevel::Snapshot};

use crate::conveyer::{keys, types::DatabaseBranchId};

pub(super) fn tracked_entry_size(key: &[u8], value: &[u8]) -> Result<i64> {
	i64::try_from(key.len() + value.len()).context("sqlite tracked entry size exceeded i64")
}

pub(super) async fn tx_get_value(
	tx: &universaldb::Transaction,
	key: &[u8],
	isolation_level: universaldb::utils::IsolationLevel,
) -> Result<Option<Vec<u8>>> {
	Ok(tx
		.informal()
		.get(key, isolation_level)
		.await?
		.map(Vec::<u8>::from))
}

/// Scans a prefix subspace starting at `start_key` (inclusive) rather than the prefix start. The end
/// bound stays the full prefix-subspace end, so the result is the tail of the prefix at or after
/// `start_key`. Truncate cleanup uses this to materialize only the above-EOF rows instead of the
/// entire PIDX/SHARD keyspace.
pub(super) async fn tx_scan_prefix_values_from(
	tx: &universaldb::Transaction,
	prefix: &[u8],
	start_key: &[u8],
) -> Result<Vec<(Vec<u8>, Vec<u8>)>> {
	let informal = tx.informal();
	let prefix_subspace =
		universaldb::Subspace::from(universaldb::tuple::Subspace::from_bytes(prefix.to_vec()));
	let (_, prefix_end) = prefix_subspace.range();
	let mut stream = informal.get_ranges_keyvalues(
		RangeOption {
			mode: StreamingMode::WantAll,
			..(start_key.to_vec(), prefix_end).into()
		},
		Snapshot,
	);
	let mut rows = Vec::new();

	while let Some(entry) = stream.try_next().await? {
		rows.push((entry.key().to_vec(), entry.value().to_vec()));
	}

	Ok(rows)
}

pub(super) fn decode_branch_pidx_pgno(branch_id: DatabaseBranchId, key: &[u8]) -> Result<u32> {
	let prefix = keys::branch_pidx_prefix(branch_id);
	let suffix = key
		.strip_prefix(prefix.as_slice())
		.context("pidx key did not start with expected prefix")?;
	let bytes: [u8; std::mem::size_of::<u32>()] = suffix
		.try_into()
		.map_err(|_| Error::msg("pidx key suffix had invalid length"))?;

	Ok(u32::from_be_bytes(bytes))
}
