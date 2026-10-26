//! Generated, simulated data only. No Twitch, keychain, or real chat.
use super::{harness::harness, moderation_fixtures::fixtures, spike_checks as check};
use crate::moderation::{AutoModStatus, BanEvasionEvaluation, LowTrustStatus, SuspicionType};
use crate::{BridgeError, moderation::ModerationNotification as N};
use reqwest::Method;
use serde_json::{Value, json};
use std::sync::atomic::Ordering;

#[test]
fn fixture_automod_hold_v2() {
    let (_, _, mut value) = fixtures()[0].clone();
    check::hold(&value);
    let N::AutoModHold(parsed) = check::event("automod.message.hold", "2", &value) else {
        panic!("hold")
    };
    assert_eq!(parsed.held_at.to_rfc3339(), "2026-10-26T12:00:00+00:00");
    let crate::moderation::HoldReason::Automod { automod } = parsed.reason else {
        panic!("automod reason")
    };
    assert_eq!(automod.category, "aggression");
    assert_eq!(automod.level, 2);
    assert_eq!(
        automod.boundaries,
        [crate::moderation::Boundary {
            start_pos: 0,
            end_pos: 8
        }]
    );
    value["reason"] = json!("blocked_term");
    value["automod"] = Value::Null;
    value["blocked_term"] = json!({"terms_found": [{"term_id": "simulated-term",
        "boundary": {"start_pos": 0, "end_pos": 8},
        "owner_broadcaster_user_id": "111", "owner_broadcaster_user_login": "simulated_channel",
        "owner_broadcaster_user_name": "SimulatedChannel"}]});
    check::hold(&value);
    let mut wrong = value.clone();
    wrong["blocked_term"]["terms_found"][0]
        .as_object_mut()
        .expect("term")
        .remove("boundary");
    wrong["blocked_term"]["terms_found"][0]["boundaries"] = json!([]);
    assert!(
        crate::moderation::parse_notification("automod.message.hold", Some("2"), &wrong).is_err()
    );
    value.as_object_mut().expect("hold").remove("held_at");
    assert!(
        crate::moderation::parse_notification("automod.message.hold", Some("2"), &value).is_err()
    );
}

#[test]
fn fixture_warning_nullable_and_source_provenance() {
    for (reason, rules) in [
        (Value::Null, json!(["simulated rule"])),
        (json!("simulated reason"), Value::Null),
        (Value::Null, Value::Null),
    ] {
        let mut value = super::moderation_fixtures::actor();
        value["action"] = json!("warn");
        value["warn"] = json!({"user_id": "222", "user_login": "simulated_viewer",
            "user_name": "SimulatedViewer", "reason": reason, "chat_rules_cited": rules});
        value["source_broadcaster_user_id"] = json!("333");
        value["source_broadcaster_user_login"] = json!("simulated_source");
        value["source_broadcaster_user_name"] = json!("SimulatedSource");
        check::moderate(&value);
        let N::Moderate(parsed) = check::event("channel.moderate", "2", &value) else {
            panic!("moderate")
        };
        let crate::moderation::ModerationAction::Warn { warn } = parsed.action else {
            panic!("warn")
        };
        assert_eq!(warn.reason.is_none(), reason.is_null());
        assert_eq!(warn.chat_rules_cited.is_none(), rules.is_null());
        let mut frame =
            super::fixtures::envelope("notification", "simulated-source", json!({"event": value}));
        frame["metadata"]["subscription_type"] = json!("channel.moderate");
        frame["metadata"]["subscription_version"] = json!("2");
        let crate::wire::Frame::Notification { event, .. } =
            crate::wire::parse_frame(&frame.to_string()).expect("wire")
        else {
            panic!("notification")
        };
        assert_eq!(event, value);
    }
}

#[test]
fn fixture_chat_delay_restore_shape() {
    check::delay(&json!({"non_moderator_chat_delay": false}));
    check::delay(
        &json!({"non_moderator_chat_delay": false, "non_moderator_chat_delay_duration": null}),
    );
    for seconds in [2, 4, 6] {
        check::delay(
            &json!({"non_moderator_chat_delay": true, "non_moderator_chat_delay_duration": seconds}),
        );
    }
    assert!(
        std::panic::catch_unwind(|| check::delay(&json!({"non_moderator_chat_delay": true,
        "non_moderator_chat_delay_duration": 3})))
        .is_err()
    );
}

#[test]
fn fixture_automod_update_v2() {
    let (_, _, mut value) = fixtures()[1].clone();
    for (status, expected) in [
        ("Approved", AutoModStatus::Approved),
        ("Denied", AutoModStatus::Denied),
        ("Expired", AutoModStatus::Expired),
    ] {
        value["status"] = json!(status);
        if status == "Expired" {
            for field in [
                "moderator_user_id",
                "moderator_user_login",
                "moderator_user_name",
            ] {
                value[field] = json!("");
            }
        }
        check::update(&value);
        let N::AutoModUpdate(parsed) = check::event("automod.message.update", "2", &value) else {
            panic!("update")
        };
        assert_eq!(parsed.status, expected);
        assert!(parsed.reason.is_none() && parsed.held_at.is_none());
        assert!(parsed.automod.is_none() && parsed.blocked_term.is_none());
    }
    let hold = &fixtures()[0].2;
    for field in ["held_at", "reason", "automod", "blocked_term"] {
        value[field] = hold[field].clone();
    }
    check::update(&value);
    value["held_at"] = json!("invalid");
    assert!(
        crate::moderation::parse_notification("automod.message.update", Some("2"), &value).is_err()
    );
}

