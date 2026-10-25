use cc_core::{AppState, Registry, bind};
use cc_types::{ErrorEnvelope, EventKind, StatusResult, StreamEvent};
use futures::StreamExt;
use serde_json::json;
use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::sync::Arc;
use std::time::Duration;
use tokio::task::JoinHandle;
use tokio_tungstenite::{connect_async, tungstenite::client::IntoClientRequest};

type Socket =
    tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>;
struct Harness {
    state: Arc<AppState>,
    address: SocketAddr,
    task: Option<JoinHandle<std::io::Result<()>>>,
}
impl Harness {
    async fn start(capacity: usize) -> Self {
        let state = AppState::new(Registry::with_status(), capacity).unwrap();
        let (address, server) = bind(Arc::clone(&state), SocketAddr::from(([127, 0, 0, 1], 0)))
            .await
            .unwrap();
        Self {
            state,
            address,
            task: Some(tokio::spawn(server)),
        }
    }
    fn url(&self, path: &str) -> String {
        format!("http://{}{path}", self.address)
    }
    async fn socket(&self, since: u64) -> Socket {
        let mut request = format!("ws://{}/events?since_seq={since}", self.address)
            .into_client_request()
            .unwrap();
        request.headers_mut().insert(
            "authorization",
            format!("Bearer {}", self.state.session_token())
                .parse()
                .unwrap(),
        );
        connect_async(request).await.unwrap().0
    }
    async fn stop(mut self) {
        self.state.shutdown();
        tokio::time::timeout(Duration::from_secs(3), self.task.take().unwrap())
            .await
            .unwrap()
            .unwrap()
            .unwrap();
    }
}
impl Drop for Harness {
    fn drop(&mut self) {
        self.state.shutdown();
        if let Some(task) = self.task.take() {
            task.abort();
        }
    }
}

async fn next(socket: &mut Socket) -> StreamEvent {
    let message = tokio::time::timeout(Duration::from_secs(2), socket.next())
        .await
        .unwrap()
        .unwrap()
        .unwrap();
    serde_json::from_str(message.to_text().unwrap()).unwrap()
}

#[tokio::test]
async fn non_loopback_and_alternate_loopback_binds_are_refused() {
    let state = AppState::new(Registry::with_status(), 4).unwrap();
    for ip in [
        IpAddr::V4(Ipv4Addr::UNSPECIFIED),
        "192.0.2.1".parse().unwrap(),
        "127.0.0.2".parse().unwrap(),
        "::1".parse().unwrap(),
    ] {
        let result = bind(Arc::clone(&state), SocketAddr::new(ip, 0)).await;
        assert_eq!(
            result.err().unwrap().kind(),
            std::io::ErrorKind::PermissionDenied
        );
    }
}

#[tokio::test]
async fn rpc_and_events_require_the_per_launch_session_token() {
    let h = Harness::start(4).await;
    let client = reqwest::Client::new();
    for path in ["/rpc", "/events"] {
        for token in [None, Some("simulated-wrong-capability")] {
            let mut request = if path == "/rpc" {
                client.post(h.url(path))
            } else {
                client.get(h.url(path))
            };
            if let Some(token) = token {
                request = request.bearer_auth(token);
            }
            let response = request.send().await.unwrap();
            assert_eq!(response.status(), 401);
            assert_eq!(
                response.json::<ErrorEnvelope>().await.unwrap().code,
                cc_types::ErrorCode::Unauthorized
            );
        }
    }
    let other = AppState::new(Registry::with_status(), 4).unwrap();
    assert_ne!(h.state.session_token(), other.session_token());
    let response = client
        .post(h.url("/rpc"))
        .bearer_auth(other.session_token())
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 401);
    let unauthenticated = connect_async(format!("ws://{}/events", h.address))
        .await
        .err()
        .unwrap();
    assert!(
        matches!(unauthenticated, tokio_tungstenite::tungstenite::Error::Http(r) if r.status() == 401)
    );
    let response = client
        .post(h.url("/rpc"))
        .bearer_auth(h.state.session_token())
        .json(&json!({"method":"status.get","params":{}}))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 200);
    let status = response.json::<StatusResult>().await.unwrap();
    assert_eq!(status.version, "0.1.0");
    assert!(!status.twitch_connected && !status.obs_connected && !status.simulated);
    h.stop().await;
}

