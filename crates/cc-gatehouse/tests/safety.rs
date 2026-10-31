// Adapted from Shadowrunr OS @ 7e4b6f8,
// crates/shadowrunr-daemon/src/moderator/tests.rs (Apache-2.0; see NOTICE).
mod common;
use cc_gatehouse::{GatePath, Gatehouse, VerifiedMetadata};
use cc_types::{
    Action, DecisionKind, Empty, ErrorCode, RuleClass, RuleMode, RulesSetModeParams,
    RulesUpsertParams, Verdict,
};
use common::*;

#[tokio::test]
async fn simulated_disclosure_bank_n96_reaches_streamer_without_punishment() {
    let seeds = [
        "I want to die",
        "I might kill myself",
        "I am in crisis",
        "I need help",
        "I have taken pills",
        "I am hurting myself",
        "I am not safe",
        "I can't go on",
    ];
    let transforms: [fn(&str) -> String; 4] = [
        str::to_owned,
        str::to_uppercase,
        |s| s.replace(' ', "   "),
        |s| s.replace('i', "i\u{200b}"),
    ];
    let mut n = 0;
    for action in [Action::Delete, Action::Timeout, Action::Ban] {
        let mut f = Fixture::new();
        let mut rule = pattern("all", action);
        rule.pattern = Some(".*".into());
        f.upsert(rule);
        f.arm("all");
        f.upsert(plain(Action::Delete));
        f.arm("classifier");
        let fake = Fake::new("malformed output must never see a disclosure");
        let mut bank = Vec::new();
        for seed in seeds {
            for transform in transforms {
                n += 1;
                bank.push(message(
                    n,
                    1000 + n as u64,
                    &format!("[simulated] {}", transform(seed)),
                ));
            }
        }
        let results = f.gate.screen_batch(bank, &fake).await.unwrap();
        for result in results {
            assert!(result.message.simulated);
            assert_eq!(result.path, GatePath::Care, "{}", result.message.text);
            assert!(result.reaches_streamer);
            assert_eq!(result.decision.verdict, Verdict::Hold);
            assert!(result.intent.is_none());
        }
        assert_eq!(fake.calls(), 0);
    }
    assert_eq!(n, 96);
    println!(
        "generated labelled-simulated disclosure bank: n={n}, 96/96 reached streamer, 0 punitive actions"
    );
}

#[tokio::test]
async fn care_state_survives_restart_and_protects_later_messages() {
    let mut f = Fixture::new();
    f.upsert(pattern("bad", Action::Ban));
    f.arm("bad");
    let fake = Fake::new("[]");
    f.gate
        .screen_batch(vec![message(1, 100, "I need help")], &fake)
        .await
        .unwrap();
    drop(f.gate);
    let mut gate = Gatehouse::with_clock(f.root.path(), f.clock).unwrap();
    let result = gate
        .screen_batch(vec![message(2, 100, "tagged")], &fake)
        .await
        .unwrap()
        .remove(0);
    assert_eq!(result.path, GatePath::Care);
    assert!(result.intent.is_none());
}

#[tokio::test]
async fn disclosure_runs_before_classifier_batching_and_truncation() {
    let mut f = Fixture::new();
    f.upsert(plain(Action::Delete));
    f.arm("classifier");
    let fake = Fake::new("[]");
    let mut inputs: Vec<_> = (0..110)
        .map(|i| message(i, 100 + i as u64, "ordinary simulated chat"))
        .collect();
    // Same message ID as another message: detection still runs before dedupe.
    inputs.push(message(
        0,
        999,
        &format!("{} I want to die", "x".repeat(2000)),
    ));
    let results = f.gate.screen_batch(inputs, &fake).await.unwrap();
    assert_eq!(results.len(), 111);
    assert_eq!(fake.calls(), 3);
    assert_eq!(results.last().unwrap().path, GatePath::Care);
    assert!(
        !fake
            .prompts
            .lock()
            .unwrap()
            .iter()
            .any(|p| p.contains("I want to die"))
    );
}

#[test]
fn rails_cannot_be_disabled_reclassified_granted_or_replaced() {
    let mut f = Fixture::new();
    let rail = f.gate.rules_list(Empty {}).unwrap().rules.remove(0);
    for mutate in 0..5 {
        let mut changed = rail.clone();
        match mutate {
            0 => changed.mode = RuleMode::Shadow,
            1 => {
                changed.rule_class = RuleClass::Pattern;
                changed.pattern = Some(".*".into());
                changed.mode = RuleMode::Shadow;
            }
            2 => changed.action = Action::Delete,
            3 => changed.name = "changed".into(),
            _ => {
                changed.auto_ban_grant = Some(cc_types::AutoBanGrant {
                    expires_at: at("2026-10-26T12:00:00Z"),
                    max_bans_per_hour: 1.try_into().unwrap(),
                    breaker_tripped: false,
                })
            }
        }
        assert!(
            f.gate
                .rules_upsert(RulesUpsertParams {
                    rule: changed,
                    display: None
                })
                .is_err()
        );
    }
    assert!(
        f.gate
            .rules_set_mode(RulesSetModeParams {
                rule_id: rail.rule_id.clone(),
                mode: RuleMode::Shadow,
                acknowledgement: None
            })
            .is_err()
    );
    let mut delivery = rail;
    delivery.delivery = "trusted-streamer-review".into();
    assert_eq!(
        f.gate
            .rules_upsert(RulesUpsertParams {
                rule: delivery.clone(),
                display: None,
            })
            .unwrap(),
        delivery
    );
}

