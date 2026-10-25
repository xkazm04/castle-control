//! Contract-only projections of cc-lots policy, pools and weights; no handlers.
use crate::{
    CheckResult, DrawContent, DrawId, DrawRunId, LotsKeyword, LotsSealedRoll, LotsUnsigned,
    LotsVerifiedCast, MessageId, RandomnessSource, Timestamp, TwitchUserId, WritId,
};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::num::{NonZeroU16, NonZeroU32};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct LotsDrawPolicy {
    pub content: DrawContent,
    pub paid_entry: bool,
    pub paid_weight: bool,
    pub subscriber_only: bool,
    pub channel_points: bool,
    pub free_entry_equal_odds: bool,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "crate::present"
    )]
    #[schemars(with = "u8")]
    pub minimum_age: Option<u8>,
    pub regions: Vec<String>,
    pub prize_value_usd_cents: LotsUnsigned,
    pub registration_confirmed: bool,
    pub official_rules: bool,
    pub twitch_disclaimer: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "kind", deny_unknown_fields, rename_all = "snake_case")]
pub enum LotsPool {
    Chatters,
    Followers,
    Subscribers,
    Redeemers,
    Keyword { keyword: LotsKeyword },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "kind", deny_unknown_fields, rename_all = "snake_case")]
pub enum LotsWeightCurve {
    Equal,
    Concave {
        #[schemars(with = "u32", range(min = 1, max = 65535))]
        max_units: NonZeroU16,
    },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct LotsCohortCap {
    #[serde(deserialize_with = "crate::rule::nonblank")]
    #[schemars(extend("pattern" = r"\S"))]
    pub cohort: String,
    #[schemars(with = "u32", range(max = 65535))]
    pub numerator: u16,
    #[schemars(with = "u32", range(min = 1, max = 65535))]
    pub denominator: NonZeroU16,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct LotsRollRules {
    pub pool: LotsPool,
    #[schemars(with = "u32", range(min = 1, max = 65535))]
    pub winner_count: NonZeroU16,
    pub cooldown_s: u32,
    pub cohort_caps: Vec<LotsCohortCap>,
    pub weight_curve: LotsWeightCurve,
    pub free_join_equal_odds: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct LotsDraw {
    pub draw_id: DrawId,
    #[serde(deserialize_with = "crate::rule::nonblank")]
    #[schemars(extend("pattern" = r"\S"))]
    pub name: String,
    pub policy: LotsDrawPolicy,
    pub rules: LotsRollRules,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct DrawListResult {
    pub draws: Vec<LotsDraw>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct DrawUpsertParams {
    pub draw: LotsDraw,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct DrawCheckParams {
    pub policy: LotsDrawPolicy,
}

/// Reason codes are plain data, matching PolicyReason's snake_case names.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct DrawCheckResult {
    pub result: CheckResult,
    pub reasons: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct RollLookupParams {
    pub draw_id: DrawId,
    pub user_id: TwitchUserId,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct LotsRollEntry {
    pub user_id: TwitchUserId,
    pub source_message_id: MessageId,
    pub entered_at: Timestamp,
    #[serde(deserialize_with = "cohorts")]
    #[schemars(extend("uniqueItems" = true))]
    pub cohorts: Vec<String>,
    #[schemars(range(min = 1))]
    pub weight: NonZeroU32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct RollLookupResult {
    pub draw_id: DrawId,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "crate::present"
    )]
    #[schemars(with = "LotsRollEntry")]
    pub entry: Option<LotsRollEntry>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct LotsWeightRow {
    pub user_id: TwitchUserId,
    #[schemars(range(min = 1))]
    pub weight: NonZeroU32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct LotsWeightTable {
    pub rows: Vec<LotsWeightRow>,
    #[schemars(range(min = 1))]
    pub newcomer_weight: NonZeroU32,
    pub heaviest_weight: u32,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "crate::present"
    )]
    #[schemars(with = "u32", range(min = 1))]
    pub newcomers_to_outweigh_heaviest: Option<NonZeroU32>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct RollSealParams {
    pub draw_id: DrawId,
    pub source: RandomnessSource,
    #[schemars(range(min = 1))]
    pub margin_s: NonZeroU32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct RollSealResult {
    pub draw_id: DrawId,
    pub draw_run_id: DrawRunId,
    pub sealed: LotsSealedRoll,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct CastParams {
    pub draw_run_id: DrawRunId,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct CastResult {
    pub draw_run_id: DrawRunId,
    pub writ_id: WritId,
    pub cast: LotsVerifiedCast,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct WritGetParams {
    pub writ_id: WritId,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct LotsRollPayload {
    pub draw_id: DrawId,
    pub weight_table: LotsWeightTable,
}

/// Payload binding only; /events transport integration belongs to later RPC wiring.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "kind", content = "payload", deny_unknown_fields)]
pub enum LotsEventPayload {
    #[serde(rename = "lots.roll")]
    Roll(LotsRollPayload),
    #[serde(rename = "lots.sealed")]
    Sealed(RollSealResult),
    #[serde(rename = "lots.cast")]
    Cast(CastResult),
}

fn cohorts<'de, D: serde::Deserializer<'de>>(deserializer: D) -> Result<Vec<String>, D::Error> {
    let values = Vec::<String>::deserialize(deserializer)?;
    let unique: std::collections::BTreeSet<_> = values.iter().collect();
    if unique.len() == values.len() {
        Ok(values)
    } else {
        Err(serde::de::Error::custom("duplicate cohort"))
    }
}
