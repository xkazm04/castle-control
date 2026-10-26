//! WP 1.2 offline domain. Rust-only ingress/confirmation seams, no transport,
//! executor, RPC registration or new wire identifiers. Adapters must validate
//! Twitch metadata before constructing these inputs; text grants no authority.
mod budget;
mod events;
mod held;
mod leases;
mod settings;

pub use budget::{BudgetSummary, HoldBudget, MeasuredBatch};
pub use events::{ExternalAction, ModerationEvent, SuspiciousMessage};
pub(crate) use settings::Settings;
pub use settings::{DelayChange, ShieldChange};

use crate::{Gatehouse, IngestedMessage, Result, internal};
use cc_types::{Decision, DecisionId, DecisionKind, MessageId, Operator, Verdict};

/// Verified local operator context. Needed to associate retained audit metadata
/// with a real identity under cc-store's existing forget-user inventory.
#[derive(Debug, Clone)]
pub struct GateActor {
    pub user_id: cc_store::TwitchUserId,
    pub login: String,
    pub simulated: bool,
}

pub struct AutoModHeld {
    pub message: IngestedMessage,
}

impl Gatehouse {
    /// Committed gate-roll entries. Retained audit metadata has no message text;
    /// originals are fetched separately by the human-review queue under retention.
    pub fn gate_roll(&self) -> Result<Vec<Decision>> {
        self.records()?
            .iter()
            .map(|r| {
                let mut decision = r.decision();
                if r.kind == DecisionKind::BanPending {
                    decision.message_text = Some(self.original(r)?.text);
                }
                Ok(decision)
            })
            .collect()
    }

    pub(crate) fn gate_decision(
        &self,
        message_id: Option<MessageId>,
        kind: DecisionKind,
        verdict: Verdict,
        simulated: bool,
        reason: &'static str,
    ) -> Result<Decision> {
        Ok(Decision {
            decision_id: DecisionId::mint(),
            message_id: message_id
                .unwrap_or("configuration".to_owned().try_into().map_err(internal)?),
            kind,
            verdict,
            rule_id: None,
            operator: Operator::Human,
            at: self.now()?,
            simulated,
            reason_codes: vec![reason.into()],
            message_text: None,
        })
    }
}
