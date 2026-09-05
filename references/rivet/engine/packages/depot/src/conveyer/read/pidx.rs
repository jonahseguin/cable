use anyhow::{Context, Result, ensure};

const PIDX_TXID_BYTES: usize = std::mem::size_of::<u64>();

#[derive(Debug, Clone, Copy)]
pub(super) struct PageRef {
	pub(super) source: super::plan::ReadSource,
	pub(super) txid: u64,
	pub(super) kind: PageRefKind,
}

#[derive(Debug, Clone, Copy)]
pub(super) enum PageRefKind {
	Pidx,
	HistoricalDelta,
}

pub(super) fn decode_pidx_txid(value: &[u8]) -> Result<u64> {
	ensure!(
		value.len() == PIDX_TXID_BYTES,
		"pidx value had {} bytes, expected {}",
		value.len(),
		PIDX_TXID_BYTES
	);

	Ok(u64::from_be_bytes(
		value
			.try_into()
			.context("pidx value should decode as u64")?,
	))
}
