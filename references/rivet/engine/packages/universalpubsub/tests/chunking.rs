use anyhow::Result;
use rivet_ups_protocol::PROTOCOL_VERSION;
use universalpubsub::chunking::{
	ChunkTracker, DecodedMessage, FastPath, encode_chunk, split_payload_into_chunks,
};
use uuid::Uuid;

/// Feeds one encoded chunk through the tracker the way a subscriber does: the sync fast path
/// decodes single-chunk messages inline, and anything else goes to the async reassembly path.
async fn process_chunk(tracker: &ChunkTracker, raw: &[u8]) -> Result<Option<DecodedMessage>> {
	match tracker.try_process_chunk_fast(raw)? {
		FastPath::Decoded(message) => Ok(Some(message)),
		FastPath::Multi(message) => tracker.process_chunk_async(message).await,
	}
}

fn setup_logging() {
	let _ = tracing_subscriber::fmt()
		.with_env_filter("debug")
		.with_ansi(false)
		.with_test_writer()
		.try_init();
}

/// Encodes a payload through the full chunking pipeline and reassembles it.
///
/// Returns `(reassembled_payload, reply_subject)`.
async fn roundtrip(
	payload: &[u8],
	max_message_size: usize,
	reply_subject: Option<&str>,
	request_deadline_at: Option<i64>,
) -> (Vec<u8>, Option<String>, Option<i64>) {
	let message_id = Uuid::from_bytes([0u8; 16]);
	let chunks = split_payload_into_chunks(
		payload,
		max_message_size,
		message_id,
		reply_subject,
		request_deadline_at,
		PROTOCOL_VERSION,
	)
	.expect("split failed");
	let chunk_count = chunks.len() as u32;

	let tracker = ChunkTracker::new();
	let mut final_result = None;

	for (i, chunk_payload) in chunks.into_iter().enumerate() {
		let encoded = encode_chunk(
			chunk_payload,
			i as u32,
			chunk_count,
			message_id,
			reply_subject.map(|s| s.into()),
			request_deadline_at,
			PROTOCOL_VERSION,
		)
		.expect("encode failed");

		let result = process_chunk(&tracker, &encoded)
			.await
			.expect("process_chunk failed");

		if i < (chunk_count as usize - 1) {
			assert!(
				result.is_none(),
				"expected None for intermediate chunk {}",
				i
			);
		} else {
			assert!(result.is_some(), "expected Some for final chunk");
			final_result = result;
		}
	}

	let final_result = final_result.unwrap();
	(
		final_result.payload,
		final_result.reply_subject,
		final_result.request_deadline_at,
	)
}

#[tokio::test]
async fn test_single_chunk_small_payload() {
	setup_logging();

	let payload = b"hello world";
	let (reassembled, reply, deadline) = roundtrip(payload, 1024, None, None).await;
	assert_eq!(reassembled, payload);
	assert_eq!(reply, None);
	assert_eq!(deadline, None);
}

#[tokio::test]
async fn test_multi_chunk_roundtrip() {
	setup_logging();

	let payload: Vec<u8> = (0..10000_usize).map(|i| (i % 256) as u8).collect();
	let (reassembled, reply, deadline) = roundtrip(&payload, 512, None, None).await;
	assert_eq!(reassembled, payload);
	assert_eq!(reply, None);
	assert_eq!(deadline, None);
}

#[tokio::test]
async fn test_empty_payload() {
	setup_logging();

	let payload = b"";
	let (reassembled, reply, deadline) = roundtrip(payload, 512, None, None).await;
	assert_eq!(reassembled, payload);
	assert_eq!(reply, None);
	assert_eq!(deadline, None);
}

#[tokio::test]
async fn test_reply_subject_preserved_single_chunk() {
	setup_logging();

	let payload = b"hello";
	let (reassembled, reply, deadline) = roundtrip(payload, 1024, Some("_INBOX.abc"), None).await;
	assert_eq!(reassembled, payload);
	assert_eq!(reply, Some("_INBOX.abc".to_string()));
	assert_eq!(deadline, None);
}

#[tokio::test]
async fn test_reply_subject_preserved_multi_chunk() {
	setup_logging();

	let payload: Vec<u8> = (0..5000_usize).map(|i| (i % 256) as u8).collect();
	let (reassembled, reply, deadline) = roundtrip(&payload, 512, Some("_INBOX.xyz"), None).await;
	assert_eq!(reassembled, payload);
	assert_eq!(reply, Some("_INBOX.xyz".to_string()));
	assert_eq!(deadline, None);
}

