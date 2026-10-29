//! Simulated contribution fixtures on the real intake worker and local overlay.
use super::*;
use crate::{EventHub, NativeConfig, NativeServices, Registry, ingress::ContributionIngress};
use cc_types::{BeaconsRenderSnapshot, ContributionSource, EventKind, parse_request};
use serde_json::json;
use std::{sync::Arc, time::Duration};
use tokio::sync::broadcast;

#[path = "simulate_overlay.rs"]
mod simulate_overlay;

struct Harness {
    _root: tempfile::TempDir,
    native: Arc<NativeServices>,
    registry: Registry,
    module: Arc<BeaconsModule>,
    events: Arc<EventHub>,
}
impl Harness {
    async fn new() -> Self {
        let root = tempfile::tempdir().unwrap();
        let native = NativeServices::new(
            NativeConfig {
                twitch: Default::default(),
                obs: cc_obs::Config {
                    port: 0,
                    password_label: "simulated-unused".into(),
                },
                overlay_port: 0,
            },
            Store::open(root.path().join("native")).unwrap(),
            Arc::new(|_| panic!("no login in simulated test")),
        )
        .await
        .unwrap();
        let events = Arc::new(EventHub::new(64).unwrap());
        let registry = Registry::with_native_root(native.clone(), root.path(), events.clone());
        let module = registry.beacons().unwrap();
        Self {
            _root: root,
            native,
            registry,
            module,
            events,
        }
    }
    async fn call(&self, method: &str, params: Value) -> Value {
        let request = parse_request(
            &serde_json::to_vec(&json!({
                "method":method, "params":params
            }))
            .unwrap(),
        )
        .unwrap();
        self.registry.dispatch(&request).await.unwrap()
    }
    async fn save(&self, id: &str, input: Option<Value>, decay: Value) -> Value {
        let mut visual = json!({"visual_id":id,"name":"Simulated frame","curve":{
            "ranges":[{"total":0,"intensity":0.0},{"total":100,"intensity":1.0}],
            "decay":decay}});
        if let Some(input) = input {
            visual["input"] = input;
        }
        self.call("beacons.visual.upsert", json!({"visual":visual}))
            .await
    }
    async fn stream(&self, id: &str) -> reqwest::Response {
        reqwest::Client::builder()
            .no_proxy()
            .build()
            .unwrap()
            .get(format!(
                "{}push/beacons?visual_id={id}",
                self.native.overlay_url()
            ))
            .send()
            .await
            .unwrap()
            .error_for_status()
            .unwrap()
    }
    async fn intensity(&self, id: &str) -> f64 {
        snapshot(&mut self.stream(id).await).await
    }
    async fn accepted(&self, count: usize) {
        tokio::time::timeout(Duration::from_secs(3), async {
            while self
                .events
                .since(0)
                .unwrap()
                .iter()
                .filter(|event| event.kind == EventKind::Contribution)
                .count()
                < count
            {
                tokio::task::yield_now().await;
            }
        })
        .await
        .unwrap();
    }
}

async fn snapshot(response: &mut reqwest::Response) -> f64 {
    tokio::time::timeout(Duration::from_secs(3), async {
        let mut bytes = Vec::new();
        loop {
            bytes.extend_from_slice(&response.chunk().await.unwrap().unwrap());
            if let Some((event, _)) = String::from_utf8_lossy(&bytes).split_once("\n\n") {
                let data = event
                    .lines()
                    .find_map(|line| line.strip_prefix("data: "))
                    .unwrap();
                let snapshot: BeaconsRenderSnapshot = serde_json::from_str(data).unwrap();
                return f64::from(snapshot.intensity.intensity);
            }
        }
    })
    .await
    .unwrap()
}

fn input(source: ContributionSource, key: &str, amount: u32) -> ContributionIngress {
    ContributionIngress {
        contribution: cc_types::Contribution {
            source,
            broadcaster_id: "111".to_owned().try_into().unwrap(),
            event_id: format!("simulated-{key}").try_into().unwrap(),
            user_id: None,
            amount,
            dedupe_key: format!("simulated-{key}"),
        },
        broadcaster_login: "simulated_channel".into(),
        user_login: None,
        at: cc_types::Timestamp::now().into(),
    }
}

#[tokio::test]
async fn cheer_routes_only_selected_visuals_and_dedupes() {
    let h = Harness::new().await;
    h.save(
        "cheer",
        Some(json!({"source":"cheer","unit":"bits"})),
        json!({"kind":"none"}),
    )
    .await;
    h.save(
        "gift",
        Some(json!({"source":"gift","unit":"count"})),
        json!({"kind":"none"}),
    )
    .await;
    h.save("legacy", None, json!({"kind":"none"})).await;
    let (sender, receiver) = broadcast::channel(16);
    let worker = h.module.start_intake(receiver, h.events.clone());
    sender
        .send(input(ContributionSource::Cheer, "cheer", 50))
        .unwrap();
    h.accepted(1).await;
    assert_eq!(h.intensity("cheer").await, 0.5);
    assert_eq!(h.intensity("gift").await, 0.0);
    assert_eq!(h.intensity("legacy").await, 0.0);
    assert!(
        !h.module
            .state
            .lock()
            .unwrap()
            .engines
            .contains_key(&"legacy".to_owned().try_into().unwrap())
    );
    let mut stream = h.stream("cheer").await;
    assert_eq!(snapshot(&mut stream).await, 0.5);
    let mut duplicate = input(ContributionSource::BitsUse, "cheer", 50);
    duplicate.contribution.event_id = "simulated-other-transport".to_owned().try_into().unwrap();
    sender.send(duplicate).unwrap();
    sender
        .send(input(ContributionSource::Gift, "gift", 10))
        .unwrap();
    h.accepted(2).await;
    assert_eq!(h.intensity("cheer").await, 0.5);
    assert_eq!(h.intensity("gift").await, 0.1);
    h.module.snapshot_live().unwrap();
    assert_eq!(h.intensity("cheer").await, 0.5);
    assert!(
        tokio::time::timeout(Duration::from_millis(100), stream.chunk())
            .await
            .is_err()
    );
    // A new Bits event still selects the cheer input, without converting units.
    sender
        .send(input(ContributionSource::BitsUse, "new-bits", 25))
        .unwrap();
    h.accepted(3).await;
    assert_eq!(h.intensity("cheer").await, 0.75);
    drop(sender);
    worker.await.unwrap().unwrap();
    assert_eq!(h.module.contributions().unwrap().len(), 3);
}

