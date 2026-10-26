//! Generated simulated OBS peer; binds only an ephemeral loopback port.
use cc_obs::{BrowserSource, Config, Error, PasswordReader};
use futures::{SinkExt, StreamExt};
use serde_json::{Value, json};
use std::time::Duration;
use tokio::{
    net::{TcpListener, TcpStream},
    task::JoinHandle,
};
use tokio_tungstenite::{WebSocketStream, accept_async, tungstenite::Message};
use zeroize::Zeroizing;

pub const SENTINEL: &str = "simulated-obs-password";
const HELLO: &str = r#"{"op":0,"d":{"obsStudioVersion":"31.0.0-simulated","obsWebSocketVersion":"5.5.0-simulated","rpcVersion":1,"authentication":{"salt":"simulated-salt","challenge":"simulated-challenge"}}}"#;
pub struct SimulatedKeychain;
impl PasswordReader for SimulatedKeychain {
    fn read(&self, label: &str) -> Result<Zeroizing<String>, Error> {
        assert_eq!(label, "simulated-label");
        Ok(Zeroizing::new(SENTINEL.into()))
    }
}
pub type Socket = WebSocketStream<TcpStream>;
pub async fn frame(socket: &mut Socket) -> Value {
    let frame = tokio::time::timeout(Duration::from_secs(2), socket.next())
        .await
        .unwrap()
        .unwrap()
        .unwrap();
    serde_json::from_str(frame.to_text().unwrap()).unwrap()
}
pub async fn send(socket: &mut Socket, frame: Value) {
    socket
        .send(Message::Text(frame.to_string().into()))
        .await
        .unwrap();
}
pub async fn peer() -> (Config, JoinHandle<Socket>) {
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
pub fn response(request: &Value, data: Value) -> Value {
    json!({"op":7,"d":{"requestType":request["d"]["requestType"],"requestId":request["d"]["requestId"],"requestStatus":{"result":true,"code":100},"responseData":data}})
}
pub fn source() -> BrowserSource {
    BrowserSource {
        scene_name: "simulated-scene".into(),
        source_name: "simulated-source".into(),
        url: "http://localhost:43210/".into(),
        width: 1280,
        height: 720,
    }
}
