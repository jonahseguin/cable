//! Key builders for depot blobs and indexes.

use anyhow::{Context, Result, bail, ensure};
use gas::prelude::Id;
use universaldb::utils::end_of_key_range;

use super::types::{BucketBranchId, BucketId, DatabaseBranchId};

pub const SQLITE_SUBSPACE_PREFIX: u8 = 0x02;
pub const DBPTR_PARTITION: u8 = 0x10;
pub const BUCKET_PTR_PARTITION: u8 = 0x11;
pub const BUCKET_CATALOG_PARTITION: u8 = 0x12;
pub const BRANCHES_PARTITION: u8 = 0x20;
pub const BUCKET_BRANCH_PARTITION: u8 = 0x21;
pub const BR_PARTITION: u8 = 0x30;
pub const CTR_PARTITION: u8 = 0x40;
pub const RESTORE_POINT_PARTITION: u8 = 0x50;
pub const CMPC_PARTITION: u8 = 0x60;
pub const DB_PIN_PARTITION: u8 = 0x70;
pub const BUCKET_FORK_PIN_PARTITION: u8 = 0x71;
pub const BUCKET_CHILD_PARTITION: u8 = 0x72;
pub const BUCKET_CATALOG_BY_DB_PARTITION: u8 = 0x73;
pub const BUCKET_PROOF_EPOCH_PARTITION: u8 = 0x74;
pub const SQLITE_CMP_DIRTY_PARTITION: u8 = 0x75;
/// Retired: the compaction throttle's window counters moved into UniversalDB's own keyspace. Kept so
/// the byte is not reused, and because the last few windows written before the move are ephemeral
/// residue nothing clears any more.
pub const CMP_THROTTLE_PARTITION: u8 = 0x76;
pub const DB_BRANCH_OWNER_PARTITION: u8 = 0x77;
pub const PAGE_SIZE: u32 = 4096;
/// Re-exported from `depot_client_types` so the client cutting staged commit segments and the engine
/// validating them share one definition rather than two that could drift.
pub use depot_client_types::SHARD_SIZE;

const META_HEAD_PATH: &[u8] = b"/META/head";
const META_HEAD_AT_FORK_PATH: &[u8] = b"/META/head_at_fork";
const META_COMPACT_PATH: &[u8] = b"/META/compact";
const META_COLD_COMPACT_PATH: &[u8] = b"/META/cold_compact";
const META_QUOTA_PATH: &[u8] = b"/META/quota";
const META_COMPACTOR_LEASE_PATH: &[u8] = b"/META/compactor_lease";
const META_COLD_LEASE_PATH: &[u8] = b"/META/cold_lease";
const CSTAGE_PATH: &[u8] = b"/CSTAGE/";
const CMP_ROOT_PATH: &[u8] = b"/CMP/root";
const CMP_COLD_SHARD_PATH: &[u8] = b"/CMP/cold_shard/";
const CMP_RETIRED_COLD_OBJECT_PATH: &[u8] = b"/CMP/retired_cold_object/";
const CMP_STAGE_PATH: &[u8] = b"/CMP/stage/";
const CMP_STAGE_HOT_SHARD_PATH: &[u8] = b"/hot_shard/";
const CMP_STAGE_HOT_REF_PATH: &[u8] = b"/hot_ref/";
const CMP_STAGE_COLD_REF_PATH: &[u8] = b"/cold_ref/";
const CMP_FOLD_PATH: &[u8] = b"/CMP/fold/";
const CMP_PIDX_REPAIR_PATH: &[u8] = b"/CMP/pidx_repair";
const CMP_RECLAIM_PROGRESS_PATH: &[u8] = b"/CMP/reclaim_progress";
const SHARD_PATH: &[u8] = b"/SHARD/";
const SHARD_ACCESS_PATH: &[u8] = b"/SHARD_ACCESS/";
const SHARD_LRU_PATH: &[u8] = b"/SHARD_LRU/";
const DELTA_PATH: &[u8] = b"/DELTA/";
const PIDX_DELTA_PATH: &[u8] = b"/PIDX/delta/";
const BR_PIDX_PATH: &[u8] = b"/PIDX/";
const COMMITS_PATH: &[u8] = b"/COMMITS/";
const VTX_PATH: &[u8] = b"/VTX/";
const PITR_INTERVAL_PATH: &[u8] = b"/PITR_INTERVAL/";
const CUR_PATH: &[u8] = b"/cur";
const HISTORY_PATH: &[u8] = b"/history/";
const POLICY_PITR_PATH: &[u8] = b"/POLICY/PITR";
const POLICY_SHARD_CACHE_PATH: &[u8] = b"/POLICY/SHARD_CACHE";
const DB_POLICY_PATH: &[u8] = b"/DB_POLICY/";
const PITR_PATH: &[u8] = b"/PITR";
const SHARD_CACHE_PATH: &[u8] = b"/SHARD_CACHE";
const LIST_PATH: &[u8] = b"/list/";
const REFCOUNT_PATH: &[u8] = b"/refcount";
const DESC_PIN_PATH: &[u8] = b"/desc_pin";
const RESTORE_POINT_PIN_PATH: &[u8] = b"/restore_point_pin";
const PIN_COUNT_PATH: &[u8] = b"/pin_count";
const DATABASE_TOMBSTONES_PATH: &[u8] = b"/database_tombstones/";
const MANIFEST_COLD_DRAINED_TXID_PATH: &[u8] = b"/META/manifest/cold_drained_txid";
const MANIFEST_LAST_HOT_PASS_TXID_PATH: &[u8] = b"/META/manifest/last_hot_pass_txid";
const MANIFEST_LAST_ACCESS_TS_MS_PATH: &[u8] = b"/META/manifest/last_access_ts_ms";
const MANIFEST_LAST_ACCESS_BUCKET_PATH: &[u8] = b"/META/manifest/last_access_bucket";
const CTR_QUOTA_GLOBAL_PATH: &[u8] = b"/quota_global";
const CTR_EVICTION_INDEX_PATH: &[u8] = b"/eviction_index/";
const RESTORE_POINT_PATH: &[u8] = b"/";
const CMPC_ENQUEUE_PATH: &[u8] = b"/enqueue/";
const CMPC_LEASE_GLOBAL_PATH: &[u8] = b"/lease_global/";
const DB_PIN_PATH: &[u8] = b"/";
const BUCKET_FORK_PIN_PATH: &[u8] = b"/";
const BUCKET_CHILD_PATH: &[u8] = b"/";
const BUCKET_CATALOG_BY_DB_PATH: &[u8] = b"/";
const BUCKET_PROOF_EPOCH_PATH: &[u8] = b"/";
const SQLITE_CMP_DIRTY_PATH: &[u8] = b"/";
const DB_BRANCH_OWNER_PATH: &[u8] = b"/";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CompactorQueueKind {
	Cold,
	Eviction,
}

impl CompactorQueueKind {
	fn as_byte(self) -> u8 {
		match self {
			Self::Cold => 0x00,
			Self::Eviction => 0x01,
		}
	}
}

fn partition_prefix(partition: u8) -> Vec<u8> {
	vec![SQLITE_SUBSPACE_PREFIX, partition]
}

fn uuid_bytes(uuid: uuid::Uuid) -> [u8; 16] {
	*uuid.as_bytes()
}

fn append_uuid(key: &mut Vec<u8>, uuid: uuid::Uuid) {
	key.extend_from_slice(&uuid_bytes(uuid));
}

fn append_ts_nonce(key: &mut Vec<u8>, ts_ms: i64, nonce: u32) {
	key.extend_from_slice(&ts_ms.to_be_bytes());
	key.extend_from_slice(&nonce.to_be_bytes());
}

fn append_id(key: &mut Vec<u8>, id: Id) {
	key.extend_from_slice(&id.as_bytes());
}

fn append_database_id(key: &mut Vec<u8>, database_id: &str) {
	key.extend_from_slice(database_id.as_bytes());
}

fn branch_record_base(branch_id: DatabaseBranchId) -> Vec<u8> {
	let mut key = partition_prefix(BRANCHES_PARTITION);
	key.extend_from_slice(LIST_PATH);
	append_uuid(&mut key, branch_id.as_uuid());
	key
}

fn bucket_branch_record_base(branch_id: BucketBranchId) -> Vec<u8> {
	let mut key = partition_prefix(BUCKET_BRANCH_PARTITION);
	key.extend_from_slice(LIST_PATH);
	append_uuid(&mut key, branch_id.as_uuid());
	key
}

