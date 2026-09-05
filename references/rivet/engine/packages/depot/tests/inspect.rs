mod common;

use anyhow::{Context, Result};
use depot::{
	inspect::{self, RowsQuery},
	keys::{
		PAGE_SIZE, branch_compaction_root_key, bucket_pointer_cur_key, database_pointer_cur_key,
	},
	types::{
		BucketId, CompactionRoot, DatabaseBranchId, DirtyPage, decode_bucket_pointer,
		decode_database_pointer, encode_compaction_root,
	},
};
use rivet_pools::NodeId;

fn page(pgno: u32, fill: u8) -> DirtyPage {
	DirtyPage {
		pgno,
		bytes: vec![fill; PAGE_SIZE as usize],
	}
}

async fn current_branch(ctx: &common::TestDb) -> Result<DatabaseBranchId> {
	let bucket_pointer = common::read_value(
		&ctx.udb,
		bucket_pointer_cur_key(BucketId::from_gas_id(ctx.bucket_id)),
	)
	.await?
	.context("bucket pointer missing")?;
	let bucket_pointer = decode_bucket_pointer(&bucket_pointer)?;
	let database_pointer = common::read_value(
		&ctx.udb,
		database_pointer_cur_key(bucket_pointer.current_branch, &ctx.database_id),
	)
	.await?
	.context("database pointer missing")?;
	let database_pointer = decode_database_pointer(&database_pointer)?;

	Ok(database_pointer.current_branch)
}

fn rows_query(limit: Option<usize>, cursor: Option<String>) -> RowsQuery {
	RowsQuery {
		limit,
		cursor,
		include_bytes: None,
		before_txid: None,
		after_txid: None,
		from_pgno: None,
		shard_id: None,
		state: None,
		kind: None,
		job_id: None,
	}
}

#[tokio::test]
async fn inspect_branch_rows_paginate_commits_with_cursor() -> Result<()> {
	let ctx = common::build_test_db("depot-inspect-commits", common::TierMode::Disabled).await?;
	ctx.db.commit(vec![page(1, 0x11)], 1, 1_000).await?;
	ctx.db.commit(vec![page(2, 0x22)], 2, 2_000).await?;
	let branch_id = current_branch(&ctx).await?;

	let first = inspect::branch_rows(
		&ctx.udb,
		NodeId::new(),
		branch_id,
		inspect::RowFamily::Commits,
		rows_query(Some(1), None),
	)
	.await?;
	assert_eq!(first.rows.len(), 1);
	assert!(first.next_cursor.is_some());
	assert_eq!(first.rows[0]["decoded"]["txid"], 1);

	let second = inspect::branch_rows(
		&ctx.udb,
		NodeId::new(),
		branch_id,
		inspect::RowFamily::Commits,
		rows_query(Some(1), first.next_cursor),
	)
	.await?;
	assert_eq!(second.rows.len(), 1);
	assert_eq!(second.next_cursor, None);
	assert_eq!(second.rows[0]["decoded"]["txid"], 2);

	Ok(())
}

/// An over-cap limit must clamp and say so, not fail. Failing reads as an empty result through most
/// tooling, which silently understates whatever was being counted.
#[tokio::test]
async fn inspect_branch_rows_clamps_limit_and_reports_it() -> Result<()> {
	let ctx = common::build_test_db("depot-inspect-limit", common::TierMode::Disabled).await?;
	ctx.db.commit(vec![page(1, 0x11)], 1, 1_000).await?;
	ctx.db.commit(vec![page(2, 0x22)], 2, 2_000).await?;
	let branch_id = current_branch(&ctx).await?;

	let rows = inspect::branch_rows(
		&ctx.udb,
		NodeId::new(),
		branch_id,
		inspect::RowFamily::Commits,
		rows_query(Some(inspect::MAX_LIMIT + 1), None),
	)
	.await?;

	assert_eq!(rows.limit_applied, inspect::MAX_LIMIT);
	assert_eq!(rows.rows.len(), 2);
	Ok(())
}

#[tokio::test]
async fn inspect_branch_rows_decodes_pidx_family() -> Result<()> {
	let ctx = common::build_test_db("depot-inspect-pidx", common::TierMode::Disabled).await?;
	ctx.db.commit(vec![page(7, 0x77)], 8, 1_000).await?;
	let branch_id = current_branch(&ctx).await?;

	let rows = inspect::branch_rows(
		&ctx.udb,
		NodeId::new(),
		branch_id,
		inspect::RowFamily::Pidx,
		rows_query(None, None),
	)
	.await?;

	assert_eq!(rows.rows.len(), 1);
	assert_eq!(rows.rows[0]["decoded"]["pgno"], 7);
	assert_eq!(rows.rows[0]["decoded"]["owner_txid"], 1);
	Ok(())
}

#[tokio::test]
async fn inspect_raw_scan_uses_base64url_cursor() -> Result<()> {
	let ctx = common::build_test_db("depot-inspect-raw", common::TierMode::Disabled).await?;
	ctx.db.commit(vec![page(1, 0x11)], 1, 1_000).await?;

	let first = inspect::raw_scan(
		&ctx.udb,
		NodeId::new(),
		inspect::RawScanQuery {
			prefix: None,
			start_after: None,
			limit: Some(1),
			decode: Some(true),
		},
	)
	.await?;
	assert_eq!(first.rows.len(), 1);
	let cursor = first.next_cursor.context("first raw page cursor missing")?;

	let second = inspect::raw_scan(
		&ctx.udb,
		NodeId::new(),
		inspect::RawScanQuery {
			prefix: None,
			start_after: Some(cursor),
			limit: Some(1),
			decode: Some(true),
		},
	)
	.await?;
	assert_eq!(second.rows.len(), 1);

	Ok(())
}

