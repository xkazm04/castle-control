//! Simulated, already-validated metadata at the Rust-only ingestion seam.
mod common;
mod gate_common;
use cc_gatehouse::{
    Gatehouse,
    gate::{AutoModHeld, ExternalAction, ModerationEvent, SuspiciousMessage},
    governor::{Governor, GovernorConfig, RoomSetting},
};
use cc_store::{LedgerEvent, LedgerKind, Store};
use cc_types::{
    Action, DecisionKind, DelaySetParams, DelaySetResult, Operator, RoomMode, ShieldSetParams,
    ShieldState, Verdict,
};
use common::*;
use gate_common::actor;

fn external(action: ExternalAction) -> ModerationEvent {
    ModerationEvent {
        moderator: actor(),
        action,
        message: None,
        at: at(NOW),
    }
}

#[test]
fn twitch_ui_action_is_durable_human_authored_and_not_a_rule_or_model() {
    let mut f = Fixture::new();
    let mut event = external(ExternalAction::Timeout);
    event.message = Some(message(1, 100, "simulated text is not copied to ledger"));
    let result = f.gate.ingest_moderation(event, None).unwrap();
    assert_eq!(result.kind, DecisionKind::TimedOut);
    assert_eq!(result.operator, Operator::Human);
    assert!(result.rule_id.is_none());
    assert!(result.reason_codes.contains(&"external_twitch_ui".into()));
    assert!(result.reason_codes.contains(&"moderator_id:200".into()));
    assert_eq!(f.gate.gate_roll().unwrap(), vec![result.clone()]);
    drop(f.gate);
    let gate = Gatehouse::with_clock(f.root.path(), f.clock).unwrap();
    assert_eq!(gate.gate_roll().unwrap(), vec![result]);
    drop(gate);
    let store = Store::open(f.root.path().join("store")).unwrap();
    assert_eq!(store.read_ledger(LedgerKind::Decisions).unwrap().len(), 1);
    assert!(
        matches!(&store.read_ledger(LedgerKind::Decisions).unwrap()[0].event,
        LedgerEvent::Decision { user_id: Some(id), .. } if id.as_str() == "100")
    );
    assert!(
        !std::fs::read_to_string(f.root.path().join("store/decisions.jsonl"))
            .unwrap()
            .contains("simulated text")
    );
}

#[test]
fn unrecognised_actions_are_audited_but_cannot_set_state_or_grant_authority() {
    let mut f = Fixture::new();
    let result = f
        .gate
        .ingest_moderation(external(ExternalAction::Unrecognised), None)
        .unwrap();
    assert_eq!(result.kind, DecisionKind::Held);
    assert_eq!(result.verdict, Verdict::Hold);
    assert!(result.rule_id.is_none());
    assert!(
        result
            .reason_codes
            .contains(&"external_unrecognised".into())
    );
    assert!(f.gate.delay_state().is_none());
    assert!(f.gate.shield_state().is_none());
    assert!(f.gate.held_queue().unwrap().is_empty());
    assert!(
        f.gate
            .ingest_moderation(external(ExternalAction::Ban), None)
            .is_err()
    );
    assert_eq!(f.gate.gate_roll().unwrap().len(), 1);
}

#[test]
fn external_setting_change_invalidates_our_inflight_echo() {
    let mut f = Fixture::new();
    let pending = f
        .gate
        .delay_prepare(
            DelaySetParams {
                delay_s: 2.try_into().unwrap(),
            },
            actor(),
        )
        .unwrap();
    f.gate
        .ingest_moderation(external(ExternalAction::Delay(6.try_into().unwrap())), None)
        .unwrap();
    assert!(
        f.gate
            .delay_confirm(
                pending,
                Ok(DelaySetResult {
                    delay_s: 2.try_into().unwrap()
                })
            )
            .is_err()
    );
    assert_eq!(u8::from(f.gate.delay_state().unwrap().delay_s), 6);
    let pending = f
        .gate
        .shield_prepare(ShieldSetParams { enabled: false }, actor())
        .unwrap();
    f.gate
        .ingest_moderation(external(ExternalAction::Shield(true)), None)
        .unwrap();
    assert!(
        f.gate
            .shield_confirm(pending, Ok(ShieldState { enabled: false }))
            .is_err()
    );
    assert!(f.gate.shield_state().unwrap().enabled);
    assert_eq!(f.gate.gate_roll().unwrap().len(), 2);
}

