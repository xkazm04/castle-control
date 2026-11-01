// Adapted from Shadowrunr OS @ 7e4b6f8,
// crates/shadowrunr-engine/src/ladder.rs.
use crate::Failure;
use cc_types::Verdict;
#[derive(Clone, PartialEq, Eq)]
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
/// Model text is derived from viewer chat or owner prompts: Debug prints shape only.
impl std::fmt::Debug for Outcome {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Model { text } => f
                .debug_struct("Model")
                .field("text_len", &text.len())
                .finish(),
            Self::RulesOnly { verdict, reason } => f
                .debug_struct("RulesOnly")
                .field("verdict", verdict)
                .field("reason", reason)
                .finish(),
            Self::Refused { reason } => f.debug_struct("Refused").field("reason", reason).finish(),
        }
    }
}
#[derive(Clone)]
pub struct Reply {
    pub call_id: ulid::Ulid,
    pub outcome: Outcome,
    pub thread_id: Option<String>,
}
impl std::fmt::Debug for Reply {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Reply")
            .field("call_id", &self.call_id)
            .field("outcome", &self.outcome)
            .field("has_thread", &self.thread_id.is_some())
            .finish()
    }
}
pub(crate) fn fallback(reason: Failure, rules: Option<Verdict>) -> Outcome {
    match rules {
        Some(verdict) => Outcome::RulesOnly { verdict, reason },
        None => Outcome::Refused { reason },
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn debug_output_never_contains_model_text() {
        let reply = Reply {
            call_id: ulid::Ulid::nil(),
            outcome: Outcome::Model {
                text: "simulated-secret-text".into(),
            },
            thread_id: Some("simulated-thread-secret".into()),
        };
        let shown = format!("{reply:?} {:?}", reply.outcome);
        assert!(!shown.contains("simulated-secret-text"), "{shown}");
        assert!(!shown.contains("simulated-thread-secret"), "{shown}");
        assert!(shown.contains("Model"));
    }
}
