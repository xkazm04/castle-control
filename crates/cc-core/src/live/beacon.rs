//! A live roll never silently uses recorded randomness or recorded time.
use crate::lots::BeaconSource;
use cc_types::{ErrorCode, ErrorEnvelope, LotsSealedRoll};
use cc_verify::{BeaconRound, QuicknetChain};

pub(crate) struct NoBeacon;
impl BeaconSource for NoBeacon {
    fn chain(&self) -> Result<QuicknetChain, ErrorEnvelope> {
        Err(unavailable())
    }
    fn round(&self, _: &LotsSealedRoll) -> Result<BeaconRound, ErrorEnvelope> {
        Err(unavailable())
    }
}
fn unavailable() -> ErrorEnvelope {
    ErrorEnvelope::new(
        ErrorCode::Unavailable,
        "live public beacon is not configured; streamer-controlled commit-and-reveal is available",
    )
}
