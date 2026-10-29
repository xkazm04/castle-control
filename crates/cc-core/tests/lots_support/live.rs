//! Recorded quicknet transport and generated simulated chat. No external network.
use cc_core::lots::live_beacon::BeaconTransport;
use cc_core::{
    EventHub, Module, NativeConfig, NativeServices, lots::LotsModule, overlay::RenderHost,
};
use cc_types::{ErrorEnvelope, EventKind, parse_request};
use cc_verify::{BeaconRound, SealedRoll};
use serde_json::{Value, json};
use std::sync::{
    Arc, Mutex,
    atomic::{AtomicUsize, Ordering},
};

pub struct Clock(Mutex<chrono::DateTime<chrono::Utc>>);
impl Clock {
    pub fn new() -> Self {
        Self(Mutex::new("2023-08-23T15:09:28Z".parse().unwrap()))
    }
    pub fn advance(&self) {
        *self.0.lock().unwrap() = "2023-08-23T15:09:31Z".parse().unwrap();
    }
}
impl cc_core::lots::LotsClock for Clock {
    fn now(&self) -> chrono::DateTime<chrono::Utc> {
        *self.0.lock().unwrap()
    }
}
pub struct RecordedTransport {
    render: Arc<RenderHost>,
    events: Arc<EventHub>,
    bad: bool,
    calls: AtomicUsize,
}
impl RecordedTransport {
    pub fn new(render: Arc<RenderHost>, events: Arc<EventHub>, bad: bool) -> Self {
        Self {
            render,
            events,
            bad,
            calls: AtomicUsize::new(0),
        }
    }
    pub fn calls(&self) -> usize {
        self.calls.load(Ordering::SeqCst)
    }
}
impl BeaconTransport for RecordedTransport {
    fn fetch(&self, _: &SealedRoll) -> Result<BeaconRound, ErrorEnvelope> {
        let seal = self
            .render
            .lots_seal(&"simulated-draw".to_owned().try_into().unwrap())
            .unwrap()
            .unwrap();
        assert_eq!(
            seal.sealed.roll.sealed_at,
            "2023-08-23T15:09:28Z".to_owned().try_into().unwrap()
        );
        assert!(
            self.events
                .since(0)
                .unwrap()
                .iter()
                .any(|e| e.kind == EventKind::Sealed)
        );
        self.calls.fetch_add(1, Ordering::SeqCst);
        let raw: Value = serde_json::from_str(include_str!(
            "../../../cc-verify/tests/fixtures/drand-quicknet/public-2.json"
        ))
        .unwrap();
        Ok(BeaconRound {
            round: "2".into(),
            signature: if self.bad {
                "00".repeat(48)
            } else {
                raw["signature"].as_str().unwrap().into()
            },
            randomness: raw["randomness"].as_str().unwrap().into(),
        })
    }
}
pub async fn call(
    module: &LotsModule,
    method: &str,
    params: Value,
) -> Result<Value, ErrorEnvelope> {
    let request =
        parse_request(&serde_json::to_vec(&json!({"method":method,"params":params})).unwrap())
            .unwrap();
    let value = module.call(&request).await?;
    request.validate_result(value)
}
pub fn draw() -> Value {
    json!({"draw_id":"simulated-draw","name":"Simulated questions",
        "policy":{"content":"question","paid_entry":false,"paid_weight":false,"subscriber_only":false,"channel_points":false,"free_entry_equal_odds":true,"regions":[],"prize_value_usd_cents":0,"registration_confirmed":false,"official_rules":true,"twitch_disclaimer":true},
        "rules":{"pool":{"kind":"keyword","keyword":"!join"},"winner_count":1,"cooldown_s":0,"cohort_caps":[],"weight_curve":{"kind":"equal"},"free_join_equal_odds":true}})
}
pub async fn prepare(module: &LotsModule) {
    call(module, "lots.draw.upsert", json!({"draw":draw()}))
        .await
        .unwrap();
    let user = cc_store::TwitchUserId::parse("1").unwrap();
    module.map_user(user.clone(), "simulated_1").unwrap();
    module
        .intake(
            &"simulated-draw".to_owned().try_into().unwrap(),
            cc_lots::PassedMessage::from_verdict(
                cc_lots::MessageFacts {
                    message_id: "simulated-1".to_owned().try_into().unwrap(),
                    user_id: user,
                    at: "2023-08-23T15:09:28Z".parse().unwrap(),
                    text: "simulated !join".into(),
                    follower: false,
                    subscriber: false,
                    redeemed: false,
                    activity_units: 0,
                    cohorts: Default::default(),
                },
                cc_types::Verdict::Pass,
            )
            .unwrap(),
        )
        .unwrap();
}
pub async fn native(root: &std::path::Path) -> Arc<NativeServices> {
    NativeServices::new(
        NativeConfig {
            twitch: cc_twitch::TwitchConfig::default(),
            obs: cc_obs::Config {
                port: 0,
                password_label: "simulated-unused".into(),
            },
            overlay_port: 0,
        },
        cc_store::Store::open(root.join("native")).unwrap(),
        Arc::new(|_| panic!("no login in simulated test")),
    )
    .await
    .unwrap()
}
pub fn chat(id: u32, text: &str) -> cc_core::ChatIngress {
    cc_core::ChatIngress {
        login: format!("simulated_{id}"),
        message: cc_twitch::ChatMessage {
            id: format!("simulated-{id}"),
            at: cc_types::Timestamp::now().into(),
            text: text.into(),
            viewer: cc_twitch::Viewer {
                id: id.to_string(),
                name: format!("simulated_{id}"),
                is_mod: false,
                sub_tier: None,
            },
        },
    }
}
pub fn verify_export(root: &std::path::Path, writ: &Value, cast: &Value) {
    let path = root.join("simulated-writ.json");
    let chain = root.join("trusted-chain.json");
    std::fs::write(&path, writ.to_string()).unwrap();
    let trusted = cc_core::lots::live_beacon::official_chain();
    std::fs::write(&chain, serde_json::to_vec(&trusted).unwrap()).unwrap();
    let saved = std::fs::read_to_string(&path).unwrap();
    let verified = cc_verify::verify_writ_json(&saved, Some(&trusted)).unwrap();
    assert_eq!(serde_json::to_value(verified).unwrap(), *cast);
    let output = std::process::Command::new("cargo")
        .current_dir(std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../.."))
        .args([
            "--offline",
            "run",
            "--locked",
            "--quiet",
            "-p",
            "cc-verify",
            "--bin",
            "cc-verify",
            "--",
        ])
        .arg(path)
        .arg("--chain")
        .arg(chain)
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    assert_eq!(
        serde_json::from_slice::<Value>(&output.stdout).unwrap(),
        *cast
    );
}
