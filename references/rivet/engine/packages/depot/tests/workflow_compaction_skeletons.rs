use std::{cell::RefCell, future::Future, rc::Rc, sync::Arc, time::Duration};

use anyhow::{Context, Result, bail};
use depot::{
	conveyer::{Db, branch, history_pin},
	debug,
	error::SqliteStorageError,
	keys::{
		PAGE_SIZE, branch_commit_key, branch_compaction_cold_shard_key,
		branch_compaction_cold_shard_prefix, branch_compaction_fold_key,
		branch_compaction_root_key, branch_compaction_stage_hot_ref_key,
		branch_compaction_stage_hot_shard_key, branch_compaction_stage_hot_shard_prefix,
		branch_delta_chunk_key, branch_delta_txid_range, branch_meta_head_at_fork_key,
		branch_meta_head_key, branch_pidx_key, branch_pitr_interval_key, branch_shard_chunk_key,
		branch_shard_key, branch_shard_prefix, branch_shard_version_range, branch_vtx_key,
		branches_list_key, bucket_catalog_by_db_key, bucket_child_key, bucket_fork_pin_key,
		db_pin_key, sqlite_cmp_dirty_key,
	},
	ltx::{LtxHeader, decode_ltx_v3, encode_ltx_v3},
	policy::{set_bucket_pitr_policy, set_database_pitr_policy_override},
	types::{
		BranchState, BucketBranchId, BucketCatalogDbFact, BucketForkFact, BucketId, ColdShardRef,
		CommitRow, CompactionRoot, DBHead, DatabaseBranchId, DatabaseBranchRecord,
		DbHistoryPinKind, DirtyPage, FetchedPage, FoldIndexEntry, PitrIntervalCoverage, PitrPolicy,
		ResolvedVersionstamp, RestorePointId, SnapshotKind, SnapshotSelector, SqliteCmpDirty,
		StagedHotShardRef, decode_commit_row, decode_compaction_root, decode_db_head,
		decode_db_history_pin, decode_pitr_interval_coverage, encode_bucket_catalog_db_fact,
		encode_bucket_fork_fact, encode_cold_shard_ref, encode_commit_row, encode_compaction_root,
		encode_database_branch_record, encode_db_head, encode_fold_index_entry,
		encode_pitr_interval_coverage, encode_sqlite_cmp_dirty, encode_staged_hot_shard_ref,
	},
	workflows::compaction::{
		BranchStopState, CompactionJobKind, CompactionJobStatus, CompanionWorkflowState,
		DATABASE_BRANCH_ID_TAG, DbHotCompactorSignal, DbHotCompactorWorkflow, DbManagerInput,
		DbManagerSignal, DbManagerState, DbManagerWorkflow, DbReclaimerWorkflow, DeltasAvailable,
		DestroyDatabaseBranch, ForceCompaction, ForceCompactionResult, ForceCompactionWork,
		HotJobFinished, HotShardOutputRef, RunHotJob, RunReclaimJob, TxidRange,
		database_branch_tag_value, test_hooks,
	},
};
use futures_util::TryStreamExt;
use gas::db::debug::{DatabaseDebug, WorkflowState};
use gas::prelude::{Id, Registry, SignalTrait, TestCtx, WorkflowTrait};
use rivet_pools::NodeId;
use rivet_test_deps::TestDeps;
use sha2::{Digest, Sha256};
use universaldb::utils::IsolationLevel::Snapshot;
use uuid::Uuid;

const TEST_DATABASE: &str = "workflow-compaction-test";
const FIVE_MINUTES_MS: i64 = 5 * 60 * 1000;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum WorkflowTierMode {
	Disabled,
}

impl WorkflowTierMode {
	fn label(self) -> &'static str {
		match self {
			WorkflowTierMode::Disabled => "cold_disabled",
		}
	}
}

async fn workflow_test_matrix<F, Fut>(
	_prefix: &str,
	registry: fn() -> Registry,
	body: F,
) -> Result<()>
where
	F: FnMut(WorkflowTierMode, TestCtx) -> Fut,
	Fut: Future<Output = Result<()>>,
{
	workflow_test_matrix_with_pitr(_prefix, registry, false, body).await
}

/// Runs the matrix with cluster PITR enabled.
///
/// PITR is opt-in cluster-wide, and a cluster with it off ignores stored bucket and database policy
/// overrides entirely (`read_effective_pitr_policy_for_branch` short-circuits before reading them).
/// A test that only calls `set_bucket_pitr_policy` therefore gets no interval coverage at all, so
/// tests asserting on `PITR_INTERVAL` rows have to turn the cluster switch on too.
///
/// This is not the default because every retained coverage position makes hot staging fold a
/// complete image of each shard it covers, which would change fold behaviour for every test in the
/// matrix rather than the handful that are about PITR.
async fn workflow_test_matrix_with_pitr<F, Fut>(
	_prefix: &str,
	registry: fn() -> Registry,
	enable_pitr: bool,
	mut body: F,
) -> Result<()>
where
	F: FnMut(WorkflowTierMode, TestCtx) -> Fut,
	Fut: Future<Output = Result<()>>,
{
	for tier in [WorkflowTierMode::Disabled] {
		let test_ctx = if enable_pitr {
			test_ctx_with_pitr_enabled(registry()).await?
		} else {
			TestCtx::new(registry()).await?
		};

		body(tier, test_ctx)
			.await
			.with_context(|| format!("[{}] body failed", tier.label()))?;
	}

	Ok(())
}

macro_rules! workflow_matrix {
	($prefix:expr, $registry:ident, |$tier:ident, $test_ctx:ident| $body:block) => {
		workflow_test_matrix($prefix, $registry, |$tier, mut $test_ctx| async move $body)
		.await
	};
}

macro_rules! workflow_matrix_with_pitr {
	($prefix:expr, $registry:ident, |$tier:ident, $test_ctx:ident| $body:block) => {
		workflow_test_matrix_with_pitr($prefix, $registry, true, |$tier, mut $test_ctx| async move $body)
		.await
	};
}

fn database_branch_id(value: u128) -> DatabaseBranchId {
	DatabaseBranchId::from_uuid(Uuid::from_u128(value))
}

fn test_bucket() -> Id {
	Id::v1(Uuid::from_u128(0x5678), 1)
}

fn make_test_db(test_ctx: &TestCtx) -> Result<Db> {
	make_test_db_for(test_ctx, TEST_DATABASE)
}

fn make_test_db_for(test_ctx: &TestCtx, database_id: impl Into<String>) -> Result<Db> {
	let udb_pool = test_ctx.pools().udb()?;
	let udb = Arc::new((*udb_pool).clone());
	Ok(Db::new(
		udb,
		test_bucket(),
		database_id.into(),
		NodeId::new(),
	))
}

/// Cluster PITR settings for the tests that assert on interval coverage. The interval is short so a
/// handful of seeded commits land in distinct buckets, and the retention is long so nothing expires
/// mid-test unless the test moves the clock itself.
fn test_pitr_config() -> rivet_config::config::SqlitePitr {
	rivet_config::config::SqlitePitr {
		interval_ms: Some(FIVE_MINUTES_MS),
		retention_ms: Some(7 * 24 * 60 * 60 * 1000),
	}
}

async fn test_ctx_with_pitr_enabled(registry: Registry) -> Result<TestCtx> {
	let mut test_deps = TestDeps::new().await?;
	let mut config_root = (**test_deps.config()).clone();
	config_root.sqlite = Some(rivet_config::config::Sqlite {
		pitr: Some(test_pitr_config()),
		..Default::default()
	});
	test_deps.config = rivet_config::Config::from_root(config_root);
	TestCtx::new_with_deps(registry, test_deps).await
}

fn page(fill: u8) -> Vec<u8> {
	vec![fill; PAGE_SIZE as usize]
}

fn current_time_ms() -> Result<i64> {
	let millis = std::time::SystemTime::now()
		.duration_since(std::time::UNIX_EPOCH)?
		.as_millis();
	Ok(i64::try_from(millis)?)
}

fn assert_storage_error(err: &anyhow::Error, expected: SqliteStorageError) {
	assert!(
		err.chain().any(|cause| {
			cause
				.downcast_ref::<SqliteStorageError>()
				.is_some_and(|err| err == &expected)
		}),
		"expected {expected:?}, got {err:?}",
	);
}

fn dirty_page(pgno: u32, fill: u8) -> DirtyPage {
	DirtyPage {
		pgno,
		bytes: page(fill),
	}
}

fn build_registry() -> Registry {
	let mut registry = Registry::new();
	registry.register_workflow::<DbManagerWorkflow>().unwrap();
	registry
		.register_workflow::<DbHotCompactorWorkflow>()
		.unwrap();
	registry.register_workflow::<DbReclaimerWorkflow>().unwrap();
	registry
}

fn build_registry_without_hot_compactor() -> Registry {
	let mut registry = Registry::new();
	registry.register_workflow::<DbManagerWorkflow>().unwrap();
	registry.register_workflow::<DbReclaimerWorkflow>().unwrap();
	registry
}

async fn wait_until<T, F, Fut>(description: impl Into<String>, mut check: F) -> Result<T>
where
	F: FnMut() -> Fut,
	Fut: Future<Output = Result<Option<T>>>,
{
	let description = description.into();
	let started_at = tokio::time::Instant::now();

	loop {
		if let Some(value) = check().await? {
			return Ok(value);
		}

		if started_at.elapsed() > Duration::from_secs(5) {
			bail!("timed out waiting for {description}");
		}

		// Signal debug rows and UDB test-observation rows do not expose a change notification API here.
		tokio::time::sleep(Duration::from_millis(25)).await;
	}
}

async fn wait_for_workflow<W: WorkflowTrait>(
	test_ctx: &TestCtx,
	database_branch_id: DatabaseBranchId,
) -> Result<Id> {
	let tag_value = database_branch_tag_value(database_branch_id);
	wait_until(format!("workflow {}", W::NAME), || async {
		test_ctx
			.find_workflow::<W>((DATABASE_BRANCH_ID_TAG, &tag_value))
			.await
	})
	.await
}

async fn wait_for_signal_ack(test_ctx: &TestCtx, signal_id: Id) -> Result<()> {
	wait_until("signal ack", || async {
		let signal = DatabaseDebug::get_signals(test_ctx.debug_db(), vec![signal_id])
			.await?
			.into_iter()
			.next();

		if let Some(signal) = signal {
			if signal.state == gas::db::debug::SignalState::Acked {
				return Ok(Some(()));
			}
		}

		Ok(None)
	})
	.await
}

async fn wait_for_run_hot_job(test_ctx: &TestCtx, hot_workflow_id: Id) -> Result<RunHotJob> {
	wait_until("RunHotJob signal", || async {
		let signals = DatabaseDebug::find_signals(
			test_ctx.debug_db(),
			&[],
			Some(hot_workflow_id),
			Some(<RunHotJob as SignalTrait>::NAME),
			None,
		)
		.await?;
		if let Some(signal) = signals.into_iter().next() {
			return Ok(Some(serde_json::from_value(signal.body)?));
		}

		Ok(None)
	})
	.await
}

async fn wait_for_run_reclaim_job(
	test_ctx: &TestCtx,
	reclaimer_workflow_id: Id,
) -> Result<RunReclaimJob> {
	wait_until("RunReclaimJob signal", || async {
		let signals = DatabaseDebug::find_signals(
			test_ctx.debug_db(),
			&[],
			Some(reclaimer_workflow_id),
			Some(<RunReclaimJob as SignalTrait>::NAME),
			None,
		)
		.await?;
		if let Some(signal) = signals.into_iter().next() {
			return Ok(Some(serde_json::from_value(signal.body)?));
		}

		Ok(None)
	})
	.await
}

async fn single_destroy_signal_for_workflow(
	test_ctx: &TestCtx,
	workflow_id: Id,
) -> Result<DestroyDatabaseBranch> {
	let signals = DatabaseDebug::find_signals(
		test_ctx.debug_db(),
		&[],
		Some(workflow_id),
		Some(<DestroyDatabaseBranch as SignalTrait>::NAME),
		None,
	)
	.await?;
	assert_eq!(signals.len(), 1);

	Ok(serde_json::from_value(
		signals.into_iter().next().unwrap().body,
	)?)
}

async fn wait_for_hot_job_finished_signal(
	test_ctx: &TestCtx,
	manager_workflow_id: Id,
	job_id: Id,
) -> Result<HotJobFinished> {
	wait_until("HotJobFinished signal", || async {
		let signals = DatabaseDebug::find_signals(
			test_ctx.debug_db(),
			&[],
			Some(manager_workflow_id),
			Some(<HotJobFinished as SignalTrait>::NAME),
			None,
		)
		.await?;
		for signal in signals {
			let signal = serde_json::from_value::<HotJobFinished>(signal.body)?;
			if signal.job_id == job_id {
				return Ok(Some(signal));
			}
		}

		Ok(None)
	})
	.await
}

/// Wakes a manager the way a real commit does.
///
/// `seed_manager_branch` writes the branch's FDB state directly, so it never runs the commit path and
/// never publishes the `DeltasAvailable` signal that path sends. The manager blocks on its signal
/// listen and, with `disable_planning_timers` set, has no idle poll to fall back on, so a test that
/// seeds state and then waits for a job waits forever. Send this after dispatching the manager.
async fn wake_manager(
	test_ctx: &TestCtx,
	manager_workflow_id: Id,
	database_branch_id: DatabaseBranchId,
) -> Result<()> {
	let observed_head_txid = read_value(test_ctx, branch_meta_head_key(database_branch_id))
		.await?
		.as_deref()
		.map(decode_db_head)
		.transpose()?
		.map(|head| head.head_txid)
		.unwrap_or_default();
	test_ctx
		.signal(DeltasAvailable {
			database_branch_id,
			observed_head_txid,
			dirty_updated_at_ms: 1_714_000_000_000,
		})
		.to_workflow_id(manager_workflow_id)
		.send()
		.await?
		.expect("signal should target manager workflow");

	Ok(())
}

async fn wait_for_manager_cursor(
	test_ctx: &TestCtx,
	workflow_id: Id,
	observed_head_txid: u64,
) -> Result<DbManagerState> {
	wait_until("manager dirty cursor", || async {
		let history = DatabaseDebug::get_workflow_history(test_ctx.debug_db(), workflow_id, true)
			.await?
			.ok_or_else(|| anyhow::anyhow!("manager workflow history not found"))?;

		for event in history.events.into_iter().rev() {
			if let gas::db::debug::EventData::Loop(loop_event) = event.data {
				// The manager runs nested resumable loops (hot install, cold publish) whose loop state
				// is not a `DbManagerState` and can be a bare `null`. Only the outer manager loop
				// deserializes as one, so skip the rest rather than failing the wait on them.
				let Ok(state) = serde_json::from_value::<DbManagerState>(loop_event.state) else {
					continue;
				};
				if state
					.last_dirty_cursor
					.as_ref()
					.is_some_and(|cursor| cursor.observed_head_txid == observed_head_txid)
				{
					return Ok(Some(state));
				}
			}
		}

		Ok(None)
	})
	.await
}

async fn wait_for_manager_state(
	test_ctx: &TestCtx,
	workflow_id: Id,
	predicate: impl FnMut(&DbManagerState) -> bool,
) -> Result<DbManagerState> {
	let predicate = Rc::new(RefCell::new(predicate));
	wait_until("manager state", || {
		let predicate = predicate.clone();
		async move {
			let history =
				DatabaseDebug::get_workflow_history(test_ctx.debug_db(), workflow_id, true)
					.await?
					.ok_or_else(|| anyhow::anyhow!("manager workflow history not found"))?;

			for event in history.events.into_iter().rev() {
				if let gas::db::debug::EventData::Loop(loop_event) = event.data {
					// The manager runs nested resumable loops (hot install, cold publish) whose loop
					// state is not a `DbManagerState`. Only the outer manager loop deserializes as one,
					// so skip loop states that do not.
					let Ok(state) = serde_json::from_value::<DbManagerState>(loop_event.state)
					else {
						continue;
					};
					if (predicate.borrow_mut())(&state) {
						return Ok(Some(state));
					}
				}
			}

			Ok(None)
		}
	})
	.await
}

async fn latest_manager_state(test_ctx: &TestCtx, workflow_id: Id) -> Result<DbManagerState> {
	let history = DatabaseDebug::get_workflow_history(test_ctx.debug_db(), workflow_id, true)
		.await?
		.ok_or_else(|| anyhow::anyhow!("manager workflow history not found"))?;

	for event in history.events.into_iter().rev() {
		if let gas::db::debug::EventData::Loop(loop_event) = event.data {
			// Skip nested resumable loops (hot install, cold publish) whose state is not a
			// `DbManagerState`; only the outer manager loop deserializes as one.
			if let Ok(state) = serde_json::from_value::<DbManagerState>(loop_event.state) {
				return Ok(state);
			}
		}
	}

	bail!("manager workflow has no loop state")
}

/// Waits until the manager's newest loop state satisfies `predicate`.
///
/// `wait_for_manager_state` scans the whole history and matches any state that ever satisfied the
/// predicate. That is right for a condition that latches once and stays true (companions have been
/// assigned) and wrong for one the manager also satisfied before the awaited work began.
///
/// "No job is active in this lane" is the second kind: it is true of every state recorded before a
/// job was ever assigned, so a backwards scan finds one of those and returns while the job is still
/// running. Every absence predicate belongs here.
async fn wait_for_latest_manager_state(
	test_ctx: &TestCtx,
	workflow_id: Id,
	predicate: impl FnMut(&DbManagerState) -> bool,
) -> Result<DbManagerState> {
	let predicate = Rc::new(RefCell::new(predicate));
	wait_until("latest manager state", || {
		let predicate = predicate.clone();
		async move {
			let state = latest_manager_state(test_ctx, workflow_id).await?;

			Ok((predicate.borrow_mut())(&state).then_some(state))
		}
	})
	.await
}

fn manager_has_distinct_companions(state: &DbManagerState) -> bool {
	state.companion_workflow_ids.hot_compactor_workflow_id
		!= state.companion_workflow_ids.reclaimer_workflow_id
}

async fn latest_companion_state(
	test_ctx: &TestCtx,
	workflow_id: Id,
) -> Result<CompanionWorkflowState> {
	let history = DatabaseDebug::get_workflow_history(test_ctx.debug_db(), workflow_id, true)
		.await?
		.ok_or_else(|| anyhow::anyhow!("companion workflow history not found"))?;

	for event in history.events.into_iter().rev() {
		if let gas::db::debug::EventData::Loop(loop_event) = event.data {
			// A companion runs a nested drain loop whose state is a `HotDrainState` (or the cold and
			// reclaim equivalents), and that is the loop event most likely to be newest. Only the
			// outer signal loop deserializes as a `CompanionWorkflowState`, so walk past the rest.
			if let Ok(state) = serde_json::from_value::<CompanionWorkflowState>(loop_event.state) {
				return Ok(state);
			}
		}
	}

	bail!("companion workflow has no loop state")
}

async fn force_compaction_and_wait_idle(
	test_ctx: &TestCtx,
	manager_workflow_id: Id,
	database_branch_id: DatabaseBranchId,
	request_id: Id,
	requested_work: ForceCompactionWork,
) -> Result<ForceCompactionResult> {
	wait_for_manager_state(
		test_ctx,
		manager_workflow_id,
		manager_has_distinct_companions,
	)
	.await?;

	let signal_id = test_ctx
		.signal(ForceCompaction {
			database_branch_id,
			request_id,
			requested_work,
		})
		.to_workflow_id(manager_workflow_id)
		.send()
		.await?
		.expect("signal should target manager workflow");
	wait_for_signal_ack(test_ctx, signal_id).await?;

	let manager_state = wait_for_manager_state(test_ctx, manager_workflow_id, |state| {
		state
			.force_compactions
			.recent_results
			.iter()
			.any(|result| result.request_id == request_id)
	})
	.await?;

	manager_state
		.force_compactions
		.recent_results
		.into_iter()
		.find(|result| result.request_id == request_id)
		.ok_or_else(|| anyhow::anyhow!("force compaction result should be recorded"))
}

async fn wait_for_workflow_state(
	test_ctx: &TestCtx,
	workflow_id: Id,
	expected_state: WorkflowState,
) -> Result<()> {
	wait_until(format!("workflow state {expected_state:?}"), || async {
		let workflow = DatabaseDebug::get_workflows(test_ctx.debug_db(), vec![workflow_id])
			.await?
			.into_iter()
			.next()
			.ok_or_else(|| anyhow::anyhow!("workflow not found"))?;
		if workflow.state == expected_state {
			return Ok(Some(()));
		}

		Ok(None)
	})
	.await
}

async fn wait_for_dirty_marker_cleared(
	test_ctx: &TestCtx,
	database_branch_id: DatabaseBranchId,
) -> Result<()> {
	wait_until("dirty marker clear", || async {
		let dirty = read_value(test_ctx, sqlite_cmp_dirty_key(database_branch_id)).await?;
		if dirty.is_none() {
			return Ok(Some(()));
		}

		Ok(None)
	})
	.await
}

async fn wait_for_staged_hot_rows(
	test_ctx: &TestCtx,
	database_branch_id: DatabaseBranchId,
	job_id: Id,
) -> Result<Vec<(Vec<u8>, Vec<u8>)>> {
	let prefix = branch_compaction_stage_hot_shard_prefix(database_branch_id, job_id);

	wait_until("staged hot shard rows", || async {
		let rows = read_prefix_values(test_ctx, prefix.clone()).await?;
		if !rows.is_empty() {
			return Ok(Some(rows));
		}

		Ok(None)
	})
	.await
}

/// PIDX values are a big-endian owner txid, written by the commit path and by the fixtures.
fn decode_pidx_owner_txid(value: &[u8]) -> Result<u64> {
	let bytes: [u8; 8] = value
		.try_into()
		.map_err(|_| anyhow::anyhow!("pidx value must be 8 bytes, got {}", value.len()))?;
	Ok(u64::from_be_bytes(bytes))
}

