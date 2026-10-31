//! Beacons contribution intake/intensity and an optional Leonardo image client.
//!
//! Money never reaches a draw, a vote, a rank or a moderation decision.
//! Decay is deterministic under an injected clock.
//! One cheer arriving as both `channel.cheer` and `channel.bits.use` counts once.

pub mod art;
pub mod intake;
pub mod intensity;
pub mod preview;
