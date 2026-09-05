mod common;

use common::read_prefix_keys;

use std::sync::Arc;

use anyhow::Result;
#[cfg(feature = "test-faults")]
use depot::fault::{DepotFaultController, DepotFaultPoint, ReadFaultPoint};
use depot::{
	ACCESS_TOUCH_THROTTLE_MS,
	conveyer::{Db, branch},
	error::SqliteStorageError,
	keys::{
		PAGE_SIZE, branch_commit_key, branch_compaction_cold_shard_key, branch_compaction_root_key,
		branch_delta_chunk_key, branch_delta_chunk_prefix, branch_manifest_last_access_bucket_key,
		branch_manifest_last_access_ts_ms_key, branch_meta_head_key, branch_pidx_key,
		branch_shard_key,
	},
	ltx::{LtxHeader, encode_ltx_v3},
	metrics,
	types::{
		ColdShardRef, CompactionRoot, DBHead, DatabaseBranchId, DepotReadMode, DirtyPage,
		FetchedPage, GetPagesOptions, ResolvedVersionstamp, decode_commit_row,
		encode_cold_shard_ref, encode_compaction_root, encode_db_head,
	},
};
use gas::prelude::Id;
use rivet_pools::NodeId;
use sha2::{Digest, Sha256};
use tokio::sync::Barrier;
use universaldb::utils::IsolationLevel::Serializable;

const TEST_DATABASE: &str = "test-database";

fn test_bucket() -> Id {
	Id::v1(uuid::Uuid::from_u128(0x5678), 1)
}

fn head_at(head_txid: u64, db_size_pages: u32) -> DBHead {
	DBHead {
		head_txid,
		db_size_pages,
		post_apply_checksum: 0,
		branch_id: DatabaseBranchId::nil(),
	}
}

fn page(fill: u8) -> Vec<u8> {
	vec![fill; PAGE_SIZE as usize]
}

fn dirty_page(pgno: u32, fill: u8) -> DirtyPage {
	DirtyPage {
		pgno,
		bytes: page(fill),
	}
}

/// A page one that SQLite would accept: the format magic, a change counter that matches the
/// "version valid for" counter so the in-header size is trustworthy, and that size.
fn main_page(db_size_pages: u32) -> Vec<u8> {
	let mut bytes = page(0);
	bytes[..16].copy_from_slice(b"SQLite format 3\0");
	bytes[24..28].copy_from_slice(&1_u32.to_be_bytes());
	bytes[28..32].copy_from_slice(&db_size_pages.to_be_bytes());
	bytes[92..96].copy_from_slice(&1_u32.to_be_bytes());
	bytes
}

fn encoded_blob(txid: u64, pages: &[(u32, u8)]) -> Result<Vec<u8>> {
	let pages = pages
		.iter()
		.map(|(pgno, fill)| DirtyPage {
			pgno: *pgno,
			bytes: page(*fill),
		})
		.collect::<Vec<_>>();

	encode_ltx_v3(LtxHeader::delta(txid, 1, 999), &pages)
}

fn sha256(bytes: &[u8]) -> [u8; 32] {
	let digest = Sha256::digest(bytes);
	let mut hash = [0_u8; 32];
	hash.copy_from_slice(&digest);
	hash
}

fn compaction_root(manifest_generation: u64) -> CompactionRoot {
	CompactionRoot {
		schema_version: 1,
		manifest_generation,
		hot_watermark_txid: 0,
		cold_watermark_txid: 0,
		cold_watermark_versionstamp: [0; 16],
	}
}

async fn read_database_branch_id(db: &universaldb::Database) -> Result<DatabaseBranchId> {
	db.txn("test_depotconveyer_read", |tx| async move {
		branch::resolve_database_branch(
			&tx,
			depot::types::BucketId::from_gas_id(test_bucket()),
			TEST_DATABASE,
			Serializable,
		)
		.await?
		.ok_or_else(|| anyhow::anyhow!("database branch should exist"))
	})
	.await
}

async fn seed(
	db: &universaldb::Database,
	writes: Vec<(Vec<u8>, Vec<u8>)>,
	deletes: Vec<Vec<u8>>,
) -> Result<()> {
	db.txn("test_depotconveyer_read", move |tx| {
		let writes = writes.clone();
		let deletes = deletes.clone();
		async move {
			for (key, value) in writes {
				tx.informal().set(&key, &value);
			}
			for key in deletes {
				tx.informal().clear(&key);
			}
			Ok(())
		}
	})
	.await
}

async fn read_i64_le(db: &universaldb::Database, key: Vec<u8>) -> Result<Option<i64>> {
	db.txn("test_depotconveyer_read", move |tx| {
		let key = key.clone();
		async move {
			tx.informal()
				.get(&key, Serializable)
				.await?
				.map(|bytes| {
					let bytes: [u8; 8] = bytes
						.as_slice()
						.try_into()
						.map_err(|_| anyhow::anyhow!("expected i64 bytes"))?;
					Ok(i64::from_le_bytes(bytes))
				})
				.transpose()
		}
	})
	.await
}

async fn read_value(db: &universaldb::Database, key: Vec<u8>) -> Result<Option<Vec<u8>>> {
	db.txn("test_depotconveyer_read", move |tx| {
		let key = key.clone();
		async move {
			Ok(tx
				.informal()
				.get(&key, Serializable)
				.await?
				.map(Vec::<u8>::from))
		}
	})
	.await
}

