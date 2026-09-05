//! Per-transaction retry limits must be honored by every driver, not only FoundationDB.
//!
//! `Transaction::retry_limit` bounds how many times `Database::run` re-runs a closure, overriding the
//! database-wide limit for that transaction alone. Callers reach for it when an attempt's side
//! effects are accounted for outside the transaction: a retry loop that keeps re-running a failing
//! closure hides that work for as long as it spins, so the bound is what keeps the blind window one
//! attempt long. A driver that silently ignored the limit would leave that bound off with no way to
//! tell from the call site.

use std::sync::{
	Arc,
	atomic::{AtomicUsize, Ordering},
};

use rivet_test_deps_docker::TestDatabase;
use universaldb::{Database, error::DatabaseError, utils::IsolationLevel::Serializable};
use uuid::Uuid;

async fn rocksdb() -> Database {
	let (db_config, _docker_config) = TestDatabase::FileSystem
		.config(Uuid::new_v4(), 1)
		.await
		.unwrap();
	let rivet_config::config::Database::FileSystem(fs_config) = db_config else {
		unreachable!()
	};

	let driver = universaldb::driver::RocksDbDatabaseDriver::new(fs_config.path)
		.await
		.unwrap();

	Database::new(Arc::new(driver))
}

/// A closure that always fails retryably runs exactly once under `retry_limit(0)`.
#[tokio::test]
async fn retry_limit_zero_runs_the_closure_once() {
	let db = rocksdb().await;
	let attempts = Arc::new(AtomicUsize::new(0));
	let attempts_for_tx = attempts.clone();

	let res = db
		.txn("retry_limit", move |tx| {
			let attempts = attempts_for_tx.clone();
			async move {
				tx.retry_limit(0)?;
				attempts.fetch_add(1, Ordering::SeqCst);
				Err::<(), _>(DatabaseError::NotCommitted.into())
			}
		})
		.await;

	assert!(res.is_err(), "the closure always fails, so run must fail");
	assert_eq!(
		attempts.load(Ordering::SeqCst),
		1,
		"retry_limit(0) must leave the first attempt as the only attempt"
	);
}

/// A limit of N allows N retries after the first attempt, matching FoundationDB's `RetryLimit`.
#[tokio::test]
async fn retry_limit_allows_that_many_retries() {
	let db = rocksdb().await;
	let attempts = Arc::new(AtomicUsize::new(0));
	let attempts_for_tx = attempts.clone();

	let _ = db
		.txn("retry_limit", move |tx| {
			let attempts = attempts_for_tx.clone();
			async move {
				tx.retry_limit(2)?;
				attempts.fetch_add(1, Ordering::SeqCst);
				Err::<(), _>(DatabaseError::NotCommitted.into())
			}
		})
		.await;

	assert_eq!(
		attempts.load(Ordering::SeqCst),
		3,
		"a limit of 2 means one initial attempt plus two retries"
	);
}

/// Setting no limit leaves the database-wide limit in charge, so a retryable failure still retries.
#[tokio::test]
async fn unset_retry_limit_still_retries() {
	let db = rocksdb().await;
	let attempts = Arc::new(AtomicUsize::new(0));
	let attempts_for_tx = attempts.clone();

	let _ = db
		.txn("retry_limit", move |_tx| {
			let attempts = attempts_for_tx.clone();
			async move {
				attempts.fetch_add(1, Ordering::SeqCst);
				Err::<(), _>(DatabaseError::NotCommitted.into())
			}
		})
		.await;

	assert!(
		attempts.load(Ordering::SeqCst) > 1,
		"without a per-transaction limit the database-wide limit applies"
	);
}

/// The limit is per transaction, not a database-wide setting a transaction can leak to its peers.
#[tokio::test]
async fn retry_limit_does_not_leak_to_later_transactions() {
	let db = rocksdb().await;

	let _ = db
		.txn("retry_limit", |tx| async move {
			tx.retry_limit(0)?;
			Err::<(), _>(DatabaseError::NotCommitted.into())
		})
		.await;

	let attempts = Arc::new(AtomicUsize::new(0));
	let attempts_for_tx = attempts.clone();
	let _ = db
		.txn("retry_limit", move |_tx| {
			let attempts = attempts_for_tx.clone();
			async move {
				attempts.fetch_add(1, Ordering::SeqCst);
				Err::<(), _>(DatabaseError::NotCommitted.into())
			}
		})
		.await;

	assert!(
		attempts.load(Ordering::SeqCst) > 1,
		"a previous transaction's retry_limit(0) must not clamp later transactions"
	);
}

/// A committing transaction that set a limit still commits; the limit only bounds retries.
#[tokio::test]
async fn retry_limit_does_not_block_a_successful_commit() {
	let db = rocksdb().await;

	db.txn("retry_limit", |tx| async move {
		tx.retry_limit(0)?;
		tx.set(b"retry_limit/key", b"value");
		Ok(())
	})
	.await
	.expect("a transaction that does not conflict must commit under retry_limit(0)");

	let value = db
		.txn("retry_limit", |tx| async move {
			tx.get(b"retry_limit/key", Serializable).await
		})
		.await
		.unwrap();

	assert_eq!(
		value.as_deref().map(|v| v.as_slice()),
		Some(b"value".as_slice())
	);
}
