//! Generated fixtures, including false simulated flags to exercise live labels;
//! no Twitch data, network, credentials or action executor is used.
use async_trait::async_trait;
use cc_core::{Registry, gatehouse::GatehouseModule};
use cc_gatehouse::{Classifier, ClassifierError, Gatehouse, IngestedMessage};
use cc_store::{Store, SystemClock, TwitchUserId};
use cc_types::{ErrorCode, GATEHOUSE_MAX_PAGE_SIZE, parse_request};
use serde_json::{Value, json};
use std::sync::Arc;

struct NoModel;
#[async_trait]
impl Classifier for NoModel {
    async fn classify(&self, _: &str, _: &str) -> Result<String, ClassifierError> {
        panic!("generated rules-only fixtures must not invoke a model")
    }
}

async fn seed(root: &std::path::Path, count: usize) -> Vec<String> {
    let mut gate = Gatehouse::open(root).unwrap();
    gate.require_shadow();
    let at = cc_types::Timestamp::now();
    let messages: Vec<_> = (0..count)
        .map(|id| IngestedMessage {
            message_id: format!("simulated-read-{id}").try_into().unwrap(),
            user_id: TwitchUserId::parse("123").unwrap(),
            login: "simulated_reader".into(),
            text: format!("generated simulated read fixture {id}"),
            at: at.clone(),
            simulated: id % 2 == 0,
            metadata: None,
        })
        .collect();
    // Exercise the existing recorder and writer, rather than fabricate a cache
    // format or open a second Store while Gatehouse owns the directory lock.
    gate.recorder(TwitchUserId::parse("123").unwrap(), at)
        .record_live(
            "simulated-read-fixture".to_owned().try_into().unwrap(),
            &messages,
            vec![],
        )
        .unwrap();
    let decisions = gate.screen_batch(messages, &NoModel).await.unwrap();
    decisions
        .into_iter()
        .map(|item| item.decision.decision_id.as_str().to_owned())
        .collect()
}

fn registry(root: &std::path::Path) -> Registry {
    let mut registry = Registry::default();
    registry
        .register(Arc::new(
            GatehouseModule::open(root, Arc::new(SystemClock)).unwrap(),
        ))
        .unwrap();
    registry
}

async fn call(
    registry: &Registry,
    method: &str,
    params: Value,
) -> Result<Value, cc_types::ErrorEnvelope> {
    let request =
        parse_request(&serde_json::to_vec(&json!({"method":method,"params":params})).unwrap())?;
    registry.dispatch(&request).await
}

#[tokio::test]
async fn pages_walk_every_committed_decision_without_gaps_or_repeats() {
    let dir = tempfile::tempdir().unwrap();
    let expected = seed(dir.path(), 213).await;
    let registry = registry(dir.path());
    for method in ["gatehouse.chat.list", "gatehouse.history.list"] {
        let mut params = json!({"limit":GATEHOUSE_MAX_PAGE_SIZE});
        let mut actual = Vec::new();
        let mut pages = 0;
        loop {
            let page = call(&registry, method, params.clone()).await.unwrap();
            let items = page["items"].as_array().unwrap();
            assert!(items.len() <= GATEHOUSE_MAX_PAGE_SIZE as usize);
            assert_eq!(page["unavailable_count"], 0);
            for item in items {
                let index = actual.len();
                assert_eq!(
                    item["provenance"],
                    if index % 2 == 0 { "simulated" } else { "live" }
                );
                assert_eq!(item["decision"]["verdict"], "pass");
                if method == "gatehouse.chat.list" {
                    assert_eq!(
                        item["message"]["text"],
                        format!("generated simulated read fixture {index}")
                    );
                }
                actual.push(item["decision"]["decision_id"].as_str().unwrap().to_owned());
            }
            pages += 1;
            assert!(pages < 5, "cursor must advance");
            let Some(cursor) = page.get("next_cursor") else {
                break;
            };
            params["cursor"] = cursor.clone();
        }
        assert_eq!(actual, expected);
        assert_eq!(pages, 3);
    }
    // A read borrows the writer's Store; it never opens/releases its lock.
    assert!(Store::open(dir.path().join("store")).is_err());
}

#[tokio::test]
async fn limits_and_endpoint_scoped_cursors_are_refused_when_invalid() {
    let dir = tempfile::tempdir().unwrap();
    let registry = registry(dir.path());
    for method in ["gatehouse.chat.list", "gatehouse.history.list"] {
        for params in [
            json!({"limit":0}),
            json!({"limit":101}),
            json!({"limit":u32::MAX}),
            json!({"limit":1,"cursor":null}),
            json!({"limit":1,"cursor":"chat:01"}),
            json!({"limit":1,"cursor":"history:-1"}),
            json!({"limit":1,"extra":true}),
        ] {
            assert_eq!(
                call(&registry, method, params).await.unwrap_err().code,
                ErrorCode::Invalid
            );
        }
        let wrong = if method == "gatehouse.chat.list" {
            "history:0"
        } else {
            "chat:0"
        };
        assert_eq!(
            call(&registry, method, json!({"limit":1,"cursor":wrong}))
                .await
                .unwrap_err()
                .code,
            ErrorCode::Invalid
        );
        assert_eq!(
            call(&registry, method, json!({"limit":1,"cursor":"chat:999"}))
                .await
                .unwrap_err()
                .code,
            ErrorCode::Invalid
        );
        let empty = call(&registry, method, json!({"limit":1})).await.unwrap();
        assert_eq!(empty["items"], json!([]));
        assert!(empty.get("next_cursor").is_none());
    }
}

