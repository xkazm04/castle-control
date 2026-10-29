// Adapted from Shadowrunr OS @ 7e4b6f8,
// crates/shadowrunr-daemon/src/moderator/mod.rs (Apache-2.0; see NOTICE).
//! Offline moderation service. No Twitch executor or RPC registration.
//! Callers consume only the final verdict; action intents are not executed here.

mod analysis;
mod classifier;
pub mod drill;
mod drill_evaluate;
mod drill_report;
mod engine_classifier;
pub mod gate;
pub mod governor;
pub mod herald;
mod herald_features;
mod instrument;
mod lane;
mod live;
pub mod live_capture;
pub mod recorder;
mod review;
mod rules;
mod service;
mod sha256;
pub mod simulation;
mod store;

pub use classifier::{Classifier, ClassifierError};
pub use engine_classifier::EngineClassifier;
pub use lane::{ActionIntent, GatePath, ScreenedMessage};
pub use service::Gatehouse;

impl ScreenedMessage {
    /// The only constructor of the chart's intake type. No intent crosses it.
    pub fn for_consensus(&self) -> Option<herald::PassedMessage> {
        (self.decision.verdict == cc_types::Verdict::Pass
            && self.decision.message_id == self.message.message_id)
            .then(|| herald::PassedMessage {
                at: self.message.at.clone(),
                text: self.message.text.clone(),
            })
    }
}

use cc_store::TwitchUserId;
use cc_types::{ErrorCode, ErrorEnvelope, MessageId, Timestamp};
use serde::{Deserialize, Serialize};

pub type Result<T> = std::result::Result<T, ErrorEnvelope>;

/// Rust-only ingestion seam. Adapters obtain these flags from verified Twitch
/// metadata/badges, never viewer text. No chat field sets these flags.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct VerifiedMetadata {
    pub moderator: bool,
    pub broadcaster: bool,
}

/// Rust-only input, not a new RPC/event contract. Missing metadata is lowest rank.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct IngestedMessage {
    pub message_id: MessageId,
    pub user_id: TwitchUserId,
    pub login: String,
    pub text: String,
    pub at: Timestamp,
    pub simulated: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub metadata: Option<VerifiedMetadata>,
}

impl IngestedMessage {
    fn privileged(&self) -> bool {
        self.metadata
            .as_ref()
            .is_some_and(|m| m.moderator || m.broadcaster)
    }
}

pub(crate) fn error(code: ErrorCode, message: &'static str) -> ErrorEnvelope {
    ErrorEnvelope::new(code, message)
}

pub(crate) fn internal<T>(_: T) -> ErrorEnvelope {
    error(
        ErrorCode::Internal,
        "moderation persistence or integrity failure",
    )
}

pub(crate) fn date(at: &Timestamp) -> Result<chrono::DateTime<chrono::FixedOffset>> {
    chrono::DateTime::parse_from_rfc3339(&String::from(at.clone())).map_err(internal)
}
