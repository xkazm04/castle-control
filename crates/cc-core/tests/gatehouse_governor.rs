//! Generated simulated chat and moderator observations; no live adapters.
use async_trait::async_trait;
use cc_core::{Registry, gatehouse::GatehouseModule};
use cc_gatehouse::{
    Classifier, ClassifierError, IngestedMessage,
    gate::{ExternalAction, GateActor, ModerationEvent},
    governor::{GovernorConfig, RoomSetting},
};
use cc_store::{Clock, DecisionAction, LedgerEvent, LedgerKind, Store, TwitchUserId};
use cc_types::{DecisionKind, ErrorCode, RoomMode, Tier, Verdict, parse_request};
use serde_json::{Value, json};
use std::sync::{Arc, Mutex};
use std::time::Duration;

struct TestClock(Mutex<i64>);
impl Clock for TestClock {
    fn now(&self) -> cc_store::Timestamp {
        cc_store::Timestamp::parse(&at(*self.0.lock().unwrap())).unwrap()
    }
}
fn at(seconds: i64) -> String {
    chrono::DateTime::from_timestamp(1_793_016_000 + seconds, 0)
        .unwrap()
        .to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
}
struct NoClassifier;
#[async_trait]
impl Classifier for NoClassifier {
    async fn classify(&self, _: &str, _: &str) -> Result<String, ClassifierError> {
        panic!("simulated rules-only service must not call a classifier")
    }
}
fn config(plans: [Vec<RoomSetting>; 4]) -> GovernorConfig {
    GovernorConfig {
        borders: [10, 20, 30],
        margin: 2,
        hysteresis_s: 30,
        lease_s: 60,
        plans,
    }
}
fn message(id: usize, second: i64, text: &str) -> IngestedMessage {
    IngestedMessage {
        message_id: format!("simulated-{id}-{second}").try_into().unwrap(),
        user_id: TwitchUserId::parse(&(id + 1).to_string()).unwrap(),
        login: format!("simulated_{id}"),
        text: text.into(),
        at: at(second).try_into().unwrap(),
        simulated: true,
        metadata: None,
    }
}
struct Room {
    module: Arc<GatehouseModule>,
    registry: Registry,
    clock: Arc<TestClock>,
    root: tempfile::TempDir,
}
impl Room {
    fn new(plans: [Vec<RoomSetting>; 4]) -> Self {
        let root = tempfile::tempdir().unwrap();
        let clock = Arc::new(TestClock(Mutex::new(0)));
        let module = Arc::new(
            GatehouseModule::open_with_governor(root.path(), clock.clone(), config(plans)).unwrap(),
        );
        let mut registry = Registry::default();
        registry.register(module.clone()).unwrap();
        Self {
            module,
            registry,
            clock,
            root,
        }
    }
    fn set(&self, seconds: i64) {
        *self.clock.0.lock().unwrap() = seconds;
    }
    async fn population(&self, count: usize, seconds: i64) {
        self.set(seconds);
        let screened = self
            .module
            .screen_batch(
                (0..count)
                    .map(|id| message(id, seconds, "simulated ordinary chat"))
                    .collect(),
                &NoClassifier,
            )
            .await
            .unwrap();
        assert!(screened.iter().all(|s| s.intent.is_none()));
    }
    async fn rpc(&self, params: Value) -> Result<Value, cc_types::ErrorEnvelope> {
        let request = parse_request(
            &serde_json::to_vec(&json!({
                "method":"gatehouse.lease.end", "params":params
            }))
            .unwrap(),
        )?;
        self.registry.dispatch(&request).await
    }
}

#[tokio::test]
async fn oscillating_population_is_screened_and_switches_at_most_once_per_window() {
    let room = Room::new(std::array::from_fn(|_| vec![]));
    let mut previous = Tier::S;
    let mut transitions = Vec::new();
    // Cross both margin edges repeatedly. Ten-minute expiry changes population;
    // five-second observations are well inside the thirty-second hysteresis.
    for second in (0..=4_000).step_by(5) {
        room.set(second);
        if second % 1_240 < 20 {
            room.population(12, second).await;
        } else if second % 300 == 0 {
            room.population(8, second).await;
        }
        let update = room.module.tick_governor().await.unwrap().unwrap();
        if update.tier != previous {
            transitions.push(second);
            previous = update.tier;
        }
    }
    assert!(transitions.len() >= 6, "exercise both edges repeatedly");
    assert!(transitions.windows(2).all(|p| p[1] - p[0] >= 30));
    let before = room.module.tick_governor().await.unwrap().unwrap().chatters;
    // Crisis messages are held by the deterministic gate and cannot inflate census.
    let screened = room
        .module
        .screen_batch(vec![message(999, 4_000, "I want to die")], &NoClassifier)
        .await
        .unwrap();
    assert_eq!(screened[0].decision.verdict, Verdict::Hold);
    let update = room.module.tick_governor().await.unwrap().unwrap();
    assert_eq!(update.chatters, before);
}

