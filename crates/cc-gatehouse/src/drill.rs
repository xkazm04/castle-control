//! Offline replay and blind evaluation. No executor, live ledger or RPC registry.
use crate::{Classifier, Result, date, error, instrument, internal, rules};
use crate::{
    drill_evaluate::Evaluator,
    recorder::{Recorder, Recording},
    simulation::{BankCase, Expectation, RuleBank},
};
use cc_types::{
    DrillChange, DrillConfiguration, DrillDiffParams, DrillDiffResult, DrillOutcome,
    DrillRunParams, DrillRunResult, DrillState, ErrorCode, RecordedMessage, SimulationLabel,
};
use serde::Serialize;
use std::{
    collections::{BTreeMap, BTreeSet},
    sync::Arc,
};

pub use crate::drill_report::{VerifiedRun, merge_runs, validate_report};

/// Immutable, service-resolved judge contents, included in the instrument hash.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct JudgeIdentity {
    pub revision: String,
    pub model: String,
    pub tier: String,
    pub rubric: String,
    pub parameters: BTreeMap<String, String>,
}

/// The judge sees evidence and an observable rubric, never rules or host prompts.
pub struct JudgeInput<'a> {
    pub message: &'a RecordedMessage,
    pub case: &'a BankCase,
    pub outcome: &'a DrillOutcome,
}

pub enum JudgeVerdict {
    Observed { passed: bool, quote: String },
    Pending,
    Void,
    NotEvaluable,
}

pub trait BlindJudge: Send + Sync {
    fn identity(&self) -> JudgeIdentity;
    fn judge(&self, input: JudgeInput<'_>) -> JudgeVerdict;
}

struct Judge {
    identity: JudgeIdentity,
    implementation: Arc<dyn BlindJudge>,
}

pub struct Drill {
    banks: BTreeMap<String, RuleBank>,
    judges: BTreeMap<String, Judge>,
    subject_tier: String,
}

impl Drill {
    /// The subject's configured tier is service-owned, never imported log data.
    pub fn new(subject_tier: String) -> Self {
        Self {
            banks: BTreeMap::new(),
            judges: BTreeMap::new(),
            subject_tier,
        }
    }

    pub fn register_bank(&mut self, bank: RuleBank) -> Result<()> {
        let label = String::from(bank.label.clone());
        let mut keys = BTreeSet::new();
        let mut texts = BTreeSet::new();
        if bank.calibration.trim().is_empty()
            || bank.cases.iter().any(|case| {
                case.key.is_empty()
                    || case.text.is_empty()
                    || !keys.insert(&case.key)
                    || !texts.insert(&case.text)
            })
        {
            return Err(error(ErrorCode::Invalid, "invalid or duplicate bank case"));
        }
        if self.banks.contains_key(&label) {
            return Err(error(ErrorCode::Conflict, "bank label is immutable"));
        }
        self.banks.insert(label, bank);
        Ok(())
    }

    pub fn register_judge(
        &mut self,
        label: cc_types::GatehouseText,
        implementation: Arc<dyn BlindJudge>,
    ) -> Result<()> {
        let identity = implementation.identity();
        if [
            &identity.revision,
            &identity.model,
            &identity.tier,
            &identity.rubric,
        ]
        .iter()
        .any(|s| s.trim().is_empty())
            || identity.tier == self.subject_tier
        {
            return Err(error(
                ErrorCode::Invalid,
                "judge identity missing or same tier as subject",
            ));
        }
        let key = String::from(label);
        if self.judges.contains_key(&key) {
            return Err(error(ErrorCode::Conflict, "judge label is immutable"));
        }
        self.judges.insert(
            key,
            Judge {
                identity,
                implementation,
            },
        );
        Ok(())
    }

    fn resolve(&self, config: &mut DrillConfiguration) -> Result<(&RuleBank, &Judge)> {
        config.rules = config
            .rules
            .iter()
            .cloned()
            .map(rules::validate)
            .collect::<Result<_>>()?;
        config.rules.sort_by(|a, b| a.rule_id.cmp(&b.rule_id));
        if config
            .rules
            .windows(2)
            .any(|pair| pair[0].rule_id == pair[1].rule_id)
        {
            return Err(error(ErrorCode::Invalid, "duplicate replay rule"));
        }
        let bank = self
            .banks
            .get(&String::from(config.bank.clone()))
            .ok_or_else(|| error(ErrorCode::NotFound, "bank not found"))?;
        let judge = self
            .judges
            .get(&String::from(config.judge.clone()))
            .ok_or_else(|| error(ErrorCode::NotFound, "judge not found"))?;
        if judge.identity != judge.implementation.identity() {
            return Err(error(
                ErrorCode::Conflict,
                "judge changed after registration",
            ));
        }
        Ok((bank, judge))
    }

    pub async fn run(
        &self,
        recorder: &Recorder<'_>,
        params: DrillRunParams,
        engine: &dyn Classifier,
    ) -> Result<DrillRunResult> {
        let recording = recorder.resolve(&params.recording)?;
        self.replay(&recording, params.configuration, engine).await
    }

