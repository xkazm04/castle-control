//! WP 3.1 contribution intake and intensity, without transport or rendering.
//!
//! Money never reaches a draw, a vote, a rank or a moderation decision.
//! Decay is deterministic under an injected clock.
//! One cheer arriving as both `channel.cheer` and `channel.bits.use` counts once.

pub mod intake;
pub mod intensity;
