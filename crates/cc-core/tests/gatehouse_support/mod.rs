//! Generated simulated messages only. No Twitch, model or network executor.
use async_trait::async_trait;
use cc_core::{Registry, gatehouse::GatehouseModule};
use cc_gatehouse::{Classifier, ClassifierError, Gatehouse, IngestedMessage};
use cc_store::{Clock, TwitchUserId};
use cc_types::{ErrorEnvelope, parse_request};
use serde_json::{Value, json};
use std::sync::{Arc, Mutex};

const NOW: &str = "2026-10-26T12:00:00Z";

pub struct TestClock(pub Mutex<String>);
impl Clock for TestClock {
    fn now(&self) -> cc_store::Timestamp {
        cc_store::Timestamp::parse(&self.0.lock().unwrap()).unwrap()
    }
}

struct NoClassifier;
#[async_trait]
impl Classifier for NoClassifier {
    async fn classify(&self, _: &str, _: &str) -> Result<String, ClassifierError> {
        panic!("pattern-only simulated fixture must not call a classifier")
    }
}

pub fn rule() -> Value {
    json!({
        "rule_id":"simulated-ban", "name":"Simulated ban rule",
        "rule_class":"pattern", "mode":"shadow", "action":"ban",
        "delivery":"streamer", "pattern":"simulated tagged"
    })
}
pub fn params(decision: &Value) -> Value {
    json!({"decision_id":decision["decision_id"]})
}
pub fn requests() -> [(&'static str, Value); 7] {
    let id = cc_types::DecisionId::mint();
    [
        ("gatehouse.rules.list", json!({})),
        ("gatehouse.rules.upsert", json!({"rule":rule()})),
        (
            "gatehouse.rules.setMode",
            json!({"rule_id":"simulated-ban", "mode":"shadow"}),
        ),
        ("gatehouse.ban.confirm", json!({"decision_id":id})),
        ("gatehouse.ban.dismiss", json!({"decision_id":id})),
        ("gatehouse.decision.undo", json!({"decision_id":id})),
        (
            "gatehouse.petition.resolve",
            json!({"decision_id":id,"outcome":"overturned"}),
        ),
    ]
}

pub struct Harness {
    directory: tempfile::TempDir,
    pub registry: Registry,
    pub clock: Arc<TestClock>,
}
impl Harness {
    pub fn new() -> Self {
        let mut h = Self {
            directory: tempfile::tempdir().unwrap(),
            registry: Registry::default(),
            clock: Arc::new(TestClock(Mutex::new(NOW.into()))),
        };
        h.reopen();
        h
    }
    pub fn reopen(&mut self) {
        drop(std::mem::take(&mut self.registry));
        let module = GatehouseModule::open(self.directory.path(), self.clock.clone()).unwrap();
        self.registry.register(Arc::new(module)).unwrap();
    }
    pub async fn seed_pending(&mut self, count: usize) -> Vec<Value> {
        let saved = rpc(
            &self.registry,
            "gatehouse.rules.upsert",
            json!({"rule":rule()}),
        )
        .await;
        assert_eq!(saved, rule());
        let armed = rpc(
            &self.registry,
            "gatehouse.rules.setMode",
            json!({
                "rule_id":"simulated-ban", "mode":"armed",
                "acknowledgement":{"at":NOW,"reason":"Simulated offline test consent"}
            }),
        )
        .await;
        assert_eq!(armed["kind"], "mode_changed");
        assert_eq!(armed["at"], self.clock.now().as_rfc3339());
        // Only the existing domain seam seeds chat; the RPC module has no intake.
        drop(std::mem::take(&mut self.registry));
        let mut gate = Gatehouse::with_clock(self.directory.path(), self.clock.clone()).unwrap();
        let messages = (1..=count)
            .map(|id| IngestedMessage {
                message_id: format!("simulated-{id}").try_into().unwrap(),
                user_id: TwitchUserId::parse(&id.to_string()).unwrap(),
                login: format!("simulated_{id}"),
                text: format!("simulated tagged original {id}"),
                at: NOW.to_owned().try_into().unwrap(),
                simulated: true,
                metadata: None,
            })
            .collect();
        let screened = gate.screen_batch(messages, &NoClassifier).await.unwrap();
        assert!(screened.iter().all(|s| s.intent.is_none()));
        let pending = screened
            .into_iter()
            .map(|s| serde_json::to_value(s.decision).unwrap())
            .collect();
        drop(gate);
        self.reopen();
        pending
    }
}

async fn dispatch(
    registry: &Registry,
    method: &str,
    params: Value,
) -> Result<Value, ErrorEnvelope> {
    let bytes = serde_json::to_vec(&json!({"method":method,"params":params})).unwrap();
    let request = parse_request(&bytes)?;
    let value = registry.dispatch(&request).await?;
    assert_eq!(request.validate_result(value.clone()).unwrap(), value);
    Ok(value)
}
pub async fn rpc(registry: &Registry, method: &str, params: Value) -> Value {
    dispatch(registry, method, params).await.unwrap()
}
pub async fn failure(registry: &Registry, method: &str, params: Value) -> ErrorEnvelope {
    let error = dispatch(registry, method, params).await.unwrap_err();
    let wire = serde_json::to_value(&error).unwrap();
    assert!(wire.get("retry_after_ms").is_none());
    assert!(wire.get("detail").is_none());
    assert_eq!(
        serde_json::from_value::<ErrorEnvelope>(wire).unwrap(),
        error
    );
    error
}
