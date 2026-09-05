use super::*;

#[test]
fn registration_outcomes_map_to_websocket_lifecycle_errors() {
	assert!(validate_registration_outcome(Outcome::Updated, false).is_ok());
	assert!(validate_registration_outcome(Outcome::Expired, true).is_ok());

	for (outcome, expected_code) in [
		(Outcome::StaleConnection, "eviction"),
		(Outcome::Expired, "registration_expired"),
	] {
		let err =
			validate_registration_outcome(outcome, false).expect_err("expected websocket error");
		let rivet_err = err
			.chain()
			.find_map(|source| source.downcast_ref::<rivet_error::RivetError>())
			.expect("expected RivetError in error chain");
		assert_eq!(rivet_err.group(), "ws");
		assert_eq!(rivet_err.code(), expected_code);
	}
}
