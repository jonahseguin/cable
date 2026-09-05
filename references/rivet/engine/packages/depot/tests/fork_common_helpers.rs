mod fork_common;

use anyhow::Context;
use depot::error::SqliteStorageError;

#[test]
fn assert_storage_error_matches_wrapped_cause() {
	let err: anyhow::Error = Err::<(), _>(SqliteStorageError::ForkOutOfRetention)
		.context("wrapped fork failure")
		.expect_err("test should construct a wrapped error");

	fork_common::assert_storage_error(&err, SqliteStorageError::ForkOutOfRetention);
}
