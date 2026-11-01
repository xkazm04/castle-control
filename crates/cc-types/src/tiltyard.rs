//! WP R.1 full-replacement overlay payload; no producer or renderer is supplied.
use crate::Timestamp;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum TiltyardVerdict {
    Left,
    Right,
    Tie,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct TiltyardSide {
    pub label: String,
    pub count: u32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct TiltyardRenderSnapshot {
    pub left: TiltyardSide,
    pub right: TiltyardSide,
    pub ballots: u32,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "crate::present"
    )]
    #[schemars(with = "TiltyardVerdict")]
    pub verdict: Option<TiltyardVerdict>,
    pub simulated: bool,
    pub at: Timestamp,
}
