//! In-process engine adapter. This module does not connect the live bridge or
//! execute actions. The host supplies a dedicated engine audit store and vault.
use crate::{Classifier, ClassifierError, classifier};
use async_trait::async_trait;
use cc_engine::{AnswerShape, Call, Engine, EngineClass, Failure, Keychain, Outcome};
use cc_store::Store;
use std::sync::Arc;
use tokio::sync::Mutex;

struct Handle {
    engine: Engine,
    store: Store,
    vault: Box<dyn Keychain>,
    key_label: Option<String>,
}

/// Classifies fenced chat using the plan's `live` role class: the moderation
/// lane has a two-second ceiling, even when a batch contains multiple messages.
/// `batch` describes slow work, not the number of messages in a request. Engine
/// routing and the spawn door both forbid CLI execution for the live class.
///
/// The async mutex gives `Classifier::classify(&self)` exclusive ownership of
/// the audit writer across the call. Waiting is inside the lane's deadline;
/// a started attempt retains its writer through audit even after cancellation.
/// Do not open a second writer at this root.
pub struct EngineClassifier {
    handle: Arc<Mutex<Handle>>,
}

impl EngineClassifier {
    pub fn new(
        engine: Engine,
        store: Store,
        vault: Box<dyn Keychain>,
        key_label: Option<String>,
    ) -> Self {
        Self {
            handle: Arc::new(Mutex::new(Handle {
                engine,
                store,
                vault,
                key_label,
            })),
        }
    }
}

fn model_text(outcome: Outcome) -> Result<String, ClassifierError> {
    match outcome {
        Outcome::Model { text } => Ok(text),
        Outcome::RulesOnly { .. } => Err(ClassifierError::RulesOnly),
        Outcome::Refused { .. } => Err(ClassifierError::Refused),
    }
}

#[async_trait]
impl Classifier for EngineClassifier {
    async fn classify(&self, system: &str, prompt: &str) -> Result<String, ClassifierError> {
        // Engine prompts are stdin/HTTP inputs only; neither text nor vault data
        // enters a diagnostic or audit row. Preserve the classifier's fences.
        let input = format!("{system}\n\n{prompt}");
        let mut handle = self.handle.clone().lock_owned().await;
        let runtime = tokio::runtime::Handle::current();
        // Engine's shared completion future also contains the Windows CLI
        // custody types, which are deliberately not Send. Poll it locally on
        // a blocking worker rather than weakening those types or this trait.
        // Lock admission remains cancellable; a started live attempt finishes
        // within the engine ceiling and retains its audit even if dropped here.
        tokio::task::spawn_blocking(move || {
            runtime.block_on(async {
                let Handle {
                    engine,
                    store,
                    vault,
                    key_label,
                } = &mut *handle;
                let reply = engine
                    .complete_with_shape(
                        Call {
                            class: EngineClass::Live,
                            prompt: &input,
                            // There is no per-message deterministic verdict for pending
                            // classifier candidates. Never invent one for a fallback.
                            rules_verdict: None,
                        },
                        store,
                        vault.as_ref(),
                        key_label.as_deref(),
                        AnswerShape::Custom(&classifier::structured),
                    )
                    .await
                    .map_err(|failure| match failure {
                        Failure::Audit => ClassifierError::Audit,
                        _ => ClassifierError::Unavailable,
                    })?;
                model_text(reply.outcome)
            })
        })
        .await
        .map_err(|_| ClassifierError::Unavailable)?
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use cc_types::Verdict;

    #[test]
    fn rules_only_never_masquerades_as_model_text() {
        let error = model_text(Outcome::RulesOnly {
            verdict: Verdict::Bar,
            reason: Failure::Unavailable,
        })
        .unwrap_err();
        assert_eq!(error.label(), "rules-only");
    }
}
