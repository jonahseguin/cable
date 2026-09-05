use std::time::Duration;

pub const MAX_FAULT_DELAY: Duration = Duration::from_secs(30);

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DepotFaultAction {
	Fail { message: String },
	Pause { checkpoint: String },
	Delay { duration: Duration },
	DropArtifact,
}
