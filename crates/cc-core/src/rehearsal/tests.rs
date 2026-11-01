//! Generated simulated inputs only; no owner session, live chat or public network.
mod beacons;
mod lots;
use super::*;
use crate::{AppState, NativeConfig};
use cc_types::parse_request;
use serde_json::json;
use std::{path::PathBuf, time::Duration};

static NEXT_ROOT: AtomicU64 = AtomicU64::new(0);
pub(super) struct Root(PathBuf);
impl Root {
    fn new() -> Self {
        let path = std::env::temp_dir().join(format!(
            "cc-simulated-rehearsal-{}-{}",
            std::process::id(),
            NEXT_ROOT.fetch_add(1, Ordering::Relaxed)
        ));
        std::fs::create_dir_all(&path).unwrap();
        Self(path)
    }
}
impl Drop for Root {
    fn drop(&mut self) {
        let _cleanup = std::fs::remove_dir_all(&self.0);
    }
}
struct Harness {
    module: Arc<RehearsalModule>,
    app: Arc<AppState>,
    services: Arc<NativeServices>,
    root: Root,
}
impl Harness {
    async fn new() -> Self {
        let root = Root::new();
        let services = NativeServices::new(
            NativeConfig {
                twitch: cc_twitch::TwitchConfig::default(),
                obs: cc_obs::Config {
                    port: 0,
                    password_label: "simulated-unused".into(),
                },
                overlay_port: 0,
            },
            cc_store::Store::open(root.0.join("native")).unwrap(),
            Arc::new(|_| panic!("simulated rehearsal cannot log in")),
        )
        .await
        .unwrap();
        let app = services.app_with_data_dir(4096, &root.0).unwrap();
        let module = Arc::new(
            RehearsalModule::new(&app.registry, Arc::downgrade(&services), app.events.clone())
                .unwrap(),
        );
        Self {
            module,
            app,
            services,
            root,
        }
    }
    async fn close(self) {
        self.module.stop().await.unwrap();
        self.app.shutdown();
        drop(self.module);
        drop(self.app);
        drop(self.services);
        tokio::task::yield_now().await;
        drop(self.root);
    }
}
fn request(method: &str, params: Value) -> RpcRequest {
    parse_request(&serde_json::to_vec(&json!({"method":method,"params":params})).unwrap()).unwrap()
}
async fn call(module: &RehearsalModule, method: &str, params: Value) -> Value {
    let request = request(method, params);
    request
        .validate_result(module.call(&request).await.unwrap())
        .unwrap()
}
fn provenance(chat: &ChatIngress) {
    assert!(chat.simulated);
    assert!(chat.login.starts_with("simulated_viewer_"));
    assert!(chat.message.id.starts_with("simulated-rehearsal-"));
    assert!(chat.message.text.contains("SIMULATED"));
    assert_eq!(chat.message.viewer.name, chat.login);
    assert!(chat.message.viewer.id.bytes().all(|b| b.is_ascii_digit()));
}
async fn collect(
    receiver: &mut broadcast::Receiver<ChatIngress>,
    count: usize,
) -> Vec<ChatIngress> {
    tokio::time::timeout(Duration::from_secs(10), async {
        let mut messages = Vec::new();
        while messages.len() < count {
            let chat = receiver.recv().await.unwrap();
            provenance(&chat);
            messages.push(chat);
        }
        messages
    })
    .await
    .unwrap()
}
async fn settle(events: &EventHub, count: usize) {
    tokio::time::timeout(Duration::from_secs(3), async {
        loop {
            if events
                .since(0)
                .unwrap()
                .iter()
                .filter(|e| e.kind == EventKind::ChatMessage)
                .count()
                >= count
            {
                break;
            }
            tokio::time::sleep(Duration::from_millis(5)).await;
        }
    })
    .await
    .unwrap();
}

#[tokio::test]
async fn start_stop_are_idempotent_and_publish_the_typed_status_binding() {
    let h = Harness::new().await;
    let mut payloads = h.module.subscribe();
    for (method, active) in [
        ("rehearsal.start", true),
        ("rehearsal.start", true),
        ("rehearsal.stop", false),
        ("rehearsal.stop", false),
    ] {
        let status = call(&h.module, method, json!({})).await;
        assert_eq!(status["active"], active);
        assert_eq!(status["crowd_per_minute"], 0);
        assert_eq!(status["obs"], json!({"connected":false}));
        assert!(status.get("scene_name").is_none());
        let RehearsalEventPayload::Status(payload) = payloads.recv().await.unwrap();
        assert_eq!(serde_json::to_value(payload).unwrap(), status);
    }
    assert_eq!(
        h.app
            .events
            .since(0)
            .unwrap()
            .iter()
            .filter(|e| e.kind == EventKind::RehearsalStatus)
            .count(),
        4
    );
    h.close().await;
}

