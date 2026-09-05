use super::*;

#[test]
fn base64url_is_url_safe_and_unpadded() {
	// Bytes chosen so std base64 would emit '+' and '/'.
	assert_eq!(base64url_nopad(&[0xfb, 0xff, 0xbf]), "-_-_");
	assert_eq!(base64url_nopad(&[0x03]), "Aw");
	assert_eq!(base64url_nopad(b"hello"), "aGVsbG8");
	// 32 bytes -> 43 chars, no '=' padding.
	assert_eq!(base64url_nopad(&[0u8; 32]).len(), 43);
	assert!(!base64url_nopad(&[0u8; 32]).contains('='));
}

#[test]
fn boot_id_is_stable_within_a_process() {
	let first = boot_id();
	let second = boot_id();
	assert_eq!(first, second);
	assert!(!first.is_empty());
}
