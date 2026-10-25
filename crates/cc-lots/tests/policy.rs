mod common;

use cc_lots::{DrawPolicy, GuardedDraw, PolicyReason, check_draw};
use cc_store::{DrawRiskSetting, LedgerEvent, LedgerKind, Store};
use cc_types::{CheckResult, DrawContent};
use common::*;

#[test]
fn paid_entry_and_paid_weight_on_prizes_are_blocked_with_reasons() {
    for (entry, weight, reason) in [
        (true, false, PolicyReason::PaidEntry),
        (false, true, PolicyReason::PaidWeight),
    ] {
        let mut policy = prize();
        policy.paid_entry = entry;
        policy.paid_weight = weight;
        let check = check_draw(&policy);
        assert_eq!(check.result, CheckResult::Blocked);
        assert_eq!(check.reasons, vec![reason]);
    }
}

#[test]
fn over_5000_usd_requires_registration_and_boundary_is_exact() {
    let mut policy = prize();
    policy.prize_value_usd_cents = 500_000;
    assert_eq!(check_draw(&policy).result, CheckResult::Ok);
    for cents in [500_001, u64::MAX] {
        policy.prize_value_usd_cents = cents;
        assert_eq!(
            check_draw(&policy).reasons,
            vec![PolicyReason::PrizeValueOverCap]
        );
        assert_eq!(check_draw(&policy).result, CheckResult::Blocked);
    }
    policy.registration_confirmed = true;
    assert_eq!(check_draw(&policy).result, CheckResult::Ok);
}

#[test]
fn subscriber_only_and_points_without_free_path_warn() {
    let mut policy = prize();
    policy.subscriber_only = true;
    assert_eq!(check_draw(&policy).result, CheckResult::Warn);
    assert_eq!(
        check_draw(&policy).reasons,
        vec![PolicyReason::SubscriberOnly]
    );
    policy.subscriber_only = false;
    policy.channel_points = true;
    policy.free_entry_equal_odds = false;
    assert_eq!(check_draw(&policy).result, CheckResult::Warn);
    assert_eq!(
        check_draw(&policy).reasons,
        vec![PolicyReason::PointsWithoutFreePath]
    );
    policy.free_entry_equal_odds = true;
    assert_eq!(check_draw(&policy).result, CheckResult::Ok);
}

#[test]
fn missing_age_and_region_warn_and_all_reasons_accumulate() {
    let mut policy = DrawPolicy {
        content: DrawContent::Prize,
        ..Default::default()
    };
    assert_eq!(check_draw(&policy).result, CheckResult::Warn);
    assert_eq!(
        check_draw(&policy).reasons,
        vec![PolicyReason::MissingAge, PolicyReason::MissingRegion]
    );
    policy.paid_entry = true;
    policy.paid_weight = true;
    policy.prize_value_usd_cents = 500_001;
    assert_eq!(check_draw(&policy).result, CheckResult::Blocked);
    assert_eq!(check_draw(&policy).reasons.len(), 5);
}

#[test]
fn no_prize_content_has_no_giveaway_friction() {
    for content in [DrawContent::Question, DrawContent::Idea, DrawContent::Seat] {
        let policy = DrawPolicy {
            content,
            paid_entry: true,
            paid_weight: true,
            subscriber_only: true,
            channel_points: true,
            free_entry_equal_odds: false,
            prize_value_usd_cents: u64::MAX,
            official_rules: false,
            twitch_disclaimer: false,
            ..Default::default()
        };
        assert_eq!(check_draw(&policy).result, CheckResult::Ok);
        assert!(check_draw(&policy).reasons.is_empty());
    }
}

#[test]
fn free_equal_odds_prize_with_rules_and_disclaimer_is_ok() {
    assert_eq!(check_draw(&prize()).result, CheckResult::Ok);
    let mut policy = prize();
    policy.official_rules = false;
    policy.twitch_disclaimer = false;
    assert_eq!(check_draw(&policy).result, CheckResult::Blocked);
    assert_eq!(
        check_draw(&policy).reasons,
        vec![PolicyReason::MissingRules, PolicyReason::MissingDisclaimer]
    );
}

