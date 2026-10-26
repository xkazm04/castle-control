//! Offline schema tests: valid synthetic events and refused enum/version drift.
use super::moderation_fixtures::fixtures;
use crate::moderation::{ModerationNotification, parse_notification};
use serde_json::json;

#[test]
fn each_moderation_notification_parses_to_a_typed_variant() {
    for (kind, version, event) in fixtures() {
        let parsed = parse_notification(kind, Some(version), &event)
            .expect("simulated schema")
            .expect("moderation notification");
        match (kind, parsed) {
            ("automod.message.hold", ModerationNotification::AutoModHold(e)) => {
                assert_eq!(e.message_id, "simulated-message");
                assert_eq!(e.message.text, "simulated text");
            }
            ("automod.message.update", ModerationNotification::AutoModUpdate(e)) => {
                assert_eq!(e.moderator.moderator_user_id, "999");
            }
            ("channel.moderate", ModerationNotification::Moderate(e)) => {
                assert_eq!(e.moderator.moderator_user_id, "999");
            }
            ("channel.suspicious_user.message", ModerationNotification::SuspiciousMessage(e)) => {
                assert_eq!(e.shared_ban_channel_ids, ["333"]);
                assert_eq!(e.message.message_id, "simulated-message");
            }
            ("channel.shield_mode.begin", ModerationNotification::ShieldBegin(e)) => {
                assert_eq!(e.broadcaster.broadcaster_user_id, "111");
            }
            ("channel.shield_mode.end", ModerationNotification::ShieldEnd(e)) => {
                assert_eq!(e.moderator.moderator_user_id, "999");
            }
            _ => panic!("wrong typed notification"),
        }
    }
}

#[test]
fn unknown_enum_values_versions_and_malformed_payloads_are_refused() {
    let fields = ["reason", "status", "action", "low_trust_status"];
    for ((kind, version, event), field) in fixtures().into_iter().zip(fields) {
        let mut bad = event.clone();
        bad[field] = json!("unknown_future_value");
        assert!(parse_notification(kind, Some(version), &bad).is_err());
    }
    for (kind, version, event) in fixtures() {
        assert!(parse_notification(kind, Some("999"), &event).is_err());
        assert!(parse_notification(kind, None, &event).is_err());
        assert!(parse_notification(kind, Some(version), &json!({})).is_err());
    }
    assert!(
        parse_notification("channel.cheer", Some("1"), &json!({}))
            .expect("unrelated notification")
            .is_none()
    );
}

#[test]
fn nested_unknown_enums_and_bad_timestamps_are_refused() {
    let all = fixtures();
    for (index, field, value) in [
        (3, "types", json!(["future_type"])),
        (3, "ban_evasion_evaluation", json!("future_evaluation")),
        (4, "started_at", json!("invalid")),
        (5, "ended_at", json!("invalid")),
    ] {
        let (kind, version, mut event) = all[index].clone();
        event[field] = value;
        assert!(parse_notification(kind, Some(version), &event).is_err());
    }
    let (kind, version, mut event) = all[0].clone();
    event["message"]["fragments"][0]["type"] = json!("future_fragment");
    assert!(parse_notification(kind, Some(version), &event).is_err());
}

#[test]
fn blocked_term_hold_and_update_enrichments_are_typed() {
    let (kind, version, mut event) = fixtures()[0].clone();
    event["reason"] = json!("blocked_term");
    event["automod"] = serde_json::Value::Null;
    event["blocked_term"] = json!({"terms_found": [{"term_id": "simulated-term",
        "boundary": {"start_pos": 0, "end_pos": 8},
        "owner_broadcaster_user_id": "111", "owner_broadcaster_user_login": "simulated_channel",
        "owner_broadcaster_user_name": "SimulatedChannel"}]});
    assert!(matches!(
        parse_notification(kind, Some(version), &event).expect("blocked term"),
        Some(ModerationNotification::AutoModHold(
            crate::moderation::AutoModHold {
                reason: crate::moderation::HoldReason::BlockedTerm { .. },
                ..
            }
        ))
    ));
    event["blocked_term"] = serde_json::Value::Null;
    assert!(parse_notification(kind, Some(version), &event).is_err());
    let (kind, version, mut event) = fixtures()[1].clone();
    for status in ["Approved", "Denied", "Expired"] {
        event["status"] = json!(status);
        assert!(parse_notification(kind, Some(version), &event).is_ok());
    }
    event["reason"] = json!("future_reason");
    assert!(parse_notification(kind, Some(version), &event).is_err());
}

#[tokio::test]
async fn wire_boundary_delivers_typed_notifications_without_a_live_gate() {
    use super::{fixtures::envelope, harness::*};
    use crate::{BridgeEvent, scopes::module_plan, wire::parse_frame};
    let h = harness().await;
    let p = h.platform();
    let (tx, mut rx) = tokio::sync::mpsc::channel(16);
    *p.inbox.lock().expect("inbox") = Some(tx);
    let (_, topics) = module_plan(&["gatehouse".into()]).expect("gatehouse topics");
    for (index, (kind, version, event)) in fixtures().into_iter().enumerate() {
        let mut wire = envelope(
            "notification",
            &format!("simulated-{index}"),
            json!({"event": event}),
        );
        wire["metadata"]["subscription_type"] = json!(kind);
        wire["metadata"]["subscription_version"] = json!(version);
        let frame = parse_frame(&wire.to_string()).expect("wire schema");
        p.deliver(frame, &topics).await.expect("typed delivery");
        let BridgeEvent::Notification(notification) = recv(&mut rx).await else {
            panic!("notification expected");
        };
        assert_eq!(notification.subscription_type, kind);
        assert_eq!(notification.event, event);
        assert!(notification.moderation().expect("typed view").is_some());
        assert!(notification.chat.is_none());
        wire["metadata"]["subscription_version"] = json!("future");
        assert!(parse_frame(&wire.to_string()).is_err());
    }
}
