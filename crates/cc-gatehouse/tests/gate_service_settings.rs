//! Offline confirmation fakes; no transport or live channel.
mod common;
mod gate_common;

use cc_types::{
    DelaySetParams, DelaySetResult, ErrorCode, ErrorEnvelope, ShieldSetParams, ShieldState,
};
use common::Fixture;
use gate_common::actor;
use std::{future::pending, time::Duration};

const BUDGET: Duration = Duration::from_secs(1);

fn delay(value: u8) -> DelaySetParams {
    DelaySetParams {
        delay_s: value.try_into().unwrap(),
    }
}

#[tokio::test]
async fn one_call_settings_confirm_supported_values_and_audit_room_changes() {
    let mut f = Fixture::new();
    for value in [0, 2, 4, 6] {
        let result = f
            .gate
            .delay_set(delay(value), actor(), BUDGET, |params| async move {
                Ok(DelaySetResult {
                    delay_s: params.delay_s,
                })
            })
            .await
            .unwrap();
        assert_eq!(u8::from(result.delay_s), value);
        assert_eq!(f.gate.delay_state(), Some(result));
    }
    for enabled in [true, false] {
        let result = f
            .gate
            .shield_set(
                ShieldSetParams { enabled },
                actor(),
                BUDGET,
                |params| async move {
                    Ok(ShieldState {
                        enabled: params.enabled,
                    })
                },
            )
            .await
            .unwrap();
        assert_eq!(result.enabled, enabled);
        assert_eq!(f.gate.shield_state(), Some(result));
    }
    let roll = f.gate.gate_roll().unwrap();
    assert_eq!(roll.len(), 6);
    assert!(
        roll.iter()
            .all(|d| d.kind == cc_types::DecisionKind::ModeChanged
                && d.message_id.as_str() == "configuration"
                && d.rule_id.is_none())
    );
}

#[tokio::test]
async fn unavailable_or_zero_budget_never_calls_setting_confirmation() {
    for unavailable in [true, false] {
        let mut f = Fixture::new();
        f.gate.set_gate_available(!unavailable);
        let budget = if unavailable { BUDGET } else { Duration::ZERO };
        assert_eq!(
            f.gate
                .delay_set(delay(2), actor(), budget, |_| async {
                    panic!("withheld setting must not be sent")
                })
                .await
                .unwrap_err()
                .code,
            ErrorCode::Unavailable
        );
        assert_eq!(
            f.gate
                .shield_set(
                    ShieldSetParams { enabled: true },
                    actor(),
                    budget,
                    |_| async { panic!("withheld setting must not be sent") }
                )
                .await
                .unwrap_err()
                .code,
            ErrorCode::Unavailable
        );
        assert!(f.gate.delay_state().is_none());
        assert!(f.gate.shield_state().is_none());
        assert!(f.gate.gate_roll().unwrap().is_empty());
    }
}

