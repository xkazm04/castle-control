// Evaluation settings adapted from Shadowrunr OS crates/shadowrunr-types/src/moderation.rs
// and crates/shadowrunr-daemon/src/moderator/rules.rs @ 7e4b6f8; Apache-2.0, NOTICE.
use crate::strike::{timeout_schema, validate_timeout};
use crate::{Action, RuleClass, RuleId, RuleMode, StrikePolicy, Timestamp};
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
/// Patterns are nonblank data here; cc-gatehouse compiles regexes and refuses bad
/// patterns on upsert. This contract does not validate regex compilation.
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
    pub pattern: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timeout_s: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub strikes: Option<StrikePolicy>,
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
    #[schemars(with = "String", extend("pattern" = r"\S"))]
    pattern: Option<String>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "crate::present"
    )]
    #[schemars(with = "String", length(max = 500), extend("pattern" = r"\S"))]
    text: Option<String>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "crate::present"
    )]
    #[schemars(with = "u32", range(min = 1, max = 1_209_600))]
    timeout_s: Option<u32>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "crate::present"
    )]
    #[schemars(with = "StrikePolicy")]
    strikes: Option<StrikePolicy>,
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
        match value.rule_class {
            RuleClass::Pattern
                if value.pattern.as_deref().is_none_or(|p| p.trim().is_empty())
                    || value.text.is_some() =>
            {
                return Err("pattern rules require only pattern");
            }
            RuleClass::Classifier
                if value
                    .text
                    .as_deref()
                    .is_none_or(|t| t.trim().is_empty() || t.chars().count() > 500)
                    || value.pattern.is_some() =>
            {
                return Err("classifier rules require only text of 1..=500 characters");
            }
            RuleClass::Rail
                if value.pattern.is_some() || value.text.is_some() || value.strikes.is_some() =>
            {
                return Err("rail detectors are owned by code");
            }
            _ => {}
        }
        if value.rule_class == RuleClass::Classifier
            && value
                .strikes
                .as_ref()
                .is_some_and(|s| s.then == Action::Ban)
        {
            return Err("classifier rules cannot escalate to ban");
        }
        validate_timeout(value.action, value.timeout_s)?;
        Ok(Self {
            rule_id: value.rule_id,
            name: value.name,
            rule_class: value.rule_class,
            mode: value.mode,
            action: value.action,
            delivery: value.delivery,
            pattern: value.pattern,
            text: value.text,
            timeout_s: value.timeout_s,
            strikes: value.strikes,
            auto_ban_grant: value.auto_ban_grant,
        })
    }
}

fn rule_schema(schema: &mut Schema) {
    schema.insert(
        "allOf".into(),
        serde_json::json!([
            {"if":{"properties":{"rule_class":{"const":"rail"}}},
             "then":{"properties":{"mode":{"const":"armed"},
                "pattern":false,"text":false,"strikes":false}}},
            {"if":{"properties":{"rule_class":{"const":"pattern"}}},
             "then":{"properties":{"pattern":true,"text":false},"required":["pattern"]}},
            {"if":{"properties":{"rule_class":{"const":"classifier"}}},
             "then":{"properties":{"text":true,"pattern":false,
                "strikes":{"type":"object","properties":{"then":{"not":{"const":"ban"}}}}},"required":["text"]}},
            {"if":{"properties":{"rule_class":{"enum":["rail","classifier"]}}},
             "then":{"properties":{"auto_ban_grant":false}}},
            timeout_schema("action", "timeout_s")
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
