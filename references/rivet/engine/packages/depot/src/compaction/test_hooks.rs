#[cfg(any(debug_assertions, feature = "test-faults"))]
use std::sync::Arc;

#[cfg(any(debug_assertions, feature = "test-faults"))]
use parking_lot::Mutex;
#[cfg(debug_assertions)]
use tokio::sync::Notify;

use super::*;

#[cfg(feature = "test-faults")]
use crate::fault::{
	DepotFaultContext, DepotFaultController, DepotFaultFired, DepotFaultPoint,
	HotCompactionFaultPoint, ReclaimFaultPoint,
};

#[cfg(debug_assertions)]
static PAUSE_AFTER_HOT_STAGE: Mutex<Option<(DatabaseBranchId, Arc<Notify>, Arc<Notify>)>> =
	Mutex::new(None);

#[cfg(debug_assertions)]
pub struct PauseGuard {
	slot: &'static Mutex<Option<(DatabaseBranchId, Arc<Notify>, Arc<Notify>)>>,
}

#[cfg(debug_assertions)]
pub fn pause_after_hot_stage(
	database_branch_id: DatabaseBranchId,
) -> (PauseGuard, Arc<Notify>, Arc<Notify>) {
	let reached = Arc::new(Notify::new());
	let release = Arc::new(Notify::new());
	*PAUSE_AFTER_HOT_STAGE.lock() = Some((
		database_branch_id,
		Arc::clone(&reached),
		Arc::clone(&release),
	));

	(
		PauseGuard {
			slot: &PAUSE_AFTER_HOT_STAGE,
		},
		reached,
		release,
	)
}

#[cfg(debug_assertions)]
pub(super) async fn maybe_pause_after_hot_stage(database_branch_id: DatabaseBranchId) {
	let hook = PAUSE_AFTER_HOT_STAGE
		.lock()
		.as_ref()
		.filter(|(hook_branch_id, _, _)| *hook_branch_id == database_branch_id)
		.map(|(_, reached, release)| (Arc::clone(reached), Arc::clone(release)));

	if let Some((reached, release)) = hook {
		reached.notify_one();
		release.notified().await;
	}
}

#[cfg(not(debug_assertions))]
pub(super) async fn maybe_pause_after_hot_stage(_database_branch_id: DatabaseBranchId) {}

/// Test-only probe over the compaction FDB scan helpers. It records the width (row count) of every
/// range materialization a forced pass performs so a test can assert each read stays bounded
/// (`<= CMP_FDB_BATCH_MAX_KEYS`) independent of branch size. Measuring the FDB read directly, not the
/// (already budget-capped) output, is what catches a read that scales with branch size and would age
/// out the transaction on a large database.
///
/// The counter is process-global, so a measuring test must `reset()` before a pass and run its passes
/// serially (one in-flight forced pass at a time across the whole process).
#[cfg(feature = "test-faults")]
pub mod scan_probe {
	use parking_lot::Mutex;

	/// `tx_scan_prefix_values`: unbounded full-prefix scan (the trap the remediated reads avoid).
	pub const SCAN_PREFIX: &str = "scan_prefix";
	/// `tx_scan_range_values`: unbounded range scan.
	pub const SCAN_RANGE: &str = "scan_range";
	/// `tx_scan_range_values_limited`: range scan capped at the passed limit (the bounded form).
	pub const SCAN_RANGE_LIMITED: &str = "scan_range_limited";
	/// `tx_get_range_first`: single-row range read (`limit = 1`).
	pub const GET_RANGE_FIRST: &str = "get_range_first";

	/// `tx_get_range_last`: single-row descending range read (`limit = 1`, `reverse`).
	pub const GET_RANGE_LAST: &str = "get_range_last";

