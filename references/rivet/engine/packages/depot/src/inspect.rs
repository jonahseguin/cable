//! Read-only Depot inspection helpers for internal API routes.

use std::{
	collections::{BTreeSet, HashSet},
	time::{SystemTime, UNIX_EPOCH},
};

use anyhow::{Context, Result, bail, ensure};
use base64::{Engine, prelude::BASE64_URL_SAFE_NO_PAD};
use futures_util::TryStreamExt;
use rivet_pools::NodeId;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use universaldb::{RangeOption, options::StreamingMode, utils::IsolationLevel::Snapshot};
use uuid::Uuid;

use crate::{
	conveyer::{
		keys,
		types::{
			BucketId, DatabaseBranchId, decode_bucket_branch_record, decode_bucket_pointer,
			decode_cold_shard_ref, decode_commit_row, decode_compaction_root,
			decode_database_branch_record, decode_database_pointer, decode_db_head,
			decode_db_history_pin, decode_pitr_interval_coverage, decode_reclaim_progress,
			decode_retired_cold_object, decode_sqlite_cmp_dirty,
		},
	},
	gc,
};

pub const DEFAULT_LIMIT: usize = 100;
pub const MAX_LIMIT: usize = 1000;
pub const DEFAULT_SAMPLE_LIMIT: usize = 20;
/// Default row bound shared by every counting or classifying scan in one inspect request (the nine
/// per-family counts, the stale-PIDX probe, the shard-cache probe, cold reconciliation).
///
/// The bound is per budget, not per prefix, because a branch blob runs eleven scans inside a single
/// transaction and FoundationDB gives that transaction a 5 second window. Bounding each prefix on
/// its own multiplies by the number of prefixes and times out on exactly the large branches the
/// accounting exists to measure. A branch blob holds three budgets (the nine row-family counts
/// share one, each probe gets its own), so its worst case is three times this bound. Every scan
/// reports whether it hit the bound, so a truncated answer is never mistakable for a complete one.
pub const DEFAULT_SCAN_LIMIT: usize = 50_000;
pub const MAX_SCAN_LIMIT: usize = 200_000;
/// Value-byte ceiling for one request's scans. `DELTA` and `SHARD` values are page blobs, so a row
/// bound alone would let a single family pull hundreds of megabytes and blow the transaction
/// window. Those families are exactly the ones whose no-scan `estimated_bytes` already answers the
/// footprint question, so cutting their row count short costs nothing that matters.
const DEFAULT_SCAN_VALUE_BYTES: usize = 8 * 1024 * 1024;
const MAX_SCAN_VALUE_BYTES: usize = 32 * 1024 * 1024;
/// Cap on how many distinct values a probe holds in memory to report cardinality.
const MAX_DISTINCT_TRACKED: usize = 65_536;

/// Row and byte allowance shared by every scan in one inspect request.
///
/// Each scan draws from the same pool and stops when it is empty, so the whole request stays inside
/// one FoundationDB transaction window no matter how many prefixes it touches. Construct it inside
/// the transaction closure: a `txn` closure is re-run on retry, and a budget captured from outside
/// would arrive already spent on the second attempt.
struct ScanBudget {
	rows_remaining: usize,
	value_bytes_remaining: usize,
}

impl ScanBudget {
	fn new(rows: usize, value_bytes: usize) -> Self {
		ScanBudget {
			rows_remaining: rows,
			value_bytes_remaining: value_bytes,
		}
	}

	fn exhausted(&self) -> bool {
		self.rows_remaining == 0 || self.value_bytes_remaining == 0
	}

	/// Charges one scanned row. Returns false once the budget is spent, at which point the caller
	/// must stop scanning and report truncation.
	fn charge(&mut self, value_bytes: usize) -> bool {
		if self.exhausted() {
			return false;
		}
		self.rows_remaining -= 1;
		self.value_bytes_remaining = self.value_bytes_remaining.saturating_sub(value_bytes);

		true
	}
}

