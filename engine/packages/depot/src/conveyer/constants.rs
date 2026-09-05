use std::time::Duration;

/// Spec section 8 caps database branch ancestry so fork, read, and restore_point walks stay bounded.
pub const MAX_FORK_DEPTH: u8 = 16;

/// Spec section 8.1 caps bucket branch ancestry so bucket resolution stays bounded.
pub const MAX_BUCKET_DEPTH: u8 = 16;

/// Spec section 9 caps restore_points per bucket to bound pin recomputation work.
pub const MAX_RESTORE_POINTS_PER_BUCKET: u32 = 1024;

/// Spec section 12.1 keeps hot commit and VTX history for recent restore point resolution.
pub const HOT_RETENTION_FLOOR_MS: i64 = 7 * 24 * 60 * 60 * 1000;

/// Spec section 12.3 buckets access touches to bound eviction-index churn to about one write per minute.
pub const ACCESS_TOUCH_THROTTLE_MS: i64 = 60_000;

/// Spec section 12.2 burst mode doubles the hot quota while the cold tier is degraded.
pub const HOT_BURST_MULTIPLIER: i64 = 2;

/// Spec section 12.2 derives burst mode from cold-drain lag, matching the cold trigger window.
pub const HOT_BURST_COLD_LAG_THRESHOLD_TXIDS: u64 = 2048;

/// Granularity the hot drain head is snapped to, measured in txids past the hot watermark.
///
/// Every slice boundary is already a pure function of the watermark, the commit and delta rows in
/// range, and the drain head: commit selection breaks where a constant `CompactionBatchBudget::fdb()`
/// runs out, and the rows it measures sit above the watermark where reclaim cannot touch them. The
/// drain head is the one input that tracks something mutable, the live head, so it is the only reason
/// two drains from the same watermark can pick different boundaries.
///
/// That matters because a shard image is keyed `(shard_id, as_of_txid)` with no job identity. When a
/// job is abandoned and its successor picks the same boundaries, the successor rewrites the same keys
/// and the abandoned images are simply overwritten. When a boundary shifts, the abandoned image sits
/// at a txid no later fold ever revisits, and nothing reclaims it: the dead-shard sweep only
/// considers txids present in `CMP/fold`, and an abandoned job never wrote one.
///
/// Snapping the head to a multiple of this keeps the whole boundary sequence reproducible across
/// drains, so abandonment self-heals by overwrite instead of leaking. The cost is that up to
/// `HOT_DRAIN_HEAD_GRAIN_TXIDS - 1` txids at the head stay unfolded until enough commits accumulate to
/// cross the next multiple.
pub const HOT_DRAIN_HEAD_GRAIN_TXIDS: u64 = 16;

/// Activity timeout for the bulk hot install and cold publish activities. They loop one bounded
/// FDB transaction per chunk or fold and return a resume cursor once
/// `CMP_BULK_ACTIVITY_EARLY_TIMEOUT` elapses, so this hard timeout only has to cover the early
/// bound plus one in-flight chunk transaction (itself capped by FDB's five second window, with
/// room for internal retries), not the whole drain window. A timeout retry resumes from the
/// durable cursor in the activity input, so at most one activity's worth of idempotent chunk work
/// is re-run.
pub const CMP_BULK_ACTIVITY_TIMEOUT_SECS: u64 = 120;

/// Early elapsed bound for the bulk hot install and cold publish chunk loops, mirroring the
/// pegboard `EARLY_TXN_TIMEOUT` pattern at the activity level. After a committed chunk crosses
/// this bound the activity returns a resume cursor instead of racing the hard
/// `CMP_BULK_ACTIVITY_TIMEOUT_SECS`; the manager immediately re-dispatches a fresh activity from
/// the cursor. Slow FDB transactions therefore shrink how many chunks each activity runs instead
/// of pushing the loop into a timeout that would discard the run's progress. Sized to
/// `CMP_ACTIVITY_TARGET_MS`, the wall time compaction activities aim for.
pub const CMP_BULK_ACTIVITY_EARLY_TIMEOUT: Duration = Duration::from_secs(30);

