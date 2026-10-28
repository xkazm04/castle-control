//! Generated simulated Twitch fixtures, never real chat or credentials.
use super::*;
use crate::{EventHub, Registry, forward_bridge_event, integration::intake::forward_contribution};
use cc_beacons::intake::{ContributionUnit, unit};
use cc_twitch::{BridgeEvent, Notification};
use cc_types::{ContributionSource, EventKind, parse_request};
use serde_json::json;
use std::sync::Arc;
use tokio::sync::broadcast;

fn notification(kind: &str, id: &str, amount: u32) -> Notification {
    let mut event = json!({"broadcaster_user_id":"111", "broadcaster_user_login":"simulated_channel",
        "user_id":"222", "user_login":"simulated_viewer", "user_name":"Simulated Viewer"});
    match kind {
        "channel.subscription.gift" => {
            event["total"] = json!(amount);
            event["is_anonymous"] = json!(false);
            event["cumulative_total"] = json!(500);
        }
        "channel.subscribe" => {
            event["is_gift"] = json!(false);
        }
        "channel.bits.use" => {
            event["bits"] = json!(amount);
            event["type"] = json!("cheer");
            event["message"] = json!({"text":"simulated discarded text"});
        }
        _ => {}
    }
    Notification {
        id: id.into(),
        at: cc_types::Timestamp::now().into(),
        subscription_type: kind.into(),
        event,
        chat: None,
    }
}

async fn rpc(registry: &Registry, method: &str, params: Value) -> Value {
    let request =
        parse_request(&serde_json::to_vec(&json!({"method":method,"params":params})).unwrap())
            .unwrap();
    registry.dispatch(&request).await.unwrap()
}

async fn wait(events: &EventHub, kind: EventKind, count: usize) {
    tokio::time::timeout(std::time::Duration::from_secs(5), async {
        loop {
            if events
                .since(0)
                .unwrap()
                .iter()
                .filter(|e| e.kind == kind)
                .count()
                >= count
            {
                break;
            }
            tokio::task::yield_now().await;
        }
    })
    .await
    .unwrap();
}

#[tokio::test]
async fn simulated_gift_bomb_and_bits_reach_shared_store_without_curve_changes() {
    let root = tempfile::tempdir().unwrap();
    let events = Arc::new(EventHub::new(64).unwrap());
    let registry = Registry::with_fixture_root(root.path(), events.clone()).unwrap();
    assert!(registry.shadow_pipeline().unwrap().is_none());
    let module = registry.beacons().unwrap();
    assert!(Arc::ptr_eq(&module, &registry.beacons().unwrap()));
    let visual = json!({"visual_id":"simulated-frame", "name":"Simulated frame", "curve":{
        "ranges":[{"total":0,"intensity":0.0},{"total":50,"intensity":1.0}],"decay":{"kind":"none"}}});
    rpc(&registry, "beacons.visual.upsert", json!({"visual":visual})).await;
    let before = rpc(&registry, "beacons.visual.list", json!({})).await;
    let preview_before = rpc(
        &registry,
        "beacons.simulate",
        json!({"visual_id":"simulated-frame",
        "burst":{"source":"gift","amount":25}}),
    )
    .await;
    let (sender, receiver) = broadcast::channel(32);
    let worker = module.start_intake(receiver, events.clone());
    for (kind, id, amount) in [
        ("channel.subscription.gift", "simulated-gift", 50),
        ("channel.bits.use", "simulated-bits", 250),
        ("channel.subscribe", "simulated-sub", 1),
        ("channel.subscription.message", "simulated-resub", 1),
    ] {
        forward_contribution(&sender, &notification(kind, id, amount)).unwrap();
    }
    // Gift recipients do not add another 50 subscriptions.
    let mut recipient = notification("channel.subscribe", "simulated-recipient", 1);
    recipient.event["is_gift"] = json!(true);
    forward_contribution(&sender, &recipient).unwrap();
    forward_contribution(
        &sender,
        &notification("channel.cheer", "simulated-overlap", 250),
    )
    .unwrap();
    wait(&events, EventKind::Contribution, 4).await;
    drop(sender);
    worker.await.unwrap().unwrap();
    let rows = module.contributions().unwrap();
    assert_eq!(rows.len(), 4);
    for (source, amount, expected_unit) in [
        (ContributionSource::Gift, 50, ContributionUnit::Count),
        (ContributionSource::BitsUse, 250, ContributionUnit::Bits),
        (ContributionSource::Subscribe, 1, ContributionUnit::Count),
        (ContributionSource::Resub, 1, ContributionUnit::Count),
    ] {
        let row = rows.iter().find(|row| row.source == source).unwrap();
        assert_eq!(row.amount, amount);
        assert_eq!(unit(row.source), expected_unit);
        assert_eq!(row.dedupe_key, row.event_id.as_str());
    }
    assert_eq!(
        rpc(&registry, "beacons.visual.list", json!({})).await,
        before
    );
    assert_eq!(
        rpc(
            &registry,
            "beacons.simulate",
            json!({"visual_id":"simulated-frame",
        "burst":{"source":"gift","amount":25}})
        )
        .await,
        preview_before
    );
    assert!(
        events
            .since(0)
            .unwrap()
            .iter()
            .all(|e| e.kind != EventKind::Intensity)
    );
    drop(module);
    drop(registry);
    let reopened = BeaconsModule::open(root.path().join("beacons")).unwrap();
    assert_eq!(reopened.contributions().unwrap(), rows);
    let records = reopened
        .state
        .lock()
        .unwrap()
        ._store
        .items(cc_store::DataStore::Recordings)
        .unwrap();
    assert!(
        records
            .iter()
            .all(|item| !item.content.contains("simulated discarded text"))
    );
}

