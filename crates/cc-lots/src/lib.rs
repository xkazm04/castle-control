//! Offline draw eligibility and giveaway guardrails. No RPC or live bridge wiring.
//! All types here are Rust domain types, not additions to the wire contract.

mod policy;
mod pool;
mod weights;

pub use policy::{DrawCheck, DrawPolicy, GuardedDraw, PolicyReason, check_draw};
pub use pool::{CohortCap, Entry, Intake, MessageFacts, PassedMessage, Pool, Roll, RollRules};
pub use weights::{WeightCurve, WeightRow, WeightTable};

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("invalid draw configuration: {0}")]
    Invalid(&'static str),
    #[error("only a post-verdict pass message may enter a draw")]
    NotPassed,
    #[error("invalid winner set: {0}")]
    Winners(&'static str),
    #[error(transparent)]
    Store(#[from] cc_store::Error),
}

pub type Result<T> = std::result::Result<T, Error>;
