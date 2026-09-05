use anyhow::Result;
use rivet_error::RivetError;
use serde::Serialize;

use crate::actor::sqlite::SqliteDb;

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ActorRuntimeSocketEndpointInfo {
	pub path: String,
}

#[derive(Clone, Default)]
pub struct ActorRuntimeSocketEndpoint;

impl ActorRuntimeSocketEndpoint {
	pub(crate) fn new(_enabled: bool, _db: SqliteDb) -> Self {
		Self
	}

	pub async fn provision(&self) -> Result<ActorRuntimeSocketEndpointInfo> {
		Err(ActorRuntimeSocketUnsupportedError.build())
	}

	pub(crate) async fn shutdown(&self) {}
}

#[derive(rivet_error::RivetError, Debug, Serialize)]
#[error(
	"actor_runtime_socket",
	"unsupported",
	"Actor Runtime Socket is only available on Unix native runtimes."
)]
pub struct ActorRuntimeSocketUnsupportedError;
