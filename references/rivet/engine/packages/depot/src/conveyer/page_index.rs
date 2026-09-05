//! In-memory page index support for delta lookups.
//!
//! The index is a per-connection performance cache populated lazily as pages are
//! requested. Each entry records what is known about a page's PIDX owner at the
//! cached head: `Owner(txid)` for a page with a live PIDX row, or `NoOwner` for a
//! page proven to have no PIDX owner (so reads fall through to SHARD without
//! re-reading the store). A page absent from the index is simply unknown and must
//! be point-read.

use scc::HashMap;

/// What the cache knows about a page's PIDX owner at the cached head.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PageOwner {
	/// The page is owned by this txid's delta.
	Owner(u64),
	/// The page has no PIDX owner and resolves through SHARD/cold fallback.
	NoOwner,
}

#[derive(Debug, Default)]
pub struct DeltaPageIndex {
	// `Some(txid)` is a positive owner; `None` is a proven-absent owner. A missing
	// key is unknown and forces a point read.
	entries: HashMap<u32, Option<u64>>,
}

impl DeltaPageIndex {
	pub fn new() -> Self {
		Self {
			entries: HashMap::default(),
		}
	}

	pub fn get(&self, pgno: u32) -> Option<PageOwner> {
		self.entries.read_sync(&pgno, |_, owner| match owner {
			Some(txid) => PageOwner::Owner(*txid),
			None => PageOwner::NoOwner,
		})
	}

	pub fn insert_owner(&self, pgno: u32, txid: u64) {
		let _ = self.entries.upsert_sync(pgno, Some(txid));
	}

	pub fn insert_absent(&self, pgno: u32) {
		let _ = self.entries.upsert_sync(pgno, None);
	}

	pub fn remove(&self, pgno: u32) {
		self.entries.remove_sync(&pgno);
	}

	pub fn clear(&self) {
		self.entries.clear_sync();
	}

	pub fn is_empty(&self) -> bool {
		self.entries.is_empty()
	}

	/// Positive owners currently cached, sorted by page number. Used by debug
	/// accessors; absent-owner entries are not included.
	pub fn known_owners(&self) -> Vec<(u32, u64)> {
		let mut owners = Vec::new();
		self.entries.iter_sync(|pgno, owner| {
			if let Some(txid) = owner {
				owners.push((*pgno, *txid));
			}
			true
		});
		owners.sort_unstable_by_key(|(pgno, _)| *pgno);
		owners
	}
}
