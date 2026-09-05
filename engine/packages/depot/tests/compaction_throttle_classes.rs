//! Depot's compaction throttle classes.
//!
//! The limiter itself lives in `universaldb::throttle` and is covered by that crate's tests. What is
//! depot policy, and what this file gates, is the relationship between the lanes: staging produces
//! bytes that only install can consume and only reclaim can delete, so staging has to stop admitting
//! well before either of them does. Otherwise a branch stages new data at least as fast as it installs
//! and deletes old data, and its FDB footprint never comes down.
//!
//! Admission is probabilistic, so these drive the deterministic regions (below the soft mark the
//! probability is 1, at or above budget it is 0) and assert on the probability rather than sampling.

mod common;

use anyhow::Result;
use depot::workflows::compaction::test_hooks::throttle::{
	CompactionThrottleClass, hot_slice_class,
};
use rivet_config::config::{DEPOT_COMPACTION_THROTTLE, Sqlite};
use universaldb::{ThrottleCharge, ThrottleClass, ThrottleKind};

/// Fixed wall clock, so a charge lands in a known window.
const NOW_MS: i64 = 1_700_000_000_000;
const BYTES_PER_SECOND: u64 = 1_000;

/// Per-window byte budget, as the throttle derives it.
fn budget() -> i64 {
	BYTES_PER_SECOND as i64 * universaldb::throttle::DEFAULT_WINDOW_MS / 1000
}

/// The class each lane resolves to under default settings.
fn class(class: CompactionThrottleClass) -> ThrottleClass {
	class.resolve_from(&Sqlite::default())
}

/// Charges the write axis and flushes, so the charge is on the shared counter.
async fn charge(db: &universaldb::Database, bytes: u64) -> Result<()> {
	db.txn("test_charge", move |tx| async move {
		tx.charge_throttle(DEPOT_COMPACTION_THROTTLE, ThrottleCharge::Write)?;
		tx.charge_throttle_bytes(ThrottleKind::Write, bytes);

		Ok(())
	})
	.await?;

	db.flush_throttle().await
}

/// Scales a byte count by a fraction of the per-window budget.
fn budget_fraction(fraction: f64) -> u64 {
	u64::try_from((budget() as f64 * fraction).round() as i64).expect("fraction fits u64")
}

#[tokio::test]
async fn install_and_reclaim_still_admit_where_staging_is_denied() -> Result<()> {
	let db =
		common::test_db_with_throttle("depot-throttle-classes", BYTES_PER_SECOND, NOW_MS).await?;
	let budget = budget();

	// Fill the window to the configured budget, the state a compaction backlog settles into.
	charge(&db, u64::try_from(budget).expect("budget fits u64")).await?;

	// Staging measures that estimate against a fraction of the budget and stops entirely.
	let decision = db.check_throttle(
		DEPOT_COMPACTION_THROTTLE,
		ThrottleKind::Write,
		class(CompactionThrottleClass::Stage),
	);
	assert_eq!(decision.estimate_bytes, budget);
	assert!(
		decision.budget_bytes < budget,
		"staging must measure against less than the configured budget"
	);
	assert_eq!(
		decision.admit_probability, 0.0,
		"staging must be fully denied at the configured budget"
	);

	// Install measures the same estimate against the full budget. It is at its own ramp's end here,
	// but everything below is where it keeps working and staging does not.
	let decision = db.check_throttle(
		DEPOT_COMPACTION_THROTTLE,
		ThrottleKind::Write,
		class(CompactionThrottleClass::Install),
	);
	assert_eq!(
		decision.estimate_bytes, budget,
		"every class reads one shared counter"
	);
	assert_eq!(decision.budget_bytes, budget);

	// Reclaim measures the same estimate against a boosted budget, so it keeps deleting.
	let decision = db.check_throttle(
		DEPOT_COMPACTION_THROTTLE,
		ThrottleKind::Write,
		class(CompactionThrottleClass::Reclaim),
	);
	assert!(decision.budget_bytes > budget);
	assert_eq!(
		decision.admit_probability, 1.0,
		"reclaim must still admit at the configured budget"
	);

	// Reclaim is not unbounded: its own deletes raise the same estimate past its own budget.
	charge(&db, u64::try_from(budget).expect("budget fits u64")).await?;
	let decision = db.check_throttle(
		DEPOT_COMPACTION_THROTTLE,
		ThrottleKind::Write,
		class(CompactionThrottleClass::Reclaim),
	);
	assert_eq!(
		decision.admit_probability, 0.0,
		"reclaim must stop at its own boosted budget"
	);

	Ok(())
}

