mod common;
mod drill_support;
mod offline_common;
use cc_gatehouse::drill::{
    BlindJudge, JudgeIdentity, JudgeInput, JudgeVerdict, merge_runs, validate_report,
};
use cc_gatehouse::simulation::{BankCase, Expectation, generate, near_miss_bank};
use cc_store::TwitchUserId;
use cc_types::{
    Action, BridgeGap, DrillDiffParams, DrillRunParams, DrillState, RecordingImportParams,
    RuleMode, SimulationLabel,
};
use common::{Fake, Fixture, pattern, plain};
use drill_support::*;
use offline_common::*;
use std::sync::Arc;

fn owner() -> TwitchUserId {
    TwitchUserId::parse("999").unwrap()
}
struct Scripted;
impl BlindJudge for Scripted {
    fn identity(&self) -> JudgeIdentity {
        identity()
    }
    fn judge(&self, input: JudgeInput<'_>) -> JudgeVerdict {
        match input.case.key.as_str() {
            "pending" => JudgeVerdict::Pending,
            "void" => JudgeVerdict::Void,
            "invalid-quote" => JudgeVerdict::Observed {
                passed: true,
                quote: "not in the simulated input".into(),
            },
            _ => JudgeVerdict::Observed {
                passed: true,
                quote: input.message.text.clone(),
            },
        }
    }
}

#[tokio::test]
async fn all_six_states_count_observations_directly_without_live_ledger_writes() {
    let mut f = Fixture::new();
    let mut bank = near_miss_bank();
    bank.cases = ["acted", "pending", "void", "invalid-quote"]
        .into_iter()
        .map(|key| BankCase {
            key: key.into(),
            text: format!("simulated-{key}"),
            expected: Expectation::Action(Action::Delete),
        })
        .collect();
    let drill = service(bank, Arc::new(Scripted));
    let mut rule = pattern("pattern", Action::Delete);
    rule.pattern = Some("simulated-(acted|pending|void|invalid-quote)".into());
    rule.mode = RuleMode::Armed;
    let mut engine = Fake::new("[]");
    engine.fail = true;
    let ledger = f.root.path().join("store/decisions.jsonl");
    let before = std::fs::read(&ledger).unwrap();
    let mut recorder = f.gate.recorder(owner(), at(-100));
    let imported = recorder
        .import(RecordingImportParams {
            source: text("simulated imported provenance"),
            messages: [
                "simulated-acted",
                "simulated-pending",
                "simulated-void",
                "",
                "simulated engine failure",
                "simulated-invalid-quote",
            ]
            .iter()
            .enumerate()
            .map(|(i, body)| recorded(i, i as i64 - 10, body))
            .collect(),
            gaps: vec![],
        })
        .unwrap();
    let result = drill
        .run(
            &recorder,
            DrillRunParams {
                recording: imported.recording,
                configuration: config(vec![rule, plain(Action::Delete)]),
            },
            &engine,
        )
        .await
        .unwrap();
    assert_eq!(result.label, SimulationLabel::Simulated);
    assert_eq!(
        result.outcomes.iter().map(|o| o.state).collect::<Vec<_>>(),
        vec![
            DrillState::Acted,
            DrillState::JudgePending,
            DrillState::JudgeVoid,
            DrillState::NotEvaluable,
            DrillState::EngineFailed,
            DrillState::NotEvaluable
        ]
    );
    assert_eq!(result.summary.passes, 1);
    assert_eq!(result.summary.states.not_evaluable, 2);
    assert!(result.outcomes.iter().all(|o| o.source == result.source));
    assert!(result.outcomes.iter().skip(1).all(|o| o.passed.is_none()));
    assert_eq!(std::fs::read(ledger).unwrap(), before);
    // An unlisted ambient line is not evidence that a bank stimulus fired.
    let ambient = recorder
        .import(RecordingImportParams {
            source: text("simulated ambient"),
            messages: vec![recorded(80, -1, "simulated ambient")],
            gaps: vec![],
        })
        .unwrap();
    let unprovoked = drill
        .run(
            &recorder,
            DrillRunParams {
                recording: ambient.recording,
                configuration: config(vec![]),
            },
            &engine,
        )
        .await
        .unwrap();
    assert_eq!(unprovoked.outcomes[0].state, DrillState::NotProvoked);
    assert_eq!(unprovoked.summary.passes, 0);
}

