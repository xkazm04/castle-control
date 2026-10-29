//! WP 5.2 examples against simulated, isolated chamber configuration.
//! Map Room is deferred with M4; no provider, art generation or live viewer.
mod steward_support;

use cc_types::*;
use steward_support::{Harness, fixture};

#[tokio::test]
async fn subscribers_questions_three_winners_seal_applies_and_tear_discards() {
    let mut source = fixture(0);
    let WritProposal::DrawUpsert(diff) = &mut source.proposal else {
        unreachable!()
    };
    diff.after.draw.rules.pool = LotsPool::Subscribers;
    diff.after.draw.policy.subscriber_only = true;
    let expected = diff.after.draw.clone();
    assert_eq!(expected.policy.content, DrawContent::Question);
    assert_eq!(expected.rules.winner_count.get(), 3);
    let h = Harness::new(&[source.clone(), source.clone()]).await;
    h.lifecycle(&source, "Run a draw for subscribers' questions, 3 winners")
        .await;
    let actual: DrawListResult = h.read(RpcRequest::DrawList(Empty {})).await;
    assert_eq!(actual.draws, vec![expected]);
}

#[tokio::test]
async fn keep_caps_watching_seal_applies_shadow_edit_and_tear_discards() {
    let links = fixture(1);
    let WritProposal::RulesUpsert(links_diff) = &links.proposal else {
        unreachable!()
    };
    let mut source = links.clone();
    let WritProposal::RulesUpsert(diff) = &mut source.proposal else {
        unreachable!()
    };
    diff.after.rule.rule_id = RuleId::try_from("simulated-caps".to_string()).unwrap();
    diff.after.rule.name = "Simulated caps".into();
    diff.after.rule.pattern = Some("[A-Z]{8,}".into());
    let original = diff.after.clone();
    diff.after.rule.action = Action::Warn;
    assert_eq!(diff.after.rule.mode, RuleMode::Shadow);
    let expected = diff.after.rule.clone();
    let h = Harness::new(&[source.clone(), source.clone()]).await;
    h.registry
        .dispatch(&RpcRequest::RulesUpsert(links_diff.after.clone()))
        .await
        .unwrap();
    h.registry
        .dispatch(&RpcRequest::RulesUpsert(original))
        .await
        .unwrap();
    let before: RulesListResult = h.read(RpcRequest::RulesList(Empty {})).await;
    h.lifecycle(&source, "Keep caps watching").await;
    let after: RulesListResult = h.read(RpcRequest::RulesList(Empty {})).await;
    let mut expected_rules = before.rules;
    let expected_id = expected.rule_id.clone();
    *expected_rules
        .iter_mut()
        .find(|rule| rule.rule_id == expected_id)
        .unwrap() = expected;
    assert_eq!(after.rules, expected_rules);
}

#[tokio::test]
async fn gold_gift_sub_frame_visual_and_curve_require_seal_and_support_tear() {
    let mut source = fixture(3);
    let WritProposal::VisualUpsert(diff) = &mut source.proposal else {
        unreachable!()
    };
    diff.after.visual.name = "Simulated gold gift-sub frame".into();
    diff.after.visual.input = Some(VisualInput {
        source: ContributionSource::Gift,
        unit: VisualInputUnit::Count,
    });
    let expected = diff.after.visual.clone();
    let mut curve_source = fixture(4);
    let WritProposal::CurveSet(curve_diff) = &mut curve_source.proposal else {
        unreachable!()
    };
    curve_diff.after.curve.ranges = vec![
        IntensityRange {
            total: 0,
            intensity: 0.0.try_into().unwrap(),
        },
        IntensityRange {
            total: 1,
            intensity: 0.2.try_into().unwrap(),
        },
        IntensityRange {
            total: 5,
            intensity: 1.0.try_into().unwrap(),
        },
    ];
    let expected_curve = curve_diff.after.curve.clone();
    let h = Harness::new(&[
        source.clone(),
        source.clone(),
        curve_source.clone(),
        curve_source.clone(),
    ])
    .await;
    let prompt = "A gold frame that glows harder with each gift sub";
    h.lifecycle(&source, prompt).await;
    let visuals: VisualListResult = h.read(RpcRequest::VisualList(Empty {})).await;
    assert_eq!(visuals.visuals, vec![expected.clone()]);
    h.lifecycle(&curve_source, prompt).await;
    let visuals: VisualListResult = h.read(RpcRequest::VisualList(Empty {})).await;
    assert_eq!(
        visuals.visuals,
        vec![Visual {
            curve: expected_curve,
            ..expected
        }]
    );
}

#[tokio::test]
async fn blocked_lots_writ_preserves_policy_reason_and_changes_no_chamber() {
    let mut source = fixture(0);
    let WritProposal::DrawUpsert(diff) = &mut source.proposal else {
        unreachable!()
    };
    diff.after.draw.policy.content = DrawContent::Prize;
    diff.after.draw.policy.paid_entry = true;
    let policy = diff.after.draw.policy.clone();
    let h = Harness::new(&[source]).await;
    let check: DrawCheckResult = h
        .read(RpcRequest::DrawCheck(DrawCheckParams { policy }))
        .await;
    assert_eq!(check.result, CheckResult::Blocked);
    assert!(!check.reasons.is_empty());
    let before = h.configuration().await;
    let writ = h.ask(WritChamber::Lots, "Simulated paid prize draw").await;
    assert_eq!(writ.status, WritStatus::Proposed);
    assert_eq!(before, h.configuration().await);
    let error = h.seal(&writ.writ_id).await.unwrap_err();
    assert_eq!(error.code, ErrorCode::BlockedByPolicy);
    assert_eq!(error.message, check.reasons.join(", "));
    assert_eq!(before, h.configuration().await);
}

#[tokio::test]
async fn arm_links_is_refused_with_authoritative_reason_and_never_arms() {
    let mut source = fixture(1);
    let WritProposal::RulesUpsert(diff) = &mut source.proposal else {
        unreachable!()
    };
    let original = diff.after.clone();
    diff.after.rule.mode = RuleMode::Armed;
    let armed = diff.after.clone();
    let h = Harness::new(&[source]).await;
    h.registry
        .dispatch(&RpcRequest::RulesUpsert(original))
        .await
        .unwrap();
    let before = h.configuration().await;
    let direct = h
        .registry
        .dispatch(&RpcRequest::RulesUpsert(armed))
        .await
        .unwrap_err();
    assert_eq!(direct.code, ErrorCode::BlockedByPolicy);
    assert_eq!(direct.message, "offline registration cannot arm rules");
    assert_eq!(before, h.configuration().await);
    let writ = h.ask(WritChamber::Gatehouse, "Arm the links rule").await;
    assert_eq!(writ.status, WritStatus::Proposed);
    assert_eq!(before, h.configuration().await);
    let error = h.seal(&writ.writ_id).await.unwrap_err();
    assert_eq!(error, direct);
    assert_eq!(before, h.configuration().await);
    let rules: RulesListResult = h.read(RpcRequest::RulesList(Empty {})).await;
    assert_eq!(
        rules
            .rules
            .iter()
            .find(|rule| rule.rule_id.as_str() == "simulated-links")
            .unwrap()
            .mode,
        RuleMode::Shadow
    );
}