#[tokio::test]
async fn staging_is_denied_while_install_is_fully_admitted() -> Result<()> {
	let db = common::test_db_with_throttle("depot-throttle-stage-band", BYTES_PER_SECOND, NOW_MS)
		.await?;
	let stage = class(CompactionThrottleClass::Stage);

	// Charge to just past where staging's ramp ends. This is the band the whole change exists for:
	// the lane that produces bytes has stopped while the lanes that consume and delete them have not
	// started backing off at all.
	charge(&db, budget_fraction(stage.budget_multiplier)).await?;

	let decision = db.check_throttle(DEPOT_COMPACTION_THROTTLE, ThrottleKind::Write, stage);
	assert_eq!(
		decision.admit_probability, 0.0,
		"staging must be fully denied at its own budget"
	);

	for lane in [
		CompactionThrottleClass::Install,
		CompactionThrottleClass::Reclaim,
	] {
		let decision =
			db.check_throttle(DEPOT_COMPACTION_THROTTLE, ThrottleKind::Write, class(lane));
		assert_eq!(
			decision.admit_probability, 1.0,
			"{lane:?} must be fully admitted where staging is denied"
		);
	}

	Ok(())
}

#[test]
fn lane_budgets_are_ordered_by_what_each_lane_does_to_the_footprint() {
	let stage = class(CompactionThrottleClass::Stage);
	let install = class(CompactionThrottleClass::Install);
	let reclaim = class(CompactionThrottleClass::Reclaim);

	// Staging produces, install consumes, reclaim deletes. Every class reads the same shared estimate,
	// so ordering the budgets is what orders the lanes.
	assert!(
		stage.budget_multiplier < install.budget_multiplier,
		"staging must be denied before install is"
	);
	assert!(
		install.budget_multiplier < reclaim.budget_multiplier,
		"install must be denied before reclaim is"
	);

	// Each lane must be fully admitted across the whole band where the lane below it ramps down,
	// rather than merely ramping down more slowly. That holds exactly when its soft mark, expressed in
	// the lower lane's budget units, is at or above that lane's full budget.
	assert!(
		install.admit_soft_util * install.budget_multiplier >= stage.budget_multiplier,
		"install must be fully admitted at staging's full budget"
	);
	assert!(
		reclaim.admit_soft_util * reclaim.budget_multiplier >= install.budget_multiplier,
		"reclaim must be fully admitted at install's full budget"
	);

	// And every lane must keep a real ramp of its own rather than a cliff.
	for lane in [stage, install, reclaim] {
		assert!(lane.admit_soft_util < 1.0);
	}
}

#[test]
fn a_hot_slice_leaves_the_staging_budget_when_it_stops_duplicating() {
	// The staging budget exists to bound a second copy of every folded page. A direct-to-shard fold
	// writes the authoritative image once, so there is no duplicate and the slice must not be held to
	// the staging budget: doing so would slow the fold with nothing to prevent.
	assert_eq!(hot_slice_class(false), CompactionThrottleClass::Stage);
	assert_eq!(hot_slice_class(true), CompactionThrottleClass::Install);

	let staging = class(hot_slice_class(false));
	let direct = class(hot_slice_class(true));
	assert!(
		direct.budget_multiplier > staging.budget_multiplier,
		"a direct fold must measure against a larger budget than a duplicating one"
	);
}
