//! Local-only diagnostics and proof-based repair for partial SQLite shard histories.

use std::{
	collections::{BTreeMap, BTreeSet},
	time::{Duration, Instant},
};

use anyhow::{Context, Result, ensure};
use futures_util::{StreamExt, TryStreamExt};
use serde::Serialize;
use universaldb::{
	KeySelector, RangeOption, options::StreamingMode, utils::IsolationLevel::Snapshot,
};

use crate::conveyer::{
	keys::{self, SHARD_SIZE},
	ltx::decode_ltx_v3,
	shard_blob,
	types::{
		BucketBranchId, CompactionRoot, DBHead, DatabaseBranchId, decode_commit_row,
		decode_compaction_root, decode_database_pointer, decode_db_head,
	},
};

#[derive(Debug, Clone, Serialize)]
pub struct CompactionRecoveryReport {
	pub database_branch_id: DatabaseBranchId,
	pub head_txid: u64,
	pub head_db_size_pages: u32,
	pub repair_input_sha256: String,
	pub hot_shards_with_installed_versions: usize,
	pub hot_shard_version_count: usize,
	pub staged_hot_shard_row_count: usize,
	pub cold_objects: usize,
	pub same_issue_signature: bool,
	pub related_hot_history_signature: bool,
	pub applied: bool,
	pub hot_shard_versions: Vec<HotShardVersionFact>,
	pub suspect_shards: Vec<SuspectShard>,
	pub hot_history_suspect_shards: Vec<HotHistorySuspectShard>,
}

#[derive(Debug, Clone, Serialize)]
pub struct HotShardHistoryRepairReport {
	pub strategy: &'static str,
	pub dry_run: bool,
	pub applicable: bool,
	pub rejection_reason: Option<String>,
	pub before: CompactionRecoveryReport,
	pub after: Option<CompactionRecoveryReport>,
}

#[derive(Debug, Clone, Copy)]
pub struct HotShardHistoryScanOptions {
	/// Maximum amount of time spent consuming one FDB range transaction before continuing from a
	/// cursor in a fresh snapshot transaction.
	pub transaction_max_duration: Duration,
	/// Maximum key plus value bytes retained from one FDB range transaction.
	pub transaction_max_bytes: usize,
	/// Number of database branches diagnosed concurrently after the metadata prefilter.
	pub concurrency: usize,
	/// Optional current-database limit, intended for smoke tests.
	pub database_limit: Option<usize>,
}

impl Default for HotShardHistoryScanOptions {
	fn default() -> Self {
		Self {
			transaction_max_duration: Duration::from_secs(2),
			transaction_max_bytes: 4 * 1024 * 1024,
			concurrency: 4,
			database_limit: None,
		}
	}
}

#[derive(Debug, Clone, Default, Serialize)]
pub struct HotShardHistoryScanIo {
	pub transactions: usize,
	pub rows: usize,
	pub bytes: u64,
}

impl HotShardHistoryScanIo {
	fn add_assign(&mut self, other: &Self) {
		self.transactions = self.transactions.saturating_add(other.transactions);
		self.rows = self.rows.saturating_add(other.rows);
		self.bytes = self.bytes.saturating_add(other.bytes);
	}
}

