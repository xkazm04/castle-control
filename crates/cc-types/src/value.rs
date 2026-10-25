use crate::ErrorCode;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

/// JSON data excluding null, recursively. Unknown/absent values are omitted.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(untagged)]
pub enum DataValue {
    Bool(bool),
    Number(serde_json::Number),
    String(String),
    Array(Vec<DataValue>),
    Object(BTreeMap<String, DataValue>),
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(try_from = "String", into = "String")]
#[schemars(with = "String", extend("format" = "date-time", "pattern" = r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$(?![\s\S])"))]
pub struct Timestamp(String);
impl Timestamp {
    pub fn now() -> Self {
        Self(chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true))
    }
}
impl TryFrom<String> for Timestamp {
    type Error = &'static str;
    fn try_from(value: String) -> Result<Self, Self::Error> {
        let valid = chrono::DateTime::parse_from_rfc3339(&value).is_ok_and(|date| {
            value.get(..19) == Some(date.format("%Y-%m-%dT%H:%M:%S").to_string().as_str())
                && chrono::Timelike::nanosecond(&date) < 1_000_000_000
        });
        if value.ends_with('Z') && valid {
            Ok(Self(value))
        } else {
            Err("expected RFC 3339 UTC timestamp ending in Z")
        }
    }
}
impl From<Timestamp> for String {
    fn from(value: Timestamp) -> Self {
        value.0
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct ErrorEnvelope {
    pub code: ErrorCode,
    pub message: String,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "crate::present"
    )]
    #[schemars(with = "u64")]
    pub retry_after_ms: Option<u64>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "crate::present"
    )]
    #[schemars(with = "DataValue")]
    pub detail: Option<DataValue>,
}
impl ErrorEnvelope {
    pub fn new(code: ErrorCode, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
            retry_after_ms: None,
            detail: None,
        }
    }
}