fn sample_query() -> inspect::SampleQuery {
	inspect::SampleQuery {
		sample_limit: None,
		include_history: None,
		scan_limit: None,
	}
}

/// Per-family accounting must report real row counts and real bytes. The old shape reported
/// `count = sampled rows`, so every family looked like it held at most `sample_limit` rows.
#[tokio::test]
async fn inspect_branch_reports_row_counts_beyond_the_sample() -> Result<()> {
	let ctx = common::build_test_db("depot-inspect-counts", common::TierMode::Disabled).await?;
	for txid in 1..=8u32 {
		ctx.db
			.commit(vec![page(txid, txid as u8)], txid, i64::from(txid) * 1_000)
			.await?;
	}
	let branch_id = current_branch(&ctx).await?;

	let blob = inspect::branch(
		&ctx.udb,
		NodeId::new(),
		branch_id,
		inspect::SampleQuery {
			sample_limit: Some(2),
			include_history: None,
			scan_limit: None,
		},
	)
	.await?;

	let commits = &blob.data["row_families"]["commits"];
	assert_eq!(commits["rows"], 8);
	assert_eq!(commits["rows_truncated"], false);
	assert_eq!(
		commits["sample"].as_array().context("commit sample")?.len(),
		2
	);
	assert!(blob.data["row_families"]["deltas"]["estimated_bytes"].is_number());

	Ok(())
}

/// A `PIDX` row still owned by a txid at or below the hot watermark pins its `DELTA` forever:
/// reclaim refuses it as `live_owned` and hot staging's owner window can never revisit it. Reads
/// stay correct, so nothing else surfaces it.
#[tokio::test]
async fn inspect_branch_probe_flags_pidx_rows_below_hot_watermark() -> Result<()> {
	let ctx = common::build_test_db("depot-inspect-stale-pidx", common::TierMode::Disabled).await?;
	ctx.db.commit(vec![page(1, 0x11)], 1, 1_000).await?;
	ctx.db.commit(vec![page(2, 0x22)], 2, 2_000).await?;
	let branch_id = current_branch(&ctx).await?;

	let clean = inspect::branch(&ctx.udb, NodeId::new(), branch_id, sample_query()).await?;
	let clean_probe = &clean.data["compaction"]["stale_pidx"];
	// No compaction has run, so the watermark is 0 and every PIDX owner is above it.
	assert_eq!(clean_probe["hot_watermark_txid"], 0);
	assert_eq!(clean_probe["stale_candidate_rows"], 0);
	assert_eq!(clean_probe["scan_truncated"], false);
	assert_eq!(clean_probe["pidx_repair"]["swept"], false);

	// Advance the watermark past both owners without clearing their PIDX rows, which is exactly the
	// state a hot slice leaves behind when it folds a page but skips the clear.
	let branch_id_for_tx = branch_id;
	ctx.udb
		.txn(
			"depot_inspect_test_advance_watermark",
			move |tx| async move {
				tx.informal().set(
					&branch_compaction_root_key(branch_id_for_tx),
					&encode_compaction_root(CompactionRoot {
						schema_version: 1,
						manifest_generation: 1,
						hot_watermark_txid: 5,
						cold_watermark_txid: 0,
						cold_watermark_versionstamp: [0; 16],
					})?,
				);
				Ok(())
			},
		)
		.await?;

	let stale = inspect::branch(&ctx.udb, NodeId::new(), branch_id, sample_query()).await?;
	let probe = &stale.data["compaction"]["stale_pidx"];
	assert_eq!(probe["hot_watermark_txid"], 5);
	assert_eq!(probe["stale_candidate_rows"], 2);
	assert_eq!(probe["distinct_owner_txids"], 2);
	assert_eq!(probe["min_owner_txid"], 1);
	assert_eq!(probe["max_owner_txid"], 2);
	assert!(probe["pinned_delta_estimated_bytes"].is_number());

	Ok(())
}

/// Shard-cache eviction draws its candidates only from `SHARD_LRU`, so an empty index means
/// eviction has nothing to consider no matter how much cold-backed data is resident.
#[tokio::test]
async fn inspect_branch_reports_shard_cache_index() -> Result<()> {
	let ctx = common::build_test_db("depot-inspect-lru", common::TierMode::Disabled).await?;
	ctx.db.commit(vec![page(1, 0x11)], 1, 1_000).await?;
	let branch_id = current_branch(&ctx).await?;

	let blob = inspect::branch(&ctx.udb, NodeId::new(), branch_id, sample_query()).await?;
	let shard_cache = &blob.data["compaction"]["shard_cache"];

	assert_eq!(shard_cache["lru_rows"], 0);
	assert_eq!(shard_cache["lru_rows_truncated"], false);
	assert_eq!(shard_cache["distinct_shards"], 0);

	Ok(())
}
