use std::collections::BTreeSet;
use std::ffi::{CStr, CString};
use std::future::Future;
use std::pin::Pin;
use std::ptr;
use std::sync::{Arc, LazyLock};
use std::time::Duration;

use anyhow::{Context, Result, bail, ensure};
use depot::{
	fault::{DepotFaultCheckpoint, DepotFaultController, DepotFaultReplayEvent},
	keys,
	types::{
		DatabaseBranchId, GetPagesOptions, PageSourceKind, PageSourceProvenance, RestorePointId,
		SnapshotSelector, decode_cold_shard_ref,
	},
	workflows::compaction::{
		DbHotCompactorWorkflow, DbManagerWorkflow, DbReclaimerWorkflow, DepotCompactionTestDriver,
		ForceCompactionResult, ForceCompactionWork,
		test_hooks::{self, WorkflowFaultControllerGuard},
	},
};
use futures_util::TryStreamExt;
use gas::prelude::{Registry, TestCtx};
use libsqlite3_sys::{
	SQLITE_BLOB, SQLITE_FLOAT, SQLITE_INTEGER, SQLITE_NULL, SQLITE_OK, SQLITE_ROW, SQLITE_TEXT,
	sqlite3, sqlite3_column_blob, sqlite3_column_bytes, sqlite3_column_count,
	sqlite3_column_double, sqlite3_column_int64, sqlite3_column_text, sqlite3_column_type,
	sqlite3_finalize, sqlite3_prepare_v2, sqlite3_step,
};
use parking_lot::Mutex;
use rivet_pools::__rivet_util::Id;
use tokio::runtime::Builder;
use universaldb::{RangeOption, options::StreamingMode, utils::IsolationLevel::Snapshot};

use super::super::{
	DirectDepotTransport, DirectStorage, DirectStorageStats, NativeDatabase, SqliteVfs, VfsConfig,
	fetch_initial_main_page_for_registration, open_database,
};
use super::oracle::{
	AmbiguousOracleOutcome, NativeSqliteOracle, OracleCommitSemantics, OracleVerification,
	page_one_db_size_pages,
};
use super::verify::DepotInvariantScanner;
use super::workload::LogicalOp;

type StageFuture = Pin<Box<dyn Future<Output = Result<()>>>>;
type Stage = Box<dyn FnOnce(FaultScenarioCtx) -> StageFuture>;
type FaultSetup = Box<dyn FnOnce(&DepotFaultController) -> Result<()>>;

static FAULT_SCENARIO_RUN_LOCK: LazyLock<Mutex<()>> = LazyLock::new(|| Mutex::new(()));

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum FaultProfile {
	Simple,
	Chaos,
}

pub(crate) struct FaultScenario {
	name: String,
	seed: u64,
	profile: FaultProfile,
	setup: Option<Stage>,
	workload: Option<Stage>,
	faults: Option<FaultSetup>,
	verify: Option<Stage>,
}

#[derive(Clone)]
pub(crate) struct FaultScenarioCtx {
	inner: Arc<FaultScenarioInner>,
}

struct FaultScenarioInner {
	seed: u64,
	profile: FaultProfile,
	actor_id: String,
	handle: tokio::runtime::Handle,
	storage: Arc<DirectStorage>,
	database: Mutex<Option<NativeDatabase>>,
	oracle: Mutex<NativeSqliteOracle>,
	faults: DepotFaultController,
	checkpoints: Mutex<Vec<DepotFaultCheckpoint>>,
	workload: Mutex<Vec<LogicalOp>>,
	branch_head_before_faults: Mutex<Option<u64>>,
	workload_fault_event_count: Mutex<Option<usize>>,
	oracle_result: Mutex<Option<String>>,
	ambiguous_oracle_outcome: Mutex<Option<AmbiguousOracleOutcome>>,
	manager_workflow_id: tokio::sync::Mutex<Option<Id>>,
	workflow_fault_guard: Mutex<Option<WorkflowFaultControllerGuard>>,
	test_ctx: tokio::sync::Mutex<TestCtx>,
}

