//! Backfills compaction manager workflows for every existing database.
//!
//! Compaction is otherwise lazy: a manager workflow is only dispatched when an actor writes to its
//! database, so a database that is never written to again after compaction is enabled never
//! compacts. This scans the database pointer partition in chunks and dispatches a manager for every
//! live database branch it finds.
//!
//! Current pointers are the complete enumeration of live branches. Every path that creates a branch
//! writes its `DBPTR` row in the same transaction (root create, fork, rollback and restore), and every
//! pointer swap freezes the branch it supersedes, so a live branch is always some bucket branch's
//! current pointer. Databases inherited through a bucket fork have no pointer row of their own until
//! their first write, but they resolve up the bucket parent chain to a branch that does have one, and
//! that first write dispatches a manager the lazy way.

use std::time::Instant;

use futures_util::{FutureExt, TryStreamExt};
use gas::prelude::*;
use universaldb::{
	RangeOption,
	options::StreamingMode,
	utils::{IsolationLevel::Snapshot, end_of_key_range},
};

use crate::CMP_BULK_ACTIVITY_EARLY_TIMEOUT;
use crate::compaction::shared::tx_get_value;
use crate::conveyer::{
	keys,
	types::{
		BranchState, DatabaseBranchId, decode_database_branch_record, decode_database_pointer,
		decode_db_head,
	},
};
use crate::workflows::compaction::{
	DATABASE_BRANCH_ID_TAG, DbManagerInput, DeltasAvailable, database_branch_tag_value,
};

pub const BACKFILL_NAME: &str = "depot_compaction_backfill";

/// Max databases dispatched per chunk. Each database costs two point reads inside the scan
/// transaction plus a manager workflow (which itself dispatches three companion workflows), so
/// chunks stay small to bound both the transaction and the dispatch burst.
const MAX_DATABASES_PER_CHUNK: usize = 32;

/// Delay between chunks so backfilling a large cluster spreads the manager refresh load over time
/// instead of waking every database at once.
const CHUNK_DELAY_MS: i64 = 1_000;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Input {}

#[workflow(CompactionBackfillWorkflow)]
pub async fn depot_compaction_backfill(ctx: &mut WorkflowCtx, _input: &Input) -> Result<()> {
	// The loop state is the scan cursor alone, so completed chunks move to forgotten history instead
	// of growing live workflow history with one entry per database.
	ctx.loope(Vec::<u8>::new(), |ctx, cursor| {
		async move {
			let chunk = ctx
				.activity(ScanChunkInput {
					cursor: cursor.clone(),
				})
				.await?;

			for database in &chunk.databases {
				start_manager(ctx, database).await?;
			}

			let Some(new_cursor) = chunk.new_cursor else {
				return Ok(Loop::Break(()));
			};

			*cursor = new_cursor;

			ctx.sleep(CHUNK_DELAY_MS).await?;

			Ok(Loop::Continue)
		}
		.boxed()
	})
	.await?;

	ctx.activity(MarkCompleteInput {
		name: BACKFILL_NAME.to_string(),
	})
	.await?;

	Ok(())
}

/// Dispatches the manager for a database and wakes it once.
///
/// The manager blocks on its signal listener until it receives its first signal, so a manager that
/// is only dispatched never plans any work. The wake makes it refresh from FDB (which is where it
/// reads the real compaction state from) and arm its cold and reclaim timers, after which it
/// schedules itself.
async fn start_manager(ctx: &mut WorkflowCtx, database: &BackfillDatabase) -> Result<()> {
	let tag_value = database_branch_tag_value(database.database_branch_id);
	let workflow_id = ctx
		.workflow(DbManagerInput::new(database.database_branch_id, None))
		.tag(DATABASE_BRANCH_ID_TAG, &tag_value)
		.unique()
		.dispatch()
		.await?;

	ctx.signal(DeltasAvailable {
		database_branch_id: database.database_branch_id,
		observed_head_txid: database.head_txid,
		dirty_updated_at_ms: database.observed_at_ms,
	})
	.to_workflow_id(workflow_id)
	.send()
	.await?;

	Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct BackfillDatabase {
	database_branch_id: DatabaseBranchId,
	head_txid: u64,
	observed_at_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Hash)]
