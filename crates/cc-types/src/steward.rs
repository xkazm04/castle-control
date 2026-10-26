//! WP 5.1 contract only. Parsing a proposal grants no authority to apply it.
use crate::{
    CurveSetParams, DrawUpsertParams, ErrorEnvelope, RulesSetModeParams, RulesUpsertParams,
    Timestamp, VisualUpsertParams, WritId,
};
use schemars::{JsonSchema, Schema};
use serde::{Deserialize, Serialize};

/// Map Room is deferred until its configuration mutation has a typed contract.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum WritChamber {
    Lots,
    Gatehouse,
    Beacons,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum WritStatus {
    Proposed,
    Sealed,
    Torn,
    Invalid,
}

/// Whole typed mutation snapshots for review, never arbitrary JSON patch paths.
/// Omitted before means creation; after is the proposed mutation, not an action.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields, bound(deserialize = "T: Deserialize<'de>"))]
pub struct WritDiff<T> {
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "crate::present"
    )]
    #[schemars(with = "T")]
    pub before: Option<T>,
    pub after: T,
}

/// Closed per-chamber proposals reuse the authoritative mutation parameters.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "method", content = "diff", deny_unknown_fields)]
pub enum WritProposal {
    #[serde(rename = "lots.draw.upsert")]
    DrawUpsert(WritDiff<DrawUpsertParams>),
    #[serde(rename = "gatehouse.rules.upsert")]
    RulesUpsert(WritDiff<RulesUpsertParams>),
    #[serde(rename = "gatehouse.rules.setMode")]
    RulesSetMode(WritDiff<RulesSetModeParams>),
    #[serde(rename = "beacons.visual.upsert")]
    VisualUpsert(WritDiff<VisualUpsertParams>),
    #[serde(rename = "beacons.curve.set")]
    CurveSet(WritDiff<CurveSetParams>),
}
impl WritProposal {
    pub fn chamber(&self) -> WritChamber {
        match self {
            Self::DrawUpsert(_) => WritChamber::Lots,
            Self::RulesUpsert(_) | Self::RulesSetMode(_) => WritChamber::Gatehouse,
            Self::VisualUpsert(_) | Self::CurveSet(_) => WritChamber::Beacons,
        }
    }
}

// One field list keeps the deserialization and published schema views identical.
macro_rules! writ {
    ($($fields:tt)*) => {
        #[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
        #[serde(try_from = "WritFields")]
        #[schemars(with = "WritFields", transform = writ_schema)]
        pub struct Writ { $($fields)* }

        #[derive(Deserialize, JsonSchema)]
        #[serde(deny_unknown_fields)]
        struct WritFields { $($fields)* }
    };
}
writ! {
    /// Mint only through the existing WritId::mint door; parse IDs on reads.
    pub writ_id: WritId,
    pub chamber: WritChamber,
    pub proposal: WritProposal,
    pub status: WritStatus,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "crate::present"
    )]
    #[schemars(with = "ErrorEnvelope")]
    pub error: Option<ErrorEnvelope>,
}
impl TryFrom<WritFields> for Writ {
    type Error = &'static str;
    fn try_from(value: WritFields) -> Result<Self, Self::Error> {
        if value.chamber != value.proposal.chamber() {
            return Err("proposal does not belong to writ chamber");
        }
        Ok(Self {
            writ_id: value.writ_id,
            chamber: value.chamber,
            proposal: value.proposal,
            status: value.status,
            created_at: value.created_at,
            updated_at: value.updated_at,
            error: value.error,
        })
    }
}
fn writ_schema(schema: &mut Schema) {
    let groups = [
        ("lots", vec!["lots.draw.upsert"]),
        (
            "gatehouse",
            vec!["gatehouse.rules.upsert", "gatehouse.rules.setMode"],
        ),
        (
            "beacons",
            vec!["beacons.visual.upsert", "beacons.curve.set"],
        ),
    ];
    schema.insert(
        "allOf".into(),
        serde_json::json!(groups.map(|(chamber, methods)| {
            serde_json::json!({
                "if": {"properties": {"chamber": {"const": chamber}}},
                "then": {"properties": {"proposal": {"type": "object", "properties": {
                    "method": {"enum": methods}
                }}}}
            })
        })),
    );
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct AskParams {
    pub chamber: WritChamber,
    #[serde(deserialize_with = "crate::rule::nonblank")]
    #[schemars(extend("pattern" = r"\S"))]
    pub prompt: String,
    /// Existing writ context for a follow-up; never a client-minted new ID.
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "crate::present"
    )]
    #[schemars(with = "WritId")]
    pub writ_id: Option<WritId>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct AskResult {
    pub writ: Writ,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct WritSealParams {
    pub writ_id: WritId,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct WritSealResult {
    pub writ: Writ,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct WritTearParams {
    pub writ_id: WritId,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct WritTearResult {
    pub writ: Writ,
}

/// Binding for the existing event kind; StreamEvent remains invalidation-only.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "kind", content = "payload", deny_unknown_fields)]
pub enum StewardEventPayload {
    #[serde(rename = "steward.writ")]
    Writ(Writ),
}
