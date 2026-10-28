use super::support::*;
use cc_gatehouse::{Classifier, ClassifierError};
use cc_types::EventKind;
use serde_json::json;
use std::{sync::Arc, time::Duration};
use tokio::sync::{Notify, broadcast};

struct SlowEngine {
    entered: Arc<Notify>,
    release: Arc<Notify>,
}
#[async_trait::async_trait]
impl Classifier for SlowEngine {
    async fn classify(&self, _: &str, _: &str) -> Result<String, ClassifierError> {
        self.entered.notify_one();
        self.release.notified().await;
        Ok("[]".into())
    }
}

#[tokio::test]
async fn slow_verdict_lane_cannot_block_ingress_and_overflow_records_a_gap() {
    let h = Harness::new().await;
    h.draw().await;
    rpc(
        &h.app,
        "gatehouse.rules.upsert",
        json!({"rule":rule("classifier")}),
    )
    .await;
    let entered = Arc::new(Notify::new());
    let release = Arc::new(Notify::new());
    let (sender, receiver) = broadcast::channel(2);
    let worker = h
        .pipeline()
        .start(
            Some(receiver),
            Arc::new(SlowEngine {
                entered: entered.clone(),
                release: release.clone(),
            }),
        )
        .unwrap();
    sender.send(chat(1, "simulated !join")).unwrap();
    tokio::time::timeout(Duration::from_secs(2), entered.notified())
        .await
        .unwrap();
    // The model remains blocked throughout this burst. A non-yielding sender
    // returns immediately, memory stays bounded, and lag is explicit afterwards.
    for user in 2..=100 {
        sender.send(chat(user, "simulated !join")).unwrap();
    }
    assert!(!worker.is_finished());
    release.notify_one();
    wait_for(&h.app, EventKind::BridgeGap, 1).await;
    release.notify_one();
    // The last two retained messages may each enter the classifier.
    tokio::time::sleep(Duration::from_millis(20)).await;
    release.notify_one();
    drop(sender);
    tokio::time::timeout(Duration::from_secs(5), worker)
        .await
        .unwrap()
        .unwrap()
        .unwrap();
    let count = h
        .app
        .events
        .since(0)
        .unwrap()
        .iter()
        .filter(|event| event.kind == EventKind::Decision)
        .count();
    assert_eq!(count, 3);
    drop(h.app);
    drop(h.services);
    tokio::task::yield_now().await;
    let store = cc_store::Store::open(h.root.path().join("gatehouse/store")).unwrap();
    let recordings = store.items(cc_store::DataStore::Recordings).unwrap();
    assert!(
        recordings.iter().any(
            |item| item.content.contains("live-shadow") && item.content.contains("\"gaps\":[{")
        )
    );
}
