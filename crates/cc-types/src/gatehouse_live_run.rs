//! Capture-time evidence. A retained instrument is never reconstructed from current settings.
use crate::{
    Action, BridgeGap, DecisionId, DrillConfiguration, DrillInstrument, GatehouseProvenance,
    GatehouseText, InstrumentHash, Timestamp,
};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct GatehouseInstrumentBank {
    pub label: GatehouseText,
    pub calibration: GatehouseText,
    pub cases: Vec<GatehouseInstrumentCase>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct GatehouseInstrumentCase {
    pub key: GatehouseText,
    pub text: GatehouseText,
    pub expected: GatehouseInstrumentExpectation,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case", deny_unknown_fields)]
pub enum GatehouseInstrumentExpectation {
    Allow,
    Action(Action),
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct GatehouseInstrumentJudge {
    pub revision: GatehouseText,
    pub model: GatehouseText,
    pub tier: GatehouseText,
    pub rubric: GatehouseText,
    pub parameters: BTreeMap<String, String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct GatehouseInstrumentPrompts {
    pub version: GatehouseText,
    pub system: GatehouseText,
    pub prompts: Vec<GatehouseText>,
    pub sources: BTreeMap<String, InstrumentHash>,
}

/// Resolved, canonical inputs used by the drill fingerprint, not just their labels.
/// These inert JSON values contain the bank, judge identity and prompt/source revisions.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct GatehouseInstrumentInputs {
    pub bank: GatehouseInstrumentBank,
    pub judge: GatehouseInstrumentJudge,
    pub prompts: GatehouseInstrumentPrompts,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum GatehouseLiveRunGapReason {
    CaptureUnavailable,
    RecordingUnavailable,
    ClassifierNotReplayable,
    RuntimeContextNotReplayable,
    BridgeGap,
}

/// Each capture currently covers one screened notification. from/to are inclusive
/// message times; bridge gaps retain their original intervals separately.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct GatehouseLiveCapture {
    pub recording: GatehouseText,
    pub from: Timestamp,
    pub to: Timestamp,
    pub configuration: DrillConfiguration,
    pub instrument: DrillInstrument,
    pub instrument_hash: InstrumentHash,
    pub inputs: GatehouseInstrumentInputs,
    pub gaps: Vec<BridgeGap>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "crate::present"
    )]
    #[schemars(with = "GatehouseLiveRunGapReason")]
    pub replay_gap: Option<GatehouseLiveRunGapReason>,
}

/// Coverage is keyed to committed live decision IDs, including missing legacy rows.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "coverage", rename_all = "snake_case", deny_unknown_fields)]
pub enum GatehouseLiveRunItem {
    Retained {
        decision_id: DecisionId,
        provenance: GatehouseProvenance,
        capture: Box<GatehouseLiveCapture>,
    },
    Unavailable {
        decision_id: DecisionId,
        reason: GatehouseLiveRunGapReason,
    },
}