async fn wait_for_hot_install(
	test_ctx: &TestCtx,
	database_branch_id: DatabaseBranchId,
	as_of_txid: u64,
) -> Result<CompactionRoot> {
	let last_observed = parking_lot::Mutex::new(None::<String>);
	wait_until("hot install", || async {
		let root = read_value(test_ctx, branch_compaction_root_key(database_branch_id))
			.await?
			.as_deref()
			.map(decode_compaction_root)
			.transpose()?;
		let pidx = read_value(test_ctx, branch_pidx_key(database_branch_id, 1)).await?;
		// The install writes shards as chunk rows under `branch_shard_chunk_key`, not the bare legacy
		// `branch_shard_key`, so check the first chunk row.
		let shard = read_value(
			test_ctx,
			branch_shard_chunk_key(database_branch_id, 0, as_of_txid, 0),
		)
		.await?;

		// Install clears a PIDX row with COMPARE_AND_CLEAR only when the staged shard supersedes
		// it. An owner above the drain head is a page whose newest version still lives in a delta
		// outside the compacted range, so it is meant to survive. Where the drain head equals the
		// branch head the owner is at or below it and must be cleared, which keeps this strict.
		let pidx_superseded = match &pidx {
			Some(value) => decode_pidx_owner_txid(value)? > as_of_txid,
			None => true,
		};

		if let Some(root) = &root {
			if root.manifest_generation == 1
				&& root.hot_watermark_txid == as_of_txid
				&& pidx_superseded
				&& shard.is_some()
			{
				return Ok(Some(root.clone()));
			}
		}

		// Four conditions gate this wait, so a bare timeout says nothing about which one failed.
		*last_observed.lock() = Some(format!(
			"manifest_generation={:?} hot_watermark_txid={:?} pidx_owner={:?} shard_present={}",
			root.as_ref().map(|root| root.manifest_generation),
			root.as_ref().map(|root| root.hot_watermark_txid),
			pidx.as_deref().map(decode_pidx_owner_txid).transpose()?,
			shard.is_some(),
		));

		Ok(None)
	})
	.await
	.with_context(|| {
		format!(
			"last observed state (want manifest_generation=1 hot_watermark_txid={as_of_txid} \
			 pidx_owner cleared or above {as_of_txid} shard_present=true): {}",
			last_observed
				.lock()
				.take()
				.unwrap_or_else(|| "none".to_string()),
		)
	})
}

/// Asserts a delta whose coverage fold has no shard image is retained.
///
/// It is the only carrier of a read pinned there, so the materialization gate keeps it.
async fn assert_delta_retained(
	test_ctx: &TestCtx,
	tier: WorkflowTierMode,
	database_branch_id: DatabaseBranchId,
	txid: u64,
) -> Result<()> {
	let exists = delta_exists(test_ctx, database_branch_id, txid).await?;
	match tier {
		WorkflowTierMode::Disabled => assert!(exists, "delta {txid} must survive"),
	}

	Ok(())
}

/// Asserts that a commit and its delta reclaim together, or not at all.
///
/// A commit row may only go once every segment of its delta goes with it: reclaim enumerates history
/// by scanning `COMMITS`, so a commit deleted ahead of a surviving delta would leave that delta
/// unreachable to every later pass. With cold off, the materialization gate retains the delta (no
/// shard image carries the pinned read), so the commit is retained too. With cold caught up past the
/// delta, the gate short-circuits and both go.
async fn assert_commit_and_delta_share_fate(
	test_ctx: &TestCtx,
	tier: WorkflowTierMode,
	database_branch_id: DatabaseBranchId,
	txid: u64,
) -> Result<()> {
	match tier {
		WorkflowTierMode::Disabled => {
			assert!(
				delta_exists(test_ctx, database_branch_id, txid).await?,
				"delta {txid} must survive"
			);
			assert!(
				read_value(test_ctx, branch_commit_key(database_branch_id, txid))
					.await?
					.is_some(),
				"commit {txid} must be retained while its delta is",
			);
		}
	}

	Ok(())
}

async fn wait_for_reclaim_delete(
	test_ctx: &TestCtx,
	database_branch_id: DatabaseBranchId,
	txid: u64,
) -> Result<()> {
	wait_until("reclaim delete", || async {
		let delta = read_value(
			test_ctx,
			branch_delta_chunk_key(database_branch_id, txid, 0),
		)
		.await?;
		let commit = read_value(test_ctx, branch_commit_key(database_branch_id, txid)).await?;
		if delta.is_none() && commit.is_none() {
			return Ok(Some(()));
		}

		Ok(None)
	})
	.await
}

async fn wait_for_stage_row_cleared(
	test_ctx: &TestCtx,
	database_branch_id: DatabaseBranchId,
	job_id: Id,
) -> Result<()> {
	wait_until("staged hot shard cleanup", || async {
		let rows = read_prefix_values(
			test_ctx,
			branch_compaction_stage_hot_shard_prefix(database_branch_id, job_id),
		)
		.await?;
		if rows.is_empty() {
			return Ok(Some(()));
		}

		Ok(None)
	})
	.await
}

fn sha256(bytes: &[u8]) -> [u8; 32] {
	let digest = Sha256::digest(bytes);
	let mut hash = [0_u8; 32];
	hash.copy_from_slice(&digest);
	hash
}

/// Reads one `SHARD` version the way the storage layer stores it: as ordered chunk rows under the
/// version key, or a single pre-chunking legacy row at the bare version key. A point read of
/// `branch_shard_key` only ever sees the legacy form, so it reports "no shard" for every version a
/// real compaction pass wrote.
async fn read_shard_version(
	test_ctx: &TestCtx,
	database_branch_id: DatabaseBranchId,
	shard_id: u32,
	as_of_txid: u64,
) -> Result<Option<Vec<u8>>> {
	let db = test_ctx.pools().udb()?;
	db.txn(
		"test_depotworkflow_compaction_skeletons",
		move |tx| async move {
			let (begin, end) = branch_shard_version_range(database_branch_id, shard_id, as_of_txid);
			let informal = tx.informal();
			let mut stream = informal.get_ranges_keyvalues(
				universaldb::RangeOption {
					mode: universaldb::options::StreamingMode::WantAll,
					..(begin.as_slice(), end.as_slice()).into()
				},
				Snapshot,
			);

			let mut blob = Vec::new();
			let mut found = false;
			while let Some(entry) = futures_util::TryStreamExt::try_next(&mut stream).await? {
				found = true;
				blob.extend_from_slice(entry.value());
			}

			Ok(found.then_some(blob))
		},
	)
	.await
}

/// Clears every row of one `SHARD` version, simulating the eviction lane demoting it to cold-only.
/// Clearing the bare version key alone leaves the chunk rows a real pass wrote, so the version stays
/// live and the simulated demotion never happens.
async fn clear_shard_version(
	test_ctx: &TestCtx,
	database_branch_id: DatabaseBranchId,
	shard_id: u32,
	as_of_txid: u64,
) -> Result<()> {
	let db = test_ctx.pools().udb()?;
	db.txn(
		"test_depotworkflow_compaction_skeletons",
		move |tx| async move {
			let (begin, end) = branch_shard_version_range(database_branch_id, shard_id, as_of_txid);
			tx.informal().clear_range(&begin, &end);
			Ok(())
		},
	)
	.await
}

/// Whether a commit still has a delta, regardless of how many blobs hold it.
///
/// A commit stores its pages as one blob per shard-aligned page range, so which keys it used depends
/// on the pages it touched. Naming a single key assumes a layout, and an `is_some` on the wrong key
/// reads as "the delta is gone" while an `is_none` passes vacuously.
async fn delta_exists(test_ctx: &TestCtx, branch_id: DatabaseBranchId, txid: u64) -> Result<bool> {
	Ok(!read_delta_keys(test_ctx, branch_id, txid).await?.is_empty())
}

async fn read_delta_keys(
	test_ctx: &TestCtx,
	branch_id: DatabaseBranchId,
	txid: u64,
) -> Result<Vec<Vec<u8>>> {
	let db = test_ctx.pools().udb()?;
	db.txn("test_depotworkflow_compaction_skeletons", move |tx| {
		let (begin, end) = branch_delta_txid_range(branch_id, txid);
		async move {
			let informal = tx.informal();
			let mut stream = informal.get_ranges_keyvalues(
				universaldb::RangeOption {
					mode: universaldb::options::StreamingMode::WantAll,
					..(begin.as_slice(), end.as_slice()).into()
				},
				Snapshot,
			);
			let mut keys = Vec::new();
			while let Some(entry) = futures_util::TryStreamExt::try_next(&mut stream).await? {
				keys.push(entry.key().to_vec());
			}
			Ok(keys)
		}
	})
	.await
}

/// Clears every row of a commit's delta, so the commit reads as having none.
async fn clear_delta(test_ctx: &TestCtx, branch_id: DatabaseBranchId, txid: u64) -> Result<()> {
	let keys = read_delta_keys(test_ctx, branch_id, txid).await?;
	let db = test_ctx.pools().udb()?;
	db.txn("test_depotworkflow_compaction_skeletons", move |tx| {
		let keys = keys.clone();
		async move {
			for key in &keys {
				tx.informal().clear(key);
			}
			Ok(())
		}
	})
	.await
}

async fn read_value(test_ctx: &TestCtx, key: Vec<u8>) -> Result<Option<Vec<u8>>> {
	let db = test_ctx.pools().udb()?;
	db.txn("test_depotworkflow_compaction_skeletons", move |tx| {
		let key = key.clone();
		async move {
			Ok(tx
				.informal()
				.get(&key, Snapshot)
				.await?
				.map(Vec::<u8>::from))
		}
	})
	.await
}

async fn read_database_branch_id(test_ctx: &TestCtx) -> Result<DatabaseBranchId> {
	read_named_database_branch_id(test_ctx, TEST_DATABASE).await
}

async fn read_named_database_branch_id(
	test_ctx: &TestCtx,
	database_id: &str,
) -> Result<DatabaseBranchId> {
	let db = test_ctx.pools().udb()?;
	let database_id = database_id.to_string();
	db.txn("test_depotworkflow_compaction_skeletons", move |tx| {
		let database_id = database_id.clone();
		async move {
			branch::resolve_database_branch(
				&tx,
				depot::types::BucketId::from_gas_id(test_bucket()),
				&database_id,
				universaldb::utils::IsolationLevel::Serializable,
			)
			.await?
			.ok_or_else(|| anyhow::anyhow!("database branch should exist"))
		}
	})
	.await
}

async fn read_pitr_interval_coverage(
	test_ctx: &TestCtx,
	database_branch_id: DatabaseBranchId,
	bucket_start_ms: i64,
) -> Result<Option<PitrIntervalCoverage>> {
	read_value(
		test_ctx,
		branch_pitr_interval_key(database_branch_id, bucket_start_ms),
	)
	.await?
	.as_deref()
	.map(decode_pitr_interval_coverage)
	.transpose()
}

async fn read_pitr_interval_txid(
	test_ctx: &TestCtx,
	database_branch_id: DatabaseBranchId,
	bucket_start_ms: i64,
) -> Result<Option<u64>> {
	Ok(
		read_pitr_interval_coverage(test_ctx, database_branch_id, bucket_start_ms)
			.await?
			.map(|coverage| coverage.txid),
	)
}

async fn read_bucket_branch_id(test_ctx: &TestCtx) -> Result<BucketBranchId> {
	let db = test_ctx.pools().udb()?;
	db.txn("test_depotworkflow_compaction_skeletons", |tx| async move {
		branch::resolve_bucket_branch(
			&tx,
			BucketId::from_gas_id(test_bucket()),
			universaldb::utils::IsolationLevel::Serializable,
		)
		.await?
		.ok_or_else(|| anyhow::anyhow!("bucket branch should exist"))
	})
	.await
}

async fn read_prefix_values(
	test_ctx: &TestCtx,
	prefix: Vec<u8>,
) -> Result<Vec<(Vec<u8>, Vec<u8>)>> {
	let db = test_ctx.pools().udb()?;
	db.txn("test_depotworkflow_compaction_skeletons", move |tx| {
		let prefix = prefix.clone();
		async move {
			let prefix_subspace =
				universaldb::Subspace::from(universaldb::tuple::Subspace::from_bytes(prefix));
			let rows = tx
				.informal()
				.get_ranges_keyvalues(
					universaldb::RangeOption {
						mode: universaldb::options::StreamingMode::WantAll,
						..universaldb::RangeOption::from(&prefix_subspace)
					},
					Snapshot,
				)
				.try_collect::<Vec<_>>()
				.await?;

			Ok(rows
				.into_iter()
				.map(|entry| (entry.key().to_vec(), entry.value().to_vec()))
				.collect())
		}
	})
	.await
}

async fn seed_manager_branch(
	test_ctx: &TestCtx,
	database_branch_id: DatabaseBranchId,
	head_txid: u64,
	root: Option<CompactionRoot>,
	dirty: Option<SqliteCmpDirty>,
) -> Result<()> {
	let db = test_ctx.pools().udb()?;
	let bucket_branch =
		BucketBranchId::from_uuid(Uuid::from_u128(0x9999_8888_7777_6666_5555_4444_3333_2222));
	db.txn("test_depotworkflow_compaction_skeletons", move |tx| {
		let root = root.clone();
		let dirty = dirty.clone();
		async move {
			let branch_record = DatabaseBranchRecord {
				branch_id: database_branch_id,
				bucket_branch,
				parent: None,
				parent_versionstamp: None,
				root_versionstamp: [0; 16],
				fork_depth: 0,
				created_at_ms: 1_000,
				created_from_restore_point: None,
				state: BranchState::Live,
				lifecycle_generation: 0,
			};
			tx.informal().set(
				&branches_list_key(database_branch_id),
				&encode_database_branch_record(branch_record)?,
			);
			tx.informal().set(
				&branch_meta_head_key(database_branch_id),
				&encode_db_head(DBHead {
					head_txid,
					db_size_pages: 2,
					post_apply_checksum: 0,
					branch_id: database_branch_id,
				})?,
			);
			for txid in 1..=head_txid {
				let mut versionstamp = [0; 16];
				versionstamp[8..16].copy_from_slice(&txid.to_be_bytes());
				tx.informal().set(
					&branch_commit_key(database_branch_id, txid),
					&encode_commit_row(CommitRow {
						wall_clock_ms: 1_000 + i64::try_from(txid).unwrap_or(i64::MAX),
						versionstamp,
						db_size_pages: 2,
						post_apply_checksum: txid,
					})?,
				);
				tx.informal().set(
					&branch_vtx_key(database_branch_id, versionstamp),
					&txid.to_be_bytes(),
				);
				let delta_blob = encode_ltx_v3(
					LtxHeader::delta(txid, 1, 1_000 + i64::try_from(txid).unwrap_or(i64::MAX)),
					&[DirtyPage {
						pgno: 1,
						bytes: vec![txid as u8; PAGE_SIZE as usize],
					}],
				)?;
				// Some callers seed over txids a real commit already wrote. That commit's delta is
				// segmented, so clear the txid's whole delta range first: leaving both layouts under
				// one txid is corruption the read path refuses to reconcile.
				let (delta_begin, delta_end) = branch_delta_txid_range(database_branch_id, txid);
				tx.informal().clear_range(&delta_begin, &delta_end);
				tx.informal().set(
					&branch_delta_chunk_key(database_branch_id, txid, 0),
					&delta_blob,
				);
			}
			tx.informal().set(
				&branch_pidx_key(database_branch_id, 1),
				&head_txid.to_be_bytes(),
			);
			if let Some(root) = root {
				tx.informal().set(
					&branch_compaction_root_key(database_branch_id),
					&encode_compaction_root(root)?,
				);
			}
			if let Some(dirty) = dirty {
				tx.informal().set(
					&sqlite_cmp_dirty_key(database_branch_id),
					&encode_sqlite_cmp_dirty(dirty)?,
				);
			}
			Ok(())
		}
	})
	.await
}

async fn update_branch_lifecycle(
	test_ctx: &TestCtx,
	database_branch_id: DatabaseBranchId,
	state: BranchState,
	lifecycle_generation: u64,
) -> Result<()> {
	let db = test_ctx.pools().udb()?;
	db.txn(
		"test_depotworkflow_compaction_skeletons",
		move |tx| async move {
			let key = branches_list_key(database_branch_id);
			let record_bytes = tx
				.informal()
				.get(&key, Snapshot)
				.await?
				.expect("database branch record should exist");
			let mut record = depot::types::decode_database_branch_record(&record_bytes)?;
			record.state = state;
			record.lifecycle_generation = lifecycle_generation;
			tx.informal()
				.set(&key, &encode_database_branch_record(record)?);
			Ok(())
		},
	)
	.await
}

async fn clear_branch_record(
	test_ctx: &TestCtx,
	database_branch_id: DatabaseBranchId,
) -> Result<()> {
	let db = test_ctx.pools().udb()?;
	db.txn(
		"test_depotworkflow_compaction_skeletons",
		move |tx| async move {
			tx.informal().clear(&branches_list_key(database_branch_id));
			Ok(())
		},
	)
	.await
}

async fn seed_restore_point_db_pin(
	test_ctx: &TestCtx,
	database_branch_id: DatabaseBranchId,
	at_txid: u64,
) -> Result<RestorePointId> {
	let restore_point =
		RestorePointId::format(1_000 + i64::try_from(at_txid).unwrap_or(i64::MAX), at_txid)?;
	let db = test_ctx.pools().udb()?;
	db.txn("test_depotworkflow_compaction_skeletons", {
		let restore_point = restore_point.clone();
		move |tx| {
			let restore_point = restore_point.clone();
			async move {
				let commit_bytes = tx
					.informal()
					.get(&branch_commit_key(database_branch_id, at_txid), Snapshot)
					.await?
					.expect("pinned commit row should exist");
				let commit = decode_commit_row(&commit_bytes)?;
				history_pin::write_restore_point_pin(
					&tx,
					database_branch_id,
					restore_point,
					commit.versionstamp,
					at_txid,
					commit.wall_clock_ms,
				)
			}
		}
	})
	.await?;

	Ok(restore_point)
}

async fn seed_pitr_interval_coverage(
	test_ctx: &TestCtx,
	database_branch_id: DatabaseBranchId,
	bucket_start_ms: i64,
	txid: u64,
	expires_at_ms: i64,
) -> Result<()> {
	let db = test_ctx.pools().udb()?;
	db.txn(
		"test_depotworkflow_compaction_skeletons",
		move |tx| async move {
			let commit_bytes = tx
				.informal()
				.get(&branch_commit_key(database_branch_id, txid), Snapshot)
				.await?
				.expect("PITR interval commit row should exist");
			let commit = decode_commit_row(&commit_bytes)?;
			tx.informal().set(
				&branch_pitr_interval_key(database_branch_id, bucket_start_ms),
				&encode_pitr_interval_coverage(PitrIntervalCoverage {
					txid,
					versionstamp: commit.versionstamp,
					wall_clock_ms: commit.wall_clock_ms,
					expires_at_ms,
				})?,
			);
			Ok(())
		},
	)
	.await
}

/// Models what a hot install publishes at one coverage fold: the shard image, the `CMP/fold` index
/// entry that records which shards it materialized, and the cleared PIDX row.
///
/// The fold index is not decoration. Reclaim's delta gate reads `CMP/fold`, not the SHARD rows, to
/// decide whether a delta's shards are materialized at the smallest coverage fold that still needs
/// them, so a fixture that writes the image without the index leaves every delta below that fold
/// permanently retained. Install writes both in one transaction; so does this.
async fn publish_test_shard_and_clear_pidx(
	test_ctx: &TestCtx,
	database_branch_id: DatabaseBranchId,
	as_of_txid: u64,
) -> Result<()> {
	let db = test_ctx.pools().udb()?;
	db.txn(
		"test_depotworkflow_compaction_skeletons",
		move |tx| async move {
			let shard_blob = encode_ltx_v3(
				LtxHeader::delta(as_of_txid, 1, 1_000),
				&[DirtyPage {
					pgno: 1,
					bytes: vec![as_of_txid as u8; PAGE_SIZE as usize],
				}],
			)?;
			tx.informal().set(
				&branch_shard_key(database_branch_id, 0, as_of_txid),
				&shard_blob,
			);
			// The versionstamp install stamps on the fold entry is the one on the commit row it folds,
			// which `seed_manager_branch` derives from the txid.
			let mut versionstamp = [0; 16];
			versionstamp[8..16].copy_from_slice(&as_of_txid.to_be_bytes());
			tx.informal().set(
				&branch_compaction_fold_key(database_branch_id, as_of_txid),
				&encode_fold_index_entry(FoldIndexEntry {
					shard_ids: vec![0],
					versionstamp,
				})?,
			);
			tx.informal().clear(&branch_pidx_key(database_branch_id, 1));
			Ok(())
		},
	)
	.await
}

async fn set_test_pidx(
	test_ctx: &TestCtx,
	database_branch_id: DatabaseBranchId,
	txid: u64,
) -> Result<()> {
	let db = test_ctx.pools().udb()?;
	db.txn(
		"test_depotworkflow_compaction_skeletons",
		move |tx| async move {
			tx.informal()
				.set(&branch_pidx_key(database_branch_id, 1), &txid.to_be_bytes());
			Ok(())
		},
	)
	.await
}

/// Forces a reclaim pass on an already-dispatched manager.
///
/// `DeltasAvailable` only arms the hot trigger. `run_manager_iteration` takes `triggers.reclaim` from
/// `next_reclaim_check_at_ms` or from forced work, and that deadline is only armed by a previous
/// iteration, so a freshly seeded branch has no way to reach reclaim except by forcing it. The
/// unforced path still has coverage: `reclaimer_rejects_stale_manifest_generation` and the
/// `reclaimer_logs_and_retains_live_cold_ref_*` pair drive a manager-planned reclaim job end to end.
async fn force_reclaim(
	test_ctx: &TestCtx,
	manager_workflow_id: Id,
	database_branch_id: DatabaseBranchId,
	request_id: Id,
) -> Result<()> {
	force_compaction_and_wait_idle(
		test_ctx,
		manager_workflow_id,
		database_branch_id,
		request_id,
		ForceCompactionWork {
			hot: false,
			cold: false,
			reclaim: true,
			final_settle: false,
		},
	)
	.await?;

	Ok(())
}

