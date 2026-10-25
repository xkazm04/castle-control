//! A simulated local OBS peer; the Hello needs no keychain credentials.
use cc_core::{NativeConfig, NativeServices};
use cc_store::Store;
use cc_types::{EventKind, parse_request};
use futures::{SinkExt, StreamExt};
use serde_json::{Value, json};
use std::{
    sync::{Arc, Mutex},
    time::Duration,
};

#[tokio::test]
async fn native_obs_rpc_reads_live_status_creates_owned_source_and_invalidates_changes() {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();
    let seen = Arc::new(Mutex::new(Vec::<Value>::new()));
    let requests = seen.clone();
    let peer = tokio::spawn(async move {
        let mut socket = tokio_tungstenite::accept_async(listener.accept().await.unwrap().0)
            .await
            .unwrap();
        socket
            .send(tokio_tungstenite::tungstenite::Message::Text(
                json!({"op":0,"d":{"rpcVersion":1}}).to_string().into(),
            ))
            .await
            .unwrap();
        let identify = socket.next().await.unwrap().unwrap();
        let identify: Value = serde_json::from_str(identify.to_text().unwrap()).unwrap();
        assert!(identify["d"].get("authentication").is_none());
        socket
            .send(tokio_tungstenite::tungstenite::Message::Text(
                json!({"op":2,"d":{"negotiatedRpcVersion":1}})
                    .to_string()
                    .into(),
            ))
            .await
            .unwrap();
        while let Some(Ok(frame)) = socket.next().await {
            let request: Value = serde_json::from_str(frame.to_text().unwrap()).unwrap();
            let response = if request["d"]["requestType"] == "GetVersion" {
                json!({"obsVersion":"simulated","obsWebSocketVersion":"5-simulated","rpcVersion":1,"availableRequests":["GetVersion","CreateInput"]})
            } else {
                assert_eq!(request["d"]["requestType"], "CreateInput");
                json!({"sceneItemId":1})
            };
            requests.lock().unwrap().push(request.clone());
            socket.send(tokio_tungstenite::tungstenite::Message::Text(json!({"op":7,"d":{
                "requestId":request["d"]["requestId"],"requestType":request["d"]["requestType"],
                "requestStatus":{"result":true,"code":100},"responseData":response
            }}).to_string().into())).await.unwrap();
        }
    });
    let directory = tempfile::tempdir().unwrap();
    let service = NativeServices::new(
        NativeConfig {
            twitch: Default::default(),
            obs: cc_obs::Config {
                port,
                password_label: "simulated-unused-label".into(),
            },
            overlay_port: 0,
        },
        Store::open(directory.path()).unwrap(),
        Arc::new(|_| panic!("no live login")),
    )
    .await
    .unwrap();
    let app = service.app(32).unwrap();
    let request = parse_request(br#"{"method":"obs.status.get","params":{}}"#).unwrap();
    assert_eq!(
        app.registry.dispatch(&request).await.unwrap(),
        json!({"connected":true})
    );
    let request = parse_request(&serde_json::to_vec(&json!({"method":"obs.source.create","params":{
        "scene_name":"simulated-scene","source_name":"simulated-source","url":service.overlay_url(),"width":1280,"height":720
    }})).unwrap()).unwrap();
    assert_eq!(
        app.registry.dispatch(&request).await.unwrap(),
        json!({"source_name":"simulated-source"})
    );
    let request = parse_request(br#"{"method":"status.get","params":{}}"#).unwrap();
    assert_eq!(
        app.registry.dispatch(&request).await.unwrap()["obs_connected"],
        true
    );
    assert!(
        app.events
            .since(0)
            .unwrap()
            .iter()
            .any(|e| e.kind == EventKind::ObsStatus)
    );
    let source = seen
        .lock()
        .unwrap()
        .iter()
        .find(|v| v["d"]["requestType"] == "CreateInput")
        .unwrap()
        .clone();
    assert_eq!(
        source["d"]["requestData"]["inputSettings"]["url"],
        service.overlay_url()
    );
    let cursor = app.events.since(0).unwrap().last().unwrap().seq;
    peer.abort();
    let _ = peer.await;
    assert!(service.obs_status().await.is_err());
    tokio::time::timeout(Duration::from_secs(2), async {
        loop {
            if app
                .events
                .since(cursor)
                .unwrap()
                .iter()
                .any(|e| e.kind == EventKind::ObsStatus)
            {
                break;
            }
            tokio::task::yield_now().await;
        }
    })
    .await
    .unwrap();
    assert_eq!(
        app.registry.dispatch(&request).await.unwrap()["obs_connected"],
        false
    );
    app.shutdown();
}
