//! WP 3.4 part A: private Leonardo requests with injectable HTTP/keychain doors.
//!
//! Paid calls return cost receipts; nothing writes a ledger. EngineProvider lives
//! in the frozen cc-store crate, pending the operator's ruling. Ledger integration,
//! RPC/UI wiring and the owner's Leonardo-terms check are deferred. Contribution
//! intake and intensity never call this module. No network starts on construction.
mod client;
mod key;
mod transport;
mod wire;

pub use client::LeonardoClient;
pub use key::{KEYCHAIN_SERVICE, KeyStore, KeychainStore, SecretKey};
pub use transport::{HttpMethod, HttpRequest, HttpResponse, HttpTransport, ReqwestTransport};

use async_trait::async_trait;
use serde::Serialize;

/// Local domain errors only. Never retain upstream error text or request headers.
#[derive(Debug, Clone, Copy, PartialEq, Eq, thiserror::Error)]
pub enum ArtError {
    #[error("Leonardo is unavailable: no key configured")]
    Unavailable,
    #[error("Leonardo keychain unavailable")]
    Keychain,
    #[error("invalid image request")]
    Invalid,
    #[error("Leonardo transport failed")]
    Transport,
    #[error("Leonardo HTTP failure ({0})")]
    Http(u16),
    #[error("invalid Leonardo response")]
    Response,
}

/// This type describes local configuration, not an RPC or contract identifier.
#[derive(Debug, Clone)]
pub struct ImageRequest {
    pub prompt: String,
    pub model_id: String,
    pub width: u16,
    pub height: u16,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Charge {
    /// Exact decimal credits; no conversion or float rounding.
    Credits(String),
    MicroUsd(u64),
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct CostRecord {
    /// Locally minted ULID, never a response's free-form request identifier.
    pub call_id: String,
    pub model: String,
    pub charge: Charge,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Generation {
    pub generation_id: String,
    pub cost: CostRecord,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Provenance {
    LeonardoGenerated,
    LeonardoBackgroundRemoved,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ImageAsset {
    /// Image id, distinct from the generation id. Absent for sync cutout results.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image_id: Option<String>,
    pub url: String,
    pub generated: bool,
    pub provenance: Provenance,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum GenerationState {
    Pending,
    Complete(Vec<ImageAsset>),
    Failed,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BackgroundResult {
    /// Empty if the provider withheld the output; cost remains available.
    pub assets: Vec<ImageAsset>,
    pub cost: CostRecord,
}

#[async_trait]
pub trait ImageProvider: Send + Sync {
    /// Key presence only, not a network health check. Keychain errors stay errors.
    fn available(&self) -> Result<bool, ArtError>;
    /// Submits one paid job. Fetch images separately; never retry a paid call here.
    async fn generate_anchor(&self, request: &ImageRequest) -> Result<Generation, ArtError>;
    async fn generate_matching_set(
        &self,
        request: &ImageRequest,
        anchor: &ImageAsset,
        quantity: u8,
    ) -> Result<Generation, ArtError>;
    /// Read-only polling; no paid generation or new cost receipt.
    async fn generation_state(&self, generation_id: &str) -> Result<GenerationState, ArtError>;
    async fn remove_background(&self, image: &ImageAsset) -> Result<BackgroundResult, ArtError>;
}
