//! OBS v5 transport and a separate read-only localhost overlay origin.
mod client;
mod overlay;
mod protocol;

pub use client::{Client, Config, PasswordReader};
pub use overlay::{Overlay, content_digest};
pub use protocol::{BrowserSource, Version};

/// Only fixed diagnostics cross the transport door; peer frames are never logged.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Error {
    Invalid,
    Keychain,
    Transport,
    Protocol,
    Rejected,
    Timeout,
}
impl std::fmt::Display for Error {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(match self {
            Self::Invalid => "OBS configuration refused",
            Self::Keychain => "OBS keychain entry unavailable",
            Self::Transport => "OBS transport unavailable",
            Self::Protocol => "OBS protocol response invalid",
            Self::Rejected => "OBS request rejected",
            Self::Timeout => "OBS operation timed out",
        })
    }
}
impl std::error::Error for Error {}
