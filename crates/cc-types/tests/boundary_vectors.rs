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
