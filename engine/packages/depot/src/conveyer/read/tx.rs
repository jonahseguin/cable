use anyhow::Result;
use futures_util::TryStreamExt;
use universaldb::{RangeOption, options::StreamingMode, utils::IsolationLevel::Serializable};

/// Reverse-scan the range `[begin, end)` newest-key-first, returning at most
/// `limit` rows. Used to walk a versioned/append-only keyspace (e.g. DELTA
/// history) from the top while reading only a bounded slice per call, so callers
/// that early-exit do not materialize the whole range.
pub(super) async fn tx_scan_range_reverse_limited(
	tx: &universaldb::Transaction,
	begin: &[u8],
	end: &[u8],
	limit: usize,
) -> Result<Vec<(Vec<u8>, Vec<u8>)>> {
	let informal = tx.informal();
	let mut stream = informal.get_ranges_keyvalues(
		RangeOption {
			mode: StreamingMode::Iterator,
			reverse: true,
			limit: Some(limit),
			..(begin, end).into()
		},
		// TODO: This can probably be made Snapshot again to reduce contention if
		// read side freshness is not worth the cost.
		Serializable,
	);
	let mut rows = Vec::new();

	while let Some(entry) = stream.try_next().await? {
		rows.push((entry.key().to_vec(), entry.value().to_vec()));
	}

	Ok(rows)
}

pub(super) async fn tx_get_value(
	tx: &universaldb::Transaction,
	key: &[u8],
) -> Result<Option<Vec<u8>>> {
	// TODO: This can probably be made Snapshot again to reduce contention if read
	// side freshness is not worth the cost.
	Ok(tx
		.informal()
		.get(key, Serializable)
		.await?
		.map(Vec::<u8>::from))
}

pub(super) async fn tx_scan_prefix_values(
	tx: &universaldb::Transaction,
	prefix: &[u8],
) -> Result<Vec<(Vec<u8>, Vec<u8>)>> {
	let informal = tx.informal();
	let prefix_subspace =
		universaldb::Subspace::from(universaldb::tuple::Subspace::from_bytes(prefix.to_vec()));
	let mut stream = informal.get_ranges_keyvalues(
		universaldb::RangeOption {
			mode: StreamingMode::WantAll,
			..RangeOption::from(&prefix_subspace)
		},
		// TODO: This can probably be made Snapshot again to reduce contention if
		// read side freshness is not worth the cost.
		Serializable,
	);
	let mut rows = Vec::new();

	while let Some(entry) = stream.try_next().await? {
		rows.push((entry.key().to_vec(), entry.value().to_vec()));
	}

	Ok(rows)
}
