#![cfg(feature = "test-faults")]

//! Crossover measurement for the genuine byte-volume txn-window test
//! (`~/.agents/todo/depot-large-db-harness-byte-scale.md`).
//!
//! The test UDB (RocksDB) wraps every transaction closure in `tokio::time::timeout(TXN_TIMEOUT, ..)`
//! with `TXN_TIMEOUT = 5s` and returns `TransactionTooOld` on expiry (`universaldb` rocksdb driver).
//! `UDB_SIMULATED_LATENCY_MS` cannot trigger this: it is a single pre-sleep at the top of
//! `Database::txn`, paid once per txn and OUTSIDE the timeout wrapper, so it neither scales with
//! reads-per-txn nor counts against the window. The only thing that ages out a txn here is real
//! wall-clock spent inside the closure, i.e. genuine data volume.
//!
//! This binary is a measurement harness, not an assertion gate: it seeds `ROWS` raw key/value pairs of
//! `VALUE_BYTES` each into a temp UDB, then times a single unbounded `get_ranges_keyvalues(WantAll)`
//! scan in one txn and reports whether it completed or aged out. Sweep `ROWS` / `VALUE_BYTES` via env
//! to find the volume where the unbounded scan crosses 5s, which sizes the real byte-volume tests.
//!
//! Run: `ROWS=2000000 VALUE_BYTES=16 cargo test -p depot --features test-faults --test \
//! compaction_txn_window_crossover -- --ignored --nocapture --test-threads=1`

use std::sync::Arc;
use std::time::Instant;

use anyhow::Result;
use futures_util::TryStreamExt;
use tempfile::Builder;
use universaldb::{RangeOption, options::StreamingMode, utils::IsolationLevel};

/// Raw measurement prefix. Key layout is irrelevant to the scan cost, so use a trivial fixed prefix
/// plus a big-endian counter so keys sort in insertion order.
const PREFIX: &[u8] = b"XOVER/";

fn env_u64(name: &str, default: u64) -> u64 {
	std::env::var(name)
		.ok()
		.and_then(|v| v.parse().ok())
		.unwrap_or(default)
}

async fn open_db() -> Result<(Arc<universaldb::Database>, tempfile::TempDir)> {
	let dir = Builder::new().prefix("xover-").tempdir()?;
	let driver = universaldb::driver::RocksDbDatabaseDriver::new(dir.path().to_path_buf()).await?;
	Ok((Arc::new(universaldb::Database::new(Arc::new(driver))), dir))
}

fn row_key(i: u64) -> Vec<u8> {
	let mut k = PREFIX.to_vec();
	k.extend_from_slice(&i.to_be_bytes());
	k
}

/// Seeds `rows` key/value pairs of `value_bytes` each, `per_txn` rows per write transaction.
async fn seed(
	db: &universaldb::Database,
	rows: u64,
	value_bytes: usize,
	per_txn: u64,
) -> Result<()> {
	let value = vec![0xabu8; value_bytes];
	let mut next = 0u64;
	while next < rows {
		let end = (next + per_txn).min(rows);
		let value = value.clone();
		db.txn("xover_seed", move |tx| {
			let value = value.clone();
			async move {
				let informal = tx.informal();
				for i in next..end {
					informal.set(&row_key(i), &value);
				}
				Ok(())
			}
		})
		.await?;
		next = end;
	}
	Ok(())
}

/// Times one unbounded full-prefix scan in a single txn, mirroring `tx_scan_prefix_values` (WantAll +
/// per-row `to_vec()` allocation). Returns `Ok(Some(duration))` on completion or `Ok(None)` if the
/// transaction aged out (`TransactionTooOld` / `MaxRetriesReached`).
async fn time_unbounded_scan(
	db: &universaldb::Database,
) -> Result<(Option<std::time::Duration>, u64)> {
	let begin = row_key(0);
	let mut end = PREFIX.to_vec();
	*end.last_mut().unwrap() += 1;

	let start = Instant::now();
	let result = db
		.txn("xover_scan", move |tx| {
			let begin = begin.clone();
			let end = end.clone();
			async move {
				let informal = tx.informal();
				let mut stream = informal.get_ranges_keyvalues(
					RangeOption {
						mode: StreamingMode::WantAll,
						..(begin.as_slice(), end.as_slice()).into()
					},
					IsolationLevel::Serializable,
				);
				let mut count = 0u64;
				while let Some(entry) = stream.try_next().await? {
					let _k = entry.key().to_vec();
					let _v = entry.value().to_vec();
					count += 1;
				}
				Ok(count)
			}
		})
		.await;
	let elapsed = start.elapsed();

	match result {
		Ok(count) => Ok((Some(elapsed), count)),
		Err(err) => {
			// Aged out (or exhausted retries on repeated age-out).
			tracing::warn!(?err, ?elapsed, "unbounded scan failed");
			Ok((None, 0))
		}
	}
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
#[ignore = "measurement harness; run manually with ROWS/VALUE_BYTES env and --nocapture"]
async fn measure_unbounded_scan_crossover() -> Result<()> {
	let rows = env_u64("ROWS", 1_000_000);
	let value_bytes = env_u64("VALUE_BYTES", 16) as usize;
	let per_txn = env_u64("PER_TXN", 20_000);

	let total_mb = (rows * value_bytes as u64) as f64 / (1024.0 * 1024.0);
	eprintln!(
		"seeding rows={rows} value_bytes={value_bytes} (~{total_mb:.0} MB payload) per_txn={per_txn}"
	);

	let (db, _dir) = open_db().await?;
	let seed_start = Instant::now();
	seed(&db, rows, value_bytes, per_txn).await?;
	eprintln!("seed done in {:?}", seed_start.elapsed());

	let (scan_result, count) = time_unbounded_scan(&db).await?;
	match scan_result {
		Some(dur) => eprintln!(
			"UNBOUNDED scan COMPLETED in {dur:?} ({count} rows). {} the 5s window.",
			if dur.as_secs_f64() >= 5.0 {
				">= over"
			} else {
				"< under"
			}
		),
		None => eprintln!("UNBOUNDED scan AGED OUT (TransactionTooOld). >= 5s window crossed."),
	}

	Ok(())
}
