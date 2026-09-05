use anyhow::*;
use clap::Parser;
use rivet_dynamic_config::{SetTracingConfigMessage, pubsub_subjects::TracingConfigSubject};
use universalpubsub::PublishOpts;

#[derive(Parser)]
pub enum SubCommand {
	/// Configure tracing settings (log filter and sampler ratio) on every engine process in the
	/// datacenter
	Config {
		/// Log filter (e.g., "debug", "info", "rivet_api_peer=trace")
		/// Pass an empty string to reset to the default
		#[clap(short, long)]
		filter: Option<String>,

		/// OpenTelemetry sampler ratio (0.0-1.0)
		/// Pass the flag with no value to reset to the default
		#[clap(short, long, num_args = 0..=1)]
		sampler_ratio: Option<Option<f64>>,
	},
}

impl SubCommand {
	pub async fn execute(self, config: rivet_config::Config) -> Result<()> {
		match self {
			Self::Config {
				filter,
				sampler_ratio,
			} => {
				let message = SetTracingConfigMessage {
					filter: filter.map(|f| if f.is_empty() { None } else { Some(f) }),
					sampler_ratio,
				};
				let payload = serde_json::to_vec(&message)?;

				let pools = rivet_pools::Pools::new(config).await?;
				pools
					.ups()?
					.publish(TracingConfigSubject, &payload, PublishOpts::broadcast())
					.await?;

				println!("Tracing configuration updated successfully");

				match &message.filter {
					Some(Some(filter)) => println!("  Filter: {filter}"),
					Some(None) => println!("  Filter: reset to default"),
					None => {}
				}

				match message.sampler_ratio {
					Some(Some(ratio)) => println!("  Sampler ratio: {ratio}"),
					Some(None) => println!("  Sampler ratio: reset to default"),
					None => {}
				}

				Ok(())
			}
		}
	}
}