#[tokio::test]
async fn failed_or_timed_out_setting_is_unknown_and_invalidates_older_preparations() {
    for timeout in [false, true] {
        let mut f = Fixture::new();
        let old_delay = f.gate.delay_prepare(delay(2), actor()).unwrap();
        let old_shield = f
            .gate
            .shield_prepare(ShieldSetParams { enabled: true }, actor())
            .unwrap();
        f.gate
            .delay_set(delay(2), actor(), BUDGET, |p| async move {
                Ok(DelaySetResult { delay_s: p.delay_s })
            })
            .await
            .unwrap();
        f.gate
            .shield_set(
                ShieldSetParams { enabled: true },
                actor(),
                BUDGET,
                |p| async move { Ok(ShieldState { enabled: p.enabled }) },
            )
            .await
            .unwrap();
        let mut limited = ErrorEnvelope::new(ErrorCode::RateLimited, "simulated rate limit");
        limited.retry_after_ms = Some(1250);
        let budget = Duration::from_millis(1);
        let fail_delay = limited.clone();
        let err = f
            .gate
            .delay_set(delay(6), actor(), budget, |_| async move {
                if timeout {
                    pending::<()>().await;
                }
                Err(fail_delay)
            })
            .await
            .unwrap_err();
        assert_eq!(
            err,
            if timeout {
                ErrorEnvelope::new(ErrorCode::Unavailable, "delay confirmation timed out")
            } else {
                limited.clone()
            }
        );
        let fail_shield = limited.clone();
        let err = f
            .gate
            .shield_set(
                ShieldSetParams { enabled: false },
                actor(),
                budget,
                |_| async move {
                    if timeout {
                        pending::<()>().await;
                    }
                    Err(fail_shield)
                },
            )
            .await
            .unwrap_err();
        assert_eq!(
            err.code,
            if timeout {
                ErrorCode::Unavailable
            } else {
                ErrorCode::RateLimited
            }
        );
        if !timeout {
            assert_eq!(err, limited);
        }
        assert!(f.gate.delay_state().is_none());
        assert!(f.gate.shield_state().is_none());
        assert_eq!(
            f.gate
                .delay_confirm(
                    old_delay,
                    Ok(DelaySetResult {
                        delay_s: delay(2).delay_s
                    })
                )
                .unwrap_err()
                .code,
            ErrorCode::Conflict
        );
        assert_eq!(
            f.gate
                .shield_confirm(old_shield, Ok(ShieldState { enabled: true }))
                .unwrap_err()
                .code,
            ErrorCode::Conflict
        );
        assert_eq!(f.gate.gate_roll().unwrap().len(), 2);
    }
}

#[tokio::test]
async fn one_call_mismatch_is_refused_and_new_attempt_invalidates_current_epoch() {
    let mut f = Fixture::new();
    let old_delay = f.gate.delay_prepare(delay(2), actor()).unwrap();
    let old_shield = f
        .gate
        .shield_prepare(ShieldSetParams { enabled: true }, actor())
        .unwrap();
    assert_eq!(
        f.gate
            .delay_set(delay(2), actor(), BUDGET, |_| async {
                Ok(DelaySetResult {
                    delay_s: delay(4).delay_s,
                })
            })
            .await
            .unwrap_err()
            .code,
        ErrorCode::Conflict
    );
    assert_eq!(
        f.gate
            .shield_set(
                ShieldSetParams { enabled: true },
                actor(),
                BUDGET,
                |_| async { Ok(ShieldState { enabled: false }) }
            )
            .await
            .unwrap_err()
            .code,
        ErrorCode::Conflict
    );
    assert_eq!(
        f.gate
            .delay_confirm(
                old_delay,
                Ok(DelaySetResult {
                    delay_s: delay(2).delay_s
                })
            )
            .unwrap_err()
            .code,
        ErrorCode::Conflict
    );
    assert_eq!(
        f.gate
            .shield_confirm(old_shield, Ok(ShieldState { enabled: true }))
            .unwrap_err()
            .code,
        ErrorCode::Conflict
    );
    assert!(f.gate.delay_state().is_none());
    assert!(f.gate.shield_state().is_none());
    assert!(f.gate.gate_roll().unwrap().is_empty());
}

#[tokio::test]
async fn failed_audit_keeps_one_call_settings_unknown() {
    use std::io::Write;
    let mut f = Fixture::new();
    let mut ledger = std::fs::OpenOptions::new()
        .append(true)
        .open(f.root.path().join("store/decisions.jsonl"))
        .unwrap();
    ledger.write_all(b"simulated corrupt tail\n").unwrap();
    drop(ledger);
    assert!(
        f.gate
            .delay_set(delay(2), actor(), BUDGET, |p| async move {
                Ok(DelaySetResult { delay_s: p.delay_s })
            })
            .await
            .is_err()
    );
    assert!(
        f.gate
            .shield_set(
                ShieldSetParams { enabled: true },
                actor(),
                BUDGET,
                |p| async move { Ok(ShieldState { enabled: p.enabled }) }
            )
            .await
            .is_err()
    );
    assert!(f.gate.delay_state().is_none());
    assert!(f.gate.shield_state().is_none());
    assert!(f.gate.gate_roll().is_err());
}