fn database_branch_base(branch_id: DatabaseBranchId) -> Vec<u8> {
	let mut key = partition_prefix(BR_PARTITION);
	key.push(b'/');
	append_uuid(&mut key, branch_id.as_uuid());
	key
}

fn database_pointer_base(bucket_branch_id: BucketBranchId, database_id: &str) -> Vec<u8> {
	let mut key = partition_prefix(DBPTR_PARTITION);
	key.push(b'/');
	append_uuid(&mut key, bucket_branch_id.as_uuid());
	key.push(b'/');
	append_database_id(&mut key, database_id);
	key
}

fn bucket_pointer_base(bucket_id: BucketId) -> Vec<u8> {
	let mut key = partition_prefix(BUCKET_PTR_PARTITION);
	key.push(b'/');
	append_uuid(&mut key, bucket_id.as_uuid());
	key
}

fn bucket_catalog_base(bucket_branch_id: BucketBranchId) -> Vec<u8> {
	let mut key = partition_prefix(BUCKET_CATALOG_PARTITION);
	key.push(b'/');
	append_uuid(&mut key, bucket_branch_id.as_uuid());
	key.push(b'/');
	key
}

fn with_suffix(mut prefix: Vec<u8>, suffix: &[u8]) -> Vec<u8> {
	prefix.extend_from_slice(suffix);
	prefix
}

/// Build the common database-scoped prefix: `[0x02, database_id_bytes]`.
pub fn database_prefix(database_id: &str) -> Vec<u8> {
	let database_bytes = database_id.as_bytes();
	let mut key = Vec::with_capacity(1 + database_bytes.len());
	key.push(SQLITE_SUBSPACE_PREFIX);
	key.extend_from_slice(database_bytes);
	key
}

pub fn database_range(database_id: &str) -> (Vec<u8>, Vec<u8>) {
	let start = database_prefix(database_id);
	let end = end_of_key_range(&start);
	(start, end)
}

pub fn database_pointer_cur_key(bucket_branch_id: BucketBranchId, database_id: &str) -> Vec<u8> {
	with_suffix(
		database_pointer_base(bucket_branch_id, database_id),
		CUR_PATH,
	)
}

pub fn database_pointer_cur_prefix() -> Vec<u8> {
	let mut key = partition_prefix(DBPTR_PARTITION);
	key.push(b'/');
	key
}

pub fn decode_database_pointer_cur_key(key: &[u8]) -> Result<(BucketBranchId, String)> {
	let prefix = database_pointer_cur_prefix();
	let suffix = key
		.strip_prefix(prefix.as_slice())
		.context("database pointer key did not start with expected prefix")?;
	ensure!(
		suffix.len() > std::mem::size_of::<uuid::Uuid>() + 1 + CUR_PATH.len(),
		"database pointer key suffix is too short"
	);
	let (bucket_branch_bytes, rest) = suffix.split_at(std::mem::size_of::<uuid::Uuid>());
	ensure!(
		rest.first() == Some(&b'/'),
		"database pointer key missing bucket/database separator"
	);
	let database_id_bytes = rest[1..]
		.strip_suffix(CUR_PATH)
		.context("database pointer key did not end with current pointer suffix")?;
	let uuid = uuid::Uuid::from_slice(bucket_branch_bytes)
		.context("decode database pointer bucket branch uuid")?;
	let database_id = String::from_utf8(database_id_bytes.to_vec())
		.context("database pointer database id was not utf-8")?;

	Ok((BucketBranchId::from_uuid(uuid), database_id))
}

pub fn database_pointer_history_key(
	bucket_branch_id: BucketBranchId,
	database_id: &str,
	ts_ms: i64,
	nonce: u32,
) -> Vec<u8> {
	let mut key = database_pointer_history_prefix(bucket_branch_id, database_id);
	append_ts_nonce(&mut key, ts_ms, nonce);
	key
}

pub fn database_pointer_history_prefix(
	bucket_branch_id: BucketBranchId,
	database_id: &str,
) -> Vec<u8> {
	with_suffix(
		database_pointer_base(bucket_branch_id, database_id),
		HISTORY_PATH,
	)
}

pub fn bucket_pointer_cur_key(bucket_id: BucketId) -> Vec<u8> {
	with_suffix(bucket_pointer_base(bucket_id), CUR_PATH)
}

pub fn bucket_pointer_cur_prefix() -> Vec<u8> {
	let mut key = partition_prefix(BUCKET_PTR_PARTITION);
	key.push(b'/');
	key
}

pub fn decode_bucket_pointer_cur_bucket_id(key: &[u8]) -> Result<BucketId> {
	let prefix = bucket_pointer_cur_prefix();
	let suffix = key
		.strip_prefix(prefix.as_slice())
		.context("bucket pointer key did not start with expected prefix")?;
	let Some(bucket_id_bytes) = suffix.strip_suffix(CUR_PATH) else {
		bail!("bucket pointer key did not end with current pointer suffix");
	};
	ensure!(
		bucket_id_bytes.len() == std::mem::size_of::<uuid::Uuid>(),
		"bucket pointer key bucket id had {} bytes, expected {}",
		bucket_id_bytes.len(),
		std::mem::size_of::<uuid::Uuid>()
	);
	let uuid = uuid::Uuid::from_slice(bucket_id_bytes).context("decode bucket pointer uuid")?;

	Ok(BucketId::from_uuid(uuid))
}

pub fn bucket_pointer_history_key(bucket_id: BucketId, ts_ms: i64, nonce: u32) -> Vec<u8> {
	let mut key = bucket_pointer_history_prefix(bucket_id);
	append_ts_nonce(&mut key, ts_ms, nonce);
	key
}

pub fn bucket_pointer_history_prefix(bucket_id: BucketId) -> Vec<u8> {
	with_suffix(bucket_pointer_base(bucket_id), HISTORY_PATH)
}

pub fn bucket_policy_pitr_key(bucket_id: BucketId) -> Vec<u8> {
	with_suffix(bucket_pointer_base(bucket_id), POLICY_PITR_PATH)
}

pub fn bucket_policy_shard_cache_key(bucket_id: BucketId) -> Vec<u8> {
	with_suffix(bucket_pointer_base(bucket_id), POLICY_SHARD_CACHE_PATH)
}

pub fn database_pitr_policy_key(bucket_id: BucketId, database_id: &str) -> Vec<u8> {
	let mut key = with_suffix(bucket_pointer_base(bucket_id), DB_POLICY_PATH);
	append_database_id(&mut key, database_id);
	key.extend_from_slice(PITR_PATH);
	key
}

pub fn database_shard_cache_policy_key(bucket_id: BucketId, database_id: &str) -> Vec<u8> {
	let mut key = with_suffix(bucket_pointer_base(bucket_id), DB_POLICY_PATH);
	append_database_id(&mut key, database_id);
	key.extend_from_slice(SHARD_CACHE_PATH);
	key
}

pub fn branches_list_key(branch_id: DatabaseBranchId) -> Vec<u8> {
	branch_record_base(branch_id)
}

pub fn branches_refcount_key(branch_id: DatabaseBranchId) -> Vec<u8> {
	with_suffix(branch_record_base(branch_id), REFCOUNT_PATH)
}

pub fn branches_desc_pin_key(branch_id: DatabaseBranchId) -> Vec<u8> {
	with_suffix(branch_record_base(branch_id), DESC_PIN_PATH)
}

pub fn branches_restore_point_pin_key(branch_id: DatabaseBranchId) -> Vec<u8> {
	with_suffix(branch_record_base(branch_id), RESTORE_POINT_PIN_PATH)
}

pub fn bucket_branches_list_key(branch_id: BucketBranchId) -> Vec<u8> {
	bucket_branch_record_base(branch_id)
}

pub fn bucket_branches_refcount_key(branch_id: BucketBranchId) -> Vec<u8> {
	with_suffix(bucket_branch_record_base(branch_id), REFCOUNT_PATH)
}

pub fn bucket_branches_desc_pin_key(branch_id: BucketBranchId) -> Vec<u8> {
	with_suffix(bucket_branch_record_base(branch_id), DESC_PIN_PATH)
}

pub fn bucket_branches_restore_point_pin_key(branch_id: BucketBranchId) -> Vec<u8> {
	with_suffix(bucket_branch_record_base(branch_id), RESTORE_POINT_PIN_PATH)
}

pub fn bucket_branches_pin_count_key(branch_id: BucketBranchId) -> Vec<u8> {
	with_suffix(bucket_branch_record_base(branch_id), PIN_COUNT_PATH)
}