#[tokio::test]
async fn new_reads_are_registered_in_the_existing_lazy_registry() {
    let registry = Registry::with_status();
    for method in ["gatehouse.chat.list", "gatehouse.history.list"] {
        assert!(registry.methods().contains(&method));
        assert_eq!(
            call(&registry, method, json!({"limit":1})).await.unwrap()["items"],
            json!([])
        );
    }
}

#[tokio::test]
async fn missing_metadata_is_reported_and_empty_pages_can_continue() {
    let dir = tempfile::tempdir().unwrap();
    let ids = seed(dir.path(), 3).await;
    // A legacy rule-mode change is ledger-only: it has neither cached verdict
    // nor durable provenance. The read must report that gap, never label it live.
    let mut gate = Gatehouse::open(dir.path()).unwrap();
    let rule = serde_json::from_value(json!({"rule_id":"simulated-rule","name":"Simulated rule",
        "rule_class":"pattern","mode":"shadow","action":"delete","delivery":"streamer","pattern":"simulated"})).unwrap();
    gate.rules_upsert(cc_types::RulesUpsertParams {
        rule,
        display: None,
    })
    .unwrap();
    gate.rules_set_mode(
        serde_json::from_value(json!({"rule_id":"simulated-rule","mode":"shadow"})).unwrap(),
    )
    .unwrap();
    drop(gate);
    let registry = registry(dir.path());
    let page = call(&registry, "gatehouse.history.list", json!({"limit":100}))
        .await
        .unwrap();
    assert_eq!(page["items"].as_array().unwrap().len(), ids.len());
    assert_eq!(page["unavailable_count"], 1);
    drop(registry);
    let mut store = Store::open(dir.path().join("store")).unwrap();
    store
        .forget_user("simulated_reader", cc_store::Timestamp::now())
        .unwrap();
    drop(store);
    let registry = self::registry(dir.path());
    let empty = call(&registry, "gatehouse.history.list", json!({"limit":1}))
        .await
        .unwrap();
    assert_eq!(empty["items"], json!([]));
    assert_eq!(empty["unavailable_count"], 1);
    assert!(empty.get("next_cursor").is_some());
    assert_eq!(
        call(&registry, "gatehouse.chat.list", json!({"limit":100}))
            .await
            .unwrap()["items"],
        json!([])
    );
}

#[tokio::test]
async fn imports_cannot_create_verdicts_or_replace_ambiguous_chat() {
    let dir = tempfile::tempdir().unwrap();
    seed(dir.path(), 2).await;
    let mut gate = Gatehouse::open(dir.path()).unwrap();
    let at = cc_types::Timestamp::now();
    gate.recording_import(
        serde_json::from_value(json!({
            "source":"live-shadow", "gaps":[], "messages":[
                {"message_id":"simulated-unreviewed", "user_id":"123", "at":at,
                    "text":"simulated import with no verdict"},
                {"message_id":"simulated-read-0", "user_id":"123", "at":at,
                    "text":"simulated conflicting import"}
            ]
        }))
        .unwrap(),
    )
    .unwrap();
    drop(gate);
    let registry = registry(dir.path());
    let chat = call(&registry, "gatehouse.chat.list", json!({"limit":100}))
        .await
        .unwrap();
    assert_eq!(chat["items"].as_array().unwrap().len(), 1);
    assert_eq!(
        chat["items"][0]["message"]["message_id"],
        "simulated-read-1"
    );
    assert_eq!(chat["unavailable_count"], 1);
    let history = call(&registry, "gatehouse.history.list", json!({"limit":100}))
        .await
        .unwrap();
    assert_eq!(history["items"].as_array().unwrap().len(), 2);
    assert_eq!(history["unavailable_count"], 0);
}

#[tokio::test]
async fn expired_originals_are_excluded_without_running_a_writer_or_reaper() {
    let dir = tempfile::tempdir().unwrap();
    let ids = seed(dir.path(), 2).await;
    let mut store = Store::open(dir.path().join("store")).unwrap();
    let old = "2000-01-01T00:00:00Z";
    let original = IngestedMessage {
        message_id: "simulated-read-0".to_owned().try_into().unwrap(),
        user_id: TwitchUserId::parse("123").unwrap(),
        login: "simulated_reader".into(),
        text: "simulated expired original must not be returned".into(),
        at: old.to_owned().try_into().unwrap(),
        simulated: true,
        metadata: None,
    };
    store
        .insert(
            cc_store::DataStore::Recordings,
            &cc_store::StoredItem {
                id: ids[0].parse().unwrap(),
                at: cc_store::Timestamp::parse(old).unwrap(),
                user_ids: vec![original.user_id.clone()],
                content: serde_json::to_string(&original).unwrap(),
                simulated: true,
            },
        )
        .unwrap();
    let before = store.items(cc_store::DataStore::Recordings).unwrap();
    drop(store);
    let registry = registry(dir.path());
    let ledger = dir.path().join("store/decisions.jsonl");
    let ledger_before = std::fs::read(&ledger).unwrap();
    let chat = call(&registry, "gatehouse.chat.list", json!({"limit":100}))
        .await
        .unwrap();
    assert_eq!(
        chat["items"][0]["message"]["text"],
        "generated simulated read fixture 0"
    );
    assert_eq!(chat["unavailable_count"], 0);
    call(&registry, "gatehouse.history.list", json!({"limit":100}))
        .await
        .unwrap();
    assert_eq!(std::fs::read(&ledger).unwrap(), ledger_before);
    drop(registry);
    let store = Store::open(dir.path().join("store")).unwrap();
    assert_eq!(
        store.items(cc_store::DataStore::Recordings).unwrap(),
        before
    );
}
