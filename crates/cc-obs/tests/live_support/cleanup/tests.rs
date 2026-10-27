//! Generated simulated OBS cleanup checks; no live guard or keychain access.
use super::*;
use futures::{FutureExt, SinkExt, StreamExt};
use std::{panic::AssertUnwindSafe, time::Duration};
use tokio::{net::TcpListener, task::JoinHandle};
use tokio_tungstenite::{accept_async, connect_async, tungstenite::Message};

struct Step {
    kind: &'static str,
    request: Value,
    response: Value,
    ok: bool,
}

fn step(kind: &'static str, request: Value, response: Value) -> Step {
    Step {
        kind,
        request,
        response,
        ok: true,
    }
}

async fn simulated(steps: Vec<Step>) -> (Observer, JoinHandle<()>) {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let peer = tokio::spawn(async move {
        let mut socket = accept_async(listener.accept().await.unwrap().0)
            .await
            .unwrap();
        for step in steps {
            let frame = tokio::time::timeout(Duration::from_secs(5), socket.next())
                .await
                .unwrap()
                .unwrap()
                .unwrap();
            let frame: Value = serde_json::from_str(frame.to_text().unwrap()).unwrap();
            assert_eq!(frame["op"], 6);
            assert_eq!(frame["d"]["requestType"], step.kind);
            assert_eq!(frame["d"]["requestData"], step.request);
            let response = json!({"op":7,"d":{
                "requestType":step.kind,"requestId":frame["d"]["requestId"],
                "requestStatus":{"result":step.ok,"code":if step.ok {100} else {600}},
                "responseData":step.response
            }});
            socket
                .send(Message::Text(response.to_string().into()))
                .await
                .unwrap();
        }
    });
    let (socket, _) = connect_async(format!("ws://{address}")).await.unwrap();
    (
        Observer {
            socket,
            sequence: 0,
            authenticated: false,
        },
        peer,
    )
}

#[tokio::test]
async fn simulated_cleanup_removes_matching_items_in_every_scene_then_polls() {
    let name = "cc-live-simulated-cleanup";
    let mut steps = vec![step(
        "GetSceneList",
        json!({}),
        json!({"scenes":[
            {"sceneName":"first"},{"sceneName":"second"}
        ]}),
    )];
    for scene in ["first", "second"] {
        steps.push(step(
            "GetSceneItemList",
            json!({"sceneName":scene}),
            json!({
                "sceneItems":[{"sourceName":"unrelated","sceneItemId":7},
                    {"sourceName":name,"sceneItemId":8},{"sourceName":name,"sceneItemId":9}]
            }),
        ));
        for id in [8, 9] {
            steps.push(step(
                "RemoveSceneItem",
                json!({"sceneName":scene,"sceneItemId":id}),
                json!({}),
            ));
        }
    }
    steps.extend([
        step("RemoveInput", json!({"inputName":name}), json!({})),
        step(
            "GetInputList",
            json!({}),
            json!({"inputs":[{"inputName":name}]}),
        ),
        step(
            "GetInputList",
            json!({}),
            json!({"inputs":[{"inputName":"unrelated"}]}),
        ),
    ]);
    let (mut observer, peer) = simulated(steps).await;
    success(&remove_input(&mut observer, name).await);
    peer.await.unwrap();
}

#[tokio::test]
async fn simulated_cleanup_falls_back_to_configured_scene_and_accepts_absence() {
    let name = "cc-live-simulated-never-created";
    let scene = std::env::var("CC_LIVE_OBS_SCENE").unwrap_or_else(|_| "Scene".into());
    let mut scenes = step("GetSceneList", json!({}), json!({}));
    scenes.ok = false;
    let mut removed = step("RemoveInput", json!({"inputName":name}), json!({}));
    removed.ok = false;
    let (mut observer, peer) = simulated(vec![
        scenes,
        step(
            "GetSceneItemList",
            json!({"sceneName":scene}),
            json!({"sceneItems":[]}),
        ),
        removed,
        step("GetInputList", json!({}), json!({"inputs":[]})),
    ])
    .await;
    let removed = remove_input(&mut observer, name).await;
    assert_eq!(removed["requestStatus"]["result"], false);
    peer.await.unwrap();
}

#[tokio::test]
async fn simulated_cleanup_bounds_wait_and_names_stuck_input() {
    let name = "cc-live-simulated-stuck";
    let mut steps = vec![
        step("GetSceneList", json!({}), json!({"scenes":[]})),
        step("RemoveInput", json!({"inputName":name}), json!({})),
    ];
    for _ in 0..40 {
        steps.push(step(
            "GetInputList",
            json!({}),
            json!({"inputs":[{"inputName":name}]}),
        ));
    }
    let (mut observer, peer) = simulated(steps).await;
    let outcome = tokio::time::timeout(
        Duration::from_secs(4),
        AssertUnwindSafe(remove_input(&mut observer, name)).catch_unwind(),
    )
    .await;
    peer.abort();
    let panic = outcome
        .expect("cleanup must finish within its bounded wait")
        .unwrap_err();
    let message = panic.downcast_ref::<String>().expect("cleanup diagnostic");
    assert!(message.contains("live cleanup failed") && message.contains(name));
}
