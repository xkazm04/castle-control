mod pressure;
mod safety;
mod support;
use cc_core::{AppState, Registry, live::RulesOnly};
use cc_store::{DecisionAction, LedgerEvent, LedgerKind, Store};
use cc_types::{EventKind, parse_request};
use serde_json::json;
use std::sync::Arc;
use support::*;
use tokio::sync::broadcast;

#[tokio::test]
async fn native_rpc_and_fake_bridge_share_persistent_modules_and_real_time() {
    let h = Harness::new().await;
    h.draw().await;
    rpc(
        &h.app,
        "gatehouse.rules.upsert",
        json!({"rule":rule("pattern")}),
    )
    .await;
    let (sender, receiver) = broadcast::channel(256);
    let worker = h
        .pipeline()
        .start(Some(receiver), Arc::new(RulesOnly))
        .unwrap();
    sender.send(chat(1, "simulated !join")).unwrap();
    sender.send(chat(2, "simulated tagged !join")).unwrap();
    sender.send(chat(3, "simulated !joining")).unwrap();
    drop(sender);
    worker.await.unwrap().unwrap();
    let entry = rpc(
        &h.app,
        "lots.roll.lookup",
        json!({"draw_id":"simulated-draw","user_id":"1"}),
    )
    .await;
    assert_eq!(entry["entry"]["user_id"], "1");
    assert_eq!(entry["entry"]["source_message_id"], "simulated-1");
    assert!(
        rpc(
            &h.app,
            "lots.roll.lookup",
            json!({"draw_id":"simulated-draw","user_id":"3"})
        )
        .await
        .get("entry")
        .is_none()
    );
    wait_for(&h.app, EventKind::Decision, 3).await;
    let events = h.app.events.since(0).unwrap();
    for kind in [
        EventKind::ChatMessage,
        EventKind::Verdict,
        EventKind::Decision,
    ] {
        assert_eq!(events.iter().filter(|event| event.kind == kind).count(), 3);
    }
    // Existing canonical seal time has whole-second resolution. Let this
    // burst's fractional-second entry timestamps precede that cutoff.
    tokio::time::sleep(std::time::Duration::from_secs(1)).await;
    let sealed = rpc(
        &h.app,
        "lots.roll.seal",
        json!({"draw_id":"simulated-draw","source":"streamer_commit","margin_s":1}),
    )
    .await;
    let sealed_at = sealed["sealed"]["roll"]["sealed_at"].as_str().unwrap();
    let sealed_time: chrono::DateTime<chrono::Utc> = sealed_at.parse().unwrap();
    assert!((chrono::Utc::now() - sealed_time).num_seconds() < 5); // Never the fixture's 2023 clock.
    let cast = rpc(
        &h.app,
        "lots.cast",
        json!({"draw_run_id":sealed["draw_run_id"]}),
    )
    .await;
    drop(h.app);
    drop(h.services);
    tokio::task::yield_now().await;
    let store = Store::open(h.root.path().join("gatehouse/store")).unwrap();
    let lines = store.read_ledger(LedgerKind::Decisions).unwrap();
    assert_eq!(lines.len(), 3);
    assert!(lines.iter().any(|line| matches!(
        line.event,
        LedgerEvent::Decision {
            action: DecisionAction::WouldAct,
            ..
        }
    )));
    let audit =
        std::fs::read_to_string(h.root.path().join("gatehouse/store/decisions.jsonl")).unwrap();
    assert!(!audit.contains("simulated !join"));
    assert!(!audit.contains("simulated tagged"));
    drop(store);
    let store = Store::open(h.root.path().join("lots/store")).unwrap();
    let writs = store.items(cc_store::DataStore::Writs).unwrap();
    assert_eq!(writs.len(), 1);
    assert!(!writs[0].simulated);
    assert!(writs[0].content.contains(cast["writ_id"].as_str().unwrap()));
}

#[tokio::test]
async fn no_bridge_starts_nothing_and_fixture_state_stays_lazy() {
    let app = AppState::new(Registry::with_status(), 32).unwrap();
    assert!(app.registry.shadow_pipeline().unwrap().is_none());
    assert!(app.events.since(0).unwrap().is_empty());
    let request = parse_request(br#"{"method":"lots.draw.list","params":{}}"#).unwrap();
    assert_eq!(
        app.registry.dispatch(&request).await.unwrap(),
        json!({"draws":[]})
    );
    let h = Harness::new().await;
    assert!(h.pipeline().start(None, Arc::new(RulesOnly)).is_none());
    assert!(
        h.app
            .events
            .since(0)
            .unwrap()
            .iter()
            .all(|event| event.kind != EventKind::Decision)
    );
}

#[tokio::test]
async fn chart_polling_cannot_stop_a_delayed_live_message_or_its_pool_entry() {
    let h = Harness::new().await;
    h.draw().await;
    let raw = chat(60, "simulated delayed !join");
    tokio::time::sleep(std::time::Duration::from_millis(10)).await;
    let params = json!({"window_s":900,"filter":{"kind":"all"}});
    rpc(&h.app, "gatehouse.consensus.get", params.clone()).await;
    let (sender, receiver) = broadcast::channel(16);
    let worker = h
        .pipeline()
        .start(Some(receiver), Arc::new(RulesOnly))
        .unwrap();
    sender.send(raw).unwrap();
    drop(sender);
    worker.await.unwrap().unwrap();
    let entry = rpc(
        &h.app,
        "lots.roll.lookup",
        json!({"draw_id":"simulated-draw","user_id":"60"}),
    )
    .await;
    assert!(entry.get("entry").is_some());
    let chart = rpc(&h.app, "gatehouse.consensus.get", params).await;
    assert_eq!(chart["directions"][0]["messages"], 1);
}
