use anyhow::Result;
use gas::prelude::Id;
use xxhash_rust::xxh3::xxh3_128_with_seed;

use crate::common;

const HERD_INCIDENT_VERSION: u32 = 2_592_381_191;

#[tokio::test]
async fn heartbeat_detects_current_but_expired_envoy_registration() -> Result<()> {
	let test_deps = common::setup_deps().await?;
	let fixture = common::write_envoy_with_version(
		&test_deps,
		common::stale_ping_ts(),
		Some(8),
		HERD_INCIDENT_VERSION,
	)
	.await?;
	let pivot = xxh3_128_with_seed(fixture.envoy_key.as_bytes(), 0).to_be_bytes();

	// A read-path expiry can observe the Envoy as stale after the eligibility threshold but
	// before the websocket ping timeout closes the connection.
	let expired = common::expire(&test_deps, &fixture, true).await?;
	assert!(expired.did_expire);

	// The heartbeat resumes before Guard times out. The current connection must detect that its
	// registration was expired so the websocket reconnects and performs a full registration.
	let update = common::update_ping(&test_deps, &fixture).await?;
	assert_eq!(
		update.outcome,
		pegboard::ops::envoy::update_ping::Outcome::Expired,
	);

	let (after_heartbeat, _) = common::allocate_hash(
		&test_deps,
		fixture.namespace_id,
		&fixture.pool_name,
		1,
		16,
		vec![pivot],
		0,
	)
	.await?;
	assert_eq!(
		after_heartbeat, None,
		"an expired connection must reconnect instead of partially repairing membership",
	);

	let replacement_envoy_conn_id = Id::new_v1(test_deps.config().dc_label());
	let replacement = common::reregister_envoy(
		&test_deps,
		&fixture,
		replacement_envoy_conn_id,
		common::fresh_ping_ts(),
	)
	.await?;
	let state = common::read_key_state(&test_deps, &replacement, 8).await?;
	assert_eq!(state.envoy_conn_id, Some(replacement_envoy_conn_id));
	assert!(!state.expired_ts);
	common::assert_registration_keys_present(&state, 8);

	let (after_reconnect, _) = common::allocate_hash(
		&test_deps,
		replacement.namespace_id,
		&replacement.pool_name,
		1,
		16,
		vec![pivot],
		0,
	)
	.await?;
	assert_eq!(
		after_reconnect.as_deref(),
		Some(replacement.envoy_key.as_str()),
		"a full replacement registration must restore scheduler availability",
	);

	Ok(())
}

#[tokio::test]
async fn stale_disconnect_cannot_expire_newer_connection_registration() -> Result<()> {
	let test_deps = common::setup_deps().await?;
	let fixture = common::write_envoy_with_version(
		&test_deps,
		common::fresh_ping_ts(),
		Some(8),
		HERD_INCIDENT_VERSION,
	)
	.await?;
	let pivot = xxh3_128_with_seed(fixture.envoy_key.as_bytes(), 0).to_be_bytes();
	let stale_envoy_conn_id = fixture.envoy_conn_id.expect("fixture connection id");
	let current_envoy_conn_id = Id::new_v1(test_deps.config().dc_label());

	// The replacement connection atomically commits its owner and complete scheduling state for the
	// same logical envoy key, including moving the timestamped load-balancer entry.
	let replacement = common::reregister_envoy(
		&test_deps,
		&fixture,
		current_envoy_conn_id,
		fixture.last_ping_ts + 1,
	)
	.await?;
	let old_state = common::read_key_state(&test_deps, &fixture, 8).await?;
	assert!(
		!old_state.load_balancer_idx,
		"replacement registration must remove the previous timestamped LB entry",
	);

	// The old connection's delayed disconnect cleanup arrives after the replacement committed.
	let stale_disconnect =
		common::expire_as(&test_deps, &replacement, Some(stale_envoy_conn_id), false).await?;
	assert!(!stale_disconnect.did_expire);

	let state = common::read_key_state(&test_deps, &replacement, 8).await?;
	assert_eq!(state.envoy_conn_id, Some(current_envoy_conn_id));
	assert!(!state.expired_ts);
	common::assert_registration_keys_present(&state, 8);

	// The replacement connection remains healthy and continues heartbeating.
	let update = common::update_ping(&test_deps, &replacement).await?;
	assert_eq!(
		update.outcome,
		pegboard::ops::envoy::update_ping::Outcome::Updated,
	);

	let (allocation, _) = common::allocate_hash(
		&test_deps,
		replacement.namespace_id,
		&replacement.pool_name,
		1,
		16,
		vec![pivot],
		0,
	)
	.await?;
	assert_eq!(
		allocation.as_deref(),
		Some(replacement.envoy_key.as_str()),
		"stale cleanup from an old connection must not delete a newer registration",
	);

	Ok(())
}