pub fn bucket_branches_database_name_tombstone_key(
	branch_id: BucketBranchId,
	database_id: &str,
) -> Vec<u8> {
	let mut key = with_suffix(
		bucket_branch_record_base(branch_id),
		DATABASE_TOMBSTONES_PATH,
	);
	append_database_id(&mut key, database_id);
	key
}

pub fn bucket_branches_database_tombstone_key(
	branch_id: BucketBranchId,
	database_id: DatabaseBranchId,
) -> Vec<u8> {
	let mut key = with_suffix(
		bucket_branch_record_base(branch_id),
		DATABASE_TOMBSTONES_PATH,
	);
	append_uuid(&mut key, database_id.as_uuid());
	key
}

pub fn bucket_branches_database_tombstone_prefix(branch_id: BucketBranchId) -> Vec<u8> {
	with_suffix(
		bucket_branch_record_base(branch_id),
		DATABASE_TOMBSTONES_PATH,
	)
}

pub fn decode_bucket_branches_database_tombstone_id(
	branch_id: BucketBranchId,
	key: &[u8],
) -> Result<DatabaseBranchId> {
	let prefix = bucket_branches_database_tombstone_prefix(branch_id);
	let suffix = key
		.strip_prefix(prefix.as_slice())
		.context("bucket database tombstone key did not start with expected prefix")?;
	ensure!(
		suffix.len() == std::mem::size_of::<uuid::Uuid>(),
		"bucket database tombstone key suffix had {} bytes, expected {}",
		suffix.len(),
		std::mem::size_of::<uuid::Uuid>()
	);
	let uuid = uuid::Uuid::from_slice(suffix).context("decode bucket database tombstone uuid")?;

	Ok(DatabaseBranchId::from_uuid(uuid))
}

pub fn bucket_catalog_key(
	bucket_branch_id: BucketBranchId,
	database_id: DatabaseBranchId,
) -> Vec<u8> {
	let mut key = bucket_catalog_prefix(bucket_branch_id);
	append_uuid(&mut key, database_id.as_uuid());
	key
}

pub fn bucket_catalog_prefix(bucket_branch_id: BucketBranchId) -> Vec<u8> {
	bucket_catalog_base(bucket_branch_id)
}

pub fn decode_bucket_catalog_database_id(
	bucket_branch_id: BucketBranchId,
	key: &[u8],
) -> Result<DatabaseBranchId> {
	let prefix = bucket_catalog_prefix(bucket_branch_id);
	let suffix = key
		.strip_prefix(prefix.as_slice())
		.context("bucket catalog key did not start with expected prefix")?;
	ensure!(
		suffix.len() == std::mem::size_of::<uuid::Uuid>(),
		"bucket catalog key suffix had {} bytes, expected {}",
		suffix.len(),
		std::mem::size_of::<uuid::Uuid>()
	);
	let uuid = uuid::Uuid::from_slice(suffix).context("decode bucket catalog database uuid")?;

	Ok(DatabaseBranchId::from_uuid(uuid))
}

pub fn branch_prefix(branch_id: DatabaseBranchId) -> Vec<u8> {
	database_branch_base(branch_id)
}

pub fn branch_range(branch_id: DatabaseBranchId) -> (Vec<u8>, Vec<u8>) {
	universaldb::tuple::Subspace::from_bytes(branch_prefix(branch_id)).range()
}

pub fn branch_meta_head_key(branch_id: DatabaseBranchId) -> Vec<u8> {
	with_suffix(database_branch_base(branch_id), META_HEAD_PATH)
}

pub fn branch_meta_head_at_fork_key(branch_id: DatabaseBranchId) -> Vec<u8> {
	with_suffix(database_branch_base(branch_id), META_HEAD_AT_FORK_PATH)
}

pub fn branch_meta_compact_key(branch_id: DatabaseBranchId) -> Vec<u8> {
	with_suffix(database_branch_base(branch_id), META_COMPACT_PATH)
}

pub fn branch_meta_cold_compact_key(branch_id: DatabaseBranchId) -> Vec<u8> {
	with_suffix(database_branch_base(branch_id), META_COLD_COMPACT_PATH)
}

pub fn branch_meta_quota_key(branch_id: DatabaseBranchId) -> Vec<u8> {
	with_suffix(database_branch_base(branch_id), META_QUOTA_PATH)
}

pub fn branch_meta_compactor_lease_key(branch_id: DatabaseBranchId) -> Vec<u8> {
	with_suffix(database_branch_base(branch_id), META_COMPACTOR_LEASE_PATH)
}

pub fn branch_meta_cold_lease_key(branch_id: DatabaseBranchId) -> Vec<u8> {
	with_suffix(database_branch_base(branch_id), META_COLD_LEASE_PATH)
}

pub fn branch_manifest_cold_drained_txid_key(branch_id: DatabaseBranchId) -> Vec<u8> {
	with_suffix(
		database_branch_base(branch_id),
		MANIFEST_COLD_DRAINED_TXID_PATH,
	)
}

pub fn branch_manifest_last_hot_pass_txid_key(branch_id: DatabaseBranchId) -> Vec<u8> {
	with_suffix(
		database_branch_base(branch_id),
		MANIFEST_LAST_HOT_PASS_TXID_PATH,
	)
}

pub fn branch_manifest_last_access_ts_ms_key(branch_id: DatabaseBranchId) -> Vec<u8> {
	with_suffix(
		database_branch_base(branch_id),
		MANIFEST_LAST_ACCESS_TS_MS_PATH,
	)
}

pub fn branch_manifest_last_access_bucket_key(branch_id: DatabaseBranchId) -> Vec<u8> {
	with_suffix(
		database_branch_base(branch_id),
		MANIFEST_LAST_ACCESS_BUCKET_PATH,
	)
}

/// Bookkeeping for one in-progress staged commit.
///
/// Distinct from compaction's `CMP/stage/`: that stages shard images for a compaction job, this
/// tracks an actor's partially written commit. The row exists only between `StageBegin` and
/// `Finalize`, plus whatever crash window follows an abandoned stage.
pub fn branch_commit_stage_key(branch_id: DatabaseBranchId, txid: u64) -> Vec<u8> {
	let mut key = with_suffix(database_branch_base(branch_id), CSTAGE_PATH);
	key.extend_from_slice(&txid.to_be_bytes());
	key
}

pub fn branch_commit_stage_prefix(branch_id: DatabaseBranchId) -> Vec<u8> {
	with_suffix(database_branch_base(branch_id), CSTAGE_PATH)
}

pub fn decode_branch_commit_stage_txid(branch_id: DatabaseBranchId, key: &[u8]) -> Result<u64> {
	let prefix = branch_commit_stage_prefix(branch_id);
	let suffix = key
		.strip_prefix(prefix.as_slice())
		.context("sqlite commit stage key missing branch prefix")?;
	let bytes: [u8; 8] = suffix
		.try_into()
		.map_err(|_| anyhow::anyhow!("sqlite commit stage key has a malformed txid suffix"))?;
	Ok(u64::from_be_bytes(bytes))
}

pub fn branch_compaction_root_key(branch_id: DatabaseBranchId) -> Vec<u8> {
	with_suffix(database_branch_base(branch_id), CMP_ROOT_PATH)
}

pub fn branch_compaction_cold_shard_prefix(branch_id: DatabaseBranchId) -> Vec<u8> {
	with_suffix(database_branch_base(branch_id), CMP_COLD_SHARD_PATH)
}

pub fn branch_compaction_retired_cold_object_prefix(branch_id: DatabaseBranchId) -> Vec<u8> {
	with_suffix(
		database_branch_base(branch_id),
		CMP_RETIRED_COLD_OBJECT_PATH,
	)
}

pub fn branch_compaction_stage_prefix(branch_id: DatabaseBranchId) -> Vec<u8> {
	with_suffix(database_branch_base(branch_id), CMP_STAGE_PATH)
}

pub fn branch_compaction_cold_shard_version_prefix(
	branch_id: DatabaseBranchId,
	shard_id: u32,
) -> Vec<u8> {
	let mut key = branch_compaction_cold_shard_prefix(branch_id);
	key.extend_from_slice(&shard_id.to_be_bytes());
	key.push(b'/');
	key
}

pub fn branch_compaction_cold_shard_key(
	branch_id: DatabaseBranchId,
	shard_id: u32,
	as_of_txid: u64,
) -> Vec<u8> {
	let mut key = branch_compaction_cold_shard_version_prefix(branch_id, shard_id);
	key.extend_from_slice(&as_of_txid.to_be_bytes());
	key
}