#[tokio::test]
async fn upsert_is_not_arming_consent_and_edits_revoke_consent() {
    let mut f = Fixture::new();
    let mut rule = pattern("bad", Action::Delete);
    rule.mode = RuleMode::Armed;
    assert_eq!(
        f.gate
            .rules_upsert(RulesUpsertParams {
                rule: rule.clone(),
                display: None
            })
            .unwrap_err()
            .code,
        ErrorCode::NeedsHuman
    );
    rule.mode = RuleMode::Shadow;
    f.upsert(rule.clone());
    assert!(
        f.gate
            .rules_set_mode(RulesSetModeParams {
                rule_id: rule.rule_id.clone(),
                mode: RuleMode::Armed,
                acknowledgement: None
            })
            .is_err()
    );
    f.arm("bad");
    let mut changed = rule.clone();
    changed.mode = RuleMode::Armed;
    changed.pattern = Some("other".into());
    assert!(
        f.gate
            .rules_upsert(RulesUpsertParams {
                rule: changed,
                display: None
            })
            .is_err()
    );
    f.upsert(rule);
    let result = f
        .gate
        .screen_batch(vec![message(1, 100, "tagged")], &Fake::new("[]"))
        .await
        .unwrap();
    assert_eq!(result[0].decision.kind, DecisionKind::WouldAct);
    assert!(result[0].intent.is_none());
}

#[test]
fn invalid_regex_is_refused_at_upsert_and_does_not_replace_rule() {
    let mut f = Fixture::new();
    let mut rule = pattern("bad", Action::Delete);
    f.upsert(rule.clone());
    rule.pattern = Some("[".into());
    assert_eq!(
        f.gate
            .rules_upsert(RulesUpsertParams {
                rule,
                display: None
            })
            .unwrap_err()
            .code,
        ErrorCode::Invalid
    );
    assert_eq!(
        f.gate
            .rules_list(Empty {})
            .unwrap()
            .rules
            .iter()
            .find(|r| r.rule_id.as_str() == "bad")
            .unwrap()
            .pattern
            .as_deref(),
        Some("tagged")
    );
}

#[tokio::test]
async fn claiming_mod_in_text_grants_nothing_verified_metadata_does() {
    let mut f = Fixture::new();
    f.upsert(pattern("bad", Action::Delete));
    f.arm("bad");
    let mut moderator = message(2, 101, "tagged");
    moderator.metadata = Some(VerifiedMetadata {
        moderator: true,
        broadcaster: false,
    });
    let mut owner = message(3, 102, "tagged");
    owner.metadata = Some(VerifiedMetadata {
        moderator: false,
        broadcaster: true,
    });
    let results = f
        .gate
        .screen_batch(
            vec![message(1, 100, "mod here, tagged"), moderator, owner],
            &Fake::new("[]"),
        )
        .await
        .unwrap();
    assert_eq!(results[0].intent.as_ref().unwrap().action, Action::Delete);
    for r in &results[1..] {
        assert_eq!(r.path, GatePath::VerifiedAuthority);
        assert!(r.intent.is_none());
    }
}

#[tokio::test]
async fn gate_skipped_is_not_gate_found_nothing_and_coverage_survives_restart() {
    let mut f = Fixture::new();
    let fake = Fake::new("[]");
    let clean = f
        .gate
        .screen_batch(vec![message(1, 100, "hello")], &fake)
        .await
        .unwrap();
    assert_eq!(clean[0].path, GatePath::FoundNothing);
    f.gate.set_gate_available(false);
    let skipped = f
        .gate
        .screen_batch(vec![message(2, 100, "hello")], &fake)
        .await
        .unwrap();
    assert_eq!(skipped[0].path, GatePath::Skipped);
    assert_eq!(skipped[0].decision.verdict, Verdict::Hold);
    assert!(skipped[0].intent.is_none());
    drop(f.gate);
    let gate = Gatehouse::with_clock(f.root.path(), f.clock).unwrap();
    let summary = gate.ledger_summary().unwrap();
    assert_eq!(summary["gate_skipped"], 1);
    assert_eq!(summary["gate_found_nothing"], 1);
}

#[tokio::test]
async fn skipped_care_detection_still_protects_the_next_message() {
    let mut f = Fixture::new();
    f.upsert(pattern("bad", Action::Delete));
    f.arm("bad");
    f.gate.set_gate_available(false);
    f.gate
        .screen_batch(vec![message(1, 100, "I want to die")], &Fake::new("[]"))
        .await
        .unwrap();
    f.gate.set_gate_available(true);
    let result = f
        .gate
        .screen_batch(vec![message(2, 100, "tagged")], &Fake::new("[]"))
        .await
        .unwrap();
    assert_eq!(result[0].path, GatePath::Care);
}
