// Adapted from Shadowrunr OS @ 7e4b6f8,
// crates/shadowrunr-daemon/src/platform/twitch/tests.rs.
//! Simulated Twitch envelopes, never recordings or real credentials.
use futures::SinkExt;
use serde_json::{Value, json};
use tokio::net::TcpStream;
use tokio_tungstenite::{WebSocketStream, tungstenite::Message};

pub(super) type Conn = WebSocketStream<TcpStream>;
pub(super) const ACCESS: &str = "simulated-access-original";
pub(super) const REFRESH: &str = "simulated-refresh-original";
pub(super) const ACCESS2: &str = "simulated-access-rotated";
pub(super) const REFRESH2: &str = "simulated-refresh-rotated";
pub(super) const BOT_ID: &str = "999";
pub(super) const BROADCASTER_ID: &str = "111";

pub(super) async fn send(ws: &mut Conn, frame: Value) {
    ws.send(Message::Text(frame.to_string().into()))
        .await
        .expect("simulated send");
}

pub(super) fn envelope(kind: &str, id: &str, payload: Value) -> Value {
    json!({"metadata": {"message_id": id, "message_type": kind,
        "message_timestamp": "2026-10-25T12:00:00Z"}, "payload": payload})
}

pub(super) fn welcome(id: &str) -> Value {
    envelope(
        "session_welcome",
        &format!("welcome-{id}"),
        json!({"session": {
            "id": id, "status": "connected", "keepalive_timeout_seconds": 10,
        }}),
    )
}

pub(super) fn reconnect(url: &str) -> Value {
    envelope(
        "session_reconnect",
        "simulated-reconnect",
        json!({"session": {
            "id": "S1", "reconnect_url": url,
        }}),
    )
}

pub(super) fn chat_event(chatter: &str, name: &str, id: &str, text: &str, badges: Value) -> Value {
    json!({"broadcaster_user_id": BROADCASTER_ID, "chatter_user_id": chatter,
        "chatter_user_name": name, "message_id": id, "message": {"text": text}, "badges": badges})
}

pub(super) fn notification(id: &str, event: Value) -> Value {
    let mut frame = envelope("notification", id, json!({"event": event}));
    frame["metadata"]["subscription_type"] = json!("channel.chat.message");
    frame
}

pub(super) fn assert_no_secret(text: &str) {
    for secret in [
        ACCESS,
        REFRESH,
        ACCESS2,
        REFRESH2,
        "simulated-device-secret",
    ] {
        assert!(!text.contains(secret), "simulated credential leaked");
    }
}
