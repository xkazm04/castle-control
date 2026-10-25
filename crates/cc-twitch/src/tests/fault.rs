//! Fault injection uses simulated loopback servers, credentials and purge counters.
use super::{fixtures::*, harness::*};
use crate::store::CredentialStore;
use crate::{BridgeEvent, BridgeState};
use futures::StreamExt;
use serde_json::json;
use std::{sync::atomic::Ordering, time::Duration};
use tokio::sync::mpsc;

#[tokio::test]
async fn forced_drop_restores_every_subscription_without_retiring_credentials() {
    let mut h = harness().await;
    h.store_login();
    let p = h.configured(vec!["gatehouse".into()], 300);
    let (tx, mut rx) = mpsc::channel(128);
    p.start(tx);
    let mut old = h.accept().await;
    send(&mut old, welcome("before-forced-drop")).await;
    until(|| p.status().state == BridgeState::Connected).await;
    let expected = h.mock.calls_to("POST", "/helix/eventsub/subscriptions");
    assert_eq!(expected.len(), 11);
    assert!(p.status().last_gap.is_none());

    // A second drop proves the signal is reusable and last_gap is replaced.
    for session in ["after-first-drop", "after-second-drop"] {
        p.force_socket_drop();
        let closed = tokio::time::timeout(Duration::from_millis(500), old.next())
            .await
            .expect("forced drop must close the socket before its keepalive expires");
        assert!(!matches!(closed, Some(Ok(_))));
        let mut new = h.accept().await;
        send(&mut new, welcome(session)).await;
        let BridgeEvent::Gap { from, to } = recv(&mut rx).await else {
            panic!("expected forced-drop gap");
        };
        assert!(
            chrono::DateTime::parse_from_rfc3339(&from).expect("gap start")
                <= chrono::DateTime::parse_from_rfc3339(&to).expect("gap end")
        );
        let recorded = p.status().last_gap.expect("recorded gap before delivery");
        assert_eq!(recorded.from, from);
        assert_eq!(recorded.to, to);
        until(|| p.status().state == BridgeState::Connected).await;
        let actual = h.mock.calls_to("POST", "/helix/eventsub/subscriptions");
        let restored: Vec<_> = actual
            .iter()
            .filter(|call| call.json()["transport"]["session_id"] == session)
            .collect();
        assert_eq!(restored.len(), expected.len());
        for (before, after) in expected.iter().zip(restored) {
            let mut before = before.json();
            before["transport"]["session_id"] = json!(session);
            assert_eq!(before, after.json());
        }
        assert!(h.store.load().expect("simulated store").is_some());
        assert!(p.vault.load().await.expect("vault remains active"));
        assert!(!*p.vault.revoked.borrow());
        assert!(h.mock.calls_to("POST", "/oauth2/revoke").is_empty());
        assert_eq!(h.purge.started.load(Ordering::SeqCst), 0);
        assert_eq!(h.purge.completed.load(Ordering::SeqCst), 0);
        p.say("simulated after forced drop")
            .await
            .expect("credentials still authorize calls");
        send(
            &mut new,
            notification(
                session,
                chat_event(
                    "402",
                    "SimulatedReturn",
                    session,
                    "simulated return",
                    json!([]),
                ),
            ),
        )
        .await;
        assert_eq!(chat(&mut rx).await.id, session);
        old = new;
    }

    p.disconnect()
        .await
        .expect("explicit disconnect still retires");
    assert!(h.store.load().expect("simulated store").is_none());
    assert!(*p.vault.revoked.borrow());
    assert_eq!(h.mock.calls_to("POST", "/oauth2/revoke").len(), 1);
    assert_eq!(h.purge.started.load(Ordering::SeqCst), 1);
    assert_eq!(h.purge.completed.load(Ordering::SeqCst), 1);
    assert_eq!(p.status().state, BridgeState::Disconnected);
    assert!(p.status().last_gap.is_none());
}

#[tokio::test]
async fn forced_drop_while_idle_does_not_retire_or_poison_the_next_session() {
    let mut h = harness().await;
    h.store_login();
    let p = h.platform();
    p.force_socket_drop();
    assert!(h.store.load().expect("simulated store").is_some());
    assert_eq!(h.purge.started.load(Ordering::SeqCst), 0);
    let (tx, mut rx) = mpsc::channel(128);
    p.start(tx);
    let mut ws = h.accept().await;
    send(&mut ws, welcome("after-idle-drop")).await;
    until(|| p.status().state == BridgeState::Connected).await;
    assert!(p.status().last_gap.is_none());
    assert!(rx.try_recv().is_err());
}

#[tokio::test]
async fn forced_drop_cancels_all_packed_connections() {
    let mut h = harness().await;
    h.store_login();
    let p = h.configured(vec!["gatehouse".into()], 4);
    let (tx, mut rx) = mpsc::channel(128);
    p.start(tx);
    let mut old = Vec::new();
    for session in ["before-0", "before-1", "before-2"] {
        let mut ws = h.accept().await;
        send(&mut ws, welcome(session)).await;
        old.push(ws);
    }
    until(|| p.status().state == BridgeState::Connected).await;
    let expected = h.mock.calls_to("POST", "/helix/eventsub/subscriptions");
    p.force_socket_drop();
    for mut socket in old {
        let closed = tokio::time::timeout(Duration::from_millis(500), socket.next())
            .await
            .expect("every packed socket must close");
        assert!(!matches!(closed, Some(Ok(_))));
    }
    let mut recovered = Vec::new();
    for session in ["after-0", "after-1", "after-2"] {
        let mut ws = h.accept().await;
        send(&mut ws, welcome(session)).await;
        recovered.push(ws);
    }
    let mut last = None;
    for _ in 0..3 {
        let BridgeEvent::Gap { from, to } = recv(&mut rx).await else {
            panic!("expected one gap per packed connection");
        };
        assert!(from <= to);
        last = Some(crate::ConnectionGap { from, to });
    }
    until(|| p.status().state == BridgeState::Connected).await;
    assert_eq!(p.status().last_gap, last);
    assert!(
        p.connections()
            .iter()
            .all(|c| c.state == BridgeState::Connected)
    );
    let actual = h.mock.calls_to("POST", "/helix/eventsub/subscriptions");
    let without_session = |call: &super::mock::Call| {
        let mut value = call.json();
        value["transport"]["session_id"] = json!("normalized");
        value.to_string()
    };
    let mut before: Vec<_> = expected.iter().map(without_session).collect();
    let mut after: Vec<_> = actual
        .iter()
        .skip(expected.len())
        .map(without_session)
        .collect();
    before.sort();
    after.sort();
    assert_eq!(before, after, "all packed subscriptions must be restored");
    assert_eq!(h.purge.started.load(Ordering::SeqCst), 0);
    assert!(h.store.load().expect("simulated store").is_some());
}
