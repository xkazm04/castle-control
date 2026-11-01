//! A per-item failure is non-fatal: the live worker publishes a gap and keeps
//! screening later chat. Generated simulated ingress only.
#[path = "live_pipeline/support.rs"]
#[allow(dead_code)]
mod support;
use cc_core::live::RulesOnly;
use cc_types::EventKind;
use serde_json::json;
use std::sync::Arc;
use support::*;
use tokio::sync::broadcast;

#[tokio::test]
async fn one_bad_chat_item_does_not_kill_the_live_worker() {
    let h = Harness::new().await;
    h.draw().await;
    let (sender, receiver) = broadcast::channel(16);
    let worker = h
        .pipeline()
        .start(Some(receiver), Arc::new(RulesOnly))
        .unwrap();
    let mut bad = chat(70, "simulated !join");
    bad.login = "not a valid login".into();
    sender.send(bad).unwrap();
    wait_for(&h.app, EventKind::BridgeGap, 1).await;
    sender.send(chat(71, "simulated !join")).unwrap();
    wait_for(&h.app, EventKind::Roll, 2).await;
    let lookup = rpc(
        &h.app,
        "lots.roll.lookup",
        json!({"draw_id":"simulated-draw","user_id":"71"}),
    )
    .await;
    assert!(lookup.get("entry").is_some());
    drop(sender);
    worker.await.unwrap().unwrap();
}
