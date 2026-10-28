use crate::EventHub;
use cc_twitch::{BridgeEvent, BridgeState as State};
use cc_types::{
    BridgeGap, BridgeState, BridgeStatus, ErrorCode, ErrorEnvelope, EventKind, Timestamp,
};

#[derive(Clone)]
pub struct ChatIngress {
    /// Twitch's verified login, distinct from a potentially localized display name.
    pub login: String,
    pub message: cc_twitch::ChatMessage,
}
// Error diagnostics (including broadcast SendError) must never echo chat.
impl std::fmt::Debug for ChatIngress {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("ChatIngress").finish_non_exhaustive()
    }
}
pub(crate) fn chat_ingress(notification: cc_twitch::Notification) -> Option<ChatIngress> {
    #[derive(serde::Deserialize)]
    struct Identity {
        chatter_user_login: String,
        chatter_user_id: String,
    }
    let identity: Identity = serde_json::from_value(notification.event).ok()?;
    let message = notification.chat?;
    if identity.chatter_user_id != message.viewer.id
        || identity.chatter_user_login.is_empty()
        || !identity
            .chatter_user_login
            .bytes()
            .all(|v| v.is_ascii_alphanumeric() || v == b'_')
    {
        return None;
    }
    Some(ChatIngress {
        login: identity.chatter_user_login.to_ascii_lowercase(),
        message,
    })
}

/// One mapping door for the bridge's private payload and the public contract.
pub fn bridge_status(status: cc_twitch::BridgeStatus) -> Result<BridgeStatus, ErrorEnvelope> {
    Ok(BridgeStatus {
        state: match status.state {
            State::Disconnected => BridgeState::Disconnected,
            State::Connecting => BridgeState::Connecting,
            State::Connected => BridgeState::Connected,
            State::Error => BridgeState::Error,
        },
        last_gap: status
            .last_gap
            .map(|gap| -> Result<_, ErrorEnvelope> {
                Ok(BridgeGap {
                    from: timestamp(gap.from)?,
                    to: timestamp(gap.to)?,
                })
            })
            .transpose()?,
    })
}
fn timestamp(value: String) -> Result<Timestamp, ErrorEnvelope> {
    value
        .try_into()
        .map_err(|_| ErrorEnvelope::new(ErrorCode::Upstream, "invalid bridge timestamp"))
}

/// Only invalidations leave the service, never chat text or a credential payload.
pub fn forward_bridge_event(hub: &EventHub, event: &BridgeEvent) -> Result<(), ErrorEnvelope> {
    match event {
        BridgeEvent::Gap { .. } => {
            hub.publish(EventKind::BridgeGap)?;
        }
        BridgeEvent::Notification(notification) if notification.chat.is_some() => {
            // Legacy fixture/spike invalidation. The native shadow host publishes
            // this only after a committed verdict, through ShadowPipeline.
            hub.publish(EventKind::ChatMessage)?;
        }
        _ => {}
    }
    Ok(())
}
