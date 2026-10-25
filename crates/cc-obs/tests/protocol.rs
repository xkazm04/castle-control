//! All peers, Hello recordings and credentials here are generated simulated data.
use cc_obs::{BrowserSource, Client, Config, Error, PasswordReader};
use futures::{SinkExt, StreamExt};
use serde_json::{Value, json};
use std::{
    io::Write,
    sync::{Arc, Mutex},
    time::Duration,
};
use tokio::{
    net::{TcpListener, TcpStream},
    task::JoinHandle,
};
use tokio_tungstenite::{WebSocketStream, accept_async, tungstenite::Message};
use zeroize::Zeroizing;

const SENTINEL: &str = "simulated-obs-password";
const HELLO: &str = r#"{"op":0,"d":{"obsStudioVersion":"31.0.0-simulated","obsWebSocketVersion":"5.5.0-simulated","rpcVersion":1,"authentication":{"salt":"simulated-salt","challenge":"simulated-challenge"}}}"#;
struct SimulatedKeychain;
impl PasswordReader for SimulatedKeychain {
    fn read(&self, label: &str) -> Result<Zeroizing<String>, Error> {
        assert_eq!(label, "simulated-label");
        Ok(Zeroizing::new(SENTINEL.into()))
    }
}
type Socket = WebSocketStream<TcpStream>;
async fn frame(socket: &mut Socket) -> Value {
    let frame = tokio::time::timeout(Duration::from_secs(2), socket.next())
        .await
        .unwrap()
        .unwrap()
        .unwrap();
    serde_json::from_str(frame.to_text().unwrap()).unwrap()
}
async fn send(socket: &mut Socket, frame: Value) {
    socket
        .send(Message::Text(frame.to_string().into()))
        .await
        .unwrap();
}
async fn peer() -> (Config, JoinHandle<Socket>) {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let config = Config {
        port: listener.local_addr().unwrap().port(),
        password_label: "simulated-label".into(),
    };
    let task = tokio::spawn(async move {
        let mut socket = accept_async(listener.accept().await.unwrap().0)
            .await
            .unwrap();
        socket.send(Message::Text(HELLO.into())).await.unwrap();
        let identify = frame(&mut socket).await;
        assert_eq!(identify["op"], 1);
        assert_eq!(identify["d"]["rpcVersion"], 1);
        assert_eq!(identify["d"]["eventSubscriptions"], 0);
        // Independently calculated with Python hashlib, not the implementation under test.
        assert!(identify["d"]["authentication"] == "hhXX0601vwjVjnbHVKunUiX0uRmBULfqfVaEBrM2Mqk=");
        send(&mut socket, json!({"op":2,"d":{"negotiatedRpcVersion":1}})).await;
        socket
    });
    (config, task)
}
fn response(request: &Value, data: Value) -> Value {
    json!({"op":7,"d":{"requestType":request["d"]["requestType"],"requestId":request["d"]["requestId"],"requestStatus":{"result":true,"code":100},"responseData":data}})
}
fn source() -> BrowserSource {
    BrowserSource {
        scene_name: "simulated-scene".into(),
        source_name: "simulated-source".into(),
        url: "http://localhost:43210/".into(),
        width: 1280,
        height: 720,
    }
}

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
        send(&mut socket, response(&request, json!({"sceneItemId":12}))).await;
    });
    client.create_browser_source(&source()).await.unwrap();
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
