mod common;

use std::time::Duration;

use anyhow::{Context, Result};
use depot::{
	keys::{self, PAGE_SIZE, SQLITE_SUBSPACE_PREFIX},
	ltx::{LtxHeader, encode_ltx_v3},
	recovery::{HotShardHistoryScanOptions, scan_hot_shard_history_corruption},
	types::{
		BucketId, CompactionRoot, DatabaseBranchId, DirtyPage, decode_bucket_pointer,
		decode_database_pointer, encode_compaction_root,
	},
};
use futures_util::TryStreamExt;
use universaldb::{RangeOption, options::StreamingMode, utils::IsolationLevel::Snapshot};

fn page(pgno: u32, fill: u8) -> DirtyPage {
	DirtyPage {
		pgno,
		bytes: vec![fill; PAGE_SIZE as usize],
	}
}

fn sqlite_page_one(db_size_pages: u32, fill: u8) -> DirtyPage {
	let mut bytes = vec![fill; PAGE_SIZE as usize];
	bytes[..16].copy_from_slice(b"SQLite format 3\0");
	bytes[16..18].copy_from_slice(&(PAGE_SIZE as u16).to_be_bytes());
	bytes[28..32].copy_from_slice(&db_size_pages.to_be_bytes());
	DirtyPage { pgno: 1, bytes }
}

async fn current_branch(ctx: &common::TestDb) -> Result<DatabaseBranchId> {
	let bucket_pointer = common::read_value(
		&ctx.udb,
		keys::bucket_pointer_cur_key(BucketId::from_gas_id(ctx.bucket_id)),
	)
	.await?
	.context("bucket pointer missing")?;
	let bucket_pointer = decode_bucket_pointer(&bucket_pointer)?;
	let database_pointer = common::read_value(
		&ctx.udb,
		keys::database_pointer_cur_key(bucket_pointer.current_branch, &ctx.database_id),
	)
	.await?
	.context("database pointer missing")?;
	Ok(decode_database_pointer(&database_pointer)?.current_branch)
}

async fn install_hot_history(
	db: &universaldb::Database,
	branch_id: DatabaseBranchId,
	selected_pages: Vec<DirtyPage>,
) -> Result<()> {
	let older = encode_ltx_v3(
		LtxHeader::delta(1, 2, 1_000),
		&[sqlite_page_one(2, 0x11), page(2, 0x22)],
	)?;
	let selected = encode_ltx_v3(LtxHeader::delta(2, 2, 2_000), &selected_pages)?;
	let root = encode_compaction_root(CompactionRoot {
		schema_version: 1,
		manifest_generation: 1,
		hot_watermark_txid: 2,
		cold_watermark_txid: 0,
		cold_watermark_versionstamp: [0; 16],
	})?;
	db.txn("test_depot_recovery_scan_install", move |tx| {
		let older = older.clone();
		let selected = selected.clone();
		let root = root.clone();
		async move {
			let informal = tx.informal();
			informal.set(&keys::branch_shard_key(branch_id, 0, 1), &older);
			informal.set(&keys::branch_shard_key(branch_id, 0, 2), &selected);
			informal.set(&keys::branch_compaction_root_key(branch_id), &root);
			Ok(())
		}
	})
	.await
}

async fn sqlite_keyspace(db: &universaldb::Database) -> Result<Vec<(Vec<u8>, Vec<u8>)>> {
	db.txn("test_depot_recovery_scan_snapshot", move |tx| async move {
		let prefix = universaldb::tuple::Subspace::from_bytes(vec![SQLITE_SUBSPACE_PREFIX]);
		let informal = tx.informal();
		let mut stream = informal.get_ranges_keyvalues(
			RangeOption {
				mode: StreamingMode::WantAll,
				..RangeOption::from(&prefix)
			},
			Snapshot,
		);
		let mut rows = Vec::new();
		while let Some(entry) = stream.try_next().await? {
			rows.push((entry.key().to_vec(), entry.value().to_vec()));
		}
		Ok(rows)
	})
	.await
}