#[tokio::test]
async fn every_room_lease_expires_during_silence_without_renewal_or_viewer_actions() {
    let settings = vec![
        RoomSetting::Slow { interval_s: 10 },
        RoomSetting::FollowerOnly { minimum_age_s: 0 },
        RoomSetting::EmoteOnly,
        RoomSetting::UniqueChat,
    ];
    let room = Room::new([settings, vec![], vec![], vec![]]);
    room.module.tick_governor().await.unwrap();
    let leases = room.module.room_leases().await;
    assert_eq!(leases.len(), 4);
    room.set(60);
    // The service's periodic task must process expiry with no RPC, chat or manual tick.
    tokio::time::timeout(Duration::from_secs(5), async {
        loop {
            if room.module.room_leases().await.is_empty() {
                break;
            }
            tokio::time::sleep(Duration::from_millis(20)).await;
        }
    })
    .await
    .unwrap();
    room.set(600);
    assert!(
        room.module
            .tick_governor()
            .await
            .unwrap()
            .unwrap()
            .intents
            .is_empty()
    );
    let records = room.module.gate_roll().await.unwrap();
    assert_eq!(records.len(), 8);
    assert!(records.iter().all(|d| d.kind == DecisionKind::ModeChanged
        && d.message_id.as_str() == "configuration"
        && d.rule_id.is_none()
        && d.message_text.is_none()
        && d.simulated));
    for lease in leases {
        assert_eq!(
            records
                .iter()
                .filter(|d| d
                    .reason_codes
                    .contains(&format!("lease_id:{}", lease.lease_id.as_str())))
                .count(),
            2
        );
    }
    let Room {
        module,
        registry,
        root,
        ..
    } = room;
    drop(registry);
    drop(module);
    let store = Store::open(root.path().join("store")).unwrap();
    let ledger = store.read_ledger(LedgerKind::Decisions).unwrap();
    assert_eq!(ledger.len(), 8);
    assert!(ledger.iter().all(|line| matches!(
        line.event,
        LedgerEvent::Decision {
            user_id: None,
            action: DecisionAction::ModeChanged,
            ..
        }
    )));
}

#[tokio::test]
async fn human_twitch_setting_change_yields_through_service_until_original_expiry() {
    let room = Room::new([
        vec![RoomSetting::EmoteOnly],
        vec![RoomSetting::EmoteOnly],
        vec![],
        vec![],
    ]);
    room.module.tick_governor().await.unwrap();
    let lease = room.module.room_leases().await.remove(0);
    room.set(10);
    let observed = room
        .module
        .ingest_moderation(ModerationEvent {
            moderator: GateActor {
                user_id: TwitchUserId::parse("9000").unwrap(),
                login: "simulated_moderator".into(),
                simulated: true,
            },
            action: ExternalAction::RoomMode(RoomMode::EmoteOnly),
            message: None,
            at: at(10).try_into().unwrap(),
        })
        .await
        .unwrap();
    assert_eq!(observed.kind, DecisionKind::ModeChanged);
    assert_eq!(observed.message_id.as_str(), "configuration");
    room.population(12, 10).await;
    room.module.tick_governor().await.unwrap();
    room.set(40);
    let next = room.module.tick_governor().await.unwrap().unwrap();
    assert_eq!(next.tier, Tier::M);
    assert!(next.intents.is_empty());
    let yielded = room.module.room_leases().await.remove(0);
    assert!(yielded.yielded);
    assert_eq!(yielded.expires_at, lease.expires_at);
    assert_eq!(
        room.rpc(json!({"lease_id":lease.lease_id}))
            .await
            .unwrap_err()
            .code,
        ErrorCode::Conflict
    );
    room.set(59);
    assert!(
        room.module
            .tick_governor()
            .await
            .unwrap()
            .unwrap()
            .intents
            .is_empty()
    );
    room.set(60);
    let update = room.module.tick_governor().await.unwrap().unwrap();
    assert_eq!(
        update.intents.len(),
        1,
        "new tier may propose only after original expiry"
    );
    assert!(matches!(
        update.intents[0],
        cc_gatehouse::governor::RoomModeIntent::Apply { .. }
    ));
    let records = room.module.gate_roll().await.unwrap();
    assert!(records.iter().any(|d| {
        d.reason_codes.contains(&"governor_lease_expired".into())
            && d.reason_codes
                .contains(&format!("lease_id:{}", lease.lease_id.as_str()))
    }));
    assert_eq!(
        room.rpc(json!({"lease_id":lease.lease_id}))
            .await
            .unwrap_err()
            .code,
        ErrorCode::NotFound
    );
}

