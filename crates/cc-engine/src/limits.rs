// Adapted from Shadowrunr OS @ 7e4b6f8,
// crates/shadowrunr-engine/src/limits.rs.
//! Sanitized outcomes: never retain raw provider errors, prompts or stderr.
#[derive(Clone, Copy, Debug, PartialEq, Eq, thiserror::Error)]
pub enum Failure {
    #[error("invalid engine configuration")]
    Invalid,
    #[error("provider unavailable")]
    Unavailable,
    #[error("deadline or silence ceiling exceeded")]
    Timeout,
    #[error("provider rate limited")]
    RateLimited,
    #[error("provider authentication unavailable")]
    Auth,
    #[error("invalid provider output")]
    Parse,
    #[error("model not admitted for this class")]
    NotAdmitted,
    #[error("cloud processing requires opt-in")]
    CloudOptIn,
    #[error("CLI not allowed on live classes")]
    CliOnLive,
    #[error("child sandbox posture not verified")]
    Posture,
    #[error("engine audit append failed")]
    Audit,
    #[error("process supervision failed")]
    Supervision,
}
pub type Result<T> = std::result::Result<T, Failure>;
pub(crate) fn http_failure(status: u16) -> Failure {
    match status {
        401 | 403 => Failure::Auth,
        429 => Failure::RateLimited,
        _ => Failure::Unavailable,
    }
}