	/// Every range materialization since the last reset, as `(helper_kind, rows_returned)`. A `Vec`
	/// (not a map) per the established `test-faults` global pattern; reads derive maxima from it.
	static SCANS: Mutex<Vec<(&'static str, u64)>> = Mutex::new(Vec::new());

	pub fn record(kind: &'static str, rows: u64) {
		SCANS.lock().push((kind, rows));
	}

	pub fn reset() {
		SCANS.lock().clear();
	}

	/// Largest single range materialization across every helper since the last reset.
	pub fn max_single_scan() -> u64 {
		SCANS
			.lock()
			.iter()
			.map(|(_, rows)| *rows)
			.max()
			.unwrap_or(0)
	}

	/// Largest single range materialization for one helper kind since the last reset.
	pub fn max_for_kind(kind: &'static str) -> u64 {
		SCANS
			.lock()
			.iter()
			.filter(|(scan_kind, _)| *scan_kind == kind)
			.map(|(_, rows)| *rows)
			.max()
			.unwrap_or(0)
	}

	/// Total rows materialized across every helper since the last reset.
	pub fn rows_read() -> u64 {
		SCANS.lock().iter().map(|(_, rows)| *rows).sum()
	}
}

/// Test-only probe over shard-image reads. A dense image is ~256 KB spread over `CHUNK_SIZE` chunk
/// rows, so a planning read that materializes images it has no use for pulls far more into its
/// transaction than the row-count probes above can show. This counts every materialized image (with
/// its value bytes) plus the cheap existence probes that replace them, so a test can assert a
/// planning path reads no image bytes at all.
///
/// Counting is per thread and only while a `Capture` guard is alive, so a measuring test needs no
/// process-wide lock and cannot see another test's reads. A `#[tokio::test]` drives its transaction
/// on the test's own thread, which is what makes that scoping sufficient; work handed to a
/// multi-threaded worker is not observed.
#[cfg(any(test, feature = "test-faults"))]
pub mod shard_image_probe {
	use std::cell::RefCell;

	/// Shard-image reads observed on one thread while a `Capture` was alive.
	#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
	pub struct ShardImageReads {
		/// Shard versions whose full image was materialized.
		pub images: usize,
		/// Value bytes those images pulled into the transaction.
		pub image_bytes: u64,
		/// Existence probes, each at most one chunk row.
		pub existence_probes: usize,
	}

	thread_local! {
		static ACTIVE: RefCell<Option<ShardImageReads>> = const { RefCell::new(None) };
	}

	/// Starts counting on the calling thread until dropped.
	pub fn capture() -> Capture {
		ACTIVE.with_borrow_mut(|active| *active = Some(ShardImageReads::default()));
		Capture
	}

	pub struct Capture;

	impl Capture {
		pub fn reads(&self) -> ShardImageReads {
			ACTIVE.with_borrow(|active| active.unwrap_or_default())
		}
	}

	impl Drop for Capture {
		fn drop(&mut self) {
			ACTIVE.with_borrow_mut(|active| *active = None);
		}
	}

	pub(crate) fn record_image(value_bytes: u64) {
		ACTIVE.with_borrow_mut(|active| {
			if let Some(reads) = active.as_mut() {
				reads.images += 1;
				reads.image_bytes = reads.image_bytes.saturating_add(value_bytes);
			}
		});
	}

	pub(crate) fn record_existence_probe() {
		ACTIVE.with_borrow_mut(|active| {
			if let Some(reads) = active.as_mut() {
				reads.existence_probes += 1;
			}
		});
	}
}

/// Test-only probe over hot staging's shard-image writes. It records the bytes each stage write
/// transaction committed so a test can assert the transaction stays under `CMP_STAGE_MAX_WRITE_BYTES`
/// no matter how widely the slice's pages scatter across shards. Staging folds a whole shard image per
/// touched shard, so this write volume is not bounded by the input read budget, and an unbounded one
/// fails the activity with `transaction_too_large` on FDB.
///
/// The samples are process-global, so a measuring test must `reset()` before a pass and run its passes
/// serially. An FDB transaction retry re-records its attempt, so assert on the maximum sample rather
/// than on the sample count.
#[cfg(feature = "test-faults")]
/// Test-only probe over throttle charges. The window counters are cluster-wide and every lane ticks
/// them, so a test cannot tell from a counter delta which transaction charged what. This records the
/// charges themselves.
#[cfg(feature = "test-faults")]
pub mod throttle_probe {
	use parking_lot::Mutex;

	/// `(axis label, bytes)` for every charge since the last reset.
	static CHARGES: Mutex<Vec<(&'static str, u64)>> = Mutex::new(Vec::new());

	fn record(axis: &'static str, bytes: u64) {
		CHARGES.lock().push((axis, bytes));
	}

	/// Clears the recorded charges and makes sure this probe is what UniversalDB reports charges to.
	pub fn reset() {
		universaldb::throttle::set_charge_observer(std::sync::Arc::new(|_name, kind, bytes| {
			record(kind.as_str(), bytes)
		}));
		CHARGES.lock().clear();
	}

	/// Every byte amount charged to the read axis since the last reset.
	pub fn read_axis_charges() -> Vec<u64> {
		CHARGES
			.lock()
			.iter()
			.filter(|(axis, _)| *axis == "read")
			.map(|(_, bytes)| *bytes)
			.collect()
	}
}

pub mod stage_write_probe {
	use parking_lot::Mutex;