#[tokio::test]
async fn committed_input_and_curve_changes_reset_engines_without_replaying_keys() {
    let h = Harness::new().await;
    h.save(
        "frame",
        Some(json!({"source":"cheer","unit":"bits"})),
        json!({"kind":"none"}),
    )
    .await;
    let original = input(ContributionSource::Cheer, "original", 50);
    assert!(h.module.intake(original.clone()).unwrap());
    assert_eq!(h.intensity("frame").await, 0.5);
    let visual = h
        .save(
            "frame",
            Some(json!({"source":"gift","unit":"count"})),
            json!({"kind":"none"}),
        )
        .await;
    assert_eq!(h.intensity("frame").await, 0.0);
    assert!(!h.module.intake(original).unwrap());
    assert!(
        h.module
            .intake(input(ContributionSource::Cheer, "ignored", 100))
            .unwrap()
    );
    assert_eq!(h.intensity("frame").await, 0.0);
    assert!(
        h.module
            .intake(input(ContributionSource::Gift, "gift", 25))
            .unwrap()
    );
    assert_eq!(h.intensity("frame").await, 0.25);
    let mut curve = visual["curve"].clone();
    curve["ranges"][1]["total"] = json!(50);
    h.call(
        "beacons.curve.set",
        json!({"visual_id":"frame","curve":curve}),
    )
    .await;
    assert_eq!(h.intensity("frame").await, 0.0);
    assert!(
        !h.module
            .intake(input(ContributionSource::Gift, "gift", 25))
            .unwrap()
    );
    assert!(
        h.module
            .intake(input(ContributionSource::Gift, "new-gift", 25))
            .unwrap()
    );
    assert_eq!(h.intensity("frame").await, 0.5);
    h.save("frame", None, json!({"kind":"none"})).await;
    assert_eq!(h.intensity("frame").await, 0.0);
    assert!(
        h.module
            .intake(input(ContributionSource::Gift, "legacy-gift", 100))
            .unwrap()
    );
    assert_eq!(h.intensity("frame").await, 0.0);
    assert!(h.module.state.lock().unwrap().engines.is_empty());
}

#[tokio::test]
async fn intake_worker_publishes_decay_without_another_contribution_and_purge_stops_it() {
    let h = Harness::new().await;
    h.save(
        "frame",
        Some(json!({"source":"cheer","unit":"bits"})),
        json!({"kind":"exponential","half_life_s":1}),
    )
    .await;
    let (sender, receiver) = broadcast::channel(16);
    let worker = h.module.start_intake(receiver, h.events.clone());
    sender
        .send(input(ContributionSource::Cheer, "decay", 100))
        .unwrap();
    h.accepted(1).await;
    let mut stream = h.stream("frame").await;
    assert!(snapshot(&mut stream).await > 0.9);
    let decayed = snapshot(&mut stream).await;
    assert!(decayed > 0.0 && decayed < 0.9, "decayed to {decayed}");
    assert_eq!(h.module.contributions().unwrap().len(), 1);
    h.module.purge_live_data().unwrap();
    assert!(h.module.state.lock().unwrap().engines.is_empty());
    let before = h.intensity("frame").await;
    h.module.snapshot_live().unwrap();
    assert_eq!(h.intensity("frame").await, before);
    drop(sender);
    worker.await.unwrap().unwrap();
}

#[tokio::test]
async fn offline_routing_needs_no_native_service_and_expired_weak_is_harmless() {
    let root = tempfile::tempdir().unwrap();
    let module = BeaconsModule::open(root.path()).unwrap();
    let request = parse_request(br#"{"method":"beacons.visual.upsert","params":{"visual":{
        "visual_id":"frame","name":"Simulated frame","input":{"source":"cheer","unit":"bits"},
        "curve":{"ranges":[{"total":0,"intensity":0.0},{"total":100,"intensity":1.0}],"decay":{"kind":"none"}}}}}"#).unwrap();
    module.call(&request).await.unwrap();
    assert!(
        module
            .intake(input(ContributionSource::Cheer, "offline", 50))
            .unwrap()
    );
    module.snapshot_live().unwrap();
    let h = Harness::new().await;
    h.save(
        "frame",
        Some(json!({"source":"cheer","unit":"bits"})),
        json!({"kind":"none"}),
    )
    .await;
    let retained = h.module.clone();
    drop(h);
    assert!(retained.native.as_ref().unwrap().upgrade().is_none());
    assert!(
        retained
            .intake(input(ContributionSource::Cheer, "expired", 50))
            .unwrap()
    );
    retained.snapshot_live().unwrap();
}
