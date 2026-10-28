// Adapted from Shadowrunr OS @ 7e4b6f8,
// crates/shadowrunr-daemon/src/platform/twitch/eventsub.rs.
use futures::{SinkExt, StreamExt};
use tokio::net::TcpStream;
use tokio::time::Instant;
use tokio_tungstenite::{MaybeTlsStream, WebSocketStream, tungstenite::Message};

use crate::scopes::Topic;
use crate::wire::{Frame, parse_frame};
use crate::{BridgeError, BridgeEvent, BridgeState, TwitchBridge};

pub(crate) type Ws = WebSocketStream<MaybeTlsStream<TcpStream>>;

// Private adapter schema, not the public cc-types contract. Only metadata IDs
// identify these deliveries; cheer must never be admitted alongside bits.use.
#[derive(serde::Deserialize)]
struct ContributionIdentity {
    broadcaster_user_id: String,
    broadcaster_user_login: String,
    user_id: Option<String>,
    user_login: Option<String>,
}

#[derive(serde::Deserialize)]
struct Subscribe {
    is_gift: bool,
}
#[derive(serde::Deserialize)]
struct Gift {
    total: u32,
    is_anonymous: bool,
}
#[derive(serde::Deserialize)]
struct Bits {
    bits: u32,
    #[serde(rename = "type")]
    kind: BitsKind,
}
#[derive(serde::Deserialize)]
#[serde(rename_all = "snake_case")]
enum BitsKind {
    Cheer,
    PowerUp,
    CustomPowerUp,
}

#[derive(serde::Serialize)]
struct Contribution {
    source: &'static str,
    broadcaster_id: String,
    event_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    user_id: Option<String>,
    amount: u32,
    dedupe_key: String,
}
#[derive(serde::Serialize)]
struct ContributionDelivery {
    contribution: Contribution,
    broadcaster_login: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    user_login: Option<String>,
}

pub(crate) fn contribution(
    notification: &crate::Notification,
) -> Result<Option<serde_json::Value>, BridgeError> {
    let invalid = || BridgeError::Invalid("invalid EventSub contribution");
    let event = &notification.event;
    let (source, amount, anonymous) = match notification.subscription_type.as_str() {
        "channel.subscribe" => {
            let sub: Subscribe = serde_json::from_value(event.clone()).map_err(|_| invalid())?;
            // Gift batches already account for their recipients.
            if sub.is_gift {
                return Ok(None);
            }
            ("subscribe", 1, false)
        }
        "channel.subscription.gift" => {
            let gift: Gift = serde_json::from_value(event.clone()).map_err(|_| invalid())?;
            ("gift", gift.total, gift.is_anonymous)
        }
        "channel.subscription.message" => ("resub", 1, false),
        "channel.bits.use" => {
            let bits: Bits = serde_json::from_value(event.clone()).map_err(|_| invalid())?;
            let _kind = bits.kind;
            ("bits_use", bits.bits, false)
        }
        _ => return Ok(None),
    };
    let identity: ContributionIdentity =
        serde_json::from_value(event.clone()).map_err(|_| invalid())?;
    let id_valid = |id: &str| {
        !id.is_empty()
            && id.len() <= 32
            && !id.starts_with('0')
            && id.bytes().all(|b| b.is_ascii_digit())
    };
    let login_valid = |login: &str| {
        !login.is_empty()
            && login.len() <= 25
            && login
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b == b'_')
    };
    if notification.id.trim().is_empty()
        || !id_valid(&identity.broadcaster_user_id)
        || !login_valid(&identity.broadcaster_user_login)
        || (!anonymous
            && (!identity.user_id.as_deref().is_some_and(id_valid)
                || !identity.user_login.as_deref().is_some_and(login_valid)))
        || amount == 0
    {
        return Err(invalid());
    }
    serde_json::to_value(ContributionDelivery {
        contribution: Contribution {
            source,
            broadcaster_id: identity.broadcaster_user_id,
            event_id: notification.id.clone(),
            user_id: if anonymous { None } else { identity.user_id },
            amount,
            dedupe_key: notification.id.clone(),
        },
        broadcaster_login: identity.broadcaster_user_login,
        user_login: if anonymous { None } else { identity.user_login },
    })
    .map(Some)
    .map_err(|_| invalid())
}

impl TwitchBridge {
    pub(crate) async fn worker(&self, index: usize, topics: &[Topic]) -> Result<(), BridgeError> {
        let mut backoff = 1;
        let mut from = None;
        let mut revoked = self.vault.revoked.subscribe();
        loop {
            if *revoked.borrow() {
                return Err(BridgeError::Unauthorized);
            }
            self.connection_state(index, BridgeState::Connecting);
            let attempt = self.serve(index, topics, &mut from, &mut backoff);
            #[cfg(any(test, feature = "fault-injection"))]
            let attempt = self.interrupt_socket(attempt);
            let result = tokio::select! {
                result = attempt => result,
                _ = revoked.changed() => return Err(BridgeError::Unauthorized),
            };
            match result {
                Err(error @ (BridgeError::Unauthorized | BridgeError::Invalid(_))) => {
                    return Err(error);
                }
                Err(error) => {
                    tracing::warn!(connection = index, %error, "Twitch EventSub retry");
                    if from.is_none() {
                        from = Some(crate::now());
                    }
                    self.connection_state(index, BridgeState::Connecting);
                    tokio::select! {
                        _ = tokio::time::sleep(self.ep.time_unit * backoff) => {},
                        _ = revoked.changed() => return Err(BridgeError::Unauthorized),
                    }
                    backoff = (backoff * 2).min(60);
                }
                Ok(()) => return Ok(()),
            }
        }
    }

