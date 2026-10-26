use crate::simulation::{Expectation, RuleBank};
use crate::{Result, error, instrument};
use cc_types::{
    DrillOutcome, DrillRunResult, DrillState, DrillStateCounts, DrillSummary, ErrorCode,
    OverModeration, RecordedMessage, Verdict,
};
use std::collections::BTreeSet;

/// Only a result checked against resolved configuration/recording can aggregate.
pub struct VerifiedRun {
    pub(crate) result: DrillRunResult,
}
impl VerifiedRun {
    pub fn result(&self) -> &DrillRunResult {
        &self.result
    }
}

fn empty() -> DrillSummary {
    DrillSummary {
        passes: 0,
        states: DrillStateCounts {
            acted: 0,
            not_provoked: 0,
            not_evaluable: 0,
            judge_pending: 0,
            judge_void: 0,
            engine_failed: 0,
        },
        over_moderation: OverModeration {
            evaluated: 0,
            false_positives: 0,
        },
    }
}

fn observe(summary: &mut DrillSummary, outcome: &DrillOutcome) {
    summary.passes += u32::from(outcome.passed == Some(true));
    let slot = match outcome.state {
        DrillState::Acted => &mut summary.states.acted,
        DrillState::NotProvoked => &mut summary.states.not_provoked,
        DrillState::NotEvaluable => &mut summary.states.not_evaluable,
        DrillState::JudgePending => &mut summary.states.judge_pending,
        DrillState::JudgeVoid => &mut summary.states.judge_void,
        DrillState::EngineFailed => &mut summary.states.engine_failed,
    };
    *slot += 1;
}

pub(crate) fn summarize(
    outcomes: &[DrillOutcome],
    bank: &RuleBank,
    messages: &[RecordedMessage],
) -> Result<DrillSummary> {
    let mut summary = empty();
    for (outcome, message) in outcomes.iter().zip(messages) {
        observe(&mut summary, outcome);
        if outcome.passed.is_some()
            && bank
                .cases
                .iter()
                .any(|case| case.text == message.text && case.expected == Expectation::Allow)
        {
            summary.over_moderation.evaluated += 1;
            summary.over_moderation.false_positives +=
                u32::from(outcome.action.is_some() || outcome.verdict != Some(Verdict::Pass));
        }
    }
    Ok(summary)
}

/// Structural arithmetic validation. `Drill::verify` additionally checks all
/// resolved input hashes, provenance, alignment and the near-miss denominator.
pub fn validate_report(result: &DrillRunResult) -> Result<()> {
    if instrument::hash(&result.instrument)? != result.instrument_hash {
        return Err(error(ErrorCode::Invalid, "instrument digest mismatch"));
    }
    let mut observed = empty();
    let mut ids = BTreeSet::new();
    for outcome in &result.outcomes {
        if outcome.source != result.source
            || !ids.insert(&outcome.message_id)
            || (outcome.state == DrillState::Acted) != outcome.passed.is_some()
            || (outcome.passed.is_some() && outcome.verdict.is_none())
            || (outcome.action.is_some() && outcome.rule_id.is_none())
        {
            return Err(error(
                ErrorCode::Invalid,
                "invalid outcome observation or provenance",
            ));
        }
        observe(&mut observed, outcome);
    }
    if result.summary.states != observed.states
        || result.summary.passes != observed.passes
        || result.summary.over_moderation.false_positives > result.summary.over_moderation.evaluated
        || result.summary.over_moderation.evaluated > observed.states.acted
    {
        return Err(error(ErrorCode::Invalid, "invalid summary arithmetic"));
    }
    Ok(())
}

/// Merging is explicit and restricted to one source/instrument and disjoint IDs.
/// Different instruments belong beside each other in a diff, never in a score.
pub fn merge_runs(left: &VerifiedRun, right: &VerifiedRun) -> Result<VerifiedRun> {
    let (left, right) = (&left.result, &right.result);
    validate_report(left)?;
    validate_report(right)?;
    if left.instrument_hash != right.instrument_hash
        || left.instrument != right.instrument
        || left.source != right.source
    {
        return Err(error(
            ErrorCode::Conflict,
            "cannot merge different instruments or sources",
        ));
    }
    let mut result = left.clone();
    result.outcomes.extend(right.outcomes.clone());
    result
        .outcomes
        .sort_by_key(|outcome| crate::date(&outcome.at).expect("validated timestamp"));
    result.gaps.extend(right.gaps.clone());
    for outcome in &right.outcomes {
        observe(&mut result.summary, outcome);
    }
    result.summary.over_moderation.evaluated = result
        .summary
        .over_moderation
        .evaluated
        .checked_add(right.summary.over_moderation.evaluated)
        .ok_or_else(|| error(ErrorCode::Invalid, "summary overflow"))?;
    result.summary.over_moderation.false_positives = result
        .summary
        .over_moderation
        .false_positives
        .checked_add(right.summary.over_moderation.false_positives)
        .ok_or_else(|| error(ErrorCode::Invalid, "summary overflow"))?;
    validate_report(&result)?;
    Ok(VerifiedRun { result })
}