/// Every row storing one commit's delta.
///
/// A commit writes its pages as one blob per shard-aligned page range, so the row keys depend on
/// which pages it touched. A test that wants to make a delta unreadable has to clear all of them;
/// naming a single key assumes a layout and silently stops deleting anything when that changes.
async fn delta_keys_for_txid(
	db: &universaldb::Database,
	branch_id: DatabaseBranchId,
	txid: u64,
) -> Result<Vec<Vec<u8>>> {
	let keys = read_prefix_keys(db, branch_delta_chunk_prefix(branch_id, txid)).await?;
	assert!(
		!keys.is_empty(),
		"commit {txid} wrote no delta rows to clear"
	);

	Ok(keys)
}

macro_rules! read_matrix {
	($prefix:expr, |$ctx:ident, $db:ident, $database_db:ident| $body:block) => {
		common::test_matrix($prefix, |_tier, $ctx| {
			Box::pin(async move {
				#[allow(unused_variables)]
				let $db = $ctx.udb.clone();
				let $database_db = $ctx.make_db(test_bucket(), TEST_DATABASE);
				$body
			})
		})
		.await
	};
}

#[tokio::test]
async fn get_pages_rejects_page_zero() -> Result<()> {
	read_matrix!("depot-read-page-zero", |ctx, db, database_db| {
		let err = database_db
			.get_pages(vec![0])
			.await
			.expect_err("read should reject page 0");
		assert!(err.to_string().contains("get_pages does not accept page 0"));

		Ok(())
	})
}

#[tokio::test]
async fn missing_delta_without_fallback_errors_instead_of_zero_fill() -> Result<()> {
	read_matrix!(
		"depot-read-missing-delta-no-fallback",
		|ctx, db, database_db| {
			database_db
				.commit(vec![dirty_page(1, 0x11)], 1, 1_000)
				.await?;
			let branch_id = read_database_branch_id(&db).await?;
			seed(
				&db,
				Vec::new(),
				delta_keys_for_txid(&db, branch_id, 1).await?,
			)
			.await?;

			let err = database_db
				.get_pages(vec![1])
				.await
				.expect_err("missing delta without fallback should fail loudly");
			assert!(matches!(
				err.downcast_ref::<SqliteStorageError>(),
				Some(SqliteStorageError::ShardCoverageMissing { pgno: 1 })
			));

			Ok(())
		}
	)
}

#[tokio::test]
async fn missing_delta_chunks_fail_loudly() -> Result<()> {
	for label in ["first", "middle", "last"] {
		let db = common::test_db_arc(&format!("depot-read-missing-{label}-delta")).await?;
		let database_db = common::make_db(db.clone(), test_bucket(), TEST_DATABASE.to_string());
		let dirty_pages = (1..=20)
			.map(|pgno| dirty_page(pgno, pgno as u8))
			.collect::<Vec<_>>();
		database_db.commit(dirty_pages, 20, 1_000).await?;
		let branch_id = read_database_branch_id(&db).await?;
		let existing_chunk_keys =
			read_prefix_keys(&db, branch_delta_chunk_prefix(branch_id, 1)).await?;
		seed(&db, Vec::new(), existing_chunk_keys).await?;
		let blob = encoded_blob(
			1,
			&(1..=20).map(|pgno| (pgno, pgno as u8)).collect::<Vec<_>>(),
		)?;
		let chunk_writes = blob
			.chunks(10)
			.enumerate()
			.map(|(idx, chunk)| {
				(
					branch_delta_chunk_key(branch_id, 1, idx as u32),
					chunk.to_vec(),
				)
			})
			.collect::<Vec<_>>();
		seed(&db, chunk_writes, Vec::new()).await?;
		let chunk_keys = read_prefix_keys(&db, branch_delta_chunk_prefix(branch_id, 1)).await?;
		assert!(
			chunk_keys.len() >= 3,
			"test setup should create at least three delta chunks"
		);
		let deleted_chunk = match label {
			"first" => 0,
			"middle" => chunk_keys.len() / 2,
			"last" => chunk_keys.len() - 1,
			_ => unreachable!("test labels are fixed"),
		};
		seed(&db, Vec::new(), vec![chunk_keys[deleted_chunk].clone()]).await?;

		let err = database_db
			.get_pages(vec![20])
			.await
			.expect_err("missing delta chunk should fail loudly");
		assert!(
			err.chain().any(|cause| {
				let message = cause.to_string();
				message.contains("sqlite delta chunks must be contiguous")
					|| message.contains("decode source blob for page")
			}),
			"unexpected error for missing {label} chunk: {err:?}"
		);
	}

	Ok(())
}

#[cfg(feature = "test-faults")]
#[tokio::test]
async fn read_fault_before_return_pages_fails_with_page_scope() -> Result<()> {
	let db = common::test_db_arc("depot-read-fault-before-return").await?;
	let writer = common::make_db(db.clone(), test_bucket(), TEST_DATABASE.to_string());
	writer.commit(vec![dirty_page(1, 0x11)], 1, 1_000).await?;
	let controller = DepotFaultController::new();
	controller
		.at(DepotFaultPoint::Read(ReadFaultPoint::BeforeReturnPages))
		.page_number(1)
		.once()
		.fail("before return failed")?;
	let reader = Db::new_with_fault_controller_for_test(
		db,
		test_bucket(),
		TEST_DATABASE.to_string(),
		NodeId::new(),
		controller.clone(),
	);

	let err = reader
		.get_pages(vec![1])
		.await
		.expect_err("read fault should fail get_pages");
	assert!(err.to_string().contains("before return failed"));
	controller.assert_expected_fired()?;

	Ok(())
}