/// Elapsed bound on the reclaim delete's re-derive scan, mirroring the pegboard `EARLY_TXN_TIMEOUT`
/// pattern inside the transaction. The delete side rebuilds its candidate set under `Serializable`
/// before it clears anything, so an attempt that cannot finish that scan commits nothing. Without a
/// bound the pass's only exit is the activity timeout dropping the future, which discards every
/// attempt while their reads still landed on FDB. Crossing this bound instead stops the scan and
/// returns `has_more` so the companion re-dispatches.
///
/// Measured against a clock started before the transaction, so it bounds the whole run rather than
/// one attempt: the retry loop inside `Database::txn` is exactly what this has to terminate, and a
/// per-attempt bound would let a conflicting pass spin through short attempts until the activity
/// timeout dropped it. The early-break path writes nothing, and FDB commits a read-only transaction
/// without consulting the resolver, so it cannot itself conflict.
///
/// Sized well under the activity timeout so the pass still has room to commit and to charge what it
/// read, and above the sub-second wall time a healthy pass takes so ordinary work is not truncated.
pub const CMP_RECLAIM_EARLY_TXN_TIMEOUT: Duration = Duration::from_secs(5);

/// Workflow compaction install and reclaim activities cap each FDB transaction by key count.
pub const CMP_FDB_BATCH_MAX_KEYS: usize = 500;

/// Workflow compaction install and reclaim activities cap each FDB transaction by value bytes.
pub const CMP_FDB_BATCH_MAX_VALUE_BYTES: usize = 2 * 1024 * 1024;

/// Staged shard bytes one hot stage transaction may write before it stops and returns a resume
/// cursor. Hot staging folds whole shard images, so its write volume is not bounded by the input read
/// budget: one dirtied page in a shard rewrites that shard's full image (`SHARD_SIZE * PAGE_SIZE`),
/// and every coverage txid in the slice gets its own image set. A slice scattered across many shards
/// therefore writes far more than it reads and can exceed FDB's 10 MB transaction limit. Staging stops
/// at this cap and resumes from a `(as_of_txid, shard_id)` cursor instead. The cap is checked before
/// each image, so a transaction overshoots by at most one shard image and always makes progress.
pub const CMP_STAGE_MAX_WRITE_BYTES: u64 = 4 * 1024 * 1024;

/// Copied shard bytes one hot install transaction may write before it stops and resumes from a
/// `(shard_id, as_of_txid)` cursor. The install copies each staged image into the live SHARD tier
/// byte for byte, so a chunk's write volume equals the slice's staged bytes and is unbounded for the
/// same reason `CMP_STAGE_MAX_WRITE_BYTES` exists. Staging spreads an oversized slice over many
/// transactions, so without this cap the install is handed a slice it cannot copy in one.
pub const CMP_INSTALL_MAX_WRITE_BYTES: u64 = 4 * 1024 * 1024;

/// Ceiling for admitting a single oversized txid into an otherwise empty reclaim commit window. A
/// commit whose own delta exceeds `CMP_FDB_BATCH_MAX_VALUE_BYTES` can never fit the normal budget, so
/// the windowed commit scan would stall on it forever. Admitting it alone keeps the sweep advancing
/// while staying well under FDB's 10 MB transaction limit. A commit larger than this is skipped by the
/// sweep and logged instead.
pub const CMP_FDB_OVERSIZED_TXID_MAX_VALUE_BYTES: usize = 8 * 1024 * 1024;

/// Staged hot shard refs enumerated per staging-cleanup transaction. Enumeration and the clears it
/// drives share one batch budget, so this stays well under `CMP_FDB_BATCH_MAX_KEYS` to leave the
/// transaction room to actually clear the shard images the refs point at.
pub const CMP_STAGE_CLEANUP_REF_PAGE_KEYS: usize = 64;

