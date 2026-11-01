//! Generated simulated OBS ownership evidence; no live OBS or OS keychain.
mod ownership_support;
use cc_obs::{Error, Ownership};
use ownership_support::*;
use serde_json::json;

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
const ENDPOINT: &str = "ws://simulated-obs:4455";

fn inventory(owned: bool) -> Step {
    step(
        "GetInputList",
        json!({}),
        json!({"inputs": if owned {
        vec![json!({"inputName":"simulated-source","inputUuid":"simulated-owned-uuid"})]
    } else { vec![] }}),
    )
}
fn scene_items(owned: bool, foreign: bool) -> Step {
    let mut items = Vec::new();
    if owned {
        items.push(json!({"sceneItemId":12,"sourceName":"simulated-source","sourceUuid":"simulated-owned-uuid"}));
    }
    if foreign {
        items.push(json!({"sceneItemId":99,"sourceName":"simulated-foreign-input","sourceUuid":"simulated-foreign-uuid"}));
    }
    step(
        "GetSceneItemList",
        json!({"sceneName":"simulated-scene"}),
        json!({"sceneItems":items}),
    )
}

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
        step("GetSceneList", json!({}), json!({"scenes":[]})),
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
        inventory(true),
        scene_items(true, true),
        step(
            "RemoveSceneItem",
            json!({"sceneName":"simulated-scene","sceneItemId":12}),
            json!({}),
        ),
        step(
            "RemoveInput",
            json!({"inputUuid":"simulated-owned-uuid"}),
            json!({}),
        ),
        inventory(false),
        scene_items(false, true),
        scene_items(false, true),
        scene_items(false, false),
        step(
            "RemoveScene",
            json!({"sceneName":"simulated-scene"}),
            json!({}),
        ),
        step("GetSceneList", json!({}), json!({"scenes":[]})),
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
    steps.extend([create(), inventory(true), scene_items(false, false)]);
    let mut rejected = step(
        "RemoveInput",
        json!({"inputUuid":"simulated-owned-uuid"}),
        json!({}),
    );
    rejected.code = 500;
    steps.extend([rejected, inventory(false), scene_items(false, false)]);
    let mut missing = step(
        "RemoveInput",
        json!({"inputUuid":"simulated-owned-uuid"}),
        json!({}),
    );
    missing.code = 600;
    steps.extend([missing, inventory(false), scene_items(false, false)]);
    let mut missing = step(
        "GetSceneItemList",
        json!({"sceneName":"simulated-scene"}),
        json!({}),
    );
    missing.code = 600;
    steps.extend([
        missing,
        step("GetSceneList", json!({}), json!({"scenes":[]})),
    ]);
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
    steps.extend([
        missing,
        step("GetSceneList", json!({}), json!({"scenes":[]})),
    ]);
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
