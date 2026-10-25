use crate::*;
use cc_store::{LedgerEvent, LedgerKind, Store, Timestamp, TwitchUserId};
use cc_types::{DrawId, MessageId, Verdict};
use cc_verify::{SealedRoll, verify_writ_json};
use chrono::{DateTime, TimeZone, Utc};
use std::path::PathBuf;

mod audit;
mod properties;
mod quicknet;

fn at(seconds: i64) -> DateTime<Utc> {
    Utc.with_ymd_and_hms(2026, 10, 25, 0, 0, 0).unwrap() + chrono::Duration::seconds(seconds)
}

fn timestamp(seconds: i64) -> Timestamp {
    Timestamp::parse(&at(seconds).to_rfc3339()).unwrap()
}

fn user(n: u64) -> TwitchUserId {
    TwitchUserId::parse(&n.to_string()).unwrap()
}

fn rules() -> RollRules {
    RollRules {
        pool: Pool::Chatters,
        winner_count: 1,
        cooldown_s: 60,
        cohort_caps: Vec::new(),
        weight_curve: WeightCurve::Equal,
        free_join_equal_odds: false,
    }
}

fn message(n: u64, seconds: i64) -> MessageFacts {
    MessageFacts {
        message_id: MessageId::try_from(format!("simulated-{n}-{seconds}")).unwrap(),
        user_id: user(n),
        at: at(seconds),
        text: "simulated chat".into(),
        follower: false,
        subscriber: false,
        redeemed: false,
        activity_units: 0,
        cohorts: Default::default(),
    }
}

fn add(roll: &mut Roll, facts: MessageFacts) {
    let passed = PassedMessage::from_verdict(facts, Verdict::Pass).unwrap();
    assert_eq!(roll.intake(passed), Intake::Added);
}

fn guard() -> GuardedDraw {
    GuardedDraw::new(
        DrawId::try_from("simulated-draw".to_owned()).unwrap(),
        DrawPolicy::default(),
    )
}

fn seal(roll: Roll, seed: [u8; 32], store: &mut Store) -> SealedDraw {
    seal_roll(
        roll,
        &guard(),
        at(1),
        1,
        SealSource::StreamerCommit(SealedRoll::commitment(&seed)),
        store,
        timestamp(2),
    )
    .unwrap()
}

struct SimulatedDir(PathBuf);

impl SimulatedDir {
    fn new() -> Self {
        let dir = Self(
            std::env::temp_dir().join(format!("cc-lots-proof-simulated-{}", ulid::Ulid::new())),
        );
        std::fs::create_dir(&dir.0).unwrap();
        dir
    }
}

impl Drop for SimulatedDir {
    fn drop(&mut self) {
        assert_eq!(self.0.parent(), Some(std::env::temp_dir().as_path()));
        std::fs::remove_dir_all(&self.0).unwrap();
    }
}

#[test]
fn seal_is_durable_before_cast() {
    let dir = SimulatedDir::new();
    let mut store = Store::open(&dir.0).unwrap();
    let mut roll = Roll::new(rules()).unwrap();
    add(&mut roll, message(1, 0));
    let sealed = seal(roll, [1; 32], &mut store);
    let lines = store.read_ledger(LedgerKind::Draws).unwrap();
    assert_eq!(lines.len(), 1);
    let event = serde_json::to_value(&lines[0].event).unwrap();
    assert_eq!(event["kind"], "draw_sealed");
    assert_eq!(event["draw_run_id"], sealed.draw_run_id().to_string());
    assert_eq!(event["seal_digest"], sealed.seal());
}