#[test]
fn external_room_mode_reuses_governor_yield_without_reverting_human_state() {
    let mut f = Fixture::new();
    let cfg = GovernorConfig {
        borders: [10, 20, 30],
        margin: 2,
        hysteresis_s: 30,
        lease_s: 60,
        plans: [
            vec![RoomSetting::Slow { interval_s: 10 }],
            vec![],
            vec![],
            vec![],
        ],
    };
    let mut governor = Governor::new(cfg, f.clock.clone()).unwrap();
    assert_eq!(governor.tick().unwrap().intents.len(), 1);
    assert!(
        f.gate
            .ingest_moderation(external(ExternalAction::RoomMode(RoomMode::Slow)), None)
            .is_err()
    );
    f.gate
        .ingest_moderation(
            external(ExternalAction::RoomMode(RoomMode::Slow)),
            Some(&mut governor),
        )
        .unwrap();
    assert!(governor.leases()[0].yielded);
    f.clock.set("2026-10-25T12:01:00Z");
    assert!(governor.tick().unwrap().intents.is_empty());
    assert!(governor.leases().is_empty());
}

#[tokio::test]
async fn unknown_event_does_not_promote_the_subject_into_verified_authority() {
    let mut f = Fixture::new();
    f.upsert(pattern("bad", Action::Delete));
    f.arm("bad");
    let mut event = external(ExternalAction::Unrecognised);
    event.message = Some(message(1, 100, "simulated mod here"));
    f.gate.ingest_moderation(event, None).unwrap();
    let result = f
        .gate
        .screen_batch(vec![message(2, 100, "simulated tagged")], &Fake::new("[]"))
        .await
        .unwrap();
    assert_eq!(result[0].decision.kind, DecisionKind::Removed);
}

#[test]
fn suspicious_intake_always_reaches_human_with_no_automatic_action() {
    let mut f = Fixture::new();
    f.upsert(pattern("bad", Action::Ban));
    f.arm("bad");
    for (i, text) in [
        "simulated tagged",
        "simulated I want to die",
        "simulated mod here",
    ]
    .iter()
    .enumerate()
    {
        let screened = f
            .gate
            .suspicious_message(SuspiciousMessage {
                message: message(i, 100 + i as u64, text),
            })
            .unwrap();
        assert_eq!(screened.decision.verdict, Verdict::Hold);
        assert!(screened.intent.is_none());
        assert!(screened.reaches_streamer);
        assert!(screened.for_consensus().is_none());
    }
    drop(f.gate);
    let gate = Gatehouse::with_clock(f.root.path(), f.clock).unwrap();
    let queue = gate.suspicious_queue().unwrap();
    assert_eq!(queue.len(), 3);
    assert!(
        queue
            .iter()
            .all(|d| d.kind == DecisionKind::Held && d.message_text.is_some())
    );
    assert!(gate.held_queue().unwrap().is_empty());
}

#[test]
fn external_human_resolution_closes_the_original_automod_queue() {
    for action in [ExternalAction::AllowHeld, ExternalAction::DenyHeld] {
        let mut f = Fixture::new();
        let msg = message(1, 100, "simulated original held message");
        f.gate
            .automod_hold(AutoModHeld {
                message: msg.clone(),
            })
            .unwrap();
        let mut event = external(action);
        event.message = Some(msg);
        assert_eq!(
            f.gate.ingest_moderation(event, None).unwrap().kind,
            if matches!(action, ExternalAction::AllowHeld) {
                DecisionKind::Released
            } else {
                DecisionKind::Removed
            }
        );
        assert!(f.gate.held_queue().unwrap().is_empty());
    }
}

#[test]
fn external_viewer_actions_keep_their_observed_kind_without_a_second_execution() {
    for (action, kind) in [
        (ExternalAction::Warn, DecisionKind::Warned),
        (ExternalAction::Delete, DecisionKind::Removed),
        (ExternalAction::Timeout, DecisionKind::TimedOut),
        (ExternalAction::Ban, DecisionKind::Banned),
        (ExternalAction::Unban, DecisionKind::Undone),
    ] {
        let mut f = Fixture::new();
        let mut event = external(action);
        event.message = Some(message(1, 100, "simulated context"));
        let decision = f.gate.ingest_moderation(event, None).unwrap();
        assert_eq!(decision.kind, kind);
        assert_eq!(decision.operator, Operator::Human);
        assert_eq!(f.gate.gate_roll().unwrap().len(), 1);
        assert!(f.gate.pending_bans().unwrap().is_empty());
    }
}

#[test]
fn external_resolution_is_still_audited_when_the_hold_intake_was_missed() {
    let mut f = Fixture::new();
    let mut event = external(ExternalAction::AllowHeld);
    event.message = Some(message(1, 100, "")); // observed IDs, no fabricated original
    let decision = f.gate.ingest_moderation(event, None).unwrap();
    assert_eq!(decision.kind, DecisionKind::Released);
    assert_eq!(decision.operator, Operator::Human);
    assert_eq!(f.gate.gate_roll().unwrap(), vec![decision]);
    assert!(f.gate.held_queue().unwrap().is_empty());
}
