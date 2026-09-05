use anyhow::Result;
use gas::prelude::*;

use crate::common;

#[tokio::test]
#[ignore = "ACT-6414: reverse-u32 version ordering is tracked separately"]
async fn allocation_prefers_newer_u32_version_across_i32_boundary() -> Result<()> {
	let test_deps = common::setup_deps().await?;
	let namespace_id = Id::new_v1(test_deps.config().dc_label());
	let pool_name = common::unique_pool_name("envoy-version-ordering");

	// Both versions were observed for the affected namespace. This constructs the
	// hypothesized stale-index state; the production logs do not prove that the old
	// entry persisted. The older version is below i32::MAX, while the newer version
	// has its high bit set.
	let older_version = 2_142_174_967;
	let newer_version = 2_592_381_191;
	assert!(older_version < newer_version);
	assert!(older_version <= i32::MAX as u32);
	assert!(newer_version > i32::MAX as u32);

	common::write_hash_envoy_with_version(
		&test_deps,
		namespace_id,
		&pool_name,
		"stale-old-envoy",
		older_version,
		common::stale_ping_ts(),
		Vec::new(),
		None,
	)
	.await?;
	common::write_hash_envoy_with_version(
		&test_deps,
		namespace_id,
		&pool_name,
		"healthy-new-envoy",
		newer_version,
		common::fresh_ping_ts(),
		vec![common::hash_pos(0x20)],
		Some(0),
	)
	.await?;

	let (allocation, read_stats) = common::allocate_hash(
		&test_deps,
		namespace_id,
		&pool_name,
		1,
		8,
		vec![common::hash_pos(0x10)],
		0,
	)
	.await?;

	assert_eq!(allocation.as_deref(), Some("healthy-new-envoy"));
	assert_eq!(read_stats.last_ping_ts_reads, 1);

	Ok(())
}
