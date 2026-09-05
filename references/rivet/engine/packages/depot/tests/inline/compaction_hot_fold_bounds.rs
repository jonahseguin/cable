//! Inline tests for the page bound a partially admitted commit puts on its fold, and for the split
//! between fold targets and coverage. These live inline because the compaction helpers are
//! crate-private.

use std::collections::BTreeMap;

use super::*;
use crate::conveyer::{
	ltx::{LtxHeader, decode_ltx_v3, encode_ltx_v3},
	types::DirtyPage,
};

fn page(pgno: u32, fill: u8) -> DirtyPage {
	DirtyPage {
		pgno,
		bytes: vec![fill; keys::PAGE_SIZE as usize],
	}
}

fn delta_at(txid: u64, db_size_pages: u32, pages: &[DirtyPage]) -> DecodedLtx {
	let encoded =
		encode_ltx_v3(LtxHeader::delta(txid, db_size_pages, 1_000), pages).expect("encode delta");
	decode_ltx_v3(&encoded).expect("decode delta")
}

fn input_range(
	max_txid: u64,
	coverage: Vec<u64>,
	max_pgno_exclusive: Option<u32>,
) -> HotJobInputRange {
	HotJobInputRange {
		txids: TxidRange {
			min_txid: 1,
			max_txid,
		},
		max_pgno_exclusive,
		coverage_txids: coverage,
		max_pages: 0,
		max_bytes: 0,
	}
}

/// A commit admitted only in part folds only the pages the slice reserved PIDX budget for. Folding
/// past the bound would write images whose PIDX rows this slice never clears, and a page whose owner
/// survives its fold pins its delta against reclaim permanently.
#[test]
fn a_partial_commit_folds_only_its_admitted_pages() {
	let shard = keys::SHARD_SIZE;
	let deltas = BTreeMap::from([(
		1,
		delta_at(1, shard * 4, &[page(1, 0xa1), page(shard * 2 + 1, 0xa2)]),
	)]);

	let bounded =
		collect_hot_pages_by_shard(shard * 4, &deltas, 1, Some(shard * 2)).expect("fold bounded");
	assert_eq!(
		bounded.keys().copied().collect::<Vec<_>>(),
		vec![0],
		"only the shard below the bound is folded"
	);

	let whole = collect_hot_pages_by_shard(shard * 4, &deltas, 1, None).expect("fold whole");
	assert_eq!(whole.keys().copied().collect::<Vec<_>>(), vec![0, 2]);
}

/// The bound applies only to the commit the slice cut. Deltas below it are history the image has to
/// carry in full, or the fold would write a shard image missing pages that are already folded.
#[test]
fn the_page_bound_does_not_truncate_older_deltas() {
	let shard = keys::SHARD_SIZE;
	let deltas = BTreeMap::from([
		(1, delta_at(1, shard * 4, &[page(shard * 2 + 1, 0xb1)])),
		(2, delta_at(2, shard * 4, &[page(1, 0xb2)])),
	]);

	let folded = collect_hot_pages_by_shard(shard * 4, &deltas, 2, Some(shard))
		.expect("fold bounded at txid 2");

	assert!(
		folded.contains_key(&2),
		"txid 1's page above the bound still belongs in the image"
	);
	assert!(folded.contains_key(&0), "txid 2's admitted page is folded");
}

/// Folding and coverage are different lists. A partial commit must be folded (the slice exists to do
/// that work) and must not be coverage (its delta still holds pages no image carries, and coverage is
/// what licenses reclaim to drop it).
#[test]
fn a_partial_commit_is_a_fold_target_but_not_coverage() {
	let root = CompactionRoot {
		schema_version: 1,
		manifest_generation: 1,
		hot_watermark_txid: 0,
		cold_watermark_txid: 0,
		cold_watermark_versionstamp: [0; 16],
	};

	let coverage = selected_hot_coverage_txids(&root, 5, Some(128), &[], &[]);
	assert!(
		!coverage.contains(&5),
		"a partially folded commit must never license reclaim"
	);

	let fold_txids = hot_fold_txids(&input_range(5, coverage, Some(128)));
	assert!(
		fold_txids.contains(&5),
		"a partially folded commit is still folded"
	);
}

/// A commit folded whole is both, which is the ordinary case and must not regress.
#[test]
fn a_whole_commit_is_both_a_fold_target_and_coverage() {
	let root = CompactionRoot {
		schema_version: 1,
		manifest_generation: 1,
		hot_watermark_txid: 0,
		cold_watermark_txid: 0,
		cold_watermark_versionstamp: [0; 16],
	};

	let coverage = selected_hot_coverage_txids(&root, 5, None, &[], &[]);
	assert!(coverage.contains(&5));
	assert_eq!(
		hot_fold_txids(&input_range(5, coverage.clone(), None)),
		coverage
	);
}

/// A commit whose delta has already been reclaimed still has to be admissible. It contributes no
/// pages, but it is a coverage txid, and a slice that refuses it stops the drain at a commit nothing
/// will ever make foldable. This is the shape a settled branch is full of, so refusing it wedges
/// ordinary compaction rather than an edge case.
#[test]
fn a_commit_with_no_delta_rows_yields_no_admission_units() {
	let units = hot_admission_units(
		DatabaseBranchId::from_uuid(uuid::Uuid::from_u128(0x11)),
		7,
		&[],
		None,
	)
	.expect("no rows is not an error");

	assert!(units.is_empty());
}
