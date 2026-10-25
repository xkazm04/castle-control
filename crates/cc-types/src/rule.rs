use crate::{Action, RuleClass, RuleId, RuleMode, Timestamp};
use schemars::{JsonSchema, Schema, json_schema};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct AutoBanGrant {
    pub expires_at: Timestamp,
    #[schemars(range(min = 1))]
    pub max_bans_per_hour: std::num::NonZeroU32,
    pub breaker_tripped: bool,
}

/// Rail modes are fixed. Delivery is a nonblank routing label, not executable code.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(try_from = "RuleFields")]
#[schemars(with = "RuleFields", transform = rule_schema)]
pub struct Rule {
    pub rule_id: RuleId,
    pub name: String,
    pub rule_class: RuleClass,
    pub mode: RuleMode,
    pub action: Action,
    pub delivery: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub auto_ban_grant: Option<AutoBanGrant>,
}

#[derive(Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
struct RuleFields {
    rule_id: RuleId,
    #[schemars(extend("pattern" = r"\S"))]
    name: String,
    rule_class: RuleClass,
    mode: RuleMode,
    action: Action,
    #[schemars(extend("pattern" = r"\S"))]
    delivery: String,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "crate::present"
    )]
    #[schemars(with = "AutoBanGrant")]
    auto_ban_grant: Option<AutoBanGrant>,
}

impl TryFrom<RuleFields> for Rule {
    type Error = &'static str;
    fn try_from(value: RuleFields) -> Result<Self, Self::Error> {
        if value.name.trim().is_empty() || value.delivery.trim().is_empty() {
            return Err("rule name and delivery must be nonblank");
        }
        if value.rule_class == RuleClass::Rail && value.mode != RuleMode::Armed {
            return Err("rail rules are always armed; only delivery is configurable");
        }
        if value.auto_ban_grant.is_some() && value.rule_class != RuleClass::Pattern {
            return Err("only pattern rules may carry auto-ban grants");
        }
        Ok(Self {
            rule_id: value.rule_id,
            name: value.name,
            rule_class: value.rule_class,
            mode: value.mode,
            action: value.action,
            delivery: value.delivery,
            auto_ban_grant: value.auto_ban_grant,
        })
    }
}

fn rule_schema(schema: &mut Schema) {
    schema.insert(
        "allOf".into(),
        serde_json::json!([
            {"if":{"properties":{"rule_class":{"const":"rail"}}},
             "then":{"properties":{"mode":{"const":"armed"}}}},
            {"if":{"properties":{"rule_class":{"enum":["rail","classifier"]}}},
             "then":{"properties":{"auto_ban_grant":false}}}
        ]),
    );
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct ModeAcknowledgement {
    pub at: Timestamp,
    #[serde(deserialize_with = "nonblank")]
    #[schemars(extend("pattern" = r"\S"))]
    pub reason: String,
}

pub(crate) fn nonblank<'de, D: serde::Deserializer<'de>>(
    deserializer: D,
) -> Result<String, D::Error> {
    let value = String::deserialize(deserializer)?;
    if value.trim().is_empty() {
        Err(serde::de::Error::custom("expected nonblank text"))
    } else {
        Ok(value)
    }
}

/// Arming consent is part of the mutation and must be persisted with its decision.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(try_from = "RulesSetModeFields")]
#[schemars(with = "RulesSetModeFields", transform = mode_schema)]
pub struct RulesSetModeParams {
    pub rule_id: RuleId,
    pub mode: RuleMode,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub acknowledgement: Option<ModeAcknowledgement>,
}

#[derive(Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
struct RulesSetModeFields {
    rule_id: RuleId,
    mode: RuleMode,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "crate::present"
    )]
    #[schemars(with = "ModeAcknowledgement")]
    acknowledgement: Option<ModeAcknowledgement>,
}

impl TryFrom<RulesSetModeFields> for RulesSetModeParams {
    type Error = &'static str;
    fn try_from(value: RulesSetModeFields) -> Result<Self, Self::Error> {
        if value.mode == RuleMode::Armed && value.acknowledgement.is_none() {
            return Err("arming requires a logged acknowledgement");
        }
        Ok(Self {
            rule_id: value.rule_id,
            mode: value.mode,
            acknowledgement: value.acknowledgement,
        })
    }
}

fn mode_schema(schema: &mut Schema) {
    schema.insert(
        "if".into(),
        json_schema!({"properties":{"mode":{"const":"armed"}}}).to_value(),
    );
    schema.insert(
        "then".into(),
        serde_json::json!({"properties":{"acknowledgement":true}, "required":["acknowledgement"]}),
    );
}
