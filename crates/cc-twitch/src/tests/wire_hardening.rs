//! Wire-door hardening: simulated frames only, no real chat or credentials.
use super::{fixtures::*, harness::*, moderation_fixtures::fixtures};
use crate::store::CredentialStore;
use crate::wire::{Frame, parse_frame};
use crate::{BridgeEvent, BridgeState};
use serde_json::json;
use std::sync::atomic::Ordering;
use std::time::Duration;
use tokio::sync::mpsc;

#[test]
fn huge_keepalive_timeout_is_clamped_at_the_wire_door() {
    for (given, want) in [
        (u64::MAX, 600),
        (u64::from(u32::MAX) + 1, 600),
        (601, 600),
        (0, 1),
        (30, 30),
    ] {
        let frame = envelope(
            "session_welcome",
            "simulated-welcome",
            json!({"session": {"id": "S1", "keepalive_timeout_seconds": given}}),
        );
        let Frame::Welcome { keepalive_s, .. } =
            parse_frame(&frame.to_string()).expect("simulated welcome")
        else {
            panic!("welcome expected")
        };
        assert_eq!(keepalive_s, want);
    }
}

#[tokio::test]
async fn non_auth_revocation_keeps_the_login_and_does_not_purge() {
    let mut h = harness().await;
    let (p, mut ws, _rx) = h.connected().await;
    send(
        &mut ws,
        envelope(
            "revocation",
            "simulated-user-removed",
            json!({"subscription": {"status": "user_removed"}}),
        ),
    )
    .await;
    until(|| p.status().state == BridgeState::Error).await;
    assert_eq!(h.purge.started.load(Ordering::SeqCst), 0);
    assert!(h.store.load().expect("store").is_some());
    let detail = format!("{:?}", p.status());
    assert!(!detail.to_lowercase().contains("login expired"), "{detail}");
}

#[tokio::test]
async fn unparseable_moderation_frame_is_quarantined_without_a_gap() {
    let mut h = harness().await;
    h.store_login();
    let p = h.configured(vec!["gatehouse".into()], 300);
    let (tx, mut rx) = mpsc::channel(128);
    p.start(tx);
    let mut ws = h.accept().await;
    send(&mut ws, welcome("S1")).await;
    until(|| p.status().state == BridgeState::Connected).await;
    let (_, _, mut event) = fixtures()
        .into_iter()
        .find(|(kind, _, _)| *kind == "channel.moderate")
        .expect("moderate fixture");
    event["action"] = json!("unknown_future_action");
    let mut bad = envelope("notification", "simulated-bad", json!({"event": event}));
    bad["metadata"]["subscription_type"] = json!("channel.moderate");
    bad["metadata"]["subscription_version"] = json!("2");
    send(&mut ws, bad).await;
    send(
        &mut ws,
        notification(
            "n1",
            chat_event("200", "SimulatedMod", "m1", "simulated after", json!([])),
        ),
    )
    .await;
    assert_eq!(chat(&mut rx).await.id, "m1");
    assert_eq!(p.status().state, BridgeState::Connected);
    while let Ok(Some(event)) = tokio::time::timeout(Duration::from_millis(50), rx.recv()).await {
        assert!(!matches!(event, BridgeEvent::Gap { .. }));
    }
}
