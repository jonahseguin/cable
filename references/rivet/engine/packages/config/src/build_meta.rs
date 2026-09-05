//! Build metadata for the running binary, published into config at startup.
//!
//! The values originate from the `rivet-build-meta` crate, whose build script re-stamps the git
//! SHA and build timestamp on every commit. Reading them through config keeps that crate out of
//! the dependency graph of everything that wants them, so a new commit only recompiles the binary
//! that stamps the values rather than the whole engine.
//!
//! A process that never stamps its metadata reports the placeholder values below, and its worker
//! version is 0.

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct BuildMeta {
	/// Runtime identifier for the process.
	pub runtime: String,
	/// Package version from Cargo.toml.
	pub version: String,
	/// Git commit SHA.
	pub git_sha: String,
	/// Build timestamp, in RFC 3339.
	pub build_timestamp: String,
	/// Rustc version used to compile.
	pub rustc_version: String,
	/// Rustc host triple.
	pub rustc_host: String,
	/// Cargo target triple.
	pub cargo_target: String,
	/// Cargo profile the binary was built with.
	pub cargo_profile: String,
}

impl Default for BuildMeta {
	fn default() -> Self {
		BuildMeta {
			runtime: "unknown".to_string(),
			version: "unknown".to_string(),
			git_sha: "unknown".to_string(),
			build_timestamp: "unknown".to_string(),
			rustc_version: "unknown".to_string(),
			rustc_host: "unknown".to_string(),
			cargo_target: "unknown".to_string(),
			cargo_profile: "unknown".to_string(),
		}
	}
}

impl BuildMeta {
	/// The gasoline worker version, as epoch milliseconds.
	///
	/// Gasoline compares this across active workers so that a worker running an older build stops
	/// pulling workflows once a newer build is up. A build timestamp that cannot be parsed yields
	/// 0, which leaves every worker at the same version and disables that ordering.
	pub fn worker_version(&self) -> i64 {
		chrono::DateTime::parse_from_rfc3339(&self.build_timestamp)
			.map(|x| x.timestamp_millis())
			.unwrap_or_default()
	}
}
