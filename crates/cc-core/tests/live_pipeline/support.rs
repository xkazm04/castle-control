//! Generated simulated ingress only; the production adapter itself marks live
//! records non-simulated. No Twitch credential, keychain or network is used.
use cc_core::{AppState, ChatIngress, NativeConfig, NativeServices};
use cc_types::parse_request;
use serde_json::{Value, json};
use std::sync::Arc;

pub struct Harness {
    pub app: Arc<AppState>,
    pub services: Arc<NativeServices>,
    pub root: tempfile::TempDir,
}
impl Harness {
    pub async fn new() -> Self {
        let root = tempfile::tempdir().unwrap();
        let services = services(root.path()).await;
        let app = services.app_with_data_dir(4096, root.path()).unwrap();
        Self {
            app,
            services,
            root,
        }
    }
    pub async fn draw(&self) {
        rpc(&self.app, "lots.draw.upsert", json!({"draw":draw()})).await;
    }
    pub fn pipeline(&self) -> Arc<cc_core::live::ShadowPipeline> {
        self.app.registry.shadow_pipeline().unwrap().unwrap()
    }
}
pub async fn services(root: &std::path::Path) -> Arc<NativeServices> {
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
        Arc::new(|_| panic!("no simulated login")),
    )
    .await
    .unwrap()
}
pub async fn rpc(app: &AppState, method: &str, params: Value) -> Value {
    let request =
        parse_request(&serde_json::to_vec(&json!({"method":method,"params":params})).unwrap())
            .unwrap();
    app.registry.dispatch(&request).await.unwrap()
}
pub fn chat(user: u32, text: &str) -> ChatIngress {
    ChatIngress {
        login: format!("simulated_{user}"),
        message: cc_twitch::ChatMessage {
            id: format!("simulated-{user}"),
            at: cc_types::Timestamp::now().into(),
            viewer: cc_twitch::Viewer {
                id: user.to_string(),
                name: format!("simulated_{user}"),
                is_mod: false,
                sub_tier: None,
            },
            text: text.into(),
        },
    }
}
pub fn rule(class: &str) -> Value {
    let mut rule = json!({"rule_id":"simulated-rule","name":"Simulated rule", "rule_class":class,
        "mode":"shadow","action":"delete","delivery":"streamer"});
    if class == "pattern" {
        rule["pattern"] = json!("tagged");
    } else {
        rule["text"] = json!("Simulated prohibited content");
    }
    rule
}
pub fn draw() -> Value {
    json!({"draw_id":"simulated-draw","name":"Simulated questions",
        "policy":{"content":"question","paid_entry":false,"paid_weight":false,
            "subscriber_only":false,"channel_points":false,"free_entry_equal_odds":true,
            "regions":[],"prize_value_usd_cents":0,"registration_confirmed":false,
            "official_rules":true,"twitch_disclaimer":true},
        "rules":{"pool":{"kind":"keyword","keyword":"!join"},"winner_count":1,
            "cooldown_s":60,"cohort_caps":[],"weight_curve":{"kind":"equal"},"free_join_equal_odds":true}})
}
pub async fn wait_for(app: &AppState, kind: cc_types::EventKind, count: usize) {
    tokio::time::timeout(std::time::Duration::from_secs(5), async {
        loop {
            if app
                .events
                .since(0)
                .unwrap()
                .iter()
                .filter(|event| event.kind == kind)
                .count()
                >= count
            {
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(5)).await;
        }
    })
    .await
    .unwrap();
}