async fn seed_bucket_fork_proof(
	test_ctx: &TestCtx,
	database_branch_id: DatabaseBranchId,
	source_bucket_branch_id: BucketBranchId,
	target_bucket_branch_id: BucketBranchId,
	fork_txid: u64,
	write_fork_pin_fact: bool,
) -> Result<()> {
	let db = test_ctx.pools().udb()?;
	db.txn(
		"test_depotworkflow_compaction_skeletons",
		move |tx| async move {
			let mut fork_versionstamp = [0; 16];
			fork_versionstamp[8..16].copy_from_slice(&fork_txid.to_be_bytes());
			tx.informal().set(
				&bucket_catalog_by_db_key(database_branch_id, source_bucket_branch_id),
				&encode_bucket_catalog_db_fact(BucketCatalogDbFact {
					database_branch_id,
					bucket_branch_id: source_bucket_branch_id,
					catalog_versionstamp: [0; 16],
					tombstone_versionstamp: None,
				})?,
			);
			let fact = BucketForkFact {
				source_bucket_branch_id,
				target_bucket_branch_id,
				fork_versionstamp,
				parent_cap_versionstamp: fork_versionstamp,
			};
			let encoded_fact = encode_bucket_fork_fact(fact)?;
			tx.informal().set(
				&bucket_child_key(
					source_bucket_branch_id,
					fork_versionstamp,
					target_bucket_branch_id,
				),
				&encoded_fact,
			);
			if write_fork_pin_fact {
				tx.informal().set(
					&bucket_fork_pin_key(
						source_bucket_branch_id,
						fork_versionstamp,
						target_bucket_branch_id,
					),
					&encoded_fact,
				);
			}
			Ok(())
		},
	)
	.await
}

#[test]
fn compaction_workflow_names_are_stable() {
	assert_eq!(
		<DbManagerWorkflow as WorkflowTrait>::NAME,
		"depot_db_manager3"
	);
	assert_eq!(
		<DbHotCompactorWorkflow as WorkflowTrait>::NAME,
		"depot_db_hot_compactor3"
	);
	assert_eq!(
		<DbReclaimerWorkflow as WorkflowTrait>::NAME,
		"depot_db_reclaimer3"
	);
}

#[tokio::test]
async fn manager_spawns_companions_and_records_deltas_available() -> Result<()> {
	let database_branch_id = database_branch_id(0x0011_2233_4455_6677_8899_aabb_ccdd_eeff);
	workflow_matrix!(
		"workflow-manager-spawns-companions-and-records-deltas-available",
		build_registry,
		|_tier, test_ctx| {
			let tag_value = database_branch_tag_value(database_branch_id);
			seed_manager_branch(&test_ctx, database_branch_id, 0, None, None).await?;

			let manager_workflow_id = test_ctx
				.workflow(DbManagerInput::new(database_branch_id, None))
				.tag(DATABASE_BRANCH_ID_TAG, &tag_value)
				.unique()
				.dispatch()
				.await?;

			let hot_workflow_id =
				wait_for_workflow::<DbHotCompactorWorkflow>(&test_ctx, database_branch_id).await?;
			let reclaimer_workflow_id =
				wait_for_workflow::<DbReclaimerWorkflow>(&test_ctx, database_branch_id).await?;

			let signal_id = test_ctx
				.signal(DeltasAvailable {
					database_branch_id,
					observed_head_txid: 123,
					dirty_updated_at_ms: 1_714_000_000_000,
				})
				.to_workflow_id(manager_workflow_id)
				.send()
				.await?
				.expect("signal should target manager workflow");

			wait_for_signal_ack(&test_ctx, signal_id).await?;
			let manager_state =
				wait_for_manager_cursor(&test_ctx, manager_workflow_id, 123).await?;

			assert_eq!(
				manager_state
					.companion_workflow_ids
					.hot_compactor_workflow_id,
				hot_workflow_id
			);
			assert_eq!(
				manager_state.companion_workflow_ids.reclaimer_workflow_id,
				reclaimer_workflow_id
			);
			assert_ne!(hot_workflow_id, reclaimer_workflow_id);
			assert!(manager_state.active_jobs.hot.is_none());
			assert!(manager_state.active_jobs.reclaim.is_none());

			let manager_workflow =
				DatabaseDebug::get_workflows(test_ctx.debug_db(), vec![manager_workflow_id])
					.await?
					.into_iter()
					.next()
					.expect("manager workflow should exist");
			assert_eq!(
				manager_workflow.tags,
				serde_json::json!({ DATABASE_BRANCH_ID_TAG: tag_value })
			);

			assert_eq!(
				<DeltasAvailable as SignalTrait>::NAME,
				"depot_sqlite_cmp_deltas_available"
			);

			test_ctx.shutdown().await?;
			Ok(())
		}
	)
}

#[tokio::test]
async fn manager_ignores_unrelated_branch_signals_without_mutating_state() -> Result<()> {
	let primary_branch_id = database_branch_id(0x0012_2233_4455_6677_8899_aabb_ccdd_eeff);
	let unrelated_branch_id = database_branch_id(0x0013_2233_4455_6677_8899_aabb_ccdd_eeff);
	workflow_matrix!(
		"workflow-manager-ignores-unrelated-branch-signals-without-mutating-state",
		build_registry,
		|_tier, test_ctx| {
			let tag_value = database_branch_tag_value(primary_branch_id);
			seed_manager_branch(&test_ctx, primary_branch_id, 0, None, None).await?;

			let manager_workflow_id = test_ctx
				.workflow(DbManagerInput::new(primary_branch_id, None))
				.tag(DATABASE_BRANCH_ID_TAG, &tag_value)
				.unique()
				.dispatch()
				.await?;
			wait_for_manager_state(
				&test_ctx,
				manager_workflow_id,
				manager_has_distinct_companions,
			)
			.await?;

			let signal = DeltasAvailable {
				database_branch_id: unrelated_branch_id,
				observed_head_txid: 999,
				dirty_updated_at_ms: 1_714_000_000_000,
			};
			assert_eq!(
				DbManagerSignal::DeltasAvailable(signal.clone()).database_branch_id(),
				unrelated_branch_id
			);
			let signal_id = test_ctx
				.signal(signal)
				.to_workflow_id(manager_workflow_id)
				.send()
				.await?
				.expect("signal should target manager workflow");
			wait_for_signal_ack(&test_ctx, signal_id).await?;

			let manager_state = latest_manager_state(&test_ctx, manager_workflow_id).await?;
			assert!(manager_state.last_dirty_cursor.is_none());
			assert!(manager_state.force_compactions.pending_requests.is_empty());
			assert!(manager_state.force_compactions.recent_results.is_empty());
			assert_eq!(manager_state.branch_stop_state, BranchStopState::Running);

			test_ctx.shutdown().await?;
			Ok(())
		}
	)
}

#[tokio::test]
async fn companion_ignores_unrelated_branch_signals_without_mutating_state() -> Result<()> {
	let primary_branch_id = database_branch_id(0x0014_2233_4455_6677_8899_aabb_ccdd_eeff);
	let unrelated_branch_id = database_branch_id(0x0015_2233_4455_6677_8899_aabb_ccdd_eeff);
	workflow_matrix!(
		"workflow-companion-ignores-unrelated-branch-signals-without-mutating-state",
		build_registry,
		|_tier, test_ctx| {
			let tag_value = database_branch_tag_value(primary_branch_id);
			seed_manager_branch(&test_ctx, primary_branch_id, 0, None, None).await?;

			let _manager_workflow_id = test_ctx
				.workflow(DbManagerInput::new(primary_branch_id, None))
				.tag(DATABASE_BRANCH_ID_TAG, &tag_value)
				.unique()
				.dispatch()
				.await?;
			let hot_workflow_id =
				wait_for_workflow::<DbHotCompactorWorkflow>(&test_ctx, primary_branch_id).await?;

			let signal = RunHotJob {
				database_branch_id: unrelated_branch_id,
				job_id: Id::new_v1(70),
				job_kind: CompactionJobKind::Hot,
				base_lifecycle_generation: 0,
				base_manifest_generation: 0,
				drain_head_txid: 1,
				drain_now_ms: 1_000,
				bypass_admission: false,
			};
			assert_eq!(
				DbHotCompactorSignal::RunHotJob(signal.clone()).database_branch_id(),
				unrelated_branch_id
			);
			let signal_id = test_ctx
				.signal(signal)
				.to_workflow_id(hot_workflow_id)
				.send()
				.await?
				.expect("signal should target hot companion workflow");
			wait_for_signal_ack(&test_ctx, signal_id).await?;

			let companion_state = latest_companion_state(&test_ctx, hot_workflow_id).await?;
			assert_eq!(companion_state, CompanionWorkflowState::Idle);
			assert!(
				read_prefix_values(
					&test_ctx,
					branch_compaction_stage_hot_shard_prefix(unrelated_branch_id, Id::new_v1(70)),
				)
				.await?
				.is_empty()
			);

			test_ctx.shutdown().await?;
			Ok(())
		}
	)
}

#[tokio::test]
async fn companion_destroy_signal_stops_idle_hot_cold_and_reclaim() -> Result<()> {
	let database_branch_id = database_branch_id(0x0016_2233_4455_6677_8899_aabb_ccdd_eeff);
	workflow_matrix!(
		"workflow-companion-destroy-signal-stops-idle-hot-cold-and-reclaim",
		build_registry,
		|_tier, test_ctx| {
			let tag_value = database_branch_tag_value(database_branch_id);
			seed_manager_branch(&test_ctx, database_branch_id, 0, None, None).await?;

			let _manager_workflow_id = test_ctx
				.workflow(DbManagerInput::new(database_branch_id, None))
				.tag(DATABASE_BRANCH_ID_TAG, &tag_value)
				.unique()
				.dispatch()
				.await?;
			let workflow_ids = [
				wait_for_workflow::<DbHotCompactorWorkflow>(&test_ctx, database_branch_id).await?,
				wait_for_workflow::<DbReclaimerWorkflow>(&test_ctx, database_branch_id).await?,
			];

			for (index, workflow_id) in workflow_ids.into_iter().enumerate() {
				let signal_id = test_ctx
					.signal(DestroyDatabaseBranch {
						database_branch_id,
						lifecycle_generation: 7,
						requested_at_ms: 1_714_000_000_000 + index as i64,
						reason: format!("direct idle companion destroy {index}"),
					})
					.to_workflow_id(workflow_id)
					.send()
					.await?
					.expect("signal should target companion workflow");
				wait_for_signal_ack(&test_ctx, signal_id).await?;
				wait_for_workflow_state(&test_ctx, workflow_id, WorkflowState::Complete).await?;

				let companion_state = latest_companion_state(&test_ctx, workflow_id).await?;
				assert_eq!(
					companion_state,
					CompanionWorkflowState::Stopping {
						active_job: None,
						lifecycle_generation: 7,
						requested_at_ms: 1_714_000_000_000 + index as i64,
						reason: format!("direct idle companion destroy {index}"),
					}
				);
			}

			test_ctx.shutdown().await?;
			Ok(())
		}
	)
}

#[tokio::test]
async fn manager_destroy_stops_idle_companions() -> Result<()> {
	let database_branch_id = database_branch_id(0x0d10_2233_4455_6677_8899_aabb_ccdd_eeff);
	workflow_matrix!(
		"workflow-manager-destroy-stops-idle-companions",
		build_registry,
		|_tier, test_ctx| {
			let tag_value = database_branch_tag_value(database_branch_id);
			seed_manager_branch(&test_ctx, database_branch_id, 0, None, None).await?;

			let manager_workflow_id = test_ctx
				.workflow(DbManagerInput::new(database_branch_id, None))
				.tag(DATABASE_BRANCH_ID_TAG, &tag_value)
				.unique()
				.dispatch()
				.await?;
			let hot_workflow_id =
				wait_for_workflow::<DbHotCompactorWorkflow>(&test_ctx, database_branch_id).await?;
			let reclaimer_workflow_id =
				wait_for_workflow::<DbReclaimerWorkflow>(&test_ctx, database_branch_id).await?;

			let signal_id = test_ctx
				.signal(DestroyDatabaseBranch {
					database_branch_id,
					lifecycle_generation: 0,
					requested_at_ms: 1_714_000_000_000,
					reason: "test destroy".into(),
				})
				.to_workflow_id(manager_workflow_id)
				.send()
				.await?
				.expect("signal should target manager workflow");
			wait_for_signal_ack(&test_ctx, signal_id).await?;

			wait_for_workflow_state(&test_ctx, manager_workflow_id, WorkflowState::Complete)
				.await?;
			wait_for_workflow_state(&test_ctx, hot_workflow_id, WorkflowState::Complete).await?;
			wait_for_workflow_state(&test_ctx, reclaimer_workflow_id, WorkflowState::Complete)
				.await?;

			let manager_state = latest_manager_state(&test_ctx, manager_workflow_id).await?;
			assert!(manager_state.active_jobs.hot.is_none());
			assert!(manager_state.active_jobs.reclaim.is_none());
			assert!(matches!(
				manager_state.branch_stop_state,
				BranchStopState::Stopped { .. }
			));

			for companion_workflow_id in [hot_workflow_id, reclaimer_workflow_id] {
				let destroy =
					single_destroy_signal_for_workflow(&test_ctx, companion_workflow_id).await?;
				assert_eq!(destroy.database_branch_id, database_branch_id);
				assert_eq!(destroy.lifecycle_generation, 0);
				assert_eq!(destroy.requested_at_ms, 1_714_000_000_000);
				assert_eq!(destroy.reason, "test destroy");
			}

			test_ctx.shutdown().await?;
			Ok(())
		}
	)
}

#[tokio::test]
async fn manager_recreated_for_deleted_branch_stops_without_scheduling() -> Result<()> {
	let database_branch_id = database_branch_id(0x0d11_2233_4455_6677_8899_aabb_ccdd_eeff);
	workflow_matrix!(
		"workflow-manager-recreated-for-deleted-branch-stops-without-scheduling",
		build_registry,
		|_tier, test_ctx| {
			let tag_value = database_branch_tag_value(database_branch_id);
			seed_manager_branch(
				&test_ctx,
				database_branch_id,
				quota_threshold_head(),
				None,
				Some(SqliteCmpDirty {
					observed_head_txid: quota_threshold_head(),
					updated_at_ms: 1_714_000_000_000,
				}),
			)
			.await?;
			clear_branch_record(&test_ctx, database_branch_id).await?;

			let manager_workflow_id = test_ctx
				.workflow(DbManagerInput::new(database_branch_id, None))
				.tag(DATABASE_BRANCH_ID_TAG, &tag_value)
				.unique()
				.dispatch()
				.await?;
			wake_manager(&test_ctx, manager_workflow_id, database_branch_id).await?;
			let hot_workflow_id =
				wait_for_workflow::<DbHotCompactorWorkflow>(&test_ctx, database_branch_id).await?;
			let reclaimer_workflow_id =
				wait_for_workflow::<DbReclaimerWorkflow>(&test_ctx, database_branch_id).await?;

			wait_for_workflow_state(&test_ctx, manager_workflow_id, WorkflowState::Complete)
				.await?;
			wait_for_workflow_state(&test_ctx, hot_workflow_id, WorkflowState::Complete).await?;
			wait_for_workflow_state(&test_ctx, reclaimer_workflow_id, WorkflowState::Complete)
				.await?;
			let run_hot_signals = DatabaseDebug::find_signals(
				test_ctx.debug_db(),
				&[],
				Some(hot_workflow_id),
				Some(<RunHotJob as SignalTrait>::NAME),
				None,
			)
			.await?;
			assert!(run_hot_signals.is_empty());
			let hot_destroy =
				single_destroy_signal_for_workflow(&test_ctx, hot_workflow_id).await?;
			let reclaimer_destroy =
				single_destroy_signal_for_workflow(&test_ctx, reclaimer_workflow_id).await?;
			for destroy in [&hot_destroy, &reclaimer_destroy] {
				assert_eq!(destroy.database_branch_id, database_branch_id);
				assert_eq!(destroy.lifecycle_generation, 0);
				assert_eq!(destroy.reason, "database branch is not live");
			}
			assert_eq!(
				hot_destroy.requested_at_ms,
				reclaimer_destroy.requested_at_ms
			);

			test_ctx.shutdown().await?;
			Ok(())
		}
	)
}

#[tokio::test]
async fn manager_branch_not_live_stop_clears_active_jobs() -> Result<()> {
	let database_branch_id = database_branch_id(0x0d13_2233_4455_6677_8899_aabb_ccdd_eeff);
	workflow_matrix!(
		"workflow-manager-branch-not-live-stop-clears-active-jobs",
		build_registry_without_hot_compactor,
		|_tier, test_ctx| {
			let tag_value = database_branch_tag_value(database_branch_id);
			seed_manager_branch(
				&test_ctx,
				database_branch_id,
				quota_threshold_head(),
				None,
				Some(SqliteCmpDirty {
					observed_head_txid: quota_threshold_head(),
					updated_at_ms: 1_714_000_000_000,
				}),
			)
			.await?;

			let manager_workflow_id = test_ctx
				.workflow(DbManagerInput::new(database_branch_id, None))
				.tag(DATABASE_BRANCH_ID_TAG, &tag_value)
				.unique()
				.dispatch()
				.await?;
			wake_manager(&test_ctx, manager_workflow_id, database_branch_id).await?;
			let hot_workflow_id =
				wait_for_workflow::<DbHotCompactorWorkflow>(&test_ctx, database_branch_id).await?;
			let reclaimer_workflow_id =
				wait_for_workflow::<DbReclaimerWorkflow>(&test_ctx, database_branch_id).await?;
			let run_hot_job = wait_for_run_hot_job(&test_ctx, hot_workflow_id).await?;
			assert_eq!(run_hot_job.database_branch_id, database_branch_id);
			wait_for_manager_state(&test_ctx, manager_workflow_id, |state| {
				state.active_jobs.hot.is_some()
			})
			.await?;

			clear_branch_record(&test_ctx, database_branch_id).await?;

			wait_for_workflow_state(&test_ctx, manager_workflow_id, WorkflowState::Complete)
				.await?;
			wait_for_workflow_state(&test_ctx, reclaimer_workflow_id, WorkflowState::Complete)
				.await?;

			let manager_state = latest_manager_state(&test_ctx, manager_workflow_id).await?;
			assert!(manager_state.active_jobs.hot.is_none());
			assert!(manager_state.active_jobs.reclaim.is_none());
			assert!(matches!(
				manager_state.branch_stop_state,
				BranchStopState::Stopped { .. }
			));
			let destroy = single_destroy_signal_for_workflow(&test_ctx, hot_workflow_id).await?;
			assert_eq!(destroy.database_branch_id, database_branch_id);
			assert_eq!(destroy.lifecycle_generation, 0);
			assert_eq!(destroy.reason, "database branch is not live");

			test_ctx.shutdown().await?;
			Ok(())
		}
	)
}

#[tokio::test]
async fn manager_destroy_during_active_hot_job_completes() -> Result<()> {
	let database_branch_id = database_branch_id(0x0d12_2233_4455_6677_8899_aabb_ccdd_eeff);
	workflow_matrix!(
		"workflow-manager-destroy-during-active-hot-job-completes",
		build_registry,
		|_tier, test_ctx| {
			let tag_value = database_branch_tag_value(database_branch_id);
			seed_manager_branch(
				&test_ctx,
				database_branch_id,
				quota_threshold_head(),
				None,
				Some(SqliteCmpDirty {
					observed_head_txid: quota_threshold_head(),
					updated_at_ms: 1_714_000_000_000,
				}),
			)
			.await?;

			let manager_workflow_id = test_ctx
				.workflow(DbManagerInput::new(database_branch_id, None))
				.tag(DATABASE_BRANCH_ID_TAG, &tag_value)
				.unique()
				.dispatch()
				.await?;
			wake_manager(&test_ctx, manager_workflow_id, database_branch_id).await?;
			let hot_workflow_id =
				wait_for_workflow::<DbHotCompactorWorkflow>(&test_ctx, database_branch_id).await?;
			let run_hot_job = wait_for_run_hot_job(&test_ctx, hot_workflow_id).await?;
			assert_eq!(run_hot_job.job_kind, CompactionJobKind::Hot);
			assert_eq!(run_hot_job.database_branch_id, database_branch_id);
			// The companion self-plans every slice from the installed hot watermark; the manager only
			// pins the drain head (H0) the drain advances to.
			assert_eq!(run_hot_job.drain_head_txid, quota_threshold_head());

			let signal_id = test_ctx
				.signal(DestroyDatabaseBranch {
					database_branch_id,
					lifecycle_generation: 0,
					requested_at_ms: 1_714_000_000_001,
					reason: "test destroy during hot".into(),
				})
				.to_workflow_id(manager_workflow_id)
				.send()
				.await?
				.expect("signal should target manager workflow");
			wait_for_signal_ack(&test_ctx, signal_id).await?;

			wait_for_workflow_state(&test_ctx, manager_workflow_id, WorkflowState::Complete)
				.await?;
			wait_for_workflow_state(&test_ctx, hot_workflow_id, WorkflowState::Complete).await?;

			test_ctx.shutdown().await?;
			Ok(())
		}
	)
}

