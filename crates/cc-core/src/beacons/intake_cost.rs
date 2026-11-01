//! Instrument: per-contribution intake cost against retained history. All rows
//! are generated and simulated; nothing here touches Twitch or real chat.
use super::{BeaconsModule, live};
use crate::ingress::ContributionIngress;
use cc_types::ContributionSource;
use std::time::Instant;

fn row(key: usize) -> ContributionIngress {
    ContributionIngress {
        contribution: cc_types::Contribution {
            source: ContributionSource::Gift,
            broadcaster_id: "111".to_owned().try_into().unwrap(),
            event_id: format!("simulated-{key}").try_into().unwrap(),
            user_id: None,
            amount: 1,
            dedupe_key: format!("simulated-{key}"),
        },
        broadcaster_login: "simulated_channel".into(),
        user_login: None,
        at: cc_types::Timestamp::now().into(),
    }
}

#[test]
fn intake_deserializations_for_the_next_row_after_history_is_measured() {
    const HISTORY: usize = 1000;
    let root = tempfile::tempdir().unwrap();
    let module = BeaconsModule::open(root.path()).unwrap();
    for key in 0..HISTORY {
        assert!(module.intake(row(key)).unwrap());
    }
    live::reset_reads();
    let started = Instant::now();
    assert!(module.intake(row(HISTORY)).unwrap());
    let elapsed = started.elapsed();
    let reads = live::reads();
    eprintln!(
        "intake_cost: rows={HISTORY} deserializations_for_next_intake={reads} elapsed={elapsed:?}"
    );
    assert_eq!(module.contributions().unwrap().len(), HISTORY + 1);
}
