//! Bounding an ancestor source's DELTA-history walk by its folded shard versions.
//!
//! A forked read resolves a page with no usable PIDX owner by walking the ancestor's DELTA history
//! newest-first. A page whose last pre-fork write was already folded into a SHARD version appears in
//! no retained delta, so that walk has nothing to find and used to run the ancestor's whole retained
//! history to exhaustion on every read before the SHARD fallback got a turn. The walk must stop at
//! the newest shard version covering the page, while still reading the deltas above it.

mod common;

use anyhow::Result;
use depot::{
	conveyer::branch,
	keys::{
		PAGE_SIZE, branch_commit_key, branch_compaction_root_key, branch_pidx_key, branch_shard_key,
	},
	ltx::{LtxHeader, encode_ltx_v3},
	types::{
		BucketId, CompactionRoot, DirtyPage, PageSourceKind, ResolvedVersionstamp,
		decode_commit_row, decode_db_head, encode_compaction_root,
	},
};
use gas::prelude::Id;
const TEST_DATABASE: &str = "delta-history-bounded";
const DB_SIZE_PAGES: u32 = 4;
/// Parent commits written after the shard fold. Comfortably more than one commit so an unbounded
/// walk is visibly different from a bounded one, and small enough to stay a fast test.
const TAIL_COMMITS: u32 = 40;

fn test_bucket() -> Id {
	Id::v1(uuid::Uuid::from_u128(0xd1a1), 1)
}

fn page(pgno: u32, fill: u8) -> DirtyPage {
	DirtyPage {
		pgno,
		bytes: vec![fill; PAGE_SIZE as usize],
	}
}

fn page_bytes(fill: u8) -> Vec<u8> {
	vec![fill; PAGE_SIZE as usize]
}

fn shard_blob(as_of_txid: u64, pages: Vec<DirtyPage>) -> Result<Vec<u8>> {
	encode_ltx_v3(LtxHeader::delta(as_of_txid, 1, 999), &pages)
}

async fn read_head_txid(
	udb: &universaldb::Database,
	branch_id: depot::types::DatabaseBranchId,
) -> Result<u64> {
	let head_bytes = common::read_value(udb, depot::keys::branch_meta_head_key(branch_id))
		.await?
		.expect("branch head should exist");

	Ok(decode_db_head(&head_bytes)?.head_txid)
}

async fn read_branch_id(udb: &universaldb::Database) -> Result<depot::types::DatabaseBranchId> {
	udb.txn("test_depot_delta_history_branch", move |tx| async move {
		Ok(branch::resolve_database_branch(
			&tx,
			BucketId::from_gas_id(test_bucket()),
			TEST_DATABASE,
			universaldb::utils::IsolationLevel::Serializable,
		)
		.await?
		.expect("database branch should exist"))
	})
	.await
}

/// Installs a shard version, clears the folded pages' PIDX rows, and advances the hot watermark: the
/// state a hot fold leaves behind. The deltas that fed the fold stay in place, as they do until
/// reclaim catches up.
async fn install_fold(
	udb: &universaldb::Database,
	branch_id: depot::types::DatabaseBranchId,
	as_of_txid: u64,
	pages: Vec<DirtyPage>,
) -> Result<()> {
	let blob = shard_blob(as_of_txid, pages.clone())?;
	udb.txn("test_depot_delta_history_fold", move |tx| {
		let blob = blob.clone();
		let pages = pages.clone();
		async move {
			tx.informal()
				.set(&branch_shard_key(branch_id, 0, as_of_txid), &blob);
			for page in &pages {
				tx.informal().clear(&branch_pidx_key(branch_id, page.pgno));
			}
			tx.informal().set(
				&branch_compaction_root_key(branch_id),
				&encode_compaction_root(CompactionRoot {
					schema_version: 1,
					manifest_generation: 1,
					hot_watermark_txid: as_of_txid,
					cold_watermark_txid: 0,
					cold_watermark_versionstamp: [0; 16],
				})?,
			);
			Ok(())
		}
	})
	.await
}

async fn clear_hot_watermark(
	udb: &universaldb::Database,
	branch_id: depot::types::DatabaseBranchId,
) -> Result<()> {
	udb.txn(
		"test_depot_delta_history_clear_root",
		move |tx| async move {
			tx.informal().clear(&branch_compaction_root_key(branch_id));
			Ok(())
		},
	)
	.await
}

