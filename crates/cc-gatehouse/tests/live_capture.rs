//! Generated shadow messages only; cancellation and legacy evidence must fail honestly.
use async_trait::async_trait;
use cc_gatehouse::{
    Classifier, ClassifierError, Gatehouse, IngestedMessage, live_capture::captures,
};
use cc_store::{DataStore, TwitchUserId};
use cc_types::{DrillConfiguration, DrillRunParams, ErrorCode, Timestamp};
use serde_json::{Value, json};
use std::time::Duration;

struct Pending;
#[async_trait]
impl Classifier for Pending {
    async fn classify(&self, _: &str, _: &str) -> Result<String, ClassifierError> {
        std::future::pending().await
    }
}
struct RulesOnly;
#[async_trait]
impl Classifier for RulesOnly {
    async fn classify(&self, _: &str, _: &str) -> Result<String, ClassifierError> {
        Err(ClassifierError::RulesOnly)
    }
}

#[tokio::test]
async fn cancelled_screening_cannot_attach_a_capture_to_a_later_decision() {
    let root = tempfile::tempdir().unwrap();
    let mut gate = Gatehouse::open(root.path()).unwrap();
    gate.rules_upsert(
        serde_json::from_value(json!({"rule":{
        "rule_id":"simulated-classifier","name":"Simulated classifier","rule_class":"classifier",
        "mode":"shadow","action":"hold","delivery":"streamer","text":"simulated"}}))
        .unwrap(),
    )
    .unwrap();
    let message = IngestedMessage {
        message_id: "simulated-cancelled".to_owned().try_into().unwrap(),
        user_id: TwitchUserId::parse("123").unwrap(),
        login: "simulated_cancel".into(),
        text: "Simulated generated cancellation fixture".into(),
        at: Timestamp::now(),
        simulated: true,
        metadata: None,
    };
    assert!(
        tokio::time::timeout(
            Duration::from_millis(20),
            gate.capture_live_shadow(message.clone(), &Pending, vec![])
        )
        .await
        .is_err()
    );
    assert!(captures(gate.store()).unwrap().is_empty());
    gate.screen_batch(vec![message], &RulesOnly).await.unwrap();
    assert!(captures(gate.store()).unwrap().is_empty());
    let caches = gate.store().items(DataStore::Caches).unwrap();
    assert_eq!(caches.len(), 1);
    let audit: Value = serde_json::from_str(&caches[0].content).unwrap();
    assert!(audit.get("live_capture").is_none());
}

#[tokio::test]
async fn legacy_live_source_labels_cannot_supply_capture_authority() {
    let root = tempfile::tempdir().unwrap();
    let mut gate = Gatehouse::open(root.path()).unwrap();
    let imported = gate
        .recording_import(
            serde_json::from_value(json!({
            "source":"live-shadow","messages":[{"message_id":"simulated-legacy",
                "user_id":"123","at":Timestamp::now(),"text":"Simulated legacy capture fixture"}],"gaps":[]}))
            .unwrap(),
        )
        .unwrap();
    let configuration: DrillConfiguration = serde_json::from_value(json!({"rules":[],
        "bank":"simulated-near-misses-v1","judge":"rules-only","prompts":[]}))
    .unwrap();
    assert_eq!(
        gate.drill_run(DrillRunParams {
            recording: imported.recording,
            configuration
        })
        .await
        .unwrap_err()
        .code,
        ErrorCode::Unavailable
    );
}
