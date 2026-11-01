//! Generated simulated OBS ownership evidence; no live OBS or OS keychain.
#[path = "../simulated/mod.rs"]
mod simulated;
use cc_obs::Client;
use serde_json::{Value, json};
pub use simulated::{SimulatedKeychain, frame, peer, response, send, source};
use std::{
    path::PathBuf,
    sync::atomic::{AtomicU64, Ordering},
    time::{SystemTime, UNIX_EPOCH},
};
use tokio::task::JoinHandle;

static NEXT_ROOT: AtomicU64 = AtomicU64::new(0);

pub(super) struct Root(pub(super) PathBuf);
impl Root {
    pub(super) fn new() -> Self {
        let root = std::env::temp_dir().join(format!(
            "cc-obs-simulated-{}-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos(),
            NEXT_ROOT.fetch_add(1, Ordering::Relaxed)
        ));
        std::fs::create_dir_all(&root).unwrap();
        Self(root)
    }
    pub(super) fn read(&self) -> Value {
        serde_json::from_slice(&std::fs::read(self.0.join("ownership.json")).unwrap()).unwrap()
    }
}
impl Drop for Root {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

pub(super) struct Step {
    pub(super) kind: &'static str,
    pub(super) data: Value,
    pub(super) reply: Value,
    pub(super) code: u32,
}
pub(super) fn step(kind: &'static str, data: Value, reply: Value) -> Step {
    Step {
        kind,
        data,
        reply,
        code: 100,
    }
}
pub(super) async fn script(steps: Vec<Step>) -> (Client, JoinHandle<()>) {
    let (config, peer) = peer().await;
    let client = Client::connect_with_reader(&config, &SimulatedKeychain)
        .await
        .unwrap();
    let task = tokio::spawn(async move {
        let mut socket = peer.await.unwrap();
        for step in steps {
            let request = frame(&mut socket).await;
            assert_eq!(request["d"]["requestType"], step.kind);
            assert_eq!(request["d"]["requestData"], step.data);
            let mut reply = response(&request, step.reply);
            reply["d"]["requestStatus"] = json!({"result": step.code == 100, "code": step.code,
                "comment":"simulated peer diagnostic withheld"});
            send(&mut socket, reply).await;
        }
    });
    (client, task)
}
pub(super) fn create() -> Step {
    let source = source();
    step(
        "CreateInput",
        json!({"sceneName":source.scene_name,"inputName":source.source_name,
        "inputKind":"browser_source","sceneItemEnabled":true,
        "inputSettings":{"url":source.url,"width":source.width,"height":source.height,
            "is_local_file":false,"shutdown":false}}),
        json!({"inputUuid":"simulated-owned-uuid", "sceneItemId":12}),
    )
}
pub(super) fn scenes() -> Vec<Step> {
    vec![
        step("GetSceneList", json!({}), json!({"scenes":[]})),
        step(
            "CreateScene",
            json!({"sceneName":"simulated-scene"}),
            json!({"sceneUuid":"simulated-scene-uuid"}),
        ),
    ]
}
