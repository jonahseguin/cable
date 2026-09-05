use anyhow::{Context, Result, bail};
use gas::prelude::Id;
use serde::{Deserialize, Serialize};
use vbare::OwnedVersionedData;

use super::ids::{BucketBranchId, DatabaseBranchId};
use super::serialization::SQLITE_STORAGE_META_VERSION;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CompactionRoot {
	pub schema_version: u32,
	pub manifest_generation: u64,
	pub hot_watermark_txid: u64,
	pub cold_watermark_txid: u64,
	pub cold_watermark_versionstamp: [u8; 16],
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct ColdShardRef {
	pub object_key: String,
	pub object_generation_id: Id,
	pub shard_id: u32,
	pub as_of_txid: u64,
	pub min_txid: u64,
	pub max_txid: u64,
	pub min_versionstamp: [u8; 16],
	pub max_versionstamp: [u8; 16],
	pub size_bytes: u64,
	pub content_hash: [u8; 32],
	pub publish_generation: u64,
}

/// Persisted metadata for one staged hot shard, written to the FDB staging area alongside the shard
/// blob so the manager install and reclaimer cleanup can re-derive the drained ref set without
/// carrying it through workflow state. `shard_id`, `as_of_txid`, and `min_txid` are also encoded in
/// the key; storing them in the value keeps decode self-contained. `max_txid` is always
/// `as_of_txid` for a staged hot shard, so it is not stored.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct StagedHotShardRef {
	pub shard_id: u32,
	pub as_of_txid: u64,
	pub min_txid: u64,
	pub size_bytes: u64,
	pub content_hash: [u8; 32],
}

/// What the last reclaim plan pass was able to do with its window.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ReclaimPlanOutcome {
	/// The pass produced a slice of delete work.
	Planned,
	/// The pass swept its window and found nothing reclaimable in it. This is normal mid-drain and
	/// is never on its own a reason to stop, so a run of these with an unmoving cursor is the
	/// signature of a wedged scan.
	NothingReclaimable,
}

