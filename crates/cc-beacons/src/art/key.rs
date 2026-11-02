use super::ArtError;
use std::fmt;
use zeroize::Zeroizing;

pub const KEYCHAIN_SERVICE: &str = "castlecontrol-leonardo";
/// OpenAI shares the Steward's provider service; one key per streamer.
pub const OPENAI_KEYCHAIN_SERVICE: &str = "castle-control";
pub const OPENAI_KEYCHAIN_ACCOUNT: &str = "openai";

/// Not serializable. Plaintext is private to the authenticated HTTP door.
///
/// ```compile_fail
/// use cc_beacons::art::SecretKey;
/// let value = SecretKey::new("simulated-only".into()).unwrap();
/// serde_json::to_string(&value).unwrap();
/// ```
#[derive(Clone)]
pub struct SecretKey(Zeroizing<String>);

impl SecretKey {
    pub fn new(value: String) -> Result<Self, ArtError> {
        let value = Zeroizing::new(value);
        if value.is_empty() || !value.bytes().all(|b| b.is_ascii_graphic()) {
            return Err(ArtError::Invalid);
        }
        Ok(Self(value))
    }

    pub(super) fn value(&self) -> &str {
        &self.0
    }

    pub(super) fn appears_in(&self, text: &str) -> bool {
        text.contains(self.value())
    }
}

impl fmt::Debug for SecretKey {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("[redacted]")
    }
}
impl fmt::Display for SecretKey {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("[redacted]")
    }
}

/// Injection seam for credential custody. Product consumers use account labels.
pub trait KeyStore: Send + Sync {
    fn load(&self, label: &str) -> Result<Option<SecretKey>, ArtError>;
    fn save(&self, label: &str, key: &SecretKey) -> Result<(), ArtError>;
    fn delete(&self, label: &str) -> Result<(), ArtError>;
}

/// Same native keyring backends and NoEntry handling as cc-obs/cc-twitch.
pub struct KeychainStore;
/// The OpenAI image key under the Steward's `castle-control` service.
pub struct OpenAiKeychain;

fn entry(service: &str, label: &str) -> Result<keyring::Entry, ArtError> {
    if label.trim().is_empty() {
        return Err(ArtError::Invalid);
    }
    keyring::Entry::new(service, label).map_err(|_| ArtError::Keychain)
}
fn load(service: &str, label: &str) -> Result<Option<SecretKey>, ArtError> {
    match entry(service, label)?.get_password() {
        Ok(value) => SecretKey::new(value).map(Some),
        Err(keyring::Error::NoEntry) => Ok(None),
        // OS errors can contain credential values: discard them unformatted.
        Err(_) => Err(ArtError::Keychain),
    }
}
fn save(service: &str, label: &str, key: &SecretKey) -> Result<(), ArtError> {
    entry(service, label)?
        .set_password(key.value())
        .map_err(|_| ArtError::Keychain)
}
fn delete(service: &str, label: &str) -> Result<(), ArtError> {
    match entry(service, label)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(_) => Err(ArtError::Keychain),
    }
}

impl KeyStore for KeychainStore {
    fn load(&self, label: &str) -> Result<Option<SecretKey>, ArtError> {
        load(KEYCHAIN_SERVICE, label)
    }
    fn save(&self, label: &str, key: &SecretKey) -> Result<(), ArtError> {
        save(KEYCHAIN_SERVICE, label, key)
    }
    fn delete(&self, label: &str) -> Result<(), ArtError> {
        delete(KEYCHAIN_SERVICE, label)
    }
}
impl KeyStore for OpenAiKeychain {
    fn load(&self, label: &str) -> Result<Option<SecretKey>, ArtError> {
        load(OPENAI_KEYCHAIN_SERVICE, label)
    }
    fn save(&self, label: &str, key: &SecretKey) -> Result<(), ArtError> {
        save(OPENAI_KEYCHAIN_SERVICE, label, key)
    }
    fn delete(&self, label: &str) -> Result<(), ArtError> {
        delete(OPENAI_KEYCHAIN_SERVICE, label)
    }
}