#[tokio::test]
async fn diff_keeps_instruments_and_summaries_separate_and_reports_over_moderation() {
    let mut f = Fixture::new();
    let drill = standard();
    let bank = near_miss_bank();
    let mut recorder = f.gate.recorder(owner(), at(-100));
    let imported = recorder
        .import(RecordingImportParams {
            source: text("simulated near-miss bank"),
            messages: bank
                .cases
                .iter()
                .enumerate()
                .map(|(i, case)| recorded(i, i as i64 - 10, &case.text))
                .collect(),
            gaps: vec![],
        })
        .unwrap();
    let mut rule = pattern("tagged", Action::Delete);
    rule.mode = RuleMode::Armed;
    let candidate_config = config(vec![rule]);
    let recording = recorder.resolve(&imported.recording).unwrap();
    let result = drill
        .diff(
            &recorder,
            DrillDiffParams {
                recording: imported.recording,
                baseline: config(vec![]),
                candidate: candidate_config.clone(),
            },
            &Fake::new("[]"),
        )
        .await
        .unwrap();
    assert_ne!(
        result.baseline.instrument_hash,
        result.candidate.instrument_hash
    );
    assert_eq!(result.baseline.summary.over_moderation.evaluated, 3);
    assert_eq!(result.baseline.summary.over_moderation.false_positives, 0);
    assert_eq!(result.candidate.summary.over_moderation.evaluated, 3);
    assert_eq!(result.candidate.summary.over_moderation.false_positives, 1);
    assert_eq!(result.baseline.summary.passes, 3);
    assert_eq!(result.candidate.summary.passes, 3);
    assert_eq!(result.changes.len(), 2);
    assert!(
        result
            .changes
            .iter()
            .all(|change| change.before == change.after)
    );
    let baseline = drill
        .verify(&result.baseline, config(vec![]), &recording)
        .unwrap();
    let candidate = drill
        .verify(&result.candidate, candidate_config, &recording)
        .unwrap();
    assert!(merge_runs(&baseline, &candidate).is_err());
    assert!(merge_runs(&baseline, &baseline).is_err());
}

#[tokio::test]
async fn gaps_stay_gaps_and_are_never_scored_as_clean() {
    let mut f = Fixture::new();
    let bank = near_miss_bank();
    let drill = standard();
    let mut recorder = f.gate.recorder(owner(), at(-100));
    let gap = BridgeGap {
        from: at(-10),
        to: at(-5),
    };
    let imported = recorder
        .import(RecordingImportParams {
            source: text("simulated gaps"),
            messages: vec![recorded(1, -8, &bank.cases[0].text)],
            gaps: vec![gap.clone()],
        })
        .unwrap();
    let result = drill
        .run(
            &recorder,
            DrillRunParams {
                recording: imported.recording,
                configuration: config(vec![]),
            },
            &Fake::new("[]"),
        )
        .await
        .unwrap();
    assert_eq!(result.gaps, vec![gap]);
    assert_eq!(result.outcomes[0].state, DrillState::NotEvaluable);
    assert_eq!(result.outcomes[0].passed, None);
    assert_eq!(result.summary.passes, 0);
}

#[tokio::test]
async fn instrument_hashes_cover_resolved_contents_and_verify_arithmetic() {
    let mut f = Fixture::new();
    let bank = near_miss_bank();
    let drill = standard();
    let mut recorder = f.gate.recorder(owner(), at(-100));
    let imported = recorder
        .import(generate("7", 30, at(-40), &bank).unwrap())
        .unwrap();
    let run = |configuration| DrillRunParams {
        recording: imported.recording.clone(),
        configuration,
    };
    let result = drill
        .run(&recorder, run(config(vec![])), &Fake::new("[]"))
        .await
        .unwrap();
    let repeat = drill
        .run(&recorder, run(config(vec![])), &Fake::new("[]"))
        .await
        .unwrap();
    assert_eq!(result, repeat);
    let recording = recorder.resolve(&imported.recording).unwrap();
    drill.verify(&result, config(vec![]), &recording).unwrap();
    let mut changed = config(vec![]);
    changed.prompts.push(text("simulated changed prompt"));
    let prompt_result = drill
        .run(&recorder, run(changed), &Fake::new("[]"))
        .await
        .unwrap();
    assert_ne!(result.instrument_hash, prompt_result.instrument_hash);
    let mut modified_bank = bank.clone();
    modified_bank.calibration.push_str("; revision 2");
    let other = service(modified_bank, Arc::new(Scripted));
    let bank_result = other
        .run(&recorder, run(config(vec![])), &Fake::new("[]"))
        .await
        .unwrap();
    assert_ne!(
        result.instrument.bank_hash,
        bank_result.instrument.bank_hash
    );
    let mut modified_judge = identity();
    modified_judge.rubric.push_str("; changed");
    let other = service(
        bank,
        Arc::new(cc_gatehouse::drill::ExpectedJudge(modified_judge)),
    );
    let judge_result = other
        .run(&recorder, run(config(vec![])), &Fake::new("[]"))
        .await
        .unwrap();
    assert_ne!(
        result.instrument.judge_hash,
        judge_result.instrument.judge_hash
    );
    let mut tampered = result.clone();
    tampered.summary.passes += 1;
    assert!(validate_report(&tampered).is_err());
    let mut tampered = result.clone();
    tampered.summary.over_moderation.evaluated = 0;
    assert!(drill.verify(&tampered, config(vec![]), &recording).is_err());
    let mut tampered = result.clone();
    tampered.instrument_hash = "0".repeat(64).try_into().unwrap();
    assert!(validate_report(&tampered).is_err());
    let mut tampered = result.clone();
    tampered.outcomes[0].source = text("simulated forged");
    assert!(validate_report(&tampered).is_err());
}

#[test]
fn seeded_simulation_has_reproducible_ids_timing_and_honest_provenance() {
    let bank = near_miss_bank();
    let a = generate("42", 100, at(0), &bank).unwrap();
    assert_eq!(a, generate("42", 100, at(0), &bank).unwrap());
    assert_ne!(
        a.messages,
        generate("43", 100, at(0), &bank).unwrap().messages
    );
    assert!(String::from(a.source).contains("simulated"));
    assert!(
        bank.cases
            .iter()
            .filter(|case| case.expected == Expectation::Allow)
            .count()
            >= 3
    );
}
