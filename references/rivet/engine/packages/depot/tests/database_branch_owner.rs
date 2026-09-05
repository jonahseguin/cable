mod common;

use anyhow::Result;
use depot::{
	conveyer::branch,
	keys::{
		branch_commit_key, bucket_pointer_cur_key, database_branch_owner_key,
		database_pointer_cur_key,
	},
	types::{
		BucketBranchId, BucketId, DatabaseBranchId, DatabaseBranchOwner, DirtyPage,
		ResolvedVersionstamp, decode_bucket_pointer, decode_commit_row,
		decode_database_branch_owner, decode_database_pointer,
	},
	workflows::compaction::test_hooks,
};
use gas::prelude::Id;

use common::{make_db, read_value, test_db_arc};

const TEST_DATABASE: &str = "test-database";

fn test_bucket() -> Id {
	Id::v1(uuid::Uuid::from_u128(0x1234), 1)
}

fn target_bucket() -> Id {
	Id::v1(uuid::Uuid::from_u128(0x5678), 1)
}

fn page(pgno: u32, fill: u8) -> DirtyPage {
	DirtyPage {
		pgno,
		bytes: vec![fill; depot::keys::PAGE_SIZE as usize],
	}
}

async fn read_bucket_branch_id_for(
	db: &universaldb::Database,
	bucket_id: Id,
) -> Result<BucketBranchId> {
	let bytes = read_value(db, bucket_pointer_cur_key(BucketId::from_gas_id(bucket_id)))
		.await?
		.expect("bucket pointer should exist");

	Ok(decode_bucket_pointer(&bytes)?.current_branch)
}

async fn read_database_branch_id(
	db: &universaldb::Database,
	bucket_id: Id,
	database_id: &str,
) -> Result<DatabaseBranchId> {
	let bucket_branch = read_bucket_branch_id_for(db, bucket_id).await?;
	let bytes = read_value(db, database_pointer_cur_key(bucket_branch, database_id))
		.await?
		.expect("database pointer should exist");

	Ok(decode_database_pointer(&bytes)?.current_branch)
}

async fn read_owner(
	db: &universaldb::Database,
	branch_id: DatabaseBranchId,
) -> Result<Option<DatabaseBranchOwner>> {
	read_value(db, database_branch_owner_key(branch_id))
		.await?
		.as_deref()
		.map(decode_database_branch_owner)
		.transpose()
}

#[tokio::test]
async fn commit_writes_owner_index_for_new_branch() -> Result<()> {
	let udb = test_db_arc("depot-branch-owner-commit").await?;
	let database_db = make_db(udb.clone(), test_bucket(), TEST_DATABASE);

	database_db.commit(vec![page(1, 0x11)], 2, 1_000).await?;

	let branch_id = read_database_branch_id(&udb, test_bucket(), TEST_DATABASE).await?;
	let bucket_branch_id = read_bucket_branch_id_for(&udb, test_bucket()).await?;
	let owner = read_owner(&udb, branch_id)
		.await?
		.expect("owner index row should exist after the first commit");

	assert_eq!(owner.bucket_id, BucketId::from_gas_id(test_bucket()));
	assert_eq!(owner.bucket_branch_id, bucket_branch_id);
	assert_eq!(owner.database_id, TEST_DATABASE);

	Ok(())
}

#[tokio::test]
async fn fork_writes_owner_index_for_forked_branch() -> Result<()> {
	let udb = test_db_arc("depot-branch-owner-fork").await?;
	let source_db = make_db(udb.clone(), test_bucket(), TEST_DATABASE);
	source_db.commit(vec![page(1, 0x11)], 2, 1_000).await?;

	let source_branch_id = read_database_branch_id(&udb, test_bucket(), TEST_DATABASE).await?;
	let source_commit = decode_commit_row(
		&read_value(&udb, branch_commit_key(source_branch_id, 1))
			.await?
			.expect("source commit row should exist"),
	)?;

	// The fork target bucket needs its own pointer before a database can be forked into it.
	let target_seed = make_db(udb.clone(), target_bucket(), "target-seed");
	target_seed.commit(vec![page(1, 0xaa)], 1, 1_100).await?;

	let forked_database_id = branch::fork_database(
		&udb,
		BucketId::from_gas_id(test_bucket()),
		TEST_DATABASE.to_string(),
		ResolvedVersionstamp {
			versionstamp: source_commit.versionstamp,
			restore_point: None,
		},
		BucketId::from_gas_id(target_bucket()),
	)
	.await?;

	let target_bucket_branch = read_bucket_branch_id_for(&udb, target_bucket()).await?;
	let forked_branch_id =
		read_database_branch_id(&udb, target_bucket(), &forked_database_id).await?;
	let owner = read_owner(&udb, forked_branch_id)
		.await?
		.expect("owner index row should exist for the forked branch");

	// The forked database lives under the target bucket. Deriving this by walking the bucket branch
	// to its root instead would land on the root the fork shares with the source bucket.
	assert_eq!(owner.bucket_id, BucketId::from_gas_id(target_bucket()));
	assert_eq!(owner.bucket_branch_id, target_bucket_branch);
	assert_eq!(owner.database_id, forked_database_id);

	// The source branch keeps its own owner row, since its pointer is untouched by the fork.
	let source_owner = read_owner(&udb, source_branch_id)
		.await?
		.expect("source owner index row should still exist");
	assert_eq!(source_owner.database_id, TEST_DATABASE);

	Ok(())
}

