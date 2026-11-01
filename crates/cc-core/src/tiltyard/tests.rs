//! Generated SIMULATED parity fixtures; no real viewers or network.
mod handlers;
mod ledger;
mod sample;
use super::*;
use serde_json::{Value, json};

fn fixture() -> Value {
    serde_json::from_str(include_str!(
        "../../../cc-types/tests/fixtures/tiltyard.json"
    ))
    .unwrap()
}
fn normalized(s: &TiltyardSession) -> Value {
    let mut value = serde_json::to_value(s).unwrap();
    value.as_object_mut().unwrap().retain(|key, _| {
        [
            "phase",
            "bracket",
            "history",
            "elapsed_ms",
            "match_key",
            "speed",
            "calls",
            "verdict",
            "remaining_ms",
        ]
        .contains(&key.as_str())
    });
    value
}
#[test]
fn shared_transition_replays_match_the_typescript_reducer() {
    let fixture: Value = serde_json::from_str(include_str!(
        "../../../cc-types/tests/fixtures/tiltyard-transitions.json"
    ))
    .unwrap();
    assert_eq!(fixture["simulated"], true);
    for case in fixture["cases"].as_array().unwrap() {
        let TiltyardAction::Start {
            list,
            key,
            window_ms,
        } = serde_json::from_value(case["start"].clone()).unwrap()
        else {
            panic!("start");
        };
        let mut s = engine::start(list, key, window_ms).unwrap();
        assert_eq!(normalized(&s), case["expected_start"], "{}", case["name"]);
        for (index, entry) in case["steps"].as_array().unwrap().iter().enumerate() {
            if s.phase == TiltyardSessionPhase::Live {
                s.counted = serde_json::from_value(entry["counted"].clone()).unwrap();
            }
            engine::step(
                &mut s,
                &serde_json::from_value(entry["action"].clone()).unwrap(),
            )
            .unwrap();
            assert_eq!(
                normalized(&s),
                entry["expected"],
                "{} step {index}",
                case["name"]
            );
        }
    }
}
#[test]
fn d5a_shared_contract_fixtures_cross_the_same_doors() {
    let f = fixture();
    for action in f["actions"].as_array().unwrap() {
        serde_json::from_value::<TiltyardAction>(action.clone()).unwrap();
    }
    for stage in f["stages"].as_array().unwrap() {
        let stage: TiltyardStageResult = serde_json::from_value(stage.clone()).unwrap();
        if let Some(s) = stage.session {
            validate::session(&s).unwrap();
        }
    }
    for snapshot in f["snapshots"].as_array().unwrap() {
        serde_json::from_value::<TiltyardRenderSnapshot>(snapshot.clone()).unwrap();
    }
    for entry in f["invalid"].as_array().unwrap() {
        let value = entry["value"].clone();
        let valid = match entry["door"].as_str().unwrap() {
            "params" => serde_json::from_value::<TiltyardTurnParams>(value).is_ok(),
            "result" => serde_json::from_value::<TiltyardStageResult>(value).is_ok(),
            "snapshot" => serde_json::from_value::<TiltyardRenderSnapshot>(value).is_ok(),
            other => panic!("unknown fixture door {other}"),
        };
        assert!(!valid, "invalid fixture accepted: {}", entry["door"]);
    }
}
#[test]
fn ballot_tokens_match_ecmascript_whitespace_cheer_and_boundaries() {
    for text in [
        "1",
        " 1! SIMULATED ",
        "1!!",
        "cHeEr123 1! SIMULATED",
        "\u{feff}Cheer99\t1\u{a0}SIMULATED",
    ] {
        assert_eq!(
            ballots::ballot_option(text),
            Some(TiltyardWinner::Left),
            "{text}"
        );
    }
    assert_eq!(
        ballots::ballot_option("2! SIMULATED"),
        Some(TiltyardWinner::Right)
    );
    for text in [
        "SIMULATED 1",
        "12",
        "1word",
        "Cheer1 Cheer2 1",
        "Cheer 1",
        "Cheer1",
        "1?",
        "1\u{85}",
    ] {
        assert_eq!(ballots::ballot_option(text), None, "{text}");
    }
}
fn item(
    id: u32,
    user: u32,
    ms: i64,
    text: &str,
    verdict: &str,
    simulated: bool,
) -> GatehouseChatItem {
    serde_json::from_value(json!({
        "message":{"message_id":format!("simulated-{id}"),"user_id":user.to_string(),"at":String::from(timestamp(ms).unwrap()),"text":text},
        "decision":{"decision_id":format!("01ARZ3NDEKTSV4RRFFQ69G5F{:02}", id % 10),"message_id":format!("simulated-{id}"),"kind":"would_act","verdict":verdict,"operator":"human","at":String::from(timestamp(ms).unwrap()),"reason_codes":["simulated"]},
        "provenance":if simulated { "simulated" } else { "live" }
    })).unwrap()
}
#[test]
fn inclusive_stable_windows_precedence_and_counted_only_provenance() {
    let at = 1_767_225_600_000;
    let items = vec![
        item(1, 1, at - 1, "1 SIMULATED", "pass", true),
        item(2, 1, at, "1 SIMULATED", "bar", true),
        item(3, 1, at, "2 SIMULATED", "hold", true),
        item(4, 1, at, "SIMULATED chatter", "pass", true),
        item(5, 1, at, "Cheer100 2!! SIMULATED", "pass", false),
        item(6, 1, at, "1 SIMULATED", "pass", true),
        item(7, 2, at + 1000, "1 SIMULATED", "pass", true),
        item(8, 3, at + 1001, "1 SIMULATED", "pass", true),
    ];
    let events = ballots::classify_window(&items, &timestamp(at).unwrap(), 1000);
    use ballots::Status::*;
    assert_eq!(
        events.iter().map(|e| e.status).collect::<Vec<_>>(),
        [Barred, Held, Chatter, Counted, Repeat, Counted]
    );
    let before = ballots::tally_at(&events, 0);
    assert_eq!(before.counted, TiltyardCounted { left: 0, right: 1 });
    assert!(!before.simulated);
    assert_eq!(
        (
            before.held,
            before.chatter,
            before.repeat,
            before.cheers_as_one,
            before.seen
        ),
        (1, 1, 1, 1, 5)
    );
    let all = ballots::tally_at(&events, 1000);
    assert_eq!(all.counted, TiltyardCounted { left: 1, right: 1 });
    assert!(all.simulated);
}
#[test]
fn numeric_seed_comparison_never_loses_precision_and_equal_seeds_favour_left() {
    let zero = ballots::empty();
    let a = "100000000000000000000000000000001"
        .to_owned()
        .try_into()
        .unwrap();
    let b = "99999999999999999999999999999999"
        .to_owned()
        .try_into()
        .unwrap();
    assert_eq!(engine::decide(&zero, &a, &b).side, TiltyardWinner::Right);
    assert_eq!(engine::decide(&zero, &b, &b).side, TiltyardWinner::Left);
    assert_eq!(
        engine::decide(&TiltyardCounted { left: 3, right: 1 }, &a, &b).how,
        TiltyardDecision::Tally
    );
}

