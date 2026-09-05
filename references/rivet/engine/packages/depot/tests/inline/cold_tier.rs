use aws_sdk_s3::error::SdkError;
use aws_sdk_s3::operation::get_object::GetObjectError;
use aws_sdk_s3::types::error::NoSuchKey;

use super::is_s3_no_such_key_error;

#[test]
fn typed_no_such_key_errors_are_missing_objects() {
	let err = SdkError::service_error(
		GetObjectError::NoSuchKey(NoSuchKey::builder().message("missing object").build()),
		(),
	);

	assert!(is_s3_no_such_key_error(&err));
}

#[test]
fn non_service_errors_are_not_missing_objects() {
	let err =
		SdkError::<GetObjectError, ()>::construction_failure(std::io::Error::other("build failed"));

	assert!(!is_s3_no_such_key_error(&err));
}
