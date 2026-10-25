// Adapted from Shadowrunr OS @ 7e4b6f8,
// crates/shadowrunr-daemon/src/platform/twitch/store.rs.
// Private to the broker: callers cannot load, serialize or expose credentials.
use serde::{Deserialize, Serialize};
use zeroize::Zeroize;

use crate::BridgeError;

const SERVICE: &str = "castlecontrol-twitch";
const ACCOUNT: &str = "streamer";

#[derive(Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(transparent)]
pub(crate) struct Secret(String);

impl Secret {
    #[cfg(test)]
    pub fn new(value: impl Into<String>) -> Self {
        Self(value.into())
    }

    pub fn expose(&self) -> &str {
        &self.0
    }
}

impl Drop for Secret {
    fn drop(&mut self) {
        self.0.zeroize();
    }
}

impl std::fmt::Debug for Secret {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("Secret(<redacted>)")
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct Credential {
    pub access_token: Secret,
    pub refresh_token: Secret,
    /// Absolute expiry is persisted so restart never extends a grant's lifetime.
    pub expires_at: i64,
}

pub(crate) trait CredentialStore: Send + Sync {
    fn load(&self) -> Result<Option<Credential>, BridgeError>;
    fn save(&self, cred: &Credential) -> Result<(), BridgeError>;
    fn delete(&self) -> Result<(), BridgeError>;
}

pub(crate) struct KeyringStore;

impl KeyringStore {
    fn entry(&self) -> Result<keyring::Entry, BridgeError> {
        keyring::Entry::new(SERVICE, ACCOUNT)
            .map_err(|_| BridgeError::Unavailable("keyring entry unavailable"))
    }
}

impl CredentialStore for KeyringStore {
    fn load(&self) -> Result<Option<Credential>, BridgeError> {
        match self.entry()?.get_password() {
            Ok(json) => {
                let json = zeroize::Zeroizing::new(json);
                serde_json::from_str(&json)
                    .map(Some)
                    .map_err(|_| BridgeError::Invalid("unreadable keyring credential"))
            }
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(_) => Err(BridgeError::Unavailable("keyring read failed")),
        }
    }

    fn save(&self, cred: &Credential) -> Result<(), BridgeError> {
        let json = zeroize::Zeroizing::new(
            serde_json::to_string(cred)
                .map_err(|_| BridgeError::Invalid("credential encoding failed"))?,
        );
        self.entry()?
            .set_password(&json)
            .map_err(|_| BridgeError::Unavailable("keyring write failed"))
    }

    fn delete(&self) -> Result<(), BridgeError> {
        match self.entry()?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(_) => Err(BridgeError::Unavailable("keyring delete failed")),
        }
    }
}

#[cfg(test)]
#[derive(Default)]
pub(crate) struct MemoryStore(std::sync::Mutex<Option<Credential>>);

#[cfg(test)]
impl CredentialStore for MemoryStore {
    fn load(&self) -> Result<Option<Credential>, BridgeError> {
        Ok(self.0.lock().expect("simulated store").clone())
    }
    fn save(&self, cred: &Credential) -> Result<(), BridgeError> {
        *self.0.lock().expect("simulated store") = Some(cred.clone());
        Ok(())
    }
    fn delete(&self) -> Result<(), BridgeError> {
        *self.0.lock().expect("simulated store") = None;
        Ok(())
    }
}