/// Diagnostic snapshot of the reclaim drain's scan positions, written by the reclaim plan
/// transaction. See `keys::branch_compaction_reclaim_progress_key` for why this is persisted.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ReclaimProgress {
	pub schema_version: u32,
	/// Manifest generation the pass planned against, so a stale row is recognizable.
	pub manifest_generation: u64,
	/// Inclusive lower bound the next commit/delta window will start from.
	pub commit_scan_cursor: u64,
	/// Whether the commit/delta scan has reached the end of its reclaimable range.
	pub commit_scan_complete: bool,
	/// Exclusive `(shard_id, as_of_txid)` lower bound the next cold-object window resumes at, or
	/// absent once the cold-shard prefix is exhausted.
	pub cold_scan_cursor: Option<(u32, u64)>,
	pub last_outcome: ReclaimPlanOutcome,
	pub updated_at_ms: i64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum RetiredColdObjectDeleteState {
	Retired,
	DeleteIssued,
	Deleted,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RetiredColdObject {
	pub object_key: String,
	pub object_generation_id: Id,
	pub content_hash: [u8; 32],
	pub retired_manifest_generation: u64,
	pub retired_at_ms: i64,
	pub delete_after_ms: i64,
	pub delete_state: RetiredColdObjectDeleteState,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SqliteCmpDirty {
	pub observed_head_txid: u64,
	pub updated_at_ms: i64,
}

/// Txid-major, blob-free secondary index over `SHARD`. One row per fold (a materialized snapshot
/// boundary), recording which shards were materialized at that fold txid plus the fold commit's
/// versionstamp. Cold planning reads this with a `limit=1` range scan instead of scanning the whole
/// `SHARD/*` prefix.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct FoldIndexEntry {
	pub shard_ids: Vec<u32>,
	pub versionstamp: [u8; 16],
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PitrIntervalCoverage {
	pub txid: u64,
	pub versionstamp: [u8; 16],
	pub wall_clock_ms: i64,
	pub expires_at_ms: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct BucketForkFact {
	pub source_bucket_branch_id: BucketBranchId,
	pub target_bucket_branch_id: BucketBranchId,
	pub fork_versionstamp: [u8; 16],
	pub parent_cap_versionstamp: [u8; 16],
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct BucketCatalogDbFact {
	pub database_branch_id: DatabaseBranchId,
	pub bucket_branch_id: BucketBranchId,
	pub catalog_versionstamp: [u8; 16],
	pub tombstone_versionstamp: Option<[u8; 16]>,
}

macro_rules! impl_compaction_versioned_data {
	($versioned:ident, $latest:ty, $name:literal) => {
		impl OwnedVersionedData for $versioned {
			type Latest = $latest;

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
					_ => bail!("invalid depot {} version: {version}", $name),
				}
			}

			fn serialize_version(self, _version: u16) -> Result<Vec<u8>> {
				match self {
					Self::V1(data) => rivet_util::serde::bare_to_vec!(&data).map_err(Into::into),
				}
			}
		}
	};
}

enum VersionedCompactionRoot {
	V1(CompactionRoot),
}

enum VersionedColdShardRef {
	V1(ColdShardRef),
}

enum VersionedRetiredColdObject {
	V1(RetiredColdObject),
}

enum VersionedSqliteCmpDirty {
	V1(SqliteCmpDirty),
}

enum VersionedReclaimProgress {
	V1(ReclaimProgress),
}

enum VersionedFoldIndexEntry {
	V1(FoldIndexEntry),
}

enum VersionedStagedHotShardRef {
	V1(StagedHotShardRef),
}

enum VersionedPitrIntervalCoverage {
	V1(PitrIntervalCoverage),
}

enum VersionedBucketForkFact {
	V1(BucketForkFact),
}

enum VersionedBucketCatalogDbFact {
	V1(BucketCatalogDbFact),
}

impl_compaction_versioned_data!(VersionedCompactionRoot, CompactionRoot, "CompactionRoot");
impl_compaction_versioned_data!(VersionedColdShardRef, ColdShardRef, "ColdShardRef");
impl_compaction_versioned_data!(
	VersionedRetiredColdObject,
	RetiredColdObject,
	"RetiredColdObject"
);
impl_compaction_versioned_data!(VersionedSqliteCmpDirty, SqliteCmpDirty, "SqliteCmpDirty");
impl_compaction_versioned_data!(VersionedReclaimProgress, ReclaimProgress, "ReclaimProgress");
impl_compaction_versioned_data!(VersionedFoldIndexEntry, FoldIndexEntry, "FoldIndexEntry");
impl_compaction_versioned_data!(
	VersionedStagedHotShardRef,
	StagedHotShardRef,
	"StagedHotShardRef"
);
impl_compaction_versioned_data!(
	VersionedPitrIntervalCoverage,
	PitrIntervalCoverage,
	"PitrIntervalCoverage"
);
impl_compaction_versioned_data!(VersionedBucketForkFact, BucketForkFact, "BucketForkFact");
impl_compaction_versioned_data!(
	VersionedBucketCatalogDbFact,
	BucketCatalogDbFact,
	"BucketCatalogDbFact"
);

pub fn encode_compaction_root(root: CompactionRoot) -> Result<Vec<u8>> {
	VersionedCompactionRoot::wrap_latest(root)
		.serialize_with_embedded_version(SQLITE_STORAGE_META_VERSION)
		.context("encode sqlite compaction root")
}

pub fn decode_compaction_root(payload: &[u8]) -> Result<CompactionRoot> {
	VersionedCompactionRoot::deserialize_with_embedded_version(payload)
		.context("decode sqlite compaction root")
}

pub fn encode_cold_shard_ref(reference: ColdShardRef) -> Result<Vec<u8>> {
	VersionedColdShardRef::wrap_latest(reference)
		.serialize_with_embedded_version(SQLITE_STORAGE_META_VERSION)
		.context("encode sqlite cold shard ref")
}

pub fn decode_cold_shard_ref(payload: &[u8]) -> Result<ColdShardRef> {
	VersionedColdShardRef::deserialize_with_embedded_version(payload)
		.context("decode sqlite cold shard ref")
}

pub fn encode_retired_cold_object(object: RetiredColdObject) -> Result<Vec<u8>> {
	VersionedRetiredColdObject::wrap_latest(object)
		.serialize_with_embedded_version(SQLITE_STORAGE_META_VERSION)
		.context("encode sqlite retired cold object")
}

pub fn decode_retired_cold_object(payload: &[u8]) -> Result<RetiredColdObject> {
	VersionedRetiredColdObject::deserialize_with_embedded_version(payload)
		.context("decode sqlite retired cold object")
}

pub fn encode_sqlite_cmp_dirty(dirty: SqliteCmpDirty) -> Result<Vec<u8>> {
	VersionedSqliteCmpDirty::wrap_latest(dirty)
		.serialize_with_embedded_version(SQLITE_STORAGE_META_VERSION)
		.context("encode sqlite compaction dirty marker")
}

pub fn decode_sqlite_cmp_dirty(payload: &[u8]) -> Result<SqliteCmpDirty> {
	VersionedSqliteCmpDirty::deserialize_with_embedded_version(payload)
		.context("decode sqlite compaction dirty marker")
}

pub fn encode_pitr_interval_coverage(coverage: PitrIntervalCoverage) -> Result<Vec<u8>> {
	VersionedPitrIntervalCoverage::wrap_latest(coverage)
		.serialize_with_embedded_version(SQLITE_STORAGE_META_VERSION)
		.context("encode sqlite PITR interval coverage")
}

pub fn decode_pitr_interval_coverage(payload: &[u8]) -> Result<PitrIntervalCoverage> {
	VersionedPitrIntervalCoverage::deserialize_with_embedded_version(payload)
		.context("decode sqlite PITR interval coverage")
}

pub fn encode_staged_hot_shard_ref(reference: StagedHotShardRef) -> Result<Vec<u8>> {
	VersionedStagedHotShardRef::wrap_latest(reference)
		.serialize_with_embedded_version(SQLITE_STORAGE_META_VERSION)
		.context("encode sqlite staged hot shard ref")
}

pub fn decode_staged_hot_shard_ref(payload: &[u8]) -> Result<StagedHotShardRef> {
	VersionedStagedHotShardRef::deserialize_with_embedded_version(payload)
		.context("decode sqlite staged hot shard ref")
}

pub fn encode_reclaim_progress(progress: ReclaimProgress) -> Result<Vec<u8>> {
	VersionedReclaimProgress::wrap_latest(progress)
		.serialize_with_embedded_version(SQLITE_STORAGE_META_VERSION)
		.context("encode sqlite reclaim progress")
}

pub fn decode_reclaim_progress(payload: &[u8]) -> Result<ReclaimProgress> {
	VersionedReclaimProgress::deserialize_with_embedded_version(payload)
		.context("decode sqlite reclaim progress")
}

pub fn encode_fold_index_entry(entry: FoldIndexEntry) -> Result<Vec<u8>> {
	VersionedFoldIndexEntry::wrap_latest(entry)
		.serialize_with_embedded_version(SQLITE_STORAGE_META_VERSION)
		.context("encode sqlite fold index entry")
}

pub fn decode_fold_index_entry(payload: &[u8]) -> Result<FoldIndexEntry> {
	VersionedFoldIndexEntry::deserialize_with_embedded_version(payload)
		.context("decode sqlite fold index entry")
}

pub fn encode_bucket_fork_fact(fact: BucketForkFact) -> Result<Vec<u8>> {
	VersionedBucketForkFact::wrap_latest(fact)
		.serialize_with_embedded_version(SQLITE_STORAGE_META_VERSION)
		.context("encode sqlite bucket fork fact")
}

pub fn decode_bucket_fork_fact(payload: &[u8]) -> Result<BucketForkFact> {
	VersionedBucketForkFact::deserialize_with_embedded_version(payload)
		.context("decode sqlite bucket fork fact")
}

pub fn encode_bucket_catalog_db_fact(fact: BucketCatalogDbFact) -> Result<Vec<u8>> {
	VersionedBucketCatalogDbFact::wrap_latest(fact)
		.serialize_with_embedded_version(SQLITE_STORAGE_META_VERSION)
		.context("encode sqlite bucket catalog db fact")
}

pub fn decode_bucket_catalog_db_fact(payload: &[u8]) -> Result<BucketCatalogDbFact> {
	VersionedBucketCatalogDbFact::deserialize_with_embedded_version(payload)
		.context("decode sqlite bucket catalog db fact")
}
