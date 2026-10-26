// Adapted from Shadowrunr OS @ 7e4b6f8,
// crates/shadowrunr-daemon/src/platform/twitch/helix.rs.
use reqwest::{Method, header::HeaderMap};
use serde::de::DeserializeOwned;
use serde_json::Value;

use super::{RateLimit, Vault};
use crate::BridgeError;

impl Vault {
    /// Bound destination, no caller-supplied auth or raw response/error text escapes.
    pub async fn call<T: DeserializeOwned>(
        &self,
        method: Method,
        path: &str,
        query: &[(&str, &str)],
        body: Option<Value>,
    ) -> Result<T, BridgeError> {
        if !path.starts_with('/') || path.contains("..") || path.contains(['?', '#']) {
            return Err(BridgeError::Invalid("invalid Helix path"));
        }
        for attempt in 0..2 {
            let wait = self.rate.lock().await.wait_ms();
            if wait > 0 {
                return Err(BridgeError::RateLimited {
                    retry_after_ms: wait,
                });
            }
            let (credential, generation) = self.authorized().await?;
            let mut request = self
                .http
                .request(method.clone(), format!("{}{path}", self.ep.helix_base))
                .query(query)
                .bearer_auth(credential.access_token.expose())
                .header("Client-Id", &self.client_id);
            if let Some(body) = &body {
                request = request.json(body);
            }
            let response = request
                .send()
                .await
                .map_err(|_| BridgeError::Unavailable("Helix transport failed"))?;
            let status = response.status().as_u16();
            self.record_rate(response.headers(), status).await;
            if status == 401 {
                if attempt == 0 {
                    self.refresh(generation).await?;
                    continue;
                }
                self.retire(false).await?;
                return Err(BridgeError::Unauthorized);
            }
            if status == 429 {
                return Err(BridgeError::RateLimited {
                    retry_after_ms: self.rate.lock().await.wait_ms().max(1),
                });
            }
            if !(200..300).contains(&status) {
                return Err(BridgeError::Upstream(status));
            }
            let bytes = response
                .bytes()
                .await
                .map_err(|_| BridgeError::Unavailable("Helix response interrupted"))?;
            let text = if bytes.is_empty() {
                "{}"
            } else {
                std::str::from_utf8(&bytes)
                    .map_err(|_| BridgeError::Invalid("non-UTF8 Helix response"))?
            };
            // Even a misbehaving upstream echo cannot return the credential to a caller.
            if text.contains(credential.access_token.expose())
                || text.contains(credential.refresh_token.expose())
            {
                return Err(BridgeError::Invalid("credential echoed by upstream"));
            }
            return serde_json::from_str(text)
                .map_err(|_| BridgeError::Invalid("unreadable Helix response"));
        }
        Err(BridgeError::Unauthorized)
    }

    async fn record_rate(&self, headers: &HeaderMap, status: u16) {
        let number = |key| {
            headers
                .get(key)
                .and_then(|h| h.to_str().ok())
                .and_then(|s| s.parse::<u64>().ok())
        };
        let mut rate = self.rate.lock().await;
        if let Some(limit) = number("ratelimit-limit") {
            rate.limit = Some(limit);
        }
        if let Some(remaining) = number("ratelimit-remaining") {
            rate.remaining = Some(remaining);
        }
        if let Some(reset) = number("ratelimit-reset").and_then(|v| i64::try_from(v).ok()) {
            rate.reset_at_s = Some(reset);
        }
        if status == 429 {
            rate.remaining = Some(0);
            // Twitch's unpublished per-endpoint caps may omit all bucket headers.
            let retry = number("retry-after").unwrap_or(1).max(1);
            let fallback = chrono::Utc::now().timestamp() + i64::try_from(retry).unwrap_or(60);
            // An explicit reset is authoritative, including sub-second waits.
            // Do not reuse an old bucket's reset when this response omits it.
            rate.reset_at_s = Some(
                number("ratelimit-reset")
                    .and_then(|v| i64::try_from(v).ok())
                    .unwrap_or(fallback),
            );
        }
    }
}

impl RateLimit {
    fn wait_ms(&self) -> u64 {
        if self.remaining != Some(0) {
            return 0;
        }
        self.reset_at_s
            .map(|reset| {
                (reset.saturating_mul(1000) - chrono::Utc::now().timestamp_millis()).max(0) as u64
            })
            .unwrap_or(0)
    }
}