#[tokio::test]
async fn manager_rejects_hot_publish_after_lifecycle_generation_bump() -> Result<()> {
	let database_branch_id = database_branch_id(0x0d14_2233_4455_6677_8899_aabb_ccdd_eeff);
	workflow_matrix!(
		"workflow-manager-rejects-hot-publish-after-lifecycle-generation-bump",
		build_registry_without_hot_compactor,
		|_tier, test_ctx| {
			let tag_value = database_branch_tag_value(database_branch_id);
			seed_manager_branch(
				&test_ctx,
				database_branch_id,
				quota_threshold_head(),
				None,
				Some(SqliteCmpDirty {
					observed_head_txid: quota_threshold_head(),
					updated_at_ms: 1_714_000_000_000,
				}),
			)
			.await?;

			let manager_workflow_id = test_ctx
				.workflow(DbManagerInput::new(database_branch_id, None))
				.tag(DATABASE_BRANCH_ID_TAG, &tag_value)
				.unique()
				.dispatch()
				.await?;
			wake_manager(&test_ctx, manager_workflow_id, database_branch_id).await?;
			let hot_workflow_id =
				wait_for_workflow::<DbHotCompactorWorkflow>(&test_ctx, database_branch_id).await?;
			let run_hot_job = wait_for_run_hot_job(&test_ctx, hot_workflow_id).await?;
			let manager_state = wait_for_manager_state(&test_ctx, manager_workflow_id, |state| {
				state.active_jobs.hot.is_some()
			})
			.await?;
			let active_hot_job = manager_state
				.active_jobs
				.hot
				.expect("manager should hold planned hot job active");
			assert_eq!(active_hot_job.job_id, run_hot_job.job_id);
			assert_eq!(active_hot_job.base_lifecycle_generation, 0);

			let staged_blob = encode_ltx_v3(
				LtxHeader::delta(active_hot_job.input_range.txids.min_txid, 1, 1_002),
				&[DirtyPage {
					pgno: 1,
					bytes: page(0x14),
				}],
			)?;
			let output_ref = HotShardOutputRef {
				shard_id: 0,
				as_of_txid: active_hot_job.input_range.txids.max_txid,
				min_txid: active_hot_job.input_range.txids.min_txid,
				max_txid: active_hot_job.input_range.txids.max_txid,
				size_bytes: u64::try_from(staged_blob.len()).unwrap_or(u64::MAX),
				content_hash: sha256(&staged_blob),
			};
			test_ctx
				.pools()
				.udb()?
				.txn("test_depotworkflow_compaction_skeletons", {
					let staged_blob = staged_blob.clone();
					let active_hot_job = active_hot_job.clone();
					let output_ref = output_ref.clone();
					move |tx| {
						let staged_blob = staged_blob.clone();
						async move {
							tx.informal().set(
								&branch_compaction_stage_hot_shard_key(
									database_branch_id,
									active_hot_job.job_id,
									output_ref.shard_id,
									output_ref.as_of_txid,
									0,
								),
								&staged_blob,
							);
							tx.informal().set(
								&branch_compaction_stage_hot_ref_key(
									database_branch_id,
									active_hot_job.job_id,
									output_ref.min_txid,
									output_ref.shard_id,
									output_ref.as_of_txid,
								),
								&encode_staged_hot_shard_ref(StagedHotShardRef {
									shard_id: output_ref.shard_id,
									as_of_txid: output_ref.as_of_txid,
									min_txid: output_ref.min_txid,
									size_bytes: output_ref.size_bytes,
									content_hash: output_ref.content_hash,
								})?,
							);
							Ok(())
						}
					}
				})
				.await?;
			update_branch_lifecycle(&test_ctx, database_branch_id, BranchState::Live, 1).await?;

			let signal_id = test_ctx
				.signal(HotJobFinished {
					database_branch_id,
					job_id: active_hot_job.job_id,
					job_kind: CompactionJobKind::Hot,
					base_manifest_generation: active_hot_job.base_manifest_generation,
					status: CompactionJobStatus::Succeeded,
				})
				.to_workflow_id(manager_workflow_id)
				.send()
				.await?
				.expect("signal should target manager workflow");
			wait_for_signal_ack(&test_ctx, signal_id).await?;

			let manager_state = wait_for_manager_state(&test_ctx, manager_workflow_id, |state| {
				state
					.active_jobs
					.hot
					.as_ref()
					.is_some_and(|job| job.base_lifecycle_generation == 1)
			})
			.await?;
			let rescheduled_hot_job = manager_state
				.active_jobs
				.hot
				.expect("manager should reschedule hot work at the new generation");
			assert_eq!(rescheduled_hot_job.base_lifecycle_generation, 1);
			assert!(
				read_shard_version(&test_ctx, database_branch_id, 0, quota_threshold_head())
					.await?
					.is_none()
			);
			assert!(
				read_value(&test_ctx, branch_pidx_key(database_branch_id, 1))
					.await?
					.is_some()
			);

			test_ctx.shutdown().await?;
			Ok(())
		}
	)
}

#[tokio::test]
async fn manager_refresh_clears_idle_dirty_marker_without_planning_hot_job() -> Result<()> {
	let database_branch_id = database_branch_id(0x1010_2233_4455_6677_8899_aabb_ccdd_eeff);
	workflow_matrix!(
		"workflow-manager-refresh-clears-idle-dirty-marker-without-planning-hot-job",
		build_registry,
		|_tier, test_ctx| {
			let tag_value = database_branch_tag_value(database_branch_id);
			seed_manager_branch(
				&test_ctx,
				database_branch_id,
				1,
				None,
				Some(SqliteCmpDirty {
					observed_head_txid: 1,
					updated_at_ms: 1_714_000_000_000,
				}),
			)
			.await?;

			let manager_workflow_id = test_ctx
				.workflow(DbManagerInput::new(database_branch_id, None))
				.tag(DATABASE_BRANCH_ID_TAG, &tag_value)
				.unique()
				.dispatch()
				.await?;
			wake_manager(&test_ctx, manager_workflow_id, database_branch_id).await?;

			wait_for_dirty_marker_cleared(&test_ctx, database_branch_id).await?;
			let manager_state = wait_for_manager_state(&test_ctx, manager_workflow_id, |state| {
				state.last_observed_branch_lifecycle_generation.is_some()
			})
			.await?;

			assert!(manager_state.active_jobs.hot.is_none());

			test_ctx.shutdown().await?;
			Ok(())
		}
	)
}

#[tokio::test]
async fn manager_refresh_plans_first_hot_job_from_fdb_state() -> Result<()> {
	let database_branch_id = database_branch_id(0x2020_2233_4455_6677_8899_aabb_ccdd_eeff);
	workflow_matrix!(
		"workflow-manager-refresh-plans-first-hot-job-from-fdb-state",
		build_registry,
		|_tier, test_ctx| {
			let tag_value = database_branch_tag_value(database_branch_id);
			seed_manager_branch(
				&test_ctx,
				database_branch_id,
				quota_threshold_head(),
				None,
				Some(SqliteCmpDirty {
					observed_head_txid: quota_threshold_head(),
					updated_at_ms: 1_714_000_000_000,
				}),
			)
			.await?;

			let manager_workflow_id = test_ctx
				.workflow(DbManagerInput::new(database_branch_id, None))
				.tag(DATABASE_BRANCH_ID_TAG, &tag_value)
				.unique()
				.dispatch()
				.await?;
			wake_manager(&test_ctx, manager_workflow_id, database_branch_id).await?;

			wait_for_hot_install(&test_ctx, database_branch_id, quota_threshold_head()).await?;
			let manager_state =
				wait_for_latest_manager_state(&test_ctx, manager_workflow_id, |state| {
					state.active_jobs.hot.is_none()
				})
				.await?;

			assert!(manager_state.active_jobs.hot.is_none());
			assert!(
				read_value(&test_ctx, branch_pidx_key(database_branch_id, 1))
					.await?
					.is_none()
			);
			assert!(
				read_shard_version(&test_ctx, database_branch_id, 0, quota_threshold_head())
					.await?
					.is_some()
			);

			test_ctx.shutdown().await?;
			Ok(())
		}
	)
}

#[tokio::test]
async fn duplicate_deltas_available_does_not_create_duplicate_hot_job() -> Result<()> {
	let database_branch_id = database_branch_id(0x3030_2233_4455_6677_8899_aabb_ccdd_eeff);
	workflow_matrix!(
		"workflow-duplicate-deltas-available-does-not-create-duplicate-hot-job",
		build_registry,
		|_tier, test_ctx| {
			let tag_value = database_branch_tag_value(database_branch_id);
			seed_manager_branch(
				&test_ctx,
				database_branch_id,
				quota_threshold_head(),
				None,
				Some(SqliteCmpDirty {
					observed_head_txid: quota_threshold_head(),
					updated_at_ms: 1_714_000_000_000,
				}),
			)
			.await?;

			let manager_workflow_id = test_ctx
				.workflow(DbManagerInput::new(database_branch_id, None))
				.tag(DATABASE_BRANCH_ID_TAG, &tag_value)
				.unique()
				.dispatch()
				.await?;
			wake_manager(&test_ctx, manager_workflow_id, database_branch_id).await?;
			wait_for_hot_install(&test_ctx, database_branch_id, quota_threshold_head()).await?;

			let signal_id = test_ctx
				.signal(DeltasAvailable {
					database_branch_id,
					observed_head_txid: 99,
					dirty_updated_at_ms: 1_714_000_000_500,
				})
				.to_workflow_id(manager_workflow_id)
				.send()
				.await?
				.expect("signal should target manager workflow");
			wait_for_signal_ack(&test_ctx, signal_id).await?;
			let second_state = wait_for_manager_cursor(&test_ctx, manager_workflow_id, 99).await?;
			let root = read_value(&test_ctx, branch_compaction_root_key(database_branch_id))
				.await?
				.as_deref()
				.map(decode_compaction_root)
				.transpose()?
				.expect("hot install should publish compaction root");
			let shard_rows =
				read_prefix_values(&test_ctx, branch_shard_prefix(database_branch_id)).await?;

			assert!(second_state.active_jobs.hot.is_none());
			assert_eq!(root.manifest_generation, 1);
			assert_eq!(root.hot_watermark_txid, quota_threshold_head());
			assert_eq!(shard_rows.len(), 1);

			test_ctx.shutdown().await?;
			Ok(())
		}
	)
}

#[tokio::test]
async fn force_compaction_noop_records_completion_result() -> Result<()> {
	let database_branch_id = database_branch_id(0x3131_2233_4455_6677_8899_aabb_ccdd_eeff);
	workflow_matrix!(
		"workflow-force-compaction-noop-records-completion-result",
		build_registry,
		|_tier, test_ctx| {
			let tag_value = database_branch_tag_value(database_branch_id);
			seed_manager_branch(&test_ctx, database_branch_id, 0, None, None).await?;

			let manager_workflow_id = test_ctx
				.workflow(DbManagerInput::new(database_branch_id, None))
				.tag(DATABASE_BRANCH_ID_TAG, &tag_value)
				.unique()
				.dispatch()
				.await?;
			let request_id = Id::new_v1(42);
			let result = force_compaction_and_wait_idle(
				&test_ctx,
				manager_workflow_id,
				database_branch_id,
				request_id,
				ForceCompactionWork {
					hot: true,
					cold: true,
					reclaim: true,
					final_settle: true,
				},
			)
			.await?;

			assert_eq!(result.request_id, request_id);
			assert!(result.attempted_job_kinds.is_empty());
			assert!(result.completed_job_ids.is_empty());
			assert!(
				result
					.skipped_noop_reasons
					.contains(&"hot:no-actionable-lag".to_string())
			);
			assert!(
				result
					.skipped_noop_reasons
					.contains(&"reclaim:no-actionable-work".to_string())
			);
			assert!(
				result
					.skipped_noop_reasons
					.contains(&"final-settle:refreshed".to_string())
			);

			test_ctx.shutdown().await?;
			Ok(())
		}
	)
}

#[tokio::test]
async fn force_hot_compaction_publishes_planned_work_below_threshold() -> Result<()> {
	let database_branch_id = database_branch_id(0x3232_2233_4455_6677_8899_aabb_ccdd_eeff);
	workflow_matrix!(
		"workflow-force-hot-compaction-publishes-planned-work-below-threshold",
		build_registry,
		|_tier, test_ctx| {
			let tag_value = database_branch_tag_value(database_branch_id);
			seed_manager_branch(&test_ctx, database_branch_id, 1, None, None).await?;

			let manager_workflow_id = test_ctx
				.workflow(DbManagerInput::new(database_branch_id, None))
				.tag(DATABASE_BRANCH_ID_TAG, &tag_value)
				.unique()
				.dispatch()
				.await?;
			let request_id = Id::new_v1(43);
			let result = force_compaction_and_wait_idle(
				&test_ctx,
				manager_workflow_id,
				database_branch_id,
				request_id,
				ForceCompactionWork {
					hot: true,
					cold: false,
					reclaim: false,
					final_settle: false,
				},
			)
			.await?;

			assert_eq!(result.attempted_job_kinds, vec![CompactionJobKind::Hot]);
			assert_eq!(result.completed_job_ids.len(), 1);
			assert!(result.skipped_noop_reasons.is_empty());
			assert!(result.terminal_error.is_none());
			let root = read_value(&test_ctx, branch_compaction_root_key(database_branch_id))
				.await?
				.as_deref()
				.map(decode_compaction_root)
				.transpose()?
				.expect("force hot compaction should publish root");
			assert_eq!(root.hot_watermark_txid, 1);
			assert!(
				read_shard_version(&test_ctx, database_branch_id, 0, 1)
					.await?
					.is_some()
			);
			assert!(
				read_value(&test_ctx, branch_pidx_key(database_branch_id, 1))
					.await?
					.is_none()
			);

			test_ctx.shutdown().await?;
			Ok(())
		}
	)
}

#[tokio::test]
async fn force_hot_compaction_writes_pitr_interval_coverage() -> Result<()> {
	workflow_matrix_with_pitr!(
		"workflow-force-hot-pitr",
		build_registry,
		|_tier, test_ctx| {
			let udb = test_ctx.pools().udb()?;
			set_bucket_pitr_policy(
				&*udb,
				BucketId::from_gas_id(test_bucket()),
				PitrPolicy {
					interval_ms: 10,
					retention_ms: 9_000_000_000_000,
				},
			)
			.await?;
			let database_db = make_test_db(&test_ctx)?;
			database_db
				.commit(vec![dirty_page(1, 0x01)], 2, 1_000)
				.await?;
			database_db
				.commit(vec![dirty_page(1, 0x02)], 2, 1_004)
				.await?;
			database_db
				.commit(vec![dirty_page(1, 0x03)], 2, 1_012)
				.await?;
			database_db
				.commit(vec![dirty_page(1, 0x04)], 2, 1_018)
				.await?;
			database_db
				.commit(vec![dirty_page(1, 0x05)], 2, 1_029)
				.await?;
			let database_branch_id = read_database_branch_id(&test_ctx).await?;
			let tag_value = database_branch_tag_value(database_branch_id);
			let manager_workflow_id = test_ctx
				.workflow(DbManagerInput::new(database_branch_id, None))
				.tag(DATABASE_BRANCH_ID_TAG, &tag_value)
				.unique()
				.dispatch()
				.await?;

			let result = force_compaction_and_wait_idle(
				&test_ctx,
				manager_workflow_id,
				database_branch_id,
				Id::new_v1(83),
				ForceCompactionWork {
					hot: true,
					cold: false,
					reclaim: false,
					final_settle: false,
				},
			)
			.await?;

			assert_eq!(result.attempted_job_kinds, vec![CompactionJobKind::Hot]);
			assert!(result.terminal_error.is_none());
			assert_eq!(
				read_pitr_interval_txid(&test_ctx, database_branch_id, 1_000).await?,
				Some(2)
			);
			assert_eq!(
				read_pitr_interval_txid(&test_ctx, database_branch_id, 1_010).await?,
				Some(4)
			);
			assert_eq!(
				read_pitr_interval_txid(&test_ctx, database_branch_id, 1_020).await?,
				Some(5)
			);
			assert_eq!(
				read_pitr_interval_txid(&test_ctx, database_branch_id, 1_030).await?,
				None
			);
			for txid in [2, 4, 5] {
				assert!(
					read_shard_version(&test_ctx, database_branch_id, 0, txid)
						.await?
						.is_some()
				);
			}

			test_ctx.shutdown().await?;
			Ok(())
		}
	)
}

#[tokio::test]
async fn e2e_pitr_timestamp_resolution_uses_force_compacted_interval_coverage() -> Result<()> {
	workflow_matrix_with_pitr!(
		"workflow-pitr-timestamp-resolution",
		build_registry,
		|_tier, test_ctx| {
			let udb = test_ctx.pools().udb()?;
			set_bucket_pitr_policy(
				&*udb,
				BucketId::from_gas_id(test_bucket()),
				PitrPolicy {
					interval_ms: FIVE_MINUTES_MS,
					retention_ms: 9_000_000_000_000,
				},
			)
			.await?;
			let base_ms = 1_700_000_000_000_i64.div_euclid(FIVE_MINUTES_MS) * FIVE_MINUTES_MS;
			let database_db = make_test_db(&test_ctx)?;
			database_db
				.commit(vec![dirty_page(1, 0x11)], 2, base_ms + 60_000)
				.await?;
			database_db
				.commit(vec![dirty_page(1, 0x22)], 2, base_ms + 240_000)
				.await?;
			database_db
				.commit(vec![dirty_page(1, 0x33)], 2, base_ms + 360_000)
				.await?;
			database_db
				.commit(vec![dirty_page(1, 0x44)], 2, base_ms + 660_000)
				.await?;
			let database_branch_id = read_database_branch_id(&test_ctx).await?;
			let manager_workflow_id = test_ctx
				.workflow(DbManagerInput::new(database_branch_id, None))
				.tag(
					DATABASE_BRANCH_ID_TAG,
					&database_branch_tag_value(database_branch_id),
				)
				.unique()
				.dispatch()
				.await?;

			let result = force_compaction_and_wait_idle(
				&test_ctx,
				manager_workflow_id,
				database_branch_id,
				Id::new_v1(92),
				ForceCompactionWork {
					hot: true,
					cold: false,
					reclaim: false,
					final_settle: false,
				},
			)
			.await?;

			assert_eq!(result.attempted_job_kinds, vec![CompactionJobKind::Hot]);
			assert!(result.terminal_error.is_none());
			for (bucket_start_ms, expected_txid, requested_ms, expected_fill) in [
				(base_ms, 2, base_ms + 300_000, 0x22),
				(base_ms + FIVE_MINUTES_MS, 3, base_ms + 600_000, 0x33),
				(base_ms + 2 * FIVE_MINUTES_MS, 4, base_ms + 900_000, 0x44),
			] {
				assert_eq!(
					read_pitr_interval_txid(&test_ctx, database_branch_id, bucket_start_ms).await?,
					Some(expected_txid)
				);
				assert!(
					read_shard_version(&test_ctx, database_branch_id, 0, expected_txid)
						.await?
						.is_some()
				);

				let resolved = database_db
					.resolve_restore_target(SnapshotSelector::AtTimestamp {
						timestamp_ms: requested_ms,
					})
					.await?;
				assert_eq!(resolved.kind, SnapshotKind::AtTimestamp);
				assert_eq!(resolved.txid, expected_txid);
				let state = debug::read_at(&database_db, resolved.versionstamp).await?;
				assert_eq!(state.txid, expected_txid);
				assert_eq!(
					state.pages[0].bytes.as_deref(),
					Some(page(expected_fill).as_slice())
				);
			}

			test_ctx.shutdown().await?;
			Ok(())
		}
	)
}

#[tokio::test]
async fn e2e_pitr_timestamp_resolution_uses_previous_commit_through_quiet_period() -> Result<()> {
	workflow_matrix_with_pitr!(
		"workflow-e2e-pitr-timestamp-resolution-uses-previous-commit-through-quiet-period",
		build_registry,
		|_tier, test_ctx| {
			let udb = test_ctx.pools().udb()?;
			set_bucket_pitr_policy(
				&*udb,
				BucketId::from_gas_id(test_bucket()),
				PitrPolicy {
					interval_ms: FIVE_MINUTES_MS,
					retention_ms: 9_000_000_000_000,
				},
			)
			.await?;
			let base_ms = 1_700_000_000_000_i64.div_euclid(FIVE_MINUTES_MS) * FIVE_MINUTES_MS;
			let database_db = make_test_db(&test_ctx)?;
			database_db
				.commit(vec![dirty_page(1, 0x51)], 2, base_ms + 60_000)
				.await?;
			database_db
				.commit(vec![dirty_page(1, 0x52)], 2, base_ms + 17 * 60_000)
				.await?;
			let database_branch_id = read_database_branch_id(&test_ctx).await?;
			let manager_workflow_id = test_ctx
				.workflow(DbManagerInput::new(database_branch_id, None))
				.tag(
					DATABASE_BRANCH_ID_TAG,
					&database_branch_tag_value(database_branch_id),
				)
				.unique()
				.dispatch()
				.await?;

			force_compaction_and_wait_idle(
				&test_ctx,
				manager_workflow_id,
				database_branch_id,
				Id::new_v1(93),
				ForceCompactionWork {
					hot: true,
					cold: false,
					reclaim: false,
					final_settle: false,
				},
			)
			.await?;

			assert_eq!(
				read_pitr_interval_txid(&test_ctx, database_branch_id, base_ms).await?,
				Some(1)
			);
			assert_eq!(
				read_pitr_interval_txid(&test_ctx, database_branch_id, base_ms + FIVE_MINUTES_MS)
					.await?,
				None
			);
			assert_eq!(
				read_pitr_interval_txid(
					&test_ctx,
					database_branch_id,
					base_ms + 2 * FIVE_MINUTES_MS
				)
				.await?,
				None
			);
			let resolved = database_db
				.resolve_restore_target(SnapshotSelector::AtTimestamp {
					timestamp_ms: base_ms + 12 * 60_000,
				})
				.await?;
			assert_eq!(resolved.txid, 1);
			let state = debug::read_at(&database_db, resolved.versionstamp).await?;
			assert_eq!(state.pages[0].bytes.as_deref(), Some(page(0x51).as_slice()));

			test_ctx.shutdown().await?;
			Ok(())
		}
	)
}

#[tokio::test]
async fn e2e_pitr_timestamp_resolution_expires_after_configured_retention() -> Result<()> {
	workflow_matrix_with_pitr!(
		"workflow-e2e-pitr-timestamp-resolution-expires-after-configured-retention",
		build_registry,
		|_tier, test_ctx| {
			let udb = test_ctx.pools().udb()?;
			set_bucket_pitr_policy(
				&*udb,
				BucketId::from_gas_id(test_bucket()),
				PitrPolicy {
					interval_ms: 100,
					retention_ms: 2_500,
				},
			)
			.await?;
			let committed_at_ms = current_time_ms()?;
			let bucket_start_ms = committed_at_ms.div_euclid(100) * 100;
			let database_db = make_test_db(&test_ctx)?;
			database_db
				.commit(vec![dirty_page(1, 0x61)], 2, committed_at_ms)
				.await?;
			let database_branch_id = read_database_branch_id(&test_ctx).await?;
			let manager_workflow_id = test_ctx
				.workflow(DbManagerInput::new(database_branch_id, None))
				.tag(
					DATABASE_BRANCH_ID_TAG,
					&database_branch_tag_value(database_branch_id),
				)
				.unique()
				.dispatch()
				.await?;

			force_compaction_and_wait_idle(
				&test_ctx,
				manager_workflow_id,
				database_branch_id,
				Id::new_v1(94),
				ForceCompactionWork {
					hot: true,
					cold: false,
					reclaim: false,
					final_settle: false,
				},
			)
			.await?;

			let coverage =
				read_pitr_interval_coverage(&test_ctx, database_branch_id, bucket_start_ms)
					.await?
					.expect("force hot compaction should publish PITR coverage");
			assert_eq!(coverage.txid, 1);
			let resolved = database_db
				.resolve_restore_target(SnapshotSelector::AtTimestamp {
					timestamp_ms: committed_at_ms,
				})
				.await?;
			assert_eq!(resolved.txid, 1);
			let state = debug::read_at(&database_db, resolved.versionstamp).await?;
			assert_eq!(state.pages[0].bytes.as_deref(), Some(page(0x61).as_slice()));

			wait_until("PITR interval expiry", || async {
				if current_time_ms()? > coverage.expires_at_ms {
					return Ok(Some(()));
				}

				Ok(None)
			})
			.await?;
			let err = database_db
				.resolve_restore_target(SnapshotSelector::AtTimestamp {
					timestamp_ms: committed_at_ms,
				})
				.await
				.expect_err("expired PITR interval should reject timestamp resolution");
			assert_storage_error(&err, SqliteStorageError::RestoreTargetExpired);
			assert!(
				read_pitr_interval_coverage(&test_ctx, database_branch_id, bucket_start_ms)
					.await?
					.is_some()
			);

			test_ctx.shutdown().await?;
			Ok(())
		}
	)
}

