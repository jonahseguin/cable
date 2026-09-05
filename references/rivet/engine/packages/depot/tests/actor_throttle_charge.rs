//! The actor-facing depot paths must charge the actor throttle for what they actually move.
//!
//! Segmented commits let a single actor push an unbounded byte volume through `commit`, so the
//! commit and `get_pages` paths charge a UniversalDB throttle the way the compaction paths already
//! do. Two properties matter and are asserted here: the charge lands on the *actor* throttle rather
//! than compaction's (sharing one budget is how staging starved install once), and a staged commit
//! charges per segment rather than once at finalize, since by finalize the bytes have already landed
//! and there is nothing left to slow down.

mod common;

use anyhow::Result;
use depot::{keys::PAGE_SIZE, types::DirtyPage};
use gas::prelude::Id;
use rivet_config::config::{DEPOT_ACTOR_THROTTLE, DEPOT_COMPACTION_THROTTLE};
use rivet_pools::NodeId;
use std::sync::Arc;
use universaldb::{
	ThrottleKind,
	throttle::{DEFAULT_WINDOW_MS, window_counter_key, window_index},
};

const TEST_DATABASE: &str = "actor-throttle-charge";

/// Fixed wall clock so the window a charge lands in is deterministic.
const NOW_MS: i64 = 1_700_000_000_000;

/// Budget large enough that admission is never in question: these tests are about the size and
/// destination of the charge, not the gate.
const BYTES_PER_SECOND: u64 = 1024 * 1024 * 1024;

fn test_bucket() -> Id {
	Id::v1(uuid::Uuid::from_u128(0x5eae), 1)
}

fn dirty_page(pgno: u32, fill: u8) -> DirtyPage {
	DirtyPage {
		pgno,
		bytes: vec![fill; PAGE_SIZE as usize],
	}
}

async fn charged_window_bytes(
	udb: &universaldb::Database,
	name: &str,
	kind: ThrottleKind,
) -> Result<i64> {
	let raw = common::read_value(
		udb,
		window_counter_key(name, kind, window_index(NOW_MS, DEFAULT_WINDOW_MS)),
	)
	.await?;

	Ok(raw.map_or(0, |bytes| {
		i64::from_le_bytes(bytes.as_slice().try_into().expect("counter is 8 bytes"))
	}))
}

#[tokio::test]
async fn actor_commit_and_get_pages_charge_the_actor_throttle() -> Result<()> {
	let udb = Arc::new(
		common::test_db_with_throttle("depot-actor-throttle-charge", BYTES_PER_SECOND, NOW_MS)
			.await?,
	);
	let database_db = depot::conveyer::Db::new(
		udb.clone(),
		test_bucket(),
		TEST_DATABASE.to_string(),
		NodeId::new(),
	);

	database_db
		.commit(vec![dirty_page(1, 0x11)], 2, NOW_MS)
		.await?;
	udb.flush_throttle().await?;
	let write_after_commit =
		charged_window_bytes(&udb, DEPOT_ACTOR_THROTTLE, ThrottleKind::Write).await?;
	assert!(
		write_after_commit > 0,
		"a commit must charge the actor write axis"
	);

	database_db.get_pages(vec![1]).await?;
	udb.flush_throttle().await?;
	assert!(
		charged_window_bytes(&udb, DEPOT_ACTOR_THROTTLE, ThrottleKind::Read).await? > 0,
		"get_pages must charge the actor read axis"
	);

	// The compaction budget is a separate lane and must stay untouched by actor traffic.
	assert_eq!(
		charged_window_bytes(&udb, DEPOT_COMPACTION_THROTTLE, ThrottleKind::Write).await?,
		0,
		"actor commits must not consume the compaction budget"
	);

	Ok(())
}

#[tokio::test]
async fn staged_commit_charges_each_segment_before_finalize() -> Result<()> {
	let udb = Arc::new(
		common::test_db_with_throttle("depot-actor-throttle-staged", BYTES_PER_SECOND, NOW_MS)
			.await?,
	);
	let database_db = depot::conveyer::Db::new(
		udb.clone(),
		test_bucket(),
		TEST_DATABASE.to_string(),
		NodeId::new(),
	);
	let shard = depot::keys::SHARD_SIZE;
	let max_shards = depot::constants::COMMIT_SEGMENT_MAX_SHARDS;

	let txid = database_db.commit_stage_begin(0, Some(0)).await?;
	database_db
		.commit_stage_segment(0, txid, 0, vec![dirty_page(1, 0xa1)])
		.await?;
	udb.flush_throttle().await?;
	let after_first = charged_window_bytes(&udb, DEPOT_ACTOR_THROTTLE, ThrottleKind::Write).await?;
	assert!(
		after_first > 0,
		"the first staged segment must charge before finalize"
	);

	database_db
		.commit_stage_segment(
			0,
			txid,
			shard * max_shards,
			vec![dirty_page(shard * max_shards + 1, 0xb1)],
		)
		.await?;
	udb.flush_throttle().await?;
	let after_second =
		charged_window_bytes(&udb, DEPOT_ACTOR_THROTTLE, ThrottleKind::Write).await?;
	assert!(
		after_second > after_first,
		"each segment must charge, not just the first: {after_second} vs {after_first}"
	);

	Ok(())
}
