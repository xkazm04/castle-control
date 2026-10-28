//! Generated simulated EventSub transport fixtures; no live channel or tokens.
use super::{fixtures::*, harness::*};
use crate::{BridgeEvent, BridgeState, Notification};
use serde_json::{Value, json};
use tokio::sync::mpsc;

fn contribution(topic: &str, id: &str) -> Value {
    let mut event = json!({"broadcaster_user_id":BROADCASTER_ID,
        "broadcaster_user_login":"simulated_channel", "user_id":"222",
        "user_login":"simulated_viewer", "bits":250,"type":"cheer",
        "total":50,"is_anonymous":false});
    if topic == "channel.subscribe" {
        event["is_gift"] = json!(false);
    }
    let mut frame = notification(id, event);
    frame["metadata"]["subscription_type"] = json!(topic);
    frame["metadata"]["subscription_version"] = json!("1");
    frame
}
async fn next(rx: &mut mpsc::Receiver<BridgeEvent>) -> Notification {
    loop {
        if let BridgeEvent::Notification(n) = recv(rx).await {
            return n;
        }
    }
}

#[tokio::test]
async fn simulated_beacons_socket_drop_resubscribes_with_same_delivery_identity() {
    let mut h = harness().await;
    h.store_login();
    let bridge = h.configured(vec!["beacons".into()], 300);
    let (sender, mut receiver) = mpsc::channel(128);
    bridge.start(sender);
    let mut ws = h.accept().await;
    send(&mut ws, welcome("simulated-beacons-first")).await;
    until(|| bridge.status().state == BridgeState::Connected).await;
    let initial = h.mock.calls_to("POST", "/helix/eventsub/subscriptions");
    assert!(initial.iter().all(|c| c.json()["type"] != "channel.cheer"));
    assert!(
        initial
            .iter()
            .any(|c| c.json()["type"] == "channel.bits.use")
    );
    for (topic, id, amount, source) in [
        ("channel.subscription.gift", "simulated-gift", 50, "gift"),
        ("channel.bits.use", "simulated-bits", 250, "bits_use"),
    ] {
        send(&mut ws, contribution(topic, id)).await;
        let n = next(&mut receiver).await;
        let normalized = n.contribution().unwrap().unwrap();
        assert_eq!(n.id, id);
        assert_eq!(normalized["contribution"]["event_id"], id);
        assert_eq!(normalized["contribution"]["dedupe_key"], id);
        assert_eq!(normalized["contribution"]["amount"], amount);
        assert_eq!(normalized["contribution"]["source"], source);
    }
    ws.close(None).await.unwrap();
    let mut ws = h.accept().await;
    send(&mut ws, welcome("simulated-beacons-second")).await;
    loop {
        if let BridgeEvent::Gap { from, to } = recv(&mut receiver).await {
            assert!(from <= to);
            break;
        }
    }
    until(|| bridge.status().state == BridgeState::Connected).await;
    let after = h.mock.calls_to("POST", "/helix/eventsub/subscriptions");
    assert_eq!(after.len(), initial.len() * 2);
    for call in &initial {
        let mut expected = call.json();
        expected["transport"]["session_id"] = json!("simulated-beacons-second");
        assert!(after[initial.len()..].iter().any(|c| c.json() == expected));
    }
    // Bridge's delivery cache also survives the dropped socket; a subsequent
    // fresh event is a barrier proving both duplicate frames were consumed.
    send(
        &mut ws,
        contribution("channel.subscription.gift", "simulated-gift"),
    )
    .await;
    send(&mut ws, contribution("channel.bits.use", "simulated-bits")).await;
    send(&mut ws, contribution("channel.bits.use", "simulated-fresh")).await;
    assert_eq!(next(&mut receiver).await.id, "simulated-fresh");
    assert!(
        tokio::time::timeout(std::time::Duration::from_millis(50), receiver.recv())
            .await
            .is_err()
    );
}

#[test]
fn simulated_parser_normalizes_each_supported_source_and_rejects_bad_data() {
    for (topic, source) in [
        ("channel.subscribe", "subscribe"),
        ("channel.subscription.message", "resub"),
        ("channel.subscription.gift", "gift"),
        ("channel.bits.use", "bits_use"),
    ] {
        let frame =
            crate::wire::parse_frame(&contribution(topic, "simulated-id").to_string()).unwrap();
        let crate::wire::Frame::Notification {
            id,
            at,
            kind,
            event,
        } = frame
        else {
            panic!("notification");
        };
        let mut n = Notification {
            id,
            at,
            subscription_type: kind,
            event,
            chat: None,
        };
        assert_eq!(
            n.contribution().unwrap().unwrap()["contribution"]["source"],
            source
        );
        n.id.clear();
        assert!(n.contribution().is_err());
    }
}