#[test]
fn fixture_suspicious_v1() {
    let (_, _, mut value) = fixtures()[3].clone();
    for (status, expected) in [
        ("none", LowTrustStatus::None),
        ("active_monitoring", LowTrustStatus::ActiveMonitoring),
        ("restricted", LowTrustStatus::Restricted),
    ] {
        value["low_trust_status"] = json!(status);
        for (evaluation, expected_evaluation) in [
            ("unknown", BanEvasionEvaluation::Unknown),
            ("possible", BanEvasionEvaluation::Possible),
            ("likely", BanEvasionEvaluation::Likely),
        ] {
            value["ban_evasion_evaluation"] = json!(evaluation);
            value["message"]["fragments"] = json!([
                {"type": "text", "text": "simulated"}, {"type": "emote", "text": "simulated"},
                {"type": "cheermote", "text": "simulated"}]);
            check::suspicious(&value);
            let N::SuspiciousMessage(parsed) =
                check::event("channel.suspicious_user.message", "1", &value)
            else {
                panic!("suspicious")
            };
            assert_eq!(parsed.low_trust_status, expected);
            assert_eq!(parsed.ban_evasion_evaluation, expected_evaluation);
            assert_eq!(
                parsed.types,
                [
                    SuspicionType::ManuallyAdded,
                    SuspicionType::BanEvader,
                    SuspicionType::SharedChannelBan
                ]
            );
            assert_eq!(parsed.message.content.fragments.len(), 3);
        }
    }
    value["message_id"] = json!("simulated-wrong-level");
    value["message"]
        .as_object_mut()
        .expect("message")
        .remove("message_id");
    assert!(
        crate::moderation::parse_notification("channel.suspicious_user.message", Some("1"), &value)
            .is_err()
    );
}

#[test]
fn fixture_shield_timestamps() {
    for index in [4, 5] {
        let (kind, _, mut value) = fixtures()[index].clone();
        check::shield(kind, &value);
        let field = if index == 4 { "started_at" } else { "ended_at" };
        let wrong = if index == 4 { "ended_at" } else { "started_at" };
        value[wrong] = value[field].clone();
        value.as_object_mut().expect("shield").remove(field);
        assert!(crate::moderation::parse_notification(kind, Some("1"), &value).is_err());
    }
}

#[tokio::test]
async fn fixture_helix_success_shapes() {
    let h = harness().await;
    h.store_login();
    let p = h.platform();
    assert!(p.vault.load().await.expect("simulated load"));
    for (method, path, body) in [
        (
            Method::POST,
            "/moderation/warnings",
            json!({"data": {"user_id": "222", "reason": "simulated"}}),
        ),
        (
            Method::PUT,
            "/moderation/shield_mode",
            json!({"is_active": true}),
        ),
        (
            Method::PATCH,
            "/chat/settings",
            json!({"non_moderator_chat_delay": false}),
        ),
        (
            Method::PATCH,
            "/chat/settings",
            json!({"non_moderator_chat_delay": true, "non_moderator_chat_delay_duration": 6}),
        ),
    ] {
        let value: Value = p
            .vault
            .call(method, path, &[], Some(body))
            .await
            .expect("simulated response");
        check::response(path, &value);
    }
    // 204 is normalized by the existing broker to an empty JSON object.
    let empty: Value = p
        .vault
        .call(
            Method::POST,
            "/moderation/automod/message",
            &[],
            Some(json!({"user_id": "999", "msg_id": "simulated-message", "action": "allow"})),
        )
        .await
        .expect("simulated 204");
    assert_eq!(empty, json!({}));
}

#[tokio::test]
async fn fixture_warning_reason_limit() {
    let mut h = harness().await;
    let (p, _ws, _rx) = h.connected().await;
    for count in [499, 500, 501] {
        p.warn("222", &"é".repeat(count))
            .await
            .expect("simulated warning");
        let calls = h.mock.calls_to("POST", "/helix/moderation/warnings");
        let body = calls.last().expect("warning call").json();
        assert_eq!(
            body["data"]["reason"]
                .as_str()
                .expect("reason")
                .chars()
                .count(),
            count.min(500)
        );
    }
    let before = h.mock.calls_to("POST", "/helix/moderation/warnings").len();
    assert!(p.warn("222", " ").await.is_err());
    assert_eq!(
        h.mock.calls_to("POST", "/helix/moderation/warnings").len(),
        before
    );
}

#[tokio::test]
async fn fixture_rate_headers() {
    for use_reset in [true, false] {
        let h = harness().await;
        h.store_login();
        let p = h.platform();
        p.vault.load().await.expect("simulated load");
        h.mock.rate_limit.store(true, Ordering::SeqCst);
        h.mock.omit_reset.store(!use_reset, Ordering::SeqCst);
        h.mock.retry_after_s.store(7, Ordering::SeqCst);
        let reset = chrono::Utc::now().timestamp() + 30;
        h.mock.reset_at_s.store(reset, Ordering::SeqCst);
        let before = chrono::Utc::now().timestamp();
        let result: Result<Value, _> = p.vault.call(Method::GET, "/users", &[], None).await;
        assert!(
            matches!(result, Err(BridgeError::RateLimited { retry_after_ms }) if retry_after_ms > 0)
        );
        let rate = p.rate_limit().await;
        let observed = rate.reset_at_s.expect("reset or Retry-After deadline");
        if use_reset {
            assert_eq!(observed, reset);
        } else {
            assert!((before + 7..=chrono::Utc::now().timestamp() + 7).contains(&observed));
        }
        assert_eq!(h.mock.calls_to("GET", "/helix/users").len(), 1);
    }
}
