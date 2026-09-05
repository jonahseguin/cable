use anyhow::Result;
use rivet_config::DynamicConfigUpdate;
use serde::{Deserialize, Serialize};
use universalpubsub::NextOutput;

use crate::pubsub_subjects::{DYNAMIC_CONFIG_SUBJECT, DynamicConfigSubject};

/// A runtime config change addressed to every process in the cluster.
///
/// The payload is the structured update itself, so a process running an older build rejects fields
/// it does not know about instead of silently ignoring them.
#[derive(Serialize, Deserialize)]
#[serde(transparent)]
pub struct SetDynamicConfigMessage {
	pub update: DynamicConfigUpdate,
}

#[tracing::instrument(skip_all)]
pub async fn listen(config: rivet_config::Config, pools: rivet_pools::Pools) -> Result<()> {
	let ups = pools.ups()?;
	let mut sub = ups.subscribe(DynamicConfigSubject).await?;

	tracing::debug!(subject = %DYNAMIC_CONFIG_SUBJECT, "subscribed to dynamic config updates");

	while let Ok(NextOutput::Message(msg)) = sub.next().await {
		match serde_json::from_slice::<SetDynamicConfigMessage>(&msg.payload) {
			Ok(msg) => match config.apply_dynamic(&msg.update) {
				Ok(dynamic) => {
					tracing::info!(
						update = ?msg.update,
						?dynamic,
						"applied dynamic config update"
					);
				}
				Err(err) => {
					tracing::error!(?err, update = ?msg.update, "rejected dynamic config update");
				}
			},
			Err(err) => {
				tracing::error!(?err, "failed to deserialize dynamic config update message");
			}
		}
	}

	Ok(())
}
