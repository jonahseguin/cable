//! The protocol version subspace is scanned in key order to find the oldest live version, so the
//! packed keys have to sort by version and round trip through the tuple layer.

use rivet_config::RuntimeProtocolKind;
use universaldb::{prelude::*, utils::Subspace};

use super::{EngineVersionKey, ProtocolVersionKey};

fn pack(kind: RuntimeProtocolKind, version: u16) -> Vec<u8> {
	Subspace::all().pack(&ProtocolVersionKey::new(kind, version))
}

#[test]
fn protocol_version_keys_sort_by_version() {
	let mut packed = [7u16, 1, 300, 2, 65535]
		.into_iter()
		.map(|version| (version, pack(RuntimeProtocolKind::Envoy, version)))
		.collect::<Vec<_>>();
	packed.sort_by(|(_, a), (_, b)| a.cmp(b));

	assert_eq!(
		vec![1, 2, 7, 300, 65535],
		packed
			.into_iter()
			.map(|(version, _)| version)
			.collect::<Vec<_>>(),
		"an ascending scan of the subspace must yield the oldest version first",
	);
}

/// The scan bounds a sync pass reads for `kind`.
fn subspace_range(kind: RuntimeProtocolKind) -> (Vec<u8>, Vec<u8>) {
	Subspace::all()
		.subspace(&ProtocolVersionKey::subspace(kind))
		.range()
}

fn in_range(range: &(Vec<u8>, Vec<u8>), key: &[u8]) -> bool {
	let (begin, end) = range;

	key >= begin.as_slice() && key < end.as_slice()
}

#[test]
fn protocol_version_keys_are_namespaced_per_kind() {
	let envoy = subspace_range(RuntimeProtocolKind::Envoy);
	let ups = subspace_range(RuntimeProtocolKind::Ups);

	assert!(in_range(&envoy, &pack(RuntimeProtocolKind::Envoy, 3)));
	assert!(!in_range(&envoy, &pack(RuntimeProtocolKind::Ups, 3)));
	assert!(in_range(&ups, &pack(RuntimeProtocolKind::Ups, 3)));
	assert!(!in_range(&ups, &pack(RuntimeProtocolKind::Envoy, 3)));
}

#[test]
fn engine_version_key_is_outside_the_protocol_subspaces() {
	let engine = Subspace::all().pack(&EngineVersionKey::new());

	assert!(!in_range(
		&subspace_range(RuntimeProtocolKind::Envoy),
		&engine
	));
	assert!(!in_range(
		&subspace_range(RuntimeProtocolKind::Ups),
		&engine
	));
}

#[test]
fn protocol_version_key_round_trips() {
	let subspace = Subspace::all();

	for (kind, version) in [
		(RuntimeProtocolKind::Envoy, 0u16),
		(RuntimeProtocolKind::Envoy, 7),
		(RuntimeProtocolKind::Ups, 65535),
	] {
		let packed = subspace.pack(&ProtocolVersionKey::new(kind, version));
		let unpacked = subspace
			.unpack::<ProtocolVersionKey>(&packed)
			.expect("key should unpack");

		assert_eq!(kind, unpacked.protocol_kind);
		assert_eq!(version, unpacked.version);
	}
}

#[test]
fn protocol_version_timestamp_round_trips() {
	let key = ProtocolVersionKey::new(RuntimeProtocolKind::Envoy, 7);
	let ts = 1_780_000_000_000i64;

	assert_eq!(
		ts,
		key.deserialize(&key.serialize(ts).expect("serialize"))
			.expect("deserialize"),
	);
}

#[test]
fn engine_version_key_round_trips() {
	let subspace = Subspace::all();
	let packed = subspace.pack(&EngineVersionKey::new());

	subspace
		.unpack::<EngineVersionKey>(&packed)
		.expect("key should unpack");

	let key = EngineVersionKey::new();
	let version = semver::Version::parse("25.7.1-rc.3").expect("valid semver");

	assert_eq!(
		version,
		key.deserialize(&key.serialize(version.clone()).expect("serialize"))
			.expect("deserialize"),
	);
}

#[test]
fn engine_version_key_does_not_collide_with_protocol_keys() {
	let subspace = Subspace::all();
	let engine = subspace.pack(&EngineVersionKey::new());

	assert!(
		subspace.unpack::<ProtocolVersionKey>(&engine).is_err(),
		"an engine version key must not decode as a protocol version key",
	);
}
