//! Cluster-wide byte-rate throttling for background work.
//!
//! A transaction opts in with [`crate::Transaction::charge_throttle`], and everything it reads and
//! writes is charged against a named budget automatically. Callers that want to yield to that budget
//! call [`crate::Transaction::check_throttle`], which answers from process-local state without
//! touching the database. The budget itself is a cluster-wide byte rate, so the limiter has to
//! coordinate across every worker: charges accumulate in this process and a background flusher folds
//! them into windowed counters in the database, which every process reads back to form its estimate.
//!
//! This exists because the database is the shared bottleneck. A large background backlog (for example
//! compaction enabled on a cluster that accumulated big databases) can saturate it and slow everything
//! else down, and no per-process semaphore can bound that.
//!
//! ## Charging is automatic because measuring by hand does not survive contact
//!
//! Load on the database is what a transaction pulls out of storage and what it commits, not what it
//! decides to keep. A charge derived from the candidate set a pass assembled makes every read that
//! does not land in that set free: the probes, the scans that reject rows, the proofs, and everything
//! read after the charge. Those are unbounded in database size while a candidate set is capped, so the
//! gap grows with exactly the workloads a throttle exists to protect against. Charging what the
//! transaction actually did makes the charge correct by construction and keeps it correct as the reads
//! change.
//!
//! Automatic charging covers the bytes of the operations a transaction issues. That is the whole cost
//! for reads, and for `set` and atomic mutations (including `COMPARE_AND_CLEAR`, which carries the
//! value it clears). It is not the whole cost for a range clear, which submits two keys and removes an
//! unbounded amount of data. A caller that clears ranges must add the removed volume with
//! [`crate::Transaction::charge_throttle_bytes`].
//!
//! ## Reads charge as they happen, writes charge once on commit
//!
//! An attempt that conflicts, ages out, or is dropped still pulled its bytes out of storage, so reads
//! are charged as each operation returns, against a counter the transaction resolved when it opted in.
//! A pass that keeps failing reads continuously, which is precisely when the throttle most needs to
//! see it, and an in-transaction charge would be discarded along with the attempt that made it.
//!
//! Charging per operation rather than per attempt also means a long scan is visible to the gate while
//! it is still running. Since the counter is already in hand, the cost is one atomic add on a path
//! that was incrementing an atomic anyway.
//!
//! Writes are the opposite. An aborted attempt commits nothing and costs storage nothing, so charging
//! per attempt would count a retried write once per try and silently strangle the budget. Write bytes
//! are therefore held from the most recent attempt and folded in only after the transaction commits.
//!
//! One case is charged short by design: a commit the client never hears back from is retried by the
//! driver, and if the original did land, only the retry's writes are charged. Undercounting a rare
//! duplicate is the right side to err on, because the alternative overcharges every ordinary retry.
//!
//! ## The counter is windowed, charge-only, and conflict-free
//!
//! Time is bucketed into fixed [`ThrottleConfig::window_ms`] windows, one counter key each, mutated
//! with [`MutationType::Add`]. Atomic adds from concurrent transactions commute and never conflict, and
//! nothing ever reads the counter with a read-conflict range, so the limiter adds no conflicts to the
//! database no matter how many workers charge the same key.
//!
//! An earlier design gated each charge with a serializable read of the counter so concurrent chargers
//! would serialize. That enforces the limit exactly and is a hot-key contention pattern by
//! construction: under real concurrency roughly half of all commits conflicted and retried, and it got
//! worse with more workers, which is the load the throttle exists to tame. Sharding the counter only
//! divides the collision probability rather than removing it.
//!
//! A charge-only counter also cannot drift permanently. A reserve/release counter that loses a
//! decrement (worker crash, double-counted retry) pins the limiter shut until someone restores it by
//! hand. Here there is no decrement to lose: "release" happens when the window rolls, any transient
//! over-count evaporates within a couple of windows, and the flusher clears whole windows older than
//! the current one, so there is no separate cleanup task.
//!
//! ## Sliding-window signal and probabilistic admission
//!
//! Without serialization the limiter cannot enforce the budget per instant, only the average rate. Two
//! pieces make that average smooth.
//!
//! The rate signal is a sliding-window estimate that carries the previous window forward, so it does
//! not snap to zero at each boundary and let a fresh burst through at the start of every window:
//!
//! ```text
//! estimate = prev_window * (1 - elapsed_fraction_of_current) + curr_window
//! ```
//!
//! The controller is probabilistic. A binary gate on that estimate would oscillate: every charger
//! reads the same shared estimate, so they all pass together, trip together, and back off together,
//! producing a sawtooth of bursts and dead zones. Instead each charger admits with a probability that
//! ramps linearly from 1 down to 0 as the estimate climbs from its class's soft-utilization mark to
//! that class's full budget (random early detection). Because each charger rolls its own die,
//! admissions are independent: at any instant some pass and some defer, so aggregate throughput
//! self-regulates instead of flipping on and off. Under light load the probability is 1 and nothing is
//! throttled.
//!
//! ## Why the check never reads the database
//!
//! The estimate a check needs is refreshed by the flusher anyway, so a check reads the last refreshed
//! window counters plus this process's own not-yet-flushed bytes. That removes a database round trip
//! from every gated transaction, and it lets a check be made before opening a transaction rather than
//! opening one only to discard it.
//!
//! It also tightens the gate. Cross-process visibility is bounded by the flush interval, which a
//! windowed average already tolerates. But a check that reads only the database cannot see any
//! concurrent in-flight charge at all, so every time the estimate dips a whole batch of concurrent
//! chargers passes together, adding about `concurrency * per_tx_charge` before the counter reflects any
//! of it. Counting local unflushed bytes makes the same-process share of that burst visible
//! immediately, which is most of it when background work is clustered onto a few workers.
//!
//! ## Classes
//!
//! A [`ThrottleClass`] scales the budget a check is evaluated against without changing what anything
//! charges. Every class charges the same counter, so cluster-wide volume stays bounded by one budget;
//! the class only decides how much of that shared estimate a caller tolerates before backing off.
//! This is how one workload yields to another: give the workload that must not starve a boosted view,
//! and it keeps admitting through the region where the other is already ramping down, while its own
//! charges still land on the shared counter so the arrangement stays self-regulating.

