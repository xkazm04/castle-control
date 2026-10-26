use super::GateActor;
use crate::{
    GatePath, Gatehouse, IngestedMessage, Result, ScreenedMessage, error, governor::Governor,
};
use cc_types::{
    ChatDelay, Decision, DecisionId, DecisionKind, ErrorCode, RoomMode, ShieldState, Timestamp,
    Verdict,
};

/// A validated channel.moderate observation, never an executable command.
/// Unknown provider strings must map to Unrecognised, never a privileged default.
#[derive(Debug, Clone, Copy)]
pub enum ExternalAction {
    Warn,
    Delete,
    Timeout,
    Ban,
    Unban,
    AllowHeld,
    DenyHeld,
    RoomMode(RoomMode),
    Delay(ChatDelay),
    Shield(bool),
    Unrecognised,
}

pub struct ModerationEvent {
    pub moderator: GateActor,
    pub action: ExternalAction,
    pub message: Option<IngestedMessage>,
    pub at: Timestamp,
}

pub struct SuspiciousMessage {
    pub message: IngestedMessage,
}

impl Gatehouse {
    /// The observed human action is logged as external, never re-executed or
    /// fed into strikes, authority metadata, the classifier or automatic actions.
    /// For room modes the existing governor is required so yielding cannot be
    /// silently skipped. Delay and Shield are not governor-owned room modes.
    pub fn ingest_moderation(
        &mut self,
        event: ModerationEvent,
        governor: Option<&mut Governor>,
    ) -> Result<Decision> {
        let (kind, verdict, reason) = match event.action {
            ExternalAction::Warn => (DecisionKind::Warned, Verdict::Pass, "external_warn"),
            ExternalAction::Delete | ExternalAction::DenyHeld => {
                (DecisionKind::Removed, Verdict::Bar, "external_remove")
            }
            ExternalAction::Timeout => (DecisionKind::TimedOut, Verdict::Bar, "external_timeout"),
            ExternalAction::Ban => (DecisionKind::Banned, Verdict::Bar, "external_ban"),
            ExternalAction::Unban => (DecisionKind::Undone, Verdict::Pass, "external_unban"),
            ExternalAction::AllowHeld => (DecisionKind::Released, Verdict::Pass, "external_allow"),
            ExternalAction::RoomMode(_) | ExternalAction::Delay(_) | ExternalAction::Shield(_) => {
                (DecisionKind::ModeChanged, Verdict::Hold, "external_setting")
            }
            ExternalAction::Unrecognised => {
                (DecisionKind::Held, Verdict::Hold, "external_unrecognised")
            }
        };
        if matches!(
            event.action,
            ExternalAction::Warn
                | ExternalAction::Delete
                | ExternalAction::Timeout
                | ExternalAction::Ban
                | ExternalAction::Unban
                | ExternalAction::AllowHeld
                | ExternalAction::DenyHeld
        ) && event.message.is_none()
        {
            return Err(error(
                ErrorCode::Invalid,
                "external viewer action requires subject context",
            ));
        }
        if let ExternalAction::RoomMode(mode) = event.action {
            governor
                .ok_or_else(|| {
                    error(
                        ErrorCode::Invalid,
                        "room mode observation requires governor",
                    )
                })?
                .observe_human_change(mode)?;
        }
        let mut parent = None;
        if matches!(
            event.action,
            ExternalAction::AllowHeld | ExternalAction::DenyHeld
        ) {
            let message = event.message.as_ref().expect("checked subject");
            // This is an observation of a completed human action, not permission
            // to perform one. It must still be audited if intake was missed or
            // the original expired. Link a known root without fabricating text.
            if let Some(root) = self.records()?.into_iter().find(|r| {
                r.message_id == message.message_id
                    && r.path == GatePath::AutoModHeld
                    && r.parent.is_none()
            }) {
                if root.user_id.as_ref() != Some(&message.user_id) {
                    return Err(error(
                        ErrorCode::Conflict,
                        "held resolution subject mismatch",
                    ));
                }
                parent = Some(root.decision_id);
            }
        }
        let mut decision = self.gate_decision(
            event.message.as_ref().map(|m| m.message_id.clone()),
            kind,
            verdict,
            event.moderator.simulated,
            reason,
        )?;
        decision.at = event.at;
        decision.reason_codes.push("external_twitch_ui".into());
        // IDs only; never a moderator login, arbitrary event text or model label.
        decision
            .reason_codes
            .push(format!("moderator_id:{}", event.moderator.user_id.as_str()));
        match event.action {
            ExternalAction::Delay(delay) => decision
                .reason_codes
                .push(format!("delay_s:{}", u8::from(delay))),
            ExternalAction::Shield(enabled) => decision
                .reason_codes
                .push(format!("shield_enabled:{enabled}")),
            _ => {}
        }
        let decision = self.record_external(
            decision,
            event.message.as_ref(),
            GatePath::ExternalHuman,
            parent,
            &event.moderator,
        )?;
        match event.action {
            ExternalAction::Delay(delay_s) => {
                self.gate_settings.delay = Some(cc_types::DelaySetResult { delay_s });
                self.gate_settings.delay_epoch = DecisionId::mint();
            }
            ExternalAction::Shield(enabled) => {
                self.gate_settings.shield = Some(ShieldState { enabled });
                self.gate_settings.shield_epoch = DecisionId::mint();
            }
            _ => {}
        }
        Ok(decision)
    }

    /// Restricted/suspicious messages have a distinct intake that cannot call
    /// screen_batch or emit an ActionIntent, even when punitive rules are armed.
    pub fn suspicious_message(&mut self, input: SuspiciousMessage) -> Result<ScreenedMessage> {
        let msg = input.message;
        let decision = self.gate_decision(
            Some(msg.message_id.clone()),
            DecisionKind::Held,
            Verdict::Hold,
            msg.simulated,
            "suspicious_human_review",
        )?;
        let decision = self.record(
            decision,
            Some(&msg),
            GatePath::SuspiciousReview,
            None,
            None,
            false,
        )?;
        Ok(ScreenedMessage {
            message: msg,
            decision,
            intent: None,
            path: GatePath::SuspiciousReview,
            reaches_streamer: true,
        })
    }

    pub fn suspicious_queue(&self) -> Result<Vec<Decision>> {
        self.records()?
            .iter()
            .filter(|r| r.path == GatePath::SuspiciousReview)
            .map(|r| {
                let mut decision = r.decision();
                decision.message_text = Some(self.original(r)?.text);
                Ok(decision)
            })
            .collect()
    }
}
