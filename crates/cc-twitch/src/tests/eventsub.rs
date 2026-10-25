// Adapted from Shadowrunr OS @ 7e4b6f8,
// crates/shadowrunr-daemon/src/platform/twitch/tests.rs.
//! Simulated socket mapping, continuity, reconnect and capacity tests.
use super::{fixtures::*, harness::*, mock::get};
use crate::{BridgeEvent, BridgeState};
use futures::StreamExt;
use serde_json::json;
use std::time::Duration;
use tokio::sync::mpsc;
use tokio_tungstenite::tungstenite::Message;

#[tokio::test]
async fn eventsub_subscribes_and_maps_chat_dropping_the_bots_own() {
    let mut h = harness().await;
    let (p, mut ws, mut rx) = h.connected().await;
    let subs = h.mock.calls_to("POST", "/helix/eventsub/subscriptions");
    assert_eq!(subs.len(), 1);
    assert_eq!(
        subs[0].json(),
        json!({"type": "channel.chat.message", "version": "1",
        "condition": {"broadcaster_user_id": BROADCASTER_ID, "user_id": BOT_ID},
        "transport": {"method": "websocket", "session_id": "S1"}})
    );
    assert!(subs[0].auth == format!("Bearer {ACCESS}"));
    let users = h.mock.calls_to("GET", "/helix/users");
    assert_eq!(get(&users[0].query, "login"), Some("simulated-channel"));
    send(
        &mut ws,
        notification(
            "n0",
            chat_event(BOT_ID, "SimulatedBot", "m0", "simulated own", json!([])),
        ),
    )
    .await;
    let moderator = chat_event(
        "200",
        "SimulatedMod",
        "m1",
        "simulated calm",
        json!([{"set_id": "moderator", "id": "1"}]),
    );
    send(&mut ws, notification("n1", moderator.clone())).await;
    send(&mut ws, notification("n1", moderator)).await;
    send(
        &mut ws,
        notification(
            "n2",
            chat_event(
                "300",
                "SimulatedSub",
                "m2",
                "!vote simulated",
                json!([{"set_id": "subscriber", "id": "2012"}]),
            ),
        ),
    )
    .await;
    let first = chat(&mut rx).await;
    assert_eq!(first.id, "m1");
    assert_eq!(first.text, "simulated calm");
    assert_eq!(first.viewer.id, "200");
    assert!(first.viewer.is_mod);
    assert_eq!(first.viewer.sub_tier, None);
    assert_eq!(first.at, "2026-10-25T12:00:00.000Z");
    let second = chat(&mut rx).await;
    assert_eq!(second.id, "m2");
    assert_eq!(second.text, "!vote simulated");
    assert_eq!(second.viewer.sub_tier, Some(2));
    assert!(!second.viewer.is_mod);
    assert!(
        tokio::time::timeout(Duration::from_millis(50), rx.recv())
            .await
            .is_err()
    );
    assert_eq!(p.status().state, BridgeState::Connected);
}

#[test]
fn badges_map_to_mod_and_tier() {
    use crate::wire::map_chat;
    let event = |badges| {
        chat_event(
            "5",
            "SimulatedViewer",
            "simulated-message",
            "simulated text",
            badges,
        )
    };
    let mapped = |badges| map_chat(&event(badges), BOT_ID, "2026-10-25T12:00:00Z").expect("chat");
    assert!(
        mapped(json!([{"set_id": "broadcaster", "id": "1"}]))
            .viewer
            .is_mod
    );
    assert_eq!(
        mapped(json!([{"set_id": "founder", "id": "0"}]))
            .viewer
            .sub_tier,
        Some(1)
    );
    assert_eq!(
        mapped(json!([{"set_id": "subscriber", "id": "3006"}]))
            .viewer
            .sub_tier,
        Some(3)
    );
    assert!(!mapped(json!([{"set_id": "vip", "id": "1"}])).viewer.is_mod);
    assert!(!mapped(json!([])).viewer.is_mod);
    assert!(map_chat(&event(json!([])), "5", "2026-10-25T12:00:00Z").is_none());
    assert!(
        map_chat(
            &json!({"message": "mod here"}),
            BOT_ID,
            "2026-10-25T12:00:00Z"
        )
        .is_none()
    );
}