#[tokio::test(start_paused = true)]
async fn crowd_has_bounded_jitter_and_zero_and_stop_cancel_generation() {
    let h = Harness::new().await;
    call(&h.module, "rehearsal.start", json!({})).await;
    let mut receiver = h.module.door.sender.subscribe();
    call(&h.module, "rehearsal.crowd.set", json!({"per_minute":600})).await;
    tokio::task::yield_now().await;
    for _ in 0..300 {
        tokio::time::advance(Duration::from_millis(10)).await;
        tokio::task::yield_now().await;
    }
    let mut count = 0;
    while let Ok(chat) = receiver.try_recv() {
        provenance(&chat);
        count += 1;
    }
    // 10ms scheduling quantisation plus 80..120ms jitter at 600/minute.
    assert!((22..=38).contains(&count), "generated {count}");
    call(&h.module, "rehearsal.crowd.set", json!({"per_minute":0})).await;
    tokio::time::advance(Duration::from_secs(1)).await;
    assert!(receiver.try_recv().is_err());
    call(&h.module, "rehearsal.crowd.set", json!({"per_minute":600})).await;
    call(
        &h.module,
        "rehearsal.scenario.run",
        json!({"scenario":"duel_round"}),
    )
    .await;
    call(&h.module, "rehearsal.stop", json!({})).await;
    while let Ok(chat) = receiver.try_recv() {
        provenance(&chat);
    }
    tokio::time::advance(Duration::from_secs(10)).await;
    assert!(receiver.try_recv().is_err());
    assert_eq!(h.module.session.lock().unwrap().rate, 0);
    h.close().await;
}

#[tokio::test]
async fn scenarios_refuse_inactive_sessions_and_missing_beacon_visual() {
    let h = Harness::new().await;
    assert!(parse_request(br#"{"method":"rehearsal.scenario.run","params":{"scenario":"vote_round","text":"SIMULATED caller text"}}"#).is_err());
    assert!(
        parse_request(br#"{"method":"rehearsal.crowd.set","params":{"per_minute":601}}"#).is_err()
    );
    assert_eq!(
        h.module
            .call(&request("rehearsal.crowd.set", json!({"per_minute":1})))
            .await
            .unwrap_err()
            .code,
        ErrorCode::Conflict
    );
    for scenario in ["lots_fill", "vote_round", "duel_round"] {
        assert_eq!(
            call(
                &h.module,
                "rehearsal.scenario.run",
                json!({"scenario":scenario})
            )
            .await,
            json!({"accepted":false})
        );
    }
    for active in [false, true] {
        if active {
            call(&h.module, "rehearsal.start", json!({})).await;
        }
        let error = h
            .module
            .call(&request(
                "rehearsal.scenario.run",
                json!({"scenario":"beacon_fire"}),
            ))
            .await
            .unwrap_err();
        assert_eq!(error.code, ErrorCode::Invalid);
    }
    h.close().await;
}

#[tokio::test]
async fn vote_and_duel_scenarios_use_the_real_chat_consumer_and_simulated_vote_bar() {
    let h = Harness::new().await;
    call(&h.module, "rehearsal.start", json!({})).await;
    let mut receiver = h.module.door.sender.subscribe();
    let accepted = tokio::time::timeout(
        Duration::from_millis(100),
        call(
            &h.module,
            "rehearsal.scenario.run",
            json!({"scenario":"vote_round"}),
        ),
    )
    .await
    .unwrap();
    assert_eq!(accepted, json!({"accepted":true}));
    let messages = collect(&mut receiver, 30).await;
    assert_eq!(
        messages
            .iter()
            .map(|m| &m.message.viewer.id)
            .collect::<std::collections::BTreeSet<_>>()
            .len(),
        30
    );
    settle(&h.app.events, 30).await;
    let client = reqwest::Client::builder().no_proxy().build().unwrap();
    let html = client
        .get(format!("{}gatehouse/current", h.services.overlay_url()))
        .send()
        .await
        .unwrap()
        .text()
        .await
        .unwrap();
    assert!(html.contains("SIMULATED"));
    let snapshot: cc_types::VoteBarSnapshot = serde_json::from_str(
        html.split_once("id=\"cc-vote-bar\">")
            .unwrap()
            .1
            .split_once("</script>")
            .unwrap()
            .0,
    )
    .unwrap();
    assert!(snapshot.simulated && !snapshot.directions.is_empty());
    call(
        &h.module,
        "rehearsal.scenario.run",
        json!({"scenario":"duel_round"}),
    )
    .await;
    let messages = collect(&mut receiver, 30).await;
    assert_eq!(
        messages
            .iter()
            .filter(|m| m.message.text == "1 SIMULATED")
            .count(),
        20
    );
    assert_eq!(
        messages
            .iter()
            .filter(|m| m.message.text == "2! SIMULATED")
            .count(),
        10
    );
    settle(&h.app.events, 60).await;
    let stage = h
        .app
        .registry
        .tiltyard()
        .unwrap()
        .stage()
        .await
        .unwrap()
        .session
        .unwrap();
    assert_eq!(stage.phase, cc_types::TiltyardSessionPhase::Live);
    assert_eq!(
        stage.counted,
        cc_types::TiltyardCounted {
            left: 20,
            right: 10
        }
    );
    assert!(stage.simulated);
    let snapshot = h
        .app
        .registry
        .tiltyard()
        .unwrap()
        .snapshot()
        .await
        .unwrap()
        .unwrap();
    assert_eq!(
        snapshot.left.label,
        "Sample: Castle".to_owned().try_into().unwrap()
    );
    assert_eq!(
        snapshot.right.label,
        "Sample: Sky".to_owned().try_into().unwrap()
    );
    assert_eq!(snapshot.ballots, 30);
    assert!(snapshot.simulated);
    tokio::time::sleep(Duration::from_millis(5)).await;
    let tiltyard = h.app.registry.tiltyard().unwrap();
    tiltyard
        .turn(&cc_types::TiltyardAction::Reset {})
        .await
        .unwrap();
    let fresh = tiltyard.snapshot().await.unwrap().unwrap();
    assert_eq!(fresh.ballots, 0);
    assert!(fresh.simulated, "sample contestants remain generated data");
    drop(tiltyard);
    h.close().await;
}
