// Adapted from Shadowrunr OS @ 7e4b6f8,
// crates/shadowrunr-daemon/src/moderator/lane.rs (Apache-2.0; see NOTICE).
use crate::gate::{HoldBudget, MeasuredBatch};
use crate::{
    Classifier, ClassifierError, Gatehouse, IngestedMessage, Result, classifier, date, internal,
    rules, store,
};
use cc_store::{DecisionAction, LedgerEvent, LedgerKind};
use cc_types::{
    Action, Decision, DecisionId, DecisionKind, Operator, Rule, RuleClass, RuleMode, Verdict,
};
use serde::{Deserialize, Serialize};
use std::time::{Duration, Instant};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ActionIntent {
    pub action: Action,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub timeout_s: Option<u32>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum GatePath {
    Skipped,
    FoundNothing,
    Care,
    VerifiedAuthority,
    Shadow,
    PatternAction,
    ClassifierAction,
    BanPending,
    HumanReview,
    Withheld,
    Configuration,
    AutoModHeld,
    SuspiciousReview,
    ExternalHuman,
    GateSetting,
}

impl GatePath {
    pub(crate) fn label(self) -> &'static str {
        match self {
            Self::Skipped => "gate_skipped",
            Self::FoundNothing => "gate_found_nothing",
            Self::Care => "care",
            Self::VerifiedAuthority => "verified_authority",
            Self::Shadow => "shadow",
            Self::PatternAction => "pattern_action",
            Self::ClassifierAction => "classifier_action",
            Self::BanPending => "ban_pending",
            Self::HumanReview => "human_review",
            Self::Withheld => "withheld",
            Self::Configuration => "configuration",
            Self::AutoModHeld => "automod_held",
            Self::SuspiciousReview => "suspicious_review",
            Self::ExternalHuman => "external_human",
            Self::GateSetting => "gate_setting",
        }
    }
}

#[derive(Debug, Clone)]
pub struct ScreenedMessage {
    pub message: IngestedMessage,
    pub decision: Decision,
    pub intent: Option<ActionIntent>,
    pub path: GatePath,
    pub reaches_streamer: bool,
}

enum Candidate {
    Care,
    Clean,
    Withheld,
    Unavailable(ClassifierError),
    Hit(Rule, Verdict),
}

impl Gatehouse {
    /// No dedupe or shedding precedes disclosure detection. All inputs, including
    /// repeated message IDs, are screened. Output preserves input order.
    pub async fn screen_batch(
        &mut self,
        messages: Vec<IngestedMessage>,
        classifier: &dyn Classifier,
    ) -> Result<Vec<ScreenedMessage>> {
        Ok(self
            .screen_batch_measured(
                messages,
                classifier,
                Duration::ZERO,
                Duration::ZERO,
                Duration::ZERO,
            )
            .await?
            .messages)
    }

