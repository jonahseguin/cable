use depot::page_index::{DeltaPageIndex, PageOwner};

#[test]
fn insert_get_and_remove_round_trip() {
	let index = DeltaPageIndex::new();

	assert_eq!(index.get(7), None);
	assert!(index.is_empty());

	index.insert_owner(7, 11);
	index.insert_owner(9, 15);

	assert_eq!(index.get(7), Some(PageOwner::Owner(11)));
	assert_eq!(index.get(9), Some(PageOwner::Owner(15)));
	assert!(!index.is_empty());

	index.remove(7);
	assert_eq!(index.get(7), None);
	// Removing an unknown page is a no-op.
	index.remove(99);
	assert_eq!(index.get(9), Some(PageOwner::Owner(15)));
}

#[test]
fn insert_owner_overwrites_existing_txid() {
	let index = DeltaPageIndex::new();

	index.insert_owner(4, 20);
	index.insert_owner(4, 21);

	assert_eq!(index.get(4), Some(PageOwner::Owner(21)));
}

#[test]
fn absent_entry_is_distinct_from_unknown() {
	let index = DeltaPageIndex::new();

	// A page never touched is unknown.
	assert_eq!(index.get(5), None);

	// A proven-absent owner is a known entry, distinct from unknown.
	index.insert_absent(5);
	assert_eq!(index.get(5), Some(PageOwner::NoOwner));
	assert!(!index.is_empty());

	// A later commit can promote a proven-absent page to an owner.
	index.insert_owner(5, 42);
	assert_eq!(index.get(5), Some(PageOwner::Owner(42)));
}

#[test]
fn known_owners_returns_positive_owners_sorted() {
	let index = DeltaPageIndex::new();
	index.insert_owner(12, 1200);
	index.insert_owner(3, 300);
	index.insert_owner(7, 700);
	// Proven-absent owners are not reported as owners.
	index.insert_absent(9);

	assert_eq!(index.known_owners(), vec![(3, 300), (7, 700), (12, 1200)]);
}
