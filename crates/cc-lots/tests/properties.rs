mod common;

use cc_lots::{CohortCap, Intake, PassedMessage, Roll, WeightCurve};
use cc_types::Verdict;
use common::*;
use proptest::prelude::*;

proptest! {
    #![proptest_config(ProptestConfig { cases: 10_000, failure_persistence: None, ..ProptestConfig::default() })]

    #[test]
    fn cohort_cap_holds_in_10000_cases(
        winner_count in 1u16..32,
        denominator in 1u16..100,
        raw_numerator in 0u16..100,
        raw_members in 0u16..32,
    ) {
        let numerator = raw_numerator.min(denominator);
        let members = raw_members.min(winner_count);
        let mut config = rules();
        config.winner_count = winner_count;
        config.cohort_caps = vec![CohortCap::new("simulated-raiders".into(), numerator, denominator).unwrap()];
        let mut roll = Roll::new(config).unwrap();
        let mut winners = Vec::new();
        for n in 1..=winner_count {
            let mut facts = simulated_message(u64::from(n), 0);
            if n <= members { facts.cohorts.insert("simulated-raiders".into()); }
            winners.push(facts.user_id.clone());
            prop_assert_eq!(roll.intake(PassedMessage::from_verdict(facts, Verdict::Pass).unwrap()), Intake::Added);
        }
        let permitted = u64::from(members) * u64::from(denominator)
            <= u64::from(winner_count) * u64::from(numerator);
        prop_assert_eq!(roll.record_winners(&winners, at(1)).is_ok(), permitted);
        if permitted {
            prop_assert!(roll.weight_table(at(1)).rows.is_empty());
        } else {
            prop_assert_eq!(roll.weight_table(at(1)).rows.len(), usize::from(winner_count));
        }
    }

    #[test]
    fn cooldown_holds_in_10000_cases(cooldown_s in 0u32..100_000, offset_s in -2i64..100_002) {
        let mut config = rules();
        config.cooldown_s = cooldown_s;
        let mut roll = Roll::new(config).unwrap();
        roll.intake(PassedMessage::from_verdict(simulated_message(1, 0), Verdict::Pass).unwrap());
        roll.record_winners(&[user(1)], at(1)).unwrap();
        let eligible = offset_s >= i64::from(cooldown_s);
        prop_assert_eq!(roll.validate_winners(&[user(1)], at(1 + offset_s)).is_ok(), eligible);
        prop_assert_eq!(roll.lookup(&user(1), at(1 + offset_s)).is_some(), eligible);
        roll.clear_entries();
        let result = roll.intake(PassedMessage::from_verdict(simulated_message(1, 1 + offset_s), Verdict::Pass).unwrap());
        prop_assert_eq!(result, if eligible { Intake::Added } else { Intake::Cooldown });
    }

    #[test]
    fn non_equal_weight_curve_is_concave_in_10000_cases(cap in 1u16..=u16::MAX, units in 0u16..=u16::MAX - 2) {
        let curve = WeightCurve::concave(cap).unwrap();
        let first = curve.weight(units);
        let second = curve.weight(units + 1);
        let third = curve.weight(units + 2);
        prop_assert!(first > 0);
        prop_assert!(first <= second && second <= third);
        prop_assert!(second - first >= third - second);
        prop_assert_eq!(curve.weight(cap), curve.weight(u16::MAX));
    }
}

#[test]
fn weight_table_publishes_exact_newcomer_comparison() {
    let mut config = rules();
    config.weight_curve = WeightCurve::concave(10).unwrap();
    let mut roll = Roll::new(config).unwrap();
    assert_eq!(
        roll.weight_table(at(0)).newcomers_to_outweigh_heaviest,
        None
    );
    for (n, units) in [(1, 0), (2, 5), (3, u16::MAX)] {
        let mut facts = simulated_message(n, 0);
        facts.activity_units = units;
        roll.intake(PassedMessage::from_verdict(facts, Verdict::Pass).unwrap());
    }
    let table = roll.weight_table(at(0));
    assert_eq!(
        table.rows.iter().map(|r| r.weight).collect::<Vec<_>>(),
        vec![10, 50, 65]
    );
    let count = table.newcomers_to_outweigh_heaviest.unwrap();
    assert_eq!(count, 7);
    assert!(count * table.newcomer_weight > table.heaviest_weight);
    assert!((count - 1) * table.newcomer_weight <= table.heaviest_weight);
}
