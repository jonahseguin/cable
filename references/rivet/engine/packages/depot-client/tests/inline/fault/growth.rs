//! Growth-shaped fault scenarios.
//!
//! The rest of the fault suite churns a handful of tiny keys, so the database never leaves shard 0
//! and its page count is effectively constant. A whole class of defect is invisible at that scale:
//! anything where a compacted image taken at one txid and the current head disagree about how large
//! the database is. These scenarios grow the database monotonically across many shard and fold
//! boundaries and assert, after every restart, that the page 1 depot serves still agrees with
//! `/META/head` about the page count.

use anyhow::{Context, Result};
use depot::workflows::compaction::ForceCompactionWork;

use super::{FaultProfile, FaultScenario, LogicalOp, scenario::FaultScenarioCtx};

/// Each row spills into overflow pages, so one insert commits roughly nine 4 KiB pages and a round
/// of `ROWS_PER_ROUND` inserts grows the database past a 64-page shard boundary. This deliberately
/// matches the incident's shape: about two dozen commits of roughly nine pages between folds.
const PAYLOAD_LEN: usize = 32 * 1024;
const ROWS_PER_ROUND: i64 = 12;
const ROUNDS: i64 = 6;

#[test]
fn growth_across_fold_boundaries_keeps_page_one_size_at_head() -> Result<()> {
	FaultScenario::new("growth_across_fold_boundaries_keeps_page_one_size_at_head")
		.seed(0x9317_0403)
		.profile(FaultProfile::Chaos)
		.setup(|ctx| async move { configure_growth_database(&ctx).await })
		.workload(|ctx| async move { run_growth_rounds(&ctx, ROUNDS, false).await })
		.verify(|ctx| async move {
			ctx.verify_page_one_matches_head().await?;
			ctx.verify_sqlite_integrity().await?;
			ctx.verify_against_native_oracle().await?;
			ctx.verify_depot_invariants().await?;
			assert_eq!(
				ctx.query("SELECT COUNT(*) FROM heavy_items;").await?,
				vec![vec![(ROUNDS * ROWS_PER_ROUND).to_string()]]
			);
			Ok(())
		})
		.run()
}

async fn configure_growth_database(ctx: &FaultScenarioCtx) -> Result<()> {
	ctx.exec(LogicalOp::CreateHeavySchema).await
}

/// Grows the database across `rounds` fold boundaries, checking after every restart that page 1 and
/// head still agree on the page count.
///
/// With `reclaim`, each round also evicts the round's now cold-backed hot shard versions, which
/// requires the caller to have shortened the shard cache retention first.
async fn run_growth_rounds(ctx: &FaultScenarioCtx, rounds: i64, reclaim: bool) -> Result<()> {
	let mut pages_before = page_count(ctx).await?;
	for round in 0..rounds {
		grow_round(ctx, round).await?;

		ctx.force_compaction(ForceCompactionWork {
			hot: true,
			cold: true,
			reclaim: false,
			final_settle: false,
		})
		.await?;

		if reclaim {
			ctx.force_compaction(ForceCompactionWork {
				hot: false,
				cold: false,
				reclaim: true,
				final_settle: false,
			})
			.await?;
		}

		ctx.reload_database().await?;
		ctx.verify_page_one_matches_head().await?;
		ctx.checkpoint(format!("grow-round-{round}")).await?;

		let pages_after = page_count(ctx).await?;
		assert!(
			pages_after > pages_before,
			"growth round {round} should have grown the database, before={pages_before}, after={pages_after}"
		);
		pages_before = pages_after;
	}

	assert!(
		pages_before > depot::keys::SHARD_SIZE * 4,
		"growth workload should span several shards, page_count={pages_before}, shard_size={}",
		depot::keys::SHARD_SIZE
	);
	Ok(())
}

/// Pure INSERT, no DELETE and no VACUUM, so the database only ever grows and any observed shrink is
/// a defect rather than legitimate truncation.
async fn grow_round(ctx: &FaultScenarioCtx, round: i64) -> Result<()> {
	for offset in 0..ROWS_PER_ROUND {
		let id = round * ROWS_PER_ROUND + offset + 1;
		ctx.exec(LogicalOp::InsertHeavyBlob {
			id,
			bucket: format!("round-{round}"),
			payload: growth_payload(id, PAYLOAD_LEN),
		})
		.await?;
	}
	Ok(())
}

/// Pseudorandom bytes: patterned payloads compress below depot's delta thresholds and would not
/// produce the page volume the scenario depends on.
fn growth_payload(id: i64, len: usize) -> Vec<u8> {
	let mut state = (id as u64).wrapping_mul(0x9E37_79B9_7F4A_7C15) | 1;
	(0..len)
		.map(|_| {
			state ^= state << 13;
			state ^= state >> 7;
			state ^= state << 17;
			state as u8
		})
		.collect()
}

async fn page_count(ctx: &FaultScenarioCtx) -> Result<u32> {
	let rows = ctx.query("PRAGMA page_count;").await?;
	let value = rows
		.first()
		.and_then(|row| row.first())
		.context("PRAGMA page_count should return one row")?;
	value
		.parse::<u32>()
		.with_context(|| format!("page_count should be an integer: {value}"))
}

/// The same stale read, carried through to the durable damage it causes.
///
/// The read-level scenario above stops at the bad bytes. This one lets the VFS do what it does in
/// production: latch `db_size_pages` from the stale page 1 at open, then commit. The commit
/// publishes the short size, depot's truncate path deletes every page above it, and the rows in
/// those pages are gone. The head fence does not catch it because it compares txids, never bytes.
#[test]
fn stale_hot_shard_zero_truncates_the_database_on_the_next_commit() -> Result<()> {
	FaultScenario::new("stale_hot_shard_zero_truncates_the_database_on_the_next_commit")
		.seed(0x9317_0407)
		.profile(FaultProfile::Chaos)
		.setup(|ctx| async move { configure_growth_database(&ctx).await })
		.workload(|ctx| async move {
			for round in 0..2 {
				grow_round(&ctx, round).await?;
				ctx.force_compaction(ForceCompactionWork {
					hot: true,
					cold: true,
					reclaim: false,
					final_settle: false,
				})
				.await?;
			}
			let rows_before = ctx.query("SELECT COUNT(*) FROM heavy_items;").await?;
			assert_eq!(rows_before, vec![vec![(2 * ROWS_PER_ROUND).to_string()]]);

			let (_, head_txid) = ctx.branch_head().await?;
			let (hot_versions, _cold_versions) = ctx.shard_source_txids(0, head_txid).await?;
			let newest_hot = *hot_versions.last().expect("hot versions are non-empty");
			ctx.clear_hot_shard_version_for_harness_regression(0, newest_hot)
				.await?;

			// The actor restart that latches the short size, exactly as `VfsContext::new` does.
			ctx.reload_database().await?;

			// One ordinary write. This is what publishes the latched size and triggers the
			// truncate.
			ctx.exec(LogicalOp::InsertHeavyBlob {
				id: 9_001,
				bucket: "after-stale-open".to_string(),
				payload: growth_payload(9_001, PAYLOAD_LEN),
			})
			.await?;
			ctx.checkpoint("after-truncating-commit").await?;
			Ok(())
		})
		.verify(|ctx| async move {
			// Any of these failing is the corruption: a malformed image, lost committed rows, or a
			// page count that went backwards without a DELETE or VACUUM.
			ctx.verify_sqlite_integrity().await?;
			ctx.verify_against_native_oracle().await?;
			Ok(())
		})
		.run()
}
