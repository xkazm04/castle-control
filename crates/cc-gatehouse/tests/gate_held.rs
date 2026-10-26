//! Generated simulated messages only; no Twitch transport or executor.
mod common;

use cc_gatehouse::{Gatehouse, gate::AutoModHeld};
use cc_store::{LedgerKind, Store};
use cc_types::{DecisionKind, ErrorCode, HeldOutcome, HeldResolveParams, Operator, Verdict};
use common::*;
use std::time::Duration;

#[tokio::test]
async fn held_queue_survives_restart_and_resolves_the_durable_original_once() {
    for outcome in [HeldOutcome::Allow, HeldOutcome::Deny] {
        let mut f = Fixture::new();
        let msg = message(1, 100, "simulated ORIGINAL; never a summary");
        f.gate
            .automod_hold(AutoModHeld {
                message: msg.clone(),
            })
            .unwrap();
        f.gate
            .automod_hold(AutoModHeld {
                message: msg.clone(),
            })
            .unwrap();
        drop(f.gate);
        let mut gate = Gatehouse::with_clock(f.root.path(), f.clock).unwrap();
        let queue = gate.held_queue().unwrap();
        assert_eq!(queue.len(), 1);
        assert_eq!(queue[0].message_text.as_deref(), Some(msg.text.as_str()));
        let params = HeldResolveParams {
            message_id: msg.message_id.clone(),
            outcome,
        };
        let result = gate
            .held_resolve(
                params.clone(),
                Duration::from_secs(1),
                |original, chosen| async move {
                    assert_eq!(original.text, "simulated ORIGINAL; never a summary");
                    assert_eq!(chosen, outcome);
                    Ok(())
                },
            )
            .await
            .unwrap();
        assert_eq!(result.operator, Operator::Human);
        assert!(result.rule_id.is_none());
        assert_eq!(
            result.kind,
            if outcome == HeldOutcome::Allow {
                DecisionKind::Released
            } else {
                DecisionKind::Removed
            }
        );
        assert!(gate.held_queue().unwrap().is_empty());
        assert_eq!(
            gate.held_resolve(params, Duration::from_secs(1), |_, _| async { Ok(()) })
                .await
                .unwrap_err()
                .code,
            ErrorCode::Conflict
        );
        drop(gate);
        let store = Store::open(f.root.path().join("store")).unwrap();
        assert_eq!(store.read_ledger(LedgerKind::Decisions).unwrap().len(), 2);
        let ledger = std::fs::read_to_string(f.root.path().join("store/decisions.jsonl")).unwrap();
        assert!(!ledger.contains("ORIGINAL"));
    }
}

#[tokio::test]
async fn response_timeout_stays_held_across_restart_and_can_be_retried() {
    let mut f = Fixture::new();
    let msg = message(1, 100, "simulated held message");
    f.gate
        .automod_hold(AutoModHeld {
            message: msg.clone(),
        })
        .unwrap();
    let params = HeldResolveParams {
        message_id: msg.message_id,
        outcome: HeldOutcome::Allow,
    };
    let decision = f
        .gate
        .held_resolve(params.clone(), Duration::from_millis(1), |_, _| {
            std::future::pending()
        })
        .await
        .unwrap();
    assert_eq!(decision.kind, DecisionKind::Held);
    assert_eq!(decision.verdict, Verdict::Hold);
    assert!(
        decision
            .reason_codes
            .contains(&"held_response_timeout".into())
    );
    assert_eq!(f.gate.held_queue().unwrap().len(), 1);
    drop(f.gate);
    let mut gate = Gatehouse::with_clock(f.root.path(), f.clock).unwrap();
    assert_eq!(gate.held_queue().unwrap().len(), 1);
    gate.held_resolve(params, Duration::from_secs(1), |_, _| async { Ok(()) })
        .await
        .unwrap();
    assert!(gate.held_queue().unwrap().is_empty());
    drop(gate);
    assert_eq!(
        Store::open(f.root.path().join("store"))
            .unwrap()
            .read_ledger(LedgerKind::Decisions)
            .unwrap()
            .len(),
        3
    );
}

#[tokio::test]
async fn an_unavailable_gate_never_calls_the_confirmation_seam() {
    let mut f = Fixture::new();
    let msg = message(1, 100, "simulated held message");
    f.gate
        .automod_hold(AutoModHeld {
            message: msg.clone(),
        })
        .unwrap();
    f.gate.set_gate_available(false);
    let result = f
        .gate
        .held_resolve(
            HeldResolveParams {
                message_id: msg.message_id,
                outcome: HeldOutcome::Deny,
            },
            Duration::from_secs(1),
            |_, _| async { panic!("unavailable gate must not proceed") },
        )
        .await
        .unwrap();
    assert_eq!(result.verdict, Verdict::Hold);
    assert_eq!(f.gate.held_queue().unwrap().len(), 1);
}

#[tokio::test]
async fn rate_limited_resolution_keeps_the_original_and_propagates_retry_after() {
    let mut f = Fixture::new();
    let msg = message(1, 100, "simulated original remains held");
    f.gate
        .automod_hold(AutoModHeld {
            message: msg.clone(),
        })
        .unwrap();
    let mut limited = cc_types::ErrorEnvelope::new(ErrorCode::RateLimited, "simulated rate limit");
    limited.retry_after_ms = Some(1250);
    let failure = limited.clone();
    let result = f
        .gate
        .held_resolve(
            HeldResolveParams {
                message_id: msg.message_id,
                outcome: HeldOutcome::Deny,
            },
            Duration::from_secs(1),
            |_, _| async { Err(failure) },
        )
        .await
        .unwrap_err();
    assert_eq!(result, limited);
    assert_eq!(f.gate.held_queue().unwrap().len(), 1);
    assert_eq!(f.gate.gate_roll().unwrap().len(), 2);
    assert!(
        f.gate
            .gate_roll()
            .unwrap()
            .iter()
            .all(|d| d.kind == DecisionKind::Held)
    );
}

#[tokio::test]
async fn erased_or_expired_original_and_conflicting_duplicate_never_resolve() {
    for forget in [false, true] {
        let mut f = Fixture::new();
        let msg = message(1, 100, "simulated original retained under cc-store policy");
        f.gate
            .automod_hold(AutoModHeld {
                message: msg.clone(),
            })
            .unwrap();
        let mut changed = msg.clone();
        changed.text = "simulated tampered duplicate".into();
        assert_eq!(
            f.gate
                .automod_hold(AutoModHeld { message: changed })
                .unwrap_err()
                .code,
            ErrorCode::Conflict
        );
        drop(f.gate);
        let mut store = Store::open(f.root.path().join("store")).unwrap();
        if forget {
            store
                .forget_user("sim_100", cc_store::Timestamp::parse(NOW).unwrap())
                .unwrap();
        } else {
            store
                .purge_expired(cc_store::Timestamp::parse("2026-12-25T12:00:00Z").unwrap())
                .unwrap();
        }
        drop(store);
        let mut gate = Gatehouse::with_clock(f.root.path(), f.clock).unwrap();
        assert!(
            gate.held_resolve(
                HeldResolveParams {
                    message_id: msg.message_id,
                    outcome: HeldOutcome::Allow
                },
                Duration::from_secs(1),
                |_, _| async { panic!("erased original cannot be approved") }
            )
            .await
            .is_err()
        );
    }
}
