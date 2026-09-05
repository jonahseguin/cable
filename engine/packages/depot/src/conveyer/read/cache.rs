use std::time::{SystemTime, UNIX_EPOCH};

#[cfg(feature = "pidx-cache")]
use std::collections::{BTreeMap, BTreeSet};

use anyhow::{Context, Result};

#[cfg(feature = "pidx-cache")]
use crate::conveyer::page_index::{DeltaPageIndex, PageOwner};
use crate::conveyer::types::DatabaseBranchId;

use super::plan::{ReadSource, StorageScope};

/// Known PIDX owner state for the requested pages, taken from the lazy per-page
/// cache. Only pages the cache has resolved (owner or proven-absent) appear in the
/// map; a page missing from the map is unknown and must be point-read. An empty
/// map means the cache holds nothing about the requested pages, which is handled
/// the same as a cold cache.
#[cfg(feature = "pidx-cache")]
pub(super) fn snapshot_pidx_cache(
	cache: &DeltaPageIndex,
	pgnos: &[u32],
) -> BTreeMap<u32, PageOwner> {
	let mut known = BTreeMap::new();
	for pgno in pgnos {
		if let Some(owner) = cache.get(*pgno) {
			known.insert(*pgno, owner);
		}
	}
	known
}

pub(super) fn cache_source_for_scope(scope: &StorageScope) -> Option<ReadSource> {
	match scope {
		StorageScope::Branch(plan) if plan.sources.len() == 1 => Some(plan.sources[0]),
		StorageScope::Branch(_) => None,
	}
}

/// Insert lazily point-read PIDX results into the cache. Each entry is either a
/// positive owner (`Some(txid)`) or a proven-absent owner (`None`); a page that
/// later turned out stale (needs SHARD fallback) is skipped so it is re-resolved
/// next time.
#[cfg(feature = "pidx-cache")]
pub(super) fn store_loaded_pidx_rows(
	cache: &DeltaPageIndex,
	loaded_pidx_rows: Vec<(u32, Option<u64>)>,
	stale_pidx_pgnos: &BTreeSet<u32>,
) {
	for (pgno, txid) in loaded_pidx_rows {
		if stale_pidx_pgnos.contains(&pgno) {
			continue;
		}
		match txid {
			Some(txid) => cache.insert_owner(pgno, txid),
			None => cache.insert_absent(pgno),
		}
	}
}

#[cfg(feature = "pidx-cache")]
pub(super) fn clear_stale_pidx_rows(cache: &DeltaPageIndex, stale_pidx_pgnos: BTreeSet<u32>) {
	for pgno in stale_pidx_pgnos {
		cache.remove(pgno);
	}
}

pub(super) fn branch_cache_changed(
	cached_branch_id: Option<DatabaseBranchId>,
	branch_id: DatabaseBranchId,
) -> bool {
	cached_branch_id.is_some_and(|cached_branch_id| cached_branch_id != branch_id)
}

pub(super) fn now_ms() -> Result<i64> {
	let duration = SystemTime::now()
		.duration_since(UNIX_EPOCH)
		.context("system time is before unix epoch")?;
	i64::try_from(duration.as_millis()).context("current time exceeded i64 milliseconds")
}
