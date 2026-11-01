//! Generated fixtures model both provenance flags; no captured chat is used.
use super::*;
use crate::{GatePath, IngestedMessage, ScreenedMessage};
use cc_types::{Decision, DecisionId, DecisionKind, Operator, Verdict};

fn at(seconds: i64) -> Timestamp {
    (chrono::DateTime::parse_from_rfc3339("2026-10-25T12:00:00Z").unwrap()
        + TimeDelta::seconds(seconds))
    .with_timezone(&chrono::Utc)
    .to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
    .try_into()
    .unwrap()
}

fn chart(capacity: usize) -> Herald {
    Herald::new(
        Vec::new(),
        BTreeMap::new(),
        Box::new(HashedWords),
        900.try_into().unwrap(),
        capacity,
        at(0),
    )
    .unwrap()
}

fn passed(simulated: bool, seconds: i64) -> PassedMessage {
    let message = IngestedMessage {
        message_id: format!("simulated-{seconds}").try_into().unwrap(),
        user_id: cc_store::TwitchUserId::parse("1").unwrap(),
        login: "simulated_1".into(),
        text: "simulated ballot".into(),
        at: at(seconds),
        simulated,
        metadata: None,
    };
    let screened = ScreenedMessage {
        decision: Decision {
            decision_id: DecisionId::mint(),
            message_id: message.message_id.clone(),
            kind: DecisionKind::Released,
            verdict: Verdict::Pass,
            rule_id: None,
            operator: Operator::Ai,
            at: message.at.clone(),
            simulated,
            reason_codes: vec!["simulated-fixture".into()],
            message_text: None,
        },
        message,
        intent: None,
        path: GatePath::FoundNothing,
        reaches_streamer: false,
    };
    let passed = screened.for_consensus().unwrap();
    assert_eq!(passed.simulated, simulated);
    passed
}

fn params(filter: ConsensusFilter) -> ConsensusGetParams {
    ConsensusGetParams {
        window_s: 60.try_into().unwrap(),
        filter,
    }
}

#[test]
fn provenance_follows_passed_messages_and_the_counted_window() {
    let mut herald = chart(10);
    let params = params(ConsensusFilter::All {});
    assert!(!herald.simulated_in_window(&params, &at(0)).unwrap());
    herald.ingest(passed(false, 0)).unwrap();
    assert!(!herald.simulated_in_window(&params, &at(0)).unwrap());
    herald.ingest(passed(true, 1)).unwrap();
    herald.ingest(passed(false, 2)).unwrap();
    assert!(!herald.simulated_in_window(&params, &at(0)).unwrap());
    for (second, simulated, messages) in [(1, true, 2), (60, true, 2), (61, false, 1)] {
        assert_eq!(
            herald.simulated_in_window(&params, &at(second)).unwrap(),
            simulated
        );
        let counts = herald.counts(
            date(&at(second)).unwrap(),
            TimeDelta::seconds(60),
            &params.filter,
        );
        assert_eq!(counts.iter().sum::<u32>(), messages);
    }
}

#[test]
fn simulated_messages_outside_the_filter_or_shed_do_not_mark_counted_ballots() {
    let mut herald = chart(1);
    herald.ingest(passed(false, 0)).unwrap();
    herald.ingest(passed(true, 1)).unwrap();
    let all = params(ConsensusFilter::All {});
    let result = herald.get(all.clone(), at(2)).unwrap();
    assert_eq!(result.shed_count, 1);
    assert!(!herald.simulated_in_window(&all, &result.at).unwrap());

    let mut herald = chart(1);
    herald.ingest(passed(true, 0)).unwrap();
    assert!(herald.simulated_in_window(&all, &at(0)).unwrap());
    assert!(
        !herald
            .simulated_in_window(&params(ConsensusFilter::Emotes {}), &at(0))
            .unwrap()
    );
}