async fn clear_pidx(
	udb: &universaldb::Database,
	branch_id: depot::types::DatabaseBranchId,
	pgno: u32,
) -> Result<()> {
	udb.txn(
		"test_depot_delta_history_clear_pidx",
		move |tx| async move {
			tx.informal().clear(&branch_pidx_key(branch_id, pgno));
			Ok(())
		},
	)
	.await
}

async fn commit_versionstamp(
	udb: &universaldb::Database,
	branch_id: depot::types::DatabaseBranchId,
	txid: u64,
) -> Result<[u8; 16]> {
	let bytes = common::read_value(udb, branch_commit_key(branch_id, txid))
		.await?
		.expect("commit row should exist");

	Ok(decode_commit_row(&bytes)?.versionstamp)
}

/// A folded page reads no ancestor delta history at all: the shard version covering it is the walk's
/// floor, and it sits at the fork cap, so there is nothing above it to read.
#[tokio::test]
async fn folded_page_reads_no_ancestor_delta_history() -> Result<()> {
	let ctx =
		common::build_test_db("depot-delta-history-folded", common::TierMode::Disabled).await?;
	let udb = ctx.udb.clone();
	let source = ctx.make_db(test_bucket(), TEST_DATABASE);

	source
		.commit(vec![page(1, 0x11)], DB_SIZE_PAGES, 1_000)
		.await?;
	for i in 0..TAIL_COMMITS {
		source
			.commit(
				vec![page(2, 0x20 + (i % 8) as u8)],
				DB_SIZE_PAGES,
				2_000 + i as i64,
			)
			.await?;
	}

	let branch_id = read_branch_id(&udb).await?;
	let head_txid = read_head_txid(&udb, branch_id).await?;
	// Fold every page of shard 0 that has been written, at the current head.
	install_fold(
		&udb,
		branch_id,
		head_txid,
		vec![
			page(1, 0x11),
			page(2, 0x20 + ((TAIL_COMMITS - 1) % 8) as u8),
		],
	)
	.await?;

	let fork_at = commit_versionstamp(&udb, branch_id, head_txid).await?;
	let forked_database_id = branch::fork_database(
		&udb,
		BucketId::from_gas_id(test_bucket()),
		TEST_DATABASE.to_string(),
		ResolvedVersionstamp {
			versionstamp: fork_at,
			restore_point: None,
		},
		BucketId::from_gas_id(test_bucket()),
	)
	.await?;

	let forked = ctx.make_db(test_bucket(), forked_database_id);
	let result = forked.get_pages_with_metadata(vec![1]).await?;

	assert_eq!(
		result.pages[0].bytes,
		Some(page_bytes(0x11)),
		"the folded page must still read its committed contents"
	);
	assert_eq!(
		result.read_stats.historical_delta_chunk_rows_scanned, 0,
		"a folded page must read no ancestor delta history"
	);
	assert!(
		result.read_stats.historical_delta_pages_shard_superseded >= 1,
		"the page must be recorded as covered by a shard version"
	);
	assert_eq!(
		result.read_stats.historical_delta_scan_floor_txid, 0,
		"no walk ran, so no floor was needed to bound one"
	);

	Ok(())
}

/// The floor bounds the walk without hiding the deltas above it: a page written after the fold, whose
/// PIDX owner was stolen by a post-fork commit, still resolves from the ancestor's delta rather than
/// the older shard version.
#[tokio::test]
async fn delta_above_the_fold_still_wins_over_the_shard_version() -> Result<()> {
	let ctx =
		common::build_test_db("depot-delta-history-above", common::TierMode::Disabled).await?;
	let udb = ctx.udb.clone();
	let source = ctx.make_db(test_bucket(), TEST_DATABASE);

	source
		.commit(vec![page(1, 0x11)], DB_SIZE_PAGES, 1_000)
		.await?;
	let branch_id = read_branch_id(&udb).await?;
	let fold_txid = read_head_txid(&udb, branch_id).await?;
	install_fold(&udb, branch_id, fold_txid, vec![page(1, 0x11)]).await?;

	// Rewrite the page above the fold, then fork after that write.
	source
		.commit(vec![page(1, 0x22)], DB_SIZE_PAGES, 2_000)
		.await?;
	let head_txid = read_head_txid(&udb, branch_id).await?;
	let fork_at = commit_versionstamp(&udb, branch_id, head_txid).await?;
	let forked_database_id = branch::fork_database(
		&udb,
		BucketId::from_gas_id(test_bucket()),
		TEST_DATABASE.to_string(),
		ResolvedVersionstamp {
			versionstamp: fork_at,
			restore_point: None,
		},
		BucketId::from_gas_id(test_bucket()),
	)
	.await?;

	// A post-fork parent write moves the parent's PIDX owner above the fork cap, so the fork can
	// only resolve the page through the capped delta history or the shard version.
	source
		.commit(vec![page(1, 0x33)], DB_SIZE_PAGES, 3_000)
		.await?;

	let forked = ctx.make_db(test_bucket(), forked_database_id);
	let result = forked.get_pages_with_metadata(vec![1]).await?;

	assert_eq!(
		result.pages[0].bytes,
		Some(page_bytes(0x22)),
		"the delta above the fold must win over the older shard version"
	);
	assert!(
		result.read_stats.historical_delta_txids_decoded >= 1,
		"the walk must still read the deltas above the floor"
	);
	assert_eq!(
		result.read_stats.historical_delta_scan_floor_txid, fold_txid,
		"the shard version must be the walk's floor"
	);

	Ok(())
}