pub fn branch_compaction_fold_prefix(branch_id: DatabaseBranchId) -> Vec<u8> {
	with_suffix(database_branch_base(branch_id), CMP_FOLD_PATH)
}

pub fn branch_compaction_fold_key(branch_id: DatabaseBranchId, as_of_txid: u64) -> Vec<u8> {
	let mut key = branch_compaction_fold_prefix(branch_id);
	key.extend_from_slice(&as_of_txid.to_be_bytes());
	key
}

pub fn decode_branch_compaction_fold_txid(branch_id: DatabaseBranchId, key: &[u8]) -> Result<u64> {
	let prefix = branch_compaction_fold_prefix(branch_id);
	let suffix = key
		.strip_prefix(prefix.as_slice())
		.context("branch compaction fold key did not start with expected prefix")?;
	ensure!(
		suffix.len() == std::mem::size_of::<u64>(),
		"branch compaction fold key suffix had invalid length"
	);
	Ok(u64::from_be_bytes(
		suffix
			.try_into()
			.context("decode branch compaction fold txid")?,
	))
}

pub fn branch_compaction_retired_cold_object_key(
	branch_id: DatabaseBranchId,
	object_key_hash: [u8; 32],
) -> Vec<u8> {
	let mut key = with_suffix(
		database_branch_base(branch_id),
		CMP_RETIRED_COLD_OBJECT_PATH,
	);
	key.extend_from_slice(&object_key_hash);
	key
}

/// Prefix of everything one compaction job staged, whichever lane staged it. Used to enumerate the
/// job-id subspaces resident under `CMP/stage/` without reading the staged blobs themselves.
pub fn branch_compaction_stage_job_prefix(branch_id: DatabaseBranchId, job_id: Id) -> Vec<u8> {
	let mut key = with_suffix(database_branch_base(branch_id), CMP_STAGE_PATH);
	append_id(&mut key, job_id);
	key
}

/// Width of the fixed-size job id segment of a staging key.
const STAGE_JOB_ID_LEN: usize = 19;

/// Which lane staged the row at `key`, plus the job id that staged it, or `None` when the key is not
/// a staged row of this branch.
///
/// The hot and cold lanes clean up differently (hot clears FDB blobs, cold retires S3 objects), so
/// an orphan scan has to tell them apart from the key alone.
pub fn decode_branch_compaction_stage_job(
	branch_id: DatabaseBranchId,
	key: &[u8],
) -> Option<(Id, StagedJobLane)> {
	let prefix = with_suffix(database_branch_base(branch_id), CMP_STAGE_PATH);
	let rest = key.strip_prefix(prefix.as_slice())?;
	// Ids are fixed width, so the lane path starts immediately after the id. A future id variant of
	// a different width would silently stop matching every staging key and disable the orphan scan,
	// so assert the width rather than deriving the failure at runtime.
	debug_assert_eq!(Id::nil().as_bytes().len(), STAGE_JOB_ID_LEN);
	if rest.len() < STAGE_JOB_ID_LEN {
		return None;
	}
	let (id_bytes, lane_path) = rest.split_at(STAGE_JOB_ID_LEN);
	let job_id = Id::from_slice(id_bytes).ok()?;
	let lane = if lane_path.starts_with(CMP_STAGE_COLD_REF_PATH) {
		StagedJobLane::Cold
	} else if lane_path.starts_with(CMP_STAGE_HOT_REF_PATH)
		|| lane_path.starts_with(CMP_STAGE_HOT_SHARD_PATH)
	{
		StagedJobLane::Hot
	} else {
		return None;
	};

	Some((job_id, lane))
}

/// The compaction lane that owns a staged row.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StagedJobLane {
	Hot,
	Cold,
}

pub fn branch_compaction_stage_hot_shard_prefix(
	branch_id: DatabaseBranchId,
	job_id: Id,
) -> Vec<u8> {
	let mut key = with_suffix(database_branch_base(branch_id), CMP_STAGE_PATH);
	append_id(&mut key, job_id);
	key.extend_from_slice(CMP_STAGE_HOT_SHARD_PATH);
	key
}

pub fn branch_compaction_stage_hot_shard_version_prefix(
	branch_id: DatabaseBranchId,
	job_id: Id,
	shard_id: u32,
) -> Vec<u8> {
	let mut key = branch_compaction_stage_hot_shard_prefix(branch_id, job_id);
	key.extend_from_slice(&shard_id.to_be_bytes());
	key.push(b'/');
	key
}

/// Prefix of one staged hot shard version's chunk rows. Staged blobs are split into chunk rows the
/// same way as the live SHARD store so no staged value exceeds the FDB value cap.
pub fn branch_compaction_stage_hot_shard_txid_prefix(
	branch_id: DatabaseBranchId,
	job_id: Id,
	shard_id: u32,
	as_of_txid: u64,
) -> Vec<u8> {
	let mut key = branch_compaction_stage_hot_shard_version_prefix(branch_id, job_id, shard_id);
	key.extend_from_slice(&as_of_txid.to_be_bytes());
	key.push(b'/');
	key
}

/// Half-open key range covering every chunk row of one staged hot shard version.
pub fn branch_compaction_stage_hot_shard_txid_range(
	branch_id: DatabaseBranchId,
	job_id: Id,
	shard_id: u32,
	as_of_txid: u64,
) -> (Vec<u8>, Vec<u8>) {
	let begin =
		branch_compaction_stage_hot_shard_txid_prefix(branch_id, job_id, shard_id, as_of_txid);
	let end = end_of_key_range(&branch_compaction_stage_hot_shard_key(
		branch_id,
		job_id,
		shard_id,
		as_of_txid,
		u32::MAX,
	));
	(begin, end)
}

pub fn branch_compaction_stage_hot_shard_key(
	branch_id: DatabaseBranchId,
	job_id: Id,
	shard_id: u32,
	as_of_txid: u64,
	chunk_idx: u32,
) -> Vec<u8> {
	let mut key =
		branch_compaction_stage_hot_shard_txid_prefix(branch_id, job_id, shard_id, as_of_txid);
	key.extend_from_slice(&chunk_idx.to_be_bytes());
	key
}

/// Prefix of every staged hot shard ref row for one job. The companion writes one small ref row
/// per staged shard alongside the shard blob, so the manager install and reclaimer cleanup can
/// re-derive the drained ref set from FDB instead of carrying it through workflow state.
pub fn branch_compaction_stage_hot_ref_prefix(branch_id: DatabaseBranchId, job_id: Id) -> Vec<u8> {
	let mut key = with_suffix(database_branch_base(branch_id), CMP_STAGE_PATH);
	append_id(&mut key, job_id);
	key.extend_from_slice(CMP_STAGE_HOT_REF_PATH);
	key
}

/// Prefix of the staged hot shard ref rows produced by one drain slice, grouped by the slice's
/// `min_txid` (the drain cursor at stage time). The install re-derives the same cursor sequence, so
/// it scans exactly one slice's refs per install chunk.
pub fn branch_compaction_stage_hot_ref_slice_prefix(
	branch_id: DatabaseBranchId,
	job_id: Id,
	min_txid: u64,
) -> Vec<u8> {
	let mut key = branch_compaction_stage_hot_ref_prefix(branch_id, job_id);
	key.extend_from_slice(&min_txid.to_be_bytes());
	key.push(b'/');
	key
}

pub fn branch_compaction_stage_hot_ref_key(
	branch_id: DatabaseBranchId,
	job_id: Id,
	min_txid: u64,
	shard_id: u32,
	as_of_txid: u64,
) -> Vec<u8> {
	let mut key = branch_compaction_stage_hot_ref_slice_prefix(branch_id, job_id, min_txid);
	key.extend_from_slice(&shard_id.to_be_bytes());
	key.push(b'/');
	key.extend_from_slice(&as_of_txid.to_be_bytes());
	key
}

/// Prefix of every staged cold shard ref row for one job. The cold companion writes one ref row per
/// uploaded object so the manager publish and reclaimer orphan cleanup can re-derive the drained
/// ref set from FDB instead of carrying it through workflow state.
pub fn branch_compaction_stage_cold_ref_prefix(branch_id: DatabaseBranchId, job_id: Id) -> Vec<u8> {
	let mut key = with_suffix(database_branch_base(branch_id), CMP_STAGE_PATH);
	append_id(&mut key, job_id);
	key.extend_from_slice(CMP_STAGE_COLD_REF_PATH);
	key
}

