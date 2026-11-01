//! D5a declarations mirroring packages/duel/src/session/chat.ts; no state machine.
use crate::{
    TiltyardId, TiltyardLabel, TiltyardMatchKey, TiltyardNote, TiltyardRound, TiltyardSeed,
    TiltyardSpeed, TiltyardVerdict, TiltyardWindowMs, Timestamp,
};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum TiltyardSessionPhase {
    Live,
    Verdict,
    CalledOff,
    Done,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct TiltyardContestant {
    pub id: TiltyardId,
    pub title: TiltyardLabel,
    pub by: TiltyardLabel,
    pub seed: TiltyardSeed,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "crate::present"
    )]
    #[schemars(with = "TiltyardNote")]
    pub note: Option<TiltyardNote>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct TiltyardList {
    pub title: TiltyardLabel,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "crate::present"
    )]
    #[schemars(with = "TiltyardLabel")]
    pub prompt: Option<TiltyardLabel>,
    #[serde(deserialize_with = "crate::tiltyard_value::items")]
    #[schemars(length(min = 2, max = 64))]
    pub items: Vec<TiltyardContestant>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct TiltyardMatch {
    pub a: TiltyardId,
    pub b: TiltyardId,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "crate::present"
    )]
    #[schemars(with = "TiltyardId")]
    pub winner: Option<TiltyardId>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(transparent)]
pub struct TiltyardMatches(
    #[serde(deserialize_with = "crate::tiltyard_value::matches")]
    #[schemars(length(min = 1, max = 4))]
    pub Vec<TiltyardMatch>,
);

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct TiltyardBracket {
    #[serde(deserialize_with = "crate::tiltyard_value::seeds")]
    #[schemars(length(min = 2, max = 8))]
    pub seeds: Vec<TiltyardId>,
    #[serde(deserialize_with = "crate::tiltyard_value::rounds")]
    #[schemars(length(min = 1, max = 3))]
    pub rounds: Vec<TiltyardMatches>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct TiltyardCounted {
    pub left: u32,
    pub right: u32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct TiltyardCall {
    pub winner: TiltyardId,
    pub counted: TiltyardCounted,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct TiltyardClosedMatch {
    pub a: TiltyardId,
    pub b: TiltyardId,
    pub verdict: TiltyardVerdict,
    pub counted: TiltyardCounted,
    pub elapsed_ms: u32,
    pub round: TiltyardRound,
    #[serde(deserialize_with = "match_index")]
    #[schemars(range(max = 3))]
    pub index: u32,
    pub match_key: TiltyardMatchKey,
}

fn match_index<'de, D: serde::Deserializer<'de>>(d: D) -> Result<u32, D::Error> {
    let value = u32::deserialize(d)?;
    if value <= 3 {
        Ok(value)
    } else {
        Err(serde::de::Error::custom("invalid match index"))
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct TiltyardSession {
    pub phase: TiltyardSessionPhase,
    pub list: TiltyardList,
    pub bracket: TiltyardBracket,
    #[serde(deserialize_with = "crate::tiltyard_value::history")]
    #[schemars(length(max = 7))]
    pub history: Vec<TiltyardBracket>,
    pub window_ms: TiltyardWindowMs,
    pub key: TiltyardId,
    pub elapsed_ms: u32,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "crate::present"
    )]
    #[schemars(with = "TiltyardMatchKey")]
    pub match_key: Option<TiltyardMatchKey>,
    pub speed: TiltyardSpeed,
    pub calls: Vec<TiltyardCall>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "crate::present"
    )]
    #[schemars(with = "TiltyardClosedMatch")]
    pub verdict: Option<TiltyardClosedMatch>,
    pub remaining_ms: u32,
    pub counted: TiltyardCounted,
    pub simulated: bool,
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
    #[schemars(with = "TiltyardId")]
    pub champion: Option<TiltyardId>,
}

/// Original event vocabulary: enter is contextual; counts/timestamps belong to core.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum TiltyardAction {
    Start {
        list: TiltyardList,
        key: TiltyardId,
        window_ms: TiltyardWindowMs,
    },
    Pick {
        side: crate::TiltyardWinner,
    },
    Tick {
        ms: u32,
    },
    Enter {},
    Cancel {},
    Undo {},
    Reset {},
    Speed {},
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct TiltyardTurnParams {
    pub action: TiltyardAction,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct TiltyardStageResult {
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "crate::present"
    )]
    #[schemars(with = "TiltyardSession")]
    pub session: Option<TiltyardSession>,
    pub at: Timestamp,
}
