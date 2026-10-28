use super::support::*;
use cc_core::live::RulesOnly;
use cc_gatehouse::{GatePath, Gatehouse, IngestedMessage, ScreenedMessage};
use cc_store::{DecisionAction, LedgerEvent, LedgerKind, Store};
use cc_types::{Decision, DecisionId, DecisionKind, Operator, Timestamp, Verdict};
use serde_json::json;
use std::sync::Arc;
use tokio::sync::broadcast;

#[tokio::test]
async fn saved_armed_rule_is_would_act_and_shadow_lane_has_no_moderation_client() {
    let root = tempfile::tempdir().unwrap();
    let mut gate = Gatehouse::open(root.path().join("gatehouse")).unwrap();
    gate.rules_upsert(serde_json::from_value(json!({"rule":rule("pattern")})).unwrap())
        .unwrap();
    gate.rules_set_mode(
        serde_json::from_value(json!({"rule_id":"simulated-rule","mode":"armed",
        "acknowledgement":{"at":Timestamp::now(),"reason":"Simulated standalone seed"}}))
        .unwrap(),
    )
    .unwrap();
    drop(gate);
    let services = services(root.path()).await;
    let app = services.app_with_data_dir(64, root.path()).unwrap();
    let (sender, receiver) = broadcast::channel(16);
    let worker = app
        .registry
        .shadow_pipeline()
        .unwrap()
        .unwrap()
        .start(Some(receiver), Arc::new(RulesOnly))
        .unwrap();
    sender.send(chat(10, "simulated tagged !join")).unwrap();
    drop(sender);
    worker.await.unwrap().unwrap();
    let request = cc_types::parse_request(&serde_json::to_vec(&json!({"method":"gatehouse.rules.setMode","params":{
        "rule_id":"simulated-rule","mode":"armed","acknowledgement":{"at":Timestamp::now(),"reason":"Simulated forbidden arm"}}})).unwrap()).unwrap();
    assert_eq!(
        app.registry.dispatch(&request).await.unwrap_err().code,
        cc_types::ErrorCode::BlockedByPolicy
    );
    drop(app);
    drop(services);
    tokio::task::yield_now().await;
    let store = Store::open(root.path().join("gatehouse/store")).unwrap();
    let lines = store.read_ledger(LedgerKind::Decisions).unwrap();
    assert_eq!(lines.len(), 2);
    assert!(matches!(
        lines[1].event,
        LedgerEvent::Decision {
            action: DecisionAction::WouldAct,
            ..
        }
    ));
    let records = store.items(cc_store::DataStore::Caches).unwrap();
    let record: serde_json::Value = serde_json::from_str(&records[0].content).unwrap();
    assert!(record.get("intent").is_none());
    assert_eq!(record["rule_snapshot"]["mode"], "armed");
    assert_eq!(record["simulated"], false);
    // Architectural regression guard: the consumer's entire source has only
    // domain capabilities, never a bridge/client/vault/executor to invoke.
    for source in [
        include_str!("../../src/live/mod.rs"),
        include_str!("../../src/gatehouse/live.rs"),
    ] {
        for forbidden in [
            "use cc_twitch",
            "Arc<TwitchBridge>",
            "NativeServices",
            ".timeout(",
            ".unban(",
            ".delete(",
            "ModerationClient",
        ] {
            assert!(!source.contains(forbidden));
        }
    }
}