#[tokio::test]
async fn e2e_restore_point_remains_readable_after_interval_coverage_expires() -> Result<()> {
	workflow_matrix_with_pitr!(
		"workflow-e2e-restore-point-remains-readable-after-interval-coverage-expires",
		build_registry,
		|_tier, test_ctx| {
			let udb = test_ctx.pools().udb()?;
			set_bucket_pitr_policy(
				&*udb,
				BucketId::from_gas_id(test_bucket()),
				PitrPolicy {
					interval_ms: 100,
					retention_ms: 2_500,
				},
			)
			.await?;
			let committed_at_ms = current_time_ms()?;
			let bucket_start_ms = committed_at_ms.div_euclid(100) * 100;
			let database_db = make_test_db(&test_ctx)?;
			database_db
				.commit(vec![dirty_page(1, 0x62)], 2, committed_at_ms)
				.await?;
			let database_branch_id = read_database_branch_id(&test_ctx).await?;
			let manager_workflow_id = test_ctx
				.workflow(DbManagerInput::new(database_branch_id, None))
				.tag(
					DATABASE_BRANCH_ID_TAG,
					&database_branch_tag_value(database_branch_id),
				)
				.unique()
				.dispatch()
				.await?;

			force_compaction_and_wait_idle(
				&test_ctx,
				manager_workflow_id,
				database_branch_id,
				Id::new_v1(95),
				ForceCompactionWork {
					hot: true,
					cold: false,
					reclaim: false,
					final_settle: false,
				},
			)
			.await?;
			let restore_point = database_db
				.create_restore_point(SnapshotSelector::AtTimestamp {
					timestamp_ms: committed_at_ms,
				})
				.await?;
			let coverage =
				read_pitr_interval_coverage(&test_ctx, database_branch_id, bucket_start_ms)
					.await?
					.expect("force hot compaction should publish PITR coverage");

			wait_until("PITR interval expiry", || async {
				if current_time_ms()? > coverage.expires_at_ms {
					return Ok(Some(()));
				}

				Ok(None)
			})
			.await?;
			let err = database_db
				.resolve_restore_target(SnapshotSelector::AtTimestamp {
					timestamp_ms: committed_at_ms,
				})
				.await
				.expect_err("timestamp selector should expire without interval coverage");
			assert_storage_error(&err, SqliteStorageError::RestoreTargetExpired);
			let resolved = database_db
				.resolve_restore_target(SnapshotSelector::RestorePoint {
					restore_point: restore_point.clone(),
				})
				.await?;
			assert_eq!(resolved.txid, 1);
			let state = debug::read_at(&database_db, resolved.versionstamp).await?;
			assert_eq!(state.pages[0].bytes.as_deref(), Some(page(0x62).as_slice()));
			assert!(
				read_value(
					&test_ctx,
					db_pin_key(
						database_branch_id,
						&history_pin::restore_point_pin_id(&restore_point)
					),
				)
				.await?
				.is_some()
			);

			test_ctx.shutdown().await?;
			Ok(())
		}
	)
}

#[tokio::test]
async fn e2e_fork_and_restore_from_timestamp_selector_read_resolved_commit() -> Result<()> {
	workflow_matrix_with_pitr!(
		"workflow-e2e-fork-and-restore-from-timestamp-selector-read-resolved-commit",
		build_registry,
		|_tier, test_ctx| {
			let udb = test_ctx.pools().udb()?;
			set_bucket_pitr_policy(
				&*udb,
				BucketId::from_gas_id(test_bucket()),
				PitrPolicy {
					interval_ms: FIVE_MINUTES_MS,
					retention_ms: 9_000_000_000_000,
				},
			)
			.await?;
			let base_ms = 1_700_000_000_000_i64.div_euclid(FIVE_MINUTES_MS) * FIVE_MINUTES_MS;
			let database_db = make_test_db(&test_ctx)?;
			database_db
				.commit(vec![dirty_page(1, 0x71)], 2, base_ms + 60_000)
				.await?;
			database_db
				.commit(vec![dirty_page(1, 0x72)], 2, base_ms + 360_000)
				.await?;
			let old_branch_id = read_database_branch_id(&test_ctx).await?;
			let manager_workflow_id = test_ctx
				.workflow(DbManagerInput::new(old_branch_id, None))
				.tag(
					DATABASE_BRANCH_ID_TAG,
					&database_branch_tag_value(old_branch_id),
				)
				.unique()
				.dispatch()
				.await?;

			force_compaction_and_wait_idle(
				&test_ctx,
				manager_workflow_id,
				old_branch_id,
				Id::new_v1(96),
				ForceCompactionWork {
					hot: true,
					cold: false,
					reclaim: false,
					final_settle: false,
				},
			)
			.await?;
			let selector = SnapshotSelector::AtTimestamp {
				timestamp_ms: base_ms + 300_000,
			};
			let resolved = database_db.resolve_restore_target(selector.clone()).await?;
			assert_eq!(resolved.txid, 1);
			assert_eq!(
				debug::read_at(&database_db, resolved.versionstamp)
					.await?
					.pages[0]
					.bytes
					.as_deref(),
				Some(page(0x71).as_slice())
			);

			let forked_database_id = branch::fork_database(
				&*udb,
				BucketId::from_gas_id(test_bucket()),
				TEST_DATABASE.to_string(),
				selector.clone(),
				BucketId::from_gas_id(test_bucket()),
			)
			.await?;
			let forked_db = make_test_db_for(&test_ctx, forked_database_id.clone())?;
			assert_eq!(
				forked_db.get_pages(vec![1]).await?,
				vec![FetchedPage {
					pgno: 1,
					bytes: Some(page(0x71)),
				}]
			);
			let forked_branch_id =
				read_named_database_branch_id(&test_ctx, &forked_database_id).await?;
			let forked_head_at_fork =
				read_value(&test_ctx, branch_meta_head_at_fork_key(forked_branch_id))
					.await?
					.expect("forked branch should store head_at_fork");
			assert_eq!(decode_db_head(&forked_head_at_fork)?.head_txid, 1);

			let undo_restore_point = database_db.restore_database(selector).await?;
			let restored_db = make_test_db(&test_ctx)?;
			assert_eq!(
				restored_db.get_pages(vec![1]).await?,
				vec![FetchedPage {
					pgno: 1,
					bytes: Some(page(0x71)),
				}]
			);
			let restored_branch_id = read_database_branch_id(&test_ctx).await?;
			assert_ne!(restored_branch_id, old_branch_id);
			let restored_head_at_fork =
				read_value(&test_ctx, branch_meta_head_at_fork_key(restored_branch_id))
					.await?
					.expect("restored branch should store head_at_fork");
			assert_eq!(decode_db_head(&restored_head_at_fork)?.head_txid, 1);
			assert!(
				read_value(
					&test_ctx,
					db_pin_key(
						old_branch_id,
						&history_pin::restore_point_pin_id(&undo_restore_point)
					),
				)
				.await?
				.is_some()
			);

			test_ctx.shutdown().await?;
			Ok(())
		}
	)
}

/// A job injected under one PITR policy still succeeds after the policy changes.
///
/// Only the status is asserted. The coverage-target rejection this used to exercise is gone (the
/// companion self-plans coverage per slice), and an injected job plans no slice and writes no
/// interval rows, so there is nothing here from which to observe which interval was used. Interval
/// planning under a changed policy needs its own manager-driven test.
#[tokio::test]
async fn hot_compactor_accepts_a_job_whose_pitr_policy_changed_after_planning() -> Result<()> {
	workflow_matrix_with_pitr!(
		"workflow-hot-compactor-accepts-a-job-whose-pitr-policy-changed",
		build_registry,
		|_tier, test_ctx| {
			let udb = test_ctx.pools().udb()?;
			set_bucket_pitr_policy(
				&*udb,
				BucketId::from_gas_id(test_bucket()),
				PitrPolicy {
					interval_ms: 5,
					retention_ms: 9_000_000_000_000,
				},
			)
			.await?;
			let database_db = make_test_db(&test_ctx)?;
			database_db
				.commit(vec![dirty_page(1, 0x01)], 2, 1_000)
				.await?;
			database_db
				.commit(vec![dirty_page(1, 0x02)], 2, 1_004)
				.await?;
			database_db
				.commit(vec![dirty_page(1, 0x03)], 2, 1_012)
				.await?;
			database_db
				.commit(vec![dirty_page(1, 0x04)], 2, 1_018)
				.await?;
			let database_branch_id = read_database_branch_id(&test_ctx).await?;
			let tag_value = database_branch_tag_value(database_branch_id);
			let manager_workflow_id = test_ctx
				.workflow(DbManagerInput::new(database_branch_id, None))
				.tag(DATABASE_BRANCH_ID_TAG, &tag_value)
				.unique()
				.dispatch()
				.await?;
			let hot_workflow_id =
				wait_for_workflow::<DbHotCompactorWorkflow>(&test_ctx, database_branch_id).await?;
			set_database_pitr_policy_override(
				&*udb,
				BucketId::from_gas_id(test_bucket()),
				TEST_DATABASE,
				PitrPolicy {
					interval_ms: 10,
					retention_ms: 9_000_000_000_000,
				},
			)
			.await?;
			let stale_job_id = Id::new_v1(84);

			let signal_id = test_ctx
				.signal(RunHotJob {
					database_branch_id,
					job_id: stale_job_id,
					job_kind: CompactionJobKind::Hot,
					base_lifecycle_generation: 0,
					base_manifest_generation: 0,
					drain_head_txid: 4,
					drain_now_ms: 1_000,
					bypass_admission: false,
				})
				.to_workflow_id(hot_workflow_id)
				.send()
				.await?
				.expect("signal should target hot compactor workflow");
			wait_for_signal_ack(&test_ctx, signal_id).await?;
			let finished =
				wait_for_hot_job_finished_signal(&test_ctx, manager_workflow_id, stale_job_id)
					.await?;

			assert_eq!(finished.job_id, stale_job_id);
			assert!(
				matches!(finished.status, CompactionJobStatus::Succeeded),
				"unexpected status: {:?}",
				finished.status,
			);

			test_ctx.shutdown().await?;
			Ok(())
		}
	)
}

#[tokio::test]
async fn hot_install_publishes_staged_output_and_stops_at_drain_head_after_concurrent_commit()
-> Result<()> {
	workflow_matrix!(
		"workflow-hot-install-stops-at-drain-head-after-concurrent-commit",
		build_registry,
		|_tier, test_ctx| {
			let database_db = make_test_db(&test_ctx)?;
			database_db
				.commit(vec![dirty_page(1, 0xa1)], 2, 1_001)
				.await?;
			let database_branch_id = read_database_branch_id(&test_ctx).await?;
			let tag_value = database_branch_tag_value(database_branch_id);
			let manager_workflow_id = test_ctx
				.workflow(DbManagerInput::new(database_branch_id, None))
				.tag(DATABASE_BRANCH_ID_TAG, &tag_value)
				.unique()
				.dispatch()
				.await?;
			wait_for_manager_state(
				&test_ctx,
				manager_workflow_id,
				manager_has_distinct_companions,
			)
			.await?;

			let (_pause_guard, reached_hot_stage, release_hot_stage) =
				test_hooks::pause_after_hot_stage(database_branch_id);
			let request_id = Id::new_v1(64);
			let signal_id = test_ctx
				.signal(ForceCompaction {
					database_branch_id,
					request_id,
					requested_work: ForceCompactionWork {
						hot: true,
						cold: false,
						reclaim: false,
						final_settle: false,
					},
				})
				.to_workflow_id(manager_workflow_id)
				.send()
				.await?
				.expect("signal should target manager workflow");
			wait_for_signal_ack(&test_ctx, signal_id).await?;

			tokio::time::timeout(Duration::from_secs(5), reached_hot_stage.notified()).await?;
			let active_hot_job = wait_for_manager_state(&test_ctx, manager_workflow_id, |state| {
				state.active_jobs.hot.is_some()
			})
			.await?
			.active_jobs
			.hot
			.expect("manager should hold the staged hot job active");
			assert_eq!(active_hot_job.input_range.txids.max_txid, 1);
			let staged_rows =
				wait_for_staged_hot_rows(&test_ctx, database_branch_id, active_hot_job.job_id)
					.await?;
			assert!(!staged_rows.is_empty());

			database_db
				.commit(vec![dirty_page(1, 0xa2)], 2, 1_002)
				.await?;
			release_hot_stage.notify_one();
			drop(_pause_guard);

			wait_for_latest_manager_state(&test_ctx, manager_workflow_id, |state| {
				state.active_jobs.hot.is_none()
			})
			.await?;

			// The staged image is a correct fold of everything up to the drain head, so it
			// publishes even though a newer commit landed while it was staged.
			assert!(
				read_shard_version(&test_ctx, database_branch_id, 0, 1)
					.await?
					.is_some()
			);
			// The watermark is deliberately not asserted here. Install pins the head to the drain
			// head captured before staging, but the manager keeps draining afterwards and picks up
			// txid 2 in a later pass, so the watermark observed after the fact is not stable.
			// Page 1's PIDX row was rewritten by the concurrent commit, so install's
			// COMPARE_AND_CLEAR no-ops and the newer page stays owned by its delta.
			assert_eq!(
				database_db.get_pages(vec![1]).await?,
				vec![FetchedPage {
					pgno: 1,
					bytes: Some(page(0xa2)),
				}]
			);

			test_ctx.shutdown().await?;
			Ok(())
		}
	)
}

#[tokio::test]
async fn force_reclaim_waits_for_reclaim_completion() -> Result<()> {
	let database_branch_id = database_branch_id(0x3333_2233_4455_6677_8899_aabb_ccdd_eeff);
	workflow_matrix!(
		"workflow-force-reclaim-waits-for-reclaim-completion",
		build_registry,
		|_tier, test_ctx| {
			let tag_value = database_branch_tag_value(database_branch_id);
			seed_manager_branch(
				&test_ctx,
				database_branch_id,
				1,
				Some(CompactionRoot {
					schema_version: 1,
					manifest_generation: 1,
					hot_watermark_txid: 1,
					cold_watermark_txid: 0,
					cold_watermark_versionstamp: [0; 16],
				}),
				None,
			)
			.await?;
			publish_test_shard_and_clear_pidx(&test_ctx, database_branch_id, 1).await?;

			let manager_workflow_id = test_ctx
				.workflow(DbManagerInput::new(database_branch_id, None))
				.tag(DATABASE_BRANCH_ID_TAG, &tag_value)
				.unique()
				.dispatch()
				.await?;
			let request_id = Id::new_v1(44);
			let result = force_compaction_and_wait_idle(
				&test_ctx,
				manager_workflow_id,
				database_branch_id,
				request_id,
				ForceCompactionWork {
					hot: false,
					cold: false,
					reclaim: true,
					final_settle: false,
				},
			)
			.await?;

			assert_eq!(result.attempted_job_kinds, vec![CompactionJobKind::Reclaim]);
			assert_eq!(result.completed_job_ids.len(), 1);
			assert!(result.terminal_error.is_none());
			assert!(!delta_exists(&test_ctx, database_branch_id, 1).await?);
			assert!(
				read_value(&test_ctx, branch_commit_key(database_branch_id, 1))
					.await?
					.is_none()
			);

			test_ctx.shutdown().await?;
			Ok(())
		}
	)
}

#[tokio::test]
async fn force_reclaim_reports_pidx_safety_gate() -> Result<()> {
	let database_branch_id = database_branch_id(0x3334_2233_4455_6677_8899_aabb_ccdd_eeff);
	workflow_matrix!(
		"workflow-force-reclaim-reports-pidx-safety-gate",
		build_registry,
		|_tier, test_ctx| {
			let tag_value = database_branch_tag_value(database_branch_id);
			seed_manager_branch(
				&test_ctx,
				database_branch_id,
				1,
				Some(CompactionRoot {
					schema_version: 1,
					manifest_generation: 1,
					hot_watermark_txid: 1,
					cold_watermark_txid: 0,
					cold_watermark_versionstamp: [0; 16],
				}),
				None,
			)
			.await?;

			let manager_workflow_id = test_ctx
				.workflow(DbManagerInput::new(database_branch_id, None))
				.tag(DATABASE_BRANCH_ID_TAG, &tag_value)
				.unique()
				.dispatch()
				.await?;
			let result = force_compaction_and_wait_idle(
				&test_ctx,
				manager_workflow_id,
				database_branch_id,
				Id::new_v1(46),
				ForceCompactionWork {
					hot: false,
					cold: false,
					reclaim: true,
					final_settle: false,
				},
			)
			.await?;

			// The lone commit's pages are still owned by a live PIDX entry, so the C6 safety gate withholds
			// it from commit reclaim and its folded-delta gate cannot pass (no materialized shard). There
			// is therefore no actionable reclaim work. The reason names the retained window rather than an
			// empty one, because the scan did read the commit and classified it retained.
			assert!(result.attempted_job_kinds.is_empty());
			assert!(result.completed_job_ids.is_empty());
			assert_eq!(
				result.skipped_noop_reasons,
				vec!["reclaim:window-fully-retained".to_string()]
			);
			assert!(result.terminal_error.is_none());

			test_ctx.shutdown().await?;
			Ok(())
		}
	)
}

#[tokio::test]
async fn e2e_force_hot_compaction_preserves_reads_after_pidx_clear() -> Result<()> {
	workflow_matrix!(
		"workflow-e2e-force-hot-compaction-preserves-reads-after-pidx-clear",
		build_registry,
		|_tier, test_ctx| {
			let database_db = make_test_db(&test_ctx)?;
			database_db
				.commit(vec![dirty_page(1, 0x11), dirty_page(2, 0x22)], 3, 1_001)
				.await?;
			let database_branch_id = read_database_branch_id(&test_ctx).await?;
			let tag_value = database_branch_tag_value(database_branch_id);
			let manager_workflow_id = test_ctx
				.workflow(DbManagerInput::new(database_branch_id, None))
				.tag(DATABASE_BRANCH_ID_TAG, &tag_value)
				.unique()
				.dispatch()
				.await?;

			let result = force_compaction_and_wait_idle(
				&test_ctx,
				manager_workflow_id,
				database_branch_id,
				Id::new_v1(45),
				ForceCompactionWork {
					hot: true,
					cold: false,
					reclaim: false,
					final_settle: false,
				},
			)
			.await?;

			assert_eq!(result.attempted_job_kinds, vec![CompactionJobKind::Hot]);
			assert!(result.terminal_error.is_none());
			assert_eq!(
				database_db.get_pages(vec![1, 2]).await?,
				vec![
					FetchedPage {
						pgno: 1,
						bytes: Some(page(0x11)),
					},
					FetchedPage {
						pgno: 2,
						bytes: Some(page(0x22)),
					},
				]
			);
			assert!(
				read_value(&test_ctx, branch_pidx_key(database_branch_id, 1))
					.await?
					.is_none()
			);
			assert!(
				read_value(&test_ctx, branch_pidx_key(database_branch_id, 2))
					.await?
					.is_none()
			);
			assert!(
				read_shard_version(&test_ctx, database_branch_id, 0, 1)
					.await?
					.is_some()
			);
			let root = read_value(&test_ctx, branch_compaction_root_key(database_branch_id))
				.await?
				.as_deref()
				.map(decode_compaction_root)
				.transpose()?
				.expect("hot force compaction should publish a root");
			assert_eq!(root.hot_watermark_txid, 1);

			test_ctx.shutdown().await?;
			Ok(())
		}
	)
}

#[tokio::test]
async fn e2e_force_reclaim_removes_hot_rows_and_keeps_reads() -> Result<()> {
	workflow_matrix!(
		"workflow-e2e-force-reclaim-removes-hot-rows-and-keeps-reads",
		build_registry,
		|_tier, test_ctx| {
			let database_db = make_test_db(&test_ctx)?;
			database_db
				.commit(vec![dirty_page(1, 0x33)], 2, 1_001)
				.await?;
			let database_branch_id = read_database_branch_id(&test_ctx).await?;
			let commit = read_value(&test_ctx, branch_commit_key(database_branch_id, 1))
				.await?
				.as_deref()
				.map(decode_commit_row)
				.transpose()?
				.expect("commit should exist before reclaim");
			let tag_value = database_branch_tag_value(database_branch_id);
			let manager_workflow_id = test_ctx
				.workflow(DbManagerInput::new(database_branch_id, None))
				.tag(DATABASE_BRANCH_ID_TAG, &tag_value)
				.unique()
				.dispatch()
				.await?;

			force_compaction_and_wait_idle(
				&test_ctx,
				manager_workflow_id,
				database_branch_id,
				Id::new_v1(46),
				ForceCompactionWork {
					hot: true,
					cold: false,
					reclaim: false,
					final_settle: false,
				},
			)
			.await?;
			let result = force_compaction_and_wait_idle(
				&test_ctx,
				manager_workflow_id,
				database_branch_id,
				Id::new_v1(47),
				ForceCompactionWork {
					hot: false,
					cold: false,
					reclaim: true,
					final_settle: false,
				},
			)
			.await?;

			assert!(
				result.attempted_job_kinds.is_empty()
					|| result.attempted_job_kinds == vec![CompactionJobKind::Reclaim]
			);
			assert!(result.terminal_error.is_none());
			assert_eq!(
				database_db.get_pages(vec![1]).await?,
				vec![FetchedPage {
					pgno: 1,
					bytes: Some(page(0x33)),
				}]
			);
			assert!(!delta_exists(&test_ctx, database_branch_id, 1).await?);
			assert!(
				read_value(&test_ctx, branch_commit_key(database_branch_id, 1))
					.await?
					.is_none()
			);
			assert!(
				read_value(
					&test_ctx,
					branch_vtx_key(database_branch_id, commit.versionstamp)
				)
				.await?
				.is_none()
			);
			assert!(
				read_shard_version(&test_ctx, database_branch_id, 0, 1)
					.await?
					.is_some()
			);

			test_ctx.shutdown().await?;
			Ok(())
		}
	)
}

