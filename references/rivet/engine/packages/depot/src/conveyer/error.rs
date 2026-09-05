use rivet_error::RivetError;
use serde::Serialize;
use std::fmt;

pub use depot_client_types::{
	HEAD_FENCE_MISMATCH_CODE, HEAD_FENCE_MISMATCH_GROUP, is_head_fence_mismatch,
};

#[derive(Debug, Clone, PartialEq, Eq, RivetError)]
#[error("depot")]
pub enum SqliteStorageError {
	#[error(
		"meta_missing",
		"SQLite metadata is missing.",
		"SQLite metadata is missing for {operation}."
	)]
	MetaMissing { operation: &'static str },

	#[cfg(debug_assertions)]
	#[error(
		"fence_mismatch",
		"Depot debug fence mismatch.",
		"Depot debug fence mismatch: {reason}."
	)]
	FenceMismatch { reason: String },

	#[error(
		"commit_too_large",
		"SQLite commit payload is too large.",
		"SQLite commit payload is too large. Raw dirty pages were {actual_size_bytes} bytes, limit is {max_size_bytes} bytes."
	)]
	CommitTooLarge {
		actual_size_bytes: u64,
		max_size_bytes: u64,
	},

	#[error(
		"head_fence_mismatch",
		"SQLite head fence mismatch.",
		"SQLite head fence mismatch. Expected head txid {expected_head_txid}, but current head txid is {actual_head_txid}."
	)]
	HeadFenceMismatch {
		expected_head_txid: u64,
		actual_head_txid: u64,
	},

	#[error(
		"stage_not_found",
		"SQLite staged commit segment is missing.",
		"SQLite staged commit segment is missing. Finalize claimed a segment at page {first_pgno} for txid {txid}, but nothing is staged there."
	)]
	StageNotFound { txid: u64, first_pgno: u32 },

	#[error(
		"stage_segment_invalid",
		"SQLite staged commit segment is invalid.",
		"SQLite staged commit segment is invalid: {reason}."
	)]
	StageSegmentInvalid { reason: String },

	#[error(
		"quota_exceeded",
		"Not enough space left in Depot.",
		"Not enough space left in Depot ({remaining_bytes} bytes remaining, current payload is {payload_size} bytes)."
	)]
	SqliteStorageQuotaExceeded {
		remaining_bytes: i64,
		payload_size: i64,
	},

	#[error("invalid_v1_migration_state", "Invalid SQLite v1 migration state.")]
	InvalidV1MigrationState,

	#[error("fork_chain_too_deep", "Database branch fork chain is too deep.")]
	ForkChainTooDeep,

	#[error("bucket_fork_chain_too_deep", "Bucket branch fork chain is too deep.")]
	BucketForkChainTooDeep,

	#[error(
		"fork_out_of_retention",
		"Cannot fork from a point that has fallen out of retention."
	)]
	ForkOutOfRetention,

	#[error(
		"restore_point_expired",
		"Restore point history is no longer retained."
	)]
	RestoreTargetExpired,

	#[error("restore_point_not_found", "Restore point was not found.")]
	RestorePointNotFound,

	#[error(
		"branch_not_reachable",
		"Restore point branch is not reachable from this database branch chain."
	)]
	BranchNotReachable,

	#[error(
		"branch_not_writable",
		"Database branch is not writable.",
		"Database branch is not writable because it is missing or no longer live."
	)]
	BranchNotWritable,

	#[error(
		"shard_version_cap_exhausted",
		"SQLite shard version cap is exhausted."
	)]
	ShardVersionCapExhausted,

	#[error(
		"shard_coverage_missing",
		"SQLite shard coverage is missing.",
		"SQLite shard coverage is missing for page {pgno}."
	)]
	ShardCoverageMissing { pgno: u32 },

	#[error(
		"delta_page_missing",
		"SQLite delta does not carry a page it owns.",
		"SQLite delta at txid {txid} owns page {pgno} but does not carry it."
	)]
	DeltaPageMissing { pgno: u32, txid: u64 },

	#[error(
		"cold_object_corrupt",
		"SQLite cold object does not match the reference that named it.",
		"SQLite cold object {object_key} does not match its reference."
	)]
	ColdObjectCorrupt { object_key: String },

	#[error(
		"stale_main_page",
		"SQLite page one disagrees with the database size at its txid.",
		"SQLite page one at txid {txid} reports {page_db_size_pages} pages but the commit at that txid records {head_db_size_pages}."
	)]
	StaleMainPage {
		txid: u64,
		page_db_size_pages: u32,
		head_db_size_pages: u32,
	},

	#[error(
		"shard_cache_corrupt",
		"SQLite shard cache is corrupt.",
		"SQLite shard cache has conflicting bytes for shard {shard_id} at txid {as_of_txid}."
	)]
	ShardCacheCorrupt { shard_id: u32, as_of_txid: u64 },

	#[error("too_many_pins", "Bucket has too many restore_points.")]
	TooManyPins,

	#[error("too_many_restore_points", "Bucket has too many restore points.")]
	TooManyRestorePoints,

	#[error(
		"invalid_policy_value",
		"SQLite policy value is invalid.",
		"SQLite policy value is invalid for {policy}.{field}: {value}."
	)]
	InvalidPolicyValue {
		policy: &'static str,
		field: &'static str,
		value: i64,
	},

	#[error("database_not_found", "Database was not found in this bucket branch.")]
	DatabaseNotFound,
}

