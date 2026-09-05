use std::borrow::Cow;

use universalpubsub::Subject;

pub const TRACING_CONFIG_SUBJECT: &str = "rivet.debug.tracing.config";
pub const DYNAMIC_CONFIG_SUBJECT: &str = "rivet.config.dynamic";

pub struct TracingConfigSubject;

impl std::fmt::Display for TracingConfigSubject {
	fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
		TRACING_CONFIG_SUBJECT.fmt(f)
	}
}

impl Subject for TracingConfigSubject {
	fn root<'a>() -> Option<Cow<'a, str>> {
		Some(Cow::Borrowed(TRACING_CONFIG_SUBJECT))
	}

	fn as_str(&self) -> Option<&str> {
		Some(TRACING_CONFIG_SUBJECT)
	}
}

pub struct DynamicConfigSubject;

impl std::fmt::Display for DynamicConfigSubject {
	fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
		DYNAMIC_CONFIG_SUBJECT.fmt(f)
	}
}

impl Subject for DynamicConfigSubject {
	fn root<'a>() -> Option<Cow<'a, str>> {
		Some(Cow::Borrowed(DYNAMIC_CONFIG_SUBJECT))
	}

	fn as_str(&self) -> Option<&str> {
		Some(DYNAMIC_CONFIG_SUBJECT)
	}
}
