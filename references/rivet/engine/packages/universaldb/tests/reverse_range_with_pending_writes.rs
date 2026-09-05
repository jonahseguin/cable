//! Reverse range scans issued from a transaction that already has pending writes.
//!
//! The read-your-writes merge path rebuilds the result set from a `BTreeMap`, so it has to honor
//! `RangeOption::reverse` when draining it. Otherwise a reverse scan silently flips to ascending as
//! soon as the transaction holds any local operation, and a reverse scan with a limit returns the
//! lowest keys instead of the highest.

use std::sync::Arc;

use anyhow::Result;
use futures_util::TryStreamExt;
use universaldb::{
	Database,
	options::StreamingMode,
	range_option::RangeOption,
	utils::{IsolationLevel::Serializable, end_of_key_range},
};
use uuid::Uuid;

async fn rocksdb_database() -> Result<Database> {
	let test_id = Uuid::new_v4();
	let (db_config, _docker_config) = rivet_test_deps_docker::TestDatabase::FileSystem
		.config(test_id, 1)
		.await?;
	let rivet_config::config::Database::FileSystem(fs_config) = db_config else {
		unreachable!()
	};
	let driver = universaldb::driver::RocksDbDatabaseDriver::new(fs_config.path).await?;

	Ok(Database::new(Arc::new(driver)))
}

fn key(prefix: &[u8], idx: u32) -> Vec<u8> {
	let mut key = prefix.to_vec();
	key.extend_from_slice(&idx.to_be_bytes());
	key
}

async fn reverse_scan_keys(
	db: &Database,
	prefix: Vec<u8>,
	limit: Option<usize>,
	pending_write: bool,
) -> Result<Vec<u32>> {
	db.txn("test_reverse_range", move |tx| {
		let prefix = prefix.clone();
		async move {
			// A write anywhere in the transaction is enough to route the read through the
			// read-your-writes merge instead of straight back from the driver.
			if pending_write {
				tx.informal().set(&key(&prefix, 1_000), b"pending");
			}

			let end = end_of_key_range(&key(&prefix, u32::MAX));
			let informal = tx.informal();
			let mut stream = informal.get_ranges_keyvalues(
				RangeOption {
					mode: StreamingMode::Iterator,
					limit,
					reverse: true,
					..(prefix.as_slice(), end.as_slice()).into()
				},
				Serializable,
			);

			let mut out = Vec::new();
			while let Some(entry) = stream.try_next().await? {
				let suffix = &entry.key()[prefix.len()..];
				out.push(u32::from_be_bytes(suffix.try_into().unwrap()));
			}

			Ok(out)
		}
	})
	.await
}

#[tokio::test]
async fn reverse_scan_stays_descending_with_pending_writes() -> Result<()> {
	let db = rocksdb_database().await?;
	let prefix = b"reverse-order/".to_vec();

	let seed_prefix = prefix.clone();
	db.txn("test_reverse_range_seed", move |tx| {
		let prefix = seed_prefix.clone();
		async move {
			for idx in 0..8u32 {
				tx.informal().set(&key(&prefix, idx), &idx.to_be_bytes());
			}
			Ok(())
		}
	})
	.await?;

	let clean = reverse_scan_keys(&db, prefix.clone(), None, false).await?;
	assert_eq!(
		clean,
		vec![7, 6, 5, 4, 3, 2, 1, 0],
		"a reverse scan with no pending writes must return descending keys"
	);

	let pending = reverse_scan_keys(&db, prefix.clone(), None, true).await?;
	assert_eq!(
		pending,
		vec![1_000, 7, 6, 5, 4, 3, 2, 1, 0],
		"a reverse scan must stay descending when the transaction has pending writes"
	);

	Ok(())
}

#[tokio::test]
async fn reverse_scan_with_limit_takes_the_highest_keys() -> Result<()> {
	let db = rocksdb_database().await?;
	let prefix = b"reverse-limit/".to_vec();

	let seed_prefix = prefix.clone();
	db.txn("test_reverse_range_seed", move |tx| {
		let prefix = seed_prefix.clone();
		async move {
			for idx in 0..8u32 {
				tx.informal().set(&key(&prefix, idx), &idx.to_be_bytes());
			}
			Ok(())
		}
	})
	.await?;

	let clean = reverse_scan_keys(&db, prefix.clone(), Some(1), false).await?;
	assert_eq!(
		clean,
		vec![7],
		"a limited reverse scan with no pending writes must return the highest key"
	);

	let pending = reverse_scan_keys(&db, prefix.clone(), Some(1), true).await?;
	assert_eq!(
		pending,
		vec![1_000],
		"a limited reverse scan must return the highest key when the transaction has pending writes"
	);

	Ok(())
}