#[tokio::test]
async fn get_pages_reads_with_cold_pidx_scan() -> Result<()> {
	read_matrix!("depot-read-pidx-scan", |ctx, db, database_db| {
		database_db
			.commit(vec![dirty_page(2, 0x22)], 3, 1_000)
			.await?;

		assert_eq!(
			database_db.get_pages(vec![2]).await?,
			vec![FetchedPage {
				pgno: 2,
				bytes: Some(page(0x22)),
			}]
		);

		Ok(())
	})
}

#[tokio::test]
async fn branch_cache_snapshot_is_atomic_across_dbptr_move() -> Result<()> {
	read_matrix!(
		"depot-read-cache-snapshot-atomic",
		|ctx, db, database_db| {
			let database_db = Arc::new(database_db);
			database_db
				.commit(vec![dirty_page(1, 0x11)], 2, 1_000)
				.await?;
			database_db
				.commit(vec![dirty_page(1, 0x22)], 2, 2_000)
				.await?;
			let old_branch_id = read_database_branch_id(&db).await?;
			let first_commit = decode_commit_row(
				&read_value(&db, branch_commit_key(old_branch_id, 1))
					.await?
					.expect("first commit row should exist"),
			)?;

			assert_eq!(
				database_db.get_pages(vec![1]).await?,
				vec![FetchedPage {
					pgno: 1,
					bytes: Some(page(0x22)),
				}]
			);
			let (cached_branch_id, cached_root_branch_id, _, _) = database_db
				.branch_cache_snapshot_for_test()
				.await
				.expect("branch cache should be warm");
			assert_eq!(cached_branch_id, old_branch_id);
			assert_eq!(cached_root_branch_id, old_branch_id);

			let new_branch_id = branch::rollback_database(
				&db,
				depot::types::BucketId::from_gas_id(test_bucket()),
				TEST_DATABASE.to_string(),
				ResolvedVersionstamp {
					versionstamp: first_commit.versionstamp,
					restore_point: None,
				},
			)
			.await?;
			assert_ne!(new_branch_id, old_branch_id);

			let start = Arc::new(Barrier::new(4));
			let mut readers = Vec::new();
			for _ in 0..2 {
				let reader_db = Arc::clone(&database_db);
				let reader_start = Arc::clone(&start);
				readers.push(tokio::spawn(async move {
					reader_start.wait().await;
					reader_db.get_pages(vec![1]).await
				}));
			}

			let observer_db = Arc::clone(&database_db);
			let observer_start = Arc::clone(&start);
			let observer = tokio::spawn(async move {
				observer_start.wait().await;
				for _ in 0..8 {
					if let Some((branch_id, root_branch_id, _, _)) =
						observer_db.branch_cache_snapshot_for_test().await
					{
						assert!(
							branch_id != new_branch_id || root_branch_id == new_branch_id,
							"branch cache exposed new branch id with stale ancestry"
						);
					}
					tokio::task::yield_now().await;
				}
			});

			start.wait().await;
			for reader in readers {
				let pages = reader.await??;
				assert_eq!(
					pages,
					vec![FetchedPage {
						pgno: 1,
						bytes: Some(page(0x11)),
					}]
				);
			}
			observer.await?;

			let (cached_branch_id, cached_root_branch_id, _, _) = database_db
				.branch_cache_snapshot_for_test()
				.await
				.expect("branch cache should stay warm");
			assert_eq!(cached_branch_id, new_branch_id);
			assert_eq!(cached_root_branch_id, new_branch_id);

			Ok(())
		}
	)
}

#[cfg(feature = "pidx-cache")]
#[tokio::test]
async fn get_pages_uses_warm_cache_without_pidx_row() -> Result<()> {
	read_matrix!("depot-read-warm-cache", |ctx, db, database_db| {
		database_db
			.commit(vec![dirty_page(2, 0x22)], 3, 1_000)
			.await?;
		let branch_id = read_database_branch_id(&db).await?;
		assert_eq!(
			database_db.get_pages(vec![2]).await?,
			vec![FetchedPage {
				pgno: 2,
				bytes: Some(page(0x22)),
			}]
		);

		seed(&db, Vec::new(), vec![branch_pidx_key(branch_id, 2)]).await?;

		assert_eq!(
			database_db.get_pages(vec![2]).await?,
			vec![FetchedPage {
				pgno: 2,
				bytes: Some(page(0x22)),
			}]
		);

		Ok(())
	})
}

#[cfg(feature = "pidx-cache")]
#[tokio::test]
async fn get_pages_falls_back_to_shard_when_cached_pidx_is_stale() -> Result<()> {
	read_matrix!("depot-read-stale-pidx", |ctx, db, database_db| {
		// Two separate commits create two separate delta blobs, one per page.
		database_db
			.commit(vec![dirty_page(1, 0x11)], 3, 1_000)
			.await?;
		database_db
			.commit(vec![dirty_page(2, 0x22)], 3, 2_000)
			.await?;
		let branch_id = read_database_branch_id(&db).await?;

		// Reading page 1 warms the PIDX cache for the whole branch (the cold scan loads
		// every PIDX row, including page 2's) but only loads page 1's delta blob, so page
		// 2's delta stays out of the LTX blob cache and a later read must hit FDB for it.
		assert_eq!(
			database_db.get_pages(vec![1]).await?,
			vec![FetchedPage {
				pgno: 1,
				bytes: Some(page(0x11)),
			}]
		);

		// Simulate compaction folding page 2 into a shard and removing its delta + PIDX row
		// out of band. The head is unchanged, matching real compaction, so the head fence
		// keeps trusting the cache.
		seed(
			&db,
			vec![(
				branch_shard_key(branch_id, 0, 2),
				encoded_blob(2, &[(2, 0x44)])?,
			)],
			delta_keys_for_txid(&db, branch_id, 2)
				.await?
				.into_iter()
				.chain([branch_pidx_key(branch_id, 2)])
				.collect(),
		)
		.await?;

		// The warm PIDX cache still points page 2 at the removed delta. The read finds the
		// delta blob missing, falls back to the shard, and evicts the stale row.
		assert_eq!(
			database_db.get_pages(vec![2]).await?,
			vec![FetchedPage {
				pgno: 2,
				bytes: Some(page(0x44)),
			}]
		);

		Ok(())
	})
}

