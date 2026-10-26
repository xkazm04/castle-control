//! Assertions shared by simulated fixtures and owner-operated live observations.
use crate::moderation::{ModerationNotification as N, parse_notification};
use serde_json::Value;

pub(super) fn event(kind: &str, version: &str, value: &Value) -> N {
    parse_notification(kind, Some(version), value)
        .expect("EventSub assumption changed")
        .expect("moderation topic")
}

pub(super) fn hold(value: &Value) {
    let N::AutoModHold(hold) = event("automod.message.hold", "2", value) else {
        panic!("hold variant")
    };
    assert!(!hold.message_id.is_empty());
    assert!(value["held_at"].is_string());
    match hold.reason {
        crate::moderation::HoldReason::Automod { automod } => {
            assert_eq!(value["reason"], "automod");
            assert_eq!(value["automod"]["category"], automod.category);
            assert_eq!(value["automod"]["level"], automod.level);
            for boundary in automod.boundaries {
                assert!(boundary.start_pos <= boundary.end_pos);
            }
        }
        crate::moderation::HoldReason::BlockedTerm { blocked_term } => {
            assert_eq!(value["reason"], "blocked_term");
            for (raw, term) in value["blocked_term"]["terms_found"]
                .as_array()
                .expect("terms_found array")
                .iter()
                .zip(blocked_term.terms_found)
            {
                assert!(raw["boundary"].is_object());
                assert!(raw.get("boundaries").is_none());
                assert!(term.boundary.start_pos <= term.boundary.end_pos);
                assert!(!term.owner_broadcaster_user_id.is_empty());
                assert!(!term.owner_broadcaster_user_login.is_empty());
                assert!(!term.owner_broadcaster_user_name.is_empty());
            }
        }
    }
}

pub(super) fn update(value: &Value) {
    let N::AutoModUpdate(update) = event("automod.message.update", "2", value) else {
        panic!("update variant")
    };
    assert!(!update.message_id.is_empty());
    // Expired may have empty moderator strings: require the wire identity fields,
    // not an invented moderator. Optional v2 details remain absent when absent.
    assert!(value["moderator_user_id"].is_string());
    assert!(value["moderator_user_login"].is_string());
    assert!(value["moderator_user_name"].is_string());
    assert_eq!(update.held_at.is_some(), value["held_at"].is_string());
    assert_eq!(update.reason.is_some(), value["reason"].is_string());
}

pub(super) fn suspicious(value: &Value) {
    let N::SuspiciousMessage(message) = event("channel.suspicious_user.message", "1", value) else {
        panic!("suspicious variant")
    };
    assert!(!message.message.message_id.is_empty());
    assert_eq!(value["message"]["message_id"], message.message.message_id);
    assert!(value["message"]["text"].is_string());
    assert!(value["message"]["fragments"].is_array());
    assert_eq!(
        message.types.len(),
        value["types"].as_array().expect("types").len()
    );
}

pub(super) fn moderate(value: &Value) {
    let N::Moderate(_) = event("channel.moderate", "2", value) else {
        panic!("moderate variant")
    };
    let action = value["action"].as_str().expect("action string");
    let key = match action {
        "add_blocked_term"
        | "add_permitted_term"
        | "remove_blocked_term"
        | "remove_permitted_term" => "automod_terms",
        "approve_unban_request" | "deny_unban_request" => "unban_request",
        other => other,
    };
    if let Some(detail) = value.get(key).filter(|detail| !detail.is_null()) {
        assert!(detail.is_object());
    }
    assert!(value["moderator_user_id"].is_string());
    for field in [
        "source_broadcaster_user_id",
        "source_broadcaster_user_login",
        "source_broadcaster_user_name",
    ] {
        if let Some(source) = value.get(field).filter(|source| !source.is_null()) {
            assert!(
                source.is_string(),
                "raw shared-chat identity must remain a string"
            );
        }
    }
}

pub(super) fn shield(kind: &str, value: &Value) {
    let time = if kind.ends_with("begin") {
        "started_at"
    } else {
        "ended_at"
    };
    assert!(value[time].is_string());
    match event(kind, "1", value) {
        N::ShieldBegin(e) => assert!(!e.moderator.moderator_user_id.is_empty()),
        N::ShieldEnd(e) => assert!(!e.moderator.moderator_user_id.is_empty()),
        _ => panic!("Shield variant"),
    }
}

pub(super) fn response(path: &str, value: &Value) {
    let data = value["data"].as_array().expect("Helix data array");
    assert_eq!(data.len(), 1);
    let row = &data[0];
    match path {
        "/moderation/warnings" => {
            for field in ["broadcaster_id", "moderator_id", "user_id"] {
                assert!(!row[field].as_str().expect("warning identity").is_empty());
            }
        }
        "/moderation/shield_mode" => {
            assert!(row["is_active"].is_boolean());
            for field in ["moderator_id", "moderator_login", "moderator_name"] {
                assert!(row[field].is_string());
            }
            chrono::DateTime::parse_from_rfc3339(
                row["last_activated_at"]
                    .as_str()
                    .expect("Shield last activation"),
            )
            .expect("Shield timestamp");
        }
        "/chat/settings" => {
            assert!(row["broadcaster_id"].is_string());
            assert!(row["moderator_id"].is_string());
            delay(row);
        }
        _ => panic!("unlisted response assumption"),
    }
}

pub(super) fn delay(value: &Value) {
    let enabled = value["non_moderator_chat_delay"]
        .as_bool()
        .expect("delay enabled");
    if enabled {
        assert!(matches!(
            value["non_moderator_chat_delay_duration"].as_u64(),
            Some(2 | 4 | 6)
        ));
    } else {
        assert!(value["non_moderator_chat_delay_duration"].is_null());
    }
}
