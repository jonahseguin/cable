use std::{any::Any, future::Future, path::Path, pin::Pin, sync::Arc};

use anyhow::{Result, bail};

use crate::{
	key_selector::KeySelector,
	options::{ConflictRangeType, MutationType, Priority},
	range_option::RangeOption,
	transaction::{RetryableTransaction, Transaction},
	utils::IsolationLevel,
	value::{Slice, Value, Values},
};

pub mod postgres;
pub mod rocksdb;

pub use postgres::PostgresDatabaseDriver;
pub use rocksdb::RocksDbDatabaseDriver;

pub type BoxFut<'a, T> = Pin<Box<dyn Future<Output = T> + Send + 'a>>;
pub type Erased = Box<dyn Any + Send>;

pub type DatabaseDriverHandle = Arc<dyn DatabaseDriver>;

pub trait DatabaseDriver: Send + Sync {
	fn create_txn(&self) -> Result<Transaction>;
	fn run<'a>(
		&'a self,
		closure: Box<dyn Fn(RetryableTransaction) -> BoxFut<'a, Result<Erased>> + Send + Sync + 'a>,
	) -> BoxFut<'a, Result<Erased>>;
	fn txn_retry_limit(&self, limit: i32) -> Result<()>;

	/// Create a consistent point-in-time snapshot of the database at the given path.
	fn checkpoint(&self, _path: &Path) -> Result<()> {
		bail!("checkpoint not supported by this database driver")
	}

	/// Gracefully release any process-wide resources before shutdown. The Postgres driver hands off
	/// its leader lease here so a standby node takes over immediately instead of waiting out the
	/// lease TTL. Default is a no-op.
	fn shutdown<'a>(&'a self) -> BoxFut<'a, ()> {
		Box::pin(async {})
	}
}

pub trait TransactionDriver: Send + Sync {
	fn atomic_op(&self, key: &[u8], param: &[u8], op_type: MutationType);

	// Read operations
	fn get<'a>(
		&'a self,
		key: &[u8],
		isolation_level: IsolationLevel,
	) -> Pin<Box<dyn Future<Output = Result<Option<Slice>>> + Send + 'a>>;
	fn get_key<'a>(
		&'a self,
		selector: &KeySelector<'a>,
		isolation_level: IsolationLevel,
	) -> Pin<Box<dyn Future<Output = Result<Slice>> + Send + 'a>>;
	fn get_range<'a>(
		&'a self,
		opt: &RangeOption<'a>,
		iteration: usize,
		isolation_level: IsolationLevel,
	) -> Pin<Box<dyn Future<Output = Result<Values>> + Send + 'a>>;
	fn get_ranges_keyvalues<'a>(
		&'a self,
		opt: RangeOption<'a>,
		isolation_level: IsolationLevel,
	) -> crate::value::Stream<'a, Value>;

	// Write operations
	fn set(&self, key: &[u8], value: &[u8]);
	fn clear(&self, key: &[u8]);
	fn clear_range(&self, begin: &[u8], end: &[u8]);

	// Transaction management
	fn commit(self: Box<Self>) -> Pin<Box<dyn Future<Output = Result<()>> + Send>>;
	fn reset(&mut self);
	fn cancel(&self);
	fn add_conflict_range(
		&self,
		begin: &[u8],
		end: &[u8],
		conflict_type: ConflictRangeType,
	) -> Result<()>;
	fn get_estimated_range_size_bytes<'a>(
		&'a self,
		begin: &'a [u8],
		end: &'a [u8],
	) -> Pin<Box<dyn Future<Output = Result<i64>> + Send + 'a>>;

	/// Bytes this transaction would carry if it committed now, measured the way the database's own
	/// transaction size limit is.
	fn approximate_size<'a>(&'a self) -> Pin<Box<dyn Future<Output = Result<i64>> + Send + 'a>>;

	fn tag(&self, _tag: &str) -> Result<()> {
		// No-op unless implemented
		Ok(())
	}

	fn priority(&self, _priority: Priority) -> Result<()> {
		// No-op unless implemented
		Ok(())
	}

	/// Caps how many times [`DatabaseDriver::run`] re-runs this transaction's closure, overriding the
	/// database-wide limit for this transaction only. A limit of `0` means the first error is
	/// returned rather than retried, matching FoundationDB's `TransactionRetryLimit`.
	///
	/// Drivers that cannot honor a per-transaction limit must return an error rather than silently
	/// accepting one: a caller setting this is bounding how long something stays unobserved, and a
	/// no-op leaves that bound off with no way to tell.
	fn retry_limit(&self, _limit: i32) -> Result<()> {
		Err(crate::error::DatabaseError::RetryLimitUnsupported.into())
	}

	// Helper for committing without consuming self (for database drivers that need it)
	fn commit_ref(&self) -> Pin<Box<dyn Future<Output = Result<()>> + Send + '_>> {
		Box::pin(async move {
			bail!("`commit_ref` unimplemented");
		})
	}
}
