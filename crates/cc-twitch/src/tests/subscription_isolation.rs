//! A permanently unsubscribable topic is isolated and reported, never a silent stall.
use super::{fixtures::*, harness::*};
use crate::BridgeState;
use tokio::sync::mpsc;

#[tokio::test]
async fn a_forbidden_topic_is_skipped_reported_and_not_retried() {
    let mut h = harness().await;
    h.store_login();
    *h.mock.forbidden_topic.lock().expect("simulated topic") = Some("channel.chat.message".into());
    let p = h.configured(vec!["gatehouse".into()], 300);
    let (tx, _rx) = mpsc::channel(128);
    p.start(tx);
    let mut ws = h.accept().await;
    send(&mut ws, welcome("S1")).await;
    until(|| p.status().state == BridgeState::Connected).await;
    let planned = p.connections()[0].subscriptions;
    let calls = h.mock.calls_to("POST", "/helix/eventsub/subscriptions");
    assert!(planned > 1);
    assert_eq!(calls.len(), planned, "every topic attempted exactly once");
    let detail = p.status().detail.expect("skipped topic is reported");
    assert!(detail.contains("channel.chat.message"), "{detail}");
    assert!(detail.contains("403"), "{detail}");
}