#[tokio::test]
async fn session_reconnect_moves_sockets_without_resubscribing() {
    let mut h = harness().await;
    let (p, mut old, mut rx) = h.connected().await;
    let url = format!("{}?reconnect=simulated", h.ws_url);
    send(&mut old, reconnect(&url)).await;
    let mut new = h.accept().await;
    send(
        &mut old,
        notification(
            "old",
            chat_event("400", "SimulatedEarly", "old", "simulated old", json!([])),
        ),
    )
    .await;
    assert_eq!(chat(&mut rx).await.id, "old");
    send(&mut new, welcome("S2")).await;
    assert!(
        tokio::time::timeout(Duration::from_secs(2), old.next())
            .await
            .is_ok()
    );
    send(
        &mut new,
        notification(
            "new",
            chat_event("401", "SimulatedLate", "new", "simulated new", json!([])),
        ),
    )
    .await;
    assert_eq!(chat(&mut rx).await.id, "new");
    assert_eq!(
        h.mock
            .calls_to("POST", "/helix/eventsub/subscriptions")
            .len(),
        1
    );
    assert_eq!(p.status().state, BridgeState::Connected);
    assert!(rx.try_recv().is_err(), "planned handover emitted a gap");
}

#[tokio::test]
async fn a_dropped_socket_reconnects_and_resubscribes() {
    let mut h = harness().await;
    h.store_login();
    let p = h.configured(vec!["gatehouse".into()], 300);
    let (tx, mut rx) = mpsc::channel(128);
    p.start(tx);
    let mut old = h.accept().await;
    send(&mut old, welcome("S1")).await;
    until(|| p.status().state == BridgeState::Connected).await;
    let expected = h.mock.calls_to("POST", "/helix/eventsub/subscriptions");
    assert!(expected.len() > 1);
    drop(old);
    let mut new = h.accept().await;
    send(&mut new, welcome("S9")).await;
    let gap = recv(&mut rx).await;
    let BridgeEvent::Gap { ref from, ref to } = gap else {
        panic!("expected continuity gap");
    };
    let recorded = p.status().last_gap.expect("recorded network-drop gap");
    assert_eq!(&recorded.from, from);
    assert_eq!(&recorded.to, to);
    let from = chrono::DateTime::parse_from_rfc3339(from).expect("gap from");
    let to = chrono::DateTime::parse_from_rfc3339(to).expect("gap to");
    assert!(from <= to);
    assert_eq!(from.offset().local_minus_utc(), 0);
    let wire = serde_json::to_value(gap).expect("gap wire");
    assert_eq!(wire["kind"], "bridge.gap");
    assert_eq!(wire.as_object().expect("gap object").len(), 3);
    until(|| p.status().state == BridgeState::Connected).await;
    let actual = h.mock.calls_to("POST", "/helix/eventsub/subscriptions");
    assert_eq!(actual.len(), expected.len() * 2);
    for (before, after) in expected.iter().zip(actual.iter().skip(expected.len())) {
        let mut before = before.json();
        before["transport"]["session_id"] = json!("S9");
        assert_eq!(before, after.json(), "every subscription must be restored");
    }
    send(
        &mut new,
        notification(
            "back",
            chat_event(
                "402",
                "SimulatedBack",
                "back",
                "simulated return",
                json!([]),
            ),
        ),
    )
    .await;
    assert_eq!(chat(&mut rx).await.id, "back");
}

#[tokio::test]
async fn keepalive_timeout_reconnects_and_ping_does_not_extend_it() {
    let mut h = harness().await;
    let (p, mut old, mut rx) = h.connected().await;
    use futures::SinkExt;
    old.send(Message::Ping(vec![1, 2].into()))
        .await
        .expect("simulated ping");
    assert!(matches!(old.next().await, Some(Ok(Message::Pong(_)))));
    let mut new = h.accept().await;
    send(&mut new, welcome("after-silence")).await;
    assert!(matches!(recv(&mut rx).await, BridgeEvent::Gap { .. }));
    until(|| p.status().state == BridgeState::Connected).await;
}