#[tokio::test]
async fn e2e_force_compaction_preserves_exact_restore_point_txid() -> Result<()> {
	workflow_matrix!(
		"workflow-e2e-force-compaction-preserves-exact-restore-point-txid",
		build_registry,
		|_tier, test_ctx| {
			let database_db = make_test_db(&test_ctx)?;
			database_db
				.commit(vec![dirty_page(1, 0x41)], 2, 1_001)
				.await?;
			let restore_point = database_db
				.create_restore_point(depot::types::SnapshotSelector::Latest)
				.await?;
			database_db
				.commit(vec![dirty_page(1, 0x42)], 2, 1_002)
				.await?;
			let database_branch_id = read_database_branch_id(&test_ctx).await?;
			let tag_value = database_branch_tag_value(database_branch_id);
			let manager_workflow_id = test_ctx
				.workflow(DbManagerInput::new(database_branch_id, None))
				.tag(DATABASE_BRANCH_ID_TAG, &tag_value)
				.unique()
				.dispatch()
				.await?;

			force_compaction_and_wait_idle(
				&test_ctx,
				manager_workflow_id,
				database_branch_id,
				Id::new_v1(48),
				ForceCompactionWork {
					hot: true,
					cold: false,
					reclaim: false,
					final_settle: false,
				},
			)
			.await?;
			force_compaction_and_wait_idle(
				&test_ctx,
				manager_workflow_id,
				database_branch_id,
				Id::new_v1(49),
				ForceCompactionWork {
					hot: false,
					cold: false,
					reclaim: true,
					final_settle: false,
				},
			)
			.await?;

			assert_eq!(
				database_db.get_pages(vec![1]).await?,
				vec![FetchedPage {
					pgno: 1,
					bytes: Some(page(0x42)),
				}]
			);
			let pinned_shard = read_shard_version(&test_ctx, database_branch_id, 0, 1)
				.await?
				.expect("pinned txid shard should be published exactly");
			let latest_shard = read_shard_version(&test_ctx, database_branch_id, 0, 2)
				.await?
				.expect("latest txid shard should be published");
			assert_eq!(
				decode_ltx_v3(&pinned_shard)?.get_page(1),
				Some(page(0x41).as_slice())
			);
			assert_eq!(
				decode_ltx_v3(&latest_shard)?.get_page(1),
				Some(page(0x42).as_slice())
			);
			// The delta at the pinned txid is deliberately not required to survive. Its shard image
			// is published at txid 1 (asserted above), so the materialization gate lets the delta
			// reclaim: the image, not the delta, is what carries the pinned read. The commit row
			// below is the part the pin floor must keep.
			assert!(
				read_value(&test_ctx, branch_commit_key(database_branch_id, 1))
					.await?
					.is_some()
			);
			let pin_bytes = read_value(
				&test_ctx,
				db_pin_key(
					database_branch_id,
					&history_pin::restore_point_pin_id(&restore_point),
				),
			)
			.await?
			.expect("restore_point DB_PIN should exist");
			let pin = decode_db_history_pin(&pin_bytes)?;
			assert_eq!(pin.kind, DbHistoryPinKind::RestorePoint);
			assert_eq!(pin.at_txid, 1);

			test_ctx.shutdown().await?;
			Ok(())
		}
	)
}

#[tokio::test]
async fn e2e_force_reclaim_materializes_bucket_fork_pin() -> Result<()> {
	workflow_matrix!(
		"workflow-e2e-force-reclaim-materializes-bucket-fork-pin",
		build_registry,
		|_tier, test_ctx| {
			let database_db = make_test_db(&test_ctx)?;
			database_db
				.commit(vec![dirty_page(1, 0x51)], 2, 1_001)
				.await?;
			let database_branch_id = read_database_branch_id(&test_ctx).await?;
			let source_bucket_branch_id = read_bucket_branch_id(&test_ctx).await?;
			let fork_commit = read_value(&test_ctx, branch_commit_key(database_branch_id, 1))
				.await?
				.as_deref()
				.map(decode_commit_row)
				.transpose()?
				.expect("fork-point commit should exist");
			let udb_pool = test_ctx.pools().udb()?;
			let udb = Arc::new((*udb_pool).clone());
			let forked_bucket = branch::fork_bucket(
				udb.as_ref(),
				BucketId::from_gas_id(test_bucket()),
				ResolvedVersionstamp {
					versionstamp: fork_commit.versionstamp,
					restore_point: None,
				},
			)
			.await?;
			database_db
				.commit(vec![dirty_page(1, 0x52)], 2, 1_002)
				.await?;
			let tag_value = database_branch_tag_value(database_branch_id);
			let manager_workflow_id = test_ctx
				.workflow(DbManagerInput::new(database_branch_id, None))
				.tag(DATABASE_BRANCH_ID_TAG, &tag_value)
				.unique()
				.dispatch()
				.await?;

			force_compaction_and_wait_idle(
				&test_ctx,
				manager_workflow_id,
				database_branch_id,
				Id::new_v1(50),
				ForceCompactionWork {
					hot: true,
					cold: false,
					reclaim: false,
					final_settle: false,
				},
			)
			.await?;
			let result = force_compaction_and_wait_idle(
				&test_ctx,
				manager_workflow_id,
				database_branch_id,
				Id::new_v1(51),
				ForceCompactionWork {
					hot: false,
					cold: false,
					reclaim: true,
					final_settle: false,
				},
			)
			.await?;

			assert!(
				result.attempted_job_kinds.is_empty()
					|| result.attempted_job_kinds == vec![CompactionJobKind::Reclaim]
			);
			assert!(result.terminal_error.is_none());
			assert_eq!(
				database_db.get_pages(vec![1]).await?,
				vec![FetchedPage {
					pgno: 1,
					bytes: Some(page(0x52)),
				}]
			);
			let forked_bucket_branch_id = udb
				.txn(
					"test_depotworkflow_compaction_skeletons",
					move |tx| async move {
						branch::resolve_bucket_branch(
							&tx,
							forked_bucket,
							universaldb::utils::IsolationLevel::Serializable,
						)
						.await?
						.ok_or_else(|| anyhow::anyhow!("forked bucket branch should exist"))
					},
				)
				.await?;
			assert!(
				read_value(
					&test_ctx,
					bucket_fork_pin_key(
						source_bucket_branch_id,
						fork_commit.versionstamp,
						forked_bucket_branch_id,
					),
				)
				.await?
				.is_some()
			);
			let pin_bytes = read_value(
				&test_ctx,
				db_pin_key(
					database_branch_id,
					&history_pin::bucket_fork_pin_id(forked_bucket_branch_id),
				),
			)
			.await?
			.expect("bucket-derived DB_PIN should be materialized");
			let pin = decode_db_history_pin(&pin_bytes)?;
			assert_eq!(pin.kind, DbHistoryPinKind::BucketFork);
			assert_eq!(pin.at_txid, 1);
			// The bucket-fork pin at txid 1 is served by the materialized shard version, so C6 reclaims
			// the now-redundant folded delta while the pinned read stays satisfiable from `SHARD/0/1`.
			assert!(!delta_exists(&test_ctx, database_branch_id, 1).await?);
			assert!(
				read_shard_version(&test_ctx, database_branch_id, 0, 1)
					.await?
					.is_some()
			);

			test_ctx.shutdown().await?;
			Ok(())
		}
	)
}

/// Writes a cold shard ref with no reachable object, which is what a branch carries after it was
/// compacted by an enterprise build. The read path must treat it as coverage it cannot resolve.
async fn seed_workflow_cold_ref(
	test_ctx: &TestCtx,
	database_branch_id: DatabaseBranchId,
	shard_id: u32,
	as_of_txid: u64,
	publish_generation: u64,
	object_key: String,
	bytes: Vec<u8>,
) -> Result<()> {
	let mut versionstamp = [0; 16];
	versionstamp[8..16].copy_from_slice(&as_of_txid.to_be_bytes());
	let cold_ref = ColdShardRef {
		object_key,
		object_generation_id: Id::new_v1(u16::try_from(as_of_txid).unwrap_or(u16::MAX)),
		shard_id,
		as_of_txid,
		min_txid: as_of_txid,
		max_txid: as_of_txid,
		min_versionstamp: versionstamp,
		max_versionstamp: versionstamp,
		size_bytes: u64::try_from(bytes.len()).unwrap_or(u64::MAX),
		content_hash: sha256(&bytes),
		publish_generation,
	};

	let db = test_ctx.pools().udb()?;
	db.txn("test_depotworkflow_compaction_skeletons", move |tx| {
		let cold_ref = cold_ref.clone();
		async move {
			tx.informal().set(
				&branch_compaction_cold_shard_key(database_branch_id, shard_id, as_of_txid),
				&encode_cold_shard_ref(cold_ref)?,
			);
			Ok(())
		}
	})
	.await
}

#[tokio::test]
async fn cold_disabled_read_missing_fdb_shard_returns_error() -> Result<()> {
	let mut test_ctx = TestCtx::new(build_registry()).await?;
	let database_db = make_test_db(&test_ctx)?;
	database_db
		.commit(vec![dirty_page(1, 0x43)], 2, 1_001)
		.await?;
	let database_branch_id = read_database_branch_id(&test_ctx).await?;
	let tag_value = database_branch_tag_value(database_branch_id);
	let manager_workflow_id = test_ctx
		.workflow(DbManagerInput::new(database_branch_id, None))
		.tag(DATABASE_BRANCH_ID_TAG, &tag_value)
		.unique()
		.dispatch()
		.await?;

	force_compaction_and_wait_idle(
		&test_ctx,
		manager_workflow_id,
		database_branch_id,
		Id::new_v1(155),
		ForceCompactionWork {
			hot: true,
			cold: false,
			reclaim: false,
			final_settle: false,
		},
	)
	.await?;
	let shard_bytes = read_shard_version(&test_ctx, database_branch_id, 0, 1)
		.await?
		.expect("hot compaction should publish FDB shard coverage");
	let root = read_value(&test_ctx, branch_compaction_root_key(database_branch_id))
		.await?
		.as_deref()
		.map(decode_compaction_root)
		.transpose()?
		.expect("hot compaction should publish root");
	seed_workflow_cold_ref(
		&test_ctx,
		database_branch_id,
		0,
		1,
		root.manifest_generation,
		"db/cold-disabled/unreachable-shard.ltx".to_string(),
		shard_bytes,
	)
	.await?;
	clear_shard_version(&test_ctx, database_branch_id, 0, 1).await?;

	let missing = database_db.get_pages(vec![1]).await;
	assert_storage_error(
		&missing.expect_err(
			"cold-disabled reads must fail when the authoritative FDB shard is missing",
		),
		SqliteStorageError::ShardCoverageMissing { pgno: 1 },
	);

	test_ctx.shutdown().await?;
	Ok(())
}

#[tokio::test]
async fn stale_pidx_missing_delta_falls_back_to_fdb_shard() -> Result<()> {
	workflow_matrix!(
		"workflow-stale-pidx-missing-delta-falls-back-to-fdb-shard",
		build_registry,
		|_tier, test_ctx| {
			let database_db = make_test_db(&test_ctx)?;
			database_db
				.commit(vec![dirty_page(1, 0xa6)], 2, 1_001)
				.await?;
			let database_branch_id = read_database_branch_id(&test_ctx).await?;
			let manager_workflow_id = test_ctx
				.workflow(DbManagerInput::new(database_branch_id, None))
				.tag(
					DATABASE_BRANCH_ID_TAG,
					&database_branch_tag_value(database_branch_id),
				)
				.unique()
				.dispatch()
				.await?;

			force_compaction_and_wait_idle(
				&test_ctx,
				manager_workflow_id,
				database_branch_id,
				Id::new_v1(201),
				ForceCompactionWork {
					hot: true,
					cold: false,
					reclaim: false,
					final_settle: false,
				},
			)
			.await?;
			set_test_pidx(&test_ctx, database_branch_id, 1).await?;
			test_ctx.pools().udb()?;
			clear_delta(&test_ctx, database_branch_id, 1).await?;

			assert!(
				read_value(&test_ctx, branch_pidx_key(database_branch_id, 1))
					.await?
					.is_some()
			);
			assert!(!delta_exists(&test_ctx, database_branch_id, 1).await?);
			assert!(
				read_shard_version(&test_ctx, database_branch_id, 0, 1)
					.await?
					.is_some()
			);
			assert_eq!(
				database_db.get_pages(vec![1]).await?,
				vec![FetchedPage {
					pgno: 1,
					bytes: Some(page(0xa6)),
				}]
			);

			test_ctx.shutdown().await?;
			Ok(())
		}
	)
}

#[tokio::test]
async fn e2e_workflow_compacts_reclaims_multiple_deltas_and_keeps_reads() -> Result<()> {
	workflow_matrix!(
		"workflow-e2e-workflow-compacts-reclaims-multiple-deltas-and-keeps-reads",
		build_registry,
		|_tier, test_ctx| {
			let database_db = make_test_db(&test_ctx)?;
			let mut commits = Vec::new();
			for txid in 1..=3 {
				database_db
					.commit(
						vec![dirty_page(1, 0x70 + u8::try_from(txid).unwrap_or(u8::MAX))],
						2,
						1_000 + i64::try_from(txid).unwrap_or(i64::MAX),
					)
					.await?;
			}
			let database_branch_id = read_database_branch_id(&test_ctx).await?;
			for txid in 1..=3 {
				let commit = read_value(&test_ctx, branch_commit_key(database_branch_id, txid))
					.await?
					.as_deref()
					.map(decode_commit_row)
					.transpose()?
					.expect("commit row should exist before reclaim");
				commits.push((txid, commit));
			}
			let tag_value = database_branch_tag_value(database_branch_id);
			let manager_workflow_id = test_ctx
				.workflow(DbManagerInput::new(database_branch_id, None))
				.tag(DATABASE_BRANCH_ID_TAG, &tag_value)
				.unique()
				.dispatch()
				.await?;

			let hot_result = force_compaction_and_wait_idle(
				&test_ctx,
				manager_workflow_id,
				database_branch_id,
				Id::new_v1(60),
				ForceCompactionWork {
					hot: true,
					cold: false,
					reclaim: false,
					final_settle: false,
				},
			)
			.await?;
			let reclaim_result = force_compaction_and_wait_idle(
				&test_ctx,
				manager_workflow_id,
				database_branch_id,
				Id::new_v1(61),
				ForceCompactionWork {
					hot: false,
					cold: false,
					reclaim: true,
					final_settle: false,
				},
			)
			.await?;

			assert_eq!(hot_result.attempted_job_kinds, vec![CompactionJobKind::Hot]);
			assert!(hot_result.terminal_error.is_none());
			assert!(
				reclaim_result.attempted_job_kinds.is_empty()
					|| reclaim_result.attempted_job_kinds == vec![CompactionJobKind::Reclaim]
			);
			assert!(reclaim_result.terminal_error.is_none());
			assert_eq!(
				database_db.get_pages(vec![1]).await?,
				vec![FetchedPage {
					pgno: 1,
					bytes: Some(page(0x73)),
				}]
			);
			for (txid, commit) in commits {
				assert!(
					read_value(
						&test_ctx,
						branch_delta_chunk_key(database_branch_id, txid, 0)
					)
					.await?
					.is_none()
				);
				assert!(
					read_value(&test_ctx, branch_commit_key(database_branch_id, txid))
						.await?
						.is_none()
				);
				assert!(
					read_value(
						&test_ctx,
						branch_vtx_key(database_branch_id, commit.versionstamp)
					)
					.await?
					.is_none()
				);
			}
			let root = read_value(&test_ctx, branch_compaction_root_key(database_branch_id))
				.await?
				.as_deref()
				.map(decode_compaction_root)
				.transpose()?
				.expect("hot compaction should publish a root");
			assert_eq!(root.hot_watermark_txid, 3);
			// Cold-off leaves the cold watermark at zero with no cold refs; cold-on archived the head fold
			// before reclaim, so the cold watermark advanced and the live head shard keeps its cold ref.
			let cold_shard_refs = read_prefix_values(
				&test_ctx,
				branch_compaction_cold_shard_prefix(database_branch_id),
			)
			.await?
			.len();
			assert_eq!(root.cold_watermark_txid, 0);
			assert_eq!(cold_shard_refs, 0);
			assert!(
				read_shard_version(&test_ctx, database_branch_id, 0, 3)
					.await?
					.is_some()
			);

			test_ctx.shutdown().await?;
			Ok(())
		}
	)
}

#[tokio::test]
async fn e2e_workflow_rejects_stale_hot_work_then_stops_on_branch_deletion() -> Result<()> {
	workflow_matrix!(
		"workflow-e2e-workflow-rejects-stale-hot-work-then-stops-on-branch-deletion",
		build_registry,
		|_tier, test_ctx| {
			let database_db = make_test_db(&test_ctx)?;
			database_db
				.commit(vec![dirty_page(1, 0x91)], 2, 1_001)
				.await?;
			let database_branch_id = read_database_branch_id(&test_ctx).await?;
			update_branch_lifecycle(&test_ctx, database_branch_id, BranchState::Live, 1).await?;
			let tag_value = database_branch_tag_value(database_branch_id);
			let manager_workflow_id = test_ctx
				.workflow(DbManagerInput::new(database_branch_id, None))
				.tag(DATABASE_BRANCH_ID_TAG, &tag_value)
				.unique()
				.dispatch()
				.await?;
			let hot_workflow_id =
				wait_for_workflow::<DbHotCompactorWorkflow>(&test_ctx, database_branch_id).await?;
			let reclaimer_workflow_id =
				wait_for_workflow::<DbReclaimerWorkflow>(&test_ctx, database_branch_id).await?;
			let stale_job_id = Id::new_v1(67);

			let signal_id = test_ctx
				.signal(RunHotJob {
					database_branch_id,
					job_id: stale_job_id,
					job_kind: CompactionJobKind::Hot,
					base_lifecycle_generation: 0,
					base_manifest_generation: 0,
					drain_head_txid: 1,
					drain_now_ms: 1_000,
					bypass_admission: false,
				})
				.to_workflow_id(hot_workflow_id)
				.send()
				.await?
				.expect("signal should target hot compactor workflow");
			wait_for_signal_ack(&test_ctx, signal_id).await?;

			let staged_rows = read_prefix_values(
				&test_ctx,
				branch_compaction_stage_hot_shard_prefix(database_branch_id, stale_job_id),
			)
			.await?;
			assert!(staged_rows.is_empty());

			clear_branch_record(&test_ctx, database_branch_id).await?;
			let signal_id = test_ctx
				.signal(DestroyDatabaseBranch {
					database_branch_id,
					lifecycle_generation: 1,
					requested_at_ms: 1_714_000_000_002,
					reason: "test e2e branch deletion".into(),
				})
				.to_workflow_id(manager_workflow_id)
				.send()
				.await?
				.expect("signal should target manager workflow");
			wait_for_signal_ack(&test_ctx, signal_id).await?;

			wait_for_workflow_state(&test_ctx, manager_workflow_id, WorkflowState::Complete)
				.await?;
			wait_for_workflow_state(&test_ctx, hot_workflow_id, WorkflowState::Complete).await?;
			wait_for_workflow_state(&test_ctx, reclaimer_workflow_id, WorkflowState::Complete)
				.await?;
			assert!(
				read_shard_version(&test_ctx, database_branch_id, 0, 1)
					.await?
					.is_none()
			);

			test_ctx.shutdown().await?;
			Ok(())
		}
	)
}

#[tokio::test]
async fn hot_install_consumes_staged_output_and_leaves_no_orphan_rows() -> Result<()> {
	let database_branch_id = database_branch_id(0x4040_2233_4455_6677_8899_aabb_ccdd_eeff);
	workflow_matrix!(
		"workflow-hot-install-consumes-staged-output-and-leaves-no-orphan-rows",
		build_registry,
		|_tier, test_ctx| {
			let tag_value = database_branch_tag_value(database_branch_id);
			seed_manager_branch(
				&test_ctx,
				database_branch_id,
				quota_threshold_head(),
				None,
				Some(SqliteCmpDirty {
					observed_head_txid: quota_threshold_head(),
					updated_at_ms: 1_714_000_000_000,
				}),
			)
			.await?;

			let manager_workflow_id = test_ctx
				.workflow(DbManagerInput::new(database_branch_id, None))
				.tag(DATABASE_BRANCH_ID_TAG, &tag_value)
				.unique()
				.dispatch()
				.await?;
			wake_manager(&test_ctx, manager_workflow_id, database_branch_id).await?;
			let hot_workflow_id =
				wait_for_workflow::<DbHotCompactorWorkflow>(&test_ctx, database_branch_id).await?;
			let run_hot_job = wait_for_run_hot_job(&test_ctx, hot_workflow_id).await?;
			let first_staged_rows =
				wait_for_staged_hot_rows(&test_ctx, database_branch_id, run_hot_job.job_id).await?;

			assert_eq!(first_staged_rows.len(), 1);
			wait_for_hot_install(&test_ctx, database_branch_id, quota_threshold_head()).await?;
			assert_eq!(
				read_value(&test_ctx, branch_pidx_key(database_branch_id, 1)).await?,
				None
			);

			// Staging is scratch: install copies the staged blobs into their shard versions and the
			// reclaimer sweeps what is left, so a completed job must leave no rows behind. A leak
			// here is unreferenced FDB bytes that nothing else ever collects.
			let staged_rows_after_install = read_prefix_values(
				&test_ctx,
				branch_compaction_stage_hot_shard_prefix(database_branch_id, run_hot_job.job_id),
			)
			.await?;
			assert!(
				staged_rows_after_install.is_empty(),
				"install must leave no staged rows, found {}",
				staged_rows_after_install.len(),
			);

			test_ctx.shutdown().await?;
			Ok(())
		}
	)
}