	/// Bytes staged by each hot stage write transaction since the last reset.
	static STAGE_WRITES: Mutex<Vec<u64>> = Mutex::new(Vec::new());
	/// FDB read bytes each hot stage write transaction measured since the last reset. Recorded
	/// independently of whether the transaction charged them, so a test can tell the two apart.
	static STAGE_WRITE_READS: Mutex<Vec<u64>> = Mutex::new(Vec::new());
	/// FDB read bytes each hot stage plan transaction measured since the last reset.
	static STAGE_PLAN_READS: Mutex<Vec<u64>> = Mutex::new(Vec::new());

	pub fn record(staged_bytes: u64) {
		STAGE_WRITES.lock().push(staged_bytes);
	}

	pub fn record_write_read(read_bytes: u64) {
		STAGE_WRITE_READS.lock().push(read_bytes);
	}

	pub fn record_plan_read(read_bytes: u64) {
		STAGE_PLAN_READS.lock().push(read_bytes);
	}

	/// Read bytes each stage write transaction moved since the last reset.
	pub fn write_read_bytes() -> Vec<u64> {
		STAGE_WRITE_READS.lock().clone()
	}

	pub fn reset() {
		STAGE_WRITES.lock().clear();
		STAGE_WRITE_READS.lock().clear();
		STAGE_PLAN_READS.lock().clear();
	}

	/// Largest single stage write transaction since the last reset.
	pub fn max_staged_bytes() -> u64 {
		STAGE_WRITES.lock().iter().copied().max().unwrap_or(0)
	}

	/// Bytes staged across every stage write transaction since the last reset.
	pub fn total_staged_bytes() -> u64 {
		STAGE_WRITES
			.lock()
			.iter()
			.copied()
			.fold(0_u64, u64::saturating_add)
	}

	/// Stage write transactions that staged anything since the last reset.
	pub fn writing_transaction_count() -> usize {
		STAGE_WRITES
			.lock()
			.iter()
			.filter(|staged_bytes| **staged_bytes > 0)
			.count()
	}
}

/// Records the shard bytes each hot install transaction copied, so tests can assert the install stays
/// under `CMP_INSTALL_MAX_WRITE_BYTES` per transaction no matter how many images one chunk staged. The
/// install copies each staged image byte for byte, so its write volume is as unbounded as staging's.
///
/// Same usage constraints as [`stage_write_probe`]: process-global samples, serial passes, assert on the
/// maximum rather than the count.
#[cfg(feature = "test-faults")]
pub mod install_write_probe {
	use parking_lot::Mutex;

	/// Bytes copied by each hot install transaction since the last reset.
	static INSTALL_WRITES: Mutex<Vec<u64>> = Mutex::new(Vec::new());

	pub fn record(copied_bytes: u64) {
		INSTALL_WRITES.lock().push(copied_bytes);
	}

	pub fn reset() {
		INSTALL_WRITES.lock().clear();
	}

	/// Largest single install transaction since the last reset.
	pub fn max_copied_bytes() -> u64 {
		INSTALL_WRITES.lock().iter().copied().max().unwrap_or(0)
	}

	/// Install transactions that copied anything since the last reset.
	pub fn copying_transaction_count() -> usize {
		INSTALL_WRITES
			.lock()
			.iter()
			.filter(|copied_bytes| **copied_bytes > 0)
			.count()
	}
}

/// Test-only re-exports of depot's throttle policy, so integration tests drive the same budget and
/// classes the compaction activities do. The mechanism itself is public API on
/// [`universaldb::Database`] and needs no hook.
#[cfg(debug_assertions)]
pub mod throttle {
	pub use crate::compaction::throttle::{CompactionThrottleClass, hot_slice_class};
}

/// Thin test-only re-export of the real reclaim plan transaction, so an integration test can drive
/// the exact scan the reclaimer performs, rather than a reconstruction of it. Used to gate that the
/// throttle is charged the transaction's real FDB read volume.
#[cfg(debug_assertions)]
pub mod reclaim {
	use anyhow::Result;
	use universaldb::Transaction;

