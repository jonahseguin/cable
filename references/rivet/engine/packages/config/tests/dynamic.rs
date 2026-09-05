use rivet_config::{
	Config, DynamicConfigUpdate,
	config::{Root, Sqlite},
};

fn config_with_admission_percent(percent: f64) -> Config {
	Config::from_root(Root {
		sqlite: Some(Sqlite {
			compaction_admission_percent: Some(percent),
			..Sqlite::default()
		}),
		..Root::default()
	})
}

#[test]
fn reading_a_property_dynamically_is_opt_in() {
	let config = config_with_admission_percent(10.0);

	config
		.apply_dynamic(&DynamicConfigUpdate {
			compaction_admission_percent: Some(Some(80.0)),
			..DynamicConfigUpdate::default()
		})
		.expect("valid update");

	// Dereferencing keeps serving the value loaded at startup, so an existing call site cannot pick
	// up a runtime change by accident.
	assert_eq!(config.sqlite().compaction_admission_percent, Some(10.0));
	assert_eq!(
		config.dynamic().sqlite().compaction_admission_percent,
		Some(80.0)
	);
}

#[test]
fn clearing_a_property_reverts_to_the_loaded_value() {
	let config = config_with_admission_percent(10.0);

	config
		.apply_dynamic(&DynamicConfigUpdate {
			compaction_admission_percent: Some(Some(80.0)),
			..DynamicConfigUpdate::default()
		})
		.expect("valid update");
	config
		.apply_dynamic(&DynamicConfigUpdate {
			compaction_admission_percent: Some(None),
			..DynamicConfigUpdate::default()
		})
		.expect("valid update");

	assert_eq!(
		config.dynamic().sqlite().compaction_admission_percent,
		Some(10.0)
	);
}

#[test]
fn an_absent_property_leaves_the_current_value_alone() {
	let config = config_with_admission_percent(10.0);

	config
		.apply_dynamic(&DynamicConfigUpdate {
			compaction_admission_percent: Some(Some(80.0)),
			..DynamicConfigUpdate::default()
		})
		.expect("valid update");
	config
		.apply_dynamic(&DynamicConfigUpdate {
			..DynamicConfigUpdate::default()
		})
		.expect("valid update");

	let dynamic = config.dynamic();
	assert_eq!(dynamic.sqlite().compaction_admission_percent, Some(80.0));
}

#[test]
fn an_invalid_update_is_rejected_and_changes_nothing() {
	let config = config_with_admission_percent(10.0);

	// The update goes through the same validation as a config loaded from disk.
	config
		.apply_dynamic(&DynamicConfigUpdate {
			compaction_admission_percent: Some(Some(150.0)),
			..DynamicConfigUpdate::default()
		})
		.expect_err("percent above 100 must be rejected");
	config
		.apply_dynamic(&DynamicConfigUpdate {
			compaction_write_bytes_per_second: Some(Some(0)),
			..DynamicConfigUpdate::default()
		})
		.expect_err("a zero write budget stalls compaction and must be rejected");

	assert_eq!(
		config.dynamic().sqlite().compaction_admission_percent,
		Some(10.0)
	);
}

#[test]
fn an_update_message_round_trips_as_json() {
	let update = DynamicConfigUpdate {
		compaction_admission_percent: Some(Some(80.0)),
		..DynamicConfigUpdate::default()
	};

	let encoded = serde_json::to_string(&update).expect("encodes");
	let decoded: DynamicConfigUpdate = serde_json::from_str(&encoded).expect("decodes");

	// Absent, cleared, and set must survive the wire as three distinct states.
	assert_eq!(decoded, update);
	assert_eq!(decoded.compaction_write_bytes_per_second, None);
}

/// The `runtime` properties are private, so the loaded config comes through deserialization the
/// same way it would from a config file.
fn config_with_max_concurrent_foo() -> Config {
	Config::from_root(
		serde_json::from_value::<Root>(serde_json::json!({
			"runtime": { "worker_max_concurrent_workflows": { "foo": 5 } },
		}))
		.expect("valid config"),
	)
}

fn max_concurrent_update(entries: [(&str, Option<usize>); 1]) -> DynamicConfigUpdate {
	DynamicConfigUpdate {
		worker_max_concurrent_workflows: Some(
			entries
				.into_iter()
				.map(|(name, max)| (name.to_string(), max))
				.collect(),
		),
		..DynamicConfigUpdate::default()
	}
}

#[test]
fn max_concurrent_workflows_overrides_one_name_at_a_time() {
	let config = config_with_max_concurrent_foo();

	config
		.apply_dynamic(&max_concurrent_update([("bar", Some(7))]))
		.expect("valid update");

	let dynamic = config.dynamic();
	let max_concurrent = dynamic.runtime.worker_max_concurrent_workflows();

	// The name that was not in the update keeps its loaded value, and the built in defaults for
	// names nobody configured still apply.
	assert_eq!(max_concurrent.get("foo"), Some(&5));
	assert_eq!(max_concurrent.get("bar"), Some(&7));
	assert_eq!(max_concurrent.get("depot_db_manager3"), Some(&100));
}

#[test]
fn clearing_one_max_concurrent_workflow_reverts_only_that_name() {
	let config = config_with_max_concurrent_foo();

	config
		.apply_dynamic(&max_concurrent_update([("foo", Some(50))]))
		.expect("valid update");
	config
		.apply_dynamic(&max_concurrent_update([("bar", Some(7))]))
		.expect("valid update");
	config
		.apply_dynamic(&max_concurrent_update([("foo", None)]))
		.expect("valid update");

	let dynamic = config.dynamic();
	let max_concurrent = dynamic.runtime.worker_max_concurrent_workflows();

	assert_eq!(max_concurrent.get("foo"), Some(&5));
	assert_eq!(max_concurrent.get("bar"), Some(&7));

	// Clearing a name that was never in the config file removes it entirely.
	config
		.apply_dynamic(&max_concurrent_update([("bar", None)]))
		.expect("valid update");
	assert_eq!(
		config
			.dynamic()
			.runtime
			.worker_max_concurrent_workflows()
			.get("bar"),
		None
	);
}