#[tokio::test]
async fn test_request_deadline_preserved_multi_chunk() {
	setup_logging();

	let payload: Vec<u8> = (0..5000_usize).map(|i| (i % 256) as u8).collect();
	let deadline = Some(1_800_000_000_000);
	let (reassembled, reply, reassembled_deadline) =
		roundtrip(&payload, 512, Some("_INBOX.deadline"), deadline).await;
	assert_eq!(reassembled, payload);
	assert_eq!(reply, Some("_INBOX.deadline".to_string()));
	assert_eq!(reassembled_deadline, deadline);
}

/// Verifies that every encoded chunk fits within the declared max_message_size.
#[test]
fn test_encoded_chunks_fit_within_limit() {
	setup_logging();

	let max_message_size = 512;
	let payload: Vec<u8> = (0..5000_usize).map(|i| (i % 256) as u8).collect();
	let message_id = Uuid::from_bytes([1u8; 16]);

	let chunks = split_payload_into_chunks(
		&payload,
		max_message_size,
		message_id,
		None,
		None,
		PROTOCOL_VERSION,
	)
	.unwrap();
	let chunk_count = chunks.len() as u32;
	assert!(chunk_count > 1, "expected multi-chunk message");

	for (i, chunk_payload) in chunks.into_iter().enumerate() {
		let encoded = encode_chunk(
			chunk_payload,
			i as u32,
			chunk_count,
			message_id,
			None,
			None,
			PROTOCOL_VERSION,
		)
		.unwrap();
		assert!(
			encoded.len() <= max_message_size,
			"chunk {} is {} bytes, exceeds limit of {}",
			i,
			encoded.len(),
			max_message_size
		);
	}
}

/// Verifies that encoded chunks including the reply_subject fit within the limit.
#[test]
fn test_encoded_chunks_with_reply_fit_within_limit() {
	setup_logging();

	let max_message_size = 512;
	let reply_subject = "_INBOX.some-reply-subject";
	let payload: Vec<u8> = (0..5000_usize).map(|i| (i % 256) as u8).collect();
	let message_id = Uuid::from_bytes([2u8; 16]);

	let chunks = split_payload_into_chunks(
		&payload,
		max_message_size,
		message_id,
		Some(reply_subject),
		None,
		PROTOCOL_VERSION,
	)
	.unwrap();
	let chunk_count = chunks.len() as u32;

	for (i, chunk_payload) in chunks.into_iter().enumerate() {
		let reply = if i == 0 {
			Some(reply_subject.to_string())
		} else {
			None
		};
		let encoded = encode_chunk(
			chunk_payload,
			i as u32,
			chunk_count,
			message_id,
			reply.map(|x| x.into()),
			None,
			PROTOCOL_VERSION,
		)
		.unwrap();
		assert!(
			encoded.len() <= max_message_size,
			"chunk {} is {} bytes, exceeds limit of {}",
			i,
			encoded.len(),
			max_message_size
		);
	}
}

