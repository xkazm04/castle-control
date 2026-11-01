//! Cross-language boundary vectors: the same simulated table runs in the package's
//! node tests (scripts/test-boundary-vectors.mjs). Rust and the JSON schema must agree.
use cc_types::*;
use serde_json::{Value, json};

fn vectors() -> Value {
    serde_json::from_str(include_str!(
        "../../../packages/contract/vectors/boundary-vectors.json"
    ))
    .unwrap()
}

fn rows(section: &str, key: &str) -> Vec<String> {
    vectors()[section][key]
        .as_array()
        .unwrap()
        .iter()
        .map(|v| v.as_str().unwrap().to_owned())
        .collect()
}

fn auth_accepts(id: &str) -> bool {
    let value = json!({"connected": true, "pending": false, "user_id": id, "scopes": []});
    serde_json::from_value::<TwitchAuthStatus>(value).is_ok()
}

fn rule_accepts(field: &str, text: &str) -> bool {
    let mut rule = json!({"rule_id":"simulated-links", "name":"Simulated links",
        "rule_class":"pattern", "mode":"shadow", "action":"ban", "delivery":"streamer",
        "pattern":"simulated"});
    rule[field] = json!(text);
    serde_json::from_value::<Rule>(rule).is_ok()
}

#[test]
fn twitch_user_id_vectors_match_the_canonical_rule() {
    for id in rows("twitch_user_id", "accepted") {
        assert!(auth_accepts(&id), "auth status must accept {id:?}");
        assert!(
            TwitchUserId::try_from(id.clone()).is_ok(),
            "TwitchUserId must accept {id:?}"
        );
    }
    for id in rows("twitch_user_id", "refused") {
        assert!(!auth_accepts(&id), "auth status must refuse {id:?}");
        assert!(
            TwitchUserId::try_from(id.clone()).is_err(),
            "TwitchUserId must refuse {id:?}"
        );
    }
}

fn enum_accepts<T: serde::de::DeserializeOwned>(text: &str) -> bool {
    serde_json::from_value::<T>(json!(text)).is_ok()
}

fn check_enum<T: serde::de::DeserializeOwned>(section: &str) {
    for text in rows(section, "accepted") {
        assert!(enum_accepts::<T>(&text), "{section} must accept {text:?}");
    }
    for text in rows(section, "refused") {
        assert!(!enum_accepts::<T>(&text), "{section} must refuse {text:?}");
    }
}

#[test]
fn draw_failure_reason_vectors_match_the_schema() {
    check_enum::<DrawFailureReason>("draw_failure_reason");
    assert_eq!(
        DrawFailureReason::VALUES.to_vec(),
        rows("draw_failure_reason", "accepted")
    );
}

#[test]
fn engine_outcome_vectors_match_the_schema() {
    check_enum::<EngineOutcome>("engine_outcome");
    check_enum::<EngineFailureReason>("engine_failure_reason");
    assert_eq!(
        EngineOutcome::VALUES.to_vec(),
        rows("engine_outcome", "accepted")
    );
    assert_eq!(
        EngineFailureReason::VALUES.to_vec(),
        rows("engine_failure_reason", "accepted")
    );
}

#[test]
fn nonblank_vectors_use_one_explicit_whitespace_set() {
    for field in ["name", "delivery", "pattern"] {
        for text in rows("nonblank", "blank") {
            assert!(!rule_accepts(field, &text), "{field} must refuse {text:?}");
        }
        for text in rows("nonblank", "nonblank") {
            assert!(rule_accepts(field, &text), "{field} must accept {text:?}");
        }
    }
}