/// Prefix of the staged cold shard ref rows produced by one drained boundary, grouped by the
/// boundary's `as_of_txid`. The publish re-derives the same boundary sequence, so it scans exactly
/// one boundary's refs per publish chunk.
pub fn branch_compaction_stage_cold_ref_boundary_prefix(
	branch_id: DatabaseBranchId,
	job_id: Id,
	as_of_txid: u64,
) -> Vec<u8> {
	let mut key = branch_compaction_stage_cold_ref_prefix(branch_id, job_id);
	key.extend_from_slice(&as_of_txid.to_be_bytes());
	key.push(b'/');
	key
}

pub fn branch_compaction_stage_cold_ref_key(
	branch_id: DatabaseBranchId,
	job_id: Id,
	as_of_txid: u64,
	shard_id: u32,
) -> Vec<u8> {
	let mut key = branch_compaction_stage_cold_ref_boundary_prefix(branch_id, job_id, as_of_txid);
	key.extend_from_slice(&shard_id.to_be_bytes());
	key
}

pub fn branch_commit_key(branch_id: DatabaseBranchId, txid: u64) -> Vec<u8> {
	let mut key = branch_commit_prefix(branch_id);
	key.extend_from_slice(&txid.to_be_bytes());
	key
}

pub fn branch_commit_prefix(branch_id: DatabaseBranchId) -> Vec<u8> {
	with_suffix(database_branch_base(branch_id), COMMITS_PATH)
}

pub fn branch_vtx_key(branch_id: DatabaseBranchId, versionstamp: [u8; 16]) -> Vec<u8> {
	let mut key = branch_vtx_prefix(branch_id);
	key.extend_from_slice(&versionstamp);
	key
}

pub fn branch_vtx_prefix(branch_id: DatabaseBranchId) -> Vec<u8> {
	with_suffix(database_branch_base(branch_id), VTX_PATH)
}

pub fn branch_pitr_interval_key(branch_id: DatabaseBranchId, bucket_start_ms: i64) -> Vec<u8> {
	let mut key = branch_pitr_interval_prefix(branch_id);
	key.extend_from_slice(&bucket_start_ms.to_be_bytes());
	key
}

pub fn branch_pitr_interval_prefix(branch_id: DatabaseBranchId) -> Vec<u8> {
	with_suffix(database_branch_base(branch_id), PITR_INTERVAL_PATH)
}

pub fn decode_branch_pitr_interval_bucket(branch_id: DatabaseBranchId, key: &[u8]) -> Result<i64> {
	let prefix = branch_pitr_interval_prefix(branch_id);
	let suffix = key
		.strip_prefix(prefix.as_slice())
		.context("branch PITR interval key did not start with expected prefix")?;
	ensure!(
		suffix.len() == std::mem::size_of::<i64>(),
		"branch PITR interval key suffix had {} bytes, expected {}",
		suffix.len(),
		std::mem::size_of::<i64>()
	);

	Ok(i64::from_be_bytes(suffix.try_into().context(
		"branch PITR interval suffix should decode as i64",
	)?))
}

pub fn branch_pidx_key(branch_id: DatabaseBranchId, pgno: u32) -> Vec<u8> {
	let mut key = with_suffix(database_branch_base(branch_id), BR_PIDX_PATH);
	key.extend_from_slice(&pgno.to_be_bytes());
	key
}

pub fn branch_pidx_prefix(branch_id: DatabaseBranchId) -> Vec<u8> {
	with_suffix(database_branch_base(branch_id), BR_PIDX_PATH)
}

/// Marks that the stale-PIDX repair sweep has walked this branch's whole `PIDX` prefix once. The
/// sweep exists to clear rows stranded by hot slices that folded a page without clearing its PIDX
/// row; once drained, re-walking would re-read every live row of the branch on every reclaim pass
/// for nothing, so the marker retires it. Absence means "not yet swept", which is the correct
/// default for every branch that existed before the sweep shipped. The value is the hot watermark
/// the walk ran at, and it is always nonzero: a walk below the first fold has nothing it could
/// classify stale, so it never claims the marker.
pub fn branch_compaction_pidx_repair_key(branch_id: DatabaseBranchId) -> Vec<u8> {
	with_suffix(database_branch_base(branch_id), CMP_PIDX_REPAIR_PATH)
}

/// Last observed position of the reclaim drain's two windowed scans. The cursors themselves live in
/// the reclaimer's durable `loope` state, which is only readable by decoding Gasoline history, so
/// this row exists purely so an operator can tell a drain that is making progress from one whose
/// cursor is pinned. Nothing reads it back: it is diagnostic output, never an input to planning.
pub fn branch_compaction_reclaim_progress_key(branch_id: DatabaseBranchId) -> Vec<u8> {
	with_suffix(database_branch_base(branch_id), CMP_RECLAIM_PROGRESS_PATH)
}

pub fn branch_delta_prefix(branch_id: DatabaseBranchId) -> Vec<u8> {
	with_suffix(database_branch_base(branch_id), DELTA_PATH)
}

pub fn branch_delta_chunk_prefix(branch_id: DatabaseBranchId, txid: u64) -> Vec<u8> {
	let mut key = branch_delta_prefix(branch_id);
	key.extend_from_slice(&txid.to_be_bytes());
	key.push(b'/');
	key
}

pub fn branch_delta_chunk_key(branch_id: DatabaseBranchId, txid: u64, chunk_idx: u32) -> Vec<u8> {
	let mut key = branch_delta_chunk_prefix(branch_id, txid);
	key.extend_from_slice(&chunk_idx.to_be_bytes());
	key
}

/// Prefix of one delta segment's chunk rows.
///
/// A segment is a self-contained LTX blob covering a shard-aligned page range of one commit, keyed
/// by the first page number it carries. Keying by first page rather than by an ordinal is what makes
/// the segment holding page `P` findable with a single reverse range read over
/// `[branch_delta_chunk_prefix(txid), branch_delta_segment_prefix(txid, P + 1))`: segments are
/// ascending and disjoint, so the last one at or below `P` is the only one that can hold it. An
/// ordinal would need a manifest, or a scan that grows with segment count.
pub fn branch_delta_segment_prefix(
	branch_id: DatabaseBranchId,
	txid: u64,
	first_pgno: u32,
) -> Vec<u8> {
	let mut key = branch_delta_chunk_prefix(branch_id, txid);
	key.extend_from_slice(&first_pgno.to_be_bytes());
	key.push(b'/');
	key
}

pub fn branch_delta_segment_chunk_key(
	branch_id: DatabaseBranchId,
	txid: u64,
	first_pgno: u32,
	chunk_idx: u32,
) -> Vec<u8> {
	let mut key = branch_delta_segment_prefix(branch_id, txid, first_pgno);
	key.extend_from_slice(&chunk_idx.to_be_bytes());
	key
}

/// Half-open key range covering every row of one txid's delta, in either layout.
///
/// The exclusive end must sit past the largest possible suffix rather than at the next txid's
/// prefix, so a caller can bound a scan on one txid without assuming how wide a suffix is. A
/// segmented key is a legacy key plus further bytes, so the largest segmented key dominates the
/// largest legacy one and a single bound covers both layouts. `end_of_key_range` appends `0x00` to a
/// full key, so it excludes exactly that key's children and nothing beyond.
pub fn branch_delta_txid_range(branch_id: DatabaseBranchId, txid: u64) -> (Vec<u8>, Vec<u8>) {
	let begin = branch_delta_chunk_prefix(branch_id, txid);
	let end = end_of_key_range(&branch_delta_segment_chunk_key(
		branch_id,
		txid,
		u32::MAX,
		u32::MAX,
	));
	(begin, end)
}

/// Exclusive scan end that includes every row of every delta at or below `max_txid`, including the
/// chunk rows of `max_txid` itself.
pub fn branch_delta_txid_scan_end(branch_id: DatabaseBranchId, max_txid: u64) -> Vec<u8> {
	branch_delta_txid_range(branch_id, max_txid).1
}

pub fn decode_branch_delta_chunk_txid(branch_id: DatabaseBranchId, key: &[u8]) -> Result<u64> {
	let prefix = branch_delta_prefix(branch_id);
	ensure!(
		key.starts_with(&prefix),
		"branch delta key did not start with expected prefix"
	);
	let suffix = &key[prefix.len()..];
	ensure!(
		suffix.len() >= std::mem::size_of::<u64>() + 1,
		"branch delta key suffix had {} bytes, expected at least {}",
		suffix.len(),
		std::mem::size_of::<u64>() + 1
	);
	ensure!(
		suffix[std::mem::size_of::<u64>()] == b'/',
		"branch delta key missing txid/chunk separator"
	);

	Ok(u64::from_be_bytes(
		suffix[..std::mem::size_of::<u64>()]
			.try_into()
			.context("branch delta txid suffix should decode as u64")?,
	))
}