#[tokio::test]
async fn stale_heartbeat_cannot_mutate_newer_connection_registration() -> Result<()> {
	let test_deps = common::setup_deps().await?;
	let fixture = common::write_envoy(&test_deps, common::fresh_ping_ts(), Some(8)).await?;
	let stale_envoy_conn_id = fixture.envoy_conn_id.expect("fixture connection id");
	let current_envoy_conn_id = Id::new_v1(test_deps.config().dc_label());
	let replacement = common::reregister_envoy(
		&test_deps,
		&fixture,
		current_envoy_conn_id,
		fixture.last_ping_ts + 1,
	)
	.await?;
	let before = common::read_key_state(&test_deps, &replacement, 8).await?;
	assert_eq!(before.last_ping_ts_value, Some(replacement.last_ping_ts));
	assert_eq!(before.last_rtt, None);
	assert!(before.load_balancer_idx);

	let update = common::update_ping_as_with_rtt(
		&test_deps,
		&replacement,
		Some(stale_envoy_conn_id),
		false,
		777,
	)
	.await?;
	assert_eq!(
		update.outcome,
		pegboard::ops::envoy::update_ping::Outcome::StaleConnection,
	);

	let state = common::read_key_state(&test_deps, &replacement, 8).await?;
	assert_eq!(state.envoy_conn_id, Some(current_envoy_conn_id));
	assert_eq!(state.last_ping_ts_value, before.last_ping_ts_value);
	assert_eq!(state.last_rtt, before.last_rtt);
	assert_eq!(state.load_balancer_idx, before.load_balancer_idx);
	common::assert_registration_keys_present(&state, 8);

	Ok(())
}

#[tokio::test]
async fn current_connection_disconnect_expires_own_registration_and_retains_owner() -> Result<()> {
	let test_deps = common::setup_deps().await?;
	let fixture = common::write_envoy(&test_deps, common::fresh_ping_ts(), Some(8)).await?;

	let expired = common::expire(&test_deps, &fixture, false).await?;
	assert!(expired.did_expire);

	let state = common::read_key_state(&test_deps, &fixture, 8).await?;
	assert_eq!(state.envoy_conn_id, fixture.envoy_conn_id);
	assert!(state.expired_ts);
	assert_eq!(state.hash_entries, 0);
	assert!(!state.load_balancer_idx);
	assert!(!state.active_envoy);
	assert!(!state.active_envoy_by_name);

	Ok(())
}

#[tokio::test]
async fn legacy_registration_without_connection_id_remains_expirable() -> Result<()> {
	let test_deps = common::setup_deps().await?;
	let mut fixture = common::write_envoy(&test_deps, common::fresh_ping_ts(), Some(8)).await?;
	common::set_envoy_conn_id(&test_deps, &fixture, None).await?;
	fixture.envoy_conn_id = None;

	let update = common::update_ping(&test_deps, &fixture).await?;
	assert_eq!(
		update.outcome,
		pegboard::ops::envoy::update_ping::Outcome::Updated,
	);

	let expired = common::expire(&test_deps, &fixture, false).await?;
	assert!(expired.did_expire);

	let state = common::read_key_state(&test_deps, &fixture, 8).await?;
	assert_eq!(state.envoy_conn_id, None);
	assert!(state.expired_ts);
	assert_eq!(state.hash_entries, 0);
	assert!(!state.load_balancer_idx);

	Ok(())
}

#[tokio::test]
async fn gracefully_stopping_connection_can_heartbeat_while_expired() -> Result<()> {
	let test_deps = common::setup_deps().await?;
	let fixture = common::write_envoy(&test_deps, common::fresh_ping_ts(), Some(8)).await?;

	let expired = common::expire(&test_deps, &fixture, false).await?;
	assert!(expired.did_expire);

	let update = common::update_ping_as(&test_deps, &fixture, fixture.envoy_conn_id, true).await?;
	assert_eq!(
		update.outcome,
		pegboard::ops::envoy::update_ping::Outcome::Updated,
	);

	let state = common::read_key_state(&test_deps, &fixture, 8).await?;
	assert!(state.expired_ts);
	assert_eq!(state.hash_entries, 0);
	assert!(!state.load_balancer_idx);

	Ok(())
}

#[tokio::test]
async fn unfenced_forced_expiry_cannot_mutate_fenced_registration() -> Result<()> {
	let test_deps = common::setup_deps().await?;
	let fixture = common::write_envoy(&test_deps, common::fresh_ping_ts(), Some(8)).await?;

	let expired = common::expire_as(&test_deps, &fixture, None, false).await?;
	assert!(!expired.did_expire);

	let state = common::read_key_state(&test_deps, &fixture, 8).await?;
	assert_eq!(state.envoy_conn_id, fixture.envoy_conn_id);
	assert!(!state.expired_ts);
	common::assert_registration_keys_present(&state, 8);

	Ok(())
}