#[derive(Clone, Debug)]
pub(crate) struct FaultScenarioReplayRecord {
	pub(crate) seed: u64,
	pub(crate) profile: FaultProfile,
	pub(crate) checkpoints: Vec<String>,
	pub(crate) workload: Vec<LogicalOp>,
	pub(crate) branch_head_before_faults: Option<u64>,
	pub(crate) branch_head_after_workload: Option<u64>,
	pub(crate) oracle_result: Option<String>,
	pub(crate) ambiguous_oracle_outcome: Option<AmbiguousOracleOutcome>,
	pub(crate) fault_events: Vec<FaultScenarioReplayEvent>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum FaultReplayPhase {
	Workload,
	Verification,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct FaultScenarioReplayEvent {
	pub(crate) event: DepotFaultReplayEvent,
	pub(crate) phase: FaultReplayPhase,
}

/// Which depot `Db` state a page-1 read went through. An engine pod reuses a `Db` across actor
/// generations, so both are real production configurations.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum PageOneReadMode {
	WarmHandle,
	EvictedHandle,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct DirectStorageCounterSnapshot {
	stats: DirectStorageStats,
}

impl FaultScenario {
	pub(crate) fn new(name: impl Into<String>) -> Self {
		Self {
			name: name.into(),
			seed: 0,
			profile: FaultProfile::Simple,
			setup: None,
			workload: None,
			faults: None,
			verify: None,
		}
	}

	pub(crate) fn seed(mut self, seed: u64) -> Self {
		self.seed = seed;
		self
	}

	pub(crate) fn profile(mut self, profile: FaultProfile) -> Self {
		self.profile = profile;
		self
	}

	pub(crate) fn setup<F, Fut>(mut self, setup: F) -> Self
	where
		F: FnOnce(FaultScenarioCtx) -> Fut + 'static,
		Fut: Future<Output = Result<()>> + 'static,
	{
		self.setup = Some(Box::new(move |ctx| Box::pin(setup(ctx))));
		self
	}

	pub(crate) fn workload<F, Fut>(mut self, workload: F) -> Self
	where
		F: FnOnce(FaultScenarioCtx) -> Fut + 'static,
		Fut: Future<Output = Result<()>> + 'static,
	{
		self.workload = Some(Box::new(move |ctx| Box::pin(workload(ctx))));
		self
	}

	pub(crate) fn faults<F>(mut self, faults: F) -> Self
	where
		F: FnOnce(&DepotFaultController) -> Result<()> + 'static,
	{
		self.faults = Some(Box::new(faults));
		self
	}

	pub(crate) fn verify<F, Fut>(mut self, verify: F) -> Self
	where
		F: FnOnce(FaultScenarioCtx) -> Fut + 'static,
		Fut: Future<Output = Result<()>> + 'static,
	{
		self.verify = Some(Box::new(move |ctx| Box::pin(verify(ctx))));
		self
	}

	pub(crate) fn run(self) -> Result<()> {
		// Fault scenarios install process-global workflow hooks for compaction
		// workflows, then spin and shut down workflow workers. Running multiple
		// scenarios in the same test process can make one scenario observe another
		// scenario's worker/debug lifecycle instead of its own force-compaction ack.
		let Some(_run_guard) = FAULT_SCENARIO_RUN_LOCK.try_lock() else {
			bail!(
				"depot-client fault scenarios cannot run in parallel; rerun with `cargo test -p depot-client fault -- --test-threads=1`"
			);
		};
		let runtime = Builder::new_multi_thread()
			.worker_threads(2)
			.enable_all()
			.build()
			.context("fault scenario runtime should build")?;
		let scenario_name = self.name.clone();
		let ctx = runtime.block_on(FaultScenarioCtx::new(&self))?;
		ctx.open_database()?;

		let mut result = Ok(());
		if let Some(setup) = self.setup {
			result = runtime.block_on(setup(ctx.clone()));
		}
		if result.is_ok() {
			result = runtime.block_on(ctx.enter_strict_workload_mode());
		}
		let strict_workload_counters = if result.is_ok() {
			Some(ctx.direct_storage_counter_snapshot())
		} else {
			None
		};
		if result.is_ok() {
			result = runtime.block_on(ctx.capture_branch_head_before_faults());
		}
		if result.is_ok() {
			if let Some(faults) = self.faults {
				result = faults(ctx.fault_controller());
			}
		}
		if result.is_ok() {
			if let Some(workload) = self.workload {
				result = runtime.block_on(workload(ctx.clone()));
			}
		}
		if result.is_ok() {
			if let Some(strict_workload_counters) = &strict_workload_counters {
				result = ctx.assert_strict_mirror_counters_unchanged(strict_workload_counters);
			}
		}
		if result.is_ok() {
			result = ctx.fault_controller().assert_expected_fired();
		}
		if result.is_ok() {
			ctx.mark_workload_faults_complete();
		}
		if result.is_ok() {
			if let Some(verify) = self.verify {
				result = runtime.block_on(verify(ctx.clone()));
			}
		}

		let shutdown_result = runtime.block_on(ctx.shutdown());
		result.with_context(|| format!("fault scenario {scenario_name} failed"))?;
		shutdown_result
			.with_context(|| format!("fault scenario {scenario_name} failed to shut down"))?;
		Ok(())
	}
}

impl FaultScenarioCtx {
	async fn new(scenario: &FaultScenario) -> Result<Self> {
		let test_ctx = TestCtx::new(build_registry()).await?;
		let udb = test_ctx.pools().udb()?;
		let handle = tokio::runtime::Handle::current();
		let actor_id = super::super::next_test_name("sqlite-fault-actor");
		let faults = DepotFaultController::new();
		let storage = Arc::new(DirectStorage::new_with_fault_controller(
			(*udb).clone(),
			faults.clone(),
		));

		Ok(Self {
			inner: Arc::new(FaultScenarioInner {
				seed: scenario.seed,
				profile: scenario.profile,
				actor_id,
				handle,
				storage,
				database: Mutex::new(None),
				oracle: Mutex::new(NativeSqliteOracle::open()?),
				faults,
				checkpoints: Mutex::new(Vec::new()),
				workload: Mutex::new(Vec::new()),
				branch_head_before_faults: Mutex::new(None),
				workload_fault_event_count: Mutex::new(None),
				oracle_result: Mutex::new(None),
				ambiguous_oracle_outcome: Mutex::new(None),
				manager_workflow_id: tokio::sync::Mutex::new(None),
				workflow_fault_guard: Mutex::new(None),
				test_ctx: tokio::sync::Mutex::new(test_ctx),
			}),
		})
	}

	pub(crate) async fn sql(&self, sql: &str) -> Result<()> {
		self.with_database_blocking(|db| {
			super::super::sqlite_exec(db.as_ptr(), sql).map_err(anyhow::Error::msg)
		})?;
		self.inner.oracle.lock().apply_sql(sql)
	}

	pub(crate) async fn query(&self, sql: &str) -> Result<Vec<Vec<String>>> {
		self.with_database_blocking(|db| query_rows(db.as_ptr(), sql))
	}

	pub(crate) async fn exec(&self, op: LogicalOp) -> Result<()> {
		self.exec_with_oracle_semantics(op, OracleCommitSemantics::Success)
			.await
	}

	pub(crate) async fn exec_with_durable_error(&self, op: LogicalOp) -> Result<()> {
		let result = self.with_database_blocking(|db| op.apply(db.as_ptr()));
		if result.is_ok() {
			bail!("operation unexpectedly succeeded after durable fault");
		}

		self.inner.workload.lock().push(op.clone());
		self.inner
			.oracle
			.lock()
			.apply_logical_op(op, OracleCommitSemantics::Success)
	}

	#[allow(dead_code)]
	pub(crate) async fn exec_with_oracle_semantics(
		&self,
		op: LogicalOp,
		semantics: OracleCommitSemantics,
	) -> Result<()> {
		match semantics {
			OracleCommitSemantics::PreCommitFailure => {
				let result = self.with_database_blocking(|db| op.apply(db.as_ptr()));
				if result.is_ok() {
					bail!("operation unexpectedly succeeded before pre-commit failure");
				}
			}
			OracleCommitSemantics::Success => {
				self.with_database_blocking(|db| op.apply(db.as_ptr()))?;
			}
			OracleCommitSemantics::AmbiguousPostCommit => {
				let _ = self.with_database_blocking(|db| op.apply(db.as_ptr()));
			}
		}

		self.inner.workload.lock().push(op.clone());
		self.inner.oracle.lock().apply_logical_op(op, semantics)
	}

	pub(crate) async fn checkpoint(&self, name: impl Into<String>) -> Result<()> {
		self.inner
			.checkpoints
			.lock()
			.push(DepotFaultCheckpoint::new(name));
		Ok(())
	}

	pub(crate) async fn reload_database(&self) -> Result<()> {
		self.close_database();
		self.inner
			.storage
			.evict_actor_db(&self.inner.actor_id)
			.await;
		self.open_database_blocking()?;
		Ok(())
	}

	pub(crate) fn direct_storage_counter_snapshot(&self) -> DirectStorageCounterSnapshot {
		DirectStorageCounterSnapshot {
			stats: self.inner.storage.stats(),
		}
	}

	pub(crate) fn assert_strict_mirror_counters_unchanged(
		&self,
		before: &DirectStorageCounterSnapshot,
	) -> Result<()> {
		let after = self.direct_storage_counter_snapshot();
		if after.stats.mirror_reads != before.stats.mirror_reads {
			bail!(
				"strict workload used mirror reads: before={}, after={}",
				before.stats.mirror_reads,
				after.stats.mirror_reads
			);
		}
		if after.stats.mirror_seeds != before.stats.mirror_seeds {
			bail!(
				"strict workload used mirror seeds: before={}, after={}",
				before.stats.mirror_seeds,
				after.stats.mirror_seeds
			);
		}
		Ok(())
	}

	#[allow(dead_code)]
	pub(crate) async fn force_hot_compaction(&self) -> Result<ForceCompactionResult> {
		self.force_compaction(ForceCompactionWork {
			hot: true,
			cold: false,
			reclaim: false,
			final_settle: false,
		})
		.await
	}

	#[allow(dead_code)]
	pub(crate) async fn force_reclaim(&self) -> Result<ForceCompactionResult> {
		self.force_compaction(ForceCompactionWork {
			hot: false,
			cold: false,
			reclaim: true,
			final_settle: false,
		})
		.await
	}

	pub(crate) async fn force_compaction(
		&self,
		work: ForceCompactionWork,
	) -> Result<ForceCompactionResult> {
		let database_branch_id = self.database_branch_id().await?;
		let manager_workflow_id = self.manager_workflow_id(database_branch_id).await?;
		let test_ctx = self.inner.test_ctx.lock().await;
		DepotCompactionTestDriver::new(&test_ctx)
			.with_wait_timeout(self.force_compaction_wait_timeout())
			.force_compaction(manager_workflow_id, database_branch_id, work)
			.await
	}

	fn force_compaction_wait_timeout(&self) -> Duration {
		match self.inner.profile {
			FaultProfile::Simple => Duration::from_secs(30),
			FaultProfile::Chaos => Duration::from_secs(120),
		}
	}

	pub(crate) async fn verify_sqlite_integrity(&self) -> Result<()> {
		self.with_database_blocking(|db| NativeSqliteOracle::verify_integrity(db.as_ptr()))?;
		self.inner.oracle.lock().verify_oracle_integrity()?;
		Ok(())
	}

	#[allow(dead_code)]
	pub(crate) async fn verify_sqlite_integrity_rows(&self) -> Result<()> {
		let quick = self.query("PRAGMA quick_check;").await?;
		if quick != vec![vec!["ok".to_string()]] {
			bail!("sqlite quick_check failed: {quick:?}");
		}

		let integrity = self.query("PRAGMA integrity_check;").await?;
		if integrity != vec![vec!["ok".to_string()]] {
			bail!("sqlite integrity_check failed: {integrity:?}");
		}

		let foreign_keys = self.query("PRAGMA foreign_key_check;").await?;
		if !foreign_keys.is_empty() {
			bail!("sqlite foreign_key_check failed: {foreign_keys:?}");
		}

		Ok(())
	}

	/// Asserts that the page 1 depot serves agrees with `/META/head` about how large the database
	/// is.
	///
	/// The VFS seeds its database size from page 1 exactly once, at open, so depot returning a
	/// stale page 1 alongside a current head latches a short size before the actor runs any user
	/// code. The next commit publishes that short size and depot truncates the tail. The head fence
	/// cannot catch it because it compares txids, never bytes. Both values below come from the same
	/// read transaction, so this is an atomic comparison rather than two racing reads.
	pub(crate) async fn verify_page_one_matches_head(&self) -> Result<()> {
		// The warm handle first, and before anything evicts it. An engine pod keeps a `Db` per
		// database across actor generations, so a reopening actor's first read usually lands on a
		// handle whose lazy PIDX cache was populated at an older head. That is the configuration a
		// production restart actually reads through, so checking it after an evict would test a
		// state the engine rarely has.
		self.verify_page_one_matches_head_in_mode(PageOneReadMode::WarmHandle)
			.await?;

		// Then again with the handle's caches dropped, which is what a cold engine pod does.
		self.inner
			.storage
			.evict_actor_db(&self.inner.actor_id)
			.await;
		self.verify_page_one_matches_head_in_mode(PageOneReadMode::EvictedHandle)
			.await?;

		// The open database latched its size from whatever page 1 it saw at open, which may be
		// older than the page depot serves now.
		let (_, head_db_size_pages, head_txid, _) = self.read_page_one_and_head().await?;
		if head_db_size_pages == 0 {
			return Ok(());
		}
		let latched =
			self.with_database_blocking(|db| Ok(db._vfs.ctx().state.read().db_size_pages))?;
		ensure!(
			latched == head_db_size_pages,
			"open database latched a size that disagrees with head: latched_db_size_pages={latched}, \
			 head_db_size_pages={head_db_size_pages}, head_txid={head_txid}",
		);

		Ok(())
	}

	async fn verify_page_one_matches_head_in_mode(&self, mode: PageOneReadMode) -> Result<()> {
		let (page, head_db_size_pages, head_txid, provenance) =
			self.read_page_one_and_head().await?;
		if head_db_size_pages == 0 {
			return Ok(());
		}
		let provenance = provenance.context("depot returned no provenance for page 1")?;

		let page = page.context("depot returned page 1 with no bytes")?;
		let header_db_size_pages = page_one_db_size_pages(&page)?;
		ensure!(
			header_db_size_pages == head_db_size_pages,
			"page 1 header disagrees with head via a {mode:?} read: \
			 header_db_size_pages={header_db_size_pages}, \
			 head_db_size_pages={head_db_size_pages}, head_txid={head_txid}; \
			 page 1 provenance: {provenance:?}",
		);

		ensure!(
			// `OutOfRange` is deliberately absent. Page 1 is legitimately out of range on a
			// database whose head records zero pages, which is what a rolled back first commit
			// leaves behind.
			!matches!(
				provenance.winner_kind,
				PageSourceKind::ZeroFill | PageSourceKind::MissingDelta
			),
			"page 1 was served from a {:?} source via a {mode:?} read at head_txid={head_txid}; \
			 candidates: {:?}",
			provenance.winner_kind,
			provenance.candidates,
		);

		let Some(winner_txid) = provenance.winner_txid else {
			return Ok(());
		};
		ensure!(
			winner_txid <= head_txid,
			"page 1 was served from a source above head via a {mode:?} read: \
			 winner_txid={winner_txid}, head_txid={head_txid}, winner_kind={:?}, \
			 winner_shard_id={:?}",
			provenance.winner_kind,
			provenance.winner_shard_id,
		);

		// The bytes agreeing is weaker than the read having chosen the right source: a page 1 that
		// happens to carry the same size can still have come from a stale source, and the next
		// database to grow in that state would truncate. Provenance is the read path's own account
		// of which candidate won, so assert on it directly.
		//
		// This is the incident's exact shape: the hot tier held an older version of shard 0 than the
		// newest cold ref, and the read preferred hot without comparing the two. Only checked when a
		// shard source actually won; a page owned by a delta written after the last fold
		// legitimately sits above every shard image, and enumerating the sources costs two prefix
		// scans that are not worth paying on every read.
		if !matches!(
			provenance.winner_kind,
			PageSourceKind::HotShard | PageSourceKind::Cold
		) {
			return Ok(());
		}
		let (hot_versions, cold_versions) = self.shard_source_txids(0, head_txid).await?;
		let Some(newest_shard_source) = hot_versions
			.iter()
			.chain(cold_versions.iter())
			.copied()
			.max()
		else {
			return Ok(());
		};
		ensure!(
			winner_txid >= newest_shard_source,
			"page 1 was served from a source older than the newest shard 0 image via a {mode:?} \
			 read: winner_txid={winner_txid}, \
			 newest_shard_source_txid={newest_shard_source}, head_txid={head_txid}, \
			 hot_versions={hot_versions:?}, cold_versions={cold_versions:?}, winner_kind={:?}",
			provenance.winner_kind,
		);

		Ok(())
	}

	/// Reads page 1, the head that the same transaction saw, and the read path's own account of
	/// which source won. One read, so the three cannot disagree because of a concurrent commit.
	async fn read_page_one_and_head(
		&self,
	) -> Result<(Option<Vec<u8>>, u32, u64, Option<PageSourceProvenance>)> {
		let result = self
			.inner
			.storage
			.get_pages_with_options(
				&self.inner.actor_id,
				&[1],
				GetPagesOptions {
					collect_provenance: true,
					..GetPagesOptions::default()
				},
			)
			.await?;
		let page = result
			.pages
			.iter()
			.find(|page| page.pgno == 1)
			.context("depot read did not return page 1")?
			.bytes
			.clone();
		let provenance = result.provenance.into_iter().find(|entry| entry.pgno == 1);
		Ok((page, result.db_size_pages, result.head_txid, provenance))
	}

	/// Every source that could serve `shard_id` at or below `head_txid`, as `(hot versions, cold ref
	/// versions)`. A fold writes a new hot version without clearing the previous one, so several hot
	/// versions of a shard normally coexist and only the reclaimer removes the old ones.
	pub(crate) async fn shard_source_txids(
		&self,
		shard_id: u32,
		head_txid: u64,
	) -> Result<(Vec<u64>, Vec<u64>)> {
		let branch_id = self.database_branch_id().await?;
		let db = self.inner.storage.depot_database();
		db.txn(
			"test_depot_clientinline_fault_scenario",
			move |tx| async move {
				let mut hot = BTreeSet::new();
				for key in scan_keys(&tx, keys::branch_shard_prefix(branch_id)).await? {
					let (candidate_shard_id, as_of_txid, _chunk_idx) =
						keys::decode_branch_shard_row_key(branch_id, &key)?;
					if candidate_shard_id == shard_id && as_of_txid <= head_txid {
						hot.insert(as_of_txid);
					}
				}

				let mut cold = BTreeSet::new();
				for key in
					scan_keys(&tx, keys::branch_compaction_cold_shard_prefix(branch_id)).await?
				{
					let value = tx
						.informal()
						.get(&key, Snapshot)
						.await?
						.context("cold shard ref should exist for a key just scanned")?;
					let reference = decode_cold_shard_ref(&value)?;
					if reference.shard_id == shard_id && reference.as_of_txid <= head_txid {
						cold.insert(reference.as_of_txid);
					}
				}

				Ok((
					hot.into_iter().collect::<Vec<_>>(),
					cold.into_iter().collect::<Vec<_>>(),
				))
			},
		)
		.await
	}

	/// Deletes every row of one hot shard version, leaving other versions of the same shard in
	/// place.
	///
	/// This is how a test constructs "the hot tier holds an older version of this shard than the
	/// newest cold ref" without waiting for shard cache eviction to produce it. Distinct from
	/// `clear_hot_shards_for_harness_regression`, which clears every version and so sends reads to
	/// the cold tier instead of to a stale hot version.
	pub(crate) async fn clear_hot_shard_version_for_harness_regression(
		&self,
		shard_id: u32,
		as_of_txid: u64,
	) -> Result<usize> {
		let branch_id = self.database_branch_id().await?;
		let db = self.inner.storage.depot_database();
		db.txn(
			"test_depot_clientinline_fault_scenario",
			move |tx| async move {
				let (begin, end) =
					keys::branch_shard_version_range(branch_id, shard_id, as_of_txid);
				let informal = tx.informal();
				let mut stream = informal.get_ranges_keyvalues(
					RangeOption {
						mode: StreamingMode::WantAll,
						..(begin.as_slice(), end.as_slice()).into()
					},
					Snapshot,
				);
				let mut keys_to_clear = Vec::new();
				while let Some(entry) = stream.try_next().await? {
					keys_to_clear.push(entry.key().to_vec());
				}
				let count = keys_to_clear.len();
				for key in keys_to_clear {
					tx.informal().clear(&key);
				}
				Ok(count)
			},
		)
		.await
	}

	pub(crate) async fn verify_against_native_oracle(&self) -> Result<()> {
		let result =
			self.with_database_blocking(|db| self.inner.oracle.lock().verify_matches(db.as_ptr()));
		let mut ambiguous_outcome = self.inner.ambiguous_oracle_outcome.lock();
		*ambiguous_outcome = match &result {
			Ok(OracleVerification::Ambiguous(outcome)) => Some(*outcome),
			Err(err) if format!("{err:#}").contains("ambiguous oracle mismatch") => {
				Some(AmbiguousOracleOutcome::Invalid)
			}
			Ok(OracleVerification::Matched) | Err(_) => None,
		};
		*self.inner.oracle_result.lock() = Some(match &result {
			Ok(OracleVerification::Matched) => "matched".to_string(),
			Ok(OracleVerification::Ambiguous(outcome)) => {
				format!("ambiguous:{}", outcome.as_str())
			}
			Err(err) => format!("{err:#}"),
		});
		result.map(|_| ())
	}

	pub(crate) async fn verify_depot_invariants(&self) -> Result<()> {
		DepotInvariantScanner::new(
			self.inner.storage.depot_database(),
			self.inner.actor_id.clone(),
		)
		.verify()
		.await
	}

	pub(crate) async fn replay_record(&self) -> FaultScenarioReplayRecord {
		let branch_head_after_workload = self
			.inner
			.storage
			.read_branch_head(&self.inner.actor_id)
			.await
			.ok()
			.map(|(_, head_txid)| head_txid);
		let workload_fault_event_count = (*self.inner.workload_fault_event_count.lock())
			.unwrap_or_else(|| self.inner.faults.replay_log().len());
		let fault_events = self
			.inner
			.faults
			.replay_log_with_unfired()
			.into_iter()
			.enumerate()
			.map(|(index, event)| FaultScenarioReplayEvent {
				event,
				phase: if index < workload_fault_event_count {
					FaultReplayPhase::Workload
				} else {
					FaultReplayPhase::Verification
				},
			})
			.collect();

		FaultScenarioReplayRecord {
			seed: self.inner.seed,
			profile: self.inner.profile,
			checkpoints: self
				.inner
				.checkpoints
				.lock()
				.iter()
				.map(|checkpoint| checkpoint.name().to_string())
				.collect(),
			workload: self.inner.workload.lock().clone(),
			branch_head_before_faults: *self.inner.branch_head_before_faults.lock(),
			branch_head_after_workload,
			oracle_result: self.inner.oracle_result.lock().clone(),
			ambiguous_oracle_outcome: *self.inner.ambiguous_oracle_outcome.lock(),
			fault_events,
		}
	}

	pub(crate) fn fault_controller(&self) -> &DepotFaultController {
		&self.inner.faults
	}

	fn open_database(&self) -> Result<()> {
		let database = open_fault_database(
			&self.inner.handle,
			Arc::clone(&self.inner.storage),
			&self.inner.actor_id,
		)?;
		*self.inner.database.lock() = Some(database);
		Ok(())
	}

	fn open_database_blocking(&self) -> Result<()> {
		tokio::task::block_in_place(|| self.open_database())
	}

	async fn enter_strict_workload_mode(&self) -> Result<()> {
		self.close_database();
		self.inner
			.storage
			.evict_actor_db(&self.inner.actor_id)
			.await;
		self.open_database_blocking()
	}

	async fn shutdown(&self) -> Result<()> {
		self.close_database();
		self.inner.workflow_fault_guard.lock().take();
		let mut test_ctx = self.inner.test_ctx.lock().await;
		test_ctx.shutdown().await
	}

	pub(crate) async fn branch_head(&self) -> Result<(DatabaseBranchId, u64)> {
		self.inner
			.storage
			.read_branch_head(&self.inner.actor_id)
			.await
	}

	pub(crate) async fn database_branch_id(&self) -> Result<DatabaseBranchId> {
		self.inner
			.storage
			.read_branch_head(&self.inner.actor_id)
			.await
			.map(|(branch_id, _)| branch_id)
	}

	#[allow(dead_code)]
	pub(crate) fn depot_database(&self) -> Arc<universaldb::Database> {
		self.inner.storage.depot_database()
	}

	pub(crate) async fn create_restore_point(&self) -> Result<RestorePointId> {
		self.inner
			.storage
			.actor_db(self.inner.actor_id.clone())
			.await
			.create_restore_point(SnapshotSelector::Latest)
			.await
	}

	pub(crate) async fn delete_restore_point(&self, restore_point: RestorePointId) -> Result<()> {
		self.inner
			.storage
			.actor_db(self.inner.actor_id.clone())
			.await
			.delete_restore_point(restore_point)
			.await
	}

	pub(crate) async fn latest_delta_chunk_count(&self) -> Result<usize> {
		let (branch_id, head_txid) = self
			.inner
			.storage
			.read_branch_head(&self.inner.actor_id)
			.await?;
		let db = self.inner.storage.depot_database();
		db.txn(
			"test_depot_clientinline_fault_scenario",
			move |tx| async move {
				let prefix = keys::branch_delta_chunk_prefix(branch_id, head_txid);
				let prefix_subspace =
					universaldb::Subspace::from(universaldb::tuple::Subspace::from_bytes(prefix));
				let informal = tx.informal();
				let mut stream = informal.get_ranges_keyvalues(
					RangeOption {
						mode: StreamingMode::WantAll,
						..RangeOption::from(&prefix_subspace)
					},
					Snapshot,
				);
				let mut count = 0;
				while stream.try_next().await?.is_some() {
					count += 1;
				}
				Ok(count)
			},
		)
		.await
	}

	async fn capture_branch_head_before_faults(&self) -> Result<()> {
		let (_, head_txid) = self
			.inner
			.storage
			.read_branch_head(&self.inner.actor_id)
			.await?;
		*self.inner.branch_head_before_faults.lock() = Some(head_txid);
		Ok(())
	}

	fn mark_workload_faults_complete(&self) {
		*self.inner.workload_fault_event_count.lock() = Some(self.inner.faults.replay_log().len());
	}

	async fn manager_workflow_id(&self, database_branch_id: DatabaseBranchId) -> Result<Id> {
		if let Some(manager_workflow_id) = *self.inner.manager_workflow_id.lock().await {
			return Ok(manager_workflow_id);
		}

		let test_ctx = self.inner.test_ctx.lock().await;
		*self.inner.workflow_fault_guard.lock() =
			Some(test_hooks::register_workflow_fault_controller(
				database_branch_id,
				self.inner.faults.clone(),
			));
		let manager_workflow_id = DepotCompactionTestDriver::new(&test_ctx)
			.start_manager(database_branch_id, Some(self.inner.actor_id.clone()), true)
			.await?;
		*self.inner.manager_workflow_id.lock().await = Some(manager_workflow_id);
		Ok(manager_workflow_id)
	}

	fn with_database_blocking<T>(&self, f: impl FnOnce(&NativeDatabase) -> Result<T>) -> Result<T> {
		tokio::task::block_in_place(|| self.with_database(f))
	}

	fn with_database<T>(&self, f: impl FnOnce(&NativeDatabase) -> Result<T>) -> Result<T> {
		let database = self.inner.database.lock();
		let database = database
			.as_ref()
			.context("fault scenario database is closed")?;
		f(database)
	}

	fn close_database(&self) {
		let _ = self.inner.database.lock().take();
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

fn open_fault_database(
	handle: &tokio::runtime::Handle,
	storage: Arc<DirectStorage>,
	actor_id: &str,
) -> Result<NativeDatabase> {
	let mut config = VfsConfig::default();
	config.assert_batch_atomic = false;
	let transport = Arc::new(DirectDepotTransport::new(storage));
	let initial_main_page = handle
		.block_on(fetch_initial_main_page_for_registration(
			transport.clone(),
			actor_id,
		))
		.map_err(anyhow::Error::msg)?;
	let vfs = SqliteVfs::register_with_transport_and_initial_page(
		&super::super::next_test_name("sqlite-fault-vfs"),
		transport,
		actor_id.to_string(),
		handle.clone(),
		config,
		initial_main_page,
		None,
	)
	.map_err(anyhow::Error::msg)?;

	open_database(vfs, actor_id).map_err(anyhow::Error::msg)
}

fn query_rows(db: *mut sqlite3, sql: &str) -> Result<Vec<Vec<String>>> {
	let c_sql = CString::new(sql)?;
	let mut stmt = ptr::null_mut();
	let rc = unsafe { sqlite3_prepare_v2(db, c_sql.as_ptr(), -1, &mut stmt, ptr::null_mut()) };
	if rc != SQLITE_OK {
		bail!(
			"{sql} prepare failed with code {rc}: {}",
			sqlite_error_message(db)
		);
	}

	let mut rows = Vec::new();
	loop {
		match unsafe { sqlite3_step(stmt) } {
			SQLITE_ROW => rows.push(read_row(stmt)),
			libsqlite3_sys::SQLITE_DONE => break,
			step_rc => {
				unsafe {
					sqlite3_finalize(stmt);
				}
				bail!(
					"{sql} step failed with code {step_rc}: {}",
					sqlite_error_message(db)
				);
			}
		}
	}

	unsafe {
		sqlite3_finalize(stmt);
	}
	Ok(rows)
}

fn read_row(stmt: *mut libsqlite3_sys::sqlite3_stmt) -> Vec<String> {
	let column_count = unsafe { sqlite3_column_count(stmt) };
	(0..column_count)
		.map(|index| match unsafe { sqlite3_column_type(stmt, index) } {
			SQLITE_INTEGER => unsafe { sqlite3_column_int64(stmt, index) }.to_string(),
			SQLITE_FLOAT => unsafe { sqlite3_column_double(stmt, index) }.to_string(),
			SQLITE_TEXT => {
				let text = unsafe { sqlite3_column_text(stmt, index) };
				if text.is_null() {
					String::new()
				} else {
					unsafe { CStr::from_ptr(text.cast()) }
						.to_string_lossy()
						.into_owned()
				}
			}
			SQLITE_BLOB => {
				let blob = unsafe { sqlite3_column_blob(stmt, index) };
				let len = unsafe { sqlite3_column_bytes(stmt, index) };
				if blob.is_null() || len == 0 {
					String::new()
				} else {
					let bytes =
						unsafe { std::slice::from_raw_parts(blob.cast::<u8>(), len as usize) };
					hex_upper(bytes)
				}
			}
			SQLITE_NULL => "NULL".to_string(),
			other => format!("UNKNOWN({other})"),
		})
		.collect()
}

fn hex_upper(bytes: &[u8]) -> String {
	const HEX: &[u8; 16] = b"0123456789ABCDEF";
	let mut out = String::with_capacity(bytes.len() * 2);
	for byte in bytes {
		out.push(HEX[(byte >> 4) as usize] as char);
		out.push(HEX[(byte & 0x0f) as usize] as char);
	}
	out
}

fn sqlite_error_message(db: *mut sqlite3) -> String {
	let err = unsafe { libsqlite3_sys::sqlite3_errmsg(db) };
	if err.is_null() {
		return "unknown sqlite error".to_string();
	}
	unsafe { CStr::from_ptr(err) }
		.to_string_lossy()
		.into_owned()
}

/// Collects every key under a prefix. Test-side scan, so the whole range is materialized.
async fn scan_keys(tx: &universaldb::Transaction, prefix: Vec<u8>) -> Result<Vec<Vec<u8>>> {
	let prefix_subspace =
		universaldb::Subspace::from(universaldb::tuple::Subspace::from_bytes(prefix));
	let informal = tx.informal();
	let mut stream = informal.get_ranges_keyvalues(
		RangeOption {
			mode: StreamingMode::WantAll,
			..RangeOption::from(&prefix_subspace)
		},
		Snapshot,
	);
	let mut keys = Vec::new();
	while let Some(entry) = stream.try_next().await? {
		keys.push(entry.key().to_vec());
	}
	Ok(keys)
}
