use std::sync::{
	Arc,
	atomic::{AtomicUsize, Ordering},
};

use super::super::common;

const ENVOY_PING_HEALTHY_THRESHOLD: std::time::Duration = std::time::Duration::from_millis(
	common::test_envoy::EnvoyHandle::PING_HEALTHY_THRESHOLD_MS as u64,
);
const ENVOY_PING_INTERVAL_MARGIN: std::time::Duration = std::time::Duration::from_secs(5);

#[test]
fn envoy_reconnects_after_server_side_tcp_reset() {
	common::run(
		common::TestOpts::new(1)
			.with_timeout(90)
			.with_network_faults(),
		|ctx| async move {
			let dc = ctx.leader_dc();
			let (namespace, _) = common::setup_test_namespace(dc).await;
			let envoy_proxy = ctx
				.network_faults()
				.proxy(
					"envoy-connect",
					std::net::SocketAddr::from(([127, 0, 0, 1], dc.guard_port())),
				)
				.await
				.expect("failed to create Envoy Toxiproxy proxy");

			let start_count = Arc::new(AtomicUsize::new(0));
			let actor_start_count = start_count.clone();
			let envoy = common::setup_envoy(dc, &namespace, |builder| {
				builder
					.with_endpoint(envoy_proxy.endpoint())
					.with_actor_behavior("network-fault-actor", move |_| {
						let actor_start_count = actor_start_count.clone();
						Box::new(
							common::test_envoy::CustomActorBuilder::new()
								.on_start(move |_| {
									let actor_start_count = actor_start_count.clone();
									Box::pin(async move {
										actor_start_count.fetch_add(1, Ordering::SeqCst);
										Ok(common::test_envoy::ActorStartResult::Running)
									})
								})
								.build(),
						)
					})
			})
			.await;

			let res = common::create_actor(
				dc.guard_port(),
				&namespace,
				"network-fault-actor",
				envoy.pool_name(),
				rivet_types::actors::CrashPolicy::Sleep,
			)
			.await;
			let actor_id = res.actor.actor_id.to_string();
			wait_for_envoy_actor(&envoy, &actor_id).await;
			wait_for_connectable(dc.guard_port(), &namespace, &actor_id).await;

			let response = ping_actor_via_gateway(dc.guard_port(), &actor_id).await;
			assert_eq!(response["status"], "ok");

			let mut disconnect = envoy.wait_for_next_connection_event(
				common::test_envoy::EnvoyConnectionEvent::Disconnected,
			);
			disconnect.assert_no_event();
			envoy_proxy
				.reset_downstream()
				.await
				.expect("failed to inject downstream TCP reset");

			// The reset toxic applies when the engine next writes to the Envoy control WebSocket.
			// The ping task writes every few seconds in the test config.
			disconnect.wait().await;

			let reconnect = envoy.wait_for_next_connection_event(
				common::test_envoy::EnvoyConnectionEvent::Connected,
			);
			envoy_proxy
				.clear_toxics()
				.await
				.expect("failed to clear downstream TCP reset");
			reconnect.wait().await;

			let response = ping_actor_via_gateway(dc.guard_port(), &actor_id).await;
			assert_eq!(response["status"], "ok");
			assert_eq!(
				start_count.load(Ordering::SeqCst),
				1,
				"Envoy reconnect should not replay the actor start command"
			);
		},
	);
}

