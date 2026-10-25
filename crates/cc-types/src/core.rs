use crate::{DataValue, Timestamp};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct Empty {}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct StatusResult {
    pub at: Timestamp,
    pub version: String,
    pub uptime_ms: u64,
    pub twitch_connected: bool,
    pub obs_connected: bool,
    pub simulated: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct Settings {
    pub values: BTreeMap<String, DataValue>,
}

/// Secrets are never included: OAuth codes stay within the credential broker.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct TwitchAuthStatus {
    pub connected: bool,
    pub pending: bool,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "present_numeric_id"
    )]
    #[schemars(with = "String", extend("pattern" = r"^[0-9]+$(?![\s\S])"))]
    pub user_id: Option<String>,
    pub scopes: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct ObsStatus {
    pub connected: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct ObsSourceParams {
    pub scene_name: String,
    pub source_name: String,
    pub url: String,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct ObsSourceResult {
    pub source_name: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct ForgetUserParams {
    pub login: String,
    pub dry_run: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct PurgeAllParams {
    pub dry_run: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct PurgeResult {
    pub dry_run: bool,
    pub as_of: Timestamp,
    pub counts: BTreeMap<String, u64>,
}

/// Deliberately unusable until its owning WP supplies request/result shapes.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
pub enum Pending {}

fn present_numeric_id<'de, D: serde::Deserializer<'de>>(
    deserializer: D,
) -> Result<Option<String>, D::Error> {
    let value = String::deserialize(deserializer)?;
    if !value.is_empty() && value.bytes().all(|b| b.is_ascii_digit()) {
        Ok(Some(value))
    } else {
        Err(serde::de::Error::custom(
            "expected a nonempty Twitch ID string",
        ))
    }
}