#[cfg(feature = "pidx-cache")]
#[tokio::test]
async fn get_pages_invalidates_warm_cache_when_foreign_writer_advances_head() -> Result<()> {
	let db = common::test_db_arc("depot-read-head-fence").await?;
	// Two independent Db instances backed by the same database simulate two
	// pegboard-envoy connections (e.g. a not-yet-evicted zombie conn and the new
	// owner) that each hold their own per-conn PIDX cache.
	let writer_db = common::make_db(db.clone(), test_bucket(), TEST_DATABASE.to_string());
	let reader_db = common::make_db(db.clone(), test_bucket(), TEST_DATABASE.to_string());

	// Seed the first version of page 2 and warm the reader's PIDX cache against it.
	writer_db
		.commit(vec![dirty_page(2, 0x22)], 3, 1_000)
		.await?;
	assert_eq!(
		reader_db.get_pages(vec![2]).await?,
		vec![FetchedPage {
			pgno: 2,
			bytes: Some(page(0x22)),
		}],
	);

	// A foreign writer commits a new version of page 2 and advances the head. The
	// reader's cache still maps page 2 to the old delta txid, and the old delta blob is
	// still present because no compaction ran, so a cache trusted on branch identity
	// alone would return the stale bytes.
	writer_db
		.commit(vec![dirty_page(2, 0x33)], 3, 2_000)
		.await?;

	// The head fence sees the advanced head, discards the stale cache, and rescans PIDX
	// so the reader returns the current page contents.
	assert_eq!(
		reader_db.get_pages(vec![2]).await?,
		vec![FetchedPage {
			pgno: 2,
			bytes: Some(page(0x33)),
		}],
		"reader must invalidate its warm PIDX cache once the head advances past it",
	);

	Ok(())
}

#[cfg(all(feature = "test-faults", feature = "pidx-cache"))]
#[tokio::test]
async fn pidx_rows_loaded_before_concurrent_commit_do_not_publish_stale_cache() -> Result<()> {
	use depot::fault::{DepotFaultPoint, ReadFaultPoint};

	let db = common::test_db_arc("depot-read-pidx-publication-race").await?;
	let writer_db = common::make_db(db.clone(), test_bucket(), TEST_DATABASE.to_string());
	writer_db
		.commit(vec![dirty_page(2, 0x22)], 3, 1_000)
		.await?;

	let controller = DepotFaultController::new();
	controller
		.at(DepotFaultPoint::Read(ReadFaultPoint::AfterPidxScan))
		.page_number(2)
		.once()
		.pause("after-pidx-scan")?;
	let pause = controller.pause_handle("after-pidx-scan");
	let replay_controller = controller.clone();
	let reader_db = Arc::new(Db::new_with_fault_controller_for_test(
		db.clone(),
		test_bucket(),
		TEST_DATABASE.to_string(),
		NodeId::new(),
		controller,
	));

	let read_task = tokio::spawn({
		let reader_db = reader_db.clone();
		async move { reader_db.get_pages(vec![2]).await }
	});
	timeout(Duration::from_secs(5), pause.wait_reached()).await?;

	writer_db
		.commit(vec![dirty_page(2, 0x33)], 3, 2_000)
		.await?;
	pause.release();

	// The released read either completes against the version it planned at (0x22) or is aborted by
	// the concurrent commit and re-runs to completion at the newer version (0x33). Both are correct
	// answers to "read page 2 now", and the caller only ever sees the final attempt, so pinning one
	// of them asserts whether a retry happened rather than anything about the cache. Which one
	// appears is a property of the backing driver: the test driver resolves each read against
	// current state rather than a pinned transaction read version, and compensates by conflicting
	// the reader, so it takes the retry. See `~/.agents/todo/udb-driver-conflict-parity.md`.
	let first_read = read_task.await??;
	assert!(
		first_read
			== vec![FetchedPage {
				pgno: 2,
				bytes: Some(page(0x22)),
			}] || first_read
			== vec![FetchedPage {
				pgno: 2,
				bytes: Some(page(0x33)),
			}],
		"released read must return one of the two committed versions of page 2, got {first_read:?}"
	);

	// The invariant under test. A retried reader plans afresh at the new head, so it is only the
	// non-retried path that can carry pre-commit PIDX rows into the publish step, which is where the
	// cache-head reset has to catch them.
	assert_eq!(
		reader_db.get_pages(vec![2]).await?,
		vec![FetchedPage {
			pgno: 2,
			bytes: Some(page(0x33)),
		}],
		"reader must not publish stale PIDX rows loaded before the concurrent commit"
	);
	replay_controller.assert_expected_fired()?;

	Ok(())
}