#[derive(Debug, Clone, Serialize)]
pub struct HotShardHistoryScanIdentity {
	pub bucket_branch_id: BucketBranchId,
	pub database_id: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct HotShardHistoryScanAffected {
	pub database_branch_id: DatabaseBranchId,
	pub databases: Vec<HotShardHistoryScanIdentity>,
	pub head_txid: u64,
	pub db_size_pages: u32,
	pub suspect_shards: Vec<PartialHotShardSuspect>,
}

#[derive(Debug, Clone, Serialize)]
pub struct PartialHotShardSuspect {
	pub shard_id: u32,
	pub selected_as_of_txid: u64,
	pub selected_page_count: usize,
	pub expected_page_count: usize,
	pub db_size_pages_at_selected_fold: u32,
	pub missing_pages: Vec<u32>,
}

#[derive(Debug, Clone, Serialize)]
pub struct HotShardHistoryScanInconclusive {
	pub database_branch_id: DatabaseBranchId,
	pub databases: Vec<HotShardHistoryScanIdentity>,
	pub error: String,
}

#[derive(Debug, Clone, Default, Serialize)]
pub struct HotShardHistoryScanPrefilter {
	pub missing_head: usize,
	pub never_hot_compacted: usize,
	pub cold_history: usize,
	pub candidates: usize,
}

#[derive(Debug, Clone, Serialize)]
pub struct HotShardHistoryScanReport {
	pub method: &'static str,
	pub read_only: bool,
	pub scope: &'static str,
	pub pointer_rows_scanned: usize,
	pub ignored_pointer_rows: usize,
	pub current_databases: usize,
	pub unique_current_branches: usize,
	pub prefilter: HotShardHistoryScanPrefilter,
	pub healthy_candidates: usize,
	pub affected: Vec<HotShardHistoryScanAffected>,
	pub inconclusive: Vec<HotShardHistoryScanInconclusive>,
	pub io: HotShardHistoryScanIo,
}

#[derive(Debug, Clone, Serialize)]
pub struct HotShardVersionFact {
	pub shard_id: u32,
	pub as_of_txid: u64,
	pub commit_wall_clock_ms: Option<i64>,
	pub db_size_pages_at_txid: Option<u32>,
	pub page_count: usize,
	pub min_page: Option<u32>,
	pub max_page: Option<u32>,
	pub selected_at_head: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct SuspectShard {
	pub shard_id: u32,
	pub hot_as_of_txid: u64,
	pub hot_page_count: usize,
	pub cold_as_of_txid: u64,
	pub cold_page_count: usize,
	pub cold_object_key: String,
	pub cold_ref_is_live: bool,
	pub cold_ref_would_be_selected: bool,
	pub db_size_pages_at_hot_fold: u32,
	pub missing_pages_restored: Vec<u32>,
	pub repaired_page_count: usize,
}

#[derive(Debug, Clone, Serialize)]
pub struct HotHistorySuspectShard {
	pub shard_id: u32,
	pub selected_as_of_txid: u64,
	pub selected_page_count: usize,
	pub baseline_as_of_txid: u64,
	pub baseline_page_count: usize,
	pub db_size_pages_at_selected_fold: u32,
	pub missing_pages_restored: Vec<u32>,
	pub restored_page_sources: Vec<RestoredPageSource>,
	pub repaired_page_count: usize,
}

#[derive(Debug, Clone, Serialize)]
pub struct RestoredPageSource {
	pub pgno: u32,
	pub as_of_txid: u64,
	pub source: &'static str,
}

#[derive(Debug, Clone)]
struct HotShardHistoryScanTarget {
	database_branch_id: DatabaseBranchId,
	databases: Vec<HotShardHistoryScanIdentity>,
}

#[derive(Debug)]
enum HotShardHistoryBranchDisposition {
	MissingHead,
	NeverHotCompacted,
	ColdHistory,
	Healthy,
	Affected {
		head_txid: u64,
		db_size_pages: u32,
		suspect_shards: Vec<PartialHotShardSuspect>,
	},
}

#[derive(Debug)]
struct HotShardHistoryBranchScan {
	disposition: HotShardHistoryBranchDisposition,
	io: HotShardHistoryScanIo,
}

#[derive(Debug)]
struct BoundedRows {
	rows: Vec<(Vec<u8>, Vec<u8>)>,
	io: HotShardHistoryScanIo,
}

#[derive(Debug)]
struct BoundedRowsChunk {
	rows: Vec<(Vec<u8>, Vec<u8>)>,
	last_key: Option<Vec<u8>>,
	exhausted: bool,
	bytes: u64,
}

#[derive(Debug)]
struct ScanAnchor {
	head_bytes: Vec<u8>,
	head: DBHead,
	root_bytes: Option<Vec<u8>>,
	root: Option<CompactionRoot>,
	io: HotShardHistoryScanIo,
}

/// Scans current Depot database branches for partial selected hot shards, the storage invariant
/// violated by the no-cold multi-slice compaction bug. This function performs snapshot reads only.
/// It deliberately reads only current pointers, metadata, selected shard versions, and their commit
/// rows; it does not scan retained/staged history, call the Depot read path, touch access metadata,
/// list cold objects, or invoke SQLite.
pub async fn scan_hot_shard_history_corruption(
	db: &universaldb::Database,
	options: HotShardHistoryScanOptions,
) -> Result<HotShardHistoryScanReport> {
	ensure!(
		!options.transaction_max_duration.is_zero(),
		"transaction scan duration must be greater than zero"
	);
	ensure!(
		options.transaction_max_bytes > 0,
		"transaction scan byte budget must be greater than zero"
	);
	ensure!(
		options.concurrency > 0,
		"scan concurrency must be greater than zero"
	);

	let pointer_prefix = keys::database_pointer_cur_prefix();
	let (pointer_begin, pointer_end) =
		universaldb::tuple::Subspace::from_bytes(pointer_prefix).range();
	let pointer_scan = scan_range_bounded(
		db,
		pointer_begin,
		pointer_end,
		options,
		"depot_recovery_scan_pointers",
	)
	.await?;
	let pointer_rows_scanned = pointer_scan.rows.len();
	let mut ignored_pointer_rows = 0usize;
	let mut current_databases = 0usize;
	let mut targets = BTreeMap::<DatabaseBranchId, HotShardHistoryScanTarget>::new();
	for (key, value) in pointer_scan.rows {
		let Ok((bucket_branch_id, database_id)) = keys::decode_database_pointer_cur_key(&key)
		else {
			ignored_pointer_rows += 1;
			continue;
		};
		let pointer = decode_database_pointer(&value)
			.context("decode current database pointer during corruption scan")?;
		current_databases += 1;
		targets
			.entry(pointer.current_branch)
			.or_insert_with(|| HotShardHistoryScanTarget {
				database_branch_id: pointer.current_branch,
				databases: Vec::new(),
			})
			.databases
			.push(HotShardHistoryScanIdentity {
				bucket_branch_id,
				database_id,
			});
	}
	let mut targets = targets.into_values().collect::<Vec<_>>();
	if let Some(limit) = options.database_limit {
		targets.truncate(limit);
	}
	let unique_current_branches = targets.len();

	let scans = futures_util::stream::iter(targets.into_iter().map(|target| async move {
		let result = scan_hot_shard_history_branch(db, target.database_branch_id).await;
		(target, result)
	}))
	.buffer_unordered(options.concurrency)
	.collect::<Vec<_>>()
	.await;

	let mut prefilter = HotShardHistoryScanPrefilter::default();
	let mut healthy_candidates = 0usize;
	let mut affected = Vec::new();
	let mut inconclusive = Vec::new();
	let mut io = pointer_scan.io;
	for (target, result) in scans {
		match result {
			Ok(scan) => {
				io.add_assign(&scan.io);
				match scan.disposition {
					HotShardHistoryBranchDisposition::MissingHead => prefilter.missing_head += 1,
					HotShardHistoryBranchDisposition::NeverHotCompacted => {
						prefilter.never_hot_compacted += 1;
					}
					HotShardHistoryBranchDisposition::ColdHistory => prefilter.cold_history += 1,
					HotShardHistoryBranchDisposition::Healthy => {
						prefilter.candidates += 1;
						healthy_candidates += 1;
					}
					HotShardHistoryBranchDisposition::Affected {
						head_txid,
						db_size_pages,
						suspect_shards,
					} => {
						prefilter.candidates += 1;
						affected.push(HotShardHistoryScanAffected {
							database_branch_id: target.database_branch_id,
							databases: target.databases,
							head_txid,
							db_size_pages,
							suspect_shards,
						});
					}
				}
			}
			Err(error) => inconclusive.push(HotShardHistoryScanInconclusive {
				database_branch_id: target.database_branch_id,
				databases: target.databases,
				error: format!("{error:#}"),
			}),
		}
	}
	affected.sort_by_key(|item| item.database_branch_id);
	inconclusive.sort_by_key(|item| item.database_branch_id);

	Ok(HotShardHistoryScanReport {
		method: "partial-hot-shard",
		read_only: true,
		scope: "current-database-branches",
		pointer_rows_scanned,
		ignored_pointer_rows,
		current_databases,
		unique_current_branches,
		prefilter,
		healthy_candidates,
		affected,
		inconclusive,
		io,
	})
}

async fn scan_hot_shard_history_branch(
	db: &universaldb::Database,
	branch_id: DatabaseBranchId,
) -> Result<HotShardHistoryBranchScan> {
	let Some(anchor) = load_scan_anchor(db, branch_id).await? else {
		return Ok(HotShardHistoryBranchScan {
			disposition: HotShardHistoryBranchDisposition::MissingHead,
			io: HotShardHistoryScanIo {
				transactions: 1,
				..Default::default()
			},
		});
	};
	let mut io = anchor.io.clone();
	let Some(root) = anchor.root.clone() else {
		return Ok(HotShardHistoryBranchScan {
			disposition: HotShardHistoryBranchDisposition::NeverHotCompacted,
			io,
		});
	};
	if root.hot_watermark_txid == 0 {
		return Ok(HotShardHistoryBranchScan {
			disposition: HotShardHistoryBranchDisposition::NeverHotCompacted,
			io,
		});
	}
	if root.cold_watermark_txid != 0 {
		return Ok(HotShardHistoryBranchScan {
			disposition: HotShardHistoryBranchDisposition::ColdHistory,
			io,
		});
	}
	let (has_cold_refs, cold_ref_io) =
		prefix_has_rows(db, keys::branch_compaction_cold_shard_prefix(branch_id)).await?;
	io.add_assign(&cold_ref_io);
	if has_cold_refs {
		return Ok(HotShardHistoryBranchScan {
			disposition: HotShardHistoryBranchDisposition::ColdHistory,
			io,
		});
	}

	let mut suspect_shards = Vec::new();
	let hot_watermark_txid = root.hot_watermark_txid;
	let max_shard_id = anchor.head.db_size_pages / SHARD_SIZE;
	for shard_id in 0..=max_shard_id {
		let selected = db
			.txn("depot_recovery_scan_selected_shard", move |tx| async move {
				let load = shard_blob::read_latest_shard_blob(
					&tx,
					branch_id,
					shard_id,
					hot_watermark_txid,
					Snapshot,
				)
				.await?;
				let rows_scanned = load.rows_scanned;
				let Some((as_of_txid, version)) = load.version else {
					return Ok(None);
				};
				let commit_key = keys::branch_commit_key(branch_id, as_of_txid);
				let commit_bytes = tx
					.informal()
					.get(&commit_key, Snapshot)
					.await?
					.context("selected hot shard is missing its commit row")?;
				Ok(Some((
					as_of_txid,
					version.rows,
					version.blob,
					rows_scanned,
					commit_key,
					commit_bytes.to_vec(),
				)))
			})
			.await?;
		let Some((as_of_txid, rows, blob, rows_scanned, commit_key, commit_bytes)) = selected
		else {
			io.transactions += 1;
			continue;
		};
		io.transactions += 1;
		io.rows = io.rows.saturating_add(rows_scanned).saturating_add(1);
		let selected_bytes = rows
			.iter()
			.map(|(key, value)| key.len().saturating_add(value.len()))
			.sum::<usize>()
			.saturating_add(commit_key.len())
			.saturating_add(commit_bytes.len());
		io.bytes = io
			.bytes
			.saturating_add(u64::try_from(selected_bytes).unwrap_or(u64::MAX));

		let commit = decode_commit_row(&commit_bytes)
			.context("decode selected hot shard commit during corruption scan")?;
		let decoded = decode_ltx_v3(&blob).with_context(|| {
			format!("decode selected hot shard {shard_id} at txid {as_of_txid}")
		})?;
		ensure!(
			decoded.header.max_txid == as_of_txid,
			"selected hot shard key/header txid mismatch"
		);
		ensure!(
			decoded
				.pages
				.iter()
				.all(|page| page.pgno / SHARD_SIZE == shard_id),
			"selected hot shard contains a page from another shard"
		);

		let first_page = if shard_id == 0 {
			1
		} else {
			shard_id.saturating_mul(SHARD_SIZE)
		};
		let shard_last_page = shard_id
			.saturating_add(1)
			.saturating_mul(SHARD_SIZE)
			.saturating_sub(1);
		let db_size_pages_at_selected_fold = commit.db_size_pages.min(anchor.head.db_size_pages);
		let last_page = shard_last_page.min(db_size_pages_at_selected_fold);
		let present_pages = decoded
			.pages
			.iter()
			.map(|page| page.pgno)
			.collect::<BTreeSet<_>>();
		let missing_pages = if first_page <= last_page {
			(first_page..=last_page)
				.filter(|pgno| !present_pages.contains(pgno))
				.collect::<Vec<_>>()
		} else {
			Vec::new()
		};
		// A page whose PIDX owner is newer than this image was not part of the shard at this image's
		// txid, so its absence is correct rather than a defect. A page owned at or below the image's
		// txid is the real thing this scanner looks for: the fold should have absorbed it, and a
		// fork or PITR read capped at this txid resolves through this image and zero-fills it.
		//
		// Do not widen this to "has any PIDX row". A live row masks the gap for reads at the branch
		// head, but every shard version has to be a complete image of its shard at its own txid, so
		// the gap is still a defect for any read capped below that row's owner.
		let missing_pages = if missing_pages.is_empty() {
			missing_pages
		} else {
			let (pidx_owners, pidx_io) =
				read_pidx_owners(db, branch_id, first_page, last_page).await?;
			io.add_assign(&pidx_io);
			missing_pages
				.into_iter()
				.filter(|pgno| {
					pidx_owners
						.get(pgno)
						.is_none_or(|owner_txid| *owner_txid <= as_of_txid)
				})
				.collect::<Vec<_>>()
		};

		if !missing_pages.is_empty() {
			suspect_shards.push(PartialHotShardSuspect {
				shard_id,
				selected_as_of_txid: as_of_txid,
				selected_page_count: decoded.pages.len(),
				expected_page_count: if first_page <= last_page {
					usize::try_from(last_page - first_page + 1).unwrap_or(usize::MAX)
				} else {
					0
				},
				db_size_pages_at_selected_fold,
				missing_pages,
			});
		}
	}

	let Some(after) = load_scan_anchor(db, branch_id).await? else {
		ensure!(false, "database head disappeared during corruption scan");
		unreachable!();
	};
	io.add_assign(&after.io);
	ensure!(
		after.head_bytes == anchor.head_bytes && after.root_bytes == anchor.root_bytes,
		"database head or compaction root changed during corruption scan"
	);
	let disposition = if suspect_shards.is_empty() {
		HotShardHistoryBranchDisposition::Healthy
	} else {
		HotShardHistoryBranchDisposition::Affected {
			head_txid: anchor.head.head_txid,
			db_size_pages: anchor.head.db_size_pages,
			suspect_shards,
		}
	};
	Ok(HotShardHistoryBranchScan { disposition, io })
}

async fn load_scan_anchor(
	db: &universaldb::Database,
	branch_id: DatabaseBranchId,
) -> Result<Option<ScanAnchor>> {
	let head_key = keys::branch_meta_head_key(branch_id);
	let root_key = keys::branch_compaction_root_key(branch_id);
	let (head_bytes, root_bytes) = db
		.txn("depot_recovery_scan_anchor", {
			let head_key = head_key.clone();
			let root_key = root_key.clone();
			move |tx| {
				let head_key = head_key.clone();
				let root_key = root_key.clone();
				async move {
					let informal = tx.informal();
					let head = informal.get(&head_key, Snapshot).await?;
					let root = informal.get(&root_key, Snapshot).await?;
					Ok((head.map(Vec::from), root.map(Vec::from)))
				}
			}
		})
		.await?;
	let Some(head_bytes) = head_bytes else {
		return Ok(None);
	};
	let head =
		decode_db_head(&head_bytes).context("decode database head during corruption scan")?;
	let root = root_bytes
		.as_deref()
		.map(decode_compaction_root)
		.transpose()
		.context("decode compaction root during corruption scan")?;
	let bytes = head_key
		.len()
		.saturating_add(head_bytes.len())
		.saturating_add(root_key.len())
		.saturating_add(root_bytes.as_ref().map_or(0, Vec::len));
	let row_count = 1 + usize::from(root.is_some());
	Ok(Some(ScanAnchor {
		head_bytes,
		head,
		root_bytes,
		root,
		io: HotShardHistoryScanIo {
			transactions: 1,
			rows: row_count,
			bytes: u64::try_from(bytes).unwrap_or(u64::MAX),
		},
	}))
}

/// The PIDX owner txid of each page in `[first_page, last_page]` that still carries a live row.
async fn read_pidx_owners(
	db: &universaldb::Database,
	branch_id: DatabaseBranchId,
	first_page: u32,
	last_page: u32,
) -> Result<(BTreeMap<u32, u64>, HotShardHistoryScanIo)> {
	let begin = keys::branch_pidx_key(branch_id, first_page);
	let end = keys::branch_pidx_key(branch_id, last_page.saturating_add(1));
	db.txn("depot_recovery_scan_pidx_owners", move |tx| {
		let begin = begin.clone();
		let end = end.clone();
		async move {
			let informal = tx.informal();
			let mut stream = informal.get_ranges_keyvalues(
				RangeOption {
					begin: KeySelector::first_greater_or_equal(begin),
					end: KeySelector::first_greater_or_equal(end),
					mode: StreamingMode::WantAll,
					..RangeOption::default()
				},
				Snapshot,
			);
			let mut owners = BTreeMap::new();
			let mut bytes = 0_usize;
			while let Some(entry) = stream.try_next().await? {
				bytes = bytes
					.saturating_add(entry.key().len())
					.saturating_add(entry.value().len());
				let pgno =
					crate::compaction::shared::decode_branch_pidx_pgno(branch_id, entry.key())?;
				let owner_txid = <[u8; 8]>::try_from(entry.value())
					.map(u64::from_be_bytes)
					.map_err(|_| anyhow::anyhow!("pidx row for page {pgno} is not a u64 txid"))?;
				owners.insert(pgno, owner_txid);
			}
			let io = HotShardHistoryScanIo {
				transactions: 1,
				rows: owners.len(),
				bytes: u64::try_from(bytes).unwrap_or(u64::MAX),
			};
			Ok((owners, io))
		}
	})
	.await
}

async fn prefix_has_rows(
	db: &universaldb::Database,
	prefix: Vec<u8>,
) -> Result<(bool, HotShardHistoryScanIo)> {
	let (begin, end) = universaldb::tuple::Subspace::from_bytes(prefix).range();
	let row = db
		.txn("depot_recovery_scan_prefix_exists", move |tx| {
			let begin = begin.clone();
			let end = end.clone();
			async move {
				let informal = tx.informal();
				let mut stream = informal.get_ranges_keyvalues(
					RangeOption {
						begin: KeySelector::first_greater_or_equal(begin),
						end: KeySelector::first_greater_or_equal(end),
						limit: Some(1),
						mode: StreamingMode::Iterator,
						..RangeOption::default()
					},
					Snapshot,
				);
				Ok(stream
					.try_next()
					.await?
					.map(|entry| (entry.key().len(), entry.value().len())))
			}
		})
		.await?;
	let bytes = row.map_or(0, |(key, value)| key.saturating_add(value));
	Ok((
		row.is_some(),
		HotShardHistoryScanIo {
			transactions: 1,
			rows: usize::from(row.is_some()),
			bytes: u64::try_from(bytes).unwrap_or(u64::MAX),
		},
	))
}

async fn scan_range_bounded(
	db: &universaldb::Database,
	begin: Vec<u8>,
	end: Vec<u8>,
	options: HotShardHistoryScanOptions,
	transaction_name: &'static str,
) -> Result<BoundedRows> {
	let mut rows = Vec::new();
	let mut io = HotShardHistoryScanIo::default();
	let mut last_key = None;
	loop {
		let chunk = db
			.txn(transaction_name, {
				let begin = begin.clone();
				let end = end.clone();
				let last_key = last_key.clone();
				move |tx| {
					let begin = begin.clone();
					let end = end.clone();
					let last_key = last_key.clone();
					async move {
						let started = Instant::now();
						let range_begin = last_key.map_or_else(
							|| KeySelector::first_greater_or_equal(begin),
							KeySelector::first_greater_than,
						);
						let informal = tx.informal();
						let mut stream = informal.get_ranges_keyvalues(
							RangeOption {
								begin: range_begin,
								end: KeySelector::first_greater_or_equal(end),
								mode: StreamingMode::Iterator,
								..RangeOption::default()
							},
							Snapshot,
						);
						let mut rows = Vec::new();
						let mut bytes = 0usize;
						let mut exhausted = false;
						loop {
							if !rows.is_empty()
								&& (bytes >= options.transaction_max_bytes
									|| started.elapsed() >= options.transaction_max_duration)
							{
								break;
							}
							let Some(entry) = stream.try_next().await? else {
								exhausted = true;
								break;
							};
							let row_bytes = entry.key().len().saturating_add(entry.value().len());
							if !rows.is_empty()
								&& bytes.saturating_add(row_bytes) > options.transaction_max_bytes
							{
								break;
							}
							bytes = bytes.saturating_add(row_bytes);
							rows.push((entry.key().to_vec(), entry.value().to_vec()));
						}
						let last_key = rows.last().map(|(key, _)| key.clone());
						Ok(BoundedRowsChunk {
							rows,
							last_key,
							exhausted,
							bytes: u64::try_from(bytes).unwrap_or(u64::MAX),
						})
					}
				}
			})
			.await?;
		ensure!(
			chunk.exhausted || chunk.last_key.is_some(),
			"bounded corruption scan made no progress"
		);
		io.transactions += 1;
		io.rows = io.rows.saturating_add(chunk.rows.len());
		io.bytes = io.bytes.saturating_add(chunk.bytes);
		rows.extend(chunk.rows);
		if chunk.exhausted {
			break;
		}
		last_key = chunk.last_key;
	}
	Ok(BoundedRows { rows, io })
}
