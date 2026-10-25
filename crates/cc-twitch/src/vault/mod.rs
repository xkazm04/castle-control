// Adapted from Shadowrunr OS @ 7e4b6f8,
// crates/shadowrunr-daemon/src/platform/twitch/{auth.rs,mod.rs,store.rs}.
mod helix;
mod oauth;

use std::sync::Arc;
use std::time::Duration;

use tokio::sync::{Mutex, watch};
use tokio::time::Instant;

use crate::store::{Credential, CredentialStore};
use crate::types::Endpoints;
use crate::{BridgeError, RevocationHandler};

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct RateLimit {
    pub limit: Option<u64>,
    pub remaining: Option<u64>,
    pub reset_at_s: Option<i64>,
}

pub(crate) struct Vault {
    client_id: String,
    scopes: String,
    ep: Endpoints,
    http: reqwest::Client,
    store: Arc<dyn CredentialStore>,
    state: Mutex<State>,
    rate: Mutex<RateLimit>,
    handler: Arc<dyn RevocationHandler>,
    pub revoked: watch::Sender<bool>,
}

#[derive(Default)]
struct State {
    credential: Option<Credential>,
    generation: u64,
    refresh_at: Option<Instant>,
    revoked: bool,
    purged: bool,
}

impl std::fmt::Debug for Vault {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("TwitchVault(<brokered>)")
    }
}

impl Vault {
    pub fn new(
        client_id: String,
        scopes: String,
        ep: Endpoints,
        store: Arc<dyn CredentialStore>,
        handler: Arc<dyn RevocationHandler>,
    ) -> Result<Arc<Self>, BridgeError> {
        let http = reqwest::Client::builder()
            .timeout(Duration::from_secs(15))
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .map_err(|_| BridgeError::Unavailable("HTTP client unavailable"))?;
        let (revoked, _) = watch::channel(false);
        Ok(Arc::new(Self {
            client_id,
            scopes,
            ep,
            http,
            store,
            state: Mutex::new(State::default()),
            rate: Mutex::new(RateLimit::default()),
            handler,
            revoked,
        }))
    }

    pub async fn load(&self) -> Result<bool, BridgeError> {
        let mut state = self.state.lock().await;
        if state.revoked {
            return Err(BridgeError::Unauthorized);
        }
        if state.credential.is_none()
            && let Some(credential) = self.store.load()?
        {
            let remaining_ms = (credential.expires_at.saturating_mul(1000)
                - chrono::Utc::now().timestamp_millis())
            .max(0) as u64;
            state.refresh_at =
                Some(Instant::now() + refresh_delay_ms(remaining_ms, rand::random()));
            state.credential = Some(credential);
            state.generation += 1;
        }
        Ok(state.credential.is_some())
    }

    pub async fn retire(&self, upstream: bool) -> Result<(), BridgeError> {
        let mut state = self.state.lock().await;
        state.revoked = true;
        if let Some(credential) = state.credential.take()
            && upstream
        {
            let result = self
                .http
                .post(format!("{}/oauth2/revoke", self.ep.id_base))
                .form(&[
                    ("client_id", self.client_id.as_str()),
                    ("token", credential.access_token.expose()),
                ])
                .send()
                .await;
            if !matches!(result, Ok(response) if response.status().is_success()) {
                tracing::warn!("Twitch upstream revoke unconfirmed; deleting locally");
            }
        }
        self.invalidate_locked(&mut state).await
    }

    async fn invalidate_locked(&self, state: &mut State) -> Result<(), BridgeError> {
        state.credential = None;
        state.refresh_at = None;
        state.revoked = true;
        state.generation += 1;
        let delete = self.store.delete();
        let purge = if state.purged {
            Ok(())
        } else {
            self.handler.purge_all().await
        };
        state.purged = purge.is_ok();
        tracing::warn!("Twitch authorization retired; purge_all requested");
        // Workers listen to this signal. Publishing before the await above could cancel
        // the very worker carrying the purge future and leave deletion half finished.
        self.revoked.send_replace(true);
        delete?;
        purge
    }

    /// Single-flight across proactive, validate-401 and concurrent Helix-401 callers.
    async fn refresh(&self, stale_generation: u64) -> Result<(), BridgeError> {
        let mut state = self.state.lock().await;
        if state.revoked {
            return Err(BridgeError::Unauthorized);
        }
        if state.generation != stale_generation {
            return Ok(());
        }
        self.refresh_locked(&mut state).await
    }

    async fn authorized(&self) -> Result<(Credential, u64), BridgeError> {
        let mut state = self.state.lock().await;
        if state.revoked {
            return Err(BridgeError::Unauthorized);
        }
        if state.refresh_at.is_some_and(|at| Instant::now() >= at) {
            self.refresh_locked(&mut state).await?;
        }
        let credential = state.credential.clone().ok_or(BridgeError::Unauthorized)?;
        Ok((credential, state.generation))
    }

    pub async fn maintain(&self) -> Result<(), BridgeError> {
        let mut validate_at = Instant::now() + self.ep.validate_every;
        loop {
            let refresh_at = self
                .state
                .lock()
                .await
                .refresh_at
                .ok_or(BridgeError::Unauthorized)?;
            tokio::time::sleep_until(refresh_at.min(validate_at)).await;
            self.authorized().await?;
            if Instant::now() >= validate_at {
                self.validate().await?;
                validate_at = Instant::now() + self.ep.validate_every;
            }
        }
    }

    pub async fn rate_limit(&self) -> RateLimit {
        self.rate.lock().await.clone()
    }
}

/// Refresh at 80-90% of lifetime, bounded by expiry even for short-lived grants.
pub(crate) fn refresh_delay(expires_s: u64, jitter: u8) -> Duration {
    refresh_delay_ms(expires_s.saturating_mul(1000), jitter)
}

fn refresh_delay_ms(expires_ms: u64, jitter: u8) -> Duration {
    let fraction = 800 + u64::from(jitter) % 101;
    Duration::from_millis(expires_ms.saturating_mul(fraction) / 1000)
}
