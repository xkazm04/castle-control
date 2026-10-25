//! WP 1.6 imported log provenance and schema-checked recording data.
use crate::{BridgeGap, GatehouseText, MessageId, Timestamp, TwitchUserId};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct RecordedMessage {
    pub message_id: MessageId,
    pub user_id: TwitchUserId,
    pub at: Timestamp,
    pub text: String,
}

/// Inert data only; source is a provenance label, never a URL to fetch or file to open.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct RecordingImportParams {
    pub source: GatehouseText,
    pub messages: Vec<RecordedMessage>,
    pub gaps: Vec<BridgeGap>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct RecordingImportResult {
    pub recording: GatehouseText,
    pub source: GatehouseText,
    pub message_count: u32,
    pub gaps: Vec<BridgeGap>,
}
