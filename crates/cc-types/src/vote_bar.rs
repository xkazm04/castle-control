//! Aggregate-only OBS output. Direction positions never carry keys or labels.
use crate::{ConsensusShare, Timestamp};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

pub const VOTE_BAR_SNAPSHOT_EVENT: &str = "gatehouse.render.snapshot";

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct VoteBarDirection {
    pub share: ConsensusShare,
}

/// Full replacement in consensus direction order. No chat or viewer data.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct VoteBarSnapshot {
    pub directions: Vec<VoteBarDirection>,
    pub simulated: bool,
    pub at: Timestamp,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct VoteBarSourceResult {
    pub url: String,
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn snapshot_has_only_aggregates_and_rejects_unknown_fields() {
        let value = json!({"directions":[{"share":0.75}],"simulated":true,
            "at":"2026-10-31T12:00:00Z"});
        assert!(serde_json::from_value::<VoteBarSnapshot>(value.clone()).is_ok());
        for field in ["text", "quote", "login", "user_id", "label", "unknown"] {
            let mut invalid = value.clone();
            invalid[field] = json!("simulated private data");
            assert!(serde_json::from_value::<VoteBarSnapshot>(invalid).is_err());
            let mut invalid = value.clone();
            invalid["directions"][0][field] = json!("simulated private data");
            assert!(serde_json::from_value::<VoteBarSnapshot>(invalid).is_err());
        }
        let schema = serde_json::to_value(schemars::schema_for!(VoteBarSnapshot)).unwrap();
        assert_eq!(schema["additionalProperties"], false);
        assert!(schema["properties"].get("text").is_none());
        assert_eq!(schema["properties"].as_object().unwrap().len(), 3);
    }
}
