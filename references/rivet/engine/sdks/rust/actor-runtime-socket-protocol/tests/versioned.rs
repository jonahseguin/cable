use rivet_actor_runtime_socket_protocol as wire;
use vbare::OwnedVersionedData;

#[test]
fn embedded_version_round_trips_all_top_level_frames() {
	let hello = wire::versioned::ClientHello::wrap_latest(())
		.serialize_with_embedded_version(wire::PROTOCOL_VERSION)
		.unwrap();
	assert_eq!(&hello[..2], &1_u16.to_le_bytes());
	assert_eq!(
		wire::versioned::ClientHello::deserialize_with_embedded_version(&hello).unwrap(),
		()
	);

	let rejection =
		wire::versioned::ServerHello::wrap_latest(wire::ServerHello::HelloRejectUnsupportedVersion)
			.serialize_with_embedded_version(wire::PROTOCOL_VERSION)
			.unwrap();
	assert_eq!(rejection.len(), 3, "version prefix plus union tag");
	assert!(matches!(
		wire::versioned::ServerHello::deserialize_with_embedded_version(&rejection).unwrap(),
		wire::ServerHello::HelloRejectUnsupportedVersion
	));

	let request = wire::ClientFrame::Request(wire::Request {
		request_id: 7,
		lease_key: Some("txn".to_owned()),
		payload: wire::RequestPayload::SqliteQuery(wire::SqliteQuery {
			sql: "SELECT ?".to_owned(),
			params: vec![wire::SqlValue::SqlInteger(42)],
		}),
	});
	let encoded = wire::versioned::ClientFrame::wrap_latest(request.clone())
		.serialize_with_embedded_version(1)
		.unwrap();
	assert_eq!(
		wire::versioned::ClientFrame::deserialize_with_embedded_version(&encoded).unwrap(),
		request
	);

	let response = wire::ServerFrame::Response(wire::Response {
		request_id: 7,
		payload: wire::ResponsePayload::SqliteQueryOk(wire::SqliteQueryOk {
			columns: vec!["value".to_owned()],
			rows: vec![vec![wire::SqlValue::SqlInteger(42)]],
			changes: 0,
			last_insert_row_id: None,
		}),
	});
	let encoded = wire::versioned::ServerFrame::wrap_latest(response.clone())
		.serialize_with_embedded_version(1)
		.unwrap();
	assert_eq!(
		wire::versioned::ServerFrame::deserialize_with_embedded_version(&encoded).unwrap(),
		response
	);
}

#[test]
fn unsupported_embedded_version_is_rejected_without_decoding() {
	let error =
		wire::versioned::ClientFrame::deserialize_with_embedded_version(&[2, 0, 0]).unwrap_err();
	assert!(
		error
			.to_string()
			.contains("unsupported Actor Runtime Socket protocol version")
	);
}