#[test]
fn handler_invariants_reject_semantic_corruption_beyond_the_structural_schema() {
    let stages = fixture()["stages"].as_array().unwrap().clone();
    let live: TiltyardStageResult = serde_json::from_value(stages[1].clone()).unwrap();
    let live = live.session.unwrap();
    let verdict: TiltyardStageResult = serde_json::from_value(stages[4].clone()).unwrap();
    let verdict = verdict.session.unwrap();
    let mut variants = Vec::new();
    let mut broken = live.clone();
    broken.elapsed_ms = u32::from(broken.window_ms) + 1;
    variants.push(broken);
    let mut broken = live.clone();
    broken.bracket.seeds.push(broken.bracket.seeds[0].clone());
    variants.push(broken);
    let mut broken = live.clone();
    broken.bracket.rounds[0].0[0].b = broken.bracket.rounds[0].0[0].a.clone();
    variants.push(broken);
    let mut broken = live.clone();
    broken.window_ends_at = None;
    variants.push(broken);
    let mut broken = live.clone();
    broken.remaining_ms = 1;
    variants.push(broken);
    let mut broken = live.clone();
    broken.champion = Some(broken.list.items[0].id.clone());
    variants.push(broken);
    let mut broken = live;
    broken.simulated = true;
    variants.push(broken);
    let mut broken = verdict.clone();
    broken.history.swap(0, 1);
    variants.push(broken);
    let mut broken = verdict.clone();
    broken.bracket.rounds[1].0[0].a = broken.list.items[0].id.clone();
    variants.push(broken);
    let mut broken = verdict.clone();
    broken.verdict.as_mut().unwrap().verdict.side = TiltyardWinner::Left;
    variants.push(broken);
    let mut broken = verdict.clone();
    broken.verdict.as_mut().unwrap().index = 1;
    variants.push(broken);
    let mut broken = verdict;
    broken.remaining_ms = 4001;
    variants.push(broken);
    for broken in variants {
        assert_eq!(
            validate::session(&broken).unwrap_err().code,
            ErrorCode::Invalid
        );
    }
}

#[test]
fn shared_recorded_verdicts_are_reproduced_by_the_pure_engine() {
    for stage in fixture()["stages"].as_array().unwrap() {
        let stage: TiltyardStageResult = serde_json::from_value(stage.clone()).unwrap();
        let Some(expected) = stage
            .session
            .filter(|s| s.phase == TiltyardSessionPhase::Verdict)
        else {
            continue;
        };
        let mut actual = engine::start(
            expected.list.clone(),
            expected.key.clone(),
            expected.window_ms,
        )
        .unwrap();
        while actual.history.len() + 1 < expected.history.len() {
            let (round, index, current) = bracket::current(&actual.bracket).unwrap();
            let winner = expected.bracket.rounds[round].0[index]
                .winner
                .as_ref()
                .unwrap();
            actual.counted = if winner == &current.a {
                TiltyardCounted { left: 1, right: 0 }
            } else {
                TiltyardCounted { left: 0, right: 1 }
            };
            engine::step(&mut actual, &TiltyardAction::Enter {}).unwrap();
            engine::step(&mut actual, &TiltyardAction::Enter {}).unwrap();
        }
        actual.elapsed_ms = expected.elapsed_ms;
        actual.counted = expected.counted.clone();
        actual.simulated = expected.simulated;
        actual.speed = expected.speed;
        let closed = expected.verdict.as_ref().unwrap();
        let action = if closed.verdict.how == TiltyardDecision::Call {
            TiltyardAction::Pick {
                side: closed.verdict.side,
            }
        } else {
            TiltyardAction::Enter {}
        };
        engine::step(&mut actual, &action).unwrap();
        assert_eq!(normalized(&actual), normalized(&expected));
    }
}