#[tokio::test]
async fn simulated_redelivery_and_gap_count_once_even_after_restart() {
    let root = tempfile::tempdir().unwrap();
    let events = Arc::new(EventHub::new(64).unwrap());
    let module = Arc::new(BeaconsModule::open(root.path()).unwrap());
    let (sender, receiver) = broadcast::channel(32);
    let worker = module.start_intake(receiver, events.clone());
    for _ in 0..2 {
        forward_contribution(
            &sender,
            &notification("channel.subscription.gift", "simulated-gift", 50),
        )
        .unwrap();
        forward_contribution(
            &sender,
            &notification("channel.bits.use", "simulated-bits", 100),
        )
        .unwrap();
        forward_bridge_event(
            &events,
            &BridgeEvent::Gap {
                from: "2026-10-28T07:00:00Z".into(),
                to: "2026-10-28T07:01:00Z".into(),
            },
        )
        .unwrap();
    }
    drop(sender);
    worker.await.unwrap().unwrap();
    assert_eq!(module.contributions().unwrap().len(), 2);
    assert_eq!(
        events
            .since(0)
            .unwrap()
            .iter()
            .filter(|e| e.kind == EventKind::Contribution)
            .count(),
        2
    );
    assert_eq!(
        events
            .since(0)
            .unwrap()
            .iter()
            .filter(|e| e.kind == EventKind::BridgeGap)
            .count(),
        2
    );
    drop(module);
    let module = BeaconsModule::open(root.path()).unwrap();
    for (topic, id) in [
        ("channel.subscription.gift", "simulated-gift"),
        ("channel.bits.use", "simulated-bits"),
    ] {
        let input = crate::ingress::contribution_ingress(&notification(topic, id, 50))
            .unwrap()
            .unwrap();
        assert!(!module.intake(input).unwrap());
    }
    assert_eq!(module.contributions().unwrap().len(), 2);
}

#[test]
fn simulated_anonymous_gifts_scope_identity_and_revocation() {
    let root = tempfile::tempdir().unwrap();
    let module = BeaconsModule::open(root.path()).unwrap();
    let mut n = notification("channel.subscription.gift", "simulated-anonymous", 50);
    n.event["is_anonymous"] = json!(true);
    n.event["user_id"] = Value::Null;
    n.event["user_login"] = Value::Null;
    let input = crate::ingress::contribution_ingress(&n).unwrap().unwrap();
    assert!(module.intake(input.clone()).unwrap());
    assert!(!module.intake(input.clone()).unwrap());
    n.event["broadcaster_user_id"] = json!("333");
    n.event["broadcaster_user_login"] = json!("simulated_other");
    assert!(
        module
            .intake(crate::ingress::contribution_ingress(&n).unwrap().unwrap())
            .unwrap()
    );
    assert_eq!(module.contributions().unwrap().len(), 2);
    assert!(
        module
            .contributions()
            .unwrap()
            .iter()
            .all(|c| c.user_id.is_none())
    );
    module.purge_live_data().unwrap();
    assert!(module.contributions().unwrap().is_empty());
    assert_eq!(
        module.intake(input).unwrap_err().code,
        ErrorCode::Unauthorized
    );
}

#[test]
fn malformed_simulated_contributions_fail_the_schema_door_without_echoing_payloads() {
    let mut n = notification("channel.bits.use", "simulated-invalid", 50);
    n.event["user_id"] = json!("simulated-private-invalid-id");
    let error = crate::ingress::contribution_ingress(&n).unwrap_err();
    assert!(!format!("{error:?}").contains("simulated-private"));
    n.event["user_id"] = json!("222");
    n.event["bits"] = json!(-1);
    assert!(crate::ingress::contribution_ingress(&n).is_err());
}

#[tokio::test]
async fn native_registry_revocation_purges_the_same_beacons_instance() {
    let root = tempfile::tempdir().unwrap();
    let services = crate::NativeServices::new(
        crate::NativeConfig {
            twitch: cc_twitch::TwitchConfig::default(),
            obs: cc_obs::Config {
                port: 0,
                password_label: "simulated-unused".into(),
            },
            overlay_port: 0,
        },
        cc_store::Store::open(root.path().join("native")).unwrap(),
        Arc::new(|_| panic!("no login in simulated test")),
    )
    .await
    .unwrap();
    let app = services.app_with_data_dir(64, root.path()).unwrap();
    let module = app.registry.beacons().unwrap();
    let input = crate::ingress::contribution_ingress(&notification(
        "channel.subscription.gift",
        "simulated-native-gift",
        50,
    ))
    .unwrap()
    .unwrap();
    assert!(module.intake(input.clone()).unwrap());
    app.registry
        .shadow_pipeline()
        .unwrap()
        .unwrap()
        .revoke()
        .await
        .unwrap();
    assert!(module.contributions().unwrap().is_empty());
    assert_eq!(
        module.intake(input).unwrap_err().code,
        ErrorCode::Unauthorized
    );
}

#[test]
fn simulated_identified_contributions_follow_existing_forget_policy() {
    let root = tempfile::tempdir().unwrap();
    let module = BeaconsModule::open(root.path()).unwrap();
    let input = crate::ingress::contribution_ingress(&notification(
        "channel.bits.use",
        "simulated-forget",
        100,
    ))
    .unwrap()
    .unwrap();
    assert!(module.intake(input).unwrap());
    module
        .state
        .lock()
        .unwrap()
        ._store
        .forget_user("simulated_viewer", cc_store::Timestamp::now())
        .unwrap();
    assert!(module.contributions().unwrap().is_empty());
}