    async fn serve(
        &self,
        index: usize,
        topics: &[Topic],
        from: &mut Option<String>,
        backoff: &mut u32,
    ) -> Result<(), BridgeError> {
        let (mut ws, session, mut keepalive_s) = self.open(&self.ep.eventsub_url).await?;
        // Subscribe while reading concurrently: long batches must not starve keepalives.
        // At least the first subscription is created inside the welcome's 10-second window.
        let subscriptions = async {
            for topic in topics {
                self.subscribe(&session, topic).await?;
            }
            Ok::<(), BridgeError>(())
        };
        let mut last_seen = crate::now();
        let mut deadline = Instant::now() + self.ep.time_unit * (keepalive_s as u32 + 5);
        tokio::pin!(subscriptions);
        loop {
            tokio::select! {
                result = &mut subscriptions => { result?; break; },
                result = self.read(&mut ws, deadline) => {
                    let frame = result?;
                    self.deliver(frame, topics).await?;
                    last_seen = crate::now();
                    deadline = Instant::now() + self.ep.time_unit * (keepalive_s as u32 + 5);
                }
            }
        }
        if let Some(from) = from.take() {
            self.emit(BridgeEvent::Gap {
                from,
                to: crate::now(),
            })
            .await?;
        }
        self.connection_state(index, BridgeState::Connected);
        *backoff = 1;
        loop {
            let result = async {
                let frame = self.read(&mut ws, deadline).await?;
                if let Frame::Reconnect(url) = frame {
                    (ws, keepalive_s) = self.handover(&mut ws, &url, topics, deadline).await?;
                } else {
                    self.deliver(frame, topics).await?;
                }
                Ok::<(), BridgeError>(())
            }
            .await;
            match result {
                Ok(()) => {
                    last_seen = crate::now();
                    deadline = Instant::now() + self.ep.time_unit * (keepalive_s as u32 + 5);
                }
                Err(error) => {
                    *from = Some(last_seen);
                    return Err(error);
                }
            }
        }
    }

    pub(crate) async fn open(&self, url: &str) -> Result<(Ws, String, u64), BridgeError> {
        self.check_ws_url(url)?;
        let connect = async {
            let (mut ws, _) = tokio_tungstenite::connect_async(url)
                .await
                .map_err(|_| BridgeError::Unavailable("EventSub connect failed"))?;
            let frame = self
                .read(&mut ws, Instant::now() + self.ep.time_unit * 15)
                .await?;
            if let Frame::Welcome {
                session_id,
                keepalive_s,
            } = frame
            {
                Ok((ws, session_id, keepalive_s))
            } else {
                Err(BridgeError::Unavailable("EventSub missing welcome"))
            }
        };
        tokio::time::timeout(self.ep.time_unit * 30, connect)
            .await
            .map_err(|_| BridgeError::Unavailable("EventSub welcome timed out"))?
    }

    pub(crate) fn check_ws_url(&self, url: &str) -> Result<(), BridgeError> {
        let url =
            reqwest::Url::parse(url).map_err(|_| BridgeError::Invalid("invalid EventSub URL"))?;
        let base = reqwest::Url::parse(&self.ep.eventsub_url)
            .map_err(|_| BridgeError::Invalid("invalid EventSub endpoint"))?;
        if url.scheme() != base.scheme()
            || url.host_str() != base.host_str()
            || url.port_or_known_default() != base.port_or_known_default()
            || !url.username().is_empty()
            || url.password().is_some()
            || url.fragment().is_some()
        {
            return Err(BridgeError::Invalid(
                "untrusted EventSub reconnect destination",
            ));
        }
        Ok(())
    }

    pub(crate) async fn read(&self, ws: &mut Ws, deadline: Instant) -> Result<Frame, BridgeError> {
        loop {
            let message = tokio::time::timeout_at(deadline, ws.next())
                .await
                .map_err(|_| BridgeError::Unavailable("EventSub keepalive missed"))?
                .ok_or(BridgeError::Unavailable("EventSub socket closed"))?
                .map_err(|_| BridgeError::Unavailable("EventSub read failed"))?;
            match message {
                Message::Text(text) => {
                    return parse_frame(&text)
                        .map_err(|_| BridgeError::Unavailable("EventSub malformed frame"));
                }
                Message::Ping(_) => ws
                    .flush()
                    .await
                    .map_err(|_| BridgeError::Unavailable("EventSub pong failed"))?,
                Message::Close(_) => {
                    return Err(BridgeError::Unavailable("EventSub socket closed"));
                }
                _ => {}
            }
        }
    }

    pub(crate) async fn deliver(&self, frame: Frame, topics: &[Topic]) -> Result<(), BridgeError> {
        match frame {
            Frame::Notification {
                id,
                at,
                kind,
                event,
            } => {
                if !topics.iter().any(|topic| topic.name == kind) {
                    return Err(BridgeError::Invalid("unexpected EventSub topic"));
                }
                self.notification(id, at, kind, event).await
            }
            Frame::Revocation(status) => {
                if status == "authorization_revoked" {
                    self.vault.retire(false).await?;
                }
                Err(BridgeError::Unauthorized)
            }
            Frame::Keepalive => Ok(()),
            _ => Err(BridgeError::Unavailable(
                "unexpected EventSub session frame",
            )),
        }
    }
}