    pub(crate) async fn replay(
        &self,
        recording: &Recording,
        mut config: DrillConfiguration,
        engine: &dyn Classifier,
    ) -> Result<DrillRunResult> {
        let (bank, judge) = self.resolve(&mut config)?;
        let (instrument, instrument_hash) = instrument::instrument(&config, bank, &judge.identity)?;
        let mut evaluator = Evaluator::default();
        let mut outcomes = Vec::new();
        for message in &recording.messages {
            let at = date(&message.at)?;
            let in_gap = recording.gaps.iter().any(|gap| {
                date(&gap.from).is_ok_and(|from| from <= at)
                    && date(&gap.to).is_ok_and(|to| at < to)
            });
            let mut outcome = if in_gap {
                DrillOutcome {
                    message_id: message.message_id.clone(),
                    at: message.at.clone(),
                    source: recording.source.clone(),
                    state: DrillState::NotEvaluable,
                    verdict: None,
                    action: None,
                    rule_id: None,
                    passed: None,
                }
            } else {
                evaluator
                    .evaluate(
                        message,
                        &recording.source,
                        &config.rules,
                        &config.prompts,
                        engine,
                    )
                    .await?
            };
            if !matches!(
                outcome.state,
                DrillState::NotEvaluable | DrillState::EngineFailed
            ) && let Some(case) = bank.cases.iter().find(|case| case.text == message.text)
            {
                outcome.state = match judge.implementation.judge(JudgeInput {
                    message,
                    case,
                    outcome: &outcome,
                }) {
                    JudgeVerdict::Observed { passed, quote }
                        if !quote.is_empty() && message.text.contains(&quote) =>
                    {
                        outcome.passed = Some(passed);
                        DrillState::Acted
                    }
                    JudgeVerdict::Observed { .. } | JudgeVerdict::NotEvaluable => {
                        DrillState::NotEvaluable
                    }
                    JudgeVerdict::Pending => DrillState::JudgePending,
                    JudgeVerdict::Void => DrillState::JudgeVoid,
                };
            }
            outcomes.push(outcome);
        }
        let summary = crate::drill_report::summarize(&outcomes, bank, &recording.messages)?;
        let result = DrillRunResult {
            label: SimulationLabel::Simulated,
            source: recording.source.clone(),
            instrument_hash,
            instrument,
            outcomes,
            summary,
            gaps: recording.gaps.clone(),
        };
        validate_report(&result)?;
        Ok(result)
    }

    /// Verify contents, not merely hash shape, before a stored result is trusted.
    pub fn verify(
        &self,
        result: &DrillRunResult,
        mut config: DrillConfiguration,
        recording: &Recording,
    ) -> Result<VerifiedRun> {
        let (bank, judge) = self.resolve(&mut config)?;
        let (parts, hash) = instrument::instrument(&config, bank, &judge.identity)?;
        if parts != result.instrument
            || hash != result.instrument_hash
            || result.source != recording.source
            || result.gaps != recording.gaps
            || result.outcomes.len() != recording.messages.len()
            || result
                .outcomes
                .iter()
                .zip(&recording.messages)
                .any(|(o, m)| o.message_id != m.message_id || o.at != m.at)
            || result.summary
                != crate::drill_report::summarize(&result.outcomes, bank, &recording.messages)?
        {
            return Err(error(
                ErrorCode::Invalid,
                "replay evidence does not match instrument or recording",
            ));
        }
        validate_report(result)?;
        Ok(VerifiedRun {
            result: result.clone(),
        })
    }

    pub async fn diff(
        &self,
        recorder: &Recorder<'_>,
        params: DrillDiffParams,
        engine: &dyn Classifier,
    ) -> Result<DrillDiffResult> {
        // One retained snapshot for both sides; missing IDs cannot silently align.
        let recording = recorder.resolve(&params.recording)?;
        self.compare(&recording, params.baseline, params.candidate, engine)
            .await
    }

    pub(crate) async fn compare(
        &self,
        recording: &Recording,
        baseline: DrillConfiguration,
        candidate: DrillConfiguration,
        engine: &dyn Classifier,
    ) -> Result<DrillDiffResult> {
        let baseline = self.replay(recording, baseline, engine).await?;
        let candidate = self.replay(recording, candidate, engine).await?;
        if baseline.outcomes.len() != candidate.outcomes.len() {
            return Err(internal("diff length mismatch"));
        }
        let mut changes = Vec::new();
        for (before, after) in baseline.outcomes.iter().zip(&candidate.outcomes) {
            if before.message_id != after.message_id
                || before.at != after.at
                || before.source != after.source
            {
                return Err(internal("diff alignment mismatch"));
            }
            if before.state != after.state
                || before.verdict != after.verdict
                || before.action != after.action
                || before.rule_id != after.rule_id
                || before.passed != after.passed
            {
                changes.push(DrillChange {
                    message_id: before.message_id.clone(),
                    before: before.state,
                    after: after.state,
                });
            }
        }
        Ok(DrillDiffResult {
            label: SimulationLabel::Simulated,
            baseline,
            candidate,
            changes,
        })
    }
}

/// Offline baseline judge. A production judge is injected behind the same seam.
pub struct ExpectedJudge(pub JudgeIdentity);
impl BlindJudge for ExpectedJudge {
    fn identity(&self) -> JudgeIdentity {
        self.0.clone()
    }
    fn judge(&self, input: JudgeInput<'_>) -> JudgeVerdict {
        let passed = match input.case.expected {
            Expectation::Allow => {
                input.outcome.action.is_none()
                    && input.outcome.verdict == Some(cc_types::Verdict::Pass)
            }
            Expectation::Action(action) => input.outcome.action == Some(action),
        };
        JudgeVerdict::Observed {
            passed,
            quote: input.message.text.clone(),
        }
    }
}
