// Adapted from Shadowrunr OS @ 7e4b6f8,
// crates/shadowrunr-daemon/src/platform/twitch/eventsub.rs.
use crate::eventsub::Ws;
use crate::scopes::Topic;
use crate::wire::Frame;
use crate::{BridgeError, TwitchBridge};
use tokio::time::Instant;

impl TwitchBridge {
    /// Keep consuming the old socket throughout the new TCP/TLS handshake and welcome.
    /// Twitch transfers subscriptions on this path; never create duplicates on the new id.
    pub(crate) async fn handover(
        &self,
        old: &mut Ws,
        url: &str,
        topics: &[Topic],
        mut deadline: Instant,
    ) -> Result<(Ws, u64), BridgeError> {
        let next = self.open(url);
        tokio::pin!(next);
        loop {
            tokio::select! {
                result = &mut next => {
                    let (new, _, keepalive_s) = result?;
                    if old.close(None).await.is_err() {
                        tracing::debug!("Old Twitch EventSub socket already closed during handover");
                    }
                    return Ok((new, keepalive_s));
                }
                result = self.read(old, deadline) => {
                    let frame = result?;
                    if matches!(frame, Frame::Reconnect(_)) {
                        return Err(BridgeError::Unavailable("overlapping EventSub reconnect"));
                    }
                    self.deliver(frame, topics).await?;
                    deadline = Instant::now() + self.ep.time_unit * 15;
                }
            }
        }
    }
}
