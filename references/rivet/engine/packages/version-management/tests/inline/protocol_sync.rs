//! Coverage for graceful runtime protocol upgrades.
//!
//! Every engine process heartbeats the protocol version it is compiled against into a per-kind
//! subspace. On each pass a process adopts the *oldest* version that is still being heartbeated, so
//! a freshly deployed pod keeps speaking the previous protocol until the last old pod stops
//! heartbeating and its entry expires. Only then does the fleet move up to the new version.

use std::sync::Arc;

use anyhow::Result;
use futures_util::TryStreamExt;
use gas::prelude::util;
use rivet_config::{RuntimeProtocolKind, RuntimeProtocols};
use universaldb::{Database, prelude::*};
use uuid::Uuid;

use super::{PROTOCOL_VERSION_ENTRY_EXPIRED_THRESHOLD_MS, keys, update_protocol_versions};

async fn test_db() -> Result<Database> {
	let (db_config, _docker_config) = rivet_test_deps_docker::TestDatabase::FileSystem
		.config(Uuid::new_v4(), 1)
		.await?;
	let rivet_config::config::Database::FileSystem(fs_config) = db_config else {
		unreachable!()
	};
	let driver = universaldb::driver::RocksDbDatabaseDriver::new(fs_config.path).await?;

	Ok(Database::new(Arc::new(driver)))
}

/// Runs one sync pass, the same way the `version_management` service does.
async fn sync(db: &Database) -> Result<RuntimeProtocols> {
	db.txn("test_update_protocol_versions", |tx| async move {
		update_protocol_versions(&tx).await
	})
	.await
}

/// Records the heartbeat another engine process would have left behind for `version`.
///
/// The production path writes the same value through `MutationType::Max`, which cannot move a
/// timestamp backwards. This sets it outright so a test can age an entry out. The atomic path is
/// covered end to end by `own_heartbeat_survives_the_next_pass` and `a_stale_heartbeat_cannot_move
/// _an_entry_backwards`.
async fn heartbeat(db: &Database, kind: RuntimeProtocolKind, version: u16, ts: i64) -> Result<()> {
	db.txn("test_heartbeat", |tx| async move {
		tx.write(&keys::ProtocolVersionKey::new(kind, version), ts)?;

		Ok(())
	})
	.await
}

/// The heartbeat exactly as the production path writes it.
async fn atomic_heartbeat(
	db: &Database,
	kind: RuntimeProtocolKind,
	version: u16,
	ts: i64,
) -> Result<()> {
	db.txn("test_atomic_heartbeat", |tx| async move {
		tx.atomic_op(
			&keys::ProtocolVersionKey::new(kind, version),
			&ts.to_le_bytes(),
			MutationType::Max,
		);

		Ok(())
	})
	.await
}

/// Every version currently registered for `kind`, in ascending order.
async fn live_versions(db: &Database, kind: RuntimeProtocolKind) -> Result<Vec<u16>> {
	db.txn("test_live_versions", |tx| async move {
		let subspace =
			universaldb::utils::Subspace::all().subspace(&keys::ProtocolVersionKey::subspace(kind));
		let mut stream = tx.get_ranges_keyvalues(
			universaldb::RangeOption {
				mode: StreamingMode::WantAll,
				..(&subspace).into()
			},
			Serializable,
		);

		let mut versions = Vec::new();
		while let Some(entry) = stream.try_next().await? {
			let (key, _) = tx.read_entry::<keys::ProtocolVersionKey>(&entry)?;
			versions.push(key.version);
		}
		versions.sort_unstable();

		Ok(versions)
	})
	.await
}

fn compiled(kind: RuntimeProtocolKind) -> u16 {
	let protocols = rivet_build_meta::compiled_runtime_protocols();

	let version = protocols
		.iter()
		.find(|protocol| protocol.kind == kind)
		.expect("protocol kind is compiled in")
		.compiled_version();

	version
}

fn version_of(protocols: &RuntimeProtocols, kind: RuntimeProtocolKind) -> u16 {
	protocols
		.iter()
		.find(|protocol| protocol.kind == kind)
		.expect("protocol kind is compiled in")
		.version()
}

#[tokio::test]
async fn uses_compiled_versions_when_no_other_process_is_running() -> Result<()> {
	let db = test_db().await?;

	let protocols = sync(&db).await?;

	for protocol in &protocols {
		assert_eq!(
			protocol.compiled_version(),
			protocol.version(),
			"`{}` should fall back to its compiled version",
			protocol.kind,
		);
	}

	// The pass registers this process so that other processes hold back for it.
	assert_eq!(
		vec![compiled(RuntimeProtocolKind::Envoy)],
		live_versions(&db, RuntimeProtocolKind::Envoy).await?,
	);

	Ok(())
}

#[tokio::test]
async fn holds_back_to_the_oldest_live_version() -> Result<()> {
	let db = test_db().await?;
	let old = compiled(RuntimeProtocolKind::Envoy) - 1;

	heartbeat(&db, RuntimeProtocolKind::Envoy, old, util::timestamp::now()).await?;

	let protocols = sync(&db).await?;

	assert_eq!(
		old,
		version_of(&protocols, RuntimeProtocolKind::Envoy),
		"a newer process must speak the older protocol while an old process is alive",
	);

	Ok(())
}

