use super::*;
use proptest::{collection::vec, prelude::*, test_runner::TestRunner};
use std::cell::RefCell;

#[test]
fn winners_match_independent_writ_verification_across_1000_generated_rolls_without_store() {
    let mut runner = TestRunner::new(ProptestConfig {
        cases: 1_000,
        failure_persistence: None,
        ..ProptestConfig::default()
    });
    let strategy = (
        vec(any::<u16>(), 1..64),
        any::<u16>(),
        any::<[u8; 32]>(),
        1u16..=u16::MAX,
        any::<bool>(),
    );
    runner
        .run(&strategy, |(units, raw_count, seed, cap, free_equal)| {
            let roll = generated_roll(units, raw_count, cap, free_equal);
            let sealed = SealedRoll::streamer(
                crate::draw::proof_entries(&roll, at(1)).unwrap(),
                u32::from(roll.winner_count()),
                at(1).to_rfc3339_opts(chrono::SecondsFormat::Secs, true),
                1,
                SealedRoll::commitment(&seed),
            )
            .unwrap();
            let writ = sealed.finish_streamer(seed).unwrap();
            let (verified, winners) =
                crate::draw::verified_winners(&roll, &writ, None, at(2)).unwrap();
            let independent = verify_writ_json(&writ.to_json().unwrap(), None).unwrap();
            let ids: Vec<_> = winners.iter().map(TwitchUserId::as_str).collect();
            prop_assert_eq!(ids, independent.winners());
            prop_assert_eq!(verified.winners(), independent.winners());
            prop_assert_eq!(verified.seal(), sealed.seal());
            prop_assert_eq!(independent.seal(), sealed.seal());
            prop_assert_eq!(verified.label(), "streamer-controlled");
            Ok(())
        })
        .unwrap();
}

#[test]
fn winners_match_independent_writ_verification_across_32_generated_rolls_with_store() {
    let dir = SimulatedDir::new();
    let store = RefCell::new(Store::open(&dir.0).unwrap());
    let mut runner = TestRunner::new(ProptestConfig {
        cases: 32,
        failure_persistence: None,
        ..ProptestConfig::default()
    });
    let strategy = (
        vec(any::<u16>(), 1..64),
        any::<u16>(),
        any::<[u8; 32]>(),
        1u16..=u16::MAX,
        any::<bool>(),
    );
    runner
        .run(&strategy, |(units, raw_count, seed, cap, free_equal)| {
            let roll = generated_roll(units, raw_count, cap, free_equal);
            let sealed = seal(roll, seed, &mut store.borrow_mut());
            let seal_hash = sealed.seal().to_owned();
            let result =
                cast_streamer(sealed, seed, at(2), &mut store.borrow_mut(), timestamp(2)).unwrap();
            let verified = verify_writ_json(&result.writ().to_json().unwrap(), None).unwrap();
            let ids: Vec<_> = result.winners().iter().map(TwitchUserId::as_str).collect();
            prop_assert_eq!(ids, verified.winners());
            prop_assert_eq!(result.verified().winners(), verified.winners());
            prop_assert_eq!(verified.seal(), seal_hash);
            prop_assert_eq!(verified.label(), "streamer-controlled");
            Ok(())
        })
        .unwrap();
    assert_eq!(
        store.borrow().read_ledger(LedgerKind::Draws).unwrap().len(),
        64
    );
}

fn generated_roll(units: Vec<u16>, raw_count: u16, cap: u16, free_equal: bool) -> Roll {
    let mut config = rules();
    config.winner_count = 1 + raw_count % units.len() as u16;
    config.weight_curve = WeightCurve::concave(cap).unwrap();
    config.free_join_equal_odds = free_equal;
    let mut roll = Roll::new(config).unwrap();
    for (i, activity_units) in units.into_iter().enumerate().rev() {
        let mut facts = message(i as u64 + 1, 0);
        facts.activity_units = activity_units;
        add(&mut roll, facts);
    }
    roll
}