/// Which delta layout a chunk row belongs to.
///
/// The two are told apart by suffix width alone: a pre-segmentation row carries a bare 4-byte chunk
/// index, a segmented row carries `{first_pgno}/{chunk_idx}` in 9. A txid is written exactly once as
/// one or the other, never mixed, so a reader classifies per row and never has to reconcile the two
/// within a commit.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum DeltaChunkRef {
	/// Pre-segmentation: one blob per txid, chunked directly under the txid prefix.
	Legacy { chunk_idx: u32 },
	/// One blob per shard-aligned page range of the txid.
	Segment { first_pgno: u32, chunk_idx: u32 },
}

impl DeltaChunkRef {
	pub fn chunk_idx(self) -> u32 {
		match self {
			Self::Legacy { chunk_idx } => chunk_idx,
			Self::Segment { chunk_idx, .. } => chunk_idx,
		}
	}

	/// The first page of the owning segment, or `None` for a legacy row, whose single blob covers
	/// the whole commit and therefore has no segment identity.
	pub fn first_pgno(self) -> Option<u32> {
		match self {
			Self::Legacy { .. } => None,
			Self::Segment { first_pgno, .. } => Some(first_pgno),
		}
	}
}

const DELTA_SEGMENT_SUFFIX_LEN: usize = std::mem::size_of::<u32>() + 1 + std::mem::size_of::<u32>();

pub fn decode_branch_delta_chunk_ref(
	branch_id: DatabaseBranchId,
	txid: u64,
	key: &[u8],
) -> Result<DeltaChunkRef> {
	let prefix = branch_delta_chunk_prefix(branch_id, txid);
	ensure!(
		key.starts_with(&prefix),
		"branch delta chunk key did not start with expected prefix"
	);
	let suffix = &key[prefix.len()..];

	if suffix.len() == std::mem::size_of::<u32>() {
		return Ok(DeltaChunkRef::Legacy {
			chunk_idx: u32::from_be_bytes(
				suffix
					.try_into()
					.context("branch delta chunk suffix should decode as u32")?,
			),
		});
	}

	ensure!(
		suffix.len() == DELTA_SEGMENT_SUFFIX_LEN,
		"branch delta chunk key suffix had {} bytes, expected {} (legacy) or {} (segmented)",
		suffix.len(),
		std::mem::size_of::<u32>(),
		DELTA_SEGMENT_SUFFIX_LEN
	);
	let (first_pgno, rest) = suffix.split_at(std::mem::size_of::<u32>());
	ensure!(
		rest[0] == b'/',
		"branch delta segment key missing first_pgno/chunk separator"
	);

	Ok(DeltaChunkRef::Segment {
		first_pgno: u32::from_be_bytes(
			first_pgno
				.try_into()
				.context("branch delta segment first_pgno should decode as u32")?,
		),
		chunk_idx: u32::from_be_bytes(
			rest[1..]
				.try_into()
				.context("branch delta segment chunk suffix should decode as u32")?,
		),
	})
}

pub fn branch_shard_prefix(branch_id: DatabaseBranchId) -> Vec<u8> {
	with_suffix(database_branch_base(branch_id), SHARD_PATH)
}

pub fn branch_shard_version_prefix(branch_id: DatabaseBranchId, shard_id: u32) -> Vec<u8> {
	let mut key = branch_shard_prefix(branch_id);
	key.extend_from_slice(&shard_id.to_be_bytes());
	key.push(b'/');
	key
}

pub fn branch_shard_key(branch_id: DatabaseBranchId, shard_id: u32, as_of_txid: u64) -> Vec<u8> {
	let mut key = branch_shard_version_prefix(branch_id, shard_id);
	key.extend_from_slice(&as_of_txid.to_be_bytes());
	key
}

/// Prefix of one shard version's chunk rows. A shard image is stored as ordered chunk rows under
/// `SHARD/{shard_id}/{as_of_txid}/{chunk_idx}` so no single FDB value exceeds the 100 KB cap; a
/// value sitting directly at the bare `branch_shard_key` is a pre-chunking legacy row read as a
/// one-chunk blob.
pub fn branch_shard_chunk_prefix(
	branch_id: DatabaseBranchId,
	shard_id: u32,
	as_of_txid: u64,
) -> Vec<u8> {
	let mut key = branch_shard_key(branch_id, shard_id, as_of_txid);
	key.push(b'/');
	key
}

pub fn branch_shard_chunk_key(
	branch_id: DatabaseBranchId,
	shard_id: u32,
	as_of_txid: u64,
	chunk_idx: u32,
) -> Vec<u8> {
	let mut key = branch_shard_chunk_prefix(branch_id, shard_id, as_of_txid);
	key.extend_from_slice(&chunk_idx.to_be_bytes());
	key
}

/// Half-open key range covering every row of one shard version: the bare legacy key plus all chunk
/// rows under it. The legacy key is a proper prefix of its chunk keys, so it sorts first and one
/// range covers both formats.
pub fn branch_shard_version_range(
	branch_id: DatabaseBranchId,
	shard_id: u32,
	as_of_txid: u64,
) -> (Vec<u8>, Vec<u8>) {
	let begin = branch_shard_key(branch_id, shard_id, as_of_txid);
	let end = end_of_key_range(&branch_shard_chunk_key(
		branch_id,
		shard_id,
		as_of_txid,
		u32::MAX,
	));
	(begin, end)
}

/// Exclusive scan end that includes every row of every version at or below `max_txid`, including
/// the chunk rows of `max_txid` itself. `end_of_key_range(branch_shard_key(max_txid))` is not
/// enough because chunk rows sort after the bare version key.
pub fn branch_shard_version_scan_end(
	branch_id: DatabaseBranchId,
	shard_id: u32,
	max_txid: u64,
) -> Vec<u8> {
	branch_shard_version_range(branch_id, shard_id, max_txid).1
}

/// Decodes any `SHARD` row key into `(shard_id, as_of_txid, chunk_idx)`. `chunk_idx` is `None` for
/// a pre-chunking legacy row that stores the whole blob at the bare version key.
pub fn decode_branch_shard_row_key(
	branch_id: DatabaseBranchId,
	key: &[u8],
) -> Result<(u32, u64, Option<u32>)> {
	const SHARD_ID_LEN: usize = std::mem::size_of::<u32>();
	const TXID_LEN: usize = std::mem::size_of::<u64>();
	const CHUNK_LEN: usize = std::mem::size_of::<u32>();

	let prefix = branch_shard_prefix(branch_id);
	let suffix = key
		.strip_prefix(prefix.as_slice())
		.context("branch shard row key did not start with expected prefix")?;
	ensure!(
		suffix.len() >= SHARD_ID_LEN + 1 + TXID_LEN && suffix[SHARD_ID_LEN] == b'/',
		"branch shard row key suffix had invalid length"
	);
	let shard_id = u32::from_be_bytes(
		suffix[..SHARD_ID_LEN]
			.try_into()
			.context("decode branch shard id")?,
	);
	let as_of_txid = u64::from_be_bytes(
		suffix[SHARD_ID_LEN + 1..SHARD_ID_LEN + 1 + TXID_LEN]
			.try_into()
			.context("decode branch shard txid")?,
	);
	let rest = &suffix[SHARD_ID_LEN + 1 + TXID_LEN..];
	let chunk_idx = if rest.is_empty() {
		None
	} else {
		ensure!(
			rest.len() == 1 + CHUNK_LEN && rest[0] == b'/',
			"branch shard row key chunk suffix had invalid length"
		);
		Some(u32::from_be_bytes(
			rest[1..]
				.try_into()
				.context("decode branch shard chunk index")?,
		))
	};

	Ok((shard_id, as_of_txid, chunk_idx))
}

/// Authoritative per-shard access bucket, written with atomic max on the read/commit path and read by
/// shard cache eviction to decide whether a shard is still recently accessed.
pub fn branch_shard_access_key(branch_id: DatabaseBranchId, shard_id: u32) -> Vec<u8> {
	let mut key = with_suffix(database_branch_base(branch_id), SHARD_ACCESS_PATH);
	key.extend_from_slice(&shard_id.to_be_bytes());
	key
}

pub fn branch_shard_lru_prefix(branch_id: DatabaseBranchId) -> Vec<u8> {
	with_suffix(database_branch_base(branch_id), SHARD_LRU_PATH)
}

