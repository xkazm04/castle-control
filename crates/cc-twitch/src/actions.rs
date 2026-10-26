// Adapted from Shadowrunr OS @ 7e4b6f8,
// crates/shadowrunr-daemon/src/platform/twitch/helix.rs.
use reqwest::Method;
use serde::Deserialize;
use serde_json::{Value, json};

use crate::scopes::Topic;
use crate::types::truncate_chars;
use crate::{BridgeError, TwitchBridge};

#[derive(Deserialize)]
struct Data<T> {
    data: Vec<T>,
}
#[derive(Deserialize)]
struct UserId {
    id: String,
}
#[derive(Deserialize)]
struct Sent {
    is_sent: bool,
}

#[derive(Deserialize)]
struct Subscription {
    id: String,
    status: String,
    #[serde(rename = "type")]
    kind: String,
    version: String,
}

impl TwitchBridge {
    pub(crate) fn ids(&self) -> Result<(String, String), BridgeError> {
        let live = self.live.lock().expect("bridge state");
        match (&live.broadcaster_id, &live.user_id) {
            (Some(b), Some(m)) => Ok((b.clone(), m.clone())),
            _ => Err(BridgeError::Unavailable("Twitch not connected")),
        }
    }

    pub(crate) async fn user_id(&self, login: &str) -> Result<Option<String>, BridgeError> {
        let body: Data<UserId> = self
            .vault
            .call(Method::GET, "/users", &[("login", login)], None)
            .await?;
        Ok(body.data.into_iter().next().map(|user| user.id))
    }

    /// Gatehouse owns authorization of actions; this adapter only transports them.
    pub async fn delete(&self, message_id: &str) -> Result<(), BridgeError> {
        if message_id.trim().is_empty() {
            return Err(BridgeError::Invalid("delete: no message id"));
        }
        let (b, m) = self.ids()?;
        let _: Value = self
            .vault
            .call(
                Method::DELETE,
                "/moderation/chat",
                &[
                    ("broadcaster_id", &b),
                    ("moderator_id", &m),
                    ("message_id", message_id),
                ],
                None,
            )
            .await?;
        Ok(())
    }

    async fn ban_request(
        &self,
        viewer_id: &str,
        seconds: Option<u32>,
        reason: &str,
    ) -> Result<(), BridgeError> {
        if viewer_id.trim().is_empty() {
            return Err(BridgeError::Invalid("ban: no viewer id"));
        }
        let (b, m) = self.ids()?;
        let mut data = json!({"user_id": viewer_id, "reason": truncate_chars(reason, 500)});
        if let Some(seconds) = seconds {
            data["duration"] = json!(seconds.clamp(1, 1_209_600));
        }
        let _: Value = self
            .vault
            .call(
                Method::POST,
                "/moderation/bans",
                &[("broadcaster_id", &b), ("moderator_id", &m)],
                Some(json!({"data": data})),
            )
            .await?;
        Ok(())
    }

    pub async fn timeout(
        &self,
        viewer_id: &str,
        seconds: u32,
        reason: &str,
    ) -> Result<(), BridgeError> {
        self.ban_request(viewer_id, Some(seconds), reason).await
    }

    pub async fn ban(&self, viewer_id: &str, reason: &str) -> Result<(), BridgeError> {
        self.ban_request(viewer_id, None, reason).await
    }

    pub async fn unban(&self, viewer_id: &str) -> Result<(), BridgeError> {
        if viewer_id.trim().is_empty() {
            return Err(BridgeError::Invalid("unban: no viewer id"));
        }
        let (b, m) = self.ids()?;
        let _: Value = self
            .vault
            .call(
                Method::DELETE,
                "/moderation/bans",
                &[
                    ("broadcaster_id", &b),
                    ("moderator_id", &m),
                    ("user_id", viewer_id),
                ],
                None,
            )
            .await?;
        Ok(())
    }

    pub async fn say(&self, text: &str) -> Result<(), BridgeError> {
        let text = text.trim();
        if text.is_empty() {
            return Err(BridgeError::Invalid("say: empty message"));
        }
        let (b, m) = self.ids()?;
        let body: Data<Sent> = self.vault.call(Method::POST, "/chat/messages", &[],
            Some(json!({"broadcaster_id": b, "sender_id": m, "message": truncate_chars(text, 500)}))).await?;
        if body.data.is_empty() || body.data.iter().any(|sent| !sent.is_sent) {
            return Err(BridgeError::Invalid("Twitch dropped the chat message"));
        }
        Ok(())
    }

    pub(crate) async fn subscribe(&self, session: &str, topic: &Topic) -> Result<(), BridgeError> {
        let (b, m) = self.ids()?;
        let response: Data<Subscription> = self.vault.call(Method::POST, "/eventsub/subscriptions", &[], Some(json!({
            "type": topic.name, "version": topic.version, "condition": topic.condition(&b, &m),
            "transport": {"method": "websocket", "session_id": session},
        }))).await?;
        if response.data.len() != 1
            || response.data.iter().any(|subscription| {
                subscription.id.is_empty()
                    || subscription.status != "enabled"
                    || subscription.kind != topic.name
                    || subscription.version != topic.version
            })
        {
            return Err(BridgeError::Invalid(
                "invalid EventSub subscription response",
            ));
        }
        Ok(())
    }
}
