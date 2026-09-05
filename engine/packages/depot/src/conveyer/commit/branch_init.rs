use anyhow::{Context, Result};
use universaldb::{options::MutationType, utils::IsolationLevel::Serializable};

use crate::conveyer::{
	branch,
	error::SqliteStorageError,
	keys,
	types::{
		BranchState, BucketBranchId, BucketId, DatabaseBranchId, DatabaseBranchRecord,
		DatabasePointer, decode_database_branch_record, encode_database_branch_record,
	},
	udb,
};

pub(super) struct BranchResolution {
	pub(super) branch_id: DatabaseBranchId,
	pub(super) bucket_branch_id: BucketBranchId,
	pub(super) bucket_initialized: bool,
	pub(super) database_initialized: bool,
}

pub(super) async fn resolve_or_allocate_branch(
	tx: &universaldb::Transaction,
	bucket_id: BucketId,
	database_id: &str,
) -> Result<BranchResolution> {
	let bucket = branch::resolve_or_allocate_root_bucket_branch(tx, bucket_id).await?;

	if let Some(branch_id) =
		branch::resolve_database_branch_in_bucket(tx, bucket.branch_id, database_id, Serializable)
			.await?
	{
		return Ok(BranchResolution {
			branch_id,
			bucket_branch_id: bucket.branch_id,
			bucket_initialized: bucket.initialized,
			database_initialized: false,
		});
	}

	Ok(BranchResolution {
		branch_id: DatabaseBranchId::new_v4(),
		bucket_branch_id: bucket.branch_id,
		bucket_initialized: bucket.initialized,
		database_initialized: true,
	})
}

pub(super) async fn write_root_branch_metadata(
	tx: &universaldb::Transaction,
	branch_id: DatabaseBranchId,
	bucket_id: BucketId,
	bucket_branch: BucketBranchId,
	database_id: &str,
	now_ms: i64,
	root_versionstamp: &[u8; 16],
	bucket_initialized: bool,
) -> Result<()> {
	let record = DatabaseBranchRecord {
		branch_id,
		bucket_branch,
		parent: None,
		parent_versionstamp: None,
		root_versionstamp: *root_versionstamp,
		fork_depth: 0,
		created_at_ms: now_ms,
		created_from_restore_point: None,
		state: BranchState::Live,
		lifecycle_generation: 0,
	};
	let encoded_record = encode_database_branch_record(record)
		.context("encode sqlite root database branch record")?;
	let versionstamped_record = udb::append_versionstamp_offset(encoded_record, root_versionstamp)
		.context("prepare versionstamped sqlite root database branch record")?;
	tx.informal().atomic_op(
		&keys::branches_list_key(branch_id),
		&versionstamped_record,
		MutationType::SetVersionstampedValue,
	);
	tx.informal().atomic_op(
		&keys::branches_refcount_key(branch_id),
		&1_i64.to_le_bytes(),
		MutationType::Add,
	);
	if bucket_initialized {
		branch::write_bucket_catalog_marker_with_root(
			tx,
			bucket_branch,
			bucket_branch,
			branch_id,
			root_versionstamp,
		)?;
	} else {
		branch::write_bucket_catalog_marker(tx, bucket_branch, branch_id, root_versionstamp)
			.await?;
	}

	branch::write_database_pointer(
		tx,
		bucket_id,
		bucket_branch,
		database_id,
		DatabasePointer {
			current_branch: branch_id,
			last_swapped_at_ms: now_ms,
		},
	)?;

	Ok(())
}

/// Refuses a write to a branch that is not `Live`.
///
/// A frozen branch is one a restore or rollback is rebuilding, and a commit landing on it would
/// publish over state the restore is still assembling. Every path that publishes a commit has to
/// check, including the staged one: staging spans several transactions, so a branch can also be
/// frozen partway through one.
///
/// A branch this transaction just allocated has no record to read yet and is writable by
/// definition.
pub(super) async fn ensure_branch_writable(
	tx: &universaldb::Transaction,
	branch_id: DatabaseBranchId,
	database_initialized: bool,
) -> Result<()> {
	if database_initialized {
		return Ok(());
	}

	let branch_record =
		super::helpers::tx_get_value(tx, &keys::branches_list_key(branch_id), Serializable)
			.await?
			.as_deref()
			.map(decode_database_branch_record)
			.transpose()
			.context("decode sqlite database branch record for commit")?;
	if !branch_record
		.as_ref()
		.is_some_and(|record| record.state == BranchState::Live)
	{
		return Err(SqliteStorageError::BranchNotWritable.into());
	}

	Ok(())
}