#[tokio::test]
async fn get_pages_reads_latest_shard_version_not_past_head() -> Result<()> {
	read_matrix!("depot-read-shard-version", |ctx, db, database_db| {
		database_db
			.commit(vec![dirty_page(1, 0x11)], 3, 1_000)
			.await?;
		let branch_id = read_database_branch_id(&db).await?;
		seed(
			&db,
			vec![
				(
					branch_meta_head_key(branch_id),
					encode_db_head(head_at(4, 3))?,
				),
				(
					branch_shard_key(branch_id, 0, 2),
					encoded_blob(2, &[(2, 0x22)])?,
				),
				(
					branch_shard_key(branch_id, 0, 4),
					encoded_blob(4, &[(2, 0x44)])?,
				),
				(
					branch_shard_key(branch_id, 0, 5),
					encoded_blob(5, &[(2, 0x55)])?,
				),
			],
			Vec::new(),
		)
		.await?;

		assert_eq!(
			database_db.get_pages(vec![2]).await?,
			vec![FetchedPage {
				pgno: 2,
				bytes: Some(page(0x44)),
			}]
		);

		Ok(())
	})
}

#[tokio::test]
async fn get_pages_reads_delta_before_published_branch_shard() -> Result<()> {
	read_matrix!("depot-read-delta-before-shard", |ctx, db, database_db| {
		database_db
			.commit(vec![dirty_page(1, 0x11)], 1, 1_000)
			.await?;
		let branch_id = read_database_branch_id(&db).await?;

		seed(
			&db,
			vec![
				(
					branch_compaction_root_key(branch_id),
					encode_compaction_root(compaction_root(1))?,
				),
				(
					branch_shard_key(branch_id, 0, 1),
					encoded_blob(1, &[(1, 0x44)])?,
				),
			],
			Vec::new(),
		)
		.await?;

		assert_eq!(
			database_db.get_pages(vec![1]).await?,
			vec![FetchedPage {
				pgno: 1,
				bytes: Some(page(0x11)),
			}]
		);

		Ok(())
	})
}

#[tokio::test]
async fn get_pages_falls_back_to_published_branch_shard_when_delta_is_missing() -> Result<()> {
	read_matrix!("depot-read-shard-fallback", |ctx, db, database_db| {
		let fdb_hit = metrics::SQLITE_SHARD_CACHE_READ_TOTAL
			.with_label_values(&[metrics::SHARD_CACHE_READ_FDB_HIT]);
		let fdb_hit_before = fdb_hit.get();
		database_db
			.commit(vec![dirty_page(1, 0x11)], 1, 1_000)
			.await?;
		let branch_id = read_database_branch_id(&db).await?;

		seed(
			&db,
			vec![
				(
					branch_compaction_root_key(branch_id),
					encode_compaction_root(compaction_root(1))?,
				),
				(
					branch_shard_key(branch_id, 0, 1),
					encoded_blob(1, &[(1, 0x44)])?,
				),
			],
			delta_keys_for_txid(&db, branch_id, 1).await?,
		)
		.await?;

		assert_eq!(
			database_db.get_pages(vec![1]).await?,
			vec![FetchedPage {
				pgno: 1,
				bytes: Some(page(0x44)),
			}]
		);
		assert!(fdb_hit.get() >= fdb_hit_before + 1);

		Ok(())
	})
}

#[tokio::test]
async fn get_pages_records_shard_cache_miss_when_no_shard_or_cold_ref_covers_page() -> Result<()> {
	common::test_matrix("depot-read-cache-miss", |_tier, ctx| {
		Box::pin(async move {
			let db = ctx.udb.clone();
			let database_db = ctx.make_db(test_bucket(), TEST_DATABASE);
			let miss = metrics::SQLITE_SHARD_CACHE_READ_TOTAL
				.with_label_values(&[metrics::SHARD_CACHE_READ_MISS]);
			let miss_before = miss.get();
			database_db
				.commit(vec![dirty_page(1, 0x11)], 1, 1_000)
				.await?;
			let branch_id = read_database_branch_id(&db).await?;
			seed(
				&db,
				Vec::new(),
				delta_keys_for_txid(&db, branch_id, 1)
					.await?
					.into_iter()
					.chain([branch_pidx_key(branch_id, 1)])
					.collect(),
			)
			.await?;

			assert_eq!(
				database_db.get_pages(vec![1]).await?,
				vec![FetchedPage {
					pgno: 1,
					bytes: Some(page(0)),
				}]
			);
			assert!(miss.get() >= miss_before + 1);

			Ok(())
		})
	})
	.await
}

#[tokio::test]
async fn get_pages_zero_fills_sparse_page_without_any_source() -> Result<()> {
	read_matrix!("depot-read-sparse-zero", |ctx, db, database_db| {
		database_db
			.commit(vec![dirty_page(1, 0x11)], 3, 1_000)
			.await?;

		assert_eq!(
			database_db.get_pages(vec![2]).await?,
			vec![FetchedPage {
				pgno: 2,
				bytes: Some(page(0)),
			}]
		);

		Ok(())
	})
}

