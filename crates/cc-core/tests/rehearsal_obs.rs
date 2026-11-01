//! Reuse D3a's generated authenticated peer; no owner OBS or credential store.
mod obs_rehearsal_support;
use cc_core::{AppState, NativeConfig, NativeServices};
use cc_types::{ErrorEnvelope, parse_request};
use obs_rehearsal_support::*;
use serde_json::{Value, json};
use std::{
    path::PathBuf,
    sync::{
        Arc,
        atomic::{AtomicU64, Ordering},
    },
};

static NEXT_ROOT: AtomicU64 = AtomicU64::new(0);
struct Root(PathBuf);
impl Root {
    fn new() -> Self {
        let path = std::env::temp_dir().join(format!(
            "cc-simulated-rehearsal-obs-{}-{}",
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
async fn rpc(app: &AppState, method: &str, params: Value) -> Result<Value, ErrorEnvelope> {
    let request =
        parse_request(&serde_json::to_vec(&json!({"method":method,"params":params})).unwrap())
            .unwrap();
    app.registry.dispatch(&request).await
}

#[tokio::test]
async fn status_observes_the_existing_scene_and_omits_it_while_disconnected() {
    let root = Root::new();
    let passwords = Arc::new(Passwords::default());
    let peer = Peer::start().await;
    let services = NativeServices::new_with_obs_password_store(
        NativeConfig {
            twitch: Default::default(),
            obs: cc_obs::Config {
                port: 0,
                password_label: LABEL.into(),
            },
            overlay_port: 0,
        },
        cc_store::Store::open(root.0.join("native")).unwrap(),
        Arc::new(|_| panic!("no simulated login")),
        passwords.clone(),
    )
    .await
    .unwrap();
    let app = services.app_rehearsal(256, &root.0).unwrap();
    let before = rpc(&app, "rehearsal.start", json!({})).await.unwrap();
    assert!(before.get("scene_name").is_none());
    assert_eq!(before["obs"]["connected"], false);
    rpc(
        &app,
        "obs.connect",
        json!({"host":"127.0.0.1", "port":peer.port,
        "password":SENTINEL,"remember":false}),
    )
    .await
    .unwrap();
    let connected = rpc(&app, "rehearsal.start", json!({})).await.unwrap();
    assert_eq!(connected["obs"]["connected"], true);
    assert!(connected.get("scene_name").is_none());
    rpc(
        &app,
        "obs.scene.ensure",
        json!({"scene_name":cc_core::rehearsal::SCENE_NAME}),
    )
    .await
    .unwrap();
    let ready = rpc(&app, "rehearsal.start", json!({})).await.unwrap();
    assert_eq!(ready["scene_name"], cc_core::rehearsal::SCENE_NAME);
    assert!(!serde_json::to_string(&ready).unwrap().contains(SENTINEL));
    assert!(passwords.writes.lock().unwrap().is_empty());
    assert!(peer.seen.connects.load(Ordering::SeqCst) > 0);
    drop(peer);
    tokio::task::yield_now().await;
    let stopped = rpc(&app, "rehearsal.stop", json!({})).await.unwrap();
    assert_eq!(stopped["obs"]["connected"], false);
    assert!(stopped.get("scene_name").is_none());
    app.shutdown();
    drop(app);
    drop(services);
    tokio::task::yield_now().await;
}