#[tokio::test]
async fn hot_compactor_rejects_stale_base_generation_without_staging() -> Result<()> {
	let database_branch_id = database_branch_id(0x5050_2233_4455_6677_8899_aabb_ccdd_eeff);
	workflow_matrix!(
		"workflow-hot-compactor-rejects-stale-base-generation-without-staging",
		build_registry,
		|_tier, test_ctx| {
			let tag_value = database_branch_tag_value(database_branch_id);
			seed_manager_branch(
				&test_ctx,
				database_branch_id,
				1,
				Some(CompactionRoot {
					schema_version: 1,
					manifest_generation: 2,
					hot_watermark_txid: 0,
					cold_watermark_txid: 0,
					cold_watermark_versionstamp: [0; 16],
				}),
				None,
			)
			.await?;

			let _manager_workflow_id = test_ctx
				.workflow(DbManagerInput::new(database_branch_id, None))
				.tag(DATABASE_BRANCH_ID_TAG, &tag_value)
				.unique()
				.dispatch()
				.await?;
			let hot_workflow_id =
				wait_for_workflow::<DbHotCompactorWorkflow>(&test_ctx, database_branch_id).await?;
			let stale_job_id = Id::new_v1(42);
			let signal_id = test_ctx
				.signal(RunHotJob {
					database_branch_id,
					job_id: stale_job_id,
					job_kind: CompactionJobKind::Hot,
					base_lifecycle_generation: 0,
					base_manifest_generation: 1,
					drain_head_txid: 1,
					drain_now_ms: 1_000,
					bypass_admission: false,
				})
				.to_workflow_id(hot_workflow_id)
				.send()
				.await?
				.expect("signal should target hot compactor workflow");
			wait_for_signal_ack(&test_ctx, signal_id).await?;

			let staged_rows = read_prefix_values(
				&test_ctx,
				branch_compaction_stage_hot_shard_prefix(database_branch_id, stale_job_id),
			)
			.await?;
			assert!(staged_rows.is_empty());

			test_ctx.shutdown().await?;
			Ok(())
		}
	)
}

#[tokio::test]
async fn hot_compactor_rejects_stale_lifecycle_generation_without_staging() -> Result<()> {
	let database_branch_id = database_branch_id(0x5051_2233_4455_6677_8899_aabb_ccdd_eeff);
	workflow_matrix!(
		"workflow-hot-compactor-rejects-stale-lifecycle-generation-without-staging",
		build_registry,
		|_tier, test_ctx| {
			let tag_value = database_branch_tag_value(database_branch_id);
			seed_manager_branch(
				&test_ctx,
				database_branch_id,
				1,
				Some(CompactionRoot {
					schema_version: 1,
					manifest_generation: 0,
					hot_watermark_txid: 0,
					cold_watermark_txid: 0,
					cold_watermark_versionstamp: [0; 16],
				}),
				None,
			)
			.await?;
			update_branch_lifecycle(&test_ctx, database_branch_id, BranchState::Live, 1).await?;

			let _manager_workflow_id = test_ctx
				.workflow(DbManagerInput::new(database_branch_id, None))
				.tag(DATABASE_BRANCH_ID_TAG, &tag_value)
				.unique()
				.dispatch()
				.await?;
			let hot_workflow_id =
				wait_for_workflow::<DbHotCompactorWorkflow>(&test_ctx, database_branch_id).await?;
			let stale_job_id = Id::new_v1(43);
			let signal_id = test_ctx
				.signal(RunHotJob {
					database_branch_id,
					job_id: stale_job_id,
					job_kind: CompactionJobKind::Hot,
					base_lifecycle_generation: 0,
					base_manifest_generation: 0,
					drain_head_txid: 1,
					drain_now_ms: 1_000,
					bypass_admission: false,
				})
				.to_workflow_id(hot_workflow_id)
				.send()
				.await?
				.expect("signal should target hot compactor workflow");
			wait_for_signal_ack(&test_ctx, signal_id).await?;

			let staged_rows = read_prefix_values(
				&test_ctx,
				branch_compaction_stage_hot_shard_prefix(database_branch_id, stale_job_id),
			)
			.await?;
			assert!(staged_rows.is_empty());

			test_ctx.shutdown().await?;
			Ok(())
		}
	)
}

#[tokio::test]
async fn manager_schedules_cleanup_for_stale_hot_output() -> Result<()> {
	let database_branch_id = database_branch_id(0x5052_2233_4455_6677_8899_aabb_ccdd_eeff);
	workflow_matrix!(
		"workflow-manager-schedules-cleanup-for-stale-hot-output",
		build_registry,
		|_tier, test_ctx| {
			let tag_value = database_branch_tag_value(database_branch_id);
			seed_manager_branch(
				&test_ctx,
				database_branch_id,
				0,
				Some(CompactionRoot {
					schema_version: 1,
					manifest_generation: 1,
					hot_watermark_txid: 0,
					cold_watermark_txid: 0,
					cold_watermark_versionstamp: [0; 16],
				}),
				None,
			)
			.await?;
			update_branch_lifecycle(&test_ctx, database_branch_id, BranchState::Live, 7).await?;

			let manager_workflow_id = test_ctx
				.workflow(DbManagerInput::new(database_branch_id, None))
				.tag(DATABASE_BRANCH_ID_TAG, &tag_value)
				.unique()
				.dispatch()
				.await?;
			let reclaimer_workflow_id =
				wait_for_workflow::<DbReclaimerWorkflow>(&test_ctx, database_branch_id).await?;
			// A freshly dispatched manager blocks on its signal listener until its first signal, the
			// same reason `compaction_backfill` wakes every manager it dispatches. Without a wake it
			// never runs the refresh that observes the branch lifecycle.
			let wake_signal_id = test_ctx
				.signal(DeltasAvailable {
					database_branch_id,
					observed_head_txid: 1,
					dirty_updated_at_ms: 1_714_000_000_000,
				})
				.to_workflow_id(manager_workflow_id)
				.send()
				.await?
				.expect("signal should target manager workflow");
			wait_for_signal_ack(&test_ctx, wake_signal_id).await?;
			wait_for_manager_state(&test_ctx, manager_workflow_id, |state| {
				state.last_observed_branch_lifecycle_generation == Some(7)
			})
			.await?;
			let stale_job_id = Id::new_v1(52);
			let staged_blob = encode_ltx_v3(
				LtxHeader::delta(1, 1, 1_001),
				&[DirtyPage {
					pgno: 1,
					bytes: page(9),
				}],
			)?;
			let output_ref = HotShardOutputRef {
				shard_id: 0,
				as_of_txid: 1,
				min_txid: 1,
				max_txid: 1,
				size_bytes: u64::try_from(staged_blob.len()).unwrap_or(u64::MAX),
				content_hash: sha256(&staged_blob),
			};
			test_ctx
				.pools()
				.udb()?
				.txn("test_depotworkflow_compaction_skeletons", {
					let staged_blob = staged_blob.clone();
					let output_ref = output_ref.clone();
					move |tx| {
						let staged_blob = staged_blob.clone();
						async move {
							tx.informal().set(
								&branch_compaction_stage_hot_shard_key(
									database_branch_id,
									stale_job_id,
									0,
									1,
									0,
								),
								&staged_blob,
							);
							tx.informal().set(
								&branch_compaction_stage_hot_ref_key(
									database_branch_id,
									stale_job_id,
									output_ref.min_txid,
									output_ref.shard_id,
									output_ref.as_of_txid,
								),
								&encode_staged_hot_shard_ref(StagedHotShardRef {
									shard_id: output_ref.shard_id,
									as_of_txid: output_ref.as_of_txid,
									min_txid: output_ref.min_txid,
									size_bytes: output_ref.size_bytes,
									content_hash: output_ref.content_hash,
								})?,
							);
							Ok(())
						}
					}
				})
				.await?;

			let signal_id = test_ctx
				.signal(HotJobFinished {
					database_branch_id,
					job_id: stale_job_id,
					job_kind: CompactionJobKind::Hot,
					base_manifest_generation: 1,
					status: CompactionJobStatus::Succeeded,
				})
				.to_workflow_id(manager_workflow_id)
				.send()
				.await?
				.expect("signal should target manager workflow");
			wait_for_signal_ack(&test_ctx, signal_id).await?;
			let repair_job = wait_for_run_reclaim_job(&test_ctx, reclaimer_workflow_id).await?;
			assert_eq!(repair_job.base_lifecycle_generation, 7);
			assert_eq!(repair_job.input_range.stale_hot_job_ids, vec![stale_job_id]);

			wait_for_stage_row_cleared(&test_ctx, database_branch_id, stale_job_id).await?;
			let manager_state =
				wait_for_latest_manager_state(&test_ctx, manager_workflow_id, |state| {
					state.active_jobs.reclaim.is_none()
				})
				.await?;
			assert!(manager_state.active_jobs.reclaim.is_none());

			test_ctx.shutdown().await?;
			Ok(())
		}
	)
}

#[tokio::test]
async fn manager_sweeps_staging_no_job_signal_ever_reported() -> Result<()> {
	let database_branch_id = database_branch_id(0x5054_2233_4455_6677_8899_aabb_ccdd_eeff);
	workflow_matrix!(
		"workflow-manager-sweeps-orphaned-staging",
		build_registry,
		|_tier, test_ctx| {
			let tag_value = database_branch_tag_value(database_branch_id);
			seed_manager_branch(
				&test_ctx,
				database_branch_id,
				0,
				Some(CompactionRoot {
					schema_version: 1,
					manifest_generation: 1,
					hot_watermark_txid: 0,
					cold_watermark_txid: 0,
					cold_watermark_versionstamp: [0; 16],
				}),
				None,
			)
			.await?;
			update_branch_lifecycle(&test_ctx, database_branch_id, BranchState::Live, 7).await?;

			// Staging with no corresponding job and no completion signal: the shape left behind by
			// every cleanup request that was dropped before the pending queue existed. Nothing in the
			// manager's state points at this job, so only a scan of the staging prefix can find it.
			let orphan_job_id = Id::new_v1(54);
			let staged_blob = encode_ltx_v3(
				LtxHeader::delta(1, 1, 1_001),
				&[DirtyPage {
					pgno: 1,
					bytes: page(9),
				}],
			)?;
			let size_bytes = u64::try_from(staged_blob.len()).unwrap_or(u64::MAX);
			let content_hash = sha256(&staged_blob);
			test_ctx
				.pools()
				.udb()?
				.txn("test_depotworkflow_compaction_skeletons", {
					let staged_blob = staged_blob.clone();
					move |tx| {
						let staged_blob = staged_blob.clone();
						async move {
							tx.informal().set(
								&branch_compaction_stage_hot_shard_key(
									database_branch_id,
									orphan_job_id,
									0,
									1,
									0,
								),
								&staged_blob,
							);
							tx.informal().set(
								&branch_compaction_stage_hot_ref_key(
									database_branch_id,
									orphan_job_id,
									1,
									0,
									1,
								),
								&encode_staged_hot_shard_ref(StagedHotShardRef {
									shard_id: 0,
									as_of_txid: 1,
									min_txid: 1,
									size_bytes,
									content_hash,
								})?,
							);
							Ok(())
						}
					}
				})
				.await?;

			let manager_workflow_id = test_ctx
				.workflow(DbManagerInput::new(database_branch_id, None))
				.tag(DATABASE_BRANCH_ID_TAG, &tag_value)
				.unique()
				.dispatch()
				.await?;
			let reclaimer_workflow_id =
				wait_for_workflow::<DbReclaimerWorkflow>(&test_ctx, database_branch_id).await?;

			// A freshly dispatched manager blocks on its signal listener until its first signal, the
			// same reason `compaction_backfill` wakes every manager it dispatches. The refresh that
			// wake drives is what scans the staging prefix.
			let signal_id = test_ctx
				.signal(DeltasAvailable {
					database_branch_id,
					observed_head_txid: 1,
					dirty_updated_at_ms: 1_714_000_000_000,
				})
				.to_workflow_id(manager_workflow_id)
				.send()
				.await?
				.expect("signal should target manager workflow");
			wait_for_signal_ack(&test_ctx, signal_id).await?;
			wait_for_manager_state(&test_ctx, manager_workflow_id, |state| {
				state.last_observed_branch_lifecycle_generation == Some(7)
			})
			.await?;

			let repair_job = wait_for_run_reclaim_job(&test_ctx, reclaimer_workflow_id).await?;
			assert_eq!(
				repair_job.input_range.stale_hot_job_ids,
				vec![orphan_job_id]
			);
			wait_for_stage_row_cleared(&test_ctx, database_branch_id, orphan_job_id).await?;

			test_ctx.shutdown().await?;
			Ok(())
		}
	)
}

#[tokio::test]
async fn manager_publishes_hot_output_and_reads_through_shard_after_pidx_clear() -> Result<()> {
	workflow_matrix!(
		"workflow-manager-publishes-hot-output-and-reads-through-shard-after-pidx-clear",
		build_registry,
		|_tier, test_ctx| {
			let udb_pool = test_ctx.pools().udb()?;
			let udb = Arc::new((*udb_pool).clone());
			let database_db = Db::new(udb, test_bucket(), TEST_DATABASE.to_string(), NodeId::new());

			for txid in 1..=quota_threshold_head() {
				database_db
					.commit(
						vec![dirty_page(1, u8::try_from(txid).unwrap_or(u8::MAX))],
						1,
						1_000 + i64::try_from(txid).unwrap_or(i64::MAX),
					)
					.await?;
			}
			let database_branch_id = read_database_branch_id(&test_ctx).await?;
			let tag_value = database_branch_tag_value(database_branch_id);

			let manager_workflow_id = test_ctx
				.workflow(DbManagerInput::new(database_branch_id, None))
				.tag(DATABASE_BRANCH_ID_TAG, &tag_value)
				.unique()
				.dispatch()
				.await?;

			// The manager is event-driven: `Db::new` has no compaction signaler, so the commits above
			// did not wake it. Send the `DeltasAvailable` the production signaler would send so the
			// manager refreshes and plans hot compaction.
			test_ctx
				.signal(DeltasAvailable {
					database_branch_id,
					observed_head_txid: quota_threshold_head(),
					dirty_updated_at_ms: 1_714_000_000_000,
				})
				.to_workflow_id(manager_workflow_id)
				.send()
				.await?
				.expect("signal should target manager workflow");

			wait_for_hot_install(&test_ctx, database_branch_id, quota_threshold_head()).await?;
			let manager_state =
				wait_for_latest_manager_state(&test_ctx, manager_workflow_id, |state| {
					state.active_jobs.hot.is_none()
				})
				.await?;

			assert!(manager_state.active_jobs.hot.is_none());
			assert_eq!(
				database_db.get_pages(vec![1]).await?,
				vec![FetchedPage {
					pgno: 1,
					bytes: Some(page(
						u8::try_from(quota_threshold_head()).unwrap_or(u8::MAX)
					)),
				}]
			);

			test_ctx.shutdown().await?;
			Ok(())
		}
	)
}

#[tokio::test]
async fn manager_hot_planning_materializes_exact_pinned_txid() -> Result<()> {
	let database_branch_id = database_branch_id(0x6060_2233_4455_6677_8899_aabb_ccdd_eeff);
	workflow_matrix!(
		"workflow-manager-hot-planning-materializes-exact-pinned-txid",
		build_registry,
		|_tier, test_ctx| {
			let tag_value = database_branch_tag_value(database_branch_id);
			seed_manager_branch(
				&test_ctx,
				database_branch_id,
				100,
				None,
				Some(SqliteCmpDirty {
					observed_head_txid: 100,
					updated_at_ms: 1_714_000_000_000,
				}),
			)
			.await?;
			let _restore_point =
				seed_restore_point_db_pin(&test_ctx, database_branch_id, 50).await?;

			let manager_workflow_id = test_ctx
				.workflow(DbManagerInput::new(database_branch_id, None))
				.tag(DATABASE_BRANCH_ID_TAG, &tag_value)
				.unique()
				.dispatch()
				.await?;
			wake_manager(&test_ctx, manager_workflow_id, database_branch_id).await?;
			let hot_workflow_id =
				wait_for_workflow::<DbHotCompactorWorkflow>(&test_ctx, database_branch_id).await?;
			let run_hot_job = wait_for_run_hot_job(&test_ctx, hot_workflow_id).await?;

			// The manager pins the drain head; the companion self-plans coverage per slice. The pinned
			// txid 50 coverage is asserted below via the published shard at txid 50.
			//
			// The head is snapped down to a `HOT_DRAIN_HEAD_GRAIN_TXIDS` boundary, which is what makes
			// an abandoned drain's successor pick the same boundaries. Derived from the constant rather
			// than written out, so changing the grain does not silently make this assert the old value.
			let drain_head = 100 - (100 % depot::HOT_DRAIN_HEAD_GRAIN_TXIDS);
			assert_eq!(run_hot_job.drain_head_txid, drain_head);

			wait_for_hot_install(&test_ctx, database_branch_id, drain_head).await?;
			let pinned_shard = read_shard_version(&test_ctx, database_branch_id, 0, 50)
				.await?
				.expect("pinned txid shard should be published");
			let latest_shard = read_shard_version(&test_ctx, database_branch_id, 0, drain_head)
				.await?
				.expect("latest head shard should be published");

			let pinned_decoded = decode_ltx_v3(&pinned_shard)?;
			let latest_decoded = decode_ltx_v3(&latest_shard)?;
			assert_eq!(pinned_decoded.header.max_txid, 50);
			assert_eq!(latest_decoded.header.max_txid, drain_head);
			assert_eq!(pinned_decoded.get_page(1), Some(page(50).as_slice()));
			assert_eq!(
				latest_decoded.get_page(1),
				Some(page(drain_head as u8).as_slice())
			);
			// A txid that is neither the pin nor the drain head is not a coverage txid, so it gets no
			// shard of its own.
			assert_eq!(
				read_shard_version(&test_ctx, database_branch_id, 0, drain_head - 1).await?,
				None
			);

			test_ctx.shutdown().await?;
			Ok(())
		}
	)
}

#[tokio::test]
async fn reclaimer_deletes_obsolete_fdb_rows_after_hot_coverage() -> Result<()> {
	let database_branch_id = database_branch_id(0x7070_2233_4455_6677_8899_aabb_ccdd_eeff);
	workflow_matrix!(
		"workflow-reclaimer-deletes-obsolete-fdb-rows-after-hot-coverage",
		build_registry,
		|_tier, test_ctx| {
			let tag_value = database_branch_tag_value(database_branch_id);
			seed_manager_branch(
				&test_ctx,
				database_branch_id,
				quota_threshold_head(),
				None,
				Some(SqliteCmpDirty {
					observed_head_txid: quota_threshold_head(),
					updated_at_ms: 1_714_000_000_000,
				}),
			)
			.await?;

			let manager_workflow_id = test_ctx
				.workflow(DbManagerInput::new(database_branch_id, None))
				.tag(DATABASE_BRANCH_ID_TAG, &tag_value)
				.unique()
				.dispatch()
				.await?;
			wake_manager(&test_ctx, manager_workflow_id, database_branch_id).await?;
			let reclaimer_workflow_id =
				wait_for_workflow::<DbReclaimerWorkflow>(&test_ctx, database_branch_id).await?;

			wait_for_hot_install(&test_ctx, database_branch_id, quota_threshold_head()).await?;
			// The manager only dispatches reclaim on its interval, so force a pass rather than wait
			// out the timer.
			force_reclaim(
				&test_ctx,
				manager_workflow_id,
				database_branch_id,
				Id::new_v1(70),
			)
			.await?;
			let run_reclaim_job =
				wait_for_run_reclaim_job(&test_ctx, reclaimer_workflow_id).await?;
			assert_eq!(run_reclaim_job.job_kind, CompactionJobKind::Reclaim);
			assert_eq!(run_reclaim_job.database_branch_id, database_branch_id);
			// The job's `input_range` no longer enumerates the commits and deltas to reclaim. That
			// lane moved into the `sweep_commit_delta_chunk` activity, which owns its own cursor, so
			// a healthy job reports an empty 0..=0 range here. The deletions below are the
			// observable outcome.
			// The commit/delta sweep is cursor-chunked, so a single forced pass walks only part of
			// the window. Settle the branch so the sweep runs to completion before asserting.
			force_compaction_and_wait_idle(
				&test_ctx,
				manager_workflow_id,
				database_branch_id,
				Id::new_v1(71),
				ForceCompactionWork {
					hot: false,
					cold: false,
					reclaim: true,
					final_settle: true,
				},
			)
			.await?;
			wait_for_reclaim_delete(&test_ctx, database_branch_id, quota_threshold_head()).await?;

			let mut versionstamp = [0; 16];
			versionstamp[8..16].copy_from_slice(&quota_threshold_head().to_be_bytes());
			assert!(
				read_value(&test_ctx, branch_vtx_key(database_branch_id, versionstamp))
					.await?
					.is_none()
			);
			assert!(
				read_shard_version(&test_ctx, database_branch_id, 0, quota_threshold_head())
					.await?
					.is_some()
			);

			test_ctx.shutdown().await?;
			Ok(())
		}
	)
}

#[tokio::test]
async fn reclaimer_retains_rows_when_pidx_still_references_deleted_txid() -> Result<()> {
	let database_branch_id = database_branch_id(0x8080_2233_4455_6677_8899_aabb_ccdd_eeff);
	workflow_matrix!(
		"workflow-reclaimer-retains-rows-when-pidx-still-references-deleted-txid",
		build_registry,
		|_tier, test_ctx| {
			let tag_value = database_branch_tag_value(database_branch_id);
			seed_manager_branch(
				&test_ctx,
				database_branch_id,
				quota_threshold_head(),
				Some(CompactionRoot {
					schema_version: 1,
					manifest_generation: 1,
					hot_watermark_txid: quota_threshold_head(),
					cold_watermark_txid: 0,
					cold_watermark_versionstamp: [0; 16],
				}),
				None,
			)
			.await?;
			publish_test_shard_and_clear_pidx(
				&test_ctx,
				database_branch_id,
				quota_threshold_head(),
			)
			.await?;
			set_test_pidx(&test_ctx, database_branch_id, 1).await?;

			let manager_workflow_id = test_ctx
				.workflow(DbManagerInput::new(database_branch_id, None))
				.tag(DATABASE_BRANCH_ID_TAG, &tag_value)
				.unique()
				.dispatch()
				.await?;
			wake_manager(&test_ctx, manager_workflow_id, database_branch_id).await?;
			let manager_state = wait_for_manager_state(&test_ctx, manager_workflow_id, |state| {
				state.last_observed_branch_lifecycle_generation.is_some()
			})
			.await?;

			assert!(manager_state.active_jobs.reclaim.is_none());
			assert!(delta_exists(&test_ctx, database_branch_id, 1).await?);
			assert!(
				read_value(&test_ctx, branch_commit_key(database_branch_id, 1))
					.await?
					.is_some()
			);

			test_ctx.shutdown().await?;
			Ok(())
		}
	)
}