/// Two messages with different IDs can be tracked simultaneously, even when
/// their chunks arrive interleaved.
#[tokio::test]
async fn test_multiple_concurrent_messages() {
	setup_logging();

	let message_id_1 = Uuid::from_bytes([1u8; 16]);
	let message_id_2 = Uuid::from_bytes([2u8; 16]);
	let max_message_size = 512;

	let payload1: Vec<u8> = (0..2000_usize).map(|i| (i % 256) as u8).collect();
	let payload2: Vec<u8> = (0..2000_usize).map(|i| ((i + 128) % 256) as u8).collect();

	let chunks1 = split_payload_into_chunks(
		&payload1,
		max_message_size,
		message_id_1,
		None,
		None,
		PROTOCOL_VERSION,
	)
	.unwrap();
	let chunks2 = split_payload_into_chunks(
		&payload2,
		max_message_size,
		message_id_2,
		None,
		None,
		PROTOCOL_VERSION,
	)
	.unwrap();
	assert!(chunks1.len() > 1, "expected multi-chunk for message 1");
	assert!(chunks2.len() > 1, "expected multi-chunk for message 2");

	let chunk_count1 = chunks1.len() as u32;
	let chunk_count2 = chunks2.len() as u32;

	let encoded1: Vec<Vec<u8>> = chunks1
		.into_iter()
		.enumerate()
		.map(|(i, p)| {
			encode_chunk(
				p,
				i as u32,
				chunk_count1,
				message_id_1,
				None,
				None,
				PROTOCOL_VERSION,
			)
			.unwrap()
		})
		.collect();
	let encoded2: Vec<Vec<u8>> = chunks2
		.into_iter()
		.enumerate()
		.map(|(i, p)| {
			encode_chunk(
				p,
				i as u32,
				chunk_count2,
				message_id_2,
				None,
				None,
				PROTOCOL_VERSION,
			)
			.unwrap()
		})
		.collect();

	let tracker = ChunkTracker::new();
	let mut result1 = None;
	let mut result2 = None;

	// Feed chunks from both messages in alternating order.
	let max_len = encoded1.len().max(encoded2.len());
	for i in 0..max_len {
		if i < encoded1.len() {
			let r = process_chunk(&tracker, &encoded1[i]).await.unwrap();
			if r.is_some() {
				result1 = r;
			}
		}
		if i < encoded2.len() {
			let r = process_chunk(&tracker, &encoded2[i]).await.unwrap();
			if r.is_some() {
				result2 = r;
			}
		}
	}

	assert_eq!(
		result1.expect("message 1 not reassembled").payload,
		payload1
	);
	assert_eq!(
		result2.expect("message 2 not reassembled").payload,
		payload2
	);
}

/// Sending a later chunk before an earlier one returns an error.
#[tokio::test]
async fn test_out_of_order_chunk_error() {
	setup_logging();

	let message_id = Uuid::from_bytes([3u8; 16]);
	let max_message_size = 256;
	let payload: Vec<u8> = (0..3000_usize).map(|i| (i % 256) as u8).collect();

	let chunks = split_payload_into_chunks(
		&payload,
		max_message_size,
		message_id,
		None,
		None,
		PROTOCOL_VERSION,
	)
	.unwrap();
	let chunk_count = chunks.len() as u32;
	assert!(
		chunk_count >= 3,
		"need at least 3 chunks, got {}",
		chunk_count
	);

	let encoded: Vec<Vec<u8>> = chunks
		.into_iter()
		.enumerate()
		.map(|(i, p)| {
			encode_chunk(
				p,
				i as u32,
				chunk_count,
				message_id,
				None,
				None,
				PROTOCOL_VERSION,
			)
			.unwrap()
		})
		.collect();

	let tracker = ChunkTracker::new();

	// First chunk is accepted.
	assert!(
		process_chunk(&tracker, &encoded[0])
			.await
			.unwrap()
			.is_none()
	);

	// Skipping chunk 1 and sending chunk 2 should fail.
	let err = process_chunk(&tracker, &encoded[2]).await.unwrap_err();
	assert!(
		err.to_string().contains("expected chunk"),
		"expected order error, got: {}",
		err
	);
}

/// A MessageChunk with no preceding MessageStart returns an error.
#[tokio::test]
async fn test_orphan_chunk_without_start() {
	setup_logging();

	let message_id = Uuid::from_bytes([4u8; 16]);
	let encoded = encode_chunk(
		b"orphan".to_vec(),
		1,
		3,
		message_id,
		None,
		None,
		PROTOCOL_VERSION,
	)
	.unwrap();

	let tracker = ChunkTracker::new();
	let err = process_chunk(&tracker, &encoded).await.unwrap_err();
	assert!(
		err.to_string().contains("no matching buffer found"),
		"expected missing buffer error, got: {}",
		err
	);
}

#[test]
fn test_split_count_single_vs_multi() {
	setup_logging();

	let message_id = Uuid::from_bytes([5u8; 16]);
	let max_message_size = 256;

	let small = vec![0u8; 10];
	let chunks = split_payload_into_chunks(
		&small,
		max_message_size,
		message_id,
		None,
		None,
		PROTOCOL_VERSION,
	)
	.unwrap();
	assert_eq!(
		chunks.len(),
		1,
		"small payload should produce exactly 1 chunk"
	);

	let large = vec![0u8; max_message_size * 10];
	let chunks = split_payload_into_chunks(
		&large,
		max_message_size,
		message_id,
		None,
		None,
		PROTOCOL_VERSION,
	)
	.unwrap();
	assert!(
		chunks.len() > 1,
		"large payload should produce multiple chunks"
	);
}
