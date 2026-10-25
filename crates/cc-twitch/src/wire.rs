// Adapted from Shadowrunr OS @ 7e4b6f8,
// crates/shadowrunr-daemon/src/platform/twitch/eventsub.rs.
//! EventSub boundary: envelope, timestamp, session and chat schemas live here.
use serde::Deserialize;
use serde_json::Value;

use crate::{BridgeError, ChatMessage, Viewer};

#[derive(Debug)]
pub(crate) enum Frame {
    Welcome {
        session_id: String,
        keepalive_s: u64,
    },
    Keepalive,
    Reconnect(String),
    Notification {
        id: String,
        at: String,
        kind: String,
        event: Value,
    },
    Revocation(String),
}

#[derive(Deserialize)]
struct Envelope {
    metadata: Metadata,
    payload: Value,
}

#[derive(Deserialize)]
struct Metadata {
    message_id: String,
    message_type: String,
    message_timestamp: chrono::DateTime<chrono::Utc>,
    subscription_type: Option<String>,
}

#[derive(Deserialize)]
struct SessionPayload {
    session: Session,
}

#[derive(Deserialize)]
struct Session {
    id: String,
    keepalive_timeout_seconds: Option<u64>,
    reconnect_url: Option<String>,
}

#[derive(Deserialize)]
struct RevokedPayload {
    subscription: RevokedSubscription,
}
#[derive(Deserialize)]
struct RevokedSubscription {
    status: String,
}
#[derive(Deserialize)]
struct EventPayload {
    event: serde_json::Map<String, Value>,
}

pub(crate) fn parse_frame(text: &str) -> Result<Frame, BridgeError> {
    let env: Envelope = serde_json::from_str(text)
        .map_err(|_| BridgeError::Invalid("invalid EventSub envelope"))?;
    let invalid = || BridgeError::Invalid("invalid EventSub payload");
    if env.metadata.message_id.is_empty() {
        return Err(invalid());
    }
    match env.metadata.message_type.as_str() {
        "session_welcome" | "session_reconnect" => {
            let payload: SessionPayload =
                serde_json::from_value(env.payload).map_err(|_| invalid())?;
            if payload.session.id.is_empty() {
                return Err(invalid());
            }
            if env.metadata.message_type == "session_reconnect" {
                Ok(Frame::Reconnect(
                    payload.session.reconnect_url.ok_or_else(invalid)?,
                ))
            } else {
                Ok(Frame::Welcome {
                    session_id: payload.session.id,
                    keepalive_s: payload
                        .session
                        .keepalive_timeout_seconds
                        .unwrap_or(10)
                        .max(1),
                })
            }
        }
        "session_keepalive" => Ok(Frame::Keepalive),
        "notification" => {
            let payload: EventPayload =
                serde_json::from_value(env.payload).map_err(|_| invalid())?;
            Ok(Frame::Notification {
                id: env.metadata.message_id,
                at: env
                    .metadata
                    .message_timestamp
                    .to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
                kind: env.metadata.subscription_type.ok_or_else(invalid)?,
                event: Value::Object(payload.event),
            })
        }
        "revocation" => {
            let payload: RevokedPayload =
                serde_json::from_value(env.payload).map_err(|_| invalid())?;
            Ok(Frame::Revocation(payload.subscription.status))
        }
        _ => Err(invalid()),
    }
}

#[derive(Deserialize)]
struct ChatEvent {
    chatter_user_id: String,
    chatter_user_name: String,
    message_id: String,
    message: ChatText,
    #[serde(default)]
    badges: Vec<Badge>,
}
#[derive(Deserialize)]
struct ChatText {
    text: String,
}
#[derive(Deserialize)]
struct Badge {
    set_id: String,
    #[serde(default)]
    id: String,
}

pub(crate) fn map_chat(event: &Value, bot_id: &str, at: &str) -> Option<ChatMessage> {
    let e: ChatEvent = serde_json::from_value(event.clone()).ok()?;
    if e.chatter_user_id.is_empty() || e.chatter_user_id == bot_id || e.message_id.is_empty() {
        return None;
    }
    let has = |set: &str| e.badges.iter().any(|b| b.set_id == set);
    let sub_tier = e
        .badges
        .iter()
        .find(|b| b.set_id == "subscriber")
        .map(|b| match b.id.parse::<u32>().unwrap_or(0) {
            n if n >= 3000 => 3,
            n if n >= 2000 => 2,
            _ => 1,
        })
        .or_else(|| has("founder").then_some(1));
    let is_mod = has("moderator") || has("broadcaster");
    Some(ChatMessage {
        id: e.message_id,
        at: at.into(),
        viewer: Viewer {
            id: e.chatter_user_id,
            name: e.chatter_user_name,
            is_mod,
            sub_tier,
        },
        text: e.message.text,
    })
}
