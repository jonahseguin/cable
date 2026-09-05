use rivet_metrics::{
	GaugeGuardExt,
	prometheus::{Gauge, IntGauge, IntGaugeVec, Opts},
};

#[test]
fn decrements_when_the_guard_is_dropped() {
	let gauge = IntGauge::new("test_pending", "help").unwrap();

	{
		let _guard = gauge.inc_guard();
		assert_eq!(1, gauge.get());
	}

	assert_eq!(0, gauge.get());
}

#[test]
fn decrements_the_labeled_child_of_a_vec() {
	let gauge_vec =
		IntGaugeVec::new(Opts::new("test_labeled_pending", "help"), &["router"]).unwrap();

	{
		let _guard = gauge_vec.with_label_values(&["public"]).inc_guard();
		assert_eq!(1, gauge_vec.with_label_values(&["public"]).get());
		assert_eq!(0, gauge_vec.with_label_values(&["internal"]).get());
	}

	assert_eq!(0, gauge_vec.with_label_values(&["public"]).get());
}

#[test]
fn subtracts_the_amount_it_added() {
	let gauge = Gauge::new("test_bytes_pending", "help").unwrap();

	{
		let _guard = gauge.add_guard(2.5);
		gauge.add(1.0);
		assert_eq!(3.5, gauge.get());
	}

	assert_eq!(1.0, gauge.get());
}

#[test]
fn releases_early() {
	let gauge = IntGauge::new("test_released_pending", "help").unwrap();

	let guard = gauge.inc_guard();
	assert_eq!(1, gauge.get());
	guard.release();

	assert_eq!(0, gauge.get());
}

#[test]
fn decrements_when_dropped_by_a_panic() {
	let gauge = IntGauge::new("test_panicking_pending", "help").unwrap();

	let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
		let _guard = gauge.inc_guard();
		panic!("boom");
	}));

	assert!(result.is_err());
	assert_eq!(0, gauge.get());
}