#[tokio::test]
async fn held_crisis_and_rules_only_classifier_never_enter_live_pool() {
    let h = Harness::new().await;
    h.draw().await;
    rpc(
        &h.app,
        "gatehouse.rules.upsert",
        json!({"rule":rule("classifier")}),
    )
    .await;
    let (sender, receiver) = broadcast::channel(16);
    let worker = h
        .pipeline()
        .start(Some(receiver), Arc::new(RulesOnly))
        .unwrap();
    sender
        .send(chat(20, "simulated I want to kill myself !join"))
        .unwrap();
    sender.send(chat(21, "simulated !join")).unwrap();
    drop(sender);
    worker.await.unwrap().unwrap();
    for user in ["20", "21"] {
        assert!(
            rpc(
                &h.app,
                "lots.roll.lookup",
                json!({"draw_id":"simulated-draw","user_id":user})
            )
            .await
            .get("entry")
            .is_none()
        );
    }
    drop(h.app);
    drop(h.services);
    tokio::task::yield_now().await;
    let store = Store::open(h.root.path().join("gatehouse/store")).unwrap();
    assert!(
        store
            .read_ledger(LedgerKind::Decisions)
            .unwrap()
            .iter()
            .all(|line| matches!(
                line.event,
                LedgerEvent::Decision {
                    action: DecisionAction::Held,
                    ..
                }
            ))
    );
    let records = store.items(cc_store::DataStore::Caches).unwrap();
    assert!(
        records
            .iter()
            .any(|item| item.content.contains("rules-only"))
    );
}

#[tokio::test]
async fn held_and_denied_tokens_are_rejected_at_the_lots_boundary() {
    let h = Harness::new().await;
    h.draw().await;
    let lots = h.app.registry.simulated_lots().unwrap();
    for (user, verdict) in [(30, Verdict::Hold), (31, Verdict::Bar)] {
        let raw = chat(user, "simulated !join");
        let message = IngestedMessage {
            message_id: raw.message.id.try_into().unwrap(),
            user_id: cc_store::TwitchUserId::parse(&user.to_string()).unwrap(),
            login: raw.login,
            text: raw.message.text,
            at: raw.message.at.try_into().unwrap(),
            simulated: true,
            metadata: None,
        };
        let facts = cc_lots::MessageFacts {
            message_id: message.message_id.clone(),
            user_id: message.user_id.clone(),
            at: String::from(message.at.clone()).parse().unwrap(),
            text: message.text.clone(),
            follower: false,
            subscriber: false,
            redeemed: false,
            activity_units: 0,
            cohorts: Default::default(),
        };
        let screened = ScreenedMessage {
            decision: Decision {
                decision_id: DecisionId::mint(),
                message_id: message.message_id.clone(),
                kind: DecisionKind::Held,
                verdict,
                rule_id: None,
                operator: Operator::Ai,
                at: message.at.clone(),
                simulated: true,
                reason_codes: vec![],
                message_text: None,
            },
            message,
            intent: None,
            path: GatePath::Withheld,
            reaches_streamer: true,
        };
        lots.intake_screened(&screened, facts).unwrap();
        assert!(
            rpc(
                &h.app,
                "lots.roll.lookup",
                json!({"draw_id":"simulated-draw","user_id":user.to_string()})
            )
            .await
            .get("entry")
            .is_none()
        );
    }
}

#[tokio::test]
async fn revocation_purges_live_stores_and_queued_chat_cannot_repopulate_them() {
    let h = Harness::new().await;
    h.draw().await;
    let pipeline = h.pipeline();
    assert!(Arc::ptr_eq(&pipeline, &h.pipeline()));
    let (sender, receiver) = broadcast::channel(16);
    let worker = pipeline.start(Some(receiver), Arc::new(RulesOnly)).unwrap();
    sender.send(chat(50, "simulated !join")).unwrap();
    wait_for(&h.app, cc_types::EventKind::Roll, 2).await;
    rpc(&h.app, "auth.twitch.revoke", json!({})).await;
    sender.send(chat(51, "simulated !join")).unwrap();
    drop(sender);
    assert_eq!(
        worker.await.unwrap().unwrap_err().code,
        cc_types::ErrorCode::Unauthorized
    );
    drop(pipeline);
    drop(h.app);
    drop(h.services);
    tokio::task::yield_now().await;
    for name in ["gatehouse/store", "lots/store"] {
        let store = Store::open(h.root.path().join(name)).unwrap();
        for kind in cc_store::DataStore::ALL {
            assert!(store.items(kind).unwrap().is_empty());
        }
    }
}