#[tokio::test]
async fn reclaimer_rejects_stale_manifest_generation() -> Result<()> {
	let database_branch_id = database_branch_id(0x9090_2233_4455_6677_8899_aabb_ccdd_eeff);
	workflow_matrix!(
		"workflow-reclaimer-rejects-stale-manifest-generation",
		build_registry,
		|_tier, test_ctx| {
			let tag_value = database_branch_tag_value(database_branch_id);
			seed_manager_branch(
				&test_ctx,
				database_branch_id,
				1,
				Some(CompactionRoot {
					schema_version: 1,
					manifest_generation: 1,
					hot_watermark_txid: 1,
					cold_watermark_txid: 0,
					cold_watermark_versionstamp: [0; 16],
				}),
				None,
			)
			.await?;
			publish_test_shard_and_clear_pidx(&test_ctx, database_branch_id, 1).await?;
			set_test_pidx(&test_ctx, database_branch_id, 1).await?;

			let _manager_workflow_id = test_ctx
				.workflow(DbManagerInput::new(database_branch_id, None))
				.tag(DATABASE_BRANCH_ID_TAG, &tag_value)
				.unique()
				.dispatch()
				.await?;
			let reclaimer_workflow_id =
				wait_for_workflow::<DbReclaimerWorkflow>(&test_ctx, database_branch_id).await?;
			let signal_id = test_ctx
				.signal(RunReclaimJob {
					database_branch_id,
					job_id: Id::new_v1(42),
					job_kind: CompactionJobKind::Reclaim,
					base_lifecycle_generation: 0,
					base_manifest_generation: 0,
					input_fingerprint: [3; 32],
					status: CompactionJobStatus::Requested,
					input_range: depot::workflows::compaction::ReclaimJobInputRange {
						txids: TxidRange {
							min_txid: 1,
							max_txid: 1,
						},
						delta_reclaim_segments: vec![
							depot::workflows::compaction::DeltaSegmentRef {
								txid: 1,
								first_pgno: None,
							},
						],
						commit_reclaim_txids: vec![1],
						cold_objects: Vec::new(),
						shard_cache_evictions: Vec::new(),
						stale_hot_job_ids: Vec::new(),
						stale_commit_stage_txids: Vec::new(),
						stale_cold_job_ids: Vec::new(),
						skip_commit_delta: false,
						cold_scan_cursor: None,
						commit_scan_cursor: 0,
						cursor_segment_pgno: None,
						max_keys: 500,
						max_bytes: 2 * 1024 * 1024,
					},
					bypass_admission: false,
				})
				.to_workflow_id(reclaimer_workflow_id)
				.send()
				.await?
				.expect("signal should target reclaimer workflow");
			wait_for_signal_ack(&test_ctx, signal_id).await?;

			assert!(delta_exists(&test_ctx, database_branch_id, 1).await?);
			assert!(
				read_value(&test_ctx, branch_commit_key(database_branch_id, 1))
					.await?
					.is_some()
			);

			test_ctx.shutdown().await?;
			Ok(())
		}
	)
}

#[tokio::test]
async fn reclaimer_retains_pinned_txid_history() -> Result<()> {
	let database_branch_id = database_branch_id(0xa0a0_2233_4455_6677_8899_aabb_ccdd_eeff);
	workflow_matrix!(
		"workflow-reclaimer-retains-pinned-txid-history",
		build_registry,
		|tier, test_ctx| {
			let tag_value = database_branch_tag_value(database_branch_id);
			seed_manager_branch(
				&test_ctx,
				database_branch_id,
				100,
				Some(CompactionRoot {
					schema_version: 1,
					manifest_generation: 1,
					hot_watermark_txid: 100,
					// Cold has caught up to the hot fold, but only where a cold tier exists. With cold
					// on, the COMMITS delete bound is capped at the cold watermark so cold keeps the
					// metadata it needs to publish past it, and a fixture that leaves it at zero
					// reclaims nothing there. Claiming a watermark with no cold tier would be a state
					// the system cannot reach, and would wrongly license dropping hot deltas that
					// nothing else carries.
					cold_watermark_txid: match tier {
						WorkflowTierMode::Disabled => 0,
					},
					cold_watermark_versionstamp: [0; 16],
				}),
				None,
			)
			.await?;
			publish_test_shard_and_clear_pidx(&test_ctx, database_branch_id, 100).await?;
			let _restore_point =
				seed_restore_point_db_pin(&test_ctx, database_branch_id, 50).await?;

			let manager_workflow_id = test_ctx
				.workflow(DbManagerInput::new(database_branch_id, None))
				.tag(DATABASE_BRANCH_ID_TAG, &tag_value)
				.unique()
				.dispatch()
				.await?;
			force_reclaim(
				&test_ctx,
				manager_workflow_id,
				database_branch_id,
				Id::new_v1(70 + 4),
			)
			.await?;

			// Txid 49 sits below the pin at 50, but its DELTA is not reclaimable: the pin makes 50 a
			// coverage fold, no shard image exists at 50, and the delta is the only carrier of the
			// pinned read. Deleting it is exactly the unsoundness the materialization gate was added
			// to prevent, and its COMMIT row is held back with it so the delta stays reachable.
			assert_commit_and_delta_share_fate(&test_ctx, tier, database_branch_id, 49).await?;
			assert_delta_retained(&test_ctx, tier, database_branch_id, 50).await?;
			assert!(
				read_value(&test_ctx, branch_commit_key(database_branch_id, 50))
					.await?
					.is_some()
			);

			test_ctx.shutdown().await?;
			Ok(())
		}
	)
}

#[tokio::test]
async fn reclaimer_retains_unexpired_pitr_interval_history() -> Result<()> {
	let database_branch_id = database_branch_id(0xa1a1_2233_4455_6677_8899_aabb_ccdd_eeff);
	workflow_matrix_with_pitr!(
		"workflow-reclaimer-retains-unexpired-pitr-interval-history",
		build_registry,
		|tier, test_ctx| {
			let tag_value = database_branch_tag_value(database_branch_id);
			seed_manager_branch(
				&test_ctx,
				database_branch_id,
				100,
				Some(CompactionRoot {
					schema_version: 1,
					manifest_generation: 1,
					hot_watermark_txid: 100,
					// Cold has caught up to the hot fold, but only where a cold tier exists. With cold
					// on, the COMMITS delete bound is capped at the cold watermark so cold keeps the
					// metadata it needs to publish past it, and a fixture that leaves it at zero
					// reclaims nothing there. Claiming a watermark with no cold tier would be a state
					// the system cannot reach, and would wrongly license dropping hot deltas that
					// nothing else carries.
					cold_watermark_txid: match tier {
						WorkflowTierMode::Disabled => 0,
					},
					cold_watermark_versionstamp: [0; 16],
				}),
				None,
			)
			.await?;
			publish_test_shard_and_clear_pidx(&test_ctx, database_branch_id, 100).await?;
			seed_pitr_interval_coverage(&test_ctx, database_branch_id, 5_000, 50, i64::MAX).await?;

			let manager_workflow_id = test_ctx
				.workflow(DbManagerInput::new(database_branch_id, None))
				.tag(DATABASE_BRANCH_ID_TAG, &tag_value)
				.unique()
				.dispatch()
				.await?;
			force_reclaim(
				&test_ctx,
				manager_workflow_id,
				database_branch_id,
				Id::new_v1(70 + 3),
			)
			.await?;

			// Txid 49 sits below the pin at 50, but its DELTA is not reclaimable: the pin makes 50 a
			// coverage fold, no shard image exists at 50, and the delta is the only carrier of the
			// pinned read. Deleting it is exactly the unsoundness the materialization gate was added
			// to prevent, and its COMMIT row is held back with it so the delta stays reachable.
			assert_commit_and_delta_share_fate(&test_ctx, tier, database_branch_id, 49).await?;
			assert_delta_retained(&test_ctx, tier, database_branch_id, 50).await?;
			assert!(
				read_value(&test_ctx, branch_commit_key(database_branch_id, 50))
					.await?
					.is_some()
			);
			assert_eq!(
				read_pitr_interval_txid(&test_ctx, database_branch_id, 5_000).await?,
				Some(50)
			);

			test_ctx.shutdown().await?;
			Ok(())
		}
	)
}

#[tokio::test]
async fn reclaimer_deletes_expired_pitr_interval_and_reclaims_history() -> Result<()> {
	let database_branch_id = database_branch_id(0xa2a2_2233_4455_6677_8899_aabb_ccdd_eeff);
	workflow_matrix_with_pitr!(
		"workflow-reclaimer-deletes-expired-pitr-interval-and-reclaims-history",
		build_registry,
		|tier, test_ctx| {
			let tag_value = database_branch_tag_value(database_branch_id);
			seed_manager_branch(
				&test_ctx,
				database_branch_id,
				100,
				Some(CompactionRoot {
					schema_version: 1,
					manifest_generation: 1,
					hot_watermark_txid: 100,
					// Cold has caught up to the hot fold, but only where a cold tier exists. With cold
					// on, the COMMITS delete bound is capped at the cold watermark so cold keeps the
					// metadata it needs to publish past it, and a fixture that leaves it at zero
					// reclaims nothing there. Claiming a watermark with no cold tier would be a state
					// the system cannot reach, and would wrongly license dropping hot deltas that
					// nothing else carries.
					cold_watermark_txid: match tier {
						WorkflowTierMode::Disabled => 0,
					},
					cold_watermark_versionstamp: [0; 16],
				}),
				None,
			)
			.await?;
			publish_test_shard_and_clear_pidx(&test_ctx, database_branch_id, 100).await?;
			seed_pitr_interval_coverage(&test_ctx, database_branch_id, 5_000, 50, 0).await?;

			let manager_workflow_id = test_ctx
				.workflow(DbManagerInput::new(database_branch_id, None))
				.tag(DATABASE_BRANCH_ID_TAG, &tag_value)
				.unique()
				.dispatch()
				.await?;
			force_reclaim(
				&test_ctx,
				manager_workflow_id,
				database_branch_id,
				Id::new_v1(70 + 2),
			)
			.await?;

			wait_for_reclaim_delete(&test_ctx, database_branch_id, 100).await?;
			assert_eq!(
				read_pitr_interval_txid(&test_ctx, database_branch_id, 5_000).await?,
				None
			);

			test_ctx.shutdown().await?;
			Ok(())
		}
	)
}

#[tokio::test]
async fn reclaimer_keeps_restore_point_after_pitr_interval_expires() -> Result<()> {
	let database_branch_id = database_branch_id(0xa3a3_2233_4455_6677_8899_aabb_ccdd_eeff);
	workflow_matrix_with_pitr!(
		"workflow-reclaimer-keeps-restore-point-after-pitr-interval-expires",
		build_registry,
		|tier, test_ctx| {
			let tag_value = database_branch_tag_value(database_branch_id);
			seed_manager_branch(
				&test_ctx,
				database_branch_id,
				100,
				Some(CompactionRoot {
					schema_version: 1,
					manifest_generation: 1,
					hot_watermark_txid: 100,
					// Cold has caught up to the hot fold, but only where a cold tier exists. With cold
					// on, the COMMITS delete bound is capped at the cold watermark so cold keeps the
					// metadata it needs to publish past it, and a fixture that leaves it at zero
					// reclaims nothing there. Claiming a watermark with no cold tier would be a state
					// the system cannot reach, and would wrongly license dropping hot deltas that
					// nothing else carries.
					cold_watermark_txid: match tier {
						WorkflowTierMode::Disabled => 0,
					},
					cold_watermark_versionstamp: [0; 16],
				}),
				None,
			)
			.await?;
			publish_test_shard_and_clear_pidx(&test_ctx, database_branch_id, 100).await?;
			let restore_point =
				seed_restore_point_db_pin(&test_ctx, database_branch_id, 50).await?;
			seed_pitr_interval_coverage(&test_ctx, database_branch_id, 5_000, 50, 0).await?;

			let manager_workflow_id = test_ctx
				.workflow(DbManagerInput::new(database_branch_id, None))
				.tag(DATABASE_BRANCH_ID_TAG, &tag_value)
				.unique()
				.dispatch()
				.await?;
			force_reclaim(
				&test_ctx,
				manager_workflow_id,
				database_branch_id,
				Id::new_v1(70 + 1),
			)
			.await?;

			// Txid 49 sits below the pin at 50, but its DELTA is not reclaimable: the pin makes 50 a
			// coverage fold, no shard image exists at 50, and the delta is the only carrier of the
			// pinned read. Deleting it is exactly the unsoundness the materialization gate was added
			// to prevent, and its COMMIT row is held back with it so the delta stays reachable.
			assert_commit_and_delta_share_fate(&test_ctx, tier, database_branch_id, 49).await?;
			assert_delta_retained(&test_ctx, tier, database_branch_id, 50).await?;
			assert!(
				read_value(&test_ctx, branch_commit_key(database_branch_id, 50))
					.await?
					.is_some()
			);
			assert_eq!(
				read_pitr_interval_txid(&test_ctx, database_branch_id, 5_000).await?,
				None
			);
			assert!(
				read_value(
					&test_ctx,
					db_pin_key(
						database_branch_id,
						&history_pin::restore_point_pin_id(&restore_point)
					),
				)
				.await?
				.is_some()
			);

			test_ctx.shutdown().await?;
			Ok(())
		}
	)
}

#[tokio::test]
async fn reclaimer_materializes_bucket_fork_pin_before_delete() -> Result<()> {
	let database_branch_id = database_branch_id(0xb0b0_2233_4455_6677_8899_aabb_ccdd_eeff);
	let source_bucket_branch_id =
		BucketBranchId::from_uuid(Uuid::from_u128(0x1111_2222_3333_4444_5555_6666_7777_8888));
	let target_bucket_branch_id =
		BucketBranchId::from_uuid(Uuid::from_u128(0x9999_aaaa_bbbb_cccc_dddd_eeee_ffff_0001));
	workflow_matrix!(
		"workflow-reclaimer-materializes-bucket-fork-pin-before-delete",
		build_registry,
		|tier, test_ctx| {
			let tag_value = database_branch_tag_value(database_branch_id);
			seed_manager_branch(
				&test_ctx,
				database_branch_id,
				100,
				Some(CompactionRoot {
					schema_version: 1,
					manifest_generation: 1,
					hot_watermark_txid: 100,
					// Cold has caught up to the hot fold, but only where a cold tier exists. With cold
					// on, the COMMITS delete bound is capped at the cold watermark so cold keeps the
					// metadata it needs to publish past it, and a fixture that leaves it at zero
					// reclaims nothing there. Claiming a watermark with no cold tier would be a state
					// the system cannot reach, and would wrongly license dropping hot deltas that
					// nothing else carries.
					cold_watermark_txid: match tier {
						WorkflowTierMode::Disabled => 0,
					},
					cold_watermark_versionstamp: [0; 16],
				}),
				None,
			)
			.await?;
			publish_test_shard_and_clear_pidx(&test_ctx, database_branch_id, 100).await?;
			seed_bucket_fork_proof(
				&test_ctx,
				database_branch_id,
				source_bucket_branch_id,
				target_bucket_branch_id,
				50,
				true,
			)
			.await?;

			let manager_workflow_id = test_ctx
				.workflow(DbManagerInput::new(database_branch_id, None))
				.tag(DATABASE_BRANCH_ID_TAG, &tag_value)
				.unique()
				.dispatch()
				.await?;
			force_reclaim(
				&test_ctx,
				manager_workflow_id,
				database_branch_id,
				Id::new_v1(70 + 0),
			)
			.await?;

			// Txid 49 sits below the pin at 50, but its DELTA is not reclaimable: the pin makes 50 a
			// coverage fold, no shard image exists at 50, and the delta is the only carrier of the
			// pinned read. Deleting it is exactly the unsoundness the materialization gate was added
			// to prevent, and its COMMIT row is held back with it so the delta stays reachable.
			assert_commit_and_delta_share_fate(&test_ctx, tier, database_branch_id, 49).await?;
			let pin_bytes = read_value(
				&test_ctx,
				db_pin_key(
					database_branch_id,
					&history_pin::bucket_fork_pin_id(target_bucket_branch_id),
				),
			)
			.await?
			.expect("bucket-derived DB_PIN should be materialized");
			let pin = decode_db_history_pin(&pin_bytes)?;
			assert_eq!(pin.kind, DbHistoryPinKind::BucketFork);
			assert_eq!(pin.owner_bucket_branch_id, Some(target_bucket_branch_id));
			assert_eq!(pin.at_txid, 50);
			assert_delta_retained(&test_ctx, tier, database_branch_id, 50).await?;

			test_ctx.shutdown().await?;
			Ok(())
		}
	)
}

#[tokio::test]
async fn reclaimer_retains_history_when_bucket_proof_is_ambiguous() -> Result<()> {
	let database_branch_id = database_branch_id(0xc0c0_2233_4455_6677_8899_aabb_ccdd_eeff);
	let source_bucket_branch_id =
		BucketBranchId::from_uuid(Uuid::from_u128(0x2222_3333_4444_5555_6666_7777_8888_9999));
	let target_bucket_branch_id =
		BucketBranchId::from_uuid(Uuid::from_u128(0xaaaa_bbbb_cccc_dddd_eeee_ffff_0001_0002));
	workflow_matrix!(
		"workflow-reclaimer-retains-history-when-bucket-proof-is-ambiguous",
		build_registry,
		|_tier, test_ctx| {
			let tag_value = database_branch_tag_value(database_branch_id);
			seed_manager_branch(
				&test_ctx,
				database_branch_id,
				100,
				Some(CompactionRoot {
					schema_version: 1,
					manifest_generation: 1,
					hot_watermark_txid: 100,
					cold_watermark_txid: 0,
					cold_watermark_versionstamp: [0; 16],
				}),
				None,
			)
			.await?;
			publish_test_shard_and_clear_pidx(&test_ctx, database_branch_id, 100).await?;
			seed_bucket_fork_proof(
				&test_ctx,
				database_branch_id,
				source_bucket_branch_id,
				target_bucket_branch_id,
				50,
				false,
			)
			.await?;

			let manager_workflow_id = test_ctx
				.workflow(DbManagerInput::new(database_branch_id, None))
				.tag(DATABASE_BRANCH_ID_TAG, &tag_value)
				.unique()
				.dispatch()
				.await?;
			wake_manager(&test_ctx, manager_workflow_id, database_branch_id).await?;
			let manager_state = wait_for_manager_state(&test_ctx, manager_workflow_id, |state| {
				state.last_observed_branch_lifecycle_generation.is_some()
			})
			.await?;

			assert!(manager_state.active_jobs.reclaim.is_none());
			assert!(delta_exists(&test_ctx, database_branch_id, 1).await?);
			assert!(
				read_value(&test_ctx, branch_commit_key(database_branch_id, 1))
					.await?
					.is_some()
			);

			test_ctx.shutdown().await?;
			Ok(())
		}
	)
}

fn quota_threshold_head() -> u64 {
	depot::quota::COMPACTION_DELTA_THRESHOLD
}

/// Gated on `test-faults`: `override_bulk_activity_early_timeout_for_test` only exists under that
/// feature, so without the gate this test does not compile and takes the whole binary with it.
#[cfg(feature = "test-faults")]
#[tokio::test]
async fn hot_install_resumes_across_activity_calls_on_early_timeout() -> Result<()> {
	workflow_matrix!(
		"workflow-hot-install-resumes-across-activity-calls-on-early-timeout",
		build_registry,
		|_tier, test_ctx| {
			let database_db = make_test_db(&test_ctx)?;
			database_db
				.commit(vec![dirty_page(1, 0xb1)], 2, 1_001)
				.await?;
			database_db
				.commit(vec![dirty_page(1, 0xb2)], 2, 1_002)
				.await?;
			let database_branch_id = read_database_branch_id(&test_ctx).await?;
			// A zero early timeout makes every install activity call return a resume cursor after its
			// first committed chunk, so the install only completes if the manager re-dispatches the
			// activity from the cursor until the drain finalizes.
			let _early_timeout_guard = test_hooks::override_bulk_activity_early_timeout_for_test(
				database_branch_id,
				Duration::ZERO,
			);
			let tag_value = database_branch_tag_value(database_branch_id);
			let manager_workflow_id = test_ctx
				.workflow(DbManagerInput::new(database_branch_id, None))
				.tag(DATABASE_BRANCH_ID_TAG, &tag_value)
				.unique()
				.dispatch()
				.await?;

			let result = force_compaction_and_wait_idle(
				&test_ctx,
				manager_workflow_id,
				database_branch_id,
				Id::new_v1(97),
				ForceCompactionWork {
					hot: true,
					cold: false,
					reclaim: false,
					final_settle: false,
				},
			)
			.await?;
			assert_eq!(result.terminal_error, None);
			assert!(result.attempted_job_kinds.contains(&CompactionJobKind::Hot));

			let root = wait_until("resumed hot install finalize", || async {
				let root = read_value(&test_ctx, branch_compaction_root_key(database_branch_id))
					.await?
					.as_deref()
					.map(decode_compaction_root)
					.transpose()?;
				let pidx = read_value(&test_ctx, branch_pidx_key(database_branch_id, 1)).await?;
				if let Some(root) = root
					&& root.manifest_generation == 1
					&& root.hot_watermark_txid == 2
					&& pidx.is_none()
				{
					return Ok(Some(root));
				}
				Ok(None)
			})
			.await?;
			assert_eq!(root.hot_watermark_txid, 2);
			assert_eq!(root.manifest_generation, 1);
			let shard_rows =
				read_prefix_values(&test_ctx, branch_shard_prefix(database_branch_id)).await?;
			assert!(!shard_rows.is_empty());
			assert_eq!(
				database_db.get_pages(vec![1]).await?,
				vec![FetchedPage {
					pgno: 1,
					bytes: Some(page(0xb2)),
				}]
			);

			test_ctx.shutdown().await?;
			Ok(())
		}
	)
}
