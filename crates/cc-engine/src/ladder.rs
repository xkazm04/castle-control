// Adapted from Shadowrunr OS @ 7e4b6f8,
// crates/shadowrunr-engine/src/ladder.rs.
use crate::Failure;
use cc_types::Verdict;
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Outcome {
    Model { text: String },
    RulesOnly { verdict: Verdict, reason: Failure },
    Refused { reason: Failure },
}
impl Outcome {
    pub fn label(&self) -> &'static str {
        match self {
            Self::Model { .. } => "model",
            Self::RulesOnly { .. } => "rules-only",
            Self::Refused { .. } => "refused",
        }
    }
}
#[derive(Clone, Debug)]
pub struct Reply {
    pub call_id: ulid::Ulid,
    pub outcome: Outcome,
    pub thread_id: Option<String>,
}
pub(crate) fn fallback(reason: Failure, rules: Option<Verdict>) -> Outcome {
    match rules {
        Some(verdict) => Outcome::RulesOnly { verdict, reason },
        None => Outcome::Refused { reason },
    }
}