#[tokio::test]
async fn lease_end_rpc_resolves_only_service_owned_ids_and_records_room_decision() {
    let room = Room::new([vec![RoomSetting::UniqueChat], vec![], vec![], vec![]]);
    room.module.tick_governor().await.unwrap();
    let lease = room.module.room_leases().await.remove(0);
    assert_eq!(
        room.rpc(json!({})).await.unwrap_err().code,
        ErrorCode::Invalid
    );
    assert_eq!(
        room.rpc(json!({"lease_id":"not-ulid"}))
            .await
            .unwrap_err()
            .code,
        ErrorCode::Invalid
    );
    assert_eq!(
        room.rpc(json!({"lease_id":cc_types::LeaseId::mint()}))
            .await
            .unwrap_err()
            .code,
        ErrorCode::NotFound
    );
    let result = room.rpc(json!({"lease_id":lease.lease_id})).await.unwrap();
    assert_eq!(result["kind"], "mode_changed");
    assert_eq!(result["message_id"], "configuration");
    assert_eq!(result["simulated"], true);
    assert!(result.get("message_text").is_none());
    assert!(result.get("rule_id").is_none());
    assert_eq!(
        room.rpc(json!({"lease_id":lease.lease_id}))
            .await
            .unwrap_err()
            .code,
        ErrorCode::NotFound
    );
    room.set(60);
    assert!(
        room.module
            .tick_governor()
            .await
            .unwrap()
            .unwrap()
            .intents
            .is_empty()
    );
    assert_eq!(room.module.gate_roll().await.unwrap().len(), 2);
}

#[tokio::test]
async fn default_service_is_inactive_and_configured_service_refuses_real_intake() {
    let root = tempfile::tempdir().unwrap();
    let module = GatehouseModule::open(root.path(), Arc::new(TestClock(Mutex::new(0)))).unwrap();
    assert!(module.tick_governor().await.unwrap().is_none());
    assert!(module.gate_roll().await.unwrap().is_empty());
    let room = Room::new([vec![RoomSetting::EmoteOnly], vec![], vec![], vec![]]);
    let mut real = message(1, 0, "simulated fixture with real flag");
    real.simulated = false;
    assert_eq!(
        room.module
            .screen_batch(vec![real], &NoClassifier)
            .await
            .unwrap_err()
            .code,
        ErrorCode::BlockedByPolicy
    );
    assert!(room.module.gate_roll().await.unwrap().is_empty());
}

#[tokio::test]
async fn failed_expiry_audit_stops_ticks_and_is_visible_to_rpc_callers() {
    use std::io::Write;
    let room = Room::new([vec![RoomSetting::EmoteOnly], vec![], vec![], vec![]]);
    room.module.tick_governor().await.unwrap();
    let lease = room.module.room_leases().await.remove(0);
    std::fs::OpenOptions::new()
        .append(true)
        .open(room.root.path().join("store/decisions.jsonl"))
        .unwrap()
        .write_all(b"simulated corrupt tail\n")
        .unwrap();
    room.set(60);
    let failure = room.module.tick_governor().await.unwrap_err();
    assert_eq!(failure.code, ErrorCode::Internal);
    assert_eq!(room.module.tick_governor().await.unwrap_err(), failure);
    assert_eq!(
        room.rpc(json!({"lease_id":lease.lease_id}))
            .await
            .unwrap_err(),
        failure
    );
    assert_eq!(room.module.gate_roll().await.unwrap_err(), failure);
}
