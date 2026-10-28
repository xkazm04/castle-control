// Adapted from Shadowrunr OS @ 7e4b6f8,
// crates/shadowrunr-daemon/src/platform/twitch/{mod.rs,eventsub.rs}.
use std::time::Duration;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct TwitchConfig {
    pub client_id: String,
    pub channel: String,
    /// Enabled module ids; core is always enabled. Least privilege is requested on login.
    pub modules: Vec<String>,
}

#[derive(Debug, Clone)]
pub(crate) struct Endpoints {
    pub id_base: String,
    pub helix_base: String,
    pub eventsub_url: String,
    pub time_unit: Duration,
    pub validate_every: Duration,
}

impl Default for Endpoints {
    fn default() -> Self {
        Self {
            id_base: "https://id.twitch.tv".into(),
            helix_base: "https://api.twitch.tv/helix".into(),
            eventsub_url: "wss://eventsub.wss.twitch.tv/ws".into(),
            time_unit: Duration::from_secs(1),
            validate_every: Duration::from_secs(3600),
        }
    }
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BridgeState {
    #[default]
    Disconnected,
    Connecting,
    Connected,
    Error,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct BridgeStatus {
    pub state: BridgeState,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bot_login: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub channel: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_gap: Option<ConnectionGap>,
}

/// Crate-local continuity window; cc-core maps it to the generated wire contract.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ConnectionGap {
    pub from: String,
    pub to: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceLogin {
    pub verification_uri: String,
    pub user_code: String,
    pub expires_s: u32,
}

/// Crate-local payload for cc-core to wrap in its seq/at event envelope.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind")]
pub enum BridgeEvent {
    #[serde(rename = "bridge.gap")]
    Gap { from: String, to: String },
    /// Internal ingress; not a new /events contract identifier.
    #[serde(skip)]
    Notification(Notification),
}

#[derive(Debug, Clone)]
pub struct Notification {
    pub id: String,
    pub at: String,
    pub subscription_type: String,
    pub event: serde_json::Value,
    pub chat: Option<ChatMessage>,
}

impl Notification {
    /// Private normalized serde payload for the core contribution schema door.
    /// No cc-types dependency or public RPC/event payload is introduced here.
    pub fn contribution(&self) -> Result<Option<serde_json::Value>, BridgeError> {
        crate::eventsub::contribution(self)
    }

    /// Typed view through the same schema door used at WebSocket ingress.
    /// Keep the public struct shape compatible with existing offline producers.
    pub fn moderation(
        &self,
    ) -> Result<Option<crate::moderation::ModerationNotification>, BridgeError> {
        let version = crate::scopes::MODULE_SCOPES
            .iter()
            .flat_map(|module| module.topics)
            .find(|topic| topic.name == self.subscription_type)
            .map(|topic| topic.version);
        crate::moderation::parse_notification(&self.subscription_type, version, &self.event)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Viewer {
    pub id: String,
    pub name: String,
    pub is_mod: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sub_tier: Option<u8>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ChatMessage {
    pub id: String,
    pub at: String,
    pub viewer: Viewer,
    pub text: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum BridgeError {
    Invalid(&'static str),
    Unavailable(&'static str),
    Unauthorized,
    Upstream(u16),
    RateLimited { retry_after_ms: u64 },
}

impl std::fmt::Display for BridgeError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Unauthorized => f.write_str("Twitch login expired or revoked; reconnect"),
            Self::RateLimited { retry_after_ms } => {
                write!(f, "Twitch rate limited; retry in {retry_after_ms} ms")
            }
            Self::Upstream(status) => write!(f, "Twitch HTTP {status}"),
            Self::Invalid(reason) | Self::Unavailable(reason) => f.write_str(reason),
        }
    }
}

impl std::error::Error for BridgeError {}

/// WP 0.3 wires this to cc-store's purge_all. Failure is surfaced, never ignored.
#[async_trait::async_trait]
pub trait RevocationHandler: Send + Sync {
    async fn purge_all(&self) -> Result<(), BridgeError>;
}

pub(crate) fn now() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

pub(crate) fn truncate_chars(text: &str, max: usize) -> &str {
    text.char_indices()
        .nth(max)
        .map(|(i, _)| &text[..i])
        .unwrap_or(text)
}