#[tokio::test]
async fn rollback_moves_owner_index_to_the_new_branch() -> Result<()> {
	let udb = test_db_arc("depot-branch-owner-rollback").await?;
	let database_db = make_db(udb.clone(), test_bucket(), TEST_DATABASE);
	database_db.commit(vec![page(1, 0x11)], 2, 1_000).await?;
	database_db.commit(vec![page(1, 0x22)], 2, 2_000).await?;

	let old_branch_id = read_database_branch_id(&udb, test_bucket(), TEST_DATABASE).await?;
	let first_commit = decode_commit_row(
		&read_value(&udb, branch_commit_key(old_branch_id, 1))
			.await?
			.expect("first commit row should exist"),
	)?;

	let rolled_branch_id = branch::rollback_database(
		&udb,
		BucketId::from_gas_id(test_bucket()),
		TEST_DATABASE.to_string(),
		ResolvedVersionstamp {
			versionstamp: first_commit.versionstamp,
			restore_point: None,
		},
	)
	.await?;

	let bucket_branch_id = read_bucket_branch_id_for(&udb, test_bucket()).await?;
	let owner = read_owner(&udb, rolled_branch_id)
		.await?
		.expect("owner index row should exist for the rolled branch");
	assert_eq!(owner.bucket_id, BucketId::from_gas_id(test_bucket()));
	assert_eq!(owner.bucket_branch_id, bucket_branch_id);
	assert_eq!(owner.database_id, TEST_DATABASE);

	// The superseded branch is frozen and no longer named by any pointer, so reporting it as an
	// owner would hand compaction a stale scope.
	assert!(
		read_owner(&udb, old_branch_id).await?.is_none(),
		"superseded branch should not keep an owner index row"
	);

	Ok(())
}

/// Number of extra databases seeded so the `DBPTR` partition is large enough that scanning it is
/// clearly distinguishable from a point read. Production has millions; a few dozen is enough to make
/// the difference unambiguous without making the test slow.
const DBPTR_FILLER_DATABASES: usize = 40;

/// Seeds unrelated databases so the `DBPTR` partition holds far more than the branch under test.
async fn fill_database_pointers(udb: &std::sync::Arc<universaldb::Database>) -> Result<()> {
	for i in 0..DBPTR_FILLER_DATABASES {
		let filler = make_db(udb.clone(), test_bucket(), format!("filler-{i}"));
		filler.commit(vec![page(1, 0x33)], 2, 1_000).await?;
	}

	Ok(())
}

/// Resolves a branch's policy scope and reports what the transaction read doing it.
async fn resolve_and_measure(
	udb: &universaldb::Database,
	branch_id: DatabaseBranchId,
) -> Result<(Option<(BucketId, String)>, u64)> {
	udb.txn("test_resolve_policy_scope", move |tx| async move {
		let before = tx.read_bytes();
		let scope = test_hooks::policy_scope::resolve_for_branch(&tx, branch_id).await?;

		Ok((scope, tx.read_bytes().saturating_sub(before)))
	})
	.await
}

/// A branch with no owner row resolves to the default, reading only its own key.
///
/// Supersession clears the owner row and branches predating the index never had one, so a miss is
/// ordinary rather than exceptional. Resolving it must stay a point read: the only way to derive the
/// scope without the row is to scan the DBPTR partition for the pointer that names the branch, which
/// is unbounded in cluster size. Assert the cost, not just the answer, because returning `None` was
/// always correct here and only the price of it was wrong.
#[tokio::test]
async fn missing_owner_row_resolves_to_default_without_scanning() -> Result<()> {
	let udb = test_db_arc("depot-policy-scope-missing-owner").await?;
	let database_db = make_db(udb.clone(), test_bucket(), TEST_DATABASE);
	database_db.commit(vec![page(1, 0x11)], 2, 1_000).await?;
	database_db.commit(vec![page(1, 0x22)], 2, 2_000).await?;
	fill_database_pointers(&udb).await?;

	let frozen_branch_id = read_database_branch_id(&udb, test_bucket(), TEST_DATABASE).await?;
	let first_commit = decode_commit_row(
		&read_value(&udb, branch_commit_key(frozen_branch_id, 1))
			.await?
			.expect("first commit row should exist"),
	)?;

	// Rolling back supersedes the current branch, which clears its owner row.
	let live_branch_id = branch::rollback_database(
		&udb,
		BucketId::from_gas_id(test_bucket()),
		TEST_DATABASE.to_string(),
		ResolvedVersionstamp {
			versionstamp: first_commit.versionstamp,
			restore_point: None,
		},
	)
	.await?;
	assert!(
		read_owner(&udb, frozen_branch_id).await?.is_none(),
		"supersession should have cleared the superseded branch's owner row"
	);

	let (missing_scope, missing_read_bytes) = resolve_and_measure(&udb, frozen_branch_id).await?;
	assert_eq!(
		missing_scope, None,
		"a branch with no owner row has no scope, so both policy callers take their default"
	);
	assert!(
		read_owner(&udb, frozen_branch_id).await?.is_none(),
		"resolving must not derive and memoize a scope; the miss is the answer"
	);

	// The branch that kept its owner row answers from the same single point read, so the two costs
	// must stay in the same order. A derivation would make the miss scale with the DBPTR partition
	// while the hit stayed flat.
	let (live_scope, live_read_bytes) = resolve_and_measure(&udb, live_branch_id).await?;
	assert!(
		live_scope.is_some(),
		"the current branch should resolve to its owning database"
	);
	assert!(
		missing_read_bytes <= live_read_bytes.saturating_mul(4),
		"resolving a branch with no owner row read {missing_read_bytes} bytes against \
		 {live_read_bytes} for one that has it, so the miss is deriving the scope instead of \
		 answering from the point read",
	);

	Ok(())
}