fn scan_options() -> HotShardHistoryScanOptions {
	HotShardHistoryScanOptions {
		transaction_max_duration: Duration::from_secs(1),
		// Smaller than one shard blob so the test exercises cursor continuation while still making
		// progress on a single oversized row.
		transaction_max_bytes: 128,
		concurrency: 1,
		database_limit: None,
	}
}

#[tokio::test]
async fn partial_hot_shard_scan_detects_omitted_live_pages_and_is_read_only() -> Result<()> {
	let ctx = common::build_test_db(
		"depot-recovery-scan-hot-history",
		common::TierMode::Disabled,
	)
	.await?;
	ctx.db
		.commit(vec![sqlite_page_one(2, 0x11), page(2, 0x22)], 2, 1_000)
		.await?;
	ctx.db
		.commit(vec![sqlite_page_one(2, 0x33), page(2, 0x44)], 2, 2_000)
		.await?;
	let branch_id = current_branch(&ctx).await?;

	install_hot_history(
		&ctx.udb,
		branch_id,
		vec![sqlite_page_one(2, 0x33), page(2, 0x44)],
	)
	.await?;
	let healthy = scan_hot_shard_history_corruption(&ctx.udb, scan_options()).await?;
	assert_eq!(healthy.current_databases, 1);
	assert_eq!(healthy.prefilter.candidates, 1);
	assert_eq!(healthy.healthy_candidates, 1);
	assert!(healthy.affected.is_empty());
	assert!(healthy.inconclusive.is_empty());

	install_hot_history(&ctx.udb, branch_id, vec![sqlite_page_one(2, 0x33)]).await?;
	let before = sqlite_keyspace(&ctx.udb).await?;
	let affected = scan_hot_shard_history_corruption(&ctx.udb, scan_options()).await?;
	let after = sqlite_keyspace(&ctx.udb).await?;
	assert_eq!(
		before, after,
		"corruption scan must not mutate Depot storage"
	);
	assert_eq!(affected.affected.len(), 1);
	assert_eq!(affected.affected[0].database_branch_id, branch_id);
	assert_eq!(affected.affected[0].databases.len(), 1);
	assert_eq!(
		affected.affected[0].databases[0].database_id,
		ctx.database_id
	);
	assert_eq!(affected.affected[0].suspect_shards.len(), 1);
	assert_eq!(
		affected.affected[0].suspect_shards[0].expected_page_count,
		2
	);
	assert_eq!(
		affected.affected[0].suspect_shards[0].missing_pages,
		vec![2]
	);
	assert!(affected.inconclusive.is_empty());

	Ok(())
}

/// A page whose PIDX owner is newer than the selected image was not part of the shard at that
/// image's txid, so the image is right not to carry it. Reporting those was most of this scanner's
/// output on any branch with unfolded history, which is what made it unusable as a corruption signal.
#[tokio::test]
async fn partial_hot_shard_scan_ignores_pages_written_after_the_selected_image() -> Result<()> {
	let ctx = common::build_test_db(
		"depot-recovery-scan-newer-owner",
		common::TierMode::Disabled,
	)
	.await?;
	ctx.db
		.commit(vec![sqlite_page_one(2, 0x11), page(2, 0x22)], 2, 1_000)
		.await?;
	ctx.db
		.commit(vec![sqlite_page_one(2, 0x33), page(2, 0x44)], 2, 2_000)
		.await?;
	let branch_id = current_branch(&ctx).await?;

	// The selected image sits at txid 2 and omits page 2.
	install_hot_history(&ctx.udb, branch_id, vec![sqlite_page_one(2, 0x33)]).await?;
	// Page 2 was written at txid 3, above that image, so its absence is expected.
	ctx.udb
		.txn(
			"test_depot_recovery_scan_newer_owner",
			move |tx| async move {
				tx.informal()
					.set(&keys::branch_pidx_key(branch_id, 2), &3_u64.to_be_bytes());
				Ok(())
			},
		)
		.await?;

	let scan = scan_hot_shard_history_corruption(&ctx.udb, scan_options()).await?;
	assert_eq!(
		scan.healthy_candidates, 1,
		"a page written after the selected image is not a partial shard: {:?}",
		scan.affected
	);
	assert!(scan.affected.is_empty());

	Ok(())
}
