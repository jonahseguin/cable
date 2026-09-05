use gas::prelude::*;
use universaldb::options::ConflictRangeType;
use universaldb::utils::IsolationLevel::*;

use crate::keys;

#[derive(Debug)]
pub struct Input {
	pub namespace_id: Id,
	pub envoy_key: String,
	/// Identifies the connection that owns this heartbeat. `None` is accepted only while the
	/// persisted registration is also legacy and has no connection id.
	pub envoy_conn_id: Option<Id>,
	pub update_lb: bool,
	pub rtt: u32,
	/// Gracefully stopping connections keep heartbeating while intentionally expired.
	pub is_stopping: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Outcome {
	Updated,
	StaleConnection,
	Expired,
}

#[derive(Debug)]
pub struct Output {
	pub outcome: Outcome,
}

#[operation]
pub async fn pegboard_envoy_update_ping(ctx: &OperationCtx, input: &Input) -> Result<Output> {
	ctx.udb()?
		.txn("pegboard_envoy_update_ping", |tx| {
			async move {
				let tx = tx.with_subspace(keys::subspace());

				let envoy_conn_id_key =
					keys::envoy::EnvoyConnIdKey::new(input.namespace_id, input.envoy_key.clone());
				let pool_name_key =
					keys::envoy::PoolNameKey::new(input.namespace_id, input.envoy_key.clone());
				let version_key =
					keys::envoy::VersionKey::new(input.namespace_id, input.envoy_key.clone());
				let last_ping_ts_key =
					keys::envoy::LastPingTsKey::new(input.namespace_id, input.envoy_key.clone());
				let expired_ts_key =
					keys::envoy::ExpiredTsKey::new(input.namespace_id, input.envoy_key.clone());

				let (
					current_envoy_conn_id,
					pool_name_entry,
					version_entry,
					last_ping_ts_entry,
					expired,
				) = tokio::try_join!(
					tx.read_opt(&envoy_conn_id_key, Serializable),
					tx.read_opt(&pool_name_key, Serializable),
					tx.read_opt(&version_key, Serializable),
					tx.read_opt(&last_ping_ts_key, Serializable),
					tx.exists(&expired_ts_key, Serializable),
				)?;

				// A legacy heartbeat is only accepted while the persisted registration is also
				// legacy, so both being `None` is current.
				if input.envoy_conn_id != current_envoy_conn_id {
					tracing::debug!(
						namespace_id = ?input.namespace_id,
						envoy_key = %input.envoy_key,
						expected_envoy_conn_id = ?input.envoy_conn_id,
						?current_envoy_conn_id,
						"rejecting heartbeat from stale envoy connection",
					);
					return Ok(Output {
						outcome: Outcome::StaleConnection,
					});
				}

				if expired && !input.is_stopping {
					tracing::warn!(
						namespace_id = ?input.namespace_id,
						envoy_key = %input.envoy_key,
						?current_envoy_conn_id,
						"rejecting heartbeat from current but expired envoy connection",
					);
					return Ok(Output {
						outcome: Outcome::Expired,
					});
				}

				let (Some(pool_name), Some(version), Some(old_last_ping_ts)) =
					(pool_name_entry, version_entry, last_ping_ts_entry)
				else {
					tracing::warn!(
						namespace_id = ?input.namespace_id,
						envoy_key = %input.envoy_key,
						?current_envoy_conn_id,
						"current envoy registration is incomplete",
					);
					return Ok(Output {
						outcome: Outcome::Expired,
					});
				};

				let last_ping_ts = util::timestamp::now();

				// Write new ping
				tx.write(&last_ping_ts_key, last_ping_ts)?;

				let last_rtt_key =
					keys::envoy::LastRttKey::new(input.namespace_id, input.envoy_key.clone());
				tx.write(&last_rtt_key, input.rtt)?;

				if input.update_lb && !expired {
					let old_lb_key = keys::ns::EnvoyLoadBalancerIdxKey::new(
						input.namespace_id,
						pool_name.clone(),
						version,
						old_last_ping_ts,
						input.envoy_key.clone(),
					);

					// Clear old key
					tx.add_conflict_key(&old_lb_key, ConflictRangeType::Read)?;
					tx.delete(&old_lb_key);

					tx.write(
						&keys::ns::EnvoyLoadBalancerIdxKey::new(
							input.namespace_id,
							pool_name.clone(),
							version,
							last_ping_ts,
							input.envoy_key.clone(),
						),
						(),
					)?;
				}

				Ok(Output {
					outcome: Outcome::Updated,
				})
			}
		})
		.custom_instrument(tracing::info_span!("envoy_update_ping_tx"))
		.await
}
