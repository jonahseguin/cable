use anyhow::{Context, Result};
use universaldb::utils::IsolationLevel::Serializable;

use crate::conveyer::{
	branch,
	db::{BranchAncestry, load_branch_ancestry},
	delta_blob,
	error::SqliteStorageError,
	keys::{self},
	types::{BucketId, DBHead, DatabaseBranchId, decode_db_head},
};

#[derive(Debug, Clone)]
pub(super) enum StorageScope {
	Branch(BranchReadPlan),
}

impl StorageScope {
	pub(super) fn branch_id(&self) -> DatabaseBranchId {
		match self {
			Self::Branch(plan) => plan.branch_id,
		}
	}

	pub(super) fn branch_ancestry(&self) -> BranchAncestry {
		match self {
			Self::Branch(plan) => plan.ancestry.clone(),
		}
	}
}

#[derive(Debug, Clone)]
pub(super) struct BranchReadPlan {
	pub(super) branch_id: DatabaseBranchId,
	pub(super) head: DBHead,
	pub(super) ancestry: BranchAncestry,
	pub(super) sources: Vec<ReadSource>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub(super) enum ReadSource {
	Branch(BranchSource),
}

impl ReadSource {
	pub(super) fn pidx_key(self, database_id: &str, pgno: u32) -> Vec<u8> {
		let _ = database_id;
		match self {
			Self::Branch(source) => keys::branch_pidx_key(source.branch_id, pgno),
		}
	}

	pub(super) fn delta_chunk_prefix(self, database_id: &str, txid: u64) -> Vec<u8> {
		let _ = database_id;
		match self {
			Self::Branch(source) => keys::branch_delta_chunk_prefix(source.branch_id, txid),
		}
	}

	/// Exclusive end of a reverse scan over every delta row at or below `max_txid`, including that
	/// txid's own chunk rows. Owned by the key layer so a caller never has to know how wide a chunk
	/// suffix is, which is the assumption a second delta layout would silently break.
	pub(super) fn delta_txid_scan_end(self, database_id: &str, max_txid: u64) -> Vec<u8> {
		let _ = database_id;
		match self {
			Self::Branch(source) => keys::branch_delta_txid_scan_end(source.branch_id, max_txid),
		}
	}

	pub(super) fn delta_prefix(self, database_id: &str) -> Vec<u8> {
		let _ = database_id;
		match self {
			Self::Branch(source) => keys::branch_delta_prefix(source.branch_id),
		}
	}

	pub(super) fn decode_delta_chunk_txid(self, database_id: &str, key: &[u8]) -> Result<u64> {
		let _ = database_id;
		match self {
			Self::Branch(source) => keys::decode_branch_delta_chunk_txid(source.branch_id, key),
		}
	}

	/// Reassembles one txid's scanned chunk rows into its delta blobs.
	///
	/// Owned by the key layer for the same reason the scan bounds are: a caller that sorted rows by
	/// chunk index and concatenated them would silently interleave a segmented commit's blobs, since
	/// every segment restarts its chunk index at zero.
	pub(super) fn reassemble_delta_segments(
		self,
		txid: u64,
		rows: Vec<(Vec<u8>, Vec<u8>)>,
	) -> Result<Vec<delta_blob::DeltaSegment>> {
		match self {
			Self::Branch(source) => {
				delta_blob::reassemble_delta_segments(source.branch_id, txid, rows)
			}
		}
	}

	pub(super) fn max_txid(self) -> u64 {
		match self {
			Self::Branch(source) => source.max_txid,
		}
	}
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub(super) struct BranchSource {
	pub(super) branch_id: DatabaseBranchId,
	pub(super) max_txid: u64,
}

pub(super) async fn resolve_storage_scope(
	tx: &universaldb::Transaction,
	bucket_id: BucketId,
	database_id: &str,
	cached_ancestry: Option<&BranchAncestry>,
) -> Result<StorageScope> {
	Ok(
		match branch::resolve_database_branch(
			tx,
			bucket_id,
			database_id,
			// TODO: This can probably be made Snapshot again to reduce contention if
			// read side freshness is not worth the cost.
			Serializable,
		)
		.await?
		{
			Some(branch_id) => {
				StorageScope::Branch(load_branch_read_plan(tx, branch_id, cached_ancestry).await?)
			}
			None => return Err(SqliteStorageError::DatabaseNotFound.into()),
		},
	)
}

async fn load_branch_read_plan(
	tx: &universaldb::Transaction,
	branch_id: DatabaseBranchId,
	cached_ancestry: Option<&BranchAncestry>,
) -> Result<BranchReadPlan> {
	let head_bytes = super::tx::tx_get_value(tx, &keys::branch_meta_head_key(branch_id)).await?;
	let head = if let Some(head_bytes) = head_bytes {
		decode_db_head(&head_bytes)?
	} else {
		let head_at_fork_bytes =
			super::tx::tx_get_value(tx, &keys::branch_meta_head_at_fork_key(branch_id))
				.await?
				.ok_or(SqliteStorageError::MetaMissing {
					operation: "get_pages",
				})?;
		decode_db_head(&head_at_fork_bytes)?
	};

	let ancestry = if let Some(cached_ancestry) =
		cached_ancestry.filter(|ancestry| ancestry.root_branch_id == branch_id)
	{
		cached_ancestry.clone()
	} else {
		load_branch_ancestry(tx, branch_id).await?
	};

	let mut sources = Vec::new();
	for ancestor in &ancestry.ancestors {
		let max_txid = match ancestor.parent_versionstamp_cap {
			Some(parent_versionstamp) => {
				lookup_txid_for_read(tx, ancestor.branch_id, parent_versionstamp).await?
			}
			None => head.head_txid,
		};
		sources.push(ReadSource::Branch(BranchSource {
			branch_id: ancestor.branch_id,
			max_txid,
		}));
	}

	Ok(BranchReadPlan {
		branch_id,
		head,
		ancestry,
		sources,
	})
}

async fn lookup_txid_for_read(
	tx: &universaldb::Transaction,
	branch_id: DatabaseBranchId,
	versionstamp: [u8; 16],
) -> Result<u64> {
	let bytes = super::tx::tx_get_value(tx, &keys::branch_vtx_key(branch_id, versionstamp))
		.await?
		.ok_or(SqliteStorageError::RestoreTargetExpired)?;
	let bytes: [u8; std::mem::size_of::<u64>()] = bytes
		.as_slice()
		.try_into()
		.context("sqlite VTX entry should be exactly 8 bytes")?;

	Ok(u64::from_be_bytes(bytes))
}