impl fmt::Display for SqliteStorageError {
	fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
		match self {
			SqliteStorageError::MetaMissing { operation } => {
				write!(f, "sqlite meta missing for {operation}")
			}
			#[cfg(debug_assertions)]
			SqliteStorageError::FenceMismatch { reason } => {
				write!(f, "FenceMismatch: {reason}")
			}
			SqliteStorageError::CommitTooLarge {
				actual_size_bytes,
				max_size_bytes,
			} => write!(
				f,
				"CommitTooLarge: raw dirty pages were {actual_size_bytes} bytes, limit is {max_size_bytes} bytes"
			),
			SqliteStorageError::HeadFenceMismatch {
				expected_head_txid,
				actual_head_txid,
			} => write!(
				f,
				"sqlite head fence mismatch: expected head txid {expected_head_txid}, current head txid {actual_head_txid}"
			),
			SqliteStorageError::StageNotFound { txid, first_pgno } => write!(
				f,
				"StageNotFound: no staged segment at page {first_pgno} for txid {txid}"
			),
			SqliteStorageError::StageSegmentInvalid { reason } => {
				write!(f, "StageSegmentInvalid: {reason}")
			}
			SqliteStorageError::SqliteStorageQuotaExceeded {
				remaining_bytes,
				payload_size,
			} => write!(
				f,
				"SqliteStorageQuotaExceeded: not enough space left in depot ({remaining_bytes} bytes remaining, current payload is {payload_size} bytes)"
			),
			SqliteStorageError::InvalidV1MigrationState => {
				write!(f, "invalid sqlite v1 migration state")
			}
			SqliteStorageError::ForkChainTooDeep => {
				write!(f, "sqlite database branch fork chain is too deep")
			}
			SqliteStorageError::BucketForkChainTooDeep => {
				write!(f, "sqlite bucket branch fork chain is too deep")
			}
			SqliteStorageError::ForkOutOfRetention => {
				write!(
					f,
					"cannot fork from a point that has fallen out of retention"
				)
			}
			SqliteStorageError::RestoreTargetExpired => {
				write!(f, "sqlite restore point history is no longer retained")
			}
			SqliteStorageError::RestorePointNotFound => {
				write!(f, "sqlite restore point was not found")
			}
			SqliteStorageError::BranchNotReachable => {
				write!(
					f,
					"sqlite restore point branch is not reachable from this database branch chain"
				)
			}
			SqliteStorageError::BranchNotWritable => {
				write!(f, "sqlite database branch is not writable")
			}
			SqliteStorageError::ShardVersionCapExhausted => {
				write!(f, "sqlite shard version cap is exhausted")
			}
			SqliteStorageError::ShardCoverageMissing { pgno } => {
				write!(f, "sqlite shard coverage is missing for page {pgno}")
			}
			SqliteStorageError::DeltaPageMissing { pgno, txid } => {
				write!(
					f,
					"sqlite delta at txid {txid} owns page {pgno} but does not carry it"
				)
			}
			SqliteStorageError::ColdObjectCorrupt { object_key } => {
				write!(
					f,
					"sqlite cold object {object_key} does not match the reference that named it"
				)
			}
			SqliteStorageError::StaleMainPage {
				txid,
				page_db_size_pages,
				head_db_size_pages,
			} => {
				write!(
					f,
					"sqlite page one at txid {txid} reports {page_db_size_pages} pages but the commit at that txid records {head_db_size_pages}"
				)
			}
			SqliteStorageError::ShardCacheCorrupt {
				shard_id,
				as_of_txid,
			} => {
				write!(
					f,
					"sqlite shard cache has conflicting bytes for shard {shard_id} at txid {as_of_txid}"
				)
			}
			SqliteStorageError::TooManyPins => {
				write!(f, "sqlite bucket has too many restore_points")
			}
			SqliteStorageError::TooManyRestorePoints => {
				write!(f, "sqlite bucket has too many restore points")
			}
			SqliteStorageError::InvalidPolicyValue {
				policy,
				field,
				value,
			} => {
				write!(
					f,
					"sqlite policy value is invalid for {policy}.{field}: {value}"
				)
			}
			SqliteStorageError::DatabaseNotFound => {
				write!(f, "sqlite database was not found in this bucket branch")
			}
		}
	}
}

impl std::error::Error for SqliteStorageError {}