#[test]
fn snapshot_is_exactly_the_proof_core_seal_and_cast_is_audited_once() {
    let dir = SimulatedDir::new();
    let mut store = Store::open(&dir.0).unwrap();
    let mut config = rules();
    config.winner_count = 2;
    config.weight_curve = WeightCurve::concave(10).unwrap();
    let mut roll = Roll::new(config.clone()).unwrap();
    for n in [3, 1, 2] {
        let mut facts = message(n, 0);
        facts.activity_units = u16::try_from(n).unwrap();
        add(&mut roll, facts);
    }
    for verdict in [Verdict::Hold, Verdict::Bar] {
        assert!(matches!(
            PassedMessage::from_verdict(message(4, 0), verdict),
            Err(Error::NotPassed)
        ));
    }
    let seed = [7; 32];
    let sealed = seal(roll, seed, &mut store);
    // Editing the caller's configuration cannot change the owned snapshot.
    config.winner_count = 1;
    config.weight_curve = WeightCurve::Equal;
    let expected = SealedRoll::streamer(
        (1..=3)
            .map(|n| cc_verify::Entry {
                handle: n.to_string(),
                weight: WeightCurve::concave(10).unwrap().weight(n) as u32,
            })
            .collect(),
        2,
        "2026-10-25T00:00:01Z".into(),
        1,
        SealedRoll::commitment(&seed),
    )
    .unwrap();
    assert_eq!(sealed.seal(), expected.seal());
    assert_eq!(sealed.to_json().unwrap(), expected.to_json().unwrap());
    assert_eq!(sealed.label(), "streamer-controlled");
    let run_id = sealed.draw_run_id();
    let result = cast_streamer(sealed, seed, at(2), &mut store, timestamp(3)).unwrap();
    let verified = verify_writ_json(&result.writ().to_json().unwrap(), None).unwrap();
    assert_eq!(result.verified().winners(), verified.winners());
    assert_eq!(result.verified().seal(), expected.seal());
    assert_eq!(result.verified().label(), "streamer-controlled");
    assert_eq!(result.winners().len(), 2);
    assert!(!result.winners().contains(&user(4)));
    assert_eq!(result.draw_run_id(), run_id);
    let ledger = store.read_ledger(LedgerKind::Draws).unwrap();
    assert_eq!(ledger.len(), 2);
    assert_eq!(ledger[0].event_at, timestamp(1));
    assert_eq!(ledger[0].recorded_at, timestamp(2));
    assert_eq!(
        ledger[0].event,
        LedgerEvent::DrawSealed {
            draw_run_id: run_id,
            draw_id: cc_store::DrawSlug::parse("simulated-draw").unwrap(),
            seal_digest: cc_store::SealDigest::parse(expected.seal()).unwrap(),
            entry_count: 3,
            winner_count: 2,
        }
    );
    assert_eq!(ledger[1].event_at, timestamp(2));
    assert_eq!(ledger[1].recorded_at, timestamp(3));
    assert_eq!(
        ledger[1].event,
        LedgerEvent::Draw {
            draw_run_id: run_id,
            winner_user_ids: result.winners().to_vec(),
        }
    );
}

#[test]
fn cap_disagreement_fails_loudly_without_recording_or_rerolling() {
    let dir = SimulatedDir::new();
    let mut store = Store::open(&dir.0).unwrap();
    let mut config = rules();
    config.cohort_caps = vec![CohortCap::new("simulated-raiders".into(), 0, 1).unwrap()];
    let mut roll = Roll::new(config).unwrap();
    let mut facts = message(1, 0);
    facts.cohorts.insert("simulated-raiders".into());
    add(&mut roll, facts);
    let result = cast_streamer(
        seal(roll, [1; 32], &mut store),
        [1; 32],
        at(2),
        &mut store,
        timestamp(2),
    );
    assert!(matches!(result, Err(Error::Winners("cohort cap exceeded"))));
    assert_only_seals(&store, 1);
}

#[test]
fn cast_satisfying_a_restrictive_cohort_cap_succeeds() {
    let dir = SimulatedDir::new();
    let mut store = Store::open(&dir.0).unwrap();
    let mut config = rules();
    config.winner_count = 2;
    config.cohort_caps = vec![CohortCap::new("simulated-raiders".into(), 1, 2).unwrap()];
    let mut roll = Roll::new(config).unwrap();
    let mut raider = message(1, 0);
    raider.cohorts.insert("simulated-raiders".into());
    add(&mut roll, raider);
    add(&mut roll, message(2, 0));
    let result = cast_streamer(
        seal(roll, [1; 32], &mut store),
        [1; 32],
        at(2),
        &mut store,
        timestamp(2),
    )
    .unwrap();
    assert_eq!(result.winners().len(), 2);
    assert!(result.winners().contains(&user(1)));
    assert!(result.winners().contains(&user(2)));
}