#[tokio::test]
async fn get_pages_errors_for_corrupted_delta_source() -> Result<()> {
	read_matrix!("depot-read-corrupt-delta", |ctx, db, database_db| {
		database_db
			.commit(vec![dirty_page(1, 0x11)], 1, 1_000)
			.await?;
		let branch_id = read_database_branch_id(&db).await?;
		// Overwrite the commit's own first chunk rather than writing a key of a layout it did not
		// use, which would add a stray row instead of corrupting the delta it actually wrote.
		let delta_keys = delta_keys_for_txid(&db, branch_id, 1).await?;
		seed(
			&db,
			vec![(delta_keys[0].clone(), b"not an ltx blob".to_vec())],
			Vec::new(),
		)
		.await?;

		let err = database_db
			.get_pages(vec![1])
			.await
			.expect_err("corrupted delta source should error instead of zero-filling");
		assert!(
			err.chain()
				.any(|cause| cause.to_string().contains("decode source blob for page 1"))
		);

		Ok(())
	})
}

#[tokio::test]
async fn get_pages_returns_zero_for_hot_only_missing_in_range_page() -> Result<()> {
	read_matrix!("depot-read-hot-missing-zero", |ctx, db, database_db| {
		database_db
			.commit(vec![dirty_page(1, 0x11)], 3, 1_000)
			.await?;

		assert_eq!(
			database_db.get_pages(vec![2]).await?,
			vec![FetchedPage {
				pgno: 2,
				bytes: Some(page(0)),
			}]
		);

		Ok(())
	})
}

#[tokio::test]
async fn get_pages_throttles_access_touch_for_same_bucket_shard_reads() -> Result<()> {
	read_matrix!("depot-read-access-touch", |ctx, db, database_db| {
		database_db
			.commit(vec![dirty_page(1, 0x11)], 1, 1_000)
			.await?;
		let branch_id = read_database_branch_id(&db).await?;

		seed(
			&db,
			vec![(
				branch_shard_key(branch_id, 0, 1),
				encoded_blob(1, &[(1, 0x44)])?,
			)],
			vec![
				branch_delta_chunk_key(branch_id, 1, 0),
				branch_pidx_key(branch_id, 1),
			],
		)
		.await?;

		assert_eq!(
			database_db.get_pages(vec![1]).await?,
			vec![FetchedPage {
				pgno: 1,
				bytes: Some(page(0x44)),
			}]
		);
		let first_touch = read_i64_le(&db, branch_manifest_last_access_ts_ms_key(branch_id))
			.await?
			.expect("shard read should touch access timestamp");
		let first_bucket = read_i64_le(&db, branch_manifest_last_access_bucket_key(branch_id))
			.await?
			.expect("shard read should touch access bucket");
		assert_eq!(
			first_bucket,
			first_touch.div_euclid(ACCESS_TOUCH_THROTTLE_MS)
		);

		assert_eq!(
			database_db.get_pages(vec![1]).await?,
			vec![FetchedPage {
				pgno: 1,
				bytes: Some(page(0x44)),
			}]
		);
		assert_eq!(
			read_i64_le(&db, branch_manifest_last_access_ts_ms_key(branch_id)).await?,
			Some(first_touch)
		);
		assert_eq!(
			read_i64_le(&db, branch_manifest_last_access_bucket_key(branch_id)).await?,
			Some(first_bucket)
		);

		Ok(())
	})
}

#[tokio::test]
async fn diagnostic_get_pages_does_not_publish_hot_read_side_effects() -> Result<()> {
	read_matrix!(
		"depot-read-diagnostic-hot-no-side-effects",
		|ctx, db, database_db| {
			database_db
				.commit(vec![dirty_page(1, 0x11)], 1, 1_000)
				.await?;
			let branch_id = read_database_branch_id(&db).await?;
			let snapshot_before = database_db.branch_cache_snapshot_for_test().await;
			let access_ts_before =
				read_i64_le(&db, branch_manifest_last_access_ts_ms_key(branch_id)).await?;
			let access_bucket_before =
				read_i64_le(&db, branch_manifest_last_access_bucket_key(branch_id)).await?;
			let _ = database_db.take_metering_snapshot();

			seed(
				&db,
				vec![(
					branch_shard_key(branch_id, 0, 1),
					encoded_blob(1, &[(1, 0x44)])?,
				)],
				delta_keys_for_txid(&db, branch_id, 1)
					.await?
					.into_iter()
					.chain([branch_pidx_key(branch_id, 1)])
					.collect(),
			)
			.await?;

			let result = database_db
				.get_pages_with_options(
					vec![1],
					GetPagesOptions {
						mode: DepotReadMode::DiagnosticNoSideEffects,
						collect_provenance: true,
						..Default::default()
					},
				)
				.await?;

			assert_eq!(
				result.pages,
				vec![FetchedPage {
					pgno: 1,
					bytes: Some(page(0x44)),
				}]
			);
			assert_eq!(result.provenance.len(), 1);
			assert_eq!(
				read_i64_le(&db, branch_manifest_last_access_ts_ms_key(branch_id)).await?,
				access_ts_before
			);
			assert_eq!(
				read_i64_le(&db, branch_manifest_last_access_bucket_key(branch_id)).await?,
				access_bucket_before
			);
			assert_eq!(
				database_db.branch_cache_snapshot_for_test().await,
				snapshot_before
			);
			assert_eq!(database_db.take_metering_snapshot(), (0, 0));

			Ok(())
		}
	)
}