/// Per-shard recency index keyed by access bucket then shard id. Eviction scans the expired-bucket
/// portion of this prefix to discover candidate shards without scanning every `SHARD` version.
pub fn branch_shard_lru_key(
	branch_id: DatabaseBranchId,
	access_bucket: i64,
	shard_id: u32,
) -> Vec<u8> {
	let mut key = branch_shard_lru_prefix(branch_id);
	key.extend_from_slice(&access_bucket.to_be_bytes());
	key.push(b'/');
	key.extend_from_slice(&shard_id.to_be_bytes());
	key
}

pub fn branch_shard_lru_range(branch_id: DatabaseBranchId) -> (Vec<u8>, Vec<u8>) {
	universaldb::tuple::Subspace::from_bytes(branch_shard_lru_prefix(branch_id)).range()
}

/// Exclusive upper bound for LRU entries whose access bucket is strictly below `bucket`. Buckets are
/// non-negative big-endian i64 values, so this is the start of bucket `bucket`'s own subrange.
pub fn branch_shard_lru_bucket_bound(branch_id: DatabaseBranchId, bucket: i64) -> Vec<u8> {
	let mut key = branch_shard_lru_prefix(branch_id);
	key.extend_from_slice(&bucket.to_be_bytes());
	key
}

pub fn decode_branch_shard_lru_key(branch_id: DatabaseBranchId, key: &[u8]) -> Result<(i64, u32)> {
	let prefix = branch_shard_lru_prefix(branch_id);
	let suffix = key
		.strip_prefix(prefix.as_slice())
		.context("branch shard LRU key did not start with expected prefix")?;
	let expected_len = std::mem::size_of::<i64>() + 1 + std::mem::size_of::<u32>();
	ensure!(
		suffix.len() == expected_len && suffix[std::mem::size_of::<i64>()] == b'/',
		"branch shard LRU key suffix had invalid length"
	);
	let bucket = i64::from_be_bytes(
		suffix[..std::mem::size_of::<i64>()]
			.try_into()
			.context("decode branch shard LRU bucket")?,
	);
	let shard_id = u32::from_be_bytes(
		suffix[std::mem::size_of::<i64>() + 1..]
			.try_into()
			.context("decode branch shard LRU shard id")?,
	);
	Ok((bucket, shard_id))
}

pub fn ctr_quota_global_key() -> Vec<u8> {
	with_suffix(partition_prefix(CTR_PARTITION), CTR_QUOTA_GLOBAL_PATH)
}

pub fn ctr_eviction_index_key(last_access_bucket: i64, branch_id: DatabaseBranchId) -> Vec<u8> {
	let mut key = with_suffix(partition_prefix(CTR_PARTITION), CTR_EVICTION_INDEX_PATH);
	key.extend_from_slice(&last_access_bucket.to_be_bytes());
	key.push(b'/');
	append_uuid(&mut key, branch_id.as_uuid());
	key
}

pub fn ctr_eviction_index_prefix() -> Vec<u8> {
	with_suffix(partition_prefix(CTR_PARTITION), CTR_EVICTION_INDEX_PATH)
}

pub fn ctr_eviction_index_range() -> (Vec<u8>, Vec<u8>) {
	universaldb::tuple::Subspace::from_bytes(ctr_eviction_index_prefix()).range()
}

pub fn decode_ctr_eviction_index_key(key: &[u8]) -> Result<(i64, DatabaseBranchId)> {
	let prefix = ctr_eviction_index_prefix();
	let suffix = key
		.strip_prefix(prefix.as_slice())
		.context("eviction index key did not start with expected prefix")?;
	let expected_len = std::mem::size_of::<i64>() + 1 + std::mem::size_of::<uuid::Uuid>();
	ensure!(
		suffix.len() == expected_len,
		"eviction index key suffix had {} bytes, expected {}",
		suffix.len(),
		expected_len
	);
	let bucket_bytes: [u8; std::mem::size_of::<i64>()] = suffix[..8]
		.try_into()
		.context("decode eviction index bucket")?;
	ensure!(
		suffix[8] == b'/',
		"eviction index key missing branch separator"
	);
	let branch_id =
		uuid::Uuid::from_slice(&suffix[9..]).context("decode eviction index branch id")?;

	Ok((
		i64::from_be_bytes(bucket_bytes),
		DatabaseBranchId::from_uuid(branch_id),
	))
}

pub fn restore_point_prefix(database_id: &str) -> Vec<u8> {
	let mut key = with_suffix(
		partition_prefix(RESTORE_POINT_PARTITION),
		RESTORE_POINT_PATH,
	);
	append_database_id(&mut key, database_id);
	key.push(b'/');
	key
}

pub fn restore_point_key(database_id: &str, restore_point: &str) -> Vec<u8> {
	let mut key = restore_point_prefix(database_id);
	key.extend_from_slice(restore_point.as_bytes());
	key
}

pub fn compactor_enqueue_key(ts_ms: i64, database_id: &str, kind: CompactorQueueKind) -> Vec<u8> {
	let mut key = with_suffix(partition_prefix(CMPC_PARTITION), CMPC_ENQUEUE_PATH);
	key.extend_from_slice(&ts_ms.to_be_bytes());
	key.push(b'/');
	append_database_id(&mut key, database_id);
	key.push(b'/');
	key.push(kind.as_byte());
	key
}

pub fn compactor_global_lease_key(kind: CompactorQueueKind) -> Vec<u8> {
	let mut key = with_suffix(partition_prefix(CMPC_PARTITION), CMPC_LEASE_GLOBAL_PATH);
	key.push(kind.as_byte());
	key
}

pub fn db_pin_key(branch_id: DatabaseBranchId, pin_id: &[u8]) -> Vec<u8> {
	let mut key = db_pin_prefix(branch_id);
	key.extend_from_slice(pin_id);
	key
}

pub fn db_pin_prefix(branch_id: DatabaseBranchId) -> Vec<u8> {
	let mut key = with_suffix(partition_prefix(DB_PIN_PARTITION), DB_PIN_PATH);
	append_uuid(&mut key, branch_id.as_uuid());
	key.push(b'/');
	key
}

pub fn bucket_fork_pin_key(
	source_bucket_branch_id: BucketBranchId,
	fork_versionstamp: [u8; 16],
	target_bucket_branch_id: BucketBranchId,
) -> Vec<u8> {
	let mut key = bucket_fork_pin_prefix(source_bucket_branch_id);
	key.extend_from_slice(&fork_versionstamp);
	key.push(b'/');
	append_uuid(&mut key, target_bucket_branch_id.as_uuid());
	key
}

pub fn bucket_fork_pin_prefix(source_bucket_branch_id: BucketBranchId) -> Vec<u8> {
	let mut key = with_suffix(
		partition_prefix(BUCKET_FORK_PIN_PARTITION),
		BUCKET_FORK_PIN_PATH,
	);
	append_uuid(&mut key, source_bucket_branch_id.as_uuid());
	key.push(b'/');
	key
}

pub fn bucket_child_key(
	source_bucket_branch_id: BucketBranchId,
	fork_versionstamp: [u8; 16],
	target_bucket_branch_id: BucketBranchId,
) -> Vec<u8> {
	let mut key = bucket_child_prefix(source_bucket_branch_id);
	key.extend_from_slice(&fork_versionstamp);
	key.push(b'/');
	append_uuid(&mut key, target_bucket_branch_id.as_uuid());
	key
}

pub fn bucket_child_prefix(source_bucket_branch_id: BucketBranchId) -> Vec<u8> {
	let mut key = with_suffix(partition_prefix(BUCKET_CHILD_PARTITION), BUCKET_CHILD_PATH);
	append_uuid(&mut key, source_bucket_branch_id.as_uuid());
	key.push(b'/');
	key
}

pub fn bucket_catalog_by_db_key(
	database_branch_id: DatabaseBranchId,
	bucket_branch_id: BucketBranchId,
) -> Vec<u8> {
	let mut key = bucket_catalog_by_db_prefix(database_branch_id);
	append_uuid(&mut key, bucket_branch_id.as_uuid());
	key
}

pub fn bucket_catalog_by_db_prefix(database_branch_id: DatabaseBranchId) -> Vec<u8> {
	let mut key = with_suffix(
		partition_prefix(BUCKET_CATALOG_BY_DB_PARTITION),
		BUCKET_CATALOG_BY_DB_PATH,
	);
	append_uuid(&mut key, database_branch_id.as_uuid());
	key.push(b'/');
	key
}