struct ScanChunkInput {
	cursor: Vec<u8>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ScanChunkOutput {
	databases: Vec<BackfillDatabase>,
	/// Cursor for the next chunk, or `None` once the scan reached the end of the partition.
	new_cursor: Option<Vec<u8>>,
}

#[activity(ScanChunk)]
async fn scan_chunk(ctx: &ActivityCtx, input: &ScanChunkInput) -> Result<ScanChunkOutput> {
	let now_ms = ctx.ts();
	let cursor = input.cursor.clone();

	ctx.udb()?
		.txn("depot_compaction_backfill_scan_chunk", move |tx| {
			let cursor = cursor.clone();
			async move {
				let start = Instant::now();
				let prefix = keys::database_pointer_cur_prefix();
				let prefix_end = prefix_successor(&prefix);
				let range_start = if cursor.is_empty() {
					prefix.clone()
				} else {
					cursor.clone()
				};

				let mut databases = Vec::new();
				let mut new_cursor = None;
				let informal = tx.informal();
				let mut stream = informal.get_ranges_keyvalues(
					RangeOption {
						mode: StreamingMode::WantAll,
						..(range_start.as_slice(), prefix_end.as_slice()).into()
					},
					Snapshot,
				);

				loop {
					if start.elapsed() > CMP_BULK_ACTIVITY_EARLY_TIMEOUT {
						tracing::warn!("timed out scanning database pointers");
						break;
					}

					let Some(entry) = stream.try_next().await? else {
						new_cursor = None;
						break;
					};

					new_cursor = Some(end_of_key_range(entry.key()));

					// The partition also holds pointer history keys, which do not decode as a
					// current pointer.
					if keys::decode_database_pointer_cur_key(entry.key()).is_err() {
						continue;
					}

					let pointer = decode_database_pointer(entry.value())
						.context("decode sqlite database pointer for compaction backfill")?;
					let database_branch_id = pointer.current_branch;

					let Some(database) = read_database(&tx, database_branch_id, now_ms).await?
					else {
						continue;
					};
					databases.push(database);

					if databases.len() >= MAX_DATABASES_PER_CHUNK {
						break;
					}
				}

				Ok(ScanChunkOutput {
					databases,
					new_cursor,
				})
			}
		})
		.custom_instrument(tracing::info_span!("compaction_backfill_scan_chunk_tx"))
		.await
}

/// Smallest key strictly greater than every key carrying `prefix`, i.e. the exclusive end bound that
/// covers the whole prefix range.
///
/// A subspace range (`prefix + 0x00`, `prefix + 0xff`) is not usable here. The byte after this prefix
/// is the first raw byte of a bucket branch uuid, so every bucket branch whose uuid starts with `0xff`
/// (and every database under it) would sort at or past that end bound and never be scanned.
fn prefix_successor(prefix: &[u8]) -> Vec<u8> {
	let mut end = prefix.to_vec();
	while let Some(&last) = end.last() {
		if last == 0xff {
			end.pop();
		} else {
			*end.last_mut().expect("end is non-empty") += 1;
			break;
		}
	}

	end
}

/// Reads the state a database branch needs to be worth backfilling. Branches that are not live, or
/// that were never committed to, have nothing to compact and are skipped: a write to them dispatches
/// a manager the lazy way.
async fn read_database(
	tx: &universaldb::Transaction,
	database_branch_id: DatabaseBranchId,
	now_ms: i64,
) -> Result<Option<BackfillDatabase>> {
	let Some(record_bytes) =
		tx_get_value(tx, &keys::branches_list_key(database_branch_id), Snapshot).await?
	else {
		return Ok(None);
	};
	let record = decode_database_branch_record(&record_bytes)
		.context("decode sqlite database branch record for compaction backfill")?;
	if record.state != BranchState::Live {
		return Ok(None);
	}

	let Some(head_bytes) = tx_get_value(
		tx,
		&keys::branch_meta_head_key(database_branch_id),
		Snapshot,
	)
	.await?
	else {
		return Ok(None);
	};
	let head = decode_db_head(&head_bytes).context("decode sqlite head for compaction backfill")?;

	Ok(Some(BackfillDatabase {
		database_branch_id,
		head_txid: head.head_txid,
		observed_at_ms: now_ms,
	}))
}

#[derive(Debug, Clone, Serialize, Deserialize, Hash)]
struct MarkCompleteInput {
	name: String,
}

#[activity(MarkComplete)]
async fn mark_complete(ctx: &ActivityCtx, input: &MarkCompleteInput) -> Result<()> {
	ctx.udb()?
		.txn("depot_compaction_backfill_mark_complete", |tx| {
			let name = input.name.clone();
			async move {
				let tx = tx.with_subspace(rivet_types::keys::backfill::subspace());
				tx.write(
					&rivet_types::keys::backfill::CompleteKey::new(&name),
					util::timestamp::now(),
				)?;
				Ok(())
			}
		})
		.custom_instrument(tracing::info_span!("mark_backfill_complete_tx"))
		.await?;

	tracing::debug!(name = %input.name, "marked backfill as complete");

	Ok(())
}
