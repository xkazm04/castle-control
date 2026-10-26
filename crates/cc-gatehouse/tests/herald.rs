mod common;
mod offline_common;
use cc_gatehouse::herald::{DirectionSeed, HashedWords, Herald};
use cc_types::{ConsensusFilter, ConsensusGetParams, Verdict};
use offline_common::*;
use std::collections::BTreeMap;

fn chart(capacity: usize) -> Herald {
    Herald::new(
        vec![
            DirectionSeed {
                key: text("joy"),
                label: text("Joy"),
                keywords: vec!["happy".into(), "great".into()],
            },
            DirectionSeed {
                key: text("worry"),
                label: text("Worry"),
                keywords: vec!["worried".into(), "scared".into()],
            },
        ],
        BTreeMap::from([
            ("simHappy".into(), "happy".into()),
            ("simScared".into(), "worried".into()),
        ]),
        Box::new(HashedWords),
        900.try_into().unwrap(),
        capacity,
        at(0),
    )
    .unwrap()
}
fn feed(chart: &mut Herald, id: usize, second: i64, text: &str) {
    chart
        .ingest(
            screened(recorded(id, second, text), Verdict::Pass)
                .for_consensus()
                .unwrap(),
        )
        .unwrap();
}
fn get(
    chart: &mut Herald,
    second: i64,
    window: u32,
    filter: ConsensusFilter,
) -> cc_types::ConsensusGetResult {
    chart
        .get(
            ConsensusGetParams {
                window_s: window.try_into().unwrap(),
                filter,
            },
            at(second),
        )
        .unwrap()
}

#[test]
fn barred_and_held_messages_have_no_chart_intake_token() {
    for verdict in [Verdict::Bar, Verdict::Hold] {
        assert!(
            screened(recorded(1, 0, "simulated happy"), verdict)
                .for_consensus()
                .is_none()
        );
    }
    let mut h = chart(10);
    assert!(
        get(&mut h, 0, 60, ConsensusFilter::All {})
            .directions
            .is_empty()
    );
    let mut mismatched = screened(recorded(2, 0, "simulated happy"), Verdict::Pass);
    mismatched.decision.message_id = "simulated-other".to_owned().try_into().unwrap();
    assert!(mismatched.for_consensus().is_none());
}

#[test]
fn filters_count_messages_once_and_separate_text_from_emote_meaning() {
    let mut h = chart(10);
    feed(&mut h, 1, 1, "happy simScared simScared");
    feed(&mut h, 2, 2, "simHappy");
    feed(&mut h, 3, 3, "happy");
    for (filter, total) in [
        (ConsensusFilter::All {}, 3),
        (ConsensusFilter::Text {}, 2),
        (ConsensusFilter::Emotes {}, 2),
        (
            ConsensusFilter::Emote {
                emote: text("simScared"),
            },
            1,
        ),
    ] {
        let result = get(&mut h, 3, 60, filter);
        assert_eq!(
            result.directions.iter().map(|d| d.messages).sum::<u32>(),
            total
        );
        assert!(
            (result
                .directions
                .iter()
                .map(|d| f64::from(d.share.clone()))
                .sum::<f64>()
                - 1.0)
                .abs()
                < 1e-12
        );
    }
    let text_only = get(&mut h, 3, 60, ConsensusFilter::Text {});
    assert_eq!(String::from(text_only.directions[0].key.clone()), "joy");
    let scared = get(
        &mut h,
        3,
        60,
        ConsensusFilter::Emote {
            emote: text("simScared"),
        },
    );
    assert_eq!(String::from(scared.directions[0].key.clone()), "worry");
}

#[test]
fn window_is_left_open_right_closed_and_expiry_appears_in_series() {
    let mut h = chart(10);
    feed(&mut h, 1, 0, "happy");
    feed(&mut h, 2, 59, "worried");
    let result = get(&mut h, 60, 60, ConsensusFilter::All {});
    let joy = result
        .directions
        .iter()
        .find(|d| String::from(d.key.clone()) == "joy")
        .unwrap();
    assert_eq!(joy.messages, 0);
    assert_eq!(f64::from(joy.series.last().unwrap().share.clone()), 0.0);
    assert_eq!(joy.delta_3m, None);
    let empty = get(&mut h, 120, 60, ConsensusFilter::All {});
    assert_eq!(empty.directions.iter().map(|d| d.messages).sum::<u32>(), 0);
}

#[test]
fn delta_is_fraction_difference_with_complete_baseline_history() {
    let mut h = chart(10);
    feed(&mut h, 1, 59, "happy");
    feed(&mut h, 2, 239, "worried");
    let result = get(&mut h, 240, 60, ConsensusFilter::All {});
    let joy = result
        .directions
        .iter()
        .find(|d| String::from(d.key.clone()) == "joy")
        .unwrap();
    let worry = result
        .directions
        .iter()
        .find(|d| String::from(d.key.clone()) == "worry")
        .unwrap();
    assert_eq!(joy.delta_3m.clone().map(f64::from), Some(-1.0));
    assert_eq!(worry.delta_3m.clone().map(f64::from), Some(1.0));
}

#[test]
fn shedding_reports_matching_window_even_with_no_directions() {
    let mut h = chart(0);
    feed(&mut h, 1, 0, "happy");
    feed(&mut h, 2, 1, "simHappy simHappy");
    feed(&mut h, 3, 2, "worried simScared");
    for (filter, count) in [
        (ConsensusFilter::All {}, 2),
        (ConsensusFilter::Emotes {}, 2),
        (ConsensusFilter::Text {}, 1),
        (
            ConsensusFilter::Emote {
                emote: text("simHappy"),
            },
            1,
        ),
    ] {
        let result = get(&mut h, 60, 60, filter);
        assert_eq!(result.shed_count, count);
        assert!(result.directions.is_empty());
    }
    assert_eq!(get(&mut h, 62, 60, ConsensusFilter::All {}).shed_count, 0);
}

