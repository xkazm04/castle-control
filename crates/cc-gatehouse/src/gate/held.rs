use super::AutoModHeld;
use crate::{GatePath, Gatehouse, IngestedMessage, Result, error, store::Record};
use cc_types::{
    Decision, DecisionKind, ErrorCode, HeldOutcome, HeldResolveParams, MessageId, Verdict,
};
use std::{future::Future, time::Duration};

impl Gatehouse {
    pub fn automod_hold(&mut self, input: AutoModHeld) -> Result<Decision> {
        let msg = input.message;
        if let Some(record) = self.records()?.into_iter().find(|r| {
            r.message_id == msg.message_id && r.path == GatePath::AutoModHeld && r.parent.is_none()
        }) {
            let original = self.original(&record)?;
            if original.user_id != msg.user_id || original.text != msg.text {
                return Err(error(ErrorCode::Conflict, "held message identity changed"));
            }
            return Ok(record.decision());
        }
        let decision = self.gate_decision(
            Some(msg.message_id.clone()),
            DecisionKind::Held,
            Verdict::Hold,
            msg.simulated,
            "automod_held",
        )?;
        self.record(
            decision,
            Some(&msg),
            GatePath::AutoModHeld,
            None,
            None,
            false,
        )
    }

    pub(crate) fn held_record(&self, id: &MessageId) -> Result<Record> {
        let records = self.records()?;
        let root = records
            .iter()
            .find(|r| &r.message_id == id && r.path == GatePath::AutoModHeld && r.parent.is_none())
            .ok_or_else(|| error(ErrorCode::NotFound, "held message not found or erased"))?;
        if records.iter().any(|r| {
            r.parent.as_ref() == Some(&root.decision_id)
                && matches!(r.kind, DecisionKind::Released | DecisionKind::Removed)
        }) {
            return Err(error(ErrorCode::Conflict, "held message already resolved"));
        }
        // Forgetting an external moderator may erase an attributed completion
        // while leaving the viewer's original intact. An unassociated terminal
        // ledger entry for that viewer must never reopen permission to resolve.
        let unknown_completion = self.store.read_ledger(cc_store::LedgerKind::Decisions)
            .map_err(crate::internal)?.iter().any(|line| {
                matches!(&line.event, cc_store::LedgerEvent::Decision {
                    decision_id, user_id: Some(user_id), action: cc_store::DecisionAction::Released | cc_store::DecisionAction::Removed
                } if Some(user_id) == root.user_id.as_ref()
                    && !records.iter().any(|r| r.decision_id.as_str() == decision_id.to_string()))
            });
        if unknown_completion {
            return Err(error(
                ErrorCode::NeedsHuman,
                "erased completion requires reconciliation",
            ));
        }
        Ok(root.clone())
    }

    pub fn held_queue(&self) -> Result<Vec<Decision>> {
        let records = self.records()?;
        records
            .iter()
            .filter(|r| {
                r.path == GatePath::AutoModHeld
                    && r.parent.is_none()
                    && !records.iter().any(|next| {
                        next.parent.as_ref() == Some(&r.decision_id)
                            && matches!(next.kind, DecisionKind::Released | DecisionKind::Removed)
                    })
            })
            .map(|r| {
                let mut decision = r.decision();
                decision.message_text = Some(self.original(r)?.text);
                Ok(decision)
            })
            .collect()
    }

    /// The offline confirmation seam receives the durable original, not caller
    /// text. Only its confirmed success may release/remove. No ActionIntent is
    /// produced. A timeout/error records a held attempt and leaves the root open.
    pub async fn held_resolve<F, Fut>(
        &mut self,
        params: HeldResolveParams,
        response_budget: Duration,
        confirm: F,
    ) -> Result<Decision>
    where
        F: FnOnce(IngestedMessage, HeldOutcome) -> Fut,
        Fut: Future<Output = Result<()>>,
    {
        let root = self.held_record(&params.message_id)?;
        let original = self.original(&root)?;
        let mut failure = None;
        let reason = if !self.gate_available || response_budget.is_zero() {
            "held_gate_withheld"
        } else {
            match tokio::time::timeout(response_budget, confirm(original.clone(), params.outcome))
                .await
            {
                Ok(Ok(())) => "held_confirmed",
                Ok(Err(err)) => {
                    failure = Some(err);
                    "held_confirmation_failed"
                }
                Err(_) => "held_response_timeout",
            }
        };
        let (kind, verdict) = if reason == "held_confirmed" {
            match params.outcome {
                HeldOutcome::Allow => (DecisionKind::Released, Verdict::Pass),
                HeldOutcome::Deny => (DecisionKind::Removed, Verdict::Bar),
            }
        } else {
            (DecisionKind::Held, Verdict::Hold)
        };
        let decision = self.gate_decision(
            Some(params.message_id),
            kind,
            verdict,
            original.simulated,
            reason,
        )?;
        let decision = self.record(
            decision,
            Some(&original),
            GatePath::HumanReview,
            Some(root.decision_id),
            None,
            false,
        )?;
        // Preserve rate_limited/retry_after_ms rather than claiming resolution.
        match failure {
            Some(err) => Err(err),
            None => Ok(decision),
        }
    }
}
