//! WP 1.6 offline replay contracts. No handler, live action or ledger mutation.
use crate::{
    Action, BridgeGap, GatehouseText, InstrumentHash, MessageId, Rule, RuleId, Timestamp, Verdict,
};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum DrillState {
    Acted,
    NotProvoked,
    NotEvaluable,
    JudgePending,
    JudgeVoid,
    EngineFailed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum SimulationLabel {
    Simulated,
}

/// Bank and judge are service-resolved configuration labels, not model names or code.
/// WP 1.6 resolves their immutable contents and hashes all four inputs before running.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct DrillConfiguration {
    pub rules: Vec<Rule>,
    pub bank: GatehouseText,
    pub judge: GatehouseText,
    pub prompts: Vec<GatehouseText>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct DrillRunParams {
    pub recording: GatehouseText,
    pub configuration: DrillConfiguration,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct DrillDiffParams {
    pub recording: GatehouseText,
    pub baseline: DrillConfiguration,
    pub candidate: DrillConfiguration,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct DrillInstrument {
    pub rules_hash: InstrumentHash,
    pub bank_hash: InstrumentHash,
    pub judge_hash: InstrumentHash,
    pub prompts_hash: InstrumentHash,
}

/// Source accompanies every result row, so detached/exported rows keep provenance.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct DrillOutcome {
    pub message_id: MessageId,
    pub source: GatehouseText,
    pub at: Timestamp,
    pub state: DrillState,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "crate::present"
    )]
    #[schemars(with = "Verdict")]
    pub verdict: Option<Verdict>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "crate::present"
    )]
    #[schemars(with = "Action")]
    pub action: Option<Action>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "crate::present"
    )]
    #[schemars(with = "RuleId")]
    pub rule_id: Option<RuleId>,
    /// A direct evaluation observation. Omit when the judge has no valid answer.
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "crate::present"
    )]
    #[schemars(with = "bool")]
    pub passed: Option<bool>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct DrillStateCounts {
    pub acted: u32,
    pub not_provoked: u32,
    pub not_evaluable: u32,
    pub judge_pending: u32,
    pub judge_void: u32,
    pub engine_failed: u32,
}

/// Its denominator is explicit: this axis is never inferred from the pass count.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct OverModeration {
    pub evaluated: u32,
    pub false_positives: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct DrillSummary {
    /// Count observed passes directly; never total minus failures or pending cases.
    pub passes: u32,
    pub states: DrillStateCounts,
    pub over_moderation: OverModeration,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct DrillRunResult {
    pub label: SimulationLabel,
    pub source: GatehouseText,
    /// Hash of the canonical instrument (rules, bank, judge and prompts).
    pub instrument_hash: InstrumentHash,
    pub instrument: DrillInstrument,
    pub outcomes: Vec<DrillOutcome>,
    pub summary: DrillSummary,
    /// Missing recording intervals stay explicit, never fabricated as successful replay.
    pub gaps: Vec<BridgeGap>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct DrillChange {
    pub message_id: MessageId,
    pub before: DrillState,
    pub after: DrillState,
}

/// Each side keeps its own instrument, source, gaps and summary. No merged score.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct DrillDiffResult {
    pub label: SimulationLabel,
    pub baseline: DrillRunResult,
    pub candidate: DrillRunResult,
    pub changes: Vec<DrillChange>,
}
