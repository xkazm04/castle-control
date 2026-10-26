//! Transport adapters only: the caller must authorize each moderation action.
use reqwest::Method;
use serde::Serialize;
use serde_json::{Value, json};

use crate::{BridgeError, TwitchBridge};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum HeldMessageAction {
    Allow,
    Deny,
}

/// The Helix delay is disabled or exactly 2, 4 or 6 seconds.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ChatDelay {
    Disabled,
    TwoSeconds,
    FourSeconds,
    SixSeconds,
}

impl TwitchBridge {
    pub async fn warn(&self, viewer_id: &str, reason: &str) -> Result<(), BridgeError> {
        if viewer_id.trim().is_empty() || reason.trim().is_empty() {
            return Err(BridgeError::Invalid("warn: viewer id and reason required"));
        }
        let (b, m) = self.ids()?;
        let _: Value = self
            .vault
            .call(
                Method::POST,
                "/moderation/warnings",
                &[("broadcaster_id", &b), ("moderator_id", &m)],
                Some(json!({"data": {"user_id": viewer_id,
                "reason": crate::types::truncate_chars(reason, 500)}})),
            )
            .await?;
        Ok(())
    }

    pub async fn resolve_held_message(
        &self,
        message_id: &str,
        action: HeldMessageAction,
    ) -> Result<(), BridgeError> {
        if message_id.trim().is_empty() {
            return Err(BridgeError::Invalid("held message: no message id"));
        }
        let (_, m) = self.ids()?;
        let _: Value = self
            .vault
            .call(
                Method::POST,
                "/moderation/automod/message",
                &[],
                Some(json!({"user_id": m, "msg_id": message_id, "action": action})),
            )
            .await?;
        Ok(())
    }

    pub async fn set_shield_mode(&self, active: bool) -> Result<(), BridgeError> {
        let (b, m) = self.ids()?;
        let _: Value = self
            .vault
            .call(
                Method::PUT,
                "/moderation/shield_mode",
                &[("broadcaster_id", &b), ("moderator_id", &m)],
                Some(json!({"is_active": active})),
            )
            .await?;
        Ok(())
    }

    pub async fn set_chat_delay(&self, delay: ChatDelay) -> Result<(), BridgeError> {
        let (b, m) = self.ids()?;
        let seconds = match delay {
            ChatDelay::Disabled => None,
            ChatDelay::TwoSeconds => Some(2),
            ChatDelay::FourSeconds => Some(4),
            ChatDelay::SixSeconds => Some(6),
        };
        let mut body = json!({"non_moderator_chat_delay": seconds.is_some()});
        if let Some(seconds) = seconds {
            body["non_moderator_chat_delay_duration"] = json!(seconds);
        }
        let _: Value = self
            .vault
            .call(
                Method::PATCH,
                "/chat/settings",
                &[("broadcaster_id", &b), ("moderator_id", &m)],
                Some(body),
            )
            .await?;
        Ok(())
    }
}
