// Adapted from Shadowrunr OS @ 7e4b6f8,
// crates/shadowrunr-daemon/src/platform/twitch/auth.rs.
use std::time::Duration;

use serde::Deserialize;
use tokio::time::Instant;

use super::{State, Vault, refresh_delay};
use crate::store::{Credential, Secret};
use crate::{BridgeError, DeviceLogin};

#[derive(Debug, Deserialize)]
pub(crate) struct DeviceCode {
    device_code: Secret,
    user_code: String,
    verification_uri: String,
    expires_in: u32,
    #[serde(default = "default_interval")]
    interval: u32,
}

fn default_interval() -> u32 {
    5
}

impl DeviceCode {
    pub fn display(&self) -> DeviceLogin {
        DeviceLogin {
            verification_uri: self.verification_uri.clone(),
            user_code: self.user_code.clone(),
            expires_s: self.expires_in,
        }
    }
}

#[derive(Deserialize)]
struct TokenGrant {
    access_token: Secret,
    refresh_token: Secret,
    expires_in: u32,
}

#[derive(Deserialize)]
struct Validated {
    client_id: String,
    login: String,
    user_id: String,
    expires_in: u64,
    scopes: Vec<String>,
}

#[derive(Deserialize)]
struct OAuthError {
    message: String,
}

/// Refresh failure body; Twitch has used both `error` and `message` for the code.
#[derive(Deserialize)]
struct RefreshFailure {
    error: Option<String>,
    message: Option<String>,
}

/// Parsed in one place; an unparseable body is never definitive.
fn is_invalid_grant(body: &[u8]) -> bool {
    serde_json::from_slice::<RefreshFailure>(body).is_ok_and(|failure| {
        [failure.error, failure.message]
            .into_iter()
            .flatten()
            .any(|code| code.trim().eq_ignore_ascii_case("invalid_grant"))
    })
}

impl Vault {
    pub async fn request_device(&self) -> Result<DeviceCode, BridgeError> {
        let response = self
            .http
            .post(format!("{}/oauth2/device", self.ep.id_base))
            .form(&[("client_id", &self.client_id), ("scopes", &self.scopes)])
            .send()
            .await
            .map_err(|_| BridgeError::Unavailable("device login transport failed"))?;
        let status = response.status();
        if !status.is_success() {
            return Err(BridgeError::Upstream(status.as_u16()));
        }
        let device: DeviceCode = response
            .json()
            .await
            .map_err(|_| BridgeError::Invalid("unreadable device response"))?;
        if device.device_code.expose().is_empty()
            || device.user_code.is_empty()
            || device.expires_in == 0
            || !device
                .verification_uri
                .starts_with("https://www.twitch.tv/")
        {
            return Err(BridgeError::Invalid("invalid device challenge"));
        }
        Ok(device)
    }

    pub async fn poll_device(&self, device: DeviceCode) -> Result<(), BridgeError> {
        let deadline = Instant::now() + self.ep.time_unit * device.expires_in;
        let mut interval = device.interval.max(1);
        let mut hint = Duration::ZERO;
        loop {
            tokio::time::sleep((self.ep.time_unit * interval).max(hint)).await;
            hint = Duration::ZERO;
            if Instant::now() >= deadline {
                return Err(BridgeError::Invalid("Twitch device code expired"));
            }
            let sent = self
                .http
                .post(format!("{}/oauth2/token", self.ep.id_base))
                .form(&[
                    ("client_id", self.client_id.as_str()),
                    ("scopes", &self.scopes),
                    ("device_code", device.device_code.expose()),
                    ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
                ])
                .send()
                .await;
            let response = match sent {
                Ok(response) => response,
                Err(_) => {
                    tracing::warn!("Twitch device poll transport failed");
                    continue;
                }
            };
            if response.status().is_success() {
                let grant: TokenGrant = response
                    .json()
                    .await
                    .map_err(|_| BridgeError::Invalid("unreadable token response"))?;
                let mut state = self.state.lock().await;
                let prior = (state.credential.clone(), state.refresh_at);
                if let Err(error) = self.install(&mut state, grant) {
                    // The new pair never reached the store: do not keep it live.
                    (state.credential, state.refresh_at) = prior;
                    state.generation += 1;
                    return Err(error);
                }
                state.revoked = false;
                state.purged = false;
                self.revoked.send_replace(false);
                return Ok(());
            }
            let status = response.status();
            let retry_after = response
                .headers()
                .get(reqwest::header::RETRY_AFTER)
                .and_then(|value| value.to_str().ok())
                .and_then(|value| value.trim().parse::<u32>().ok());
            // Gateway trouble and rate limits are not an answer: keep polling to the deadline.
            let error = match response.json::<OAuthError>().await {
                Ok(error) if !(status.is_server_error() || status.as_u16() == 429) => error,
                _ => {
                    tracing::warn!(status = status.as_u16(), "Twitch device poll unreadable");
                    if let Some(seconds) = retry_after {
                        hint = self.ep.time_unit * seconds.min(60);
                    }
                    continue;
                }
            };
            match error.message.as_str() {
                "authorization_pending" => {}
                "slow_down" => interval = interval.saturating_add(5),
                _ => return Err(BridgeError::Unauthorized),
            }
        }
    }