#[test]
fn chart_series_is_stable_under_seeded_offline_replay() {
    let bank = cc_gatehouse::simulation::near_miss_bank();
    let recording = cc_gatehouse::simulation::generate("42", 250, at(0), &bank).unwrap();
    let mut a = chart(1000);
    let mut b = chart(1000);
    for (i, message) in recording.messages.iter().enumerate() {
        for h in [&mut a, &mut b] {
            let text = if i % 3 == 0 { "simHappy" } else { "worried" };
            let mut message = message.clone();
            message.text = text.into();
            h.ingest(screened(message, Verdict::Pass).for_consensus().unwrap())
                .unwrap();
        }
    }
    assert_eq!(
        get(&mut a, 250, 60, ConsensusFilter::All {}),
        get(&mut b, 250, 60, ConsensusFilter::All {})
    );
    assert!(
        get(&mut a, 251, 60, ConsensusFilter::All {})
            .directions
            .iter()
            .all(|d| d
                .series
                .windows(2)
                .all(|w| String::from(w[0].at.clone()) < String::from(w[1].at.clone())))
    );
}

#[test]
fn chart_module_has_no_action_or_live_service_surface() {
    for source in [
        include_str!("../src/herald.rs"),
        include_str!("../src/herald_features.rs"),
    ] {
        for forbidden in [
            "ActionIntent",
            "Gatehouse::",
            "Gatehouse,",
            "cc_engine",
            "append_ledger",
            "std::fs",
            "Action::",
            "lane::",
            "service::",
        ] {
            assert!(
                !source.contains(forbidden),
                "unexpected chart dependency: {forbidden}"
            );
        }
    }
}

#[tokio::test]
async fn real_gate_verdict_prevents_barred_chart_intake() {
    let mut f = common::Fixture::new();
    f.upsert(common::pattern("blocked", cc_types::Action::Delete));
    f.arm("blocked");
    let screened = f
        .gate
        .screen_batch(
            vec![
                common::message(1, 100, "simulated tagged happy"),
                common::message(2, 101, "simulated happy"),
            ],
            &common::Fake::new("[]"),
        )
        .await
        .unwrap();
    assert_eq!(screened[0].decision.verdict, Verdict::Bar);
    assert!(screened[0].for_consensus().is_none());
    let mut h = chart(10);
    for message in screened {
        if let Some(token) = message.for_consensus() {
            h.ingest(token).unwrap();
        }
    }
    assert_eq!(
        get(&mut h, 0, 60, ConsensusFilter::All {})
            .directions
            .iter()
            .map(|d| d.messages)
            .sum::<u32>(),
        1
    );
}

#[test]
fn subsecond_shedding_uses_exact_same_window_as_messages() {
    let mut h = chart(0);
    let mut message = recorded(1, 0, "simulated happy");
    message.at = "2026-10-25T12:00:00.500Z".to_owned().try_into().unwrap();
    h.ingest(screened(message, Verdict::Pass).for_consensus().unwrap())
        .unwrap();
    let params = ConsensusGetParams {
        window_s: 60.try_into().unwrap(),
        filter: ConsensusFilter::All {},
    };
    assert_eq!(
        h.get(
            params.clone(),
            "2026-10-25T12:01:00.250Z".to_owned().try_into().unwrap()
        )
        .unwrap()
        .shed_count,
        1
    );
    assert_eq!(
        h.get(
            params,
            "2026-10-25T12:01:00.500Z".to_owned().try_into().unwrap()
        )
        .unwrap()
        .shed_count,
        0
    );
}

#[test]
fn historical_series_keeps_the_context_of_its_earliest_window() {
    let mut h = chart(10);
    feed(&mut h, 1, 1, "happy");
    feed(&mut h, 2, 901, "worried");
    let result = get(&mut h, 1800, 900, ConsensusFilter::All {});
    let joy = result
        .directions
        .iter()
        .find(|d| String::from(d.key.clone()) == "joy")
        .unwrap();
    assert_eq!(joy.messages, 0);
    assert_eq!(
        String::from(joy.series[0].at.clone()),
        "2026-10-25T12:15:00.000000000Z"
    );
    assert_eq!(f64::from(joy.series[0].share.clone()), 1.0);
}

#[test]
fn emote_lexicon_handles_symbols_and_embedding_is_an_injected_local_trait() {
    struct Local;
    impl cc_gatehouse::herald::LocalEmbedding for Local {
        fn embed(&self, text: &str) -> Vec<f64> {
            vec![
                f64::from(u8::from(text.contains("delight") || text.contains("happy"))),
                0.0,
            ]
        }
    }
    let mut h = Herald::new(
        vec![DirectionSeed {
            key: text("joy"),
            label: text("Joy"),
            keywords: vec!["happy".into()],
        }],
        BTreeMap::from([("💜".into(), "delight".into())]),
        Box::new(Local),
        60.try_into().unwrap(),
        10,
        at(0),
    )
    .unwrap();
    feed(&mut h, 1, 1, "💜");
    let result = get(
        &mut h,
        1,
        60,
        ConsensusFilter::Emote {
            emote: text("💜")
        },
    );
    assert_eq!(String::from(result.directions[0].key.clone()), "joy");
    assert_eq!(result.directions[0].messages, 1);
}