    /// Host-observed upstream spans are supplied separately; this crate measures
    /// its rules, classifier round trip and final gate (including durable audit).
    /// Batched messages share the measured model latency, never divided throughput.
    pub async fn screen_batch_measured(
        &mut self,
        messages: Vec<IngestedMessage>,
        classifier: &dyn Classifier,
        twitch_delay: Duration,
        scheduling_wait: Duration,
        admission: Duration,
    ) -> Result<MeasuredBatch> {
        let mut budgets = vec![
            HoldBudget {
                twitch_delay,
                scheduling_wait,
                admission,
                ..HoldBudget::default()
            };
            messages.len()
        ];
        let mut output = vec![None; messages.len()];
        let mut pending = Vec::new();
        let plain: Vec<_> = self
            .config
            .values()
            .filter(|m| m.rule.rule_class == RuleClass::Classifier)
            .map(|m| m.rule.clone())
            .collect();
        for (index, msg) in messages.into_iter().enumerate() {
            let rules_start = Instant::now();
            let candidate = if rules::disclosure(&msg.text) || self.caring(&msg.user_id)? {
                Some(Candidate::Care)
            } else {
                let mut hit = None;
                for managed in self
                    .config
                    .values()
                    .filter(|m| m.rule.rule_class == RuleClass::Pattern)
                {
                    let regex = rules::compile(
                        managed
                            .rule
                            .pattern
                            .as_deref()
                            .ok_or_else(|| internal("missing pattern"))?,
                    )?;
                    if rules::variants(&msg.text)
                        .iter()
                        .any(|text| regex.is_match(text))
                    {
                        hit = Some(Candidate::Hit(managed.rule.clone(), Verdict::Bar));
                        break;
                    }
                }
                hit.or_else(|| plain.is_empty().then_some(Candidate::Clean))
            };
            budgets[index].rules = rules_start.elapsed();
            if let Some(candidate) = candidate {
                let gate_start = Instant::now();
                output[index] = Some(self.gate(msg, candidate)?);
                budgets[index].gate = gate_start.elapsed();
            } else {
                pending.push((index, msg));
            }
        }
        for chunk in pending.chunks(classifier::MAX_BATCH) {
            let batch: Vec<_> = chunk.iter().map(|(_, msg)| msg.clone()).collect();
            let prompt = classifier::prompt(&plain, &batch);
            let model_start = Instant::now();
            let reply = tokio::time::timeout(
                Duration::from_secs(2),
                classifier.classify(classifier::SYSTEM, &prompt),
            )
            .await;
            let parsed = match reply {
                Ok(Ok(text)) => Ok(classifier::parse(&text, &plain, batch.len())),
                Ok(Err(error)) => Err(error),
                Err(_) => Err(ClassifierError::Unavailable),
            };
            let model_elapsed = model_start.elapsed();
            for (i, (index, msg)) in chunk.iter().enumerate() {
                budgets[*index].model = model_elapsed;
                let candidate = match &parsed {
                    Err(error) => Candidate::Unavailable(*error),
                    Ok(None) => Candidate::Withheld,
                    Ok(Some(hits)) => match &hits[i] {
                        None => Candidate::Clean,
                        Some((id, verdict)) => Candidate::Hit(
                            plain
                                .iter()
                                .find(|r| &r.rule_id == id)
                                .ok_or_else(|| internal("unknown classifier rule"))?
                                .clone(),
                            *verdict,
                        ),
                    },
                };
                let gate_start = Instant::now();
                output[*index] = Some(self.gate(msg.clone(), candidate)?);
                budgets[*index].gate = gate_start.elapsed();
            }
        }
        let messages = output
            .into_iter()
            .map(|item| item.ok_or_else(|| internal("unscreened message")))
            .collect::<Result<_>>()?;
        Ok(MeasuredBatch { messages, budgets })
    }