#[tokio::test]
async fn independent_connections_pack_topics_and_reconnect_only_failed_group() {
    let mut h = harness().await;
    h.store_login();
    let p = h.configured(vec!["gatehouse".into()], 4);
    let (tx, mut rx) = mpsc::channel(128);
    p.start(tx);
    let mut sockets = Vec::new();
    for index in 0..3 {
        let mut ws = h.accept().await;
        send(&mut ws, welcome(&format!("group-{index}"))).await;
        sockets.push(ws);
    }
    until(|| p.status().state == BridgeState::Connected).await;
    let statuses = p.connections();
    assert_eq!(statuses.len(), 3);
    assert_eq!(statuses.iter().map(|s| s.subscriptions).sum::<usize>(), 11);
    let expected = h.mock.calls_to("POST", "/helix/eventsub/subscriptions");
    let count = expected
        .iter()
        .filter(|c| c.json()["transport"]["session_id"] == "group-0")
        .count();
    drop(sockets.remove(0));
    let mut recovered = h.accept().await;
    send(&mut recovered, welcome("recovered")).await;
    assert!(matches!(recv(&mut rx).await, BridgeEvent::Gap { .. }));
    until(|| p.status().state == BridgeState::Connected).await;
    assert_eq!(
        h.mock
            .calls_to("POST", "/helix/eventsub/subscriptions")
            .len(),
        expected.len() + count
    );
    assert!(
        p.connections()
            .iter()
            .all(|s| s.state == BridgeState::Connected)
    );
}

#[test]
fn subscription_registry_covers_modules_versions_and_capacity() {
    use crate::scopes::{Actor, MODULE_SCOPES, module_plan, pack};
    assert_eq!(
        MODULE_SCOPES.iter().map(|r| r.module).collect::<Vec<_>>(),
        ["core", "gatehouse", "lots", "beacons", "maproom", "steward"]
    );
    let modules: Vec<_> = MODULE_SCOPES.iter().map(|row| row.module.into()).collect();
    let (_, topics) = module_plan(&modules).expect("module plan");
    for name in [
        "automod.message.hold",
        "channel.moderate",
        "channel.hype_train.progress",
        "channel.channel_points_automatic_reward_redemption.add",
    ] {
        assert!(
            topics
                .iter()
                .any(|topic| topic.name == name && topic.version == "2")
        );
    }
    assert_eq!(
        topics
            .iter()
            .filter(|t| t.name == "channel.channel_points_custom_reward_redemption.add")
            .count(),
        1
    );
    assert!(
        !topics
            .iter()
            .any(|topic| topic.name == "extension.bits_transaction.create")
    );
    let topic = topics[0];
    assert_eq!(
        pack(&vec![topic; 601], 300)
            .expect("packed")
            .iter()
            .map(Vec::len)
            .collect::<Vec<_>>(),
        [300, 300, 1]
    );
    assert!(pack(&vec![topic; 901], 300).is_err());
    assert!(pack(&[topic], 0).is_err());
    assert!(module_plan(&["unknown".into()]).is_err());
    let shield = topics
        .iter()
        .find(|t| t.name == "channel.shield_mode.begin")
        .expect("shield");
    assert_eq!(shield.actor, Actor::Moderator);
    assert_eq!(
        shield.condition("111", "999"),
        json!({"broadcaster_user_id": "111", "moderator_user_id": "999"})
    );
}

#[tokio::test]
async fn malformed_subscription_response_never_marks_connection_live() {
    let mut h = harness().await;
    h.store_login();
    h.mock
        .malformed_subscription
        .store(true, std::sync::atomic::Ordering::SeqCst);
    let p = h.platform();
    let (tx, _rx) = mpsc::channel(16);
    p.start(tx);
    let mut ws = h.accept().await;
    send(&mut ws, welcome("malformed")).await;
    until(|| p.status().state == BridgeState::Error).await;
    assert!(
        p.connections()
            .iter()
            .all(|connection| connection.state == BridgeState::Error)
    );
}
