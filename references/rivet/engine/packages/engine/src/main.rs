use std::{path::PathBuf, sync::Arc};

use anyhow::Result;
use clap::Parser;
use once_cell::sync::Lazy;
use rivet_engine::{SubCommand, run_config};

static LONG_VERSION: Lazy<String> = Lazy::new(|| rivet_build_meta::pretty_print());

#[derive(Parser)]
#[command(name = "Rivet", version, long_version = LONG_VERSION.as_str(), about)]
struct Cli {
	#[command(subcommand)]
	command: SubCommand,

	/// Path to the config file or directory of config files
	#[clap(long, global = true)]
	config: Vec<PathBuf>,
}

fn main() -> Result<()> {
	rivet_runtime::run(main_inner()).transpose()?;
	Ok(())
}

async fn main_inner() -> Result<()> {
	let cli = Cli::parse();

	tracing::info!(
		version=%rivet_build_meta::VERSION,
		git_sha=%rivet_build_meta::GIT_SHA,
		built_at=%rivet_build_meta::BUILD_TIMESTAMP,
		"starting rivet",
	);

	// Load config
	let config = rivet_config::Config::load(
		&cli.config,
		rivet_build_meta::build_meta(),
		rivet_build_meta::compiled_runtime_protocols(),
	)
	.await?;
	tracing::info!(config=?*config, "loaded config");

	// Initialize telemetry (does nothing if telemetry is disabled)
	let _guard = rivet_telemetry::init(&config);

	// Build run config
	let run_config = Arc::new(run_config::config(config.clone()).inspect_err(|err| {
		rivet_telemetry::capture_error(err);
	})?);

	// Execute command
	cli.command
		.execute(config, run_config)
		.await
		.inspect_err(|err| {
			rivet_telemetry::capture_error(err);
		})
}