    fn install(&self, state: &mut State, grant: TokenGrant) -> Result<(), BridgeError> {
        if grant.expires_in == 0
            || grant.access_token.expose().is_empty()
            || grant.refresh_token.expose().is_empty()
        {
            return Err(BridgeError::Invalid("empty token grant"));
        }
        let credential = Credential {
            access_token: grant.access_token,
            refresh_token: grant.refresh_token,
            expires_at: chrono::Utc::now().timestamp() + i64::from(grant.expires_in),
        };
        // Keep the rotated pair in memory even if persistence fails: never reuse the old pair.
        let persisted = self.store.save(&credential);
        state.credential = Some(credential);
        state.generation += 1;
        state.refresh_at =
            Some(Instant::now() + refresh_delay(u64::from(grant.expires_in), rand::random()));
        persisted
    }

    /// Stop using the login and signal workers, but leave the stored credential untouched.
    fn require_reauth_locked(&self, state: &mut State) {
        state.credential = None;
        state.refresh_at = None;
        state.revoked = true;
        state.generation += 1;
        tracing::warn!("Twitch login needs re-authentication; stored credential kept");
        self.revoked.send_replace(true);
    }

    pub(super) async fn refresh_locked(&self, state: &mut State) -> Result<(), BridgeError> {
        let credential = state.credential.as_ref().ok_or(BridgeError::Unauthorized)?;
        let response = self
            .http
            .post(format!("{}/oauth2/token", self.ep.id_base))
            .form(&[
                ("client_id", self.client_id.as_str()),
                ("grant_type", "refresh_token"),
                ("refresh_token", credential.refresh_token.expose()),
            ])
            .send()
            .await
            .map_err(|_| BridgeError::Unavailable("refresh transport failed"))?;
        let status = response.status();
        if matches!(status.as_u16(), 400 | 401) {
            // Only a definitive invalid_grant destroys the stored login. Anything else
            // (unknown 400, unparseable body) keeps it and asks the owner to re-authenticate.
            let bytes = response.bytes().await.unwrap_or_default();
            if is_invalid_grant(&bytes) {
                self.invalidate_locked(state).await?;
            } else {
                self.require_reauth_locked(state);
            }
            return Err(BridgeError::Unauthorized);
        }
        if !status.is_success() {
            return Err(BridgeError::Upstream(status.as_u16()));
        }
        let grant = response
            .json()
            .await
            .map_err(|_| BridgeError::Invalid("unreadable refresh response"))?;
        self.install(state, grant)?;
        tracing::info!("Twitch credential refreshed");
        Ok(())
    }

    /// Identity only crosses the broker boundary. Validate at startup and at least hourly.
    pub async fn validate(&self) -> Result<(String, String), BridgeError> {
        for attempt in 0..2 {
            let (credential, generation) = self.authorized().await?;
            let mut authorization = reqwest::header::HeaderValue::from_str(&format!(
                "OAuth {}",
                credential.access_token.expose()
            ))
            .map_err(|_| BridgeError::Invalid("invalid OAuth authorization header"))?;
            authorization.set_sensitive(true);
            let response = self
                .http
                .get(format!("{}/oauth2/validate", self.ep.id_base))
                .header("Authorization", authorization)
                .send()
                .await
                .map_err(|_| BridgeError::Unavailable("validate transport failed"))?;
            let status = response.status();
            if status.as_u16() == 401 {
                if attempt == 0 {
                    self.refresh(generation).await?;
                    continue;
                }
                self.retire(false).await?;
                return Err(BridgeError::Unauthorized);
            }
            if !status.is_success() {
                return Err(BridgeError::Upstream(status.as_u16()));
            }
            let identity: Validated = response
                .json()
                .await
                .map_err(|_| BridgeError::Invalid("unreadable validation response"))?;
            if identity.client_id != self.client_id
                || identity.user_id.is_empty()
                || identity.login.is_empty()
            {
                self.retire(false).await?;
                return Err(BridgeError::Unauthorized);
            }
            if self
                .scopes
                .split_whitespace()
                .any(|scope| !identity.scopes.iter().any(|granted| granted == scope))
            {
                // A scope shortfall is fixed by re-authorizing, not by deleting the login.
                let mut state = self.state.lock().await;
                self.require_reauth_locked(&mut state);
                return Err(BridgeError::Unauthorized);
            }
            let mut state = self.state.lock().await;
            if state.revoked {
                return Err(BridgeError::Unauthorized);
            }
            if state.generation == generation {
                let at = Instant::now() + refresh_delay(identity.expires_in, rand::random());
                state.refresh_at = Some(state.refresh_at.map_or(at, |old| old.min(at)));
            }
            return Ok((identity.login, identity.user_id));
        }
        Err(BridgeError::Unauthorized)
    }
}