use std::{
	collections::HashMap,
	sync::{
		Arc,
		atomic::{AtomicI64, AtomicU64, Ordering},
	},
	time::Duration,
};

use anyhow::{Result, anyhow, bail};
use rand::Rng;

use crate::{
	Database,
	options::MutationType,
	utils::{
		IsolationLevel::Snapshot,
		keys::{RIVET, THROTTLE},
	},
};

/// Default width of one throttle window. The configured byte rate is enforced per window, so
/// `budget_per_window = bytes_per_second * window_ms / 1000`.
///
/// The width sets how strongly the gate smooths concurrency-driven bursts: the average overshoot is
/// roughly `concurrency * per_tx_charge / window`, which decays linearly as the window widens. Ten
/// seconds keeps that small at realistic background concurrency while staying responsive enough for a
/// background throttle. Do not shrink it toward one second without also bounding the concurrency of
/// everything that charges, or the per-window burst dominates the budget again.
pub const DEFAULT_WINDOW_MS: i64 = 10_000;

/// Default interval between flushes of locally accumulated bytes into the shared counters.
///
/// This bounds how stale one process's view of another's charges can be, and how much accumulated
/// volume a crashing process drops. Both are well inside what a windowed average tolerates at
/// [`DEFAULT_WINDOW_MS`].
pub const DEFAULT_FLUSH_INTERVAL: Duration = Duration::from_millis(1_000);

/// Which side of a transaction's cost a charge lands on. Each is a separate budget: reads and writes
/// load the database differently and are configured independently.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum ThrottleKind {
	Read,
	Write,
}

impl ThrottleKind {
	pub fn as_str(&self) -> &'static str {
		match self {
			ThrottleKind::Read => "read",
			ThrottleKind::Write => "write",
		}
	}
}

/// Which kinds a transaction charges automatically.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ThrottleCharge {
	Read,
	Write,
	Both,
}

impl ThrottleCharge {
	pub(crate) fn covers(&self, kind: ThrottleKind) -> bool {
		match (self, kind) {
			(ThrottleCharge::Both, _)
			| (ThrottleCharge::Read, ThrottleKind::Read)
			| (ThrottleCharge::Write, ThrottleKind::Write) => true,
			(ThrottleCharge::Read, ThrottleKind::Write)
			| (ThrottleCharge::Write, ThrottleKind::Read) => false,
		}
	}
}