#[tokio::test]
async fn holds_back_to_the_oldest_of_several_live_versions() -> Result<()> {
	let db = test_db().await?;
	let compiled = compiled(RuntimeProtocolKind::Envoy);
	let now = util::timestamp::now();

	heartbeat(&db, RuntimeProtocolKind::Envoy, compiled - 1, now).await?;
	heartbeat(&db, RuntimeProtocolKind::Envoy, compiled - 2, now).await?;

	let protocols = sync(&db).await?;

	assert_eq!(
		compiled - 2,
		version_of(&protocols, RuntimeProtocolKind::Envoy),
	);

	Ok(())
}

#[tokio::test]
async fn upgrades_once_the_last_old_process_expires() -> Result<()> {
	let db = test_db().await?;
	let compiled = compiled(RuntimeProtocolKind::Envoy);
	let old = compiled - 1;

	// The old process is still alive.
	heartbeat(&db, RuntimeProtocolKind::Envoy, old, util::timestamp::now()).await?;
	let protocols = sync(&db).await?;
	assert_eq!(old, version_of(&protocols, RuntimeProtocolKind::Envoy));

	// The old process is gone and its last heartbeat has aged out.
	heartbeat(
		&db,
		RuntimeProtocolKind::Envoy,
		old,
		util::timestamp::now() - PROTOCOL_VERSION_ENTRY_EXPIRED_THRESHOLD_MS - 1_000,
	)
	.await?;

	let protocols = sync(&db).await?;

	assert_eq!(
		compiled,
		version_of(&protocols, RuntimeProtocolKind::Envoy),
		"the fleet should move up once nothing is heartbeating the old version",
	);
	assert_eq!(
		vec![compiled],
		live_versions(&db, RuntimeProtocolKind::Envoy).await?,
		"the expired entry should have been cleaned up",
	);

	Ok(())
}

#[tokio::test]
async fn own_heartbeat_survives_the_next_pass() -> Result<()> {
	let db = test_db().await?;
	let compiled = compiled(RuntimeProtocolKind::Envoy);

	sync(&db).await?;
	let protocols = sync(&db).await?;

	assert_eq!(
		compiled,
		version_of(&protocols, RuntimeProtocolKind::Envoy),
		"a process must not read its own fresh heartbeat as expired",
	);
	assert_eq!(
		vec![compiled],
		live_versions(&db, RuntimeProtocolKind::Envoy).await?,
	);

	Ok(())
}

#[tokio::test]
async fn rejects_a_rollback_to_an_older_protocol() -> Result<()> {
	let db = test_db().await?;
	let newer = compiled(RuntimeProtocolKind::Envoy) + 1;

	heartbeat(
		&db,
		RuntimeProtocolKind::Envoy,
		newer,
		util::timestamp::now(),
	)
	.await?;

	let err = match sync(&db).await {
		Ok(_) => panic!("a newer live protocol version must be rejected"),
		Err(err) => err,
	};

	assert!(
		err.chain()
			.any(|cause| cause.to_string().contains("rolled back")),
		"unexpected error: {err:?}",
	);

	Ok(())
}

#[tokio::test]
async fn an_expired_newer_version_is_not_a_rollback() -> Result<()> {
	let db = test_db().await?;
	let compiled = compiled(RuntimeProtocolKind::Envoy);

	heartbeat(
		&db,
		RuntimeProtocolKind::Envoy,
		compiled + 1,
		util::timestamp::now() - PROTOCOL_VERSION_ENTRY_EXPIRED_THRESHOLD_MS - 1_000,
	)
	.await?;

	let protocols = sync(&db).await?;

	assert_eq!(
		compiled,
		version_of(&protocols, RuntimeProtocolKind::Envoy),
		"a process that is long gone must not block startup",
	);
	assert_eq!(
		vec![compiled],
		live_versions(&db, RuntimeProtocolKind::Envoy).await?,
	);

	Ok(())
}

#[tokio::test]
async fn protocol_kinds_are_tracked_independently() -> Result<()> {
	let db = test_db().await?;
	let old_ups = compiled(RuntimeProtocolKind::Ups) - 1;

	heartbeat(
		&db,
		RuntimeProtocolKind::Ups,
		old_ups,
		util::timestamp::now(),
	)
	.await?;

	let protocols = sync(&db).await?;

	assert_eq!(old_ups, version_of(&protocols, RuntimeProtocolKind::Ups));
	assert_eq!(
		compiled(RuntimeProtocolKind::Envoy),
		version_of(&protocols, RuntimeProtocolKind::Envoy),
		"an old ups process must not hold back the envoy protocol",
	);

	Ok(())
}

#[tokio::test]
async fn a_stale_heartbeat_cannot_move_an_entry_backwards() -> Result<()> {
	let db = test_db().await?;
	let compiled = compiled(RuntimeProtocolKind::Envoy);
	let old = compiled - 1;
	let now = util::timestamp::now();

	atomic_heartbeat(&db, RuntimeProtocolKind::Envoy, old, now).await?;
	// A process whose clock lags, or a heartbeat that lands out of order, must not age an entry
	// out from under a process that is still running.
	atomic_heartbeat(
		&db,
		RuntimeProtocolKind::Envoy,
		old,
		now - PROTOCOL_VERSION_ENTRY_EXPIRED_THRESHOLD_MS - 1_000,
	)
	.await?;

	let protocols = sync(&db).await?;

	assert_eq!(old, version_of(&protocols, RuntimeProtocolKind::Envoy));

	Ok(())
}
