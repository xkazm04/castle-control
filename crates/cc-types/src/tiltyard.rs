//! D5a full-replacement overlay declaration; no producer or renderer is supplied.
use crate::{TiltyardContestant, TiltyardLabel, Timestamp};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum TiltyardWinner {
    Left,
    Right,
}

pub const TILTYARD_CURRENT_ROUTE: &str = "/tiltyard/current";
pub const TILTYARD_PUSH_ROUTE: &str = "/push/tiltyard";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum TiltyardDecision {
    Tally,
    Tie,
    Call,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum TiltyardRenderPhase {
    Open,
    Closed,
    Called,
    Cancelled,
    Finished,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct TiltyardVerdict {
    pub side: TiltyardWinner,
    pub how: TiltyardDecision,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct TiltyardSide {
    pub label: TiltyardLabel,
    pub count: u32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct TiltyardRenderSnapshot {
    pub left: TiltyardSide,
    pub right: TiltyardSide,
    pub ballots: u32,
    pub phase: TiltyardRenderPhase,
    pub round_label: TiltyardLabel,
    pub match_label: TiltyardLabel,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "crate::present"
    )]
    #[schemars(with = "Timestamp")]
    pub window_ends_at: Option<Timestamp>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "crate::present"
    )]
    #[schemars(with = "u32")]
    pub window_remaining_ms: Option<u32>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "crate::present"
    )]
    #[schemars(with = "TiltyardVerdict")]
    pub verdict: Option<TiltyardVerdict>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "crate::present"
    )]
    #[schemars(with = "TiltyardContestant")]
    pub champion: Option<TiltyardContestant>,
    /// True iff at least one counted ballot is simulated, including mixed windows.
    pub simulated: bool,
    pub at: Timestamp,
}
