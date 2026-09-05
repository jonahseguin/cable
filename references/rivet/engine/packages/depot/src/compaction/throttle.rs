//! Depot's use of the cluster-wide UniversalDB byte-rate throttle.
//!
//! Compaction is bulk background work over the same FoundationDB cluster that serves live traffic, so
//! a large backlog (for example compaction enabled on a cluster that accumulated big databases) can
//! saturate FDB and slow the whole engine down. Every heavy compaction transaction therefore charges
//! what it reads and writes against a shared budget and yields when that budget is spent. The
//! mechanism, including why charging is automatic and why reads and writes are charged on different
//! terms, lives in [`universaldb::throttle`]. What lives here is the policy: which budget, and how
//! much of it each caller tolerates.
//!
//! Two axes share one throttle. The **write** axis bounds bytes the compaction and reclaim paths write
//! to FDB. The **read** axis bounds bytes the bulk background transactions pull out of it, and exists
//! because a deep, overwrite-heavy delta chain can drive enormous stage-read volume onto a small
//! contiguous key range and pin a handful of storage processes on reads, independently of write
//! pressure. Both axes cover every bulk background pass, not only the one each was introduced for.
//!
//! ## Ordering the lanes
//!
//! Callers declare a [`CompactionThrottleClass`], which scales the budget the admission ramp is
//! evaluated against. Every class charges the same counters, so cluster-wide volume stays bounded by
//! one budget; the class only decides how much of that shared estimate a caller tolerates before
//! backing off. Because the estimate every class reads is the same number, ordering the classes by
//! budget orders the lanes: the lane with the smallest budget is denied first and the lane with the
//! largest keeps working through the region where the others have stopped.
//!
//! The lanes are ordered by what they do to the branch's footprint.
//!
//! [`CompactionThrottleClass::Stage`] duplicates. Hot staging folds delta history into shard images
//! written to a staging area, so a staged page exists twice: once in the DELTA history that is not
//! reclaimable until the fold installs, and once in STAGE, which is not cleared until the job
//! finishes. Staging that outruns install therefore grows FDB footprint on both sides at once, and
//! the staged output it leaves behind is work nothing else can consume. It gets the smallest budget.
//!
//! [`CompactionThrottleClass::Install`] advances without duplicating. Hot install folds staged shards
//! into the manifest, advances the hot watermark, and releases the staging area; cold publish is what
//! lets the cold watermark advance, which is the bound reclaim deletes under. It measures the same
//! estimate against the full configured budget, so it keeps admitting across the whole band where
//! `Stage` is already ramping down.
//!
//! Two callers sit in `Install` that a lane-shaped reading would put in `Stage`. Cold staging uploads
//! to object storage and writes only light metadata to FDB, so it creates no duplicate to bound.
//! And a hot slice folding directly into the shard tier
//! (`sqlite.compaction_hot_fold_direct_to_shard`) writes the authoritative image once, which is the
//! pipeline's real work rather than an amplification of it. [`hot_slice_class`] makes that second
//! choice per slice, from the same flag the fold itself reads.
//!
//! [`CompactionThrottleClass::Reclaim`] deletes. It gets a budget above the configured rate so it
//! keeps admitting through the region where every producing lane has already backed off, and its own
//! charges still land on the counter staging reads. That is what makes production yield to deletion
//! rather than the two racing at the same rate, and it stays self-regulating: idle reclaim charges
//! nothing, so the other lanes see the full budget again.
//!
//! Every multiplier and soft mark is runtime-configurable (`sqlite.compaction_*_throttle_*`), so the
//! bias can be retuned, or a lane throttled to a standstill, without a deploy. Only the reclaim
//! multiplier sits above 1.0 by default, so the configured byte rate stays an honest cap on everything
//! that produces bytes and the reclaim multiplier alone bounds how far peak pressure can exceed it.
//!
//! ## Charge-only participants
//!
//! The manager refresh charges the read axis without ever checking it. A charge and a check are
//! independent: charging keeps the estimate honest about total compaction read load, while checking
//! is what makes a caller yield. Refresh must not yield, because its snapshot carries no resume
//! cursor and the dirty marker it failed to clear wakes the manager to re-read the same range, so a
//! denial would cost a full re-read and buy nothing. Charging it anyway means the gated paths yield
//! on refresh's behalf, which is the intended direction: bulk backlog work defers to the control
//! plane rather than the reverse.

use universaldb::ThrottleClass;

