//! Owner-run wire observer. No connection, keychain read or overlay before guard.
use base64::{Engine, engine::general_purpose::STANDARD};
use cc_obs::{Client, Config};
use futures::{SinkExt, StreamExt};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tokio::net::TcpStream;
use tokio_tungstenite::{MaybeTlsStream, WebSocketStream, tungstenite::Message};
use zeroize::Zeroizing;

pub fn guard() {
    assert!(
        std::env::var("CC_LIVE_OBS").as_deref() == Ok("1"),
        "live OBS disabled: CC_LIVE_OBS must be exactly 1; no network or keychain access attempted"
    );
}

pub fn config() -> Config {
    guard();
    Config {
        port: 4455,
        password_label: "local-obs".into(),
    }
}

pub async fn client() -> Client {
    guard();
    Client::connect(&config())
        .await
        .expect("live OBS connection/identification failed (details withheld)")
}

pub fn run_id() -> String {
    format!(
        "cc-live-{}-{}",
        std::process::id(),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock before epoch")
            .as_nanos()
    )
}

type Socket = WebSocketStream<MaybeTlsStream<TcpStream>>;
pub struct Observer {
    socket: Socket,
    sequence: u64,
    pub authenticated: bool,
}

async fn receive(socket: &mut Socket) -> Value {
    tokio::time::timeout(Duration::from_secs(5), async {
        loop {
            match socket.next().await {
                Some(Ok(Message::Text(text))) => {
                    return serde_json::from_str(&text)
                        .unwrap_or_else(|_| panic!("live OBS invalid JSON (frame withheld)"));
                }
                Some(Ok(Message::Ping(_))) => socket.flush().await.expect("live OBS pong failed"),
                Some(Ok(Message::Pong(_))) => {}
                _ => panic!("live OBS transport closed (frame withheld)"),
            }
        }
    })
    .await
    .expect("live OBS receive timed out")
}

async fn send(socket: &mut Socket, value: Value) {
    tokio::time::timeout(
        Duration::from_secs(5),
        socket.send(Message::Text(value.to_string().into())),
    )
    .await
    .expect("live OBS send timed out")
    .unwrap_or_else(|_| panic!("live OBS send failed (frame withheld)"));
}

impl Observer {
    pub async fn connect() -> Self {
        guard();
        let (mut socket, _) = tokio::time::timeout(
            Duration::from_secs(5),
            tokio_tungstenite::connect_async("ws://127.0.0.1:4455"),
        )
        .await
        .expect("live OBS connect timed out")
        .unwrap_or_else(|_| panic!("live OBS unavailable on 127.0.0.1:4455"));
        let hello = receive(&mut socket).await;
        assert!(hello["op"] == 0, "live OBS must send Hello op 0");
        assert!(
            hello["d"]["rpcVersion"].as_u64().is_some_and(|v| v >= 1),
            "live OBS must offer RPC >= 1"
        );
        let mut identify = json!({"op":1,"d":{"rpcVersion":1,"eventSubscriptions":0}});
        let challenge = &hello["d"]["authentication"];
        let authenticated = !challenge.is_null();
        if authenticated {
            // Exactly the production keychain service/label; no env/argument secret door.
            let password = Zeroizing::new(
                keyring::Entry::new("castlecontrol-obs", "local-obs")
                    .unwrap_or_else(|_| panic!("live OBS keychain entry unavailable"))
                    .get_password()
                    .unwrap_or_else(|_| {
                        panic!("live OBS keychain password unavailable (value withheld)")
                    }),
            );
            let salt = challenge["salt"].as_str().expect("live OBS salt missing");
            let nonce = challenge["challenge"]
                .as_str()
                .expect("live OBS challenge missing");
            let mut hash = Sha256::new();
            hash.update(password.as_bytes());
            hash.update(salt.as_bytes());
            let secret = Zeroizing::new(STANDARD.encode(hash.finalize()));
            let mut hash = Sha256::new();
            hash.update(secret.as_bytes());
            hash.update(nonce.as_bytes());
            let authentication = Zeroizing::new(STANDARD.encode(hash.finalize()));
            identify["d"]["authentication"] = json!(&*authentication);
        }
        send(&mut socket, identify).await;
        let identified = receive(&mut socket).await;
        assert!(
            identified["op"] == 2 && identified["d"]["negotiatedRpcVersion"] == 1,
            "live OBS must acknowledge Identify with negotiated RPC 1"
        );
        Self {
            socket,
            sequence: 0,
            authenticated,
        }
    }

    pub async fn request(&mut self, kind: &str, data: Value) -> Value {
        self.sequence += 1;
        let id = format!("cc-live-observer-{}", self.sequence);
        send(
            &mut self.socket,
            json!({"op":6,"d":{"requestType":kind,"requestId":id,"requestData":data}}),
        )
        .await;
        tokio::time::timeout(Duration::from_secs(5), async {
            loop {
                let frame = receive(&mut self.socket).await;
                if frame["op"] == 5 {
                    continue;
                }
                assert!(frame["op"] == 7, "live OBS response must use op 7");
                let data = &frame["d"];
                if data["requestId"] != id {
                    continue;
                }
                assert!(
                    data["requestType"] == kind,
                    "live OBS response type must correlate"
                );
                return data.clone();
            }
        })
        .await
        .expect("live OBS correlated response timed out")
    }

    pub async fn close(mut self) {
        tokio::time::timeout(Duration::from_secs(5), self.socket.close(None))
            .await
            .expect("live OBS close timed out")
            .expect("live OBS close failed");
    }
}

pub fn success(data: &Value) {
    assert!(
        data["requestStatus"]["result"] == true && data["requestStatus"]["code"] == 100,
        "live OBS request must succeed with status 100 (peer details withheld)"
    );
}
