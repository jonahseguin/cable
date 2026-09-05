use std::{
	sync::atomic::{AtomicU16, AtomicU64, Ordering},
	time::{SystemTime, UNIX_EPOCH},
};

use crate::tuple::{TuplePack, Versionstamp, pack_with_versionstamp};

static TRANSACTION_COUNTER: AtomicU16 = AtomicU16::new(0);
static LAST_TIMESTAMP: AtomicU64 = AtomicU64::new(0);

pub fn generate_versionstamp(user_version: u16) -> Versionstamp {
	// HACK: Using SystemTime::now() for versionstamp generation is problematic because:
	// (a) System time can go backwards due to NTP adjustments, daylight savings, etc.
	// (b) System time is not synchronized across machines, so versionstamps generated
	//     on different machines may not be correctly ordered
	//
	// This implementation tries to mitigate issue (a) by using max(current_time, last_time)
	// but cannot solve issue (b)
	let current_timestamp = SystemTime::now()
		.duration_since(UNIX_EPOCH)
		.unwrap()
		.as_micros() as u64;

	// Check if we've moved to a new microsecond to reset the transaction counter
	//
	// NOTE: Time can go backwards, so we use the max of current and last timestamp
	let last_ts = LAST_TIMESTAMP.load(Ordering::Acquire);
	let timestamp = current_timestamp.max(last_ts);

	if timestamp > last_ts {
		// Reset counter for new microsecond
		LAST_TIMESTAMP.store(timestamp, Ordering::Release);
		TRANSACTION_COUNTER.store(0, Ordering::Release);
	}

	let counter = TRANSACTION_COUNTER.fetch_add(1, Ordering::SeqCst);

	// Handle counter overflow: if we've generated 65,536 versionstamps in the same
	// microsecond, increment the timestamp and reset the counter
	let final_timestamp = if counter == u16::MAX {
		// Counter overflowed, increment timestamp
		let new_timestamp = timestamp + 1;
		LAST_TIMESTAMP.store(new_timestamp, Ordering::Release);
		TRANSACTION_COUNTER.store(0, Ordering::Release);
		new_timestamp
	} else {
		timestamp
	};

	let mut bytes = [0u8; 12];

	bytes[0..8].copy_from_slice(&final_timestamp.to_be_bytes());
	bytes[8..10].copy_from_slice(&counter.to_be_bytes());

	bytes[10..12].copy_from_slice(&user_version.to_be_bytes());

	Versionstamp::from(bytes)
}

pub fn substitute_versionstamp(
	packed_data: &mut Vec<u8>,
	versionstamp: Versionstamp,
) -> Result<(), String> {
	const VERSIONSTAMP_MARKER: u8 = 0x33;
	const VERSIONSTAMP_SIZE: usize = 10;

	if packed_data.len() < 4 {
		return Err("Packed data too short to contain versionstamp offset".to_string());
	}

	let data_len = packed_data.len() - 4;
	let offset_bytes = &packed_data[data_len..];
	let offset = u32::from_le_bytes([
		offset_bytes[0],
		offset_bytes[1],
		offset_bytes[2],
		offset_bytes[3],
	]) as usize;

	if offset >= data_len {
		return Err(format!(
			"Invalid versionstamp offset: {} exceeds data length {}",
			offset, data_len
		));
	}

	// The offset might point to the marker or the first byte of the versionstamp
	let versionstamp_start = if packed_data.get(offset) == Some(&VERSIONSTAMP_MARKER) {
		offset + 1
	} else if offset > 0 && packed_data.get(offset - 1) == Some(&VERSIONSTAMP_MARKER) {
		// The offset points to the first byte of the versionstamp data
		offset
	} else {
		return Err(format!(
			"No versionstamp marker (0x33) found at or before offset {}",
			offset
		));
	};

	let versionstamp_end = versionstamp_start + VERSIONSTAMP_SIZE;

	if versionstamp_end > data_len {
		return Err("Versionstamp extends beyond data bounds".to_string());
	}

	let existing_bytes = &packed_data[versionstamp_start..versionstamp_end];
	if existing_bytes[0..10] != [0xff; 10] {
		packed_data.truncate(data_len);
		return Ok(());
	}

	let versionstamp_bytes = versionstamp.as_bytes();
	packed_data[versionstamp_start..versionstamp_end].copy_from_slice(&versionstamp_bytes[..10]);
	packed_data.truncate(data_len);

	Ok(())
}

pub fn substitute_raw_versionstamp(
	mut data: Vec<u8>,
	versionstamp: &Versionstamp,
) -> Result<Vec<u8>, String> {
	if data.len() < 4 {
		return Err("Packed data too short to contain versionstamp offset".to_string());
	}

	let data_len = data.len() - 4;
	let offset_bytes = &data[data_len..];
	let offset = u32::from_le_bytes([
		offset_bytes[0],
		offset_bytes[1],
		offset_bytes[2],
		offset_bytes[3],
	]) as usize;
	let versionstamp_len = 10;
	let versionstamp_end = offset
		.checked_add(versionstamp_len)
		.ok_or_else(|| "Versionstamp offset overflowed".to_string())?;

	if versionstamp_end > data_len {
		return Err(format!(
			"Invalid versionstamp offset: {} exceeds data length {}",
			offset, data_len
		));
	}

	data[offset..versionstamp_end].copy_from_slice(&versionstamp.as_bytes()[..versionstamp_len]);
	data.truncate(data_len);

	Ok(data)
}

pub fn pack_and_substitute_versionstamp<T: TuplePack>(
	value: &T,
	user_version: u16,
) -> Result<Vec<u8>, String> {
	let mut packed_data = pack_with_versionstamp(value);

	let versionstamp = generate_versionstamp(user_version);

	substitute_versionstamp(&mut packed_data, versionstamp)?;

	Ok(packed_data)
}
