//! All peers, Hello recordings and credentials here are generated simulated data.
mod simulated;
use cc_obs::{Client, Error};
use serde_json::json;
use simulated::*;
use std::{
    io::Write,
    sync::{Arc, Mutex},
};

#[tokio::test]
async fn recorded_simulated_hello_authenticates_then_correlates_get_version() {
    let (config, peer) = peer().await;
    let mut client = Client::connect_with_reader(&config, &SimulatedKeychain)
        .await
        .unwrap();
    let task = tokio::spawn(async move {
        let mut socket = peer.await.unwrap();
        let request = frame(&mut socket).await;
        assert_eq!(request["d"]["requestType"], "GetVersion");
        let data = json!({"obsVersion":"31-simulated","obsWebSocketVersion":"5-simulated","rpcVersion":1,"availableRequests":["GetVersion","CreateInput"]});
        let mut wrong = response(&request, data.clone());
        wrong["d"]["requestId"] = json!("unrelated-id");
        send(&mut socket, wrong).await;
        send(
            &mut socket,
            json!({"op":5,"d":{"eventType":"simulated-event"}}),
        )
        .await;
        send(&mut socket, response(&request, data)).await;
    });
    let version = client.get_version().await.unwrap();
    assert_eq!(version.obs_version, "31-simulated");
    assert!(
        version
            .available_requests
            .iter()
            .any(|r| r == "CreateInput")
    );
    task.await.unwrap();
}

#[tokio::test]
async fn create_input_has_browser_source_shape_and_rejects_unsafe_origins() {
    let (config, peer) = peer().await;
    let mut client = Client::connect_with_reader(&config, &SimulatedKeychain)
        .await
        .unwrap();
    for url in [
        "https://example.com/",
        "http://127.0.0.1:43210/",
        "http://localhost:43210/rpc",
        "http://localhost:43210/?token=simulated",
        "http://localhost:0/",
    ] {
        let mut invalid = source();
        invalid.url = url.into();
        assert_eq!(
            client.create_browser_source(&invalid).await,
            Err(Error::Invalid)
        );
    }
    let task = tokio::spawn(async move {
        let mut socket = peer.await.unwrap();
        let request = frame(&mut socket).await;
        assert_eq!(request["op"], 6);
        assert_eq!(request["d"]["requestType"], "CreateInput");
        assert_eq!(
            request["d"]["requestData"],
            json!({
                "sceneName":"simulated-scene","inputName":"simulated-source","inputKind":"browser_source","sceneItemEnabled":true,
                "inputSettings":{"url":"http://localhost:43210/","width":1280,"height":720,"is_local_file":false,"shutdown":false}
            })
        );
        send(
            &mut socket,
            response(
                &request,
                json!({"sceneItemId":12,"inputUuid":"simulated-input-uuid"}),
            ),
        )
        .await;
    });
    client.create_browser_source(&source()).await.unwrap();
    task.await.unwrap();
}

#[tokio::test]
async fn beacons_create_input_preserves_display_url_hash_and_both_obs_sizes() {
    let (config, peer) = peer().await;
    let mut client = Client::connect_with_reader(&config, &SimulatedKeychain)
        .await
        .unwrap();
    let url = format!(
        "http://localhost:43210/beacons/simulated-frame?scale=0.5&package_hash={}&anchor=br",
        "a".repeat(64)
    );
    let expected_url = url.clone();
    let task = tokio::spawn(async move {
        let mut socket = peer.await.unwrap();
        for (width, height) in [(1920, 1080), (1280, 720)] {
            let request = frame(&mut socket).await;
            assert_eq!(request["d"]["requestType"], "CreateInput");
            let settings = &request["d"]["requestData"]["inputSettings"];
            assert_eq!(settings["url"], expected_url);
            assert_eq!(settings["width"], width);
            assert_eq!(settings["height"], height);
            send(&mut socket, response(&request, json!({"sceneItemId":1}))).await;
        }
    });
    for suffix in ["&remote=bad", "&package_hash=bad"] {
        let mut invalid = source();
        invalid.url = format!("{url}{suffix}");
        assert_eq!(
            client.create_browser_source(&invalid).await,
            Err(Error::Invalid)
        );
    }
    for (width, height) in [(1920, 1080), (1280, 720)] {
        let mut source = source();
        source.url.clone_from(&url);
        source.width = width;
        source.height = height;
        client.create_browser_source(&source).await.unwrap();
    }
    task.await.unwrap();
}

#[tokio::test]
async fn wrong_response_type_is_rejected_even_when_request_id_matches() {
    let (config, peer) = peer().await;
    let mut client = Client::connect_with_reader(&config, &SimulatedKeychain)
        .await
        .unwrap();
    let task = tokio::spawn(async move {
        let mut socket = peer.await.unwrap();
        let request = frame(&mut socket).await;
        let mut reply = response(&request, json!({}));
        reply["d"]["requestType"] = json!("WrongType");
        send(&mut socket, reply).await;
    });
    assert_eq!(
        client.create_browser_source(&source()).await,
        Err(Error::Protocol)
    );
    task.await.unwrap();
}

#[tokio::test]
async fn simulated_get_version_requires_rpc_one() {
    let (config, peer) = peer().await;
    let mut client = Client::connect_with_reader(&config, &SimulatedKeychain)
        .await
        .unwrap();
    let task = tokio::spawn(async move {
        let mut socket = peer.await.unwrap();
        let request = frame(&mut socket).await;
        send(
            &mut socket,
            response(
                &request,
                json!({"obsVersion":"simulated",
            "obsWebSocketVersion":"simulated","rpcVersion":2,"availableRequests":[]}),
            ),
        )
        .await;
    });
    assert!(matches!(client.get_version().await, Err(Error::Protocol)));
    task.await.unwrap();
}

#[derive(Clone, Default)]
struct Captured(Arc<Mutex<Vec<u8>>>);
impl Write for Captured {
    fn write(&mut self, bytes: &[u8]) -> std::io::Result<usize> {
        self.0.lock().unwrap().extend_from_slice(bytes);
        Ok(bytes.len())
    }
    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}
#[tokio::test]
async fn log_grep_excludes_password_and_token_even_from_hostile_error_comments() {
    let output = Captured::default();
    let writer = output.clone();
    let subscriber = tracing_subscriber::fmt()
        .with_max_level(tracing::Level::INFO)
        .with_writer(move || writer.clone())
        .finish();
    let _guard = tracing::subscriber::set_default(subscriber);
    let (config, peer) = peer().await;
    let mut client = Client::connect_with_reader(&config, &SimulatedKeychain)
        .await
        .unwrap();
    let token = "simulated-twitch-access-sentinel";
    let task = tokio::spawn(async move {
        let mut socket = peer.await.unwrap();
        let request = frame(&mut socket).await;
        let mut reply = response(&request, json!({}));
        reply["d"]["requestStatus"] =
            json!({"result":false,"code":400,"comment":format!("{SENTINEL} {token}")});
        send(&mut socket, reply).await;
    });
    let error = client.create_browser_source(&source()).await.unwrap_err();
    tracing::info!(%error, "simulated OBS outcome");
    task.await.unwrap();
    let bytes = output.0.lock().unwrap().clone();
    let logs = String::from_utf8(bytes).unwrap();
    assert!(logs.contains("simulated OBS outcome"));
    assert!(!logs.contains(SENTINEL));
    assert!(!logs.contains(token));
    assert!(!format!("{error:?} {error}").contains(SENTINEL));
}
