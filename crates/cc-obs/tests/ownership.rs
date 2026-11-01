//! Generated simulated OBS ownership evidence; no live OBS or OS keychain.
mod simulated;
use cc_obs::{Client, Error, Ownership};
use serde_json::{Value, json};
use simulated::*;
use std::{
    path::PathBuf,
    sync::atomic::{AtomicU64, Ordering},
    time::{SystemTime, UNIX_EPOCH},
};
use tokio::task::JoinHandle;

static NEXT_ROOT: AtomicU64 = AtomicU64::new(0);

struct Root(PathBuf);
impl Root {
    fn new() -> Self {
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
    fn read(&self) -> Value {
        serde_json::from_slice(&std::fs::read(self.0.join("ownership.json")).unwrap()).unwrap()
    }
}
impl Drop for Root {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

#[test]
fn temporary_roots_are_unique_in_parallel_and_cleanup_tolerates_missing_directory() {
    let roots = std::thread::scope(|scope| {
        let workers: Vec<_> = (0..16).map(|_| scope.spawn(Root::new)).collect();
        workers
            .into_iter()
            .map(|worker| worker.join().unwrap())
            .collect::<Vec<_>>()
    });
    let paths: std::collections::BTreeSet<_> = roots.iter().map(|root| root.0.clone()).collect();
    assert_eq!(paths.len(), roots.len());
    // Cleanup must also be harmless if a directory has already disappeared.
    std::fs::remove_dir_all(&roots[0].0).unwrap();
    drop(roots);
}
struct Step {
    kind: &'static str,
    data: Value,
    reply: Value,
    code: u32,
}
fn step(kind: &'static str, data: Value, reply: Value) -> Step {
    Step {
        kind,
        data,
        reply,
        code: 100,
    }
}
async fn script(steps: Vec<Step>) -> (Client, JoinHandle<()>) {
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
fn create() -> Step {
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
fn scenes() -> Vec<Step> {
    vec![
        step("GetSceneList", json!({}), json!({"scenes":[]})),
        step(
            "CreateScene",
            json!({"sceneName":"simulated-scene"}),
            json!({"sceneUuid":"simulated-scene-uuid"}),
        ),
    ]
}
const ENDPOINT: &str = "ws://simulated-obs:4455";

#[tokio::test]
async fn ensure_creates_once_and_never_claims_an_existing_scene() {
    let root = Root::new();
    let mut steps = scenes();
    steps.extend([
        step(
            "GetSceneList",
            json!({}),
            json!({"scenes":[{"sceneName":"simulated-scene"}]}),
        ),
        step(
            "GetSceneList",
            json!({}),
            json!({"scenes":[{"sceneName":"simulated-owner-scene"}]}),
        ),
        step(
            "GetSceneItemList",
            json!({"sceneName":"simulated-scene"}),
            json!({"sceneItems":[]}),
        ),
        step(
            "RemoveScene",
            json!({"sceneName":"simulated-scene"}),
            json!({}),
        ),
    ]);
    let (mut client, task) = script(steps).await;
    let mut ledger = Ownership::open(&root.0).unwrap();
    assert!(
        ledger
            .ensure_scene(&mut client, ENDPOINT, "simulated-scene")
            .await
            .unwrap()
    );
    assert!(
        !ledger
            .ensure_scene(&mut client, ENDPOINT, "simulated-scene")
            .await
            .unwrap()
    );
    assert!(
        !ledger
            .ensure_scene(&mut client, ENDPOINT, "simulated-owner-scene")
            .await
            .unwrap()
    );
    assert_eq!(
        root.read()["endpoints"][ENDPOINT]["scenes"],
        json!(["simulated-scene"])
    );
    assert_eq!(ledger.clear(&mut client, ENDPOINT).await.unwrap(), 0);
    task.await.unwrap();
}

#[tokio::test]
async fn capture_survives_restart_and_clear_preserves_foreign_items_and_nonempty_scene() {
    let root = Root::new();
    let mut steps = scenes();
    steps.extend([
        create(),
        step(
            "RemoveInput",
            json!({"inputUuid":"simulated-owned-uuid"}),
            json!({}),
        ),
        step(
            "GetSceneItemList",
            json!({"sceneName":"simulated-scene"}),
            json!({"sceneItems":[{"sceneItemId":99,"sourceName":"simulated-foreign-input"}]}),
        ),
        step(
            "GetSceneItemList",
            json!({"sceneName":"simulated-scene"}),
            json!({"sceneItems":[]}),
        ),
        step(
            "RemoveScene",
            json!({"sceneName":"simulated-scene"}),
            json!({}),
        ),
    ]);
    let (mut client, task) = script(steps).await;
    let mut ledger = Ownership::open(&root.0).unwrap();
    ledger
        .ensure_scene(&mut client, ENDPOINT, "simulated-scene")
        .await
        .unwrap();
    let created = ledger
        .create_source(&mut client, ENDPOINT, &source())
        .await
        .unwrap();
    assert_eq!(created.input_uuid, "simulated-owned-uuid");
    assert_eq!(created.scene_item_id, 12);
    let saved = root.read();
    assert_eq!(
        saved["endpoints"][ENDPOINT]["inputs"],
        json!([{
            "scene_name":"simulated-scene", "source_name":"simulated-source",
            "input_uuid":"simulated-owned-uuid", "scene_item_id":12
        }])
    );
    drop(ledger);
    let mut ledger = Ownership::open(&root.0).unwrap();
    // A different OBS endpoint must issue no cleanup requests at all.
    assert_eq!(
        ledger
            .clear(&mut client, "ws://other-simulated-obs:4455")
            .await
            .unwrap(),
        0
    );
    assert_eq!(ledger.clear(&mut client, ENDPOINT).await.unwrap(), 1);
    assert_eq!(root.read()["endpoints"][ENDPOINT]["inputs"], json!([]));
    assert_eq!(
        root.read()["endpoints"][ENDPOINT]["scenes"],
        json!(["simulated-scene"])
    );
    drop(ledger);
    let mut ledger = Ownership::open(&root.0).unwrap();
    assert_eq!(ledger.clear(&mut client, ENDPOINT).await.unwrap(), 0);
    assert_eq!(root.read()["endpoints"][ENDPOINT]["scenes"], json!([]));
    task.await.unwrap();
}

#[tokio::test]
async fn missing_inputs_and_scenes_are_dropped_but_other_rejections_retain_ownership() {
    let root = Root::new();
    let mut steps = scenes();
    steps.push(create());
    let mut rejected = step(
        "RemoveInput",
        json!({"inputUuid":"simulated-owned-uuid"}),
        json!({}),
    );
    rejected.code = 500;
    steps.push(rejected);
    let mut missing = step(
        "RemoveInput",
        json!({"inputUuid":"simulated-owned-uuid"}),
        json!({}),
    );
    missing.code = 600;
    steps.push(missing);
    let mut missing = step(
        "GetSceneItemList",
        json!({"sceneName":"simulated-scene"}),
        json!({}),
    );
    missing.code = 600;
    steps.push(missing);
    let (mut client, task) = script(steps).await;
    let mut ledger = Ownership::open(&root.0).unwrap();
    ledger
        .ensure_scene(&mut client, ENDPOINT, "simulated-scene")
        .await
        .unwrap();
    ledger
        .create_source(&mut client, ENDPOINT, &source())
        .await
        .unwrap();
    assert_eq!(
        ledger.clear(&mut client, ENDPOINT).await,
        Err(Error::Rejected)
    );
    assert_eq!(
        root.read()["endpoints"][ENDPOINT]["inputs"]
            .as_array()
            .unwrap()
            .len(),
        1
    );
    assert_eq!(ledger.clear(&mut client, ENDPOINT).await.unwrap(), 0);
    assert_eq!(ledger.clear(&mut client, ENDPOINT).await.unwrap(), 0);
    assert_eq!(
        root.read()["endpoints"][ENDPOINT],
        json!({"scenes":[],"inputs":[]})
    );
    task.await.unwrap();
}

#[tokio::test]
async fn scene_deleted_between_empty_check_and_removal_is_skipped() {
    let root = Root::new();
    let mut steps = scenes();
    steps.push(step(
        "GetSceneItemList",
        json!({"sceneName":"simulated-scene"}),
        json!({"sceneItems":[]}),
    ));
    let mut missing = step(
        "RemoveScene",
        json!({"sceneName":"simulated-scene"}),
        json!({}),
    );
    missing.code = 600;
    steps.push(missing);
    let (mut client, task) = script(steps).await;
    let mut ledger = Ownership::open(&root.0).unwrap();
    ledger
        .ensure_scene(&mut client, ENDPOINT, "simulated-scene")
        .await
        .unwrap();
    assert_eq!(ledger.clear(&mut client, ENDPOINT).await.unwrap(), 0);
    assert_eq!(root.read()["endpoints"][ENDPOINT]["scenes"], json!([]));
    task.await.unwrap();
}