#[test]
fn unlock_appends_exactly_one_typed_acknowledgement_before_effect() {
    let dir = SimulatedDir::new();
    let mut store = Store::open(&dir.0).unwrap();
    for setting in [
        DrawRiskSetting::PaidEntry,
        DrawRiskSetting::PaidWeight,
        DrawRiskSetting::PrizeValueOverCap,
    ] {
        let mut policy = prize();
        match setting {
            DrawRiskSetting::PaidEntry => policy.paid_entry = true,
            DrawRiskSetting::PaidWeight => policy.paid_weight = true,
            DrawRiskSetting::PrizeValueOverCap => policy.prize_value_usd_cents = 500_001,
        }
        let mut draw = GuardedDraw::new(draw_id(), policy);
        assert_eq!(draw.check().result, CheckResult::Blocked);
        let before = store.read_ledger(LedgerKind::Draws).unwrap().len();
        for expected in [true, false] {
            let changed = if setting == DrawRiskSetting::PrizeValueOverCap {
                draw.confirm_registration(&mut store, timestamp(1), timestamp(2))
            } else {
                draw.unlock(setting, &mut store, timestamp(1), timestamp(2))
            }
            .unwrap();
            assert_eq!(changed, expected);
            assert_eq!(draw.check().result, CheckResult::Ok);
            let lines = store.read_ledger(LedgerKind::Draws).unwrap();
            assert_eq!(lines.len(), before + 1);
            let line = lines.last().unwrap();
            assert_eq!(line.event_at, timestamp(1));
            assert_eq!(line.recorded_at, timestamp(2));
            match &line.event {
                LedgerEvent::DrawRiskAcknowledged {
                    draw_id,
                    setting: actual,
                } => {
                    assert_eq!(draw_id.as_str(), "simulated-draw");
                    assert_eq!(*actual, setting);
                }
                other => panic!("expected acknowledgement, got {other:?}"),
            }
        }
    }
    assert_eq!(store.read_ledger(LedgerKind::Decisions).unwrap().len(), 0);
    assert_eq!(store.read_ledger(LedgerKind::Engine).unwrap().len(), 0);
    drop(store);
    let reopened = Store::open(&dir.0).unwrap();
    assert_eq!(reopened.read_ledger(LedgerKind::Draws).unwrap().len(), 3);
}

#[test]
fn unlock_fails_without_changing_policy_when_ledger_append_fails() {
    for setting in [
        DrawRiskSetting::PaidEntry,
        DrawRiskSetting::PaidWeight,
        DrawRiskSetting::PrizeValueOverCap,
    ] {
        let dir = SimulatedDir::new();
        let mut store = Store::open(&dir.0).unwrap();
        let mut policy = prize();
        policy.paid_entry = setting == DrawRiskSetting::PaidEntry;
        policy.paid_weight = setting == DrawRiskSetting::PaidWeight;
        if setting == DrawRiskSetting::PrizeValueOverCap {
            policy.prize_value_usd_cents = 500_001;
        }
        let mut draw = GuardedDraw::new(draw_id(), policy);
        let before = draw.check();
        // append_ledger opens this existing file; a missing file is a real I/O failure.
        std::fs::remove_file(dir.0.join("draws.jsonl")).unwrap();
        let result = if setting == DrawRiskSetting::PrizeValueOverCap {
            draw.confirm_registration(&mut store, timestamp(1), timestamp(2))
        } else {
            draw.unlock(setting, &mut store, timestamp(1), timestamp(2))
        };
        assert!(matches!(result, Err(cc_lots::Error::Store(_))));
        assert_eq!(draw.check(), before);
        // Repair only the test's removed empty file and retry: failure did not
        // mark the setting acknowledged, and the next successful call logs once.
        std::fs::write(dir.0.join("draws.jsonl"), []).unwrap();
        let changed = if setting == DrawRiskSetting::PrizeValueOverCap {
            draw.confirm_registration(&mut store, timestamp(1), timestamp(2))
        } else {
            draw.unlock(setting, &mut store, timestamp(1), timestamp(2))
        }
        .unwrap();
        assert!(changed);
        assert_eq!(draw.check().result, CheckResult::Ok);
        assert_eq!(store.read_ledger(LedgerKind::Draws).unwrap().len(), 1);
    }
}

#[test]
fn unrelated_unlock_is_refused_and_configuration_changes_reset_consent() {
    let dir = SimulatedDir::new();
    let mut store = Store::open(&dir.0).unwrap();
    let mut policy = prize();
    policy.paid_entry = true;
    policy.paid_weight = true;
    let mut draw = GuardedDraw::new(draw_id(), policy.clone());
    draw.unlock(
        DrawRiskSetting::PaidEntry,
        &mut store,
        timestamp(1),
        timestamp(2),
    )
    .unwrap();
    assert_eq!(draw.check().reasons, vec![PolicyReason::PaidWeight]);
    assert_eq!(
        GuardedDraw::new(draw_id(), policy).check().result,
        CheckResult::Blocked
    );
    assert!(
        draw.unlock(
            DrawRiskSetting::PrizeValueOverCap,
            &mut store,
            timestamp(1),
            timestamp(2)
        )
        .is_err()
    );
    assert!(
        draw.confirm_registration(&mut store, timestamp(1), timestamp(2))
            .is_err()
    );
    assert_eq!(store.read_ledger(LedgerKind::Draws).unwrap().len(), 1);
}
