use crate::{DecisionId, PetitionOutcome, Rule};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct RulesListResult {
    pub rules: Vec<Rule>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct RulesUpsertParams {
    pub rule: Rule,
    /// Governs the room's on-stream output, not the containing rule.
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "crate::present"
    )]
    #[schemars(with = "crate::Display")]
    pub display: Option<crate::Display>,
}

/// References the durable decision being confirmed, dismissed or undone.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct DecisionParams {
    pub decision_id: DecisionId,
}

/// An appeal addresses an existing decision; it does not introduce a second ID space.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct PetitionResolveParams {
    pub decision_id: DecisionId,
    pub outcome: PetitionOutcome,
}
