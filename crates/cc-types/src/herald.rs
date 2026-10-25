//! WP 1.5 read-only consensus payloads. There is no action surface in this contract.
use crate::{ConsensusDelta, ConsensusShare, GatehouseText, Timestamp};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::num::NonZeroU32;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum ConsensusFilter {
    All {},
    Emotes {},
    Text {},
    Emote { emote: GatehouseText },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct ConsensusGetParams {
    #[schemars(range(min = 1))]
    pub window_s: NonZeroU32,
    pub filter: ConsensusFilter,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct ConsensusPoint {
    pub at: Timestamp,
    pub share: ConsensusShare,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct OpinionDirection {
    /// Plain data key scoped to this chart, not a new branded ID namespace.
    pub key: GatehouseText,
    pub label: GatehouseText,
    pub share: ConsensusShare,
    /// Share now minus share 180 seconds ago, in fraction units, not percent.
    /// Absent until enough history exists; never invent a zero delta.
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "crate::present"
    )]
    #[schemars(with = "ConsensusDelta")]
    pub delta_3m: Option<ConsensusDelta>,
    pub messages: u32,
    pub series: Vec<ConsensusPoint>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct ConsensusGetResult {
    /// End of the sliding window. The window starts window_s seconds before at.
    pub at: Timestamp,
    #[schemars(range(min = 1))]
    pub window_s: NonZeroU32,
    pub filter: ConsensusFilter,
    pub directions: Vec<OpinionDirection>,
    /// Messages shed within this window/filter, reported even when no direction remains.
    pub shed_count: u32,
}

/// Only the event already named by the plan. StreamEvent remains invalidation-only.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "kind", content = "payload", deny_unknown_fields)]
pub enum ConsensusEventPayload {
    #[serde(rename = "gatehouse.consensus")]
    Consensus(ConsensusGetResult),
}