pub fn bucket_proof_epoch_key(root_bucket_branch_id: BucketBranchId) -> Vec<u8> {
	let mut key = with_suffix(
		partition_prefix(BUCKET_PROOF_EPOCH_PARTITION),
		BUCKET_PROOF_EPOCH_PATH,
	);
	append_uuid(&mut key, root_bucket_branch_id.as_uuid());
	key
}

pub fn sqlite_cmp_dirty_key(branch_id: DatabaseBranchId) -> Vec<u8> {
	let mut key = with_suffix(
		partition_prefix(SQLITE_CMP_DIRTY_PARTITION),
		SQLITE_CMP_DIRTY_PATH,
	);
	append_uuid(&mut key, branch_id.as_uuid());
	key
}

/// Reverse index for the DBPTR row that currently points at a database branch. Written alongside
/// every `database_pointer_cur_key` write so background compaction can resolve a branch's owning
/// bucket branch and database id with one point read instead of scanning the whole DBPTR partition.
pub fn database_branch_owner_key(branch_id: DatabaseBranchId) -> Vec<u8> {
	let mut key = with_suffix(
		partition_prefix(DB_BRANCH_OWNER_PARTITION),
		DB_BRANCH_OWNER_PATH,
	);
	append_uuid(&mut key, branch_id.as_uuid());
	key
}

// Legacy database-scoped keys are v1-only compatibility helpers for pegboard actors.
pub fn meta_head_key(database_id: &str) -> Vec<u8> {
	let prefix = database_prefix(database_id);
	let mut key = Vec::with_capacity(prefix.len() + META_HEAD_PATH.len());
	key.extend_from_slice(&prefix);
	key.extend_from_slice(META_HEAD_PATH);
	key
}

pub fn meta_compact_key(database_id: &str) -> Vec<u8> {
	let prefix = database_prefix(database_id);
	let mut key = Vec::with_capacity(prefix.len() + META_COMPACT_PATH.len());
	key.extend_from_slice(&prefix);
	key.extend_from_slice(META_COMPACT_PATH);
	key
}

pub fn meta_quota_key(database_id: &str) -> Vec<u8> {
	let prefix = database_prefix(database_id);
	let mut key = Vec::with_capacity(prefix.len() + META_QUOTA_PATH.len());
	key.extend_from_slice(&prefix);
	key.extend_from_slice(META_QUOTA_PATH);
	key
}

pub fn meta_compactor_lease_key(database_id: &str) -> Vec<u8> {
	let prefix = database_prefix(database_id);
	let mut key = Vec::with_capacity(prefix.len() + META_COMPACTOR_LEASE_PATH.len());
	key.extend_from_slice(&prefix);
	key.extend_from_slice(META_COMPACTOR_LEASE_PATH);
	key
}

pub fn commit_key(database_id: &str, txid: u64) -> Vec<u8> {
	let mut key = commit_prefix(database_id);
	key.extend_from_slice(&txid.to_be_bytes());
	key
}

pub fn commit_prefix(database_id: &str) -> Vec<u8> {
	let prefix = database_prefix(database_id);
	let mut key = Vec::with_capacity(prefix.len() + COMMITS_PATH.len());
	key.extend_from_slice(&prefix);
	key.extend_from_slice(COMMITS_PATH);
	key
}

pub fn vtx_key(database_id: &str, versionstamp: [u8; 16]) -> Vec<u8> {
	let mut key = vtx_prefix(database_id);
	key.extend_from_slice(&versionstamp);
	key
}

pub fn vtx_prefix(database_id: &str) -> Vec<u8> {
	let prefix = database_prefix(database_id);
	let mut key = Vec::with_capacity(prefix.len() + VTX_PATH.len());
	key.extend_from_slice(&prefix);
	key.extend_from_slice(VTX_PATH);
	key
}

pub fn shard_key(database_id: &str, shard_id: u32) -> Vec<u8> {
	let prefix = database_prefix(database_id);
	let mut key = Vec::with_capacity(prefix.len() + SHARD_PATH.len() + std::mem::size_of::<u32>());
	key.extend_from_slice(&prefix);
	key.extend_from_slice(SHARD_PATH);
	key.extend_from_slice(&shard_id.to_be_bytes());
	key
}

pub fn shard_version_prefix(database_id: &str, shard_id: u32) -> Vec<u8> {
	let mut key = shard_key(database_id, shard_id);
	key.push(b'/');
	key
}

pub fn shard_version_key(database_id: &str, shard_id: u32, as_of_txid: u64) -> Vec<u8> {
	let mut key = shard_version_prefix(database_id, shard_id);
	key.extend_from_slice(&as_of_txid.to_be_bytes());
	key
}

// Legacy database-scoped prefix kept for v1 pegboard actor cleanup.
pub fn shard_prefix(database_id: &str) -> Vec<u8> {
	let prefix = database_prefix(database_id);
	let mut key = Vec::with_capacity(prefix.len() + SHARD_PATH.len());
	key.extend_from_slice(&prefix);
	key.extend_from_slice(SHARD_PATH);
	key
}

// Legacy database-scoped prefix kept for v1 pegboard actor cleanup.
pub fn delta_prefix(database_id: &str) -> Vec<u8> {
	let prefix = database_prefix(database_id);
	let mut key = Vec::with_capacity(prefix.len() + DELTA_PATH.len());
	key.extend_from_slice(&prefix);
	key.extend_from_slice(DELTA_PATH);
	key
}

pub fn delta_chunk_prefix(database_id: &str, txid: u64) -> Vec<u8> {
	let prefix = database_prefix(database_id);
	let mut key =
		Vec::with_capacity(prefix.len() + DELTA_PATH.len() + std::mem::size_of::<u64>() + 1);
	key.extend_from_slice(&prefix);
	key.extend_from_slice(DELTA_PATH);
	key.extend_from_slice(&txid.to_be_bytes());
	key.push(b'/');
	key
}

pub fn delta_chunk_key(database_id: &str, txid: u64, chunk_idx: u32) -> Vec<u8> {
	let prefix = delta_chunk_prefix(database_id, txid);
	let mut key = Vec::with_capacity(prefix.len() + std::mem::size_of::<u32>());
	key.extend_from_slice(&prefix);
	key.extend_from_slice(&chunk_idx.to_be_bytes());
	key
}

pub fn pidx_delta_key(database_id: &str, pgno: u32) -> Vec<u8> {
	let prefix = database_prefix(database_id);
	let mut key =
		Vec::with_capacity(prefix.len() + PIDX_DELTA_PATH.len() + std::mem::size_of::<u32>());
	key.extend_from_slice(&prefix);
	key.extend_from_slice(PIDX_DELTA_PATH);
	key.extend_from_slice(&pgno.to_be_bytes());
	key
}

// Legacy database-scoped prefix kept for v1 pegboard actor cleanup.
pub fn pidx_delta_prefix(database_id: &str) -> Vec<u8> {
	let prefix = database_prefix(database_id);
	let mut key = Vec::with_capacity(prefix.len() + PIDX_DELTA_PATH.len());
	key.extend_from_slice(&prefix);
	key.extend_from_slice(PIDX_DELTA_PATH);
	key
}

pub fn decode_delta_chunk_txid(database_id: &str, key: &[u8]) -> Result<u64> {
	let prefix = delta_prefix(database_id);
	ensure!(
		key.starts_with(&prefix),
		"delta key did not start with expected prefix"
	);
	let suffix = &key[prefix.len()..];
	ensure!(
		suffix.len() >= std::mem::size_of::<u64>() + 1,
		"delta key suffix had {} bytes, expected at least {}",
		suffix.len(),
		std::mem::size_of::<u64>() + 1
	);
	ensure!(
		suffix[std::mem::size_of::<u64>()] == b'/',
		"delta key missing txid/chunk separator"
	);

	Ok(u64::from_be_bytes(
		suffix[..std::mem::size_of::<u64>()]
			.try_into()
			.context("delta txid suffix should decode as u64")?,
	))
}

pub fn decode_delta_chunk_idx(database_id: &str, txid: u64, key: &[u8]) -> Result<u32> {
	let prefix = delta_chunk_prefix(database_id, txid);
	ensure!(
		key.starts_with(&prefix),
		"delta chunk key did not start with expected prefix"
	);
	let suffix = &key[prefix.len()..];
	ensure!(
		suffix.len() == std::mem::size_of::<u32>(),
		"delta chunk key suffix had {} bytes, expected {}",
		suffix.len(),
		std::mem::size_of::<u32>()
	);

	Ok(u32::from_be_bytes(
		suffix
			.try_into()
			.context("delta chunk suffix should decode as u32")?,
	))
}
