//! WP R.1 declarations. Everything produced by Rehearsal is implicitly simulated.
use crate::{ObsStatus, Timestamp, VisualId};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum RehearsalScenario {
    LotsFill,
    VoteRound,
    BeaconFire,
    DuelRound,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct RehearsalScenarioParams {
    pub scenario: RehearsalScenario,
    /// Meaningful only for beacon_fire; no execution semantics are declared here.
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "crate::present"
    )]
    #[schemars(with = "VisualId")]
    pub visual_id: Option<VisualId>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct RehearsalScenarioResult {
    pub accepted: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct RehearsalCrowdParams {
    #[serde(deserialize_with = "crowd_rate")]
    #[schemars(with = "u32", range(max = 600))]
    pub per_minute: u16,
}

fn crowd_rate<'de, D: serde::Deserializer<'de>>(deserializer: D) -> Result<u16, D::Error> {
    let value = u16::deserialize(deserializer)?;
    if value <= 600 {
        Ok(value)
    } else {
        Err(serde::de::Error::custom("expected crowd rate in 0..600"))
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct RehearsalStatus {
    pub active: bool,
    #[schemars(with = "u32", range(max = 65535))]
    pub crowd_per_minute: u16,
    pub obs: ObsStatus,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "crate::present"
    )]
    #[schemars(with = "String")]
    pub scene_name: Option<String>,
    pub at: Timestamp,
}
