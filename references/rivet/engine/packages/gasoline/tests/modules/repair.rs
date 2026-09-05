//! Tests for `db::kv::repair` internals. Included from the source module via a `#[path]` shim
//! because the insertion coordinate and error parsing are private to a private module, and getting
//! either wrong writes a corrupt event into a customer's workflow history.

use super::*;

fn coord(parts: &[usize]) -> Coordinate {
	Coordinate::new(parts.to_vec().into_boxed_slice())
}

/// Every branch of `history::cursor::Cursor::current_location_for` for `HistoryResult::Insertion`.
/// These must stay identical or a repaired workflow diverges again on replay.
#[test]
fn insertion_coordinate_matches_cursor() {
	// Same cardinality, prev + .1.
	assert_eq!(
		insertion_coordinate(Some(&coord(&[1])), &coord(&[2])),
		coord(&[1, 1])
	);
	// Previous is shorter, prev + .0.1.
	assert_eq!(
		insertion_coordinate(Some(&coord(&[1])), &coord(&[1, 1])),
		coord(&[1, 0, 1])
	);
	// Previous is longer, increment its tail.
	assert_eq!(
		insertion_coordinate(Some(&coord(&[1, 2])), &coord(&[2])),
		coord(&[1, 3])
	);
}

/// With no predecessor the cursor starts from the coordinate `0` left-most bound, which is the only
/// place a `0` coordinate exists.
#[test]
fn insertion_coordinate_without_predecessor_starts_at_zero() {
	assert_eq!(insertion_coordinate(None, &coord(&[2])), coord(&[0, 1]));
	assert_eq!(insertion_coordinate(None, &coord(&[1])), coord(&[0, 1]));
}

/// Gasoline replays a branch in coordinate order, so the inserted event has to sort strictly
/// between its predecessor and the event it runs before.
#[test]
fn insertion_coordinate_sorts_between_neighbors() {
	let cases = [
		(Some(coord(&[1])), coord(&[2])),
		(Some(coord(&[1])), coord(&[1, 1])),
		(Some(coord(&[1, 2])), coord(&[2])),
		(None, coord(&[1])),
	];

	for (previous, current) in cases {
		let inserted = insertion_coordinate(previous.as_ref(), &current);

		if let Some(previous) = &previous {
			assert!(
				previous < &inserted,
				"{inserted} does not sort after {previous}"
			);
		}
		assert!(
			inserted < current,
			"{inserted} does not sort before {current}"
		);
	}
}

#[test]
fn parses_the_deallocate_divergence() {
	let location = parse_deallocate_divergence(
		r#"history diverged: expected activity "deallocate" at {10, 231, 2}, found activity "set_error""#,
	)
	.expect("error should parse");

	assert_eq!(location.to_string(), "{10, 231, 2}");
}

#[test]
fn parses_a_divergence_with_multi_part_coordinates() {
	let location = parse_deallocate_divergence(
		r#"history diverged: expected activity "deallocate" at {10, 231, 1.2}, found activity "set_error""#,
	)
	.expect("error should parse");

	assert_eq!(location.to_string(), "{10, 231, 1.2}");
}

/// Anything that is not this exact divergence must not select this repair. It inserts an event, so
/// matching the wrong error writes history into a workflow that did not ask for it.
#[test]
fn rejects_other_errors() {
	let cases = [
		// A different pair of activities.
		r#"history diverged: expected activity "allocate" at {10, 231, 2}, found activity "set_error""#,
		r#"history diverged: expected activity "deallocate" at {10, 231, 2}, found activity "get_ts""#,
		// The inverse divergence, which the orphaned sleep state repair handles.
		"missing event data: event_type",
		// A version mismatch rather than a name mismatch.
		r#"history diverged: expected activity "deallocate" v1 at {10, 231, 2}, found activity "set_error" v2"#,
		// Not a divergence at all.
		"workflow evicted",
		"",
	];

	for case in cases {
		assert!(
			parse_deallocate_divergence(case).is_none(),
			"should not have parsed {case:?}"
		);
	}
}

/// The loop iteration repair decides whether replay is stuck inside a loop by comparing the failing
/// location against the loop's resume coordinate, so it has to read that location out of every
/// error shape gasoline produces.
#[test]
fn parses_the_location_out_of_every_replay_failure() {
	let cases = [
		(
			r#"history diverged: expected activity "set_sleeping" at {10, 10103, 8}, found activity "allocate""#,
			"{10, 10103, 8}",
		),
		(
			r#"history diverged: expected activity "check_envoy_liveness" at {10, 1681503, 2}, found signals"#,
			"{10, 1681503, 2}",
		),
		(
			r#"history diverged: expected signals "pegboard_actor2_events" at {10, 28198, 2}, found activity "check_envoy_liveness""#,
			"{10, 28198, 2}",
		),
		// A version mismatch names the location after the version.
		(
			r#"history diverged: expected activity "deallocate" v1 at {9, 7307, 2}, found activity "set_error" v2"#,
			"{9, 7307, 2}",
		),
		// Latent history names the branch root instead of a single event.
		(
			r#"latent history found: expected 4 more events in root {10, 58494}: activity "get_ts" v1 @ 3"#,
			"{10, 58494}",
		),
		(
			r#"latent history found: expected 1 more event in root {10, 5}: activity "get_ts" v1 @ 3"#,
			"{10, 5}",
		),
	];

	for (error, expected) in cases {
		let location =
			parse_error_location(error).unwrap_or_else(|| panic!("did not parse {error:?}"));

		assert_eq!(location.to_string(), expected, "for {error:?}");
	}
}