/// Job ids the manager holds per lane while waiting for a free reclaim slot to dispatch their
/// staging cleanup. The queue drains as one merged cleanup job, so filling it takes a reclaimer that
/// stays busy across this many job completions in a row. Ids past the cap are refused and logged;
/// the manager's `CMP/stage/` orphan scan rediscovers them later, so the cap costs a delay rather
/// than the staging area itself.
pub const CMP_MAX_PENDING_CLEANUP_JOB_IDS: usize = 64;

/// Job-id subspaces the manager refresh reports per `CMP/stage/` orphan scan. The scan reads one
/// small row per subspace, and each reported id becomes cleanup input, so a low cap keeps both the
/// refresh read and the cleanup job it feeds bounded while still draining a backlog over successive
/// refreshes.
pub const CMP_STAGE_ORPHAN_SCAN_MAX_JOBS: usize = 4;

/// How long an in-progress staged commit may sit untouched before the orphan sweep will clear it.
///
/// The primary cleaner is the next `StageBegin`, which reuses the abandoned txid and clears it
/// inline, so this only governs the backstop for a branch whose actor never comes back. The window
/// has to comfortably exceed the time a legitimate large commit spends staging its segments, since
/// clearing a live stage would destroy a commit that is still being written.
pub const COMMIT_STAGE_ORPHAN_GRACE_MS: i64 = 15 * 60 * 1000;

/// Staged commits the manager refresh reports per orphan scan. A branch has at most one live staged
/// commit (staging never moves head, so every attempt reuses the same txid), making a backlog here
/// possible only across a fork or a bug; a low cap keeps the refresh read bounded either way.
pub const COMMIT_STAGE_ORPHAN_SCAN_MAX_TXIDS: usize = 4;

/// Shards one delta segment may span.
///
/// A commit stores its pages as one self-contained LTX blob per shard-aligned page range. Alignment
/// is the load-bearing part: compaction folds a segment into a shard image, so a shard whose pages
/// were split across two segments could be folded from one of them and written as an image missing
/// the other's newer pages. Cutting only on `SHARD_SIZE` boundaries makes any prefix of a commit's
/// segments foldable into complete, final images.
///
/// Five shards is 320 pages, matching `MAX_SINGLE_SHOT_COMMIT_DIRTY_PAGES`, so a segment is by
/// construction always small enough to be admitted to a compaction batch on its own. That is what
/// lets a within-commit compaction cursor guarantee forward progress no matter how large the commit.
/// Re-exported from `depot_client_types` so the client and the engine cut and validate staged commit
/// segments against one definition.
pub use depot_client_types::COMMIT_SEGMENT_MAX_SHARDS;

/// Total dirty pages one commit may carry, however it was delivered.
///
/// The binding constraint is the finalize transaction, which is the only place a commit's whole page
/// set is touched at once. A staged commit's page bytes are already written by the time finalize
/// runs, so what finalize actually writes is one PIDX row per page, plus head, the commit row, VTX,
/// quota, and truncate cleanup.
///
/// Dirty pages one commit may carry, staged or not.
///
/// Defined in `depot-client-types` so the client can refuse an oversized commit before staging any
/// of it, and re-exported here because the engine is still the side that enforces it: an old client
/// is not bound by whatever value the shared crate holds today.
///
/// The cap does not disappear now that commits are segmented, it changes character. It used to be a
/// compaction artifact; it is now a real FDB bound, and it has to stay enforced so an oversized
/// commit fails cleanly instead of failing its transaction with a non-retryable
/// `transaction_too_large` on every retry.
pub use depot_client_types::MAX_COMMIT_DIRTY_PAGES;
pub const MAX_COMMIT_RAW_DIRTY_BYTES: usize =
	MAX_COMMIT_DIRTY_PAGES * crate::conveyer::keys::PAGE_SIZE as usize;