/// How much of the shared budget one caller tolerates before it starts backing off. The configured
/// rate is unchanged by this; a boosted class simply measures the same estimate against a larger
/// denominator.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct ThrottleClass {
	/// Multiplier applied to the configured per-window budget before the admission ramp is evaluated.
	pub budget_multiplier: f64,
	/// Utilization of this class's budget below which every check admits.
	pub admit_soft_util: f64,
}

impl Default for ThrottleClass {
	fn default() -> Self {
		ThrottleClass {
			budget_multiplier: 1.0,
			admit_soft_util: 0.5,
		}
	}
}

/// Outcome of a throttle check for the current instant.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct ThrottleDecision {
	/// Whether the caller may proceed. Sampled against [`ThrottleDecision::admit_probability`]; when
	/// false the caller should back off and retry in a later window.
	pub allowed: bool,
	/// The sliding-window estimate of bytes charged over the trailing window at check time.
	pub estimate_bytes: i64,
	/// The per-window byte budget this check was evaluated against: the configured bytes-per-second
	/// scaled by the caller's class multiplier. Zero when the axis is unconfigured, which admits
	/// everything.
	pub budget_bytes: i64,
	/// The probability with which this check admitted, given the estimate and budget. Recorded for
	/// observability; `allowed` is the realized sample.
	pub admit_probability: f64,
}

impl ThrottleDecision {
	/// The decision for an axis with no configured budget: unthrottled.
	fn unconfigured() -> Self {
		ThrottleDecision {
			allowed: true,
			estimate_bytes: 0,
			budget_bytes: 0,
			admit_probability: 1.0,
		}
	}
}

/// Resolves the cluster-wide budget, in bytes per second, for one named axis. Returning `None` leaves
/// that axis unthrottled.
///
/// This is a function rather than a map so the budget can be read from hot-reloadable configuration on
/// every check, without `universaldb` depending on the configuration crate.
pub type ThrottleBudgetFn = Arc<dyn Fn(&str, ThrottleKind) -> Option<u64> + Send + Sync>;

/// Reads the current wall-clock time in epoch milliseconds. Injectable so tests can pin the window a
/// charge lands in.
pub type ThrottleClock = Arc<dyn Fn() -> i64 + Send + Sync>;

