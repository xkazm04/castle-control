// Adapted from Shadowrunr OS @ 7e4b6f8,
// crates/shadowrunr-daemon/src/moderator/mod.rs (Apache-2.0; see NOTICE).
use crate::{
    ActionIntent, GatePath, Gatehouse, IngestedMessage, Result, date, error, store::Record,
};
use cc_types::{
    Action, Decision, DecisionId, DecisionKind, DecisionParams, ErrorCode, Operator,
    PetitionOutcome, PetitionResolveParams, RuleMode, Verdict,
};

/// No unattended expiry ever approves a ban. Expired reviews are held and must
/// be assessed again; the exact original remains subject to retention/erasure.
pub const REVIEW_TIMEOUT_S: i64 = 120;

impl Gatehouse {
    fn find_record(&self, id: &DecisionId) -> Result<Record> {
        self.records()?
            .into_iter()
            .find(|r| &r.decision_id == id)
            .ok_or_else(|| error(ErrorCode::NotFound, "decision not found or erased"))
    }

    fn unresolved(&self, id: &DecisionId) -> Result<Record> {
        let records = self.records()?;
        if records.iter().any(|r| r.parent.as_ref() == Some(id)) {
            return Err(error(ErrorCode::Conflict, "decision already resolved"));
        }
        self.find_record(id)
    }

    pub fn pending_bans(&self) -> Result<Vec<Decision>> {
        let records = self.records()?;
        records
            .iter()
            .filter(|r| {
                r.kind == DecisionKind::BanPending
                    && !records
                        .iter()
                        .any(|next| next.parent.as_ref() == Some(&r.decision_id))
            })
            .map(|r| {
                // Original text is read from the durable queue, never supplied by
                // a classifier, caller, summary, or decision-confirm payload.
                let original = self.original(r)?;
                Ok(Decision {
                    decision_id: r.decision_id.clone(),
                    message_id: r.message_id.clone(),
                    kind: r.kind,
                    verdict: r.verdict,
                    rule_id: r.rule_id.clone(),
                    operator: r.operator,
                    at: r.at.clone(),
                    simulated: r.simulated,
                    reason_codes: r.reason_codes.clone(),
                    message_text: Some(original.text),
                })
            })
            .collect()
    }

    pub fn ban_confirm(&mut self, params: DecisionParams) -> Result<Decision> {
        let queued = self.unresolved(&params.decision_id)?;
        if queued.kind != DecisionKind::BanPending {
            return Err(error(ErrorCode::Conflict, "decision is not a pending ban"));
        }
        let original = self.original(&queued)?;
        let at = self.now()?;
        let age = date(&at)?
            .signed_duration_since(date(&queued.at)?)
            .num_seconds();
        let unchanged = queued
            .rule_id
            .as_ref()
            .and_then(|id| self.config.get(id))
            .is_some_and(|m| {
                Some(&m.rule) == queued.rule_snapshot.as_ref() && m.rule.mode == RuleMode::Armed
            });
        let allowed = self.gate_available
            && (0..REVIEW_TIMEOUT_S).contains(&age)
            && unchanged
            && !original.privileged()
            && !self.caring(&original.user_id)?;
        let (kind, verdict, reason, intent) = if allowed {
            (
                DecisionKind::Banned,
                Verdict::Bar,
                "ban_confirmed",
                Some(ActionIntent {
                    action: Action::Ban,
                    timeout_s: None,
                }),
            )
        } else {
            (
                DecisionKind::Held,
                Verdict::Hold,
                "review_expired_or_withheld",
                None,
            )
        };
        self.review_record(&queued, original, kind, verdict, reason, intent)
    }

    pub fn ban_dismiss(&mut self, params: DecisionParams) -> Result<Decision> {
        let queued = self.unresolved(&params.decision_id)?;
        if queued.kind != DecisionKind::BanPending {
            return Err(error(ErrorCode::Conflict, "decision is not a pending ban"));
        }
        self.review_record(
            &queued,
            self.context(&queued)?,
            DecisionKind::Released,
            Verdict::Pass,
            "ban_dismissed",
            None,
        )
    }

    pub fn decision_undo(&mut self, params: DecisionParams) -> Result<Decision> {
        let original = self.unresolved(&params.decision_id)?;
        if !matches!(original.kind, DecisionKind::Banned | DecisionKind::TimedOut) {
            return Err(error(
                ErrorCode::BlockedByPolicy,
                "action has no supported undo",
            ));
        }
        // Undo is a human reversal request, not a new punishment. A later live
        // integration owns the Twitch acknowledgement and execution lifecycle.
        self.review_record(
            &original,
            self.context(&original)?,
            DecisionKind::Undone,
            Verdict::Pass,
            "decision_undone",
            None,
        )
    }

    pub fn petition_resolve(&mut self, params: PetitionResolveParams) -> Result<Decision> {
        let original = self.unresolved(&params.decision_id)?;
        if !matches!(original.kind, DecisionKind::Banned | DecisionKind::TimedOut) {
            return Err(error(
                ErrorCode::BlockedByPolicy,
                "petition requires a reversible action",
            ));
        }
        let (kind, verdict, reason) = match params.outcome {
            PetitionOutcome::Upheld => (DecisionKind::Held, original.verdict, "petition_upheld"),
            PetitionOutcome::Overturned => {
                (DecisionKind::Undone, Verdict::Pass, "petition_overturned")
            }
        };
        self.review_record(
            &original,
            self.context(&original)?,
            kind,
            verdict,
            reason,
            None,
        )
    }

    fn context(&self, record: &Record) -> Result<IngestedMessage> {
        // Reversals require IDs only, never reconstructed or summarized text.
        Ok(IngestedMessage {
            message_id: record.message_id.clone(),
            user_id: record
                .user_id
                .clone()
                .ok_or_else(|| crate::internal("missing review subject"))?,
            login: String::new(),
            text: String::new(),
            at: record.at.clone(),
            simulated: record.simulated,
            metadata: None,
        })
    }

    fn review_record(
        &mut self,
        original: &Record,
        msg: IngestedMessage,
        kind: DecisionKind,
        verdict: Verdict,
        reason: &'static str,
        intent: Option<ActionIntent>,
    ) -> Result<Decision> {
        let decision = Decision {
            decision_id: DecisionId::mint(),
            message_id: original.message_id.clone(),
            kind,
            verdict,
            rule_id: original.rule_id.clone(),
            operator: Operator::Human,
            at: self.now()?,
            simulated: original.simulated,
            reason_codes: vec![reason.into()],
            message_text: None,
        };
        self.record(
            decision,
            Some(&msg),
            GatePath::HumanReview,
            Some(original.decision_id.clone()),
            intent,
            false,
        )
    }
}