/// Provenance for a folded page on a fork attributes it to the ancestor's hot shard, not to a
/// historical delta, so the bounded walk does not change which source serves the page.
#[tokio::test]
async fn folded_page_provenance_is_the_ancestor_hot_shard() -> Result<()> {
	let ctx =
		common::build_test_db("depot-delta-history-provenance", common::TierMode::Disabled).await?;
	let udb = ctx.udb.clone();
	let source = ctx.make_db(test_bucket(), TEST_DATABASE);

	source
		.commit(vec![page(1, 0x11)], DB_SIZE_PAGES, 1_000)
		.await?;
	let branch_id = read_branch_id(&udb).await?;
	let head_txid = read_head_txid(&udb, branch_id).await?;
	install_fold(&udb, branch_id, head_txid, vec![page(1, 0x11)]).await?;

	let fork_at = commit_versionstamp(&udb, branch_id, head_txid).await?;
	let forked_database_id = branch::fork_database(
		&udb,
		BucketId::from_gas_id(test_bucket()),
		TEST_DATABASE.to_string(),
		ResolvedVersionstamp {
			versionstamp: fork_at,
			restore_point: None,
		},
		BucketId::from_gas_id(test_bucket()),
	)
	.await?;

	let forked = ctx.make_db(test_bucket(), forked_database_id);
	let result = forked
		.get_pages_with_options(
			vec![1],
			depot::types::GetPagesOptions {
				collect_provenance: true,
				..Default::default()
			},
		)
		.await?;

	let provenance = result
		.provenance
		.iter()
		.find(|entry| entry.pgno == 1)
		.expect("provenance for the requested page");
	assert_eq!(provenance.winner_kind, PageSourceKind::HotShard);

	Ok(())
}

/// A shard version above the hot watermark is not a fold, so it yields no floor and the walk still
/// reads the history it would otherwise hide. This keeps a half-installed or hand-written version from
/// shadowing deltas that are the real source for a page.
#[tokio::test]
async fn shard_version_above_the_watermark_is_not_a_floor() -> Result<()> {
	let ctx =
		common::build_test_db("depot-delta-history-unfolded", common::TierMode::Disabled).await?;
	let udb = ctx.udb.clone();
	let source = ctx.make_db(test_bucket(), TEST_DATABASE);

	source
		.commit(vec![page(1, 0x11), page(2, 0x11)], DB_SIZE_PAGES, 1_000)
		.await?;
	let branch_id = read_branch_id(&udb).await?;
	let head_txid = read_head_txid(&udb, branch_id).await?;

	// A shard version covering only page 2, with the PIDX rows of both pages cleared and no
	// watermark: the state a fold would never leave behind.
	install_fold(&udb, branch_id, head_txid, vec![page(2, 0x11)]).await?;
	clear_hot_watermark(&udb, branch_id).await?;
	clear_pidx(&udb, branch_id, 1).await?;

	let fork_at = commit_versionstamp(&udb, branch_id, head_txid).await?;
	let forked_database_id = branch::fork_database(
		&udb,
		BucketId::from_gas_id(test_bucket()),
		TEST_DATABASE.to_string(),
		ResolvedVersionstamp {
			versionstamp: fork_at,
			restore_point: None,
		},
		BucketId::from_gas_id(test_bucket()),
	)
	.await?;

	let forked = ctx.make_db(test_bucket(), forked_database_id);
	let result = forked.get_pages_with_metadata(vec![1]).await?;

	assert_eq!(
		result.pages[0].bytes,
		Some(page_bytes(0x11)),
		"the page must still resolve from the delta the shard version does not contain"
	);
	assert_eq!(
		result.read_stats.historical_delta_pages_shard_superseded, 0,
		"an unfolded shard version must not supersede any page"
	);

	Ok(())
}
