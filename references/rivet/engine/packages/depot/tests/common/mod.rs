#![allow(dead_code)]

use std::{future::Future, pin::Pin, sync::Arc};

use anyhow::{Context, Result};
use depot::conveyer::Db;
use futures_util::TryStreamExt;
use gas::prelude::Id;
use rivet_pools::NodeId;
use tempfile::{Builder, TempDir};
use universaldb::utils::IsolationLevel::{Serializable, Snapshot};

pub async fn test_db(prefix: &str) -> Result<universaldb::Database> {
	let path = Builder::new().prefix(prefix).tempdir()?.keep();
	let driver = universaldb::driver::RocksDbDatabaseDriver::new(path).await?;

	Ok(universaldb::Database::new(Arc::new(driver)))
}

pub async fn test_db_with_dir(prefix: &str) -> Result<(Arc<universaldb::Database>, TempDir)> {
	let dir = Builder::new().prefix(prefix).tempdir()?;
	let driver = universaldb::driver::RocksDbDatabaseDriver::new(dir.path().to_path_buf()).await?;

	Ok((Arc::new(universaldb::Database::new(Arc::new(driver))), dir))
}

/// A test database with depot's compaction throttle enabled at a fixed budget and a pinned clock, so
/// a charge lands in a known window. No background flusher: the test drives the flush itself, so the
/// counter is exact rather than eventually right.
pub async fn test_db_with_throttle(
	prefix: &str,
	bytes_per_second: u64,
	now_ms: i64,
) -> Result<universaldb::Database> {
	let config =
		universaldb::ThrottleConfig::new(Arc::new(move |_name, _kind| Some(bytes_per_second)))
			.without_flusher()
			.with_clock(Arc::new(move || now_ms));

	Ok(test_db(prefix).await?.with_throttle(config))
}

pub async fn test_db_arc(prefix: &str) -> Result<Arc<universaldb::Database>> {
	Ok(Arc::new(test_db(prefix).await?))
}

pub async fn test_db_with_throttle_arc(
	prefix: &str,
	bytes_per_second: u64,
	now_ms: i64,
) -> Result<Arc<universaldb::Database>> {
	Ok(Arc::new(
		test_db_with_throttle(prefix, bytes_per_second, now_ms).await?,
	))
}

pub fn make_db(
	db: Arc<universaldb::Database>,
	bucket_id: Id,
	database_id: impl Into<String>,
) -> Db {
	Db::new(db, bucket_id, database_id.into(), NodeId::new())
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TierMode {
	Disabled,
}

impl TierMode {
	pub fn label(self) -> &'static str {
		match self {
			TierMode::Disabled => "cold_disabled",
		}
	}
}

pub struct TestDb {
	pub db: Db,
	pub udb: Arc<universaldb::Database>,
	pub bucket_id: Id,
	pub database_id: String,
	_udb_dir: TempDir,
}

impl TestDb {
	pub fn make_db(&self, bucket_id: Id, database_id: impl Into<String>) -> Db {
		Db::new(
			self.udb.clone(),
			bucket_id,
			database_id.into(),
			NodeId::new(),
		)
	}
}

pub async fn build_test_db(prefix: &str, tier: TierMode) -> Result<TestDb> {
	let (udb, udb_dir) = test_db_with_dir(prefix).await?;
	let bucket_id = Id::new_v1(1);
	let database_id = format!("{prefix}-db");

	let db = match tier {
		TierMode::Disabled => Db::new(udb.clone(), bucket_id, database_id.clone(), NodeId::new()),
	};

	Ok(TestDb {
		db,
		udb,
		bucket_id,
		database_id,
		_udb_dir: udb_dir,
	})
}

pub async fn test_matrix<F>(prefix: &str, body: F) -> Result<()>
where
	F: Fn(TierMode, TestDb) -> Pin<Box<dyn Future<Output = Result<()>> + Send>>,
{
	for tier in [TierMode::Disabled] {
		let ctx = build_test_db(prefix, tier)
			.await
			.with_context(|| format!("[{}] failed to build TestDb", tier.label()))?;
		body(tier, ctx)
			.await
			.with_context(|| format!("[{}] body failed", tier.label()))?;
	}

	Ok(())
}

/// Reads every key/value under `prefix`, ascending. Test-only; production reads bound their ranges.
pub async fn read_range(
	db: &universaldb::Database,
	prefix: Vec<u8>,
) -> Result<Vec<(Vec<u8>, Vec<u8>)>> {
	db.txn("test_depotcommon_read_range", move |tx| {
		let prefix = prefix.clone();
		async move {
			let subspace = universaldb::Subspace::from(universaldb::tuple::Subspace::from_bytes(
				prefix.clone(),
			));
			let informal = tx.informal();
			let mut stream = informal.get_ranges_keyvalues(
				universaldb::range_option::RangeOption::from(&subspace),
				Snapshot,
			);
			let mut rows = Vec::new();
			while let Some(entry) = futures_util::TryStreamExt::try_next(&mut stream).await? {
				rows.push((entry.key().to_vec(), entry.value().to_vec()));
			}

			Ok(rows)
		}
	})
	.await
}

pub async fn read_value(db: &universaldb::Database, key: Vec<u8>) -> Result<Option<Vec<u8>>> {
	db.txn("test_depotcommon_mod", move |tx| {
		let key = key.clone();
		async move {
			Ok(tx
				.informal()
				.get(&key, Snapshot)
				.await?
				.map(Vec::<u8>::from))
		}
	})
	.await
}

/// Every key under `prefix`, for tests that must act on a row set whose exact keys depend on
/// encoding decisions they should not restate.
pub async fn read_prefix_keys(db: &universaldb::Database, prefix: Vec<u8>) -> Result<Vec<Vec<u8>>> {
	db.txn("test_depotconveyer_read", move |tx| {
		let prefix = prefix.clone();
		async move {
			let prefix_subspace =
				universaldb::Subspace::from(universaldb::tuple::Subspace::from_bytes(prefix));
			let informal = tx.informal();
			let mut stream = informal.get_ranges_keyvalues(
				universaldb::RangeOption {
					mode: universaldb::options::StreamingMode::WantAll,
					..universaldb::RangeOption::from(&prefix_subspace)
				},
				Serializable,
			);
			let mut keys = Vec::new();
			while let Some(entry) = stream.try_next().await? {
				keys.push(entry.key().to_vec());
			}
			Ok(keys)
		}
	})
	.await
}
