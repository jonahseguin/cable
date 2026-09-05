//! Applies runtime configuration changes broadcast over pubsub.
//!
//! Every process runs this service and listens on the broadcast subjects below, so a single
//! published message reconfigures the whole cluster without a restart. Each listener owns one
//! subject:
//!
//! - [`dynamic_config`] applies structured changes to the fields in
//!   `rivet_config::DynamicConfig`. Only fields declared there can be changed, and a call site only
//!   observes them if it reads through the opt-in accessors on `rivet_config::Config`.
//! - [`tracing_config`] applies log filter and OpenTelemetry sampler changes.

use anyhow::Result;

pub mod dynamic_config;
pub mod pubsub_subjects;
pub mod tracing_config;

pub use dynamic_config::SetDynamicConfigMessage;
pub use tracing_config::SetTracingConfigMessage;

#[tracing::instrument(skip_all)]
pub async fn start(config: rivet_config::Config, pools: rivet_pools::Pools) -> Result<()> {
	tokio::try_join!(
		dynamic_config::listen(config.clone(), pools.clone()),
		tracing_config::listen(config, pools),
	)?;

	Ok(())
}
