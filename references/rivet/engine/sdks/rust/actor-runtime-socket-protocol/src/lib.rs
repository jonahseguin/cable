//! Versioned wire protocol for the experimental Actor Runtime Socket.
pub mod generated;
pub mod versioned;

pub use generated::v1::*;

pub const PROTOCOL_VERSION: u16 = 1;