/// Errors that name no location must not be mistaken for a loop failure.
#[test]
fn parses_no_location_out_of_unrelated_errors() {
	for error in [
		"workflow evicted",
		"missing event data: event_type",
		"workflow pegboard_actor2 failed: consensus failed: ConsensusFailed { reason: StaleBallot }",
		"",
	] {
		assert!(
			parse_error_location(error).is_none(),
			"should not have parsed {error:?}"
		);
	}
}

/// The repairs address keys by location, so a location has to survive the round trip through the
/// error message and the `--location` flag unchanged.
#[test]
fn location_round_trips_through_display() {
	for raw in ["{10}", "{10, 231, 2}", "{10, 231, 1.2}", "{1.2.3, 4}"] {
		let location = raw.parse::<Location>().expect("should parse");

		assert_eq!(location.to_string(), raw);
	}
}

#[test]
fn location_accepts_unbraced_input_and_whitespace() {
	assert_eq!(
		"10, 231, 2".parse::<Location>().expect("should parse"),
		"{10,231,2}".parse::<Location>().expect("should parse"),
	);
	assert_eq!(
		"  { 10 , 231 }  "
			.parse::<Location>()
			.expect("should parse"),
		"{10, 231}".parse::<Location>().expect("should parse"),
	);
}

#[test]
fn location_rejects_malformed_input() {
	for raw in [
		"", "{}", "{10", "10}", "{10, }", "{10, a}", "{-1}", "{1..2}",
	] {
		assert!(
			raw.parse::<Location>().is_err(),
			"should not have parsed {raw:?}"
		);
	}
}

/// A bare `sleep_state` row is the whole defect. A row with anything else at the same location is
/// real data and must never be cleared.
#[test]
fn recognizes_only_a_bare_sleep_state_row() {
	let orphan = RawEvent {
		sleep_state: Some(SleepState::Normal),
		fields: vec!["sleep_state"],
		..Default::default()
	};
	assert!(orphan.is_sleep_orphan());

	let decodable = RawEvent {
		event_type: Some(EventType::Sleep),
		sleep_state: Some(SleepState::Normal),
		fields: vec!["event_type", "sleep_state"],
		..Default::default()
	};
	assert!(!decodable.is_sleep_orphan());

	let carries_other_data = RawEvent {
		sleep_state: Some(SleepState::Normal),
		fields: vec!["sleep_state", "other"],
		..Default::default()
	};
	assert!(!carries_other_data.is_sleep_orphan());
}

/// Clearing the active row is only safe because loop compaction left a complete copy behind.
#[test]
fn requires_every_field_of_the_forgotten_sleep_event() {
	assert!(complete_sleep().is_complete_sleep());

	let not_a_sleep = RawEvent {
		event_type: Some(EventType::Activity),
		..complete_sleep()
	};
	assert!(!not_a_sleep.is_complete_sleep());

	let missing_deadline = RawEvent {
		deadline_ts: None,
		..complete_sleep()
	};
	assert!(!missing_deadline.is_complete_sleep());

	let missing_state = RawEvent {
		sleep_state: None,
		..complete_sleep()
	};
	assert!(!missing_state.is_complete_sleep());
}

fn complete_sleep() -> RawEvent {
	RawEvent {
		event_type: Some(EventType::Sleep),
		version: Some(1),
		create_ts: Some(0),
		deadline_ts: Some(0),
		sleep_state: Some(SleepState::Normal),
		..Default::default()
	}
}

/// The inserted activity is recognized on a re-run so the repair is idempotent. A `set_error` that
/// this repair did not write must not be mistaken for one.
#[test]
fn recognizes_only_its_own_inserted_activity() {
	assert!(is_inserted_set_error(&inserted_set_error(), 2));

	// A real `set_error` the workflow itself wrote, with a different error payload.
	let organic = RawEvent {
		input_chunks: vec![br#"{"error":{"crashed":{"message":null}}}"#.to_vec()],
		..inserted_set_error()
	};
	assert!(!is_inserted_set_error(&organic, 2));

	// Right shape, wrong version. Gasoline compares activity versions on replay.
	assert!(!is_inserted_set_error(&inserted_set_error(), 3));

	// A different activity entirely.
	let other_activity = RawEvent {
		name: Some(DEALLOCATE_ACTIVITY.to_string()),
		..inserted_set_error()
	};
	assert!(!is_inserted_set_error(&other_activity, 2));
}

fn inserted_set_error() -> RawEvent {
	RawEvent {
		event_type: Some(EventType::Activity),
		name: Some(SET_ERROR_ACTIVITY.to_string()),
		version: Some(2),
		create_ts: Some(0),
		input_chunks: vec![SET_ERROR_INPUT.as_bytes().to_vec()],
		..Default::default()
	}
}

/// The input is written verbatim into history and deserialized by the workflow as
/// `SetErrorInput`, so it has to stay valid JSON in the shape that type expects.
#[test]
fn inserted_input_is_the_expected_shape() {
	let parsed = serde_json::from_str::<serde_json::Value>(SET_ERROR_INPUT).expect("valid json");

	assert!(
		parsed
			.pointer("/error/envoy_no_response/envoy_key")
			.is_some_and(serde_json::Value::is_null),
		"unexpected shape: {parsed}"
	);
}
