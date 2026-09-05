use gas::prelude::Id;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
pub struct BucketId(Uuid);

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
pub struct BucketPointerId(Uuid);

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
pub struct DatabasePointerId(Uuid);

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
pub struct BucketBranchId(Uuid);

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
pub struct DatabaseBranchId(Uuid);

macro_rules! impl_uuid_id {
	($type:ident) => {
		impl $type {
			pub fn new_v4() -> Self {
				Self(Uuid::new_v4())
			}

			pub fn nil() -> Self {
				Self(Uuid::nil())
			}

			pub fn from_uuid(uuid: Uuid) -> Self {
				Self(uuid)
			}

			pub fn as_uuid(&self) -> Uuid {
				self.0
			}
		}
	};
}

impl_uuid_id!(BucketId);
impl_uuid_id!(BucketPointerId);
impl_uuid_id!(DatabasePointerId);
impl_uuid_id!(BucketBranchId);
impl_uuid_id!(DatabaseBranchId);

impl BucketId {
	pub fn from_gas_id(id: Id) -> Self {
		let bytes = id.as_bytes();
		let uuid = Uuid::from_slice(&bytes[1..17]).expect("gas v1 ids carry 16 uuid bytes");
		Self(uuid)
	}
}

pub type DatabaseIdStr = String;
pub type BucketIdUuid = BucketId;
