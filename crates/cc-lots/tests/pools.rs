mod common;

use cc_lots::{CohortCap, Intake, PassedMessage, Pool, Roll, WeightCurve};
use cc_types::Verdict;
use common::*;

#[test]
fn barred_and_held_messages_never_create_a_lot() {
    let mut roll = Roll::new(rules()).unwrap();
    for verdict in [Verdict::Bar, Verdict::Hold] {
        let rejected = PassedMessage::from_verdict(simulated_message(1, 0), verdict);
        assert!(matches!(rejected, Err(cc_lots::Error::NotPassed)));
        if let Ok(message) = rejected {
            roll.intake(message);
        }
        assert!(roll.lookup(&user(1), at(0)).is_none());
        assert!(roll.weight_table(at(0)).rows.is_empty());
    }
    assert_eq!(
        roll.intake(PassedMessage::from_verdict(simulated_message(1, 0), Verdict::Pass).unwrap()),
        Intake::Added
    );
}

#[test]
fn each_pool_checks_its_post_verdict_membership() {
    for pool in [
        Pool::Chatters,
        Pool::Followers,
        Pool::Subscribers,
        Pool::Redeemers,
        Pool::Keyword("!idea".into()),
    ] {
        let mut config = rules();
        config.pool = pool.clone();
        let mut roll = Roll::new(config).unwrap();
        let mut facts = simulated_message(1, 0);
        let initial =
            roll.intake(PassedMessage::from_verdict(facts.clone(), Verdict::Pass).unwrap());
        assert_eq!(
            initial,
            if pool == Pool::Chatters {
                Intake::Added
            } else {
                Intake::Ineligible
            }
        );
        facts.user_id = user(2);
        match pool {
            Pool::Followers => facts.follower = true,
            Pool::Subscribers => facts.subscriber = true,
            Pool::Redeemers => facts.redeemed = true,
            Pool::Keyword(_) => facts.text = "simulated !IDEA message".into(),
            Pool::Chatters => {}
        }
        assert_eq!(
            roll.intake(PassedMessage::from_verdict(facts, Verdict::Pass).unwrap()),
            Intake::Added
        );
    }
}

#[test]
fn keywords_match_tokens_and_chat_claims_do_not_grant_membership() {
    let mut config = rules();
    config.pool = Pool::Keyword("!idea".into());
    let mut roll = Roll::new(config).unwrap();
    let mut facts = simulated_message(1, 0);
    facts.text = "simulated !ideation !idea-extra".into();
    assert_eq!(
        roll.intake(PassedMessage::from_verdict(facts.clone(), Verdict::Pass).unwrap()),
        Intake::Ineligible
    );
    let mut config = rules();
    config.pool = Pool::Subscribers;
    let mut subscribers = Roll::new(config).unwrap();
    facts.text = "simulated I am a subscriber".into();
    assert_eq!(
        subscribers.intake(PassedMessage::from_verdict(facts, Verdict::Pass).unwrap()),
        Intake::Ineligible
    );
}

#[test]
fn free_join_admits_non_subscribers_with_equal_odds() {
    let mut config = rules();
    config.pool = Pool::Subscribers;
    config.free_join_equal_odds = true;
    config.weight_curve = WeightCurve::concave(10).unwrap();
    let mut roll = Roll::new(config).unwrap();
    let mut newcomer = simulated_message(1, 0);
    newcomer.text = "!join".into();
    let mut subscriber = simulated_message(2, 0);
    subscriber.subscriber = true;
    subscriber.activity_units = u16::MAX;
    for facts in [newcomer, subscriber] {
        assert_eq!(
            roll.intake(PassedMessage::from_verdict(facts, Verdict::Pass).unwrap()),
            Intake::Added
        );
    }
    let table = roll.weight_table(at(0));
    assert_eq!(table.rows.len(), 2);
    assert!(table.rows.iter().all(|r| r.weight == 1));
    assert_eq!(table.newcomers_to_outweigh_heaviest, Some(2));
}

#[test]
fn one_user_has_one_entry_and_history_survives_clearing_the_pool() {
    let mut roll = Roll::new(rules()).unwrap();
    for expected in [Intake::Added, Intake::AlreadyEntered] {
        assert_eq!(
            roll.intake(
                PassedMessage::from_verdict(simulated_message(1, 0), Verdict::Pass).unwrap()
            ),
            expected
        );
    }
    roll.record_winners(&[user(1)], at(1)).unwrap();
    roll.clear_entries();
    assert_eq!(
        roll.intake(PassedMessage::from_verdict(simulated_message(1, 60), Verdict::Pass).unwrap()),
        Intake::Cooldown
    );
    assert_eq!(
        roll.intake(PassedMessage::from_verdict(simulated_message(1, 61), Verdict::Pass).unwrap()),
        Intake::Added
    );
    assert!(roll.validate_winners(&[user(1)], at(61)).is_ok());
}

#[test]
fn invalid_winner_sets_fail_atomically() {
    let mut config = rules();
    config.winner_count = 2;
    let mut roll = Roll::new(config).unwrap();
    for n in 1..=2 {
        roll.intake(PassedMessage::from_verdict(simulated_message(n, 0), Verdict::Pass).unwrap());
    }
    for winners in [
        vec![user(1)],
        vec![user(1), user(1)],
        vec![user(1), user(3)],
    ] {
        assert!(roll.record_winners(&winners, at(1)).is_err());
        assert_eq!(roll.weight_table(at(1)).rows.len(), 2);
    }
    assert!(roll.validate_winners(&[user(1), user(2)], at(-1)).is_err());
    roll.record_winners(&[user(1), user(2)], at(1)).unwrap();
    assert!(roll.weight_table(at(1)).rows.is_empty());
}

#[test]
fn overlapping_cohort_caps_all_apply_and_round_down() {
    let mut config = rules();
    config.winner_count = 3;
    config.cohort_caps = vec![
        CohortCap::new("raiders".into(), 1, 3).unwrap(),
        CohortCap::new("new".into(), 0, 1).unwrap(),
    ];
    let mut roll = Roll::new(config).unwrap();
    for n in 1..=4 {
        let mut facts = simulated_message(n, 0);
        if n == 1 {
            facts.cohorts = ["raiders".into(), "new".into()].into();
        }
        roll.intake(PassedMessage::from_verdict(facts, Verdict::Pass).unwrap());
    }
    assert!(
        roll.validate_winners(&[user(1), user(2), user(3)], at(1))
            .is_err()
    );
    assert!(
        roll.validate_winners(&[user(2), user(3), user(4)], at(1))
            .is_ok()
    );
    assert_eq!(CohortCap::new("raiders".into(), 1, 3).unwrap().limit(2), 0);
}

#[test]
fn invalid_configuration_is_rejected() {
    let mut config = rules();
    config.winner_count = 0;
    assert!(Roll::new(config).is_err());
    for keyword in ["", "two words", "\n"] {
        let mut config = rules();
        config.pool = Pool::Keyword(keyword.into());
        assert!(Roll::new(config).is_err());
    }
    assert!(CohortCap::new("".into(), 1, 3).is_err());
    assert!(CohortCap::new("simulated".into(), 1, 0).is_err());
    assert!(CohortCap::new("simulated".into(), 4, 3).is_err());
    assert!(WeightCurve::concave(0).is_err());
    let mut config = rules();
    config.cohort_caps = vec![CohortCap::new("simulated".into(), 1, 3).unwrap(); 2];
    assert!(Roll::new(config).is_err());
}
