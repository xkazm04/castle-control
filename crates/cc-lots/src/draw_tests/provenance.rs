//! Generated fixtures model both provenance flags; no captured chat is used.
use super::*;

#[test]
fn passed_facts_keep_provenance_on_entries_and_mixed_rolls() {
    let mut roll = Roll::new(rules()).unwrap();
    assert!(!roll.simulated(at(0)));
    let mut real = message(1, 0);
    real.simulated = false;
    add(&mut roll, real);
    assert!(!roll.lookup(&user(1), at(0)).unwrap().simulated);
    assert!(!roll.simulated(at(0)));
    add(&mut roll, message(2, 1));
    assert!(roll.lookup(&user(2), at(1)).unwrap().simulated);
    assert!(!roll.simulated(at(0))); // A future entry is not frozen yet.
    assert!(roll.simulated(at(1)));
    roll.record_winners(&[user(2)], at(1)).unwrap();
    assert!(!roll.simulated(at(2))); // A cooled-down entry is ineligible.
    assert!(roll.simulated(at(61)));
    roll.clear_entries();
    assert!(!roll.simulated(at(61)));
}

#[test]
fn duplicate_and_ineligible_simulated_messages_do_not_change_a_real_roll() {
    let mut config = rules();
    config.pool = Pool::Keyword("!join".into());
    let mut roll = Roll::new(config).unwrap();
    let mut real = message(1, 0);
    real.text = "simulated !join".into();
    real.simulated = false;
    add(&mut roll, real.clone());
    real.simulated = true;
    assert_eq!(
        roll.intake(PassedMessage::from_verdict(real, Verdict::Pass).unwrap()),
        Intake::AlreadyEntered
    );
    assert_eq!(
        roll.intake(PassedMessage::from_verdict(message(2, 1), Verdict::Pass).unwrap()),
        Intake::Ineligible
    );
    assert!(!roll.simulated(at(2)));
    assert!(!roll.lookup(&user(1), at(2)).unwrap().simulated);
}
