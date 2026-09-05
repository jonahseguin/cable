use universaldb::{
	tuple::{Element, Versionstamp, pack_with_versionstamp, unpack},
	versionstamp::*,
};

#[test]
fn test_generate_versionstamp() {
	let vs1 = generate_versionstamp(100);
	let vs2 = generate_versionstamp(200);

	assert!(vs1.is_complete());
	assert!(vs2.is_complete());
	assert_eq!(vs1.user_version(), 100);
	assert_eq!(vs2.user_version(), 200);

	assert_ne!(vs1.as_bytes(), vs2.as_bytes());
}

#[test]
fn test_substitute_versionstamp_success() {
	let incomplete = Versionstamp::incomplete(100);
	let tuple = vec![
		Element::String("mykey".into()),
		Element::Versionstamp(incomplete),
		Element::Int(42),
	];

	let mut packed = pack_with_versionstamp(&tuple);
	let versionstamp = generate_versionstamp(100);

	assert!(substitute_versionstamp(&mut packed, versionstamp).is_ok());

	let unpacked: Vec<Element> = unpack(&packed).unwrap();
	assert_eq!(unpacked.len(), 3);

	match &unpacked[1] {
		Element::Versionstamp(v) => {
			assert!(v.is_complete());
			assert_eq!(v.user_version(), 100);
		}
		_ => panic!("Expected versionstamp"),
	}
}

#[test]
fn test_substitute_versionstamp_no_offset() {
	let mut packed = vec![1, 2, 3];
	let versionstamp = generate_versionstamp(100);

	let result = substitute_versionstamp(&mut packed, versionstamp);
	assert!(result.is_err());
	assert!(result.unwrap_err().contains("too short"));
}

#[test]
fn test_substitute_versionstamp_invalid_offset() {
	let mut packed = vec![1, 2, 3, 4, 5];
	packed.extend_from_slice(&100u32.to_le_bytes());

	let versionstamp = generate_versionstamp(100);

	let result = substitute_versionstamp(&mut packed, versionstamp);
	assert!(result.is_err());
	assert!(result.unwrap_err().contains("Invalid versionstamp offset"));
}

#[test]
fn test_substitute_versionstamp_no_marker() {
	let mut packed = vec![1, 2, 3, 4, 5, 6, 7, 8];
	packed.extend_from_slice(&2u32.to_le_bytes());

	let versionstamp = generate_versionstamp(100);

	let result = substitute_versionstamp(&mut packed, versionstamp);
	assert!(result.is_err());
	assert!(result.unwrap_err().contains("No versionstamp marker"));
}

#[test]
fn test_substitute_versionstamp_already_complete() {
	// Create an incomplete versionstamp first
	let incomplete = Versionstamp::from([0xff; 12]);
	let tuple = vec![Element::Versionstamp(incomplete)];

	let mut packed = pack_with_versionstamp(&tuple);

	// First substitution - this should succeed
	let versionstamp1 = generate_versionstamp(50);
	assert!(substitute_versionstamp(&mut packed, versionstamp1).is_ok());

	// Now try to substitute again on the already complete versionstamp
	// We need to manually add the offset back
	packed.extend_from_slice(&1u32.to_le_bytes());

	let versionstamp2 = generate_versionstamp(100);

	let result = substitute_versionstamp(&mut packed, versionstamp2);
	// Should succeed but not modify the already complete versionstamp
	assert!(result.is_ok());
}

#[test]
fn test_substitute_raw_versionstamp_trims_explicit_operand_offset() {
	let versionstamp = generate_versionstamp(100);
	let mut param = b"prefix".to_vec();
	let offset = param.len() as u32;
	param.extend_from_slice(&[0xff; 10]);
	param.extend_from_slice(b"suffix");
	param.extend_from_slice(&offset.to_le_bytes());

	let substituted = substitute_raw_versionstamp(param.clone(), &versionstamp).unwrap();

	assert_eq!(substituted.len(), param.len() - 4);
	assert_eq!(&substituted[..offset as usize], b"prefix");
	assert_eq!(
		&substituted[offset as usize..offset as usize + 10],
		&versionstamp.as_bytes()[..10]
	);
	assert_eq!(&substituted[offset as usize + 10..], b"suffix");
}