/// Which compaction workload a check is made on behalf of.
///
/// Membership is by what the caller does to the branch's FoundationDB footprint, not by which
/// workflow it runs in. Hot staging moves between [`CompactionThrottleClass::Stage`] and
/// [`CompactionThrottleClass::Install`] depending on whether it is writing a second copy, and cold
/// staging is an `Install` caller despite its name because its bulk output goes to object storage.
/// Pick with [`hot_slice_class`] rather than naming a variant at a hot-slice call site.
///
/// Resolved against configuration rather than converted with `From`, because the multipliers are
/// runtime-tunable. Resolve once per activity and move the resulting [`ThrottleClass`] into the
/// transaction closure: it is `Copy`, and resolving inside the closure would let a mid-flight config
/// change give two attempts of the same transaction different budgets.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CompactionThrottleClass {
	/// Hot staging that writes a second copy: the fold lands in the staging area and hot install
	/// copies it into the live shard tier byte for byte, so the same page is in FoundationDB twice
	/// and neither copy is releasable until the install runs. Gated well below the configured budget,
	/// because that duplicate is the footprint growth the ordering exists to bound.
	///
	/// Only reachable while `sqlite.compaction_hot_fold_direct_to_shard` is off. A direct fold writes
	/// the authoritative image once and is an `Install` caller.
	Stage,
	/// The lanes that advance the pipeline without duplicating anything: hot install, cold publish,
	/// cold staging, and hot folds that write straight to the shard tier. Gated at the configured
	/// budget, so it keeps admitting across the whole band where `Stage` is already ramping down.
	///
	/// Cold staging belongs here even though it is called staging. Its heavy output is object-storage
	/// bytes, not FoundationDB rows, so it adds no duplicate to bound, and holding it back only delays
	/// the cold watermark that reclaim deletes under.
	Install,
	/// Reclaim, which deletes rather than produces. Gated at a boosted view of the same budget so it
	/// keeps admitting through the region where the producing lanes are already backing off.
	Reclaim,
}

/// The class a hot compaction slice runs under, given the fold mode it is about to use.
///
/// The staging budget exists to bound a duplicate, so it applies exactly when there is one. With
/// direct-to-shard folds the slice writes the authoritative image once and install stops copying, so
/// the slice is doing the pipeline's real work rather than amplifying it. Throttling it to the
/// staging budget in that mode would slow the fold with no duplicate to prevent.
pub fn hot_slice_class(direct_to_shard: bool) -> CompactionThrottleClass {
	if direct_to_shard {
		CompactionThrottleClass::Install
	} else {
		CompactionThrottleClass::Stage
	}
}

impl CompactionThrottleClass {
	/// The budget view this lane currently tolerates, from the config in effect right now.
	pub fn resolve(self, config: &rivet_config::Config) -> ThrottleClass {
		self.resolve_from(config.dynamic().sqlite())
	}

	/// The budget view this lane tolerates under one specific set of settings. Reach for this only
	/// where there is no `Config` to read, such as a test driving a transaction directly; everything
	/// on a real code path should go through [`CompactionThrottleClass::resolve`] so a runtime change
	/// reaches it.
	pub fn resolve_from(self, sqlite: &rivet_config::config::Sqlite) -> ThrottleClass {
		match self {
			CompactionThrottleClass::Stage => ThrottleClass {
				budget_multiplier: sqlite.compaction_stage_throttle_budget_multiplier(),
				admit_soft_util: sqlite.compaction_stage_throttle_admit_soft_util(),
			},
			CompactionThrottleClass::Install => ThrottleClass {
				budget_multiplier: sqlite.compaction_install_throttle_budget_multiplier(),
				admit_soft_util: sqlite.compaction_install_throttle_admit_soft_util(),
			},
			CompactionThrottleClass::Reclaim => ThrottleClass {
				budget_multiplier: sqlite.compaction_reclaim_throttle_budget_multiplier(),
				admit_soft_util: sqlite.compaction_reclaim_throttle_admit_soft_util(),
			},
		}
	}
}

/// How long a throttled hot slice backs off before its drain retries.
///
/// A staging slice backs off far longer than [`crate::THROTTLE_BACKOFF_MS`], which the other lanes
/// use. Admission is probabilistic, so a denied slice that retries inside the same window keeps
/// rolling dice against the estimate install and reclaim are trying to work under, and each roll it
/// wins is budget taken back from them. Backing staging off across several windows removes that
/// retry pressure rather than merely losing most of the rolls.
///
/// A direct fold is not that caller. It is not competing with install for a duplicate it created, so
/// it backs off on the ordinary terms and a long park would just stall the fold.
pub fn hot_slice_backoff_ms(config: &rivet_config::Config) -> i64 {
	let config = config.dynamic();
	let sqlite = config.sqlite();
	if sqlite.compaction_hot_fold_direct_to_shard() {
		return crate::THROTTLE_BACKOFF_MS;
	}

	sqlite.compaction_stage_throttle_backoff_ms()
}