    fn gate(&mut self, msg: IngestedMessage, candidate: Candidate) -> Result<ScreenedMessage> {
        let at = self.now()?;
        let care = matches!(candidate, Candidate::Care) || self.caring(&msg.user_id)?;
        let mut decision = Decision {
            decision_id: DecisionId::mint(),
            message_id: msg.message_id.clone(),
            kind: DecisionKind::Released,
            verdict: Verdict::Pass,
            rule_id: None,
            operator: Operator::Ai,
            at: at.clone(),
            simulated: msg.simulated,
            reason_codes: Vec::new(),
            message_text: None,
        };
        if let Candidate::Unavailable(error) = &candidate {
            decision.reason_codes.push("classifier_unavailable".into());
            decision.reason_codes.push(error.label().into());
        }
        let mut intent = None;
        let path = if !self.gate_available {
            decision.kind = DecisionKind::Held;
            decision.verdict = Verdict::Hold;
            GatePath::Skipped
        } else if care {
            decision.kind = DecisionKind::Held;
            decision.verdict = Verdict::Hold;
            decision.rule_id = Some(store::rail().rule_id);
            GatePath::Care
        } else if msg.privileged() {
            GatePath::VerifiedAuthority
        } else {
            match candidate {
                Candidate::Care => return Err(internal("care invariant")),
                Candidate::Clean => GatePath::FoundNothing,
                Candidate::Withheld => {
                    decision.kind = DecisionKind::Held;
                    decision.verdict = Verdict::Hold;
                    GatePath::Withheld
                }
                Candidate::Unavailable(_) => {
                    decision.kind = DecisionKind::Held;
                    decision.verdict = Verdict::Hold;
                    GatePath::Withheld
                }
                Candidate::Hit(rule, verdict) => {
                    decision.rule_id = Some(rule.rule_id.clone());
                    let managed = self
                        .config
                        .get(&rule.rule_id)
                        .cloned()
                        .ok_or_else(|| internal("missing rule"))?;
                    if managed.rule != rule {
                        return Err(internal("stale rule"));
                    }
                    let (action, timeout_s) = self.strikes.hit(msg.user_id.as_str(), &rule, &at)?;
                    if rule.mode != RuleMode::Armed || !self.consented(&managed)? {
                        decision.kind = DecisionKind::WouldAct;
                        GatePath::Shadow
                    } else if verdict == Verdict::Hold || action == Action::Hold {
                        decision.kind = DecisionKind::Held;
                        decision.verdict = Verdict::Hold;
                        GatePath::Withheld
                    } else if action == Action::Ban && !self.auto_ban_allowed(&rule, &at)? {
                        decision.kind = DecisionKind::BanPending;
                        decision.verdict = Verdict::Hold;
                        decision.message_text = Some(msg.text.clone());
                        GatePath::BanPending
                    } else {
                        decision.kind = match action {
                            Action::Warn => DecisionKind::Warned,
                            Action::Delete => DecisionKind::Removed,
                            Action::Timeout => DecisionKind::TimedOut,
                            Action::Ban => DecisionKind::Banned,
                            Action::Hold => return Err(internal("hold invariant")),
                        };
                        decision.verdict = if action == Action::Warn {
                            Verdict::Pass
                        } else {
                            Verdict::Bar
                        };
                        intent = Some(ActionIntent { action, timeout_s });
                        if rule.rule_class == RuleClass::Pattern {
                            GatePath::PatternAction
                        } else {
                            GatePath::ClassifierAction
                        }
                    }
                }
            }
        };
        decision.reason_codes.push(path.label().into());
        let decision = self.record(decision, Some(&msg), path, None, intent.clone(), care)?;
        Ok(ScreenedMessage {
            reaches_streamer: decision.verdict == Verdict::Hold,
            message: msg,
            decision,
            intent,
            path,
        })
    }

    fn auto_ban_allowed(&mut self, rule: &Rule, at: &cc_types::Timestamp) -> Result<bool> {
        if rule.rule_class != RuleClass::Pattern || rule.mode != RuleMode::Armed {
            return Ok(false);
        }
        let Some(grant) = &rule.auto_ban_grant else {
            return Ok(false);
        };
        if grant.breaker_tripped || date(&grant.expires_at)? <= date(at)? {
            return Ok(false);
        }
        let now = date(at)?.timestamp();
        let records = self.records()?;
        let mut count = 0;
        // Ledger IDs survive erasure. If a rule association was erased, count
        // that ban conservatively against every grant instead of resetting caps.
        for line in self
            .store
            .read_ledger(LedgerKind::Decisions)
            .map_err(internal)?
        {
            if let LedgerEvent::Decision {
                decision_id,
                action: DecisionAction::Banned,
                ..
            } = line.event
            {
                let then = chrono::DateTime::parse_from_rfc3339(&line.recorded_at.as_rfc3339())
                    .map_err(internal)?
                    .timestamp();
                let belongs = records
                    .iter()
                    .find(|r| r.decision_id.as_str() == decision_id.to_string())
                    .is_none_or(|r| r.rule_id.as_ref() == Some(&rule.rule_id));
                if belongs && now - then < 3600 {
                    count += 1;
                }
            }
        }
        if count >= grant.max_bans_per_hour.get() as usize {
            let mut next = self.config.clone();
            let grant = next
                .get_mut(&rule.rule_id)
                .and_then(|m| m.rule.auto_ban_grant.as_mut())
                .ok_or_else(|| internal("missing grant"))?;
            grant.breaker_tripped = true;
            store::save(&self.config_path, &next)?;
            self.config = next;
            return Ok(false);
        }
        Ok(true)
    }
}