#[test]
fn eligible_snapshot_and_next_roll_preserve_cooldowns() {
    let dir = SimulatedDir::new();
    let mut store = Store::open(&dir.0).unwrap();
    let mut roll = Roll::new(rules()).unwrap();
    add(&mut roll, message(1, 0));
    add(&mut roll, message(2, 0));
    add(&mut roll, message(3, 100)); // cannot enter the earlier seal
    roll.record_winners(&[user(1)], at(0)).unwrap();
    let sealed = seal(roll, [4; 32], &mut store);
    let ledger = store.read_ledger(LedgerKind::Draws).unwrap();
    assert!(matches!(
        ledger[0].event,
        LedgerEvent::DrawSealed { entry_count: 1, .. }
    ));
    // A cooldown expiring while waiting cannot expand the frozen entry list.
    let result = cast_streamer(sealed, [4; 32], at(61), &mut store, timestamp(61)).unwrap();
    assert_eq!(result.winners(), &[user(2)]);
    let mut next = result.into_next_roll();
    assert!(next.weight_table(at(61)).rows.is_empty());
    assert_eq!(
        next.intake(PassedMessage::from_verdict(message(2, 120), Verdict::Pass).unwrap()),
        Intake::Cooldown
    );
    add(&mut next, message(1, 61));
    add(&mut next, message(2, 121));
}

#[test]
fn bad_reveal_and_backwards_cast_time_never_publish_a_result() {
    let dir = SimulatedDir::new();
    let mut store = Store::open(&dir.0).unwrap();
    for (i, (seed, time)) in [([2; 32], at(2)), ([1; 32], at(0))].into_iter().enumerate() {
        let mut roll = Roll::new(rules()).unwrap();
        add(&mut roll, message(1, 0));
        let result = cast_streamer(
            seal(roll, [1; 32], &mut store),
            seed,
            time,
            &mut store,
            timestamp(2),
        );
        assert!(result.is_err());
        assert_only_seals(&store, i + 1);
    }
}

#[test]
fn audit_failure_withholds_the_cast_result() {
    let dir = SimulatedDir::new();
    let mut store = Store::open(&dir.0).unwrap();
    let mut roll = Roll::new(rules()).unwrap();
    add(&mut roll, message(1, 0));
    let sealed = seal(roll, [1; 32], &mut store);
    std::fs::remove_file(dir.0.join("draws.jsonl")).unwrap();
    let result = cast_streamer(sealed, [1; 32], at(2), &mut store, timestamp(2));
    assert!(matches!(result, Err(Error::Store(_))));
}

#[test]
fn blocked_policy_and_invalid_proof_inputs_cannot_seal() {
    let dir = SimulatedDir::new();
    let mut store = Store::open(&dir.0).unwrap();
    let blocked = GuardedDraw::new(
        DrawId::try_from("simulated-prize".to_owned()).unwrap(),
        DrawPolicy {
            content: cc_types::DrawContent::Prize,
            paid_entry: true,
            ..Default::default()
        },
    );
    let source = || SealSource::StreamerCommit(SealedRoll::commitment(&[0; 32]));
    let mut roll = Roll::new(rules()).unwrap();
    add(&mut roll, message(1, 0));
    assert!(matches!(
        seal_roll(roll, &blocked, at(1), 1, source(), &mut store, timestamp(2)),
        Err(Error::Invalid("draw policy is blocked"))
    ));
    for (size, winners, margin, nanos) in [(0, 1, 1, 0), (1, 2, 1, 0), (1, 1, 0, 0), (1, 1, 1, 1)] {
        let mut config = rules();
        config.winner_count = winners;
        let mut roll = Roll::new(config).unwrap();
        for n in 1..=size {
            add(&mut roll, message(n, 0));
        }
        let time = at(1) + chrono::Duration::nanoseconds(nanos);
        assert!(
            seal_roll(
                roll,
                &guard(),
                time,
                margin,
                source(),
                &mut store,
                timestamp(2)
            )
            .is_err()
        );
    }
    let mut roll = Roll::new(rules()).unwrap();
    let mut facts = message(1, 0);
    facts.user_id = TwitchUserId::parse("12345678901234567890123456").unwrap();
    add(&mut roll, facts);
    assert!(matches!(
        seal_roll(roll, &guard(), at(1), 1, source(), &mut store, timestamp(2)),
        Err(Error::Proof(_))
    )); // never truncate identifiers exceeding the proof-core limit
    assert!(store.read_ledger(LedgerKind::Draws).unwrap().is_empty());
}

fn assert_only_seals(store: &Store, count: usize) {
    let lines = store.read_ledger(LedgerKind::Draws).unwrap();
    assert_eq!(lines.len(), count);
    assert!(
        lines
            .iter()
            .all(|line| matches!(line.event, LedgerEvent::DrawSealed { .. }))
    );
}