#[test]
fn test_substitute_raw_versionstamp_matches_fdb_metadata_value_operand() {
	let versionstamp = generate_versionstamp(100);
	let mut param = vec![0; 14];
	param[10..].copy_from_slice(&0u32.to_le_bytes());

	let substituted = substitute_raw_versionstamp(param, &versionstamp).unwrap();

	assert_eq!(substituted, versionstamp.as_bytes()[..10]);
}

#[test]
fn test_substitute_raw_versionstamp_preserves_depot_suffix_bytes() {
	let versionstamp = generate_versionstamp(100);
	let mut param = vec![0xff; 10];
	param.extend_from_slice(&[0; 6]);
	param.extend_from_slice(&0u32.to_le_bytes());

	let substituted = substitute_raw_versionstamp(param, &versionstamp).unwrap();

	assert_eq!(substituted.len(), 16);
	assert_eq!(&substituted[..10], &versionstamp.as_bytes()[..10]);
	assert_eq!(&substituted[10..], &[0; 6]);
}

#[test]
fn test_substitute_versionstamp_matches_official_tuple_operand_layout() {
	let tuple = ("prefix", Versionstamp::incomplete(12345), "suffix");
	let mut ours = pack_with_versionstamp(&tuple);
	let official = ours.clone();
	let versionstamp = generate_versionstamp(54321);

	substitute_versionstamp(&mut ours, versionstamp.clone()).unwrap();

	let offset_start = official.len() - 4;
	let offset = u32::from_le_bytes(
		official[offset_start..]
			.try_into()
			.expect("official tuple offset should be four bytes"),
	) as usize;
	let mut expected = official[..offset_start].to_vec();
	expected[offset..offset + 10].copy_from_slice(&versionstamp.as_bytes()[..10]);

	assert_eq!(ours, expected);

	let unpacked: (String, Versionstamp, String) = unpack(&ours).unwrap();
	assert!(unpacked.1.is_complete());
	assert_eq!(unpacked.1.user_version(), 12345);
}

#[test]
fn test_pack_and_substitute_versionstamp() {
	let incomplete = Versionstamp::incomplete(100);
	let tuple = vec![
		Element::String("mykey".into()),
		Element::Versionstamp(incomplete),
		Element::Int(42),
	];

	let packed = pack_and_substitute_versionstamp(&tuple, 100).unwrap();

	let unpacked: Vec<Element> = unpack(&packed).unwrap();
	match &unpacked[1] {
		Element::Versionstamp(v) => {
			assert!(v.is_complete());
			assert_eq!(v.user_version(), 100);
		}
		_ => panic!("Expected versionstamp"),
	}
}

#[test]
fn test_versionstamp_incomplete_preserves_user_version() {
	// Test that Versionstamp::incomplete(user_version) properly preserves the user version
	let user_version: u16 = 12345;
	let incomplete = Versionstamp::incomplete(user_version);

	// The versionstamp should be incomplete
	assert!(
		!incomplete.is_complete(),
		"Versionstamp should be incomplete"
	);

	// The user version should be preserved
	assert_eq!(
		incomplete.user_version(),
		user_version,
		"User version should be preserved"
	);

	// Verify the bytes structure: first 10 bytes should be 0xff, last 2 bytes should be user_version
	let bytes = incomplete.as_bytes();
	assert_eq!(bytes.len(), 12);

	// First 10 bytes should all be 0xff
	for i in 0..10 {
		assert_eq!(bytes[i], 0xff, "Byte {} should be 0xff", i);
	}

	// Last 2 bytes should contain the user version in big-endian
	let stored_user_version = u16::from_be_bytes([bytes[10], bytes[11]]);
	assert_eq!(
		stored_user_version, user_version,
		"User version bytes should match"
	);

	let tuple = vec![
		Element::String("test".into()),
		Element::Versionstamp(incomplete),
	];

	let mut packed = pack_with_versionstamp(&tuple);
	let new_user_version: u16 = 54321;
	let versionstamp = generate_versionstamp(new_user_version);

	assert!(substitute_versionstamp(&mut packed, versionstamp).is_ok());

	let unpacked: Vec<Element> = unpack(&packed).unwrap();
	match &unpacked[1] {
		Element::Versionstamp(v) => {
			assert!(v.is_complete());
			assert_eq!(
				v.user_version(),
				user_version,
				"Substituted versionstamp should preserve the tuple user version"
			);
		}
		_ => panic!("Expected versionstamp"),
	}
}