	use crate::compaction::throttle::CompactionThrottleClass;
	use crate::compaction::types::{PlanReclaimSliceInput, PlanReclaimSliceOutput};

	/// Resolves the newest commit at or before a versionstamp, the read a bucket fork pin needs.
	pub async fn latest_commit_at_or_before_versionstamp(
		tx: &Transaction,
		branch_id: crate::types::DatabaseBranchId,
		versionstamp_cap: [u8; 16],
	) -> Result<Option<(u64, [u8; 16], crate::types::CommitRow)>> {
		crate::compaction::shared::latest_commit_at_or_before_versionstamp(
			tx,
			branch_id,
			versionstamp_cap,
		)
		.await
	}

	/// Runs the real plan pass, so a test drives the exact scan the reclaimer performs.
	pub async fn plan_slice_tx(
		tx: &Transaction,
		input: &PlanReclaimSliceInput,
		job_id: gas::prelude::Id,
		now_ms: i64,
	) -> Result<PlanReclaimSliceOutput> {
		crate::workflows::db_reclaimer::plan_reclaim_slice_tx(
			tx,
			input,
			job_id,
			now_ms,
			CompactionThrottleClass::Reclaim.resolve_from(&rivet_config::config::Sqlite::default()),
		)
		.await
	}
}

/// Drives the real policy scope resolver so tests can assert what it costs, not just what it returns.
///
/// The resolved scope was already correct before the frozen short-circuit existed; only the read
/// volume changed. A test that checks the return value alone therefore passes against the bug, so
/// pair this with `scan_probe` to assert a frozen branch resolves without scanning DBPTR.
#[cfg(debug_assertions)]
pub mod policy_scope {
	use anyhow::Result;
	use universaldb::Transaction;

	use crate::types::{BucketId, DatabaseBranchId};

	pub async fn resolve_for_branch(
		tx: &Transaction,
		branch_id: DatabaseBranchId,
	) -> Result<Option<(BucketId, String)>> {
		crate::compaction::shared::resolve_policy_scope_for_branch(tx, branch_id).await
	}
}

/// Thin test-only re-exports of the real compaction scan helpers so integration tests can drive the
/// exact unbounded and bounded reads `compaction/shared.rs` uses (byte-volume txn-window gate). The
/// helpers are `pub(crate)`; these wrappers expose them to the `tests/` crate without widening the
/// production surface.
#[cfg(feature = "test-faults")]
pub mod scan_helpers {
	use anyhow::Result;
	use universaldb::{Transaction, utils::IsolationLevel};

	/// The unbounded full-prefix scan (`tx_scan_prefix_values`): the trap a large keyspace ages out on.
	pub async fn scan_prefix_unbounded(
		tx: &Transaction,
		prefix: &[u8],
		isolation_level: IsolationLevel,
	) -> Result<Vec<(Vec<u8>, Vec<u8>)>> {
		crate::compaction::shared::tx_scan_prefix_values(tx, prefix, isolation_level).await
	}

	/// The bounded range scan (`tx_scan_range_values_limited`): caps the read at `limit` rows.
	pub async fn scan_range_limited(
		tx: &Transaction,
		start: &[u8],
		end: &[u8],
		limit: usize,
		isolation_level: IsolationLevel,
	) -> Result<Vec<(Vec<u8>, Vec<u8>)>> {
		crate::compaction::shared::tx_scan_range_values_limited(
			tx,
			start,
			end,
			limit,
			isolation_level,
		)
		.await
	}
}

/// Test-only driver for the real hot-input compaction read (`read_hot_input_snapshot`). It lets an
/// integration test prove the localized read completes on a byte-scale branch whose PIDX keyspace the
/// pre-localization full-prefix scan would age the FDB transaction out on. The wrapper reads the
/// branch's real `/META/head` and genesis compaction root inside the caller's transaction and builds
/// the default PITR policy, so the `tests/` crate does not need any crate-private compaction type.
#[cfg(feature = "test-faults")]
pub mod hot_input {
	use anyhow::{Context, Result};
	use universaldb::{Transaction, utils::IsolationLevel};

	use crate::compaction::shared::{
		read_compaction_root_or_default, read_hot_input_snapshot, tx_get_value,
	};
	use crate::keys;
	use crate::types::{DatabaseBranchId, PitrPolicy, decode_db_head};

