//! Offline confirmation inputs only; never a live Twitch call.
mod common;
mod gate_common;
use cc_types::{
    DelaySetParams, DelaySetResult, ErrorCode, ErrorEnvelope, ShieldSetParams, ShieldState,
};
use common::*;
use gate_common::actor;
use std::io::Write;

#[test]
fn applied_settings_stay_unknown_until_confirmed_and_errors_preserve_the_value() {
    let mut f = Fixture::new();
    assert!(f.gate.delay_state().is_none());
    assert!(f.gate.shield_state().is_none());
    let delay = DelaySetParams {
        delay_s: 2.try_into().unwrap(),
    };
    let pending = f.gate.delay_prepare(delay.clone(), actor()).unwrap();
    assert!(f.gate.delay_state().is_none());
    f.gate
        .delay_confirm(
            pending,
            Ok(DelaySetResult {
                delay_s: delay.delay_s,
            }),
        )
        .unwrap();
    let pending = f
        .gate
        .delay_prepare(
            DelaySetParams {
                delay_s: 6.try_into().unwrap(),
            },
            actor(),
        )
        .unwrap();
    let mut limited = ErrorEnvelope::new(ErrorCode::RateLimited, "simulated rate limit");
    limited.retry_after_ms = Some(1250);
    assert_eq!(
        f.gate
            .delay_confirm(pending, Err(limited.clone()))
            .unwrap_err(),
        limited
    );
    assert_eq!(u8::from(f.gate.delay_state().unwrap().delay_s), 2);
    let pending = f.gate.delay_prepare(delay, actor()).unwrap();
    assert_eq!(
        f.gate
            .delay_confirm(
                pending,
                Ok(DelaySetResult {
                    delay_s: 4.try_into().unwrap()
                })
            )
            .unwrap_err()
            .code,
        ErrorCode::Conflict
    );
    for enabled in [true, false] {
        let before = f.gate.shield_state();
        let pending = f
            .gate
            .shield_prepare(ShieldSetParams { enabled }, actor())
            .unwrap();
        assert_eq!(f.gate.shield_state(), before);
        f.gate
            .shield_confirm(pending, Ok(ShieldState { enabled }))
            .unwrap();
        assert_eq!(f.gate.shield_state().unwrap().enabled, enabled);
    }
    let pending = f
        .gate
        .shield_prepare(ShieldSetParams { enabled: true }, actor())
        .unwrap();
    assert_eq!(
        f.gate
            .shield_confirm(
                pending,
                Err(ErrorEnvelope::new(
                    ErrorCode::Unavailable,
                    "simulated timeout"
                ))
            )
            .unwrap_err()
            .code,
        ErrorCode::Unavailable
    );
    assert!(!f.gate.shield_state().unwrap().enabled);
    let roll = f.gate.gate_roll().unwrap();
    assert_eq!(roll.len(), 3); // exactly the three confirmations
    assert!(roll.iter().all(|d| d.rule_id.is_none()));
    assert!(
        roll.iter()
            .any(|d| d.reason_codes.contains(&"delay_s:2".into()))
    );
    drop(f.gate);
    let gate = cc_gatehouse::Gatehouse::with_clock(f.root.path(), f.clock).unwrap();
    assert_eq!(gate.gate_roll().unwrap().len(), 3);
    assert!(gate.delay_state().is_none()); // refresh, never assume old state is live
    assert!(gate.shield_state().is_none());
}

#[test]
fn failed_audit_cannot_publish_a_new_applied_value() {
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
    let mut ledger = std::fs::OpenOptions::new()
        .append(true)
        .open(f.root.path().join("store/decisions.jsonl"))
        .unwrap();
    ledger.write_all(b"simulated corrupt tail\n").unwrap();
    drop(ledger);
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
    assert!(f.gate.delay_state().is_none());
    assert!(f.gate.gate_roll().is_err()); // orphan metadata is not a committed entry
}

#[test]
fn pending_confirmations_are_bound_to_the_service_and_one_revision() {
    let mut f = Fixture::new();
    let mut other = Fixture::new();
    let params = DelaySetParams {
        delay_s: 2.try_into().unwrap(),
    };
    let foreign = other.gate.delay_prepare(params.clone(), actor()).unwrap();
    assert_eq!(
        f.gate
            .delay_confirm(
                foreign,
                Ok(DelaySetResult {
                    delay_s: params.delay_s
                })
            )
            .unwrap_err()
            .code,
        ErrorCode::Conflict
    );
    let first = f.gate.delay_prepare(params.clone(), actor()).unwrap();
    let second = f.gate.delay_prepare(params.clone(), actor()).unwrap();
    f.gate
        .delay_confirm(
            first,
            Ok(DelaySetResult {
                delay_s: params.delay_s,
            }),
        )
        .unwrap();
    assert_eq!(
        f.gate
            .delay_confirm(
                second,
                Ok(DelaySetResult {
                    delay_s: params.delay_s
                })
            )
            .unwrap_err()
            .code,
        ErrorCode::Conflict
    );
    other.gate.set_gate_available(false);
    assert!(other.gate.delay_prepare(params, actor()).is_err());
    assert!(
        other
            .gate
            .shield_prepare(ShieldSetParams { enabled: true }, actor())
            .is_err()
    );
}

#[test]
fn every_supported_delay_is_confirmed_as_numeric_seconds() {
    let mut f = Fixture::new();
    for value in [0, 2, 4, 6] {
        let delay_s = value.try_into().unwrap();
        let pending = f
            .gate
            .delay_prepare(DelaySetParams { delay_s }, actor())
            .unwrap();
        assert_eq!(
            u8::from(
                f.gate
                    .delay_confirm(pending, Ok(DelaySetResult { delay_s }))
                    .unwrap()
                    .delay_s
            ),
            value
        );
    }
    assert_eq!(f.gate.gate_roll().unwrap().len(), 4);
}
