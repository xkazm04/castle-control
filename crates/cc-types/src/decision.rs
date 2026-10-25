use crate::{DecisionId, DecisionKind, MessageId, Operator, RuleId, Timestamp, Verdict};
use schemars::{JsonSchema, Schema};
use serde::{Deserialize, Serialize};

/// Review payload, not the append-only ledger record. Pending bans contain original text.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(try_from = "DecisionFields")]
#[schemars(with = "DecisionFields", transform = decision_schema)]
pub struct Decision {
    pub decision_id: DecisionId,
    pub message_id: MessageId,
    pub kind: DecisionKind,
    pub verdict: Verdict,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rule_id: Option<RuleId>,
    pub operator: Operator,
    pub at: Timestamp,
    pub simulated: bool,
    pub reason_codes: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message_text: Option<String>,
}

#[derive(Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
struct DecisionFields {
    decision_id: DecisionId,
    message_id: MessageId,
    kind: DecisionKind,
    verdict: Verdict,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "crate::present"
    )]
    #[schemars(with = "RuleId")]
    rule_id: Option<RuleId>,
    operator: Operator,
    at: Timestamp,
    simulated: bool,
    reason_codes: Vec<String>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "crate::present"
    )]
    #[schemars(with = "String", length(min = 1))]
    message_text: Option<String>,
}

impl TryFrom<DecisionFields> for Decision {
    type Error = &'static str;
    fn try_from(value: DecisionFields) -> Result<Self, Self::Error> {
        if value.kind == DecisionKind::BanPending && value.message_text.is_none() {
            return Err("pending bans require the original message text");
        }
        if value.message_text.as_ref().is_some_and(String::is_empty) {
            return Err("message text must not be empty");
        }
        Ok(Self {
            decision_id: value.decision_id,
            message_id: value.message_id,
            kind: value.kind,
            verdict: value.verdict,
            rule_id: value.rule_id,
            operator: value.operator,
            at: value.at,
            simulated: value.simulated,
            reason_codes: value.reason_codes,
            message_text: value.message_text,
        })
    }
}

fn decision_schema(schema: &mut Schema) {
    schema.insert(
        "if".into(),
        serde_json::json!({"properties":{"kind":{"const":"ban_pending"}}}),
    );
    schema.insert(
        "then".into(),
        serde_json::json!({"properties":{"message_text":true},"required":["message_text"]}),
    );
}
