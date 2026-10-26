//! WP 1.2/1.3 wire shapes only; parsing grants no moderation authority.
use crate::{ChatDelay, LeaseId, MessageId};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

/// AutoMod's allow/deny resolution, separate from the resulting decision kind.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum HeldOutcome {
    Allow,
    Deny,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct HeldResolveParams {
    pub message_id: MessageId,
    pub outcome: HeldOutcome,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct DelaySetParams {
    /// Reuses ChatDelay's TryFrom validation: 0 (off), 2, 4 or 6 seconds only.
    pub delay_s: ChatDelay,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct DelaySetResult {
    /// The applied setting, never an optimistic echo before Twitch confirms it.
    pub delay_s: ChatDelay,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct ShieldSetParams {
    pub enabled: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct ShieldState {
    pub enabled: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct LeaseEndParams {
    /// References a service-minted lease, not a mode name or a viewer message.
    pub lease_id: LeaseId,
}