	/// Drives `read_hot_input_snapshot` over `branch_id` and returns how many PIDX entries it
	/// materialized. After localization this is bounded by the selected slice's touched pages; the
	/// pre-localization read scanned the whole `branch_pidx_prefix` and ages the transaction out on a
	/// large branch.
	pub async fn read_hot_input_pidx_entry_count(
		tx: &Transaction,
		branch_id: DatabaseBranchId,
		now_ms: i64,
		isolation_level: IsolationLevel,
	) -> Result<usize> {
		let head = tx_get_value(tx, &keys::branch_meta_head_key(branch_id), isolation_level)
			.await?
			.as_deref()
			.map(decode_db_head)
			.transpose()
			.context("decode sqlite head for hot-input read gate")?;
		let root = read_compaction_root_or_default(tx, branch_id).await?;
		let snapshot = read_hot_input_snapshot(
			tx,
			branch_id,
			head.as_ref(),
			&root,
			None,
			None,
			isolation_level,
			PitrPolicy::from_config(&rivet_config::config::Sqlite::default()),
			now_ms,
		)
		.await?;
		Ok(snapshot.pidx_entries.len())
	}
}

#[cfg(feature = "test-faults")]
static WORKFLOW_FAULT_CONTROLLERS: Mutex<Vec<(DatabaseBranchId, DepotFaultController)>> =
	Mutex::new(Vec::new());

#[cfg(feature = "test-faults")]
static COLD_OBJECT_DELETE_GRACE_OVERRIDES: Mutex<Vec<(DatabaseBranchId, i64)>> =
	Mutex::new(Vec::new());

#[cfg(feature = "test-faults")]
static BULK_ACTIVITY_EARLY_TIMEOUT_OVERRIDES: Mutex<Vec<(DatabaseBranchId, std::time::Duration)>> =
	Mutex::new(Vec::new());

#[cfg(feature = "test-faults")]
static DIRECT_TO_SHARD_OVERRIDES: Mutex<Vec<(DatabaseBranchId, bool)>> = Mutex::new(Vec::new());

#[cfg(feature = "test-faults")]
pub struct WorkflowFaultControllerGuard {
	database_branch_id: DatabaseBranchId,
}

#[cfg(feature = "test-faults")]
pub struct ColdObjectDeleteGraceGuard {
	database_branch_id: DatabaseBranchId,
}

#[cfg(feature = "test-faults")]
pub struct BulkActivityEarlyTimeoutGuard {
	database_branch_id: DatabaseBranchId,
}

#[cfg(feature = "test-faults")]
pub struct DirectToShardGuard {
	database_branch_id: DatabaseBranchId,
}

#[cfg(feature = "test-faults")]
pub fn register_workflow_fault_controller(
	database_branch_id: DatabaseBranchId,
	controller: DepotFaultController,
) -> WorkflowFaultControllerGuard {
	let mut controllers = WORKFLOW_FAULT_CONTROLLERS.lock();
	if let Some((_, existing)) = controllers
		.iter_mut()
		.find(|(branch_id, _)| *branch_id == database_branch_id)
	{
		*existing = controller;
	} else {
		controllers.push((database_branch_id, controller));
	}

	WorkflowFaultControllerGuard { database_branch_id }
}

#[cfg(feature = "test-faults")]
pub fn override_bulk_activity_early_timeout_for_test(
	database_branch_id: DatabaseBranchId,
	early_timeout: std::time::Duration,
) -> BulkActivityEarlyTimeoutGuard {
	let mut overrides = BULK_ACTIVITY_EARLY_TIMEOUT_OVERRIDES.lock();
	if let Some((_, existing)) = overrides
		.iter_mut()
		.find(|(branch_id, _)| *branch_id == database_branch_id)
	{
		*existing = early_timeout;
	} else {
		overrides.push((database_branch_id, early_timeout));
	}

	BulkActivityEarlyTimeoutGuard { database_branch_id }
}

/// Forces one branch onto (or off) direct-to-shard folds regardless of the config flag, so a test can
/// exercise both modes without a per-test config root.
#[cfg(feature = "test-faults")]
pub fn override_direct_to_shard_for_test(
	database_branch_id: DatabaseBranchId,
	direct_to_shard: bool,
) -> DirectToShardGuard {
	let mut overrides = DIRECT_TO_SHARD_OVERRIDES.lock();
	if let Some((_, existing)) = overrides
		.iter_mut()
		.find(|(branch_id, _)| *branch_id == database_branch_id)
	{
		*existing = direct_to_shard;
	} else {
		overrides.push((database_branch_id, direct_to_shard));
	}

	DirectToShardGuard { database_branch_id }
}

#[cfg(feature = "test-faults")]
pub(crate) fn direct_to_shard(database_branch_id: DatabaseBranchId, configured: bool) -> bool {
	DIRECT_TO_SHARD_OVERRIDES
		.lock()
		.iter()
		.find(|(branch_id, _)| *branch_id == database_branch_id)
		.map(|(_, direct_to_shard)| *direct_to_shard)
		.unwrap_or(configured)
}

#[cfg(not(feature = "test-faults"))]
pub(crate) fn direct_to_shard(_database_branch_id: DatabaseBranchId, configured: bool) -> bool {
	configured
}

#[cfg(feature = "test-faults")]
pub(crate) fn bulk_activity_early_timeout(
	database_branch_id: DatabaseBranchId,
) -> std::time::Duration {
	BULK_ACTIVITY_EARLY_TIMEOUT_OVERRIDES
		.lock()
		.iter()
		.find(|(branch_id, _)| *branch_id == database_branch_id)
		.map(|(_, early_timeout)| *early_timeout)
		.unwrap_or(CMP_BULK_ACTIVITY_EARLY_TIMEOUT)
}

#[cfg(not(feature = "test-faults"))]
pub(crate) fn bulk_activity_early_timeout(
	_database_branch_id: DatabaseBranchId,
) -> std::time::Duration {
	CMP_BULK_ACTIVITY_EARLY_TIMEOUT
}

#[cfg(feature = "test-faults")]
pub(crate) async fn maybe_fire_hot_compaction_fault(
	database_branch_id: DatabaseBranchId,
	point: HotCompactionFaultPoint,
) -> Result<Option<DepotFaultFired>> {
	maybe_fire_workflow_fault(database_branch_id, DepotFaultPoint::HotCompaction(point)).await
}

#[cfg(feature = "test-faults")]
pub(crate) async fn maybe_fire_reclaim_fault(
	database_branch_id: DatabaseBranchId,
	point: ReclaimFaultPoint,
) -> Result<Option<DepotFaultFired>> {
	maybe_fire_workflow_fault(database_branch_id, DepotFaultPoint::Reclaim(point)).await
}

#[cfg(feature = "test-faults")]
async fn maybe_fire_workflow_fault(
	database_branch_id: DatabaseBranchId,
	point: DepotFaultPoint,
) -> Result<Option<DepotFaultFired>> {
	let controller = WORKFLOW_FAULT_CONTROLLERS
		.lock()
		.iter()
		.find(|(branch_id, _)| *branch_id == database_branch_id)
		.map(|(_, controller)| controller.clone());

	let Some(controller) = controller else {
		return Ok(None);
	};

	controller
		.maybe_fire(
			point,
			DepotFaultContext::new().database_branch_id(database_branch_id),
		)
		.await
}

#[cfg(debug_assertions)]
impl Drop for PauseGuard {
	fn drop(&mut self) {
		*self.slot.lock() = None;
	}
}

#[cfg(feature = "test-faults")]
impl Drop for WorkflowFaultControllerGuard {
	fn drop(&mut self) {
		let mut controllers = WORKFLOW_FAULT_CONTROLLERS.lock();
		controllers.retain(|(branch_id, _)| *branch_id != self.database_branch_id);
	}
}

#[cfg(feature = "test-faults")]
impl Drop for ColdObjectDeleteGraceGuard {
	fn drop(&mut self) {
		let mut overrides = COLD_OBJECT_DELETE_GRACE_OVERRIDES.lock();
		overrides.retain(|(branch_id, _)| *branch_id != self.database_branch_id);
	}
}

#[cfg(feature = "test-faults")]
impl Drop for BulkActivityEarlyTimeoutGuard {
	fn drop(&mut self) {
		let mut overrides = BULK_ACTIVITY_EARLY_TIMEOUT_OVERRIDES.lock();
		overrides.retain(|(branch_id, _)| *branch_id != self.database_branch_id);
	}
}

#[cfg(feature = "test-faults")]
impl Drop for DirectToShardGuard {
	fn drop(&mut self) {
		let mut overrides = DIRECT_TO_SHARD_OVERRIDES.lock();
		overrides.retain(|(branch_id, _)| *branch_id != self.database_branch_id);
	}
}
