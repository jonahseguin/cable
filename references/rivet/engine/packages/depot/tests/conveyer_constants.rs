use depot::{
	ACCESS_TOUCH_THROTTLE_MS, CMP_BULK_ACTIVITY_EARLY_TIMEOUT, CMP_BULK_ACTIVITY_TIMEOUT_SECS,
	CMP_FDB_BATCH_MAX_KEYS, CMP_FDB_BATCH_MAX_VALUE_BYTES, CMP_S3_DELETE_MAX_OBJECTS,
	CMP_S3_UPLOAD_LIMIT_BYTES, CMP_S3_UPLOAD_MAX_OBJECTS, HOT_BURST_COLD_LAG_THRESHOLD_TXIDS,
	HOT_BURST_MULTIPLIER, HOT_RETENTION_FLOOR_MS, MAX_BUCKET_DEPTH, MAX_FORK_DEPTH,
	MAX_RESTORE_POINTS_PER_BUCKET,
};

#[test]
fn pitr_constants_match_spec_defaults() {
	assert_eq!(MAX_FORK_DEPTH, 16);
	assert_eq!(MAX_BUCKET_DEPTH, 16);
	assert_eq!(MAX_RESTORE_POINTS_PER_BUCKET, 1024);
	assert_eq!(HOT_RETENTION_FLOOR_MS, 7 * 24 * 60 * 60 * 1000);
	assert_eq!(ACCESS_TOUCH_THROTTLE_MS, 60_000);
	assert_eq!(HOT_BURST_MULTIPLIER, 2);
	assert_eq!(HOT_BURST_COLD_LAG_THRESHOLD_TXIDS, 2048);
	assert_eq!(CMP_FDB_BATCH_MAX_KEYS, 500);
	assert_eq!(CMP_FDB_BATCH_MAX_VALUE_BYTES, 2 * 1024 * 1024);
	assert_eq!(CMP_S3_UPLOAD_MAX_OBJECTS, 256);
	assert_eq!(CMP_S3_UPLOAD_LIMIT_BYTES, 64 * 1024 * 1024);
	assert_eq!(CMP_S3_DELETE_MAX_OBJECTS, 100);
}

// The drain-span windows have no spec-mandated values; what matters is how they relate to the
// other compaction limits, so assert the relationships instead of pinning the numbers.
#[test]
fn drain_span_windows_relate_to_compaction_limits() {
	// The hot span is `sqlite.compaction_max_hot_drain_span_txids`, so its relationship to the
	// trigger lag is asserted against the config default rather than a constant here. A window
	// smaller than the lag that triggers a job would re-plan degenerate jobs every cycle; the
	// config rejects that at load and on every dynamic update.
	let hot_span = rivet_config::config::Sqlite::default().compaction_max_hot_drain_span_txids();
	assert!(hot_span >= depot::quota::COMPACTION_DELTA_THRESHOLD);
	// The bulk install and publish activities return a resume cursor once the early bound elapses,
	// so the hard timeout only has to cover the early bound plus one in-flight chunk transaction
	// (itself capped by FDB's five second window, with room for internal retries). Requiring a
	// minute of headroom keeps the early return, not the hard timeout, the mechanism that ends an
	// activity call.
	assert!(CMP_BULK_ACTIVITY_EARLY_TIMEOUT.as_secs() + 60 <= CMP_BULK_ACTIVITY_TIMEOUT_SECS);
}