#[tokio::test]
async fn reconnect_with_since_seq_delivers_every_missed_event_in_order_then_live() {
    let h = Harness::start(8).await;
    h.state.events.publish(EventKind::BridgeStatus).unwrap();
    let mut socket = h.socket(0).await;
    assert_eq!(next(&mut socket).await.seq, 1);
    socket.close(None).await.unwrap();
    h.state.events.publish(EventKind::BridgeGap).unwrap();
    h.state.events.publish(EventKind::ObsStatus).unwrap();
    let mut socket = h.socket(1).await;
    for seq in [2, 3] {
        assert_eq!(next(&mut socket).await.seq, seq);
    }
    h.state.events.publish(EventKind::BridgeStatus).unwrap();
    assert_eq!(next(&mut socket).await.seq, 4);
    drop(socket);
    h.stop().await;
}

#[tokio::test]
async fn rolled_over_buffer_sends_one_resync_then_live_events() {
    let h = Harness::start(2).await;
    for _ in 0..5 {
        h.state.events.publish(EventKind::BridgeStatus).unwrap();
    }
    let mut socket = h.socket(1).await;
    let frame = next(&mut socket).await;
    assert_eq!((frame.seq, frame.kind), (5, EventKind::Resync));
    h.state.events.publish(EventKind::ObsStatus).unwrap();
    let frame = next(&mut socket).await;
    assert_eq!((frame.seq, frame.kind), (6, EventKind::ObsStatus));
    drop(socket);
    let mut socket = h.socket(999).await;
    assert_eq!(next(&mut socket).await.kind, EventKind::Resync);
    drop(socket);
    h.stop().await;
}

#[tokio::test]
async fn browser_socket_capability_is_not_echoed_and_localhost_overlay_origins_are_refused() {
    let h = Harness::start(2).await;
    let mut request = format!("ws://{}/events?since_seq=0", h.address)
        .into_client_request()
        .unwrap();
    request.headers_mut().insert(
        "sec-websocket-protocol",
        format!("cc-events, cc-session.{}", h.state.session_token())
            .parse()
            .unwrap(),
    );
    request
        .headers_mut()
        .insert("origin", "tauri://localhost".parse().unwrap());
    let (mut socket, response) = connect_async(request).await.unwrap();
    assert_eq!(response.headers()["sec-websocket-protocol"], "cc-events");
    h.state.events.publish(EventKind::BridgeStatus).unwrap();
    assert_eq!(next(&mut socket).await.seq, 1);
    drop(socket);
    let response = reqwest::Client::new()
        .post(h.url("/rpc"))
        .bearer_auth(h.state.session_token())
        .header("origin", "http://localhost:1234")
        .json(&json!({"method":"status.get","params":{}}))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 403);
    h.stop().await;
}

#[tokio::test]
async fn invalid_requests_stay_in_the_error_envelope_and_unknown_routes_do_not_exist() {
    let h = Harness::start(2).await;
    let client = reqwest::Client::new();
    for body in [
        json!({"method":"status.get","params":{"extra":1}}),
        json!({"method":"unknown","params":{}}),
    ] {
        let response = client
            .post(h.url("/rpc"))
            .bearer_auth(h.state.session_token())
            .json(&body)
            .send()
            .await
            .unwrap();
        assert_eq!(response.status(), 400);
        assert_eq!(
            response.json::<ErrorEnvelope>().await.unwrap().code,
            cc_types::ErrorCode::Invalid
        );
    }
    let response = client
        .get(h.url("/events?since_seq=invalid"))
        .bearer_auth(h.state.session_token())
        .send()
        .await
        .unwrap();
    assert_eq!(
        response.json::<ErrorEnvelope>().await.unwrap().code,
        cc_types::ErrorCode::Invalid
    );
    let response = client
        .post(h.url("/rpc"))
        .bearer_auth(h.state.session_token())
        .header("content-type", "application/json")
        .body("x".repeat(2 * 1024 * 1024 + 1))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 413);
    assert_eq!(
        response.json::<ErrorEnvelope>().await.unwrap().code,
        cc_types::ErrorCode::Invalid
    );
    assert_eq!(
        client.get(h.url("/overlay")).send().await.unwrap().status(),
        404
    );
    h.stop().await;
}

#[tokio::test]
async fn shutdown_closes_an_attached_socket() {
    let h = Harness::start(2).await;
    let mut socket = h.socket(0).await;
    h.state.shutdown();
    let frame = tokio::time::timeout(Duration::from_secs(2), socket.next())
        .await
        .unwrap()
        .unwrap()
        .unwrap();
    assert!(
        matches!(frame, tokio_tungstenite::tungstenite::Message::Close(Some(c)) if u16::from(c.code) == 1001)
    );
    drop(socket);
    h.stop().await;
}