/// Dirty pages one unstaged commit may carry.
///
/// Much smaller than `MAX_COMMIT_DIRTY_PAGES` because it answers a different question. A single-shot
/// commit writes its page bytes and its PIDX rows in the same transaction, so its whole payload is
/// charged against FDB's 10 MB limit rather than just its page index. It also has to fit one
/// compaction batch on its own, since an unstaged commit is one delta with no segment boundaries for
/// a within-commit cursor to resume from.
///
/// Enforced engine-side rather than assumed from the client: an envoy is untrusted, and a
/// single-shot commit past this bound would fail its FDB transaction non-retryably instead of
/// returning `commit_too_large`.
pub const MAX_SINGLE_SHOT_COMMIT_DIRTY_PAGES: usize = 320;
pub const MAX_SINGLE_SHOT_COMMIT_RAW_DIRTY_BYTES: usize =
	MAX_SINGLE_SHOT_COMMIT_DIRTY_PAGES * crate::conveyer::keys::PAGE_SIZE as usize;

/// Workflow compaction uploads a complete shard set for one hot-fold boundary per cold pass. A
/// boundary can touch multiple shards, so this caps the object count high enough that
/// `CMP_S3_UPLOAD_LIMIT_BYTES` is the binding limit. `64 MiB / (SHARD_SIZE * PAGE_SIZE)` worth of
/// max-size shards fit under the byte budget, so 256 objects covers any boundary within it.
pub const CMP_S3_UPLOAD_MAX_OBJECTS: usize = 256;

/// Workflow compaction caps cold shard upload activity payloads.
pub const CMP_S3_UPLOAD_LIMIT_BYTES: usize = 64 * 1024 * 1024;

/// Workflow compaction caps S3 delete activity batches.
pub const CMP_S3_DELETE_MAX_OBJECTS: usize = 100;

/// Workflow compaction waits this long after unpublishing a cold object before deleting it.
pub const CMP_COLD_OBJECT_DELETE_GRACE_MS: i64 = 500;

/// DB manager schedules its next cold compaction check this far in the future after arming.
pub const MANAGER_COLD_COMPACTION_INTERVAL_MS: i64 = 2 * 60 * 1000;

/// How long a throttled install or reclaim activity backs off before its workflow re-dispatches.
/// Shorter than one window on purpose: the admit probability is nonzero whenever the estimate is under
/// budget, so a mid-window retry has a real chance of passing rather than waiting for the whole window
/// to roll. Slower quota recovery is fine here since compaction is background work.
///
/// Staging does not use this. It backs off for `sqlite.compaction_stage_throttle_backoff_ms` instead,
/// which is deliberately much longer: staging is the lane the other two are being prioritized over, so
/// its retries are exactly the pressure that has to be removed rather than merely lost.
pub const THROTTLE_BACKOFF_MS: i64 = 2500;

/// How long a compaction drain parks when its branch falls outside the admission percent.
///
/// Must stay above the worker poll interval. A `ctx.sleep` shorter than that interval sleeps in
/// memory and holds the workflow's lease, which would keep a de-admitted branch resident on a worker
/// and counting against the per-name concurrency quota. Above it, gasoline parks the workflow in the
/// database instead: the lease is released, the worker slot is freed, and the drain resumes from its
/// durable cursor once the percent is raised again.
pub const ADMISSION_PARK_MS: i64 = 60_000;

/// First delay the DB manager waits before re-dispatching a reclaim job whose input was just
/// rejected.
///
/// A rejection is deterministic for as long as the state that produced it holds, so re-planning the
/// same input reproduces it. The delay doubles on each consecutive rejection of the same input.
pub const MANAGER_RECLAIM_REJECTION_BACKOFF_BASE_MS: i64 = 1000;

/// Ceiling on the reclaim rejection backoff, matching the default `sqlite.manager_reclaim_interval_ms`
/// so a backed-off branch still reclaims at its ordinary fallback cadence once the input changes.
pub const MANAGER_RECLAIM_REJECTION_BACKOFF_MAX_MS: i64 = 10 * 60 * 1000;
