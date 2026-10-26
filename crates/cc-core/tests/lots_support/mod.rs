//! Generated simulated chat and recorded public beacon data; no network adapters.
use cc_core::{
    EventHub, Registry,
    lots::{BeaconSource, LotsClock, LotsModule},
};
use cc_lots::{MessageFacts, PassedMessage};
use cc_types::{ErrorEnvelope, LotsSealedRoll, Verdict, parse_request};
use cc_verify::{BeaconRound, QuicknetChain};
use chrono::{DateTime, Utc};
use serde_json::{Value, json};
use std::sync::{
    Arc, Mutex,
    atomic::{AtomicBool, Ordering},
};

pub struct Clock(pub Mutex<DateTime<Utc>>);
impl LotsClock for Clock {
    fn now(&self) -> DateTime<Utc> {
        *self.0.lock().unwrap()
    }
}
pub struct RecordedBeacon(pub AtomicBool);
impl BeaconSource for RecordedBeacon {
    fn chain(&self) -> Result<QuicknetChain, ErrorEnvelope> {
        Ok(chain())
    }
    fn round(&self, _: &LotsSealedRoll) -> Result<BeaconRound, ErrorEnvelope> {
        let value: Value = serde_json::from_str(include_str!(
            "../../../cc-verify/tests/fixtures/drand-quicknet/public-2.json"
        ))
        .unwrap();
        Ok(BeaconRound {
            round: value["round"].as_u64().unwrap().to_string(),
            signature: if self.0.load(Ordering::SeqCst) {
                "00".repeat(48)
            } else {
                value["signature"].as_str().unwrap().into()
            },
            randomness: value["randomness"].as_str().unwrap().into(),
        })
    }
}
pub fn chain() -> QuicknetChain {
    let info: Value = serde_json::from_str(include_str!(
        "../../../cc-verify/tests/fixtures/drand-quicknet/info.json"
    ))
    .unwrap();
    QuicknetChain::new(
        info["hash"].as_str().unwrap().into(),
        info["public_key"].as_str().unwrap().into(),
        "2023-08-23T15:09:27Z".into(),
    )
    .unwrap()
}
pub fn at() -> DateTime<Utc> {
    "2023-08-23T15:09:28Z".parse().unwrap()
}
pub fn draw() -> Value {
    json!({
        "draw_id":"simulated-draw", "name":"Simulated questions",
        "policy": {
            "content":"question", "paid_entry":false, "paid_weight":false,
            "subscriber_only":false, "channel_points":false, "free_entry_equal_odds":true,
            "regions":[], "prize_value_usd_cents":0, "registration_confirmed":false,
            "official_rules":true, "twitch_disclaimer":true
        },
        "rules": {
            "pool":{"kind":"chatters"}, "winner_count":1, "cooldown_s":60,
            "cohort_caps":[], "weight_curve":{"kind":"equal"}, "free_join_equal_odds":true
        }
    })
}
pub fn facts(user: &str, at: DateTime<Utc>) -> MessageFacts {
    MessageFacts {
        message_id: format!("simulated-{user}").try_into().unwrap(),
        user_id: cc_store::TwitchUserId::parse(user).unwrap(),
        at,
        text: "simulated !join".into(),
        follower: false,
        subscriber: false,
        redeemed: false,
        activity_units: 0,
        cohorts: Default::default(),
    }
}
pub struct Harness {
    pub directory: tempfile::TempDir,
    pub module: Arc<LotsModule>,
    pub registry: Registry,
    pub events: Arc<EventHub>,
    pub clock: Arc<Clock>,
    pub beacon: Arc<RecordedBeacon>,
}
impl Harness {
    pub fn new() -> Self {
        let directory = tempfile::tempdir().unwrap();
        let events = Arc::new(EventHub::new(64).unwrap());
        let clock = Arc::new(Clock(Mutex::new(at())));
        let beacon = Arc::new(RecordedBeacon(AtomicBool::new(false)));
        let module = Arc::new(
            LotsModule::open(
                directory.path(),
                events.clone(),
                beacon.clone(),
                clock.clone(),
                true,
            )
            .unwrap(),
        );
        let mut registry = Registry::default();
        registry.register(module.clone()).unwrap();
        Self {
            directory,
            module,
            registry,
            events,
            clock,
            beacon,
        }
    }
    pub async fn call(&self, method: &str, params: Value) -> Value {
        rpc(&self.registry, method, params).await
    }
    pub async fn upsert(&self) {
        assert_eq!(
            self.call("lots.draw.upsert", json!({"draw":draw()})).await,
            draw()
        );
    }
    pub fn add(&self, user: &str) -> cc_lots::Intake {
        self.module
            .map_user(
                cc_store::TwitchUserId::parse(user).unwrap(),
                &format!("simulated_{user}"),
            )
            .unwrap();
        self.module
            .intake(
                &"simulated-draw".to_owned().try_into().unwrap(),
                PassedMessage::from_verdict(facts(user, self.clock.now()), Verdict::Pass).unwrap(),
            )
            .unwrap()
    }
    pub async fn seal(&self, source: &str) -> Value {
        self.call(
            "lots.roll.seal",
            json!({"draw_id":"simulated-draw", "source":source, "margin_s":1}),
        )
        .await
    }
}
pub async fn rpc(registry: &Registry, method: &str, params: Value) -> Value {
    let request =
        parse_request(&serde_json::to_vec(&json!({"method":method,"params":params})).unwrap())
            .unwrap();
    let value = registry.dispatch(&request).await.unwrap();
    assert_eq!(request.validate_result(value.clone()).unwrap(), value);
    value
}
pub async fn error(registry: &Registry, method: &str, params: Value) -> cc_types::ErrorCode {
    let request =
        parse_request(&serde_json::to_vec(&json!({"method":method,"params":params})).unwrap())
            .unwrap();
    registry.dispatch(&request).await.unwrap_err().code
}
