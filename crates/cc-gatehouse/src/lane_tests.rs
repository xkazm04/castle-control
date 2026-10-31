//! Generated, labelled simulated messages; the counter is isolated per test thread.
use crate::{
    Classifier, ClassifierError, GatePath, Gatehouse, IngestedMessage, store::RECORD_READS,
};
use async_trait::async_trait;
use cc_store::TwitchUserId;
use cc_types::Timestamp;

struct NoClassifier;
#[async_trait]
impl Classifier for NoClassifier {
    async fn classify(&self, _: &str, _: &str) -> Result<String, ClassifierError> {
        panic!("ordinary rules-only messages must not call the classifier")
    }
}

fn message(index: usize) -> IngestedMessage {
    IngestedMessage {
        message_id: format!("simulated-{index}").try_into().unwrap(),
        user_id: TwitchUserId::parse(&(100 + index).to_string()).unwrap(),
        login: format!("simulated_{index}"),
        text: "Ordinary simulated chat".into(),
        at: Timestamp::now(),
        simulated: true,
        metadata: None,
    }
}

#[tokio::test]
async fn ordinary_batch_reads_care_records_once() {
    let root = tempfile::tempdir().unwrap();
    let mut gate = Gatehouse::open(root.path()).unwrap();
    RECORD_READS.set(0);
    let screened = gate
        .screen_batch((0..50).map(message).collect(), &NoClassifier)
        .await
        .unwrap();
    assert_eq!(screened.len(), 50);
    assert!(
        screened
            .iter()
            .all(|line| line.path == GatePath::FoundNothing)
    );
    assert_eq!(RECORD_READS.get(), 1);
}

#[tokio::test]
async fn live_capture_reads_care_records_once() {
    let root = tempfile::tempdir().unwrap();
    let mut gate = Gatehouse::open(root.path()).unwrap();
    RECORD_READS.set(0);
    let screened = gate
        .capture_live_shadow(message(0), &NoClassifier, vec![])
        .await
        .unwrap();
    assert_eq!(screened.path, GatePath::FoundNothing);
    assert_eq!(RECORD_READS.get(), 1);
}

#[tokio::test]
async fn mixed_batch_propagates_care_with_one_records_read() {
    let root = tempfile::tempdir().unwrap();
    let mut gate = Gatehouse::open(root.path()).unwrap();
    let mut messages: Vec<_> = (0..10).map(message).collect();
    messages[3].text = "Simulated disclosure: I need help".into();
    messages[7].user_id = messages[3].user_id.clone();
    RECORD_READS.set(0);
    let screened = gate.screen_batch(messages, &NoClassifier).await.unwrap();
    for index in [3, 7] {
        assert_eq!(screened[index].path, GatePath::Care);
        assert!(screened[index].reaches_streamer);
        assert!(screened[index].intent.is_none());
    }
    assert_eq!(RECORD_READS.get(), 1);
}

struct WithheldClassifier;
#[async_trait]
impl Classifier for WithheldClassifier {
    async fn classify(&self, _: &str, prompt: &str) -> Result<String, ClassifierError> {
        assert!(!prompt.contains("I need help"));
        Ok("[]".into())
    }
}

#[tokio::test]
async fn pending_classifier_messages_use_care_recorded_during_this_batch() {
    let root = tempfile::tempdir().unwrap();
    let mut gate = Gatehouse::open(root.path()).unwrap();
    gate.rules_upsert(
        serde_json::from_value(serde_json::json!({"rule": {
            "rule_id": "simulated-classifier", "name": "Simulated classifier",
            "rule_class": "classifier", "mode": "shadow", "action": "delete",
            "delivery": "streamer", "text": "Simulated classifier rule"
        }}))
        .unwrap(),
    )
    .unwrap();
    let mut messages: Vec<_> = (0..10).map(message).collect();
    messages[3].text = "Simulated disclosure: I need help".into();
    messages[0].user_id = messages[3].user_id.clone();
    messages[7].user_id = messages[3].user_id.clone();
    RECORD_READS.set(0);
    let screened = gate
        .screen_batch(messages, &WithheldClassifier)
        .await
        .unwrap();
    for index in [0, 3, 7] {
        assert_eq!(screened[index].path, GatePath::Care);
        assert!(screened[index].intent.is_none());
    }
    assert_eq!(RECORD_READS.get(), 1);
}

#[tokio::test]
async fn care_is_reloaded_after_forget_or_purge_between_batches() {
    for forget in [true, false] {
        let root = tempfile::tempdir().unwrap();
        let mut gate = Gatehouse::open(root.path()).unwrap();
        let mut disclosure = message(0);
        disclosure.text = "Simulated disclosure: I need help".into();
        gate.screen_batch(vec![disclosure], &NoClassifier)
            .await
            .unwrap();
        let screened = gate
            .screen_batch(vec![message(0)], &NoClassifier)
            .await
            .unwrap();
        assert_eq!(screened[0].path, GatePath::Care);
        if forget {
            gate.store
                .forget_user("simulated_0", cc_store::Timestamp::now())
                .unwrap();
        } else {
            gate.store.purge_all(cc_store::Timestamp::now()).unwrap();
        }
        RECORD_READS.set(0);
        let screened = gate
            .screen_batch(vec![message(0)], &NoClassifier)
            .await
            .unwrap();
        assert_eq!(screened[0].path, GatePath::FoundNothing);
        assert_eq!(RECORD_READS.get(), 1);
    }
}
