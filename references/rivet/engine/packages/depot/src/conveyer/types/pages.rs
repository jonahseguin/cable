use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DirtyPage {
	pub pgno: u32,
	pub bytes: Vec<u8>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct FetchedPage {
	pub pgno: u32,
	pub bytes: Option<Vec<u8>>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct GetPagesResult {
	pub pages: Vec<FetchedPage>,
	pub head_txid: u64,
	pub db_size_pages: u32,
	pub provenance: Vec<PageSourceProvenance>,
	pub read_stats: GetPagesReadStats,
}

/// Work the read did to resolve its pages, for tests and read-cost debugging. Counters only; the
/// read's result never depends on them.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct GetPagesReadStats {
	/// DELTA chunk rows read while walking ancestor sources' delta history.
	pub historical_delta_chunk_rows_scanned: usize,
	/// Delta files decoded during that walk.
	pub historical_delta_txids_decoded: usize,
	/// Highest txid the walk was allowed to stop at because a shard version covers the pages
	/// below it. Zero when no source had a shard version for the requested pages.
	pub historical_delta_scan_floor_txid: u64,
	/// Page slots the walk stopped searching because a shard version already covers them.
	pub historical_delta_pages_shard_superseded: usize,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DepotReadMode {
	#[default]
	Serving,
	DiagnosticNoSideEffects,
}

impl DepotReadMode {
	pub fn allows_side_effects(self) -> bool {
		match self {
			Self::Serving => true,
			Self::DiagnosticNoSideEffects => false,
		}
	}
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct GetPagesOptions {
	pub expected_head_txid: Option<u64>,
	/// Also return the overflow pages referenced by any requested leaf page so a
	/// scanning client does not round trip once per overflowing row.
	pub expand_overflow: bool,
	pub mode: DepotReadMode,
	pub collect_provenance: bool,
	pub diagnostic_max_txid: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PageSourceProvenance {
	pub pgno: u32,
	pub winner_kind: PageSourceKind,
	pub winner_txid: Option<u64>,
	pub winner_shard_id: Option<u32>,
	pub candidates: Vec<PageSourceCandidate>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PageSourceCandidate {
	pub kind: PageSourceKind,
	pub txid: Option<u64>,
	pub shard_id: Option<u32>,
	pub result: PageSourceCandidateResult,
	pub reason: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PageSourceKind {
	PidxDelta,
	HistoricalDelta,
	MissingDelta,
	HotShard,
	Cold,
	ZeroFill,
	OutOfRange,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PageSourceCandidateResult {
	Won,
	Lost,
	Selected,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct CommitOptions {
	pub expected_head_txid: Option<u64>,
	pub disable_size_cap: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct CommitResult {
	pub head_txid: u64,
	pub db_size_pages: u32,
}