#[tokio::test]
async fn read_lazily_caches_only_requested_pidx_pages() -> Result<()> {
	read_matrix!("depot-read-lazy-pidx-cache", |ctx, db, database_db| {
		// Commit three pages in one transaction so all share head txid 1.
		database_db
			.commit(
				vec![
					dirty_page(1, 0x11),
					dirty_page(2, 0x22),
					dirty_page(3, 0x33),
				],
				3,
				1_000,
			)
			.await?;

		// Reading only page 2 must teach the cache only page 2's owner, not the
		// whole PIDX. The prior full-scan path cached every page on any read.
		assert_eq!(
			database_db.get_pages(vec![2]).await?,
			vec![FetchedPage {
				pgno: 2,
				bytes: Some(page(0x22)),
			}]
		);
		let (_, _, _, owners) = database_db
			.branch_cache_snapshot_for_test()
			.await
			.expect("cache should be warm after read");
		assert_eq!(owners, vec![(2, 1)]);

		// Reading page 1 lazily adds only page 1's owner.
		assert_eq!(
			database_db.get_pages(vec![1]).await?,
			vec![FetchedPage {
				pgno: 1,
				bytes: Some(page(0x11)),
			}]
		);
		let (_, _, _, owners) = database_db
			.branch_cache_snapshot_for_test()
			.await
			.expect("cache should stay warm");
		assert_eq!(owners, vec![(1, 1), (2, 1)]);

		Ok(())
	})
}

#[tokio::test]
async fn commit_does_not_seed_cold_pidx_cache() -> Result<()> {
	read_matrix!("depot-read-commit-no-seed", |ctx, db, database_db| {
		// A commit against a cold cache must not seed PIDX owners. Seeding would let
		// the cache claim ownership of a page the store could later drop behind its
		// back (eviction/compaction), turning a no-source read into a broken-coverage
		// error instead of a zero fill.
		database_db
			.commit(vec![dirty_page(1, 0x11)], 1, 1_000)
			.await?;
		if let Some((_, _, _, owners)) = database_db.branch_cache_snapshot_for_test().await {
			assert!(
				owners.is_empty(),
				"commit must not seed a cold pidx cache: {owners:?}"
			);
		}

		Ok(())
	})
}

#[tokio::test]
async fn commit_refreshes_cached_pidx_owner_after_head_advance() -> Result<()> {
	read_matrix!("depot-read-cache-head-advance", |ctx, db, database_db| {
		database_db
			.commit(vec![dirty_page(1, 0x11)], 1, 1_000)
			.await?;
		// Warm the cache so page 1's owner (txid 1) is known.
		assert_eq!(
			database_db.get_pages(vec![1]).await?,
			vec![FetchedPage {
				pgno: 1,
				bytes: Some(page(0x11)),
			}]
		);
		let (_, _, _, owners) = database_db
			.branch_cache_snapshot_for_test()
			.await
			.expect("cache should be warm");
		assert_eq!(owners, vec![(1, 1)]);

		// Overwriting page 1 advances the head; the commit must refresh the cached
		// owner so the next read does not serve the stale delta.
		database_db
			.commit(vec![dirty_page(1, 0x22)], 1, 2_000)
			.await?;
		let (_, _, _, owners) = database_db
			.branch_cache_snapshot_for_test()
			.await
			.expect("cache should stay warm");
		assert_eq!(owners, vec![(1, 2)]);
		assert_eq!(
			database_db.get_pages(vec![1]).await?,
			vec![FetchedPage {
				pgno: 1,
				bytes: Some(page(0x22)),
			}]
		);

		Ok(())
	})
}

#[tokio::test]
async fn get_pages_keeps_branch_shard_fallback_without_compaction_root() -> Result<()> {
	read_matrix!("depot-read-shard-no-root", |ctx, db, database_db| {
		database_db
			.commit(vec![dirty_page(1, 0x11)], 1, 1_000)
			.await?;
		let branch_id = read_database_branch_id(&db).await?;

		seed(
			&db,
			vec![(
				branch_shard_key(branch_id, 0, 1),
				encoded_blob(1, &[(1, 0x44)])?,
			)],
			delta_keys_for_txid(&db, branch_id, 1).await?,
		)
		.await?;

		assert_eq!(
			database_db.get_pages(vec![1]).await?,
			vec![FetchedPage {
				pgno: 1,
				bytes: Some(page(0x44)),
			}]
		);

		Ok(())
	})
}

#[tokio::test]
async fn get_pages_errors_on_cold_only_coverage_without_a_cold_tier() -> Result<()> {
	let (db, _db_dir) = common::test_db_with_dir("depot-read-compaction-cold-ref").await?;
	let database_db = common::make_db(db.clone(), test_bucket(), TEST_DATABASE);
	database_db
		.commit(vec![dirty_page(1, 0x11)], 1, 1_000)
		.await?;
	let branch_id = read_database_branch_id(&db).await?;
	let object_bytes = encoded_blob(1, &[(1, 0x66)])?;
	let cold_ref = ColdShardRef {
		object_key: format!(
			"db/{}/shard/00000000/0000000000000001-{}-workflow.ltx",
			branch_id.as_uuid().simple(),
			Id::v1(uuid::Uuid::from_u128(0x1234), 7)
		),
		object_generation_id: Id::v1(uuid::Uuid::from_u128(0x1234), 7),
		shard_id: 0,
		as_of_txid: 1,
		min_txid: 1,
		max_txid: 1,
		min_versionstamp: [1; 16],
		max_versionstamp: [2; 16],
		size_bytes: object_bytes.len() as u64,
		content_hash: sha256(&object_bytes),
		publish_generation: 2,
	};

	// A branch left behind by an enterprise build can still carry cold refs. Their objects are
	// unreachable here, so the read has to report missing coverage rather than zero-fill the page.
	seed(
		&db,
		vec![
			(
				branch_compaction_root_key(branch_id),
				encode_compaction_root(compaction_root(2))?,
			),
			(
				branch_compaction_cold_shard_key(branch_id, 0, 1),
				encode_cold_shard_ref(cold_ref)?,
			),
		],
		delta_keys_for_txid(&db, branch_id, 1)
			.await?
			.into_iter()
			.chain([branch_pidx_key(branch_id, 1)])
			.collect(),
	)
	.await?;

	let err = database_db
		.get_pages(vec![1])
		.await
		.expect_err("cold-disabled reads should fail on cold-only coverage");
	assert!(matches!(
		err.downcast_ref::<SqliteStorageError>(),
		Some(SqliteStorageError::ShardCoverageMissing { pgno: 1 })
	));

	Ok(())
}

