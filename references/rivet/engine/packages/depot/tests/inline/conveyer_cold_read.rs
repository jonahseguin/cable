use super::ColdObjectIntegrity;
use crate::compaction::shared::content_hash;

#[test]
fn integrity_accepts_bytes_matching_the_reference() {
	let bytes = b"cold shard image".to_vec();
	let expected = ColdObjectIntegrity {
		size_bytes: Some(bytes.len() as u64),
		content_hash: Some(content_hash(&bytes)),
	};

	assert_eq!(expected.mismatch(&bytes), None);
}

#[test]
fn integrity_rejects_a_truncated_object() {
	let bytes = b"cold shard image".to_vec();
	let expected = ColdObjectIntegrity {
		size_bytes: Some(bytes.len() as u64),
		content_hash: Some(content_hash(&bytes)),
	};

	assert_eq!(
		expected.mismatch(&bytes[..4]),
		Some("size does not match the reference")
	);
}

/// The object key is derived from the content hash, so bytes of the right length that hash to
/// something else are not the object the reference named.
#[test]
fn integrity_rejects_different_bytes_of_the_same_length() {
	let bytes = b"cold shard image".to_vec();
	let expected = ColdObjectIntegrity {
		size_bytes: Some(bytes.len() as u64),
		content_hash: Some(content_hash(&bytes)),
	};

	assert_eq!(
		expected.mismatch(b"COLD SHARD IMAGE"),
		Some("content hash does not match the reference")
	);
}

/// A manifest layer records only a byte size, so size is all that can be checked there.
#[test]
fn integrity_checks_only_what_the_reference_records() {
	let bytes = b"cold shard image".to_vec();
	let size_only = ColdObjectIntegrity {
		size_bytes: Some(bytes.len() as u64),
		content_hash: None,
	};
	assert_eq!(size_only.mismatch(b"COLD SHARD IMAGE"), None);
	assert_eq!(
		size_only.mismatch(b"short"),
		Some("size does not match the reference")
	);

	assert_eq!(ColdObjectIntegrity::default().mismatch(b"anything"), None);
}
