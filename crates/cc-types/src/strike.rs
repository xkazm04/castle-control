// Settings adapted from Shadowrunr OS crates/shadowrunr-types/src/moderation.rs
// and crates/shadowrunr-daemon/src/moderator/rules.rs @ 7e4b6f8; Apache-2.0, NOTICE.
use crate::Action;
use schemars::{JsonSchema, Schema};
use serde::{Deserialize, Serialize};

/// Escalate after `count` hits of the same rule by the same viewer within `window_s`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(try_from = "StrikePolicyFields")]
#[schemars(with = "StrikePolicyFields", transform = strike_schema)]
pub struct StrikePolicy {
    pub count: u32,
    pub window_s: u32,
    pub then: Action,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub then_timeout_s: Option<u32>,
}

#[derive(Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
struct StrikePolicyFields {
    #[schemars(range(min = 1))]
    count: u32,
    #[schemars(range(min = 1))]
    window_s: u32,
    then: Action,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "crate::present"
    )]
    #[schemars(with = "u32", range(min = 1, max = 1_209_600))]
    then_timeout_s: Option<u32>,
}

impl TryFrom<StrikePolicyFields> for StrikePolicy {
    type Error = &'static str;
    fn try_from(value: StrikePolicyFields) -> Result<Self, Self::Error> {
        if value.count == 0 || value.window_s == 0 {
            return Err("strike count and window_s must be positive");
        }
        validate_timeout(value.then, value.then_timeout_s)?;
        Ok(Self {
            count: value.count,
            window_s: value.window_s,
            then: value.then,
            then_timeout_s: value.then_timeout_s,
        })
    }
}

pub(crate) fn validate_timeout(action: Action, timeout: Option<u32>) -> Result<(), &'static str> {
    match (action, timeout) {
        (Action::Timeout, Some(1..=1_209_600)) => Ok(()),
        (_, None) if action != Action::Timeout => Ok(()),
        _ => Err("only timeout actions require a duration of 1..=1209600 seconds"),
    }
}

pub(crate) fn timeout_schema(action: &str, duration: &str) -> serde_json::Value {
    serde_json::json!({
        "if":{"properties":{action:{"const":"timeout"}}},
        "then":{"properties":{duration:true}, "required":[duration]},
        "else":{"properties":{duration:false}}
    })
}

fn strike_schema(schema: &mut Schema) {
    schema.insert(
        "allOf".into(),
        serde_json::json!([timeout_schema("then", "then_timeout_s")]),
    );
}
