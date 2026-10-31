//! Provider credentials use one service; callers pass an account, never a path.
use cc_engine::{Failure, Keychain};
use cc_types::{ErrorCode, ErrorEnvelope};
use std::fmt;

const SERVICE: &str = "castle-control";

/// Plaintext is released only at cc-engine's existing String-returning door.
/// This type deliberately implements neither serialization nor derived Debug.
pub(super) struct Secret(String);

impl Secret {
    pub(super) fn new(value: String) -> Self {
        Self(value)
    }
}

impl fmt::Debug for Secret {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("[redacted]")
    }
}
impl fmt::Display for Secret {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("[redacted]")
    }
}

/// The fake backend owns its own memory; tests never replace a global keyring.
pub(super) trait Backend: Send + Sync {
    fn read(&self, service: &str, account: &str) -> keyring::Result<Option<Secret>>;
}

pub(super) struct OsBackend;
impl Backend for OsBackend {
    fn read(&self, service: &str, account: &str) -> keyring::Result<Option<Secret>> {
        match keyring::Entry::new(service, account)?.get_password() {
            Ok(value) => Ok(Some(Secret::new(value))),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(error) => Err(error),
        }
    }
}

pub(super) struct Vault<B = OsBackend> {
    backend: B,
}

impl Default for Vault {
    fn default() -> Self {
        // Construction performs no OS keychain access.
        Self::new(OsBackend)
    }
}

impl<B: Backend> Vault<B> {
    pub(super) fn new(backend: B) -> Self {
        Self { backend }
    }

    pub(super) fn read_secret(&self, account: &str) -> Result<Secret, ErrorEnvelope> {
        // Provider names are bounded lowercase labels. Never echo malformed input.
        if account.is_empty()
            || account.len() > 64
            || !account
                .bytes()
                .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
        {
            return Err(ErrorEnvelope::new(
                ErrorCode::Unavailable,
                "Steward keychain account unavailable",
            ));
        }
        let unavailable = || {
            ErrorEnvelope::new(
                ErrorCode::Unavailable,
                format!("Steward keychain unavailable: {account}"),
            )
        };
        // OS errors can contain credential values: discard them without formatting.
        match self.backend.read(SERVICE, account) {
            Ok(Some(secret)) if !secret.0.is_empty() => Ok(secret),
            Ok(_) | Err(_) => Err(unavailable()),
        }
    }
}

impl<B: Backend> Keychain for Vault<B> {
    fn load(&self, account: &str) -> cc_engine::Result<String> {
        // The unchanged engine trait has a sanitized, payload-free failure enum.
        self.read_secret(account)
            .map(|Secret(value)| value)
            .map_err(|_| Failure::Unavailable)
    }
}
