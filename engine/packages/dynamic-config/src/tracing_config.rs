use anyhow::Result;
use rivet_config::dynamic::double_option;
use serde::{Deserialize, Serialize};
use universalpubsub::NextOutput;

use crate::pubsub_subjects::{TRACING_CONFIG_SUBJECT, TracingConfigSubject};

/// Default OpenTelemetry sampler ratio, used when a message resets the value.
const DEFAULT_SAMPLER_RATIO: f64 = 0.001;

#[derive(Serialize, Deserialize)]
pub struct SetTracingConfigMessage {
	#[serde(
		default,
		deserialize_with = "double_option",
		skip_serializing_if = "Option::is_none"
	)]
	pub filter: Option<Option<String>>,
	#[serde(
		default,
		deserialize_with = "double_option",
		skip_serializing_if = "Option::is_none"
	)]
	pub sampler_ratio: Option<Option<f64>>,
}

#[tracing::instrument(skip_all)]
pub async fn listen(_config: rivet_config::Config, pools: rivet_pools::Pools) -> Result<()> {
	let ups = pools.ups()?;
	let mut sub = ups.subscribe(TracingConfigSubject).await?;

	tracing::debug!(subject = %TRACING_CONFIG_SUBJECT, "subscribed to tracing config updates");

	while let Ok(NextOutput::Message(msg)) = sub.next().await {
		match serde_json::from_slice::<SetTracingConfigMessage>(&msg.payload) {
			Ok(update_msg) => apply(&update_msg),
			Err(err) => {
				tracing::error!(?err, "failed to deserialize tracing config update message");
			}
		}
	}

	Ok(())
}

fn apply(update: &SetTracingConfigMessage) {
	tracing::debug!(
		filter = ?update.filter,
		sampler_ratio = ?update.sampler_ratio,
		"received tracing config update"
	);

	// An absent field leaves the current value alone, and an explicit null resets it to the default.
	match &update.filter {
		Some(Some(filter)) => {
			if let Err(err) = rivet_runtime::reload_log_filter(filter) {
				tracing::error!(?err, "failed to reload log filter");
			}
		}
		Some(None) => {
			if let Err(err) = rivet_runtime::reload_log_filter("") {
				tracing::error!(?err, "failed to reload log filter to default");
			}
		}
		None => {}
	}

	match update.sampler_ratio {
		Some(Some(ratio)) => {
			if let Err(err) = rivet_metrics_server::set_sampler_ratio(ratio) {
				tracing::error!(?err, "failed to reload sampler ratio");
			}
		}
		Some(None) => {
			if let Err(err) = rivet_metrics_server::set_sampler_ratio(DEFAULT_SAMPLER_RATIO) {
				tracing::error!(?err, "failed to reload sampler ratio to default");
			}
		}
		None => {}
	}
}
