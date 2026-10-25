// Adapted from Shadowrunr OS @ 7e4b6f8,
// crates/shadowrunr-daemon/src/platform/twitch/auth.rs.
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
        loop {
            tokio::time::sleep(self.ep.time_unit * interval).await;
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
                self.install(&mut state, grant)?;
                state.revoked = false;
                state.purged = false;
                self.revoked.send_replace(false);
                return Ok(());
            }
            let error: OAuthError = response
                .json()
                .await
                .map_err(|_| BridgeError::Invalid("unreadable OAuth error"))?;
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
            self.invalidate_locked(state).await?;
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
                || self
                    .scopes
                    .split_whitespace()
                    .any(|scope| !identity.scopes.iter().any(|granted| granted == scope))
            {
                self.retire(false).await?;
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
