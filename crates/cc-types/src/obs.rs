//! WP R.1 OBS declarations only; connection and scene handlers follow separately.
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::fmt;

#[derive(Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct ObsConnectParams {
    pub host: String,
    #[schemars(with = "u32", range(max = 65535))]
    pub port: u16,
    pub password: String,
    pub remember: bool,
}

impl fmt::Debug for ObsConnectParams {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("ObsConnectParams")
            .field("host", &self.host)
            .field("port", &self.port)
            .field("password", &"[REDACTED]")
            .field("remember", &self.remember)
            .finish()
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct ObsSceneEnsureParams {
    #[serde(deserialize_with = "scene_name")]
    #[schemars(length(min = 1, max = 256))]
    pub scene_name: String,
}

fn scene_name<'de, D: serde::Deserializer<'de>>(deserializer: D) -> Result<String, D::Error> {
    let value = String::deserialize(deserializer)?;
    if (1..=256).contains(&value.chars().count()) {
        Ok(value)
    } else {
        Err(serde::de::Error::custom(
            "expected scene name of 1..256 characters",
        ))
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct ObsSceneEnsureResult {
    pub created: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct ObsRehearsalClearResult {
    pub removed: u32,
}
