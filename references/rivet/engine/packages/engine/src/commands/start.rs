use std::time::Duration;

use anyhow::{Result, bail};
use clap::Parser;
use rivet_service_manager::RunConfig;

// 7 day logs retention
const LOGS_RETENTION: Duration = Duration::from_secs(7 * 24 * 60 * 60);

#[derive(Parser)]
pub struct Opts {
	#[arg(short = 's', long, conflicts_with = "except_services")]
	services: Vec<String>,

	/// Exclude the specified services instead of including them
	#[arg(long)]
	except_services: Vec<String>,
}

impl Opts {
	pub async fn execute(
		&self,
		config: rivet_config::Config,
		run_config: &RunConfig,
	) -> Result<()> {
		// Redirect logs if enabled on the edge
		if let Some(logs_dir) = config.logs().redirect_logs_dir.as_ref() {
			rivet_logs::Logs::new(logs_dir.clone(), LOGS_RETENTION)
				.start()
				.await?;
		}

		// Select services to run
		let services = if self.services.is_empty() && self.except_services.is_empty() {
			// Run all services
			run_config.services.clone()
		} else if !self.except_services.is_empty() {
			let mut services = run_config.services.clone();

			for exclude_name in &self.except_services {
				if !run_config
					.services
					.iter()
					.any(|service| service.name == exclude_name)
				{
					bail!("service {exclude_name:?} not found");
				}

				services.retain(|service| service.name != exclude_name);
			}

			services
		} else {
			let mut services = Vec::new();

			for name in &self.services {
				let Some(service) = run_config
					.services
					.iter()
					.find(|service| service.name == name)
				else {
					bail!("service {name:?} not found");
				};

				services.push(service.clone());
			}

			services
		};

		let pools = rivet_pools::Pools::new(config.clone()).await?;

		// Check admission before starting
		rivet_version_management::check_engine_admission(&config, &pools).await?;

		rivet_service_manager::start(config, pools, services).await?;

		Ok(())
	}
}