#[tokio::test]
async fn get_pages_returns_none_above_eof() -> Result<()> {
	read_matrix!("depot-read-above-eof", |ctx, db, database_db| {
		database_db
			.commit(vec![dirty_page(1, 0x11)], 3, 1_000)
			.await?;

		assert_eq!(
			database_db.get_pages(vec![4]).await?,
			vec![FetchedPage {
				pgno: 4,
				bytes: None,
			}]
		);

		Ok(())
	})
}

#[tokio::test]
async fn pidx_owned_delta_lacking_its_page_errors_instead_of_zero_fill() -> Result<()> {
	read_matrix!("depot-read-delta-page-missing", |ctx, db, database_db| {
		database_db
			.commit(vec![dirty_page(1, 0x11)], 3, 1_000)
			.await?;
		let branch_id = read_database_branch_id(&db).await?;
		// Point page 2 at the txid 1 delta, which only carries page 1.
		seed(
			&db,
			vec![(branch_pidx_key(branch_id, 2), 1_u64.to_be_bytes().to_vec())],
			Vec::new(),
		)
		.await?;

		let err = database_db
			.get_pages(vec![2])
			.await
			.expect_err("a pidx-owned delta that lacks the page must fail the read");
		assert!(matches!(
			err.downcast_ref::<SqliteStorageError>(),
			Some(SqliteStorageError::DeltaPageMissing { pgno: 2, txid: 1 })
		));

		Ok(())
	})
}

#[tokio::test]
async fn shard_image_lacking_a_covered_page_is_counted() -> Result<()> {
	read_matrix!("depot-read-shard-page-missing", |ctx, db, _database_db| {
		let node_id = NodeId::new();
		let database_db = Db::new(
			ctx.udb.clone(),
			test_bucket(),
			TEST_DATABASE.to_string(),
			node_id,
		);
		database_db
			.commit(vec![dirty_page(1, 0x11), dirty_page(2, 0x22)], 3, 1_000)
			.await?;
		let branch_id = read_database_branch_id(&db).await?;
		// Publish a shard image that claims txid 1 but only carries page 1, and drop the delta and
		// PIDX rows so page 2 has to resolve through that image.
		seed(
			&db,
			vec![(
				branch_shard_key(branch_id, 0, 1),
				encoded_blob(1, &[(1, 0x11)])?,
			)],
			vec![
				branch_delta_chunk_key(branch_id, 1, 0),
				branch_pidx_key(branch_id, 1),
				branch_pidx_key(branch_id, 2),
			],
		)
		.await?;

		let counter = metrics::SQLITE_READ_SHARD_PAGE_MISSING_TOTAL
			.with_label_values(&[node_id.to_string().as_str()]);
		let before = counter.get();
		assert_eq!(
			database_db.get_pages(vec![2]).await?,
			vec![FetchedPage {
				pgno: 2,
				bytes: Some(page(0)),
			}]
		);
		assert_eq!(
			counter.get(),
			before + 1,
			"a shard image missing a page it covers must be counted"
		);

		Ok(())
	})
}

#[tokio::test]
async fn page_one_disagreeing_with_the_commit_size_fails_the_read() -> Result<()> {
	read_matrix!("depot-read-stale-main-page", |ctx, db, database_db| {
		// The commit records three pages while page one's header claims two, which is the shape a
		// stale page one takes: a header from an older, shorter point in history paired with the
		// current size.
		database_db
			.commit(
				vec![
					DirtyPage {
						pgno: 1,
						bytes: main_page(2),
					},
					dirty_page(2, 0x22),
					dirty_page(3, 0x33),
				],
				3,
				1_000,
			)
			.await?;

		let err = database_db
			.get_pages(vec![1])
			.await
			.expect_err("page one disagreeing with the commit size must fail the read");
		assert!(matches!(
			err.downcast_ref::<SqliteStorageError>(),
			Some(SqliteStorageError::StaleMainPage {
				page_db_size_pages: 2,
				head_db_size_pages: 3,
				..
			})
		));

		Ok(())
	})
}

#[tokio::test]
async fn page_one_agreeing_with_the_commit_size_reads_normally() -> Result<()> {
	read_matrix!("depot-read-consistent-main-page", |ctx, db, database_db| {
		database_db
			.commit(
				vec![
					DirtyPage {
						pgno: 1,
						bytes: main_page(2),
					},
					dirty_page(2, 0x22),
				],
				2,
				1_000,
			)
			.await?;

		assert_eq!(
			database_db.get_pages(vec![1]).await?,
			vec![FetchedPage {
				pgno: 1,
				bytes: Some(main_page(2)),
			}]
		);

		Ok(())
	})
}