#[derive(Debug, Clone, Deserialize)]
pub struct CatalogQuery {
	pub bucket_id: Option<String>,
	pub database_id: Option<String>,
	pub limit: Option<usize>,
	pub cursor: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SampleQuery {
	pub sample_limit: Option<usize>,
	pub include_history: Option<bool>,
	/// Row bound for the per-family row counts and the stale-PIDX / shard-cache probes.
	pub scan_limit: Option<usize>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ColdReconcileQuery {
	/// Row bound for the live-ref and retired-record scans.
	pub scan_limit: Option<usize>,
	/// How many entries of each mismatch class to list.
	pub sample_limit: Option<usize>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct RowsQuery {
	pub limit: Option<usize>,
	pub cursor: Option<String>,
	pub include_bytes: Option<bool>,
	pub before_txid: Option<u64>,
	pub after_txid: Option<u64>,
	pub from_pgno: Option<u32>,
	pub shard_id: Option<u32>,
	pub state: Option<String>,
	pub kind: Option<String>,
	pub job_id: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct RawScanQuery {
	pub prefix: Option<String>,
	pub start_after: Option<String>,
	pub limit: Option<usize>,
	pub decode: Option<bool>,
}

#[derive(Debug, Clone, Serialize)]
pub struct InspectResponse {
	pub node_id: String,
	pub generated_at_ms: i64,
	pub scope: Value,
	#[serde(flatten)]
	pub data: Value,
}

#[derive(Debug, Clone, Serialize)]
pub struct PaginatedRowsResponse {
	pub node_id: String,
	pub generated_at_ms: i64,
	pub scope: Value,
	/// Row bound actually used, after clamping the requested `limit` to `MAX_LIMIT`. A request that
	/// asks for more rows than the cap gets the cap, never an empty page.
	pub limit_applied: usize,
	pub rows: Vec<Value>,
	pub next_cursor: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct CatalogResponse {
	pub node_id: String,
	pub generated_at_ms: i64,
	pub scope: Value,
	pub limit_applied: usize,
	pub buckets: Vec<Value>,
	pub databases: Vec<Value>,
	pub next_cursor: Option<String>,
}

#[derive(Debug, Clone, Copy)]
pub enum RowFamily {
	Commits,
	Pidx,
	Deltas,
	Shards,
	ColdShards,
	RetiredColdObjects,
	PitrIntervals,
	Pins,
	StagedHotShards,
}

impl RowFamily {
	pub fn parse(value: &str) -> Result<Self> {
		match value {
			"commits" => Ok(Self::Commits),
			"pidx" => Ok(Self::Pidx),
			"deltas" => Ok(Self::Deltas),
			"shards" => Ok(Self::Shards),
			"cold-shards" => Ok(Self::ColdShards),
			"retired-cold-objects" => Ok(Self::RetiredColdObjects),
			"pitr-intervals" => Ok(Self::PitrIntervals),
			"pins" => Ok(Self::Pins),
			"staged-hot-shards" => Ok(Self::StagedHotShards),
			_ => bail!("unsupported Depot inspect row family: {value}"),
		}
	}

	fn as_str(self) -> &'static str {
		match self {
			Self::Commits => "commits",
			Self::Pidx => "pidx",
			Self::Deltas => "deltas",
			Self::Shards => "shards",
			Self::ColdShards => "cold-shards",
			Self::RetiredColdObjects => "retired-cold-objects",
			Self::PitrIntervals => "pitr-intervals",
			Self::Pins => "pins",
			Self::StagedHotShards => "staged-hot-shards",
		}
	}

	fn scan_prefix(self, branch_id: DatabaseBranchId) -> Vec<u8> {
		match self {
			Self::Commits => keys::branch_commit_prefix(branch_id),
			Self::Pidx => keys::branch_pidx_prefix(branch_id),
			Self::Deltas => keys::branch_delta_prefix(branch_id),
			Self::Shards => keys::branch_shard_prefix(branch_id),
			Self::ColdShards => keys::branch_compaction_cold_shard_prefix(branch_id),
			Self::RetiredColdObjects => {
				keys::branch_compaction_retired_cold_object_prefix(branch_id)
			}
			Self::PitrIntervals => keys::branch_pitr_interval_prefix(branch_id),
			Self::Pins => keys::db_pin_prefix(branch_id),
			Self::StagedHotShards => keys::branch_compaction_stage_prefix(branch_id),
		}
	}
}

pub async fn summary(
	db: &universaldb::Database,
	node_id: NodeId,
	query: SampleQuery,
) -> Result<InspectResponse> {
	let scan_limit = scan_limit(query.scan_limit);
	let scan_value_bytes = scan_value_bytes(scan_limit);
	let counters = db
		.txn("depot_inspect_summary_counters", move |tx| async move {
			// Built per attempt: a `txn` closure re-runs on retry, and a budget captured from
			// outside would arrive already spent.
			let mut budget = ScanBudget::new(scan_limit, scan_value_bytes);
			let budget = &mut budget;
			Ok(json!({
				"bucket_pointers": prefix_stats(&tx, keys::bucket_pointer_cur_prefix(), budget).await?.to_value(),
				"database_pointers": prefix_stats(&tx, keys::database_pointer_cur_prefix(), budget).await?.to_value(),
				"database_branches": prefix_stats(&tx, vec![keys::SQLITE_SUBSPACE_PREFIX, keys::BRANCHES_PARTITION], budget).await?.to_value(),
				"bucket_branches": prefix_stats(&tx, vec![keys::SQLITE_SUBSPACE_PREFIX, keys::BUCKET_BRANCH_PARTITION], budget).await?.to_value(),
				"dirty_branches": prefix_stats(&tx, vec![keys::SQLITE_SUBSPACE_PREFIX, keys::SQLITE_CMP_DIRTY_PARTITION], budget).await?.to_value(),
				"queued_compaction_rows": prefix_stats(&tx, vec![keys::SQLITE_SUBSPACE_PREFIX, keys::CMPC_PARTITION], budget).await?.to_value(),
			}))
		})
		.await?;

	response(
		node_id,
		json!({ "kind": "summary" }),
		json!({
			"counters": counters,
		}),
	)
}

pub async fn catalog(
	db: &universaldb::Database,
	node_id: NodeId,
	query: CatalogQuery,
) -> Result<CatalogResponse> {
	let limit = page_limit(query.limit);
	let cursor = decode_optional_key(query.cursor.as_deref())?;
	let bucket_filter = query
		.bucket_id
		.as_deref()
		.map(parse_bucket_id)
		.transpose()?;
	let database_filter = query.database_id.clone();
	let rows = db
		.txn("depot_inspect_catalog", move |tx| {
			let cursor = cursor.clone();
			let database_filter = database_filter.clone();
			async move {
				let bucket_pointer = if let Some(bucket_id) = bucket_filter {
					tx_get_decoded(
						&tx,
						keys::bucket_pointer_cur_key(bucket_id),
						decode_bucket_pointer,
					)
					.await?
					.map(|pointer| (bucket_id, pointer))
				} else {
					None
				};
				let bucket_branch_filter = bucket_pointer
					.as_ref()
					.map(|(_bucket_id, pointer)| pointer.current_branch);
				let scanned = scan_prefix_page(
					&tx,
					keys::database_pointer_cur_prefix(),
					cursor.as_deref(),
					limit,
				)
				.await?;
				let mut rows = Vec::new();
				let mut next_cursor = None;
				for row in scanned.rows {
					let (bucket_branch_id, database_id) =
						keys::decode_database_pointer_cur_key(&row.key)?;
					if bucket_branch_filter.is_some_and(|filter| filter != bucket_branch_id) {
						continue;
					}
					if database_filter
						.as_deref()
						.is_some_and(|filter| filter != database_id)
					{
						continue;
					}
					let pointer = decode_database_pointer(&row.value)?;
					rows.push(json!({
						"key": encode_key(&row.key),
						"bucket_branch_id": bucket_branch_id,
						"database_id": database_id,
						"current_database_branch_id": pointer.current_branch,
						"last_swapped_at_ms": pointer.last_swapped_at_ms,
					}));
				}
				if scanned.has_more {
					next_cursor = scanned.next_cursor;
				}

				let buckets = if let Some((bucket_id, pointer)) = bucket_pointer {
					vec![json!({
						"key": encode_key(&keys::bucket_pointer_cur_key(bucket_id)),
						"bucket_id": bucket_id,
						"current_bucket_branch_id": pointer.current_branch,
						"last_swapped_at_ms": pointer.last_swapped_at_ms,
					})]
				} else {
					let bucket_rows =
						scan_prefix_page(&tx, keys::bucket_pointer_cur_prefix(), None, limit)
							.await?;
					let mut buckets = Vec::new();
					for row in bucket_rows.rows {
						let bucket_id = keys::decode_bucket_pointer_cur_bucket_id(&row.key)?;
						let pointer = decode_bucket_pointer(&row.value)?;
						buckets.push(json!({
							"key": encode_key(&row.key),
							"bucket_id": bucket_id,
							"current_bucket_branch_id": pointer.current_branch,
							"last_swapped_at_ms": pointer.last_swapped_at_ms,
						}));
					}
					buckets
				};

				Ok((buckets, rows, next_cursor))
			}
		})
		.await?;

	Ok(CatalogResponse {
		node_id: node_id.to_string(),
		generated_at_ms: now_ms()?,
		scope: json!({ "kind": "catalog" }),
		limit_applied: limit,
		buckets: rows.0,
		databases: rows.1,
		next_cursor: rows.2.map(|key| encode_key(&key)),
	})
}

pub async fn bucket(
	db: &universaldb::Database,
	node_id: NodeId,
	bucket_id: BucketId,
	query: SampleQuery,
) -> Result<InspectResponse> {
	let sample_limit = sample_limit(query.sample_limit);
	let scan_limit = scan_limit(query.scan_limit);
	let scan_value_bytes = scan_value_bytes(scan_limit);
	let include_history = query.include_history.unwrap_or(false);
	let data = db
		.txn("depot_inspect_bucket", move |tx| async move {
			let mut budget = ScanBudget::new(scan_limit, scan_value_bytes);
			let budget = &mut budget;
			let pointer = tx_get_decoded(
				&tx,
				keys::bucket_pointer_cur_key(bucket_id),
				decode_bucket_pointer,
			)
			.await?;
			let current_branch = match &pointer {
				Some(pointer) => Some(pointer.current_branch),
				None => None,
			};
			let branch_record = if let Some(branch_id) = current_branch {
				tx_get_decoded(
					&tx,
					keys::bucket_branches_list_key(branch_id),
					decode_bucket_branch_record,
				)
				.await?
			} else {
				None
			};
			let catalog = if let Some(branch_id) = current_branch {
				summary_for_prefix(
					&tx,
					keys::bucket_catalog_prefix(branch_id),
					sample_limit,
					budget,
				)
				.await?
			} else {
				empty_summary()
			};
			let tombstones = if let Some(branch_id) = current_branch {
				summary_for_prefix(
					&tx,
					keys::bucket_branches_database_tombstone_prefix(branch_id),
					sample_limit,
					budget,
				)
				.await?
			} else {
				empty_summary()
			};
			let history = if include_history {
				summary_for_prefix(
					&tx,
					keys::bucket_pointer_history_prefix(bucket_id),
					sample_limit,
					budget,
				)
				.await?
			} else {
				empty_summary()
			};

			Ok(json!({
				"bucket_id": bucket_id,
				"pointer": pointer,
				"current_branch": branch_record,
				"summaries": {
					"catalog": catalog,
					"tombstones": tombstones,
					"pointer_history": history,
				},
				"links": {
					"catalog": "/depot/inspect/catalog",
				}
			}))
		})
		.await?;

	response(
		node_id,
		json!({ "kind": "bucket", "bucket_id": bucket_id }),
		data,
	)
}

pub async fn database(
	db: &universaldb::Database,
	node_id: NodeId,
	bucket_id: BucketId,
	database_id: String,
	query: SampleQuery,
) -> Result<InspectResponse> {
	let sample_limit = sample_limit(query.sample_limit);
	let scan_limit = scan_limit(query.scan_limit);
	let scan_value_bytes = scan_value_bytes(scan_limit);
	let scope_database_id = database_id.clone();
	let data = db
		.txn("depot_inspect_database", move |tx| {
			let database_id = database_id.clone();
			async move {
				let bucket_pointer = tx_get_decoded(
					&tx,
					keys::bucket_pointer_cur_key(bucket_id),
					decode_bucket_pointer,
				)
				.await?;
				let Some(bucket_pointer) = bucket_pointer else {
					return Ok(
						json!({ "bucket_id": bucket_id, "database_id": database_id, "pointer": null }),
					);
				};
				let pointer = tx_get_decoded(
					&tx,
					keys::database_pointer_cur_key(bucket_pointer.current_branch, &database_id),
					decode_database_pointer,
				)
				.await?;
				let branch = if let Some(pointer) = &pointer {
					branch_blob_in_tx(
						&tx,
						pointer.current_branch,
						sample_limit,
						scan_limit,
						scan_value_bytes,
					)
					.await?
				} else {
					json!(null)
				};

				Ok(json!({
					"bucket_id": bucket_id,
					"database_id": database_id,
					"bucket_branch_id": bucket_pointer.current_branch,
					"pointer": pointer,
					"branch": branch,
				}))
			}
		})
		.await?;

	response(
		node_id,
		json!({ "kind": "database", "bucket_id": bucket_id, "database_id": scope_database_id }),
		data,
	)
}

pub async fn branch(
	db: &universaldb::Database,
	node_id: NodeId,
	branch_id: DatabaseBranchId,
	query: SampleQuery,
) -> Result<InspectResponse> {
	let sample_limit = sample_limit(query.sample_limit);
	let scan_limit = scan_limit(query.scan_limit);
	let scan_value_bytes = scan_value_bytes(scan_limit);
	let data = db
		.txn("depot_inspect_branch", move |tx| async move {
			branch_blob_in_tx(&tx, branch_id, sample_limit, scan_limit, scan_value_bytes).await
		})
		.await?;

	response(
		node_id,
		json!({ "kind": "branch", "branch_id": branch_id }),
		data,
	)
}

pub async fn branch_rows(
	db: &universaldb::Database,
	node_id: NodeId,
	branch_id: DatabaseBranchId,
	family: RowFamily,
	query: RowsQuery,
) -> Result<PaginatedRowsResponse> {
	let limit = page_limit(query.limit);
	let cursor = decode_optional_key(query.cursor.as_deref())?;
	let prefix = family.scan_prefix(branch_id);
	let include_bytes = query.include_bytes.unwrap_or(false);
	let scan = db
		.txn("depot_inspect_branch_rows", move |tx| {
			let prefix = prefix.clone();
			let cursor = cursor.clone();
			async move { scan_prefix_page(&tx, prefix, cursor.as_deref(), limit).await }
		})
		.await?;
	let mut rows = Vec::new();
	for row in scan.rows {
		rows.push(decode_row_value(
			branch_id,
			family,
			&row.key,
			&row.value,
			include_bytes,
		));
	}

	Ok(PaginatedRowsResponse {
		node_id: node_id.to_string(),
		generated_at_ms: now_ms()?,
		scope: json!({
			"kind": "branch_rows",
			"branch_id": branch_id,
			"family": family.as_str(),
		}),
		limit_applied: limit,
		rows,
		next_cursor: scan.next_cursor.map(|key| encode_key(&key)),
	})
}

pub async fn raw_key(
	db: &universaldb::Database,
	node_id: NodeId,
	key: Vec<u8>,
) -> Result<InspectResponse> {
	let value = db
		.txn("depot_inspect_raw_key", {
			let key = key.clone();
			move |tx| {
				let key = key.clone();
				async move {
					Ok(tx
						.informal()
						.get(&key, Snapshot)
						.await?
						.map(Vec::<u8>::from))
				}
			}
		})
		.await?;
	let decoded = best_effort_decode(&key, value.as_deref());

	response(
		node_id,
		json!({ "kind": "raw_key" }),
		json!({
			"key": encode_key(&key),
			"value": value.as_ref().map(|value| encode_key(value)),
			"value_size": value.as_ref().map(Vec::len),
			"decoded": decoded,
		}),
	)
}

pub async fn raw_scan(
	db: &universaldb::Database,
	node_id: NodeId,
	query: RawScanQuery,
) -> Result<PaginatedRowsResponse> {
	let limit = page_limit(query.limit);
	let prefix = decode_optional_key(query.prefix.as_deref())?.unwrap_or_default();
	let cursor = decode_optional_key(query.start_after.as_deref())?;
	let decode = query.decode.unwrap_or(true);
	let scan = db
		.txn("depot_inspect_raw_scan", move |tx| {
			let prefix = prefix.clone();
			let cursor = cursor.clone();
			async move { scan_prefix_page(&tx, prefix, cursor.as_deref(), limit).await }
		})
		.await?;
	let rows = scan
		.rows
		.into_iter()
		.map(|row| {
			json!({
				"key": encode_key(&row.key),
				"value_size": row.value.len(),
				"value": encode_key(&row.value),
				"decoded": decode.then(|| best_effort_decode(&row.key, Some(&row.value))),
			})
		})
		.collect();

	Ok(PaginatedRowsResponse {
		node_id: node_id.to_string(),
		generated_at_ms: now_ms()?,
		scope: json!({ "kind": "raw_scan" }),
		limit_applied: limit,
		rows,
		next_cursor: scan.next_cursor.map(|key| encode_key(&key)),
	})
}

pub fn decode_key_response(node_id: NodeId, key: Vec<u8>) -> Result<InspectResponse> {
	response(
		node_id,
		json!({ "kind": "raw_decode_key" }),
		json!({
			"key": encode_key(&key),
			"decoded": best_effort_decode(&key, None),
		}),
	)
}

pub async fn page_trace(
	db: &universaldb::Database,
	node_id: NodeId,
	branch_id: DatabaseBranchId,
	pgno: u32,
) -> Result<InspectResponse> {
	let head = db
		.txn("depot_inspect_page_trace", move |tx| async move {
			tx_get_decoded(&tx, keys::branch_meta_head_key(branch_id), decode_db_head).await
		})
		.await?;
	let outcome = if head.as_ref().is_some_and(|head| pgno <= head.db_size_pages) {
		"found"
	} else {
		"above_eof"
	};

	response(
		node_id,
		json!({ "kind": "page", "branch_id": branch_id, "pgno": pgno }),
		json!({
			"read_cap": head,
			"outcome": outcome,
			"source": { "kind": "unknown", "branch_id": branch_id },
			"steps": [],
			"bytes": null,
		}),
	)
}

pub fn decode_path_key(value: &str) -> Result<Vec<u8>> {
	BASE64_URL_SAFE_NO_PAD
		.decode(value)
		.context("decode unpadded base64url Depot inspect key")
}

fn response(node_id: NodeId, scope: Value, data: Value) -> Result<InspectResponse> {
	Ok(InspectResponse {
		node_id: node_id.to_string(),
		generated_at_ms: now_ms()?,
		scope,
		data,
	})
}

/// Clamps rather than rejects. An over-cap `limit` used to fail the request, which reads as an empty
/// result through most tooling and silently understates whatever was being counted.
fn page_limit(limit: Option<usize>) -> usize {
	limit.unwrap_or(DEFAULT_LIMIT).clamp(1, MAX_LIMIT)
}

fn sample_limit(limit: Option<usize>) -> usize {
	limit.unwrap_or(DEFAULT_SAMPLE_LIMIT).min(MAX_LIMIT)
}

fn scan_limit(limit: Option<usize>) -> usize {
	limit.unwrap_or(DEFAULT_SCAN_LIMIT).clamp(1, MAX_SCAN_LIMIT)
}

/// Scales the request's value-byte allowance with its row allowance, so raising `scan_limit` raises
/// both bounds together instead of leaving the byte ceiling as the real (and invisible) limit.
fn scan_value_bytes(scan_limit: usize) -> usize {
	DEFAULT_SCAN_VALUE_BYTES
		.saturating_mul(scan_limit.div_ceil(DEFAULT_SCAN_LIMIT))
		.min(MAX_SCAN_VALUE_BYTES)
}

fn now_ms() -> Result<i64> {
	let duration = SystemTime::now()
		.duration_since(UNIX_EPOCH)
		.context("system clock is before unix epoch")?;
	i64::try_from(duration.as_millis()).context("timestamp exceeds i64")
}

fn encode_key(key: &[u8]) -> String {
	BASE64_URL_SAFE_NO_PAD.encode(key)
}

fn decode_optional_key(value: Option<&str>) -> Result<Option<Vec<u8>>> {
	value.map(decode_path_key).transpose()
}

fn parse_bucket_id(value: &str) -> Result<BucketId> {
	Ok(BucketId::from_uuid(
		Uuid::parse_str(value).context("parse Depot inspect bucket id")?,
	))
}

async fn tx_get_decoded<T, F>(
	tx: &universaldb::Transaction,
	key: Vec<u8>,
	decode: F,
) -> Result<Option<T>>
where
	F: Fn(&[u8]) -> Result<T>,
{
	let Some(value) = tx.informal().get(&key, Snapshot).await? else {
		return Ok(None);
	};

	Ok(Some(decode(&value)?))
}

struct ScannedRow {
	key: Vec<u8>,
	value: Vec<u8>,
}

struct ScanPage {
	rows: Vec<ScannedRow>,
	next_cursor: Option<Vec<u8>>,
	has_more: bool,
}

async fn scan_prefix_page(
	tx: &universaldb::Transaction,
	prefix: Vec<u8>,
	cursor: Option<&[u8]>,
	limit: usize,
) -> Result<ScanPage> {
	if let Some(cursor) = cursor {
		ensure!(
			cursor.starts_with(&prefix),
			"Depot inspect cursor is outside the requested prefix"
		);
	}

	let (range_start, range_end) = universaldb::tuple::Subspace::from_bytes(prefix).range();
	let begin = cursor
		.map(universaldb::KeySelector::first_greater_than)
		.unwrap_or_else(|| universaldb::KeySelector::first_greater_or_equal(range_start));
	let informal = tx.informal();
	let mut stream = informal.get_ranges_keyvalues(
		RangeOption {
			begin,
			end: universaldb::KeySelector::first_greater_or_equal(range_end),
			limit: Some(limit.saturating_add(1)),
			mode: StreamingMode::WantAll,
			..RangeOption::default()
		},
		Snapshot,
	);
	let mut rows = Vec::new();
	while let Some(entry) = stream.try_next().await? {
		rows.push(ScannedRow {
			key: entry.key().to_vec(),
			value: entry.value().to_vec(),
		});
	}

	let has_more = rows.len() > limit;
	let overflow = if has_more { rows.pop() } else { None };
	let next_cursor = if has_more {
		rows.last()
			.map(|row| row.key.clone())
			.or_else(|| overflow.map(|row| row.key))
	} else {
		None
	};

	Ok(ScanPage {
		rows,
		next_cursor,
		has_more,
	})
}

/// Row and byte accounting for one key prefix.
///
/// `rows` is an exact count only when `rows_truncated` is false. `estimated_bytes` comes from FDB's
/// range-size estimate, which takes no scan and is accurate at branch-family scale, so it stays
/// meaningful for `DELTA` and `SHARD` where a counting scan is deliberately cut short.
struct PrefixStats {
	rows: usize,
	rows_truncated: bool,
	scanned_value_bytes: usize,
	estimated_bytes: Option<i64>,
}

impl PrefixStats {
	fn to_value(&self) -> Value {
		json!({
			"rows": self.rows,
			"rows_truncated": self.rows_truncated,
			"scanned_value_bytes": self.scanned_value_bytes,
			"estimated_bytes": self.estimated_bytes,
		})
	}
}

fn empty_prefix_stats() -> PrefixStats {
	PrefixStats {
		rows: 0,
		rows_truncated: false,
		scanned_value_bytes: 0,
		estimated_bytes: Some(0),
	}
}

async fn prefix_stats(
	tx: &universaldb::Transaction,
	prefix: Vec<u8>,
	budget: &mut ScanBudget,
) -> Result<PrefixStats> {
	let (range_start, range_end) = universaldb::tuple::Subspace::from_bytes(prefix.clone()).range();
	// Free: a range-size estimate takes no scan, so this stays accurate even for a family whose
	// row count below is cut short by the budget.
	let estimated_bytes = tx
		.get_estimated_range_size_bytes(&range_start, &range_end)
		.await
		.ok();

	let informal = tx.informal();
	let mut stream = informal.get_ranges_keyvalues(
		RangeOption {
			begin: universaldb::KeySelector::first_greater_or_equal(range_start),
			end: universaldb::KeySelector::first_greater_or_equal(range_end),
			mode: StreamingMode::WantAll,
			..RangeOption::default()
		},
		Snapshot,
	);
	let mut rows = 0;
	let mut scanned_value_bytes = 0;
	let mut rows_truncated = false;
	while let Some(entry) = stream.try_next().await? {
		if !budget.charge(entry.value().len()) {
			rows_truncated = true;
			break;
		}
		rows += 1;
		scanned_value_bytes += entry.value().len();
	}

	Ok(PrefixStats {
		rows,
		rows_truncated,
		scanned_value_bytes,
		estimated_bytes,
	})
}

async fn summary_for_prefix(
	tx: &universaldb::Transaction,
	prefix: Vec<u8>,
	sample_limit: usize,
	budget: &mut ScanBudget,
) -> Result<Value> {
	let stats = prefix_stats(tx, prefix.clone(), budget).await?;
	let scan = scan_prefix_page(tx, prefix, None, sample_limit).await?;
	let mut summary = stats.to_value();
	let Value::Object(fields) = &mut summary else {
		bail!("prefix stats did not serialize as an object");
	};
	fields.insert(
		"sample".to_string(),
		Value::Array(
			scan.rows
				.into_iter()
				.map(|row| {
					json!({
						"key": encode_key(&row.key),
						"value_size": row.value.len(),
						"decoded": best_effort_decode(&row.key, Some(&row.value)),
					})
				})
				.collect(),
		),
	);
	fields.insert(
		"next_cursor".to_string(),
		scan.next_cursor
			.map(|key| Value::String(encode_key(&key)))
			.unwrap_or(Value::Null),
	);

	Ok(summary)
}

fn empty_summary() -> Value {
	let mut summary = empty_prefix_stats().to_value();
	if let Value::Object(fields) = &mut summary {
		fields.insert("sample".to_string(), Value::Array(Vec::new()));
		fields.insert("next_cursor".to_string(), Value::Null);
	}

	summary
}

/// Counts `PIDX` rows whose owner txid sits at or below the hot watermark.
///
/// A hot slice that folds a page into a `SHARD` image but leaves the page's `PIDX` row pointing at
/// its old `DELTA` owner strands that delta forever: the delta is still `live_owned`, so reclaim
/// correctly refuses it, and the owner window in hot staging can never revisit a txid below the
/// watermark. `pinned_delta_estimated_bytes` is the footprint that pinning costs.
///
/// `stale_candidate_rows` is an upper bound, not a defect count: the sweep additionally confirms each
/// row against a `SHARD` version that carries the page, which costs an image read per shard and does
/// not belong in a probe under a scan budget.
async fn stale_pidx_probe(
	tx: &universaldb::Transaction,
	branch_id: DatabaseBranchId,
	hot_watermark_txid: u64,
	budget: &mut ScanBudget,
) -> Result<Value> {
	let prefix = keys::branch_pidx_prefix(branch_id);
	let (range_start, range_end) = universaldb::tuple::Subspace::from_bytes(prefix).range();
	let informal = tx.informal();
	let mut stream = informal.get_ranges_keyvalues(
		RangeOption {
			begin: universaldb::KeySelector::first_greater_or_equal(range_start),
			end: universaldb::KeySelector::first_greater_or_equal(range_end),
			mode: StreamingMode::WantAll,
			..RangeOption::default()
		},
		Snapshot,
	);
	let mut scanned_rows = 0;
	let mut scan_truncated = false;
	let mut stale_candidate_rows = 0_usize;
	let mut owner_txids = BTreeSet::new();
	let mut owner_txids_truncated = false;
	let mut undecodable_rows = 0_usize;
	while let Some(entry) = stream.try_next().await? {
		if !budget.charge(entry.value().len()) {
			scan_truncated = true;
			break;
		}
		scanned_rows += 1;
		let Some(owner_txid) = <[u8; 8]>::try_from(entry.value())
			.ok()
			.map(u64::from_be_bytes)
		else {
			undecodable_rows += 1;
			continue;
		};
		if owner_txid > hot_watermark_txid {
			continue;
		}
		stale_candidate_rows += 1;
		if owner_txids.len() < MAX_DISTINCT_TRACKED {
			owner_txids.insert(owner_txid);
		} else if !owner_txids.contains(&owner_txid) {
			owner_txids_truncated = true;
		}
	}

	// DELTA rows are keyed by owner txid, so everything at or below the watermark is exactly the
	// history the stale rows are pinning. This is a range-size estimate over a large contiguous
	// range, so it takes no scan and stays accurate at branch scale.
	let delta_begin = keys::branch_delta_prefix(branch_id);
	let delta_end =
		keys::branch_delta_chunk_prefix(branch_id, hot_watermark_txid.saturating_add(1));
	let pinned_delta_estimated_bytes = tx
		.get_estimated_range_size_bytes(&delta_begin, &delta_end)
		.await
		.ok();

	let pidx_repair = informal
		.get(
			&keys::branch_compaction_pidx_repair_key(branch_id),
			Snapshot,
		)
		.await?;
	let swept_at_hot_watermark_txid = pidx_repair
		.as_deref()
		.and_then(|value| <[u8; 8]>::try_from(value.as_slice()).ok())
		.map(u64::from_be_bytes);

	Ok(json!({
		"hot_watermark_txid": hot_watermark_txid,
		"scanned_rows": scanned_rows,
		"scan_truncated": scan_truncated,
		"stale_candidate_rows": stale_candidate_rows,
		"distinct_owner_txids": owner_txids.len(),
		"distinct_owner_txids_truncated": owner_txids_truncated,
		"min_owner_txid": owner_txids.first(),
		"max_owner_txid": owner_txids.last(),
		"undecodable_rows": undecodable_rows,
		"pinned_delta_estimated_bytes": pinned_delta_estimated_bytes,
		"pidx_repair": {
			"swept": pidx_repair.is_some(),
			"swept_at_hot_watermark_txid": swept_at_hot_watermark_txid,
		},
	}))
}

/// Summarizes the `SHARD_LRU` recency index that shard-cache eviction draws its candidates from.
/// An empty index on a branch with cold refs means eviction has nothing to consider, which is the
/// state a branch stays in while its writers ran without a cold tier attached.
async fn shard_cache_probe(
	tx: &universaldb::Transaction,
	branch_id: DatabaseBranchId,
	budget: &mut ScanBudget,
) -> Result<Value> {
	let (range_start, range_end) = keys::branch_shard_lru_range(branch_id);
	let informal = tx.informal();
	let mut stream = informal.get_ranges_keyvalues(
		RangeOption {
			begin: universaldb::KeySelector::first_greater_or_equal(range_start),
			end: universaldb::KeySelector::first_greater_or_equal(range_end),
			mode: StreamingMode::WantAll,
			..RangeOption::default()
		},
		Snapshot,
	);
	let mut rows = 0;
	let mut truncated = false;
	let mut shards = HashSet::new();
	let mut shards_truncated = false;
	let mut oldest_access_bucket = None;
	let mut newest_access_bucket = None;
	let mut undecodable_rows = 0_usize;
	while let Some(entry) = stream.try_next().await? {
		if !budget.charge(entry.value().len()) {
			truncated = true;
			break;
		}
		rows += 1;
		let Ok((access_bucket, shard_id)) =
			keys::decode_branch_shard_lru_key(branch_id, entry.key())
		else {
			undecodable_rows += 1;
			continue;
		};
		if shards.len() < MAX_DISTINCT_TRACKED {
			shards.insert(shard_id);
		} else if !shards.contains(&shard_id) {
			shards_truncated = true;
		}
		// Keys are bucket-major, so the scan walks buckets in ascending order.
		oldest_access_bucket.get_or_insert(access_bucket);
		newest_access_bucket = Some(access_bucket);
	}

	let last_access_bucket = informal
		.get(
			&keys::branch_manifest_last_access_bucket_key(branch_id),
			Snapshot,
		)
		.await?
		.as_deref()
		.and_then(|value| <[u8; 8]>::try_from(value.as_slice()).ok())
		.map(i64::from_be_bytes);

	Ok(json!({
		"lru_rows": rows,
		"lru_rows_truncated": truncated,
		"distinct_shards": shards.len(),
		"distinct_shards_truncated": shards_truncated,
		"oldest_access_bucket": oldest_access_bucket,
		"newest_access_bucket": newest_access_bucket,
		"undecodable_rows": undecodable_rows,
		"branch_last_access_bucket": last_access_bucket,
	}))
}

/// Cross-checks a branch's live `CMP/cold_shard` refs against the objects actually present in the
/// cold tier.
///
/// Both directions matter and neither is reachable from one side alone. A ref with no object is
/// unreadable cold coverage, which is corruption. An object with no ref is leaked spend unless a
/// `retired_cold_object` record accounts for it, which is why retired records are read here rather
/// than left for the caller to reason about.
pub async fn branch_cold_reconcile(
	_db: &universaldb::Database,
	node_id: NodeId,
	branch_id: DatabaseBranchId,
	_query: ColdReconcileQuery,
) -> Result<InspectResponse> {
	// The route stays so tooling sees the same inspect surface in both editions. There is no cold
	// tier to reconcile against here, so it always reports unconfigured.
	response(
		node_id,
		json!({ "kind": "cold_reconcile", "branch_id": branch_id }),
		json!({
			"branch_id": branch_id,
			"cold_tier_configured": false,
			"reconciled": false,
		}),
	)
}

async fn branch_blob_in_tx(
	tx: &universaldb::Transaction,
	branch_id: DatabaseBranchId,
	sample_limit: usize,
	scan_limit: usize,
	scan_value_bytes: usize,
) -> Result<Value> {
	let record = tx_get_decoded(
		tx,
		keys::branches_list_key(branch_id),
		decode_database_branch_record,
	)
	.await?;
	let head = tx_get_decoded(tx, keys::branch_meta_head_key(branch_id), decode_db_head).await?;
	let head_at_fork = tx_get_decoded(
		tx,
		keys::branch_meta_head_at_fork_key(branch_id),
		decode_db_head,
	)
	.await?;
	let compaction_root = tx_get_decoded(
		tx,
		keys::branch_compaction_root_key(branch_id),
		decode_compaction_root,
	)
	.await?;
	let dirty = tx_get_decoded(
		tx,
		keys::sqlite_cmp_dirty_key(branch_id),
		decode_sqlite_cmp_dirty,
	)
	.await?;
	let gc_pin = gc::read_branch_gc_pin_tx(tx, branch_id).await?;
	let reclaim_progress = tx_get_decoded(
		tx,
		keys::branch_compaction_reclaim_progress_key(branch_id),
		decode_reclaim_progress,
	)
	.await?;
	let hot_watermark_txid = compaction_root
		.as_ref()
		.map(|root| root.hot_watermark_txid)
		.unwrap_or(0);
	// Reserved up front so the row-family counts below cannot spend the probes' allowance. PIDX and
	// SHARD_LRU values are 8 bytes and 0 bytes respectively, so the probes are row-bound in practice
	// and need almost none of the byte pool.
	// Each consumer gets its own budget rather than drawing from a shared pool. `DELTA` and `SHARD`
	// are page blobs, so under one pool the row-family counts would spend the whole byte allowance
	// before either probe ran, and the stale-PIDX probe would report zero stale rows on a branch
	// full of them. A truncation flag does not rescue that: a zero that reads as "clean" is the
	// exact failure this probe exists to catch. PIDX also has one row per database page, so the two
	// probes are kept apart from each other for the same reason.
	let mut stale_pidx_budget = ScanBudget::new(scan_limit, scan_value_bytes);
	let stale_pidx =
		stale_pidx_probe(tx, branch_id, hot_watermark_txid, &mut stale_pidx_budget).await?;
	let mut shard_cache_budget = ScanBudget::new(scan_limit, scan_value_bytes);
	let shard_cache = shard_cache_probe(tx, branch_id, &mut shard_cache_budget).await?;
	let mut budget = ScanBudget::new(scan_limit, scan_value_bytes);
	let budget = &mut budget;
	let mut row_families = serde_json::Map::new();
	for family in [
		RowFamily::Commits,
		RowFamily::Pidx,
		RowFamily::Deltas,
		RowFamily::Shards,
		RowFamily::ColdShards,
		RowFamily::RetiredColdObjects,
		RowFamily::PitrIntervals,
		RowFamily::Pins,
		RowFamily::StagedHotShards,
	] {
		row_families.insert(
			family.as_str().to_string(),
			summary_for_prefix(tx, family.scan_prefix(branch_id), sample_limit, budget).await?,
		);
	}

	Ok(json!({
		"branch_id": branch_id,
		"record": record,
		"head": head,
		"head_at_fork": head_at_fork,
		"pins": gc_pin.map(|pin| {
			json!({
				"branch_id": pin.branch_id,
				"refcount": pin.refcount,
				"root_pin": versionstamp_value(&pin.root_pin),
				"desc_pin": versionstamp_value(&pin.desc_pin),
				"restore_point_pin": versionstamp_value(&pin.restore_point_pin),
				"gc_pin": versionstamp_value(&pin.gc_pin),
			})
		}),
		"compaction": {
			"root": compaction_root,
			"dirty": dirty,
			"reclaim_progress": reclaim_progress,
			"stale_pidx": stale_pidx,
			"shard_cache": shard_cache,
			"manifest_access": {
				"last_hot_pass_txid_key": encode_key(&keys::branch_manifest_last_hot_pass_txid_key(branch_id)),
				"last_access_ts_ms_key": encode_key(&keys::branch_manifest_last_access_ts_ms_key(branch_id)),
				"last_access_bucket_key": encode_key(&keys::branch_manifest_last_access_bucket_key(branch_id)),
			}
		},
		"row_families": row_families,
		"links": {
			"self": format!("/depot/inspect/branches/{}", branch_id.as_uuid()),
			"rows": format!("/depot/inspect/branches/{}/rows/{{family}}", branch_id.as_uuid()),
			"page_trace": format!("/depot/inspect/branches/{}/pages/{{pgno}}/trace", branch_id.as_uuid()),
		}
	}))
}

fn best_effort_decode(key: &[u8], value: Option<&[u8]>) -> Value {
	let mut decoded = serde_json::Map::new();
	decoded.insert("key".to_string(), decode_key_metadata(key));
	if let Some(value) = value {
		decoded.insert("value".to_string(), decode_value_by_key(key, value));
	}
	Value::Object(decoded)
}

fn decode_key_metadata(key: &[u8]) -> Value {
	if key.len() < 2 || key[0] != keys::SQLITE_SUBSPACE_PREFIX {
		return json!({ "family": "unknown" });
	}

	json!({
		"partition": key[1],
		"family": match key[1] {
			keys::DBPTR_PARTITION => "database-pointer",
			keys::BUCKET_PTR_PARTITION => "bucket-pointer",
			keys::BUCKET_CATALOG_PARTITION => "bucket-catalog",
			keys::BRANCHES_PARTITION => "database-branch",
			keys::BUCKET_BRANCH_PARTITION => "bucket-branch",
			keys::BR_PARTITION => "branch-row",
			keys::CTR_PARTITION => "counter",
			keys::RESTORE_POINT_PARTITION => "restore-point",
			keys::CMPC_PARTITION => "compactor-queue",
			keys::DB_PIN_PARTITION => "database-pin",
			keys::BUCKET_FORK_PIN_PARTITION => "bucket-fork-pin",
			keys::BUCKET_CHILD_PARTITION => "bucket-child",
			keys::BUCKET_CATALOG_BY_DB_PARTITION => "bucket-catalog-by-db",
			keys::BUCKET_PROOF_EPOCH_PARTITION => "bucket-proof-epoch",
			keys::SQLITE_CMP_DIRTY_PARTITION => "sqlite-compaction-dirty",
			_ => "unknown",
		}
	})
}

fn decode_value_by_key(key: &[u8], value: &[u8]) -> Value {
	let value_size = value.len();
	if key.len() >= 2 {
		match key[1] {
			keys::DBPTR_PARTITION => return value_or_error(decode_database_pointer(value)),
			keys::BUCKET_PTR_PARTITION => return value_or_error(decode_bucket_pointer(value)),
			keys::BRANCHES_PARTITION => {
				return value_or_error(decode_database_branch_record(value));
			}
			keys::BUCKET_BRANCH_PARTITION => {
				return value_or_error(decode_bucket_branch_record(value));
			}
			keys::SQLITE_CMP_DIRTY_PARTITION => {
				return value_or_error(decode_sqlite_cmp_dirty(value));
			}
			keys::DB_PIN_PARTITION => return value_or_error(decode_db_history_pin(value)),
			_ => {}
		}
	}

	json!({
		"value_size": value_size,
		"sha256": digest_value(value),
	})
}

fn decode_row_value(
	branch_id: DatabaseBranchId,
	family: RowFamily,
	key: &[u8],
	value: &[u8],
	include_bytes: bool,
) -> Value {
	let decoded = match family {
		RowFamily::Commits => {
			let txid = key
				.strip_prefix(keys::branch_commit_prefix(branch_id).as_slice())
				.and_then(|suffix| suffix.try_into().ok())
				.map(u64::from_be_bytes);
			json!({ "txid": txid, "row": result_to_value(decode_commit_row(value)) })
		}
		RowFamily::Pidx => {
			let pgno = key
				.strip_prefix(keys::branch_pidx_prefix(branch_id).as_slice())
				.and_then(|suffix| suffix.try_into().ok())
				.map(u32::from_be_bytes);
			let owner_txid = <[u8; 8]>::try_from(value).ok().map(u64::from_be_bytes);
			json!({ "pgno": pgno, "owner_txid": owner_txid })
		}
		RowFamily::Deltas => {
			// A commit stores its pages as one blob per shard-aligned page range, and every blob
			// restarts its chunk index at zero, so a chunk index only identifies a row alongside the
			// segment it belongs to. `segment_first_pgno` is null for a pre-segmentation commit,
			// whose single blob covers everything it wrote.
			let txid = keys::decode_branch_delta_chunk_txid(branch_id, key).ok();
			let chunk_ref = txid
				.and_then(|txid| keys::decode_branch_delta_chunk_ref(branch_id, txid, key).ok());
			json!({
				"txid": txid,
				"segment_first_pgno": chunk_ref.and_then(|chunk_ref| chunk_ref.first_pgno()),
				"chunk_idx": chunk_ref.map(|chunk_ref| chunk_ref.chunk_idx()),
				"value_size": value.len(),
				"sha256": digest_value(value),
			})
		}
		RowFamily::Shards => json!({
			"value_size": value.len(),
			"sha256": digest_value(value),
		}),
		RowFamily::ColdShards => value_or_error(decode_cold_shard_ref(value)),
		RowFamily::RetiredColdObjects => value_or_error(decode_retired_cold_object(value)),
		RowFamily::PitrIntervals => json!({
			"bucket_start_ms": keys::decode_branch_pitr_interval_bucket(branch_id, key).ok(),
			"coverage": result_to_value(decode_pitr_interval_coverage(value)),
		}),
		RowFamily::Pins => value_or_error(decode_db_history_pin(value)),
		RowFamily::StagedHotShards => json!({
			"value_size": value.len(),
			"sha256": digest_value(value),
		}),
	};

	json!({
		"key": encode_key(key),
		"decoded": decoded,
		"bytes": include_bytes.then(|| encode_key(value)),
	})
}

fn value_or_error<T: Serialize>(result: Result<T>) -> Value {
	result_to_value(result)
}

fn result_to_value<T: Serialize>(result: Result<T>) -> Value {
	match result {
		Ok(value) => serde_json::to_value(value).unwrap_or_else(
			|err| json!({ "decode_error": format!("failed to encode decoded value as JSON: {err}") }),
		),
		Err(err) => json!({ "decode_error": err.to_string() }),
	}
}

fn digest_value(value: &[u8]) -> Value {
	let digest = Sha256::digest(value);
	json!({
		"hex": hex_lower(&digest),
		"base64url": encode_key(&digest),
	})
}

fn versionstamp_value(value: &[u8; 16]) -> Value {
	json!({
		"hex": hex_lower(value),
		"base64url": encode_key(value),
	})
}

fn hex_lower(bytes: &[u8]) -> String {
	const HEX: &[u8; 16] = b"0123456789abcdef";
	let mut out = String::with_capacity(bytes.len() * 2);
	for byte in bytes {
		out.push(HEX[(byte >> 4) as usize] as char);
		out.push(HEX[(byte & 0x0f) as usize] as char);
	}
	out
}
