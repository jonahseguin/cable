use anyhow::{Context, Result, bail};
use serde::{Deserialize, Serialize};
use vbare::OwnedVersionedData;

use super::ids::DatabaseBranchId;
use super::serialization::SQLITE_STORAGE_META_VERSION;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct BranchManifest {
	pub cold_drained_txid: u64,
	pub last_hot_pass_txid: u64,
	pub last_access_ts_ms: i64,
	pub last_access_bucket: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CommitRow {
	pub wall_clock_ms: i64,
	pub versionstamp: [u8; 16],
	pub db_size_pages: u32,
	pub post_apply_checksum: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DBHead {
	pub head_txid: u64,
	pub db_size_pages: u32,
	pub post_apply_checksum: u64,
	pub branch_id: DatabaseBranchId,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct MetaCompact {
	pub materialized_txid: u64,
}

enum VersionedDBHead {
	V1(DBHead),
}

impl OwnedVersionedData for VersionedDBHead {
	type Latest = DBHead;

	fn wrap_latest(latest: Self::Latest) -> Self {
		Self::V1(latest)
	}

	fn unwrap_latest(self) -> Result<Self::Latest> {
		match self {
			Self::V1(data) => Ok(data),
		}
	}

	fn deserialize_version(payload: &[u8], version: u16) -> Result<Self> {
		match version {
			1 => Ok(Self::V1(rivet_util::serde::bare_from_slice!(payload)?)),
			_ => bail!("invalid depot DBHead version: {version}"),
		}
	}

	fn serialize_version(self, _version: u16) -> Result<Vec<u8>> {
		match self {
			Self::V1(data) => rivet_util::serde::bare_to_vec!(&data).map_err(Into::into),
		}
	}
}

/// Bookkeeping for one in-progress staged commit, written at `StageBegin` and updated by each
/// segment.
///
/// Nothing here is visible to readers: a staged commit has no PIDX row, no COMMIT row and has not
/// moved head, so this row plus the staged DELTA chunks are the only trace it exists. It is cleared
/// by `Finalize`, or by the next `StageBegin` that reuses the same txid, or by the orphan sweep.
/// Page slots one staged commit segment spans, which is what makes its page set encodable as a
/// fixed-width bitmap.
pub const STAGED_SEGMENT_SPAN_PAGES: u32 =
	crate::conveyer::keys::SHARD_SIZE * crate::conveyer::constants::COMMIT_SEGMENT_MAX_SHARDS;

/// Bytes of bitmap needed to cover `STAGED_SEGMENT_SPAN_PAGES`.
pub const STAGED_SEGMENT_BITMAP_BYTES: usize = (STAGED_SEGMENT_SPAN_PAGES as usize).div_ceil(8);

/// One accepted segment of an in-progress staged commit.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct StagedSegment {
	pub first_pgno: u32,
	/// One bit per page slot in `[first_pgno, first_pgno + STAGED_SEGMENT_SPAN_PAGES)`, least
	/// significant bit first. A bitmap rather than a page list because it is fixed width: the
	/// stage row is rewritten once per segment, so a representation that grew with a segment's
	/// page count would make a dense commit quadratic in its own size.
	pub page_bitmap: Vec<u8>,
}

impl StagedSegment {
	/// Builds a segment's bitmap from its pages, which `validate_segment` has already confirmed all
	/// fall inside the segment's span.
	pub fn new(first_pgno: u32, pgnos: impl IntoIterator<Item = u32>) -> Result<Self> {
		let mut page_bitmap = vec![0_u8; STAGED_SEGMENT_BITMAP_BYTES];
		for pgno in pgnos {
			let offset = pgno
				.checked_sub(first_pgno)
				.filter(|offset| *offset < STAGED_SEGMENT_SPAN_PAGES)
				.with_context(|| {
					format!("page {pgno} falls outside the segment starting at {first_pgno}")
				})?;
			page_bitmap[(offset / 8) as usize] |= 1 << (offset % 8);
		}

		Ok(Self {
			first_pgno,
			page_bitmap,
		})
	}

	pub fn pages(&self) -> impl Iterator<Item = u32> + '_ {
		self.page_bitmap
			.iter()
			.enumerate()
			.flat_map(move |(byte_idx, byte)| {
				(0..8_u32).filter_map(move |bit| {
					(byte & (1 << bit) != 0).then(|| self.first_pgno + byte_idx as u32 * 8 + bit)
				})
			})
	}

	pub fn page_count(&self) -> u32 {
		self.page_bitmap.iter().map(|byte| byte.count_ones()).sum()
	}
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CommitStageRow {
	/// Bytes charged to the branch quota so far, so an abandoned stage can be refunded exactly
	/// rather than estimated.
	pub accounted_bytes: i64,
	/// Every segment accepted so far, in arrival order.
	///
	/// This is what lets finalize rebuild the commit's page set without reading a single staged
	/// blob back. Reading them back would pull the entire commit payload into the one transaction
	/// the whole design exists to keep small, which at the commit cap is two orders of magnitude
	/// past what FDB will accept. A segment row and its blob chunks are written in the same
	/// transaction, so a segment listed here is a segment whose bytes are present.
	///
	/// Bounded by the commit cap: a segment spans `STAGED_SEGMENT_SPAN_PAGES` pages, so a commit at
	/// `MAX_COMMIT_DIRTY_PAGES` holds a couple of hundred entries of about forty bytes each, well
	/// inside one FDB value.
	pub segments: Vec<StagedSegment>,
	/// The actor generation that opened the stage. A generation change abandons the stage rather
	/// than letting a new actor finalize a previous one's partial write.
	pub generation: u64,
	pub started_at_ms: i64,
}

enum VersionedCommitStageRow {
	V1(CommitStageRow),
}

impl OwnedVersionedData for VersionedCommitStageRow {
	type Latest = CommitStageRow;

	fn wrap_latest(latest: Self::Latest) -> Self {
		Self::V1(latest)
	}

	fn unwrap_latest(self) -> Result<Self::Latest> {
		match self {
			Self::V1(data) => Ok(data),
		}
	}

	fn deserialize_version(payload: &[u8], version: u16) -> Result<Self> {
		match version {
			1 => Ok(Self::V1(rivet_util::serde::bare_from_slice!(payload)?)),
			_ => bail!("invalid depot CommitStageRow version: {version}"),
		}
	}

	fn serialize_version(self, _version: u16) -> Result<Vec<u8>> {
		match self {
			Self::V1(data) => rivet_util::serde::bare_to_vec!(&data).map_err(Into::into),
		}
	}
}

enum VersionedCommitRow {
	V1(CommitRow),
}

impl OwnedVersionedData for VersionedCommitRow {
	type Latest = CommitRow;

	fn wrap_latest(latest: Self::Latest) -> Self {
		Self::V1(latest)
	}

	fn unwrap_latest(self) -> Result<Self::Latest> {
		match self {
			Self::V1(data) => Ok(data),
		}
	}

	fn deserialize_version(payload: &[u8], version: u16) -> Result<Self> {
		match version {
			1 => Ok(Self::V1(rivet_util::serde::bare_from_slice!(payload)?)),
			_ => bail!("invalid depot CommitRow version: {version}"),
		}
	}

	fn serialize_version(self, _version: u16) -> Result<Vec<u8>> {
		match self {
			Self::V1(data) => rivet_util::serde::bare_to_vec!(&data).map_err(Into::into),
		}
	}
}

enum VersionedMetaCompact {
	V1(MetaCompact),
}

impl OwnedVersionedData for VersionedMetaCompact {
	type Latest = MetaCompact;

	fn wrap_latest(latest: Self::Latest) -> Self {
		Self::V1(latest)
	}

	fn unwrap_latest(self) -> Result<Self::Latest> {
		match self {
			Self::V1(data) => Ok(data),
		}
	}

	fn deserialize_version(payload: &[u8], version: u16) -> Result<Self> {
		match version {
			1 => Ok(Self::V1(rivet_util::serde::bare_from_slice!(payload)?)),
			_ => bail!("invalid depot MetaCompact version: {version}"),
		}
	}

	fn serialize_version(self, _version: u16) -> Result<Vec<u8>> {
		match self {
			Self::V1(data) => rivet_util::serde::bare_to_vec!(&data).map_err(Into::into),
		}
	}
}

pub fn encode_db_head(head: DBHead) -> Result<Vec<u8>> {
	VersionedDBHead::wrap_latest(head)
		.serialize_with_embedded_version(SQLITE_STORAGE_META_VERSION)
		.context("encode sqlite db head")
}

pub fn decode_db_head(payload: &[u8]) -> Result<DBHead> {
	VersionedDBHead::deserialize_with_embedded_version(payload).context("decode sqlite db head")
}

pub fn encode_commit_stage_row(row: CommitStageRow) -> Result<Vec<u8>> {
	VersionedCommitStageRow::wrap_latest(row)
		.serialize_with_embedded_version(SQLITE_STORAGE_META_VERSION)
		.context("encode sqlite commit stage row")
}

pub fn decode_commit_stage_row(payload: &[u8]) -> Result<CommitStageRow> {
	VersionedCommitStageRow::deserialize_with_embedded_version(payload)
		.context("decode sqlite commit stage row")
}

pub fn encode_commit_row(row: CommitRow) -> Result<Vec<u8>> {
	VersionedCommitRow::wrap_latest(row)
		.serialize_with_embedded_version(SQLITE_STORAGE_META_VERSION)
		.context("encode sqlite commit row")
}

pub fn decode_commit_row(payload: &[u8]) -> Result<CommitRow> {
	VersionedCommitRow::deserialize_with_embedded_version(payload)
		.context("decode sqlite commit row")
}

pub fn encode_meta_compact(compact: MetaCompact) -> Result<Vec<u8>> {
	VersionedMetaCompact::wrap_latest(compact)
		.serialize_with_embedded_version(SQLITE_STORAGE_META_VERSION)
		.context("encode sqlite compact meta")
}

pub fn decode_meta_compact(payload: &[u8]) -> Result<MetaCompact> {
	VersionedMetaCompact::deserialize_with_embedded_version(payload)
		.context("decode sqlite compact meta")
}
