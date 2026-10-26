//! Simulated Twitch-UI actions: typed detail required, unknown enums rejected.
use super::moderation_fixtures::actor;
use crate::moderation::{ModerationNotification, parse_notification};
use serde_json::{Value, json};

fn parse(event: &Value) -> Result<Option<ModerationNotification>, crate::BridgeError> {
    parse_notification("channel.moderate", Some("2"), event)
}

#[test]
fn ui_actions_require_the_selected_detail_not_a_different_action_body() {
    let mut exercised = std::collections::BTreeSet::new();
    let user = json!({"user_id": "222", "user_login": "simulated_viewer",
        "user_name": "SimulatedViewer"});
    let detail = |extras: Value| {
        let mut value = user.clone();
        value
            .as_object_mut()
            .expect("user")
            .extend(extras.as_object().expect("extras").clone());
        value
    };
    let cases = [
        ("ban", "ban", detail(json!({"reason": "simulated reason"}))),
        (
            "timeout",
            "timeout",
            detail(json!({"reason": "simulated reason",
            "expires_at": "2026-10-26T12:10:00Z"})),
        ),
        ("unban", "unban", user.clone()),
        ("untimeout", "untimeout", user.clone()),
        ("vip", "vip", user.clone()),
        ("unvip", "unvip", user.clone()),
        ("mod", "mod", user.clone()),
        ("unmod", "unmod", user.clone()),
        ("unraid", "unraid", user.clone()),
        (
            "followers",
            "followers",
            json!({"follow_duration_minutes": 10}),
        ),
        ("slow", "slow", json!({"wait_time_seconds": 10})),
        ("raid", "raid", detail(json!({"viewer_count": 50}))),
        (
            "delete",
            "delete",
            detail(json!({"message_id": "simulated-message",
            "message_body": "simulated text"})),
        ),
        (
            "warn",
            "warn",
            detail(json!({"reason": null, "chat_rules_cited": ["simulated rule"]})),
        ),
        (
            "add_blocked_term",
            "automod_terms",
            json!({"action": "add", "list": "blocked",
            "terms": ["simulated term"], "from_automod": true}),
        ),
        (
            "add_permitted_term",
            "automod_terms",
            json!({"action": "add", "list": "permitted",
            "terms": ["simulated term"], "from_automod": false}),
        ),
        (
            "remove_blocked_term",
            "automod_terms",
            json!({"action": "remove", "list": "blocked",
            "terms": ["simulated term"], "from_automod": false}),
        ),
        (
            "remove_permitted_term",
            "automod_terms",
            json!({"action": "remove", "list": "permitted",
            "terms": ["simulated term"], "from_automod": false}),
        ),
        (
            "approve_unban_request",
            "unban_request",
            detail(json!({"is_approved": true,
            "moderator_message": "simulated approval"})),
        ),
        (
            "deny_unban_request",
            "unban_request",
            detail(json!({"is_approved": false,
            "moderator_message": "simulated denial"})),
        ),
    ];
    for (action, key, detail) in cases {
        exercised.insert(action);
        let mut event = actor();
        event["action"] = json!(action);
        event[key] = detail;
        super::spike_checks::moderate(&event);
        assert!(parse(&event).expect("simulated action detail").is_some());
        event[key] = Value::Null;
        assert!(parse(&event).is_err());
        event["action"] = json!("future_action");
        assert!(parse(&event).is_err());
    }
    for action in [
        "clear",
        "emoteonly",
        "emoteonlyoff",
        "followersoff",
        "uniquechat",
        "uniquechatoff",
        "slowoff",
        "subscribers",
        "subscribersoff",
    ] {
        exercised.insert(action);
        let mut event = actor();
        event["action"] = json!(action);
        super::spike_checks::moderate(&event);
        assert!(parse(&event).expect("simulated setting action").is_some());
    }
    assert_eq!(
        exercised,
        super::spike_session::ACTIONS.iter().copied().collect()
    );
}

#[test]
fn nested_term_enum_drift_and_timeout_timestamp_are_not_coerced() {
    for (field, value) in [("action", "future_operation"), ("list", "future_list")] {
        let mut event = actor();
        event["action"] = json!("add_blocked_term");
        event["automod_terms"] = json!({"action": "add", "list": "blocked",
            "terms": ["simulated term"], "from_automod": true});
        event["automod_terms"][field] = json!(value);
        assert!(parse(&event).is_err());
    }
    let mut event = actor();
    event["action"] = json!("timeout");
    event["timeout"] = actor();
    event["timeout"]["reason"] = json!("simulated reason");
    event["timeout"]["expires_at"] = json!("invalid timestamp");
    assert!(parse(&event).is_err());
}