/// Called with every charge this process folds into its books, as `(throttle name, kind, bytes)`.
///
/// A charge is otherwise only visible once it is flushed and mixed with every other worker's, so this
/// is how a caller sees which of its own transactions charged what. Diagnostics only: it must not
/// mutate anything the charge path depends on.
pub type ThrottleChargeObserver = Arc<dyn Fn(&'static str, ThrottleKind, u64) + Send + Sync>;

static CHARGE_OBSERVER: std::sync::OnceLock<ThrottleChargeObserver> = std::sync::OnceLock::new();

/// Installs the process-wide charge observer. The first caller wins; later calls are ignored, so an
/// observer cannot be swapped out from under a charge in flight.
#[doc(hidden)]
pub fn set_charge_observer(observer: ThrottleChargeObserver) {
	let _ = CHARGE_OBSERVER.set(observer);
}

#[derive(Clone)]
pub struct ThrottleConfig {
	pub budget: ThrottleBudgetFn,
	pub window_ms: i64,
	/// How often the background flusher folds this process's charges into the shared counters, or
	/// `None` to run no flusher at all. Without one, nothing this process charges ever reaches the
	/// other workers, so only a caller that drives [`crate::Database::flush_throttle`] itself (a test)
	/// should turn it off.
	pub flush_interval: Option<Duration>,
	pub clock: ThrottleClock,
}

impl ThrottleConfig {
	pub fn new(budget: ThrottleBudgetFn) -> Self {
		ThrottleConfig {
			budget,
			window_ms: DEFAULT_WINDOW_MS,
			flush_interval: Some(DEFAULT_FLUSH_INTERVAL),
			clock: Arc::new(now_ms),
		}
	}

	pub fn with_window_ms(mut self, window_ms: i64) -> Self {
		self.window_ms = window_ms;
		self
	}

	pub fn with_flush_interval(mut self, flush_interval: Duration) -> Self {
		self.flush_interval = Some(flush_interval);
		self
	}

	/// Runs no background flusher, leaving the caller to drive [`crate::Database::flush_throttle`].
	/// Tests use this so a charge reaches the counters at a known point instead of on a timer.
	#[doc(hidden)]
	pub fn without_flusher(mut self) -> Self {
		self.flush_interval = None;
		self
	}

	/// Overrides the clock. Tests pin this so a charge lands in a known window.
	#[doc(hidden)]
	pub fn with_clock(mut self, clock: ThrottleClock) -> Self {
		self.clock = clock;
		self
	}
}

fn now_ms() -> i64 {
	std::time::SystemTime::now()
		.duration_since(std::time::UNIX_EPOCH)
		.map(|d| d.as_millis() as i64)
		.unwrap_or_default()
}

/// Reports a charge to the process-wide metric and to the observer, if one is installed.
///
/// Called once per attempt per axis rather than per operation: the charge itself is one atomic add on
/// a counter the transaction already holds, and a metric label lookup per read would cost more than
/// the charge does.
pub(crate) fn record_charge(name: &'static str, kind: ThrottleKind, bytes: u64) {
	if bytes == 0 {
		return;
	}

	crate::metrics::THROTTLE_CHARGED_BYTES
		.with_label_values(&[name, kind.as_str()])
		.inc_by(bytes);

	if let Some(observer) = CHARGE_OBSERVER.get() {
		observer(name, kind, bytes);
	}
}

/// One axis of one throttle. Names are code-defined `&'static str`, so this stays bounded.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
struct AxisKey {
	name: &'static str,
	kind: ThrottleKind,
}

/// How many windows one axis keeps live.
///
/// A check reads the current and previous window, so two carry the estimate. The third is slack: a
/// slot is only reused once its window is this far behind, which is far longer than a transaction can
/// live, so a transaction holding a slot's counter can never have it recycled underneath it.
const LIVE_WINDOWS: u64 = 3;

/// One window's books for one axis.
///
/// Windows are slots rather than map entries because only three are ever live. They are reused as the
/// window rolls, so there is nothing to insert, look up, or prune per window.
struct WindowSlot {
	/// The window this slot currently holds, or `u64::MAX` when it holds nothing.
	index: AtomicU64,
	/// Bytes charged locally and not yet flushed. Shared, so a transaction resolves it once and then
	/// charges with a plain atomic add.
	pending: Arc<AtomicU64>,
	/// The shared counter as of this process's last successful flush, plus what that flush contributed.
	refreshed: AtomicI64,
}

impl WindowSlot {
	fn new() -> Self {
		WindowSlot {
			index: AtomicU64::new(u64::MAX),
			pending: Arc::new(AtomicU64::new(0)),
			refreshed: AtomicI64::new(0),
		}
	}
}

/// Everything this process tracks for one axis.
///
/// Entries are never retired. Axis names are code-defined, so the map is bounded by the throttles the
/// binary declares, and an entry costs three slots of atomics. What an entry does keep costing is the
/// flush: every axis this process has ever used is refreshed on every tick, so a process that charges
/// once keeps two small reads per second running for that axis.
struct AxisState {
	windows: [WindowSlot; LIVE_WINDOWS as usize],
}

impl AxisState {
	fn new() -> Self {
		AxisState {
			windows: std::array::from_fn(|_| WindowSlot::new()),
		}
	}

	fn slot(&self, window_index: u64) -> &WindowSlot {
		&self.windows[(window_index % LIVE_WINDOWS) as usize]
	}

	/// The slot for a window, reused if it still holds an older one.
	///
	/// Reuse races with a concurrent charge to the same new window: both see the slot is stale, one
	/// claims it, and bytes the other added in between are cleared. That costs at most one burst of
	/// charges, once per window per axis, and it undercounts rather than double counts. Everything
	/// else, including every charge inside a window, is exact.
	fn slot_for_charge(&self, window_index: u64) -> &WindowSlot {
		let slot = self.slot(window_index);
		let held = slot.index.load(Ordering::Acquire);
		if held != window_index
			&& slot
				.index
				.compare_exchange(held, window_index, Ordering::AcqRel, Ordering::Acquire)
				.is_ok()
		{
			slot.pending.store(0, Ordering::Relaxed);
			slot.refreshed.store(0, Ordering::Relaxed);
		}

		slot
	}

	/// What this process knows one window holds: what the last refresh saw plus what it has charged
	/// since. A window no slot holds has nothing charged to it, so it reads as zero.
	fn estimate(&self, window_index: u64) -> i64 {
		let slot = self.slot(window_index);
		if slot.index.load(Ordering::Acquire) != window_index {
			return 0;
		}

		let pending = i64::try_from(slot.pending.load(Ordering::Relaxed)).unwrap_or(i64::MAX);

		slot.refreshed
			.load(Ordering::Relaxed)
			.saturating_add(pending)
	}
}

/// Process-local throttle accounting for one database.
///
/// Held by [`Database`] rather than in a process-wide static so several databases in one process (as
/// tests create) keep separate books and separate flushers.
pub struct ThrottleState {
	config: Option<ThrottleConfig>,
	/// One entry per axis this process uses, which is bounded by the code-defined throttle names.
	/// Nothing on the charge path touches this map: a transaction resolves its counter through it once
	/// when it opts in, then holds it.
	axes: scc::HashMap<AxisKey, Arc<AxisState>>,
}

impl ThrottleState {
	pub(crate) fn new(config: Option<ThrottleConfig>) -> Self {
		ThrottleState {
			config,
			axes: scc::HashMap::new(),
		}
	}

	/// How often this state's charges should be flushed, or `None` when throttling is disabled and
	/// there is nothing to flush.
	pub(crate) fn flush_interval(&self) -> Option<Duration> {
		self.config.as_ref()?.flush_interval
	}

	fn now_ms(&self) -> i64 {
		match &self.config {
			Some(config) => (config.clock)(),
			None => now_ms(),
		}
	}

	/// The state this process tracks for one axis, created on first use.
	fn axis(&self, axis: AxisKey) -> Arc<AxisState> {
		self.axes
			.entry_sync(axis)
			.or_insert_with(|| Arc::new(AxisState::new()))
			.get()
			.clone()
	}

	/// The counter one axis charges for the window `at_ms` falls in.
	///
	/// A transaction resolves this once, when it opts in, and holds it for the rest of the attempt.
	/// The window is therefore stamped at opt-in rather than per read, which is precise enough: an
	/// attempt cannot outlive [`crate::transaction::TXN_TIMEOUT`], so it cannot span more than one
	/// boundary, and the estimate reads the current and previous window either way.
	pub(crate) fn bucket(
		&self,
		name: &'static str,
		kind: ThrottleKind,
		at_ms: i64,
	) -> Option<Arc<AtomicU64>> {
		let config = self.config.as_ref()?;
		let axis = self.axis(AxisKey { name, kind });
		let window_index = window_index(at_ms, config.window_ms);

		Some(axis.slot_for_charge(window_index).pending.clone())
	}

	/// Samples the admission gate for one axis from process-local state. Reads nothing from the
	/// database.
	pub(crate) fn check(
		&self,
		name: &'static str,
		kind: ThrottleKind,
		class: ThrottleClass,
	) -> ThrottleDecision {
		let Some(config) = &self.config else {
			return ThrottleDecision::unconfigured();
		};
		let Some(bytes_per_second) = (config.budget)(name, kind) else {
			return ThrottleDecision::unconfigured();
		};

		let now = self.now_ms();
		let axis = self.axis(AxisKey { name, kind });

		let budget_bytes = class_budget_bytes(
			budget_bytes_per_window(bytes_per_second, config.window_ms),
			class,
		);
		let estimate_bytes = sliding_estimate(&axis, config, now);

		let admit_probability =
			admit_probability(estimate_bytes, budget_bytes, class.admit_soft_util);
		let allowed = rand::thread_rng().gen_range(0.0f64..1.0) < admit_probability;

		crate::metrics::THROTTLE_DECISIONS
			.with_label_values(&[
				name,
				kind.as_str(),
				if allowed { "admitted" } else { "denied" },
			])
			.inc();

		ThrottleDecision {
			allowed,
			estimate_bytes,
			budget_bytes,
			admit_probability,
		}
	}

	/// Folds this process's accumulated bytes into the shared counters and refreshes the estimate
	/// every check reads.
	///
	/// Nothing is lost if the transaction fails: the drained bytes go back on the books and the next
	/// flush carries them. Bytes that have aged past the window a check can consult are dropped
	/// instead, because no check will ever look at them again.
	pub async fn flush(&self, db: &Database) -> Result<()> {
		let Some(config) = &self.config else {
			return Ok(());
		};

		let now = self.now_ms();
		let index = window_index(now, config.window_ms);

		// Take what each counter holds and leave the counter itself in place: a transaction that opted
		// in is still holding it and will keep adding through the rest of its attempt. Slots are reused
		// as their window rolls, so nothing here needs cleaning up.
		//
		// Every axis is collected, not just the ones charged this tick. A tick with nothing to charge
		// still issues no atomic adds, but it does still refresh the estimate and clear stale windows,
		// which is what a caller that only ever checks depends on and what retires the last windows an
		// axis wrote before it went quiet.
		let mut axes = Vec::new();
		let mut drained = Vec::new();
		self.axes.iter_sync(|key, axis| {
			axes.push(*key);
			let mut pending = 0u64;
			for slot in &axis.windows {
				let window_index = slot.index.load(Ordering::Acquire);
				let bytes = slot.pending.swap(0, Ordering::Relaxed);
				if bytes == 0 {
					continue;
				}

				// A window two or more behind the current one is never read by any check again, here
				// or on any other worker. Dropping those bytes is the one path that silently
				// under-counts, so it is reported rather than only logged.
				if window_index + 1 >= index {
					pending = pending.saturating_add(bytes);
					drained.push((*key, window_index, bytes));
				} else {
					tracing::warn!(
						throttle = key.name,
						kind = key.kind.as_str(),
						bytes,
						"dropping throttle bytes that aged out before they could be flushed"
					);
					crate::metrics::THROTTLE_DROPPED_BYTES
						.with_label_values(&[key.name, key.kind.as_str()])
						.inc_by(bytes);
				}
			}

			crate::metrics::THROTTLE_PENDING_BYTES
				.with_label_values(&[key.name, key.kind.as_str()])
				.set(i64::try_from(pending).unwrap_or(i64::MAX));

			true
		});
		if axes.is_empty() {
			return Ok(());
		}

		let axes_for_tx = axes.clone();
		let drained_for_tx = drained.clone();
		// Default priority on purpose. This transaction is two small reads and a handful of atomic
		// adds, and batch priority is throttled hardest exactly when the cluster is loaded, which is
		// when the estimate most needs to be current.
		let result = db
			.txn("udb_throttle_flush", move |tx| {
				let axes = axes_for_tx.clone();
				let drained = drained_for_tx.clone();
				async move {
					// Read before charging, so the refreshed value plus what this flush adds is the
					// post-flush total on every driver, without relying on reading back an atomic
					// mutation the transaction has not committed.
					let mut read = HashMap::new();
					for axis in axes.iter().copied() {
						for window_index in
							[index.checked_sub(1), Some(index)].into_iter().flatten()
						{
							read.insert(
								(axis, window_index),
								read_window(&tx, axis, window_index).await?,
							);
						}
					}

					for (axis, window_index, bytes) in &drained {
						let delta = i64::try_from(*bytes).unwrap_or(i64::MAX);
						tx.informal().atomic_op(
							&window_counter_key(axis.name, axis.kind, *window_index),
							&delta.to_le_bytes(),
							MutationType::Add,
						);
					}

					// Clear whole windows no check can consult any more. This keeps at most a few
					// windows live with no separate cleanup task.
					for axis in axes.iter().copied() {
						for stale_offset in [2u64, 3u64] {
							if let Some(window_index) = index.checked_sub(stale_offset) {
								tx.informal().clear(&window_counter_key(
									axis.name,
									axis.kind,
									window_index,
								));
							}
						}
					}

					Ok(read)
				}
			})
			.await;

		let read = match result {
			Ok(read) => read,
			Err(err) => {
				crate::metrics::THROTTLE_FLUSH
					.with_label_values(&["error"])
					.inc();

				// Put the bytes back rather than dropping them. An unreported charge is a throttle
				// that under-counts precisely when the database is unhealthy.
				for (axis, window_index, bytes) in drained {
					self.axis(axis)
						.slot_for_charge(window_index)
						.pending
						.fetch_add(bytes, Ordering::Relaxed);
				}

				return Err(err);
			}
		};

		// The refreshed estimate is what the flush read plus what it just added, so a check made before
		// the next flush counts this process's own contribution exactly once.
		let mut flushed: HashMap<(AxisKey, u64), i64> = HashMap::new();
		for (axis, window_index, bytes) in drained {
			*flushed.entry((axis, window_index)).or_default() +=
				i64::try_from(bytes).unwrap_or(i64::MAX);
		}
		for ((axis, window_index), value) in read {
			let total = value.saturating_add(flushed.remove(&(axis, window_index)).unwrap_or(0));
			self.axis(axis)
				.slot_for_charge(window_index)
				.refreshed
				.store(total, Ordering::Relaxed);
		}

		crate::metrics::THROTTLE_FLUSH
			.with_label_values(&["ok"])
			.inc();

		// Sampled once per flush, so saturation is visible without anyone having to check. Which of
		// the two moved answers the first question of any incident: whether the load grew or the
		// budget shrank.
		for axis in axes {
			let state = self.axis(axis);
			crate::metrics::THROTTLE_ESTIMATE_BYTES
				.with_label_values(&[axis.name, axis.kind.as_str()])
				.set(sliding_estimate(&state, config, now));
			if let Some(bytes_per_second) = (config.budget)(axis.name, axis.kind) {
				crate::metrics::THROTTLE_BUDGET_BYTES
					.with_label_values(&[axis.name, axis.kind.as_str()])
					.set(budget_bytes_per_window(bytes_per_second, config.window_ms));
			}
		}

		Ok(())
	}
}

/// The cluster-wide bytes charged to one axis over the trailing window, as this process knows it.
///
/// The previous window is weighted by the fraction of the current one that has not yet elapsed, so the
/// estimate is a smooth trailing sum rather than one that snaps to zero at each boundary.
fn sliding_estimate(axis: &AxisState, config: &ThrottleConfig, now_ms: i64) -> i64 {
	let index = window_index(now_ms, config.window_ms);
	let curr = axis.estimate(index);
	let prev = match index.checked_sub(1) {
		Some(prev_index) => axis.estimate(prev_index),
		None => 0,
	};

	let elapsed_ms = now_ms.rem_euclid(config.window_ms);
	let prev_weighted =
		(prev as i128) * ((config.window_ms - elapsed_ms) as i128) / (config.window_ms as i128);

	i64::try_from(prev_weighted + curr as i128).unwrap_or(i64::MAX)
}

/// Linearly ramps the admit probability from 1 down to 0 as the estimate climbs from `soft_util` of
/// the budget up to the full budget. Below the soft mark everything is admitted; at or above budget
/// nothing is. A non-positive budget admits nothing, so callers must treat an unconfigured axis as
/// unthrottled before reaching here.
pub fn admit_probability(estimate_bytes: i64, budget_bytes: i64, soft_util: f64) -> f64 {
	if budget_bytes <= 0 {
		return 0.0;
	}

	let util = estimate_bytes as f64 / budget_bytes as f64;
	if util <= soft_util {
		1.0
	} else if util >= 1.0 {
		0.0
	} else {
		(1.0 - util) / (1.0 - soft_util)
	}
}

/// Per-window byte budget for a configured bytes-per-second rate.
fn budget_bytes_per_window(bytes_per_second: u64, window_ms: i64) -> i64 {
	let per_window = (bytes_per_second as u128) * (window_ms.max(0) as u128) / 1000;
	i64::try_from(per_window).unwrap_or(i64::MAX)
}

/// The per-window budget as one class sees it.
fn class_budget_bytes(budget_bytes: i64, class: ThrottleClass) -> i64 {
	let scaled = (budget_bytes as f64 * class.budget_multiplier).round();
	if scaled >= i64::MAX as f64 {
		i64::MAX
	} else {
		scaled as i64
	}
}

/// Window index a timestamp falls in. Distinct windows own distinct counter keys.
#[doc(hidden)]
pub fn window_index(now_ms: i64, window_ms: i64) -> u64 {
	(now_ms / window_ms.max(1)).max(0) as u64
}

/// The counter key one axis uses for one window. Exposed so tests and diagnostics can read what a
/// flush wrote.
#[doc(hidden)]
pub fn window_counter_key(name: &str, kind: ThrottleKind, window_index: u64) -> Vec<u8> {
	static SUBSPACE: std::sync::LazyLock<crate::utils::Subspace> =
		std::sync::LazyLock::new(|| crate::utils::Subspace::new(&(RIVET, THROTTLE)));

	SUBSPACE.pack(&(name, kind.as_str(), window_index))
}

/// Snapshot-reads one window counter, treating an absent key as zero. `Snapshot` takes no
/// read-conflict range, so the flush cannot be aborted by concurrent chargers.
async fn read_window(tx: &crate::Transaction, axis: AxisKey, window_index: u64) -> Result<i64> {
	let key = window_counter_key(axis.name, axis.kind, window_index);
	let Some(value) = tx.informal().get(&key, Snapshot).await? else {
		return Ok(0);
	};

	let bytes: [u8; std::mem::size_of::<i64>()] =
		Vec::from(value).try_into().map_err(|value: Vec<u8>| {
			anyhow!(
				"throttle window counter had {} bytes, expected {}",
				value.len(),
				std::mem::size_of::<i64>()
			)
		})?;

	Ok(i64::from_le_bytes(bytes))
}

/// Throttle context attached to every transaction [`Database::txn`] runs, shared across that
/// transaction's attempts.
pub(crate) struct ThrottleTxn {
	pub(crate) state: Arc<ThrottleState>,
	/// Set by [`crate::Transaction::charge_throttle`]. Identical on every attempt, because every
	/// attempt runs the same closure.
	registration: std::sync::OnceLock<(&'static str, ThrottleCharge)>,
	/// Whether this transaction runs under the retry loop, which is what makes a write charge
	/// possible: only the loop knows whether anything committed.
	managed: bool,
	/// Write bytes of the most recent attempt, and the window they were incurred in. Overwritten per
	/// attempt and charged only if the transaction commits.
	last_write_bytes: AtomicU64,
	last_write_window_ms: AtomicI64,
}

impl ThrottleTxn {
	pub(crate) fn new(state: Arc<ThrottleState>, managed: bool) -> Self {
		ThrottleTxn {
			state,
			registration: std::sync::OnceLock::new(),
			managed,
			last_write_bytes: AtomicU64::new(0),
			last_write_window_ms: AtomicI64::new(0),
		}
	}

	pub(crate) fn register(&self, name: &'static str, charge: ThrottleCharge) -> Result<()> {
		if !self.managed {
			bail!(
				"`charge_throttle` requires a transaction run by `Database::txn`; a manually \
				 created transaction has no commit outcome to charge against"
			);
		}

		// The closure re-runs per attempt, so the same opt-in arrives once per attempt. Registering the
		// same throttle again is that, not a mistake; registering a different one would silently
		// misattribute the charge.
		match self.registration.get() {
			Some(existing) if *existing == (name, charge) => Ok(()),
			Some((existing_name, _)) => bail!(
				"transaction is already charging throttle {existing_name:?}; opt into one throttle 				 per transaction"
			),
			None => {
				let _ = self.registration.set((name, charge));

				Ok(())
			}
		}
	}

	fn registration(&self) -> Option<(&'static str, ThrottleCharge)> {
		self.registration.get().copied()
	}

	/// The counter this attempt's reads charge, for the transaction to hold and add to directly.
	pub(crate) fn read_bucket(&self, name: &'static str) -> Option<Arc<AtomicU64>> {
		self.state
			.bucket(name, ThrottleKind::Read, self.state.now_ms())
	}

	/// Reports what the attempt read and remembers what it wrote. Called as the attempt ends, on every
	/// path including a dropped future.
	///
	/// The reads are already charged, one atomic add at a time, against the counter the transaction
	/// holds. What happens here is only reporting them: once per attempt, rather than paying for a
	/// metric label lookup on every read.
	pub(crate) fn end_attempt(&self, read_bytes: u64, write_bytes: u64) {
		let Some((name, charge)) = self.registration() else {
			return;
		};

		let at_ms = self.state.now_ms();
		if charge.covers(ThrottleKind::Read) {
			record_charge(name, ThrottleKind::Read, read_bytes);
		}
		if charge.covers(ThrottleKind::Write) {
			self.last_write_bytes.store(write_bytes, Ordering::Relaxed);
			self.last_write_window_ms.store(at_ms, Ordering::Relaxed);
		}
	}

	/// Charges what the committed attempt wrote. Called only after the transaction commits.
	pub(crate) fn commit(&self) {
		let Some((name, charge)) = self.registration() else {
			return;
		};
		if !charge.covers(ThrottleKind::Write) {
			return;
		}

		let bytes = self.last_write_bytes.swap(0, Ordering::Relaxed);
		if bytes == 0 {
			return;
		}

		// Stamped with the window the attempt ended in, not the one it commits in, so a transaction
		// that straddles a boundary charges where the work happened.
		let at_ms = self.last_write_window_ms.load(Ordering::Relaxed);
		let Some(counter) = self.state.bucket(name, ThrottleKind::Write, at_ms) else {
			return;
		};

		counter.fetch_add(bytes, Ordering::Relaxed);
		record_charge(name, ThrottleKind::Write, bytes);
	}
}