#[test]
fn engine_closes_envoy_ws_after_ping_timeout_while_envoy_remains_unaware() {
	common::run(
		common::TestOpts::new(1).with_timeout(120),
		|ctx| async move {
			let dc = ctx.leader_dc();
			let (namespace, _) = common::setup_test_namespace(dc).await;

			// Stand up our own forwarder so we can simulate a true network partition.
			// Toxiproxy can stall traffic but always relays a peer's TCP close to the other
			// side, which would let envoy-client notice the engine has hung up.
			let freeze_proxy = common::freeze_proxy::FreezeProxy::start(
				std::net::SocketAddr::from(([127, 0, 0, 1], dc.guard_port())),
			)
			.await
			.expect("failed to start freeze proxy");

			let envoy = common::setup_envoy(dc, &namespace, |builder| {
				builder
					.with_endpoint(freeze_proxy.endpoint())
					.with_actor_behavior("network-fault-actor", |_| {
						Box::new(
							common::test_envoy::CustomActorBuilder::new()
								.on_start(|_| {
									Box::pin(async {
										Ok(common::test_envoy::ActorStartResult::Running)
									})
								})
								.build(),
						)
					})
			})
			.await;

			let res = common::create_actor(
				dc.guard_port(),
				&namespace,
				"network-fault-actor",
				envoy.pool_name(),
				rivet_types::actors::CrashPolicy::Sleep,
			)
			.await;
			let actor_id = res.actor.actor_id.to_string();
			wait_for_envoy_actor(&envoy, &actor_id).await;
			wait_for_connectable(dc.guard_port(), &namespace, &actor_id).await;

			let response = ping_actor_via_gateway(dc.guard_port(), &actor_id).await;
			assert_eq!(response["status"], "ok");

			// Wait past the local health threshold before injecting the fault. A healthy
			// connection must stay healthy because engine pings refresh envoy-client's
			// receive timestamp.
			tokio::time::sleep(ENVOY_PING_HEALTHY_THRESHOLD + ENVOY_PING_INTERVAL_MARGIN).await;
			let healthy = envoy
				.is_ping_healthy()
				.await
				.expect("envoy handle should exist");
			assert!(
				healthy,
				"envoy-client should remain healthy while engine pings are arriving"
			);

			// Subscribe before injecting the fault so we can assert no event slips through.
			let mut disconnect = envoy.wait_for_next_connection_event(
				common::test_envoy::EnvoyConnectionEvent::Disconnected,
			);
			disconnect.assert_no_event();

			// Black-hole the link in both directions. Bytes are read from both peers and
			// discarded, and EOFs are swallowed so neither peer's TCP stack ever sees a FIN.
			// The engine still keeps sending pings every few seconds (default 3s) but no pongs
			// come back, so its application-level ping timeout (default 15s) will eventually
			// fire and close the WebSocket. The envoy-client has no application-level
			// liveness check of its own, so as long as its TCP socket stays open it continues
			// to believe the connection is healthy.
			freeze_proxy.freeze();

			// Wait well past the engine's 15s ping timeout and the envoy-client's local ping
			// health threshold.
			tokio::time::sleep(ENVOY_PING_HEALTHY_THRESHOLD + ENVOY_PING_INTERVAL_MARGIN).await;

			// The envoy-client is still oblivious. The engine's close frame and TCP FIN never
			// reach it because the freeze proxy is holding the link open from envoy-client's
			// perspective.
			disconnect.assert_no_event();

			// Even though the envoy-client thinks the WebSocket is alive, its own ping-tracker
			// must report unhealthy because no engine ping arrived in the last 20s. This is
			// the signal the rivetkit `/health` endpoint uses to ask its host to recycle the
			// container.
			let healthy = envoy
				.is_ping_healthy()
				.await
				.expect("envoy handle should exist");
			assert!(
				!healthy,
				"envoy-client should report unhealthy after 20s without an engine ping"
			);
		},
	);
}

async fn wait_for_envoy_actor(envoy: &common::test_envoy::TestEnvoy, actor_id: &str) {
	common::wait_with_poll(
		std::time::Duration::from_secs(5),
		std::time::Duration::from_millis(50),
		|| async {
			if envoy.has_actor(actor_id).await {
				Some(())
			} else {
				None
			}
		},
	)
	.await
	.expect("envoy should receive actor");
}

async fn wait_for_connectable(
	guard_port: u16,
	namespace: &str,
	actor_id: &str,
) -> rivet_types::actors::Actor {
	common::wait_with_poll(
		std::time::Duration::from_secs(10),
		std::time::Duration::from_millis(50),
		|| async {
			let actor = common::try_get_actor(guard_port, actor_id, namespace)
				.await
				.expect("failed to get actor")
				.expect("actor should exist");

			if actor.connectable_ts.is_some() {
				Some(actor)
			} else {
				None
			}
		},
	)
	.await
	.expect("actor should become connectable")
}

async fn ping_actor_via_gateway(guard_port: u16, actor_id: &str) -> serde_json::Value {
	let client = reqwest::Client::builder()
		.timeout(std::time::Duration::from_secs(2))
		.build()
		.expect("failed to build reqwest client");

	let response = client
		.get(format!(
			"http://127.0.0.1:{guard_port}/gateway/{actor_id}/ping"
		))
		.send()
		.await
		.expect("failed to ping actor through gateway");

	if !response.status().is_success() {
		let status = response.status();
		let text = response.text().await.unwrap_or_default();
		panic!("failed to ping actor through gateway: {status}: {text}");
	}

	response
		.json()
		.await
		.expect("failed to decode gateway ping response")
}
