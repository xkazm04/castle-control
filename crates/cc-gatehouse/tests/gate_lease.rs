//! Service-owned lease registrations and offline confirmation fakes only.
mod common;
mod gate_common;
mod offline_common;

use cc_gatehouse::{
    Gatehouse,
    governor::{Governor, GovernorConfig, RoomModeIntent, RoomSetting},
};
use cc_store::{LedgerEvent, LedgerKind, Store};
use cc_types::{DecisionKind, ErrorCode, ErrorEnvelope, LeaseEndParams, LeaseId, RoomMode};
use common::Fixture;
use gate_common::actor;
use std::{future::pending, time::Duration};

const BUDGET: Duration = Duration::from_secs(1);

fn issue(f: &mut Fixture) -> (Governor, LeaseEndParams) {
    let mut governor = Governor::new(
        GovernorConfig {
            borders: [10, 20, 30],
            margin: 2,
            hysteresis_s: 30,
            lease_s: 60,
            plans: [
                vec![RoomSetting::EmoteOnly],
                vec![RoomSetting::EmoteOnly],
                vec![],
                vec![],
            ],
        },
        f.clock.clone(),
    )
    .unwrap();
    let update = governor.tick().unwrap();
    let lease = governor.leases().remove(0);
    assert_eq!(
        update.intents,
        vec![RoomModeIntent::Apply {
            lease_id: lease.lease_id.clone(),
            setting: lease.setting,
            expires_at: lease.expires_at,
        }]
    );
    f.gate.register_governor_leases(&governor);
    (
        governor,
        LeaseEndParams {
            lease_id: lease.lease_id,
        },
    )
}

#[tokio::test]
async fn confirmed_end_audits_room_only_removes_lease_and_cannot_be_registered_again() {
    let mut f = Fixture::new();
    let (mut governor, params) = issue(&mut f);
    let expected = params.lease_id.clone();
    let decision = f
        .gate
        .lease_end(params.clone(), actor(), BUDGET, |intent| async move {
            assert_eq!(
                intent,
                RoomModeIntent::End {
                    lease_id: expected,
                    mode: RoomMode::EmoteOnly
                }
            );
            Ok(())
        })
        .await
        .unwrap();
    assert_eq!(decision.kind, DecisionKind::ModeChanged);
    assert_eq!(decision.message_id.as_str(), "configuration");
    assert!(decision.rule_id.is_none());
    assert!(decision.message_text.is_none());
    assert!(decision.simulated);
    assert!(
        decision
            .reason_codes
            .contains(&format!("lease_id:{}", params.lease_id.as_str()))
    );
    assert!(governor.leases().is_empty());
    f.gate.register_governor_leases(&governor);
    assert_eq!(
        f.gate
            .lease_end(params, actor(), BUDGET, |_| async {
                panic!("ended lease cannot be sent again")
            })
            .await
            .unwrap_err()
            .code,
        ErrorCode::NotFound
    );
    f.clock.set("2026-10-25T12:01:00Z");
    assert!(governor.tick().unwrap().intents.is_empty());
    assert_eq!(f.gate.gate_roll().unwrap(), vec![decision]);
    drop(f.gate);
    let store = Store::open(f.root.path().join("store")).unwrap();
    let lines = store.read_ledger(LedgerKind::Decisions).unwrap();
    assert_eq!(lines.len(), 1);
    assert!(matches!(
        lines[0].event,
        LedgerEvent::Decision {
            user_id: None,
            action: cc_store::DecisionAction::ModeChanged,
            ..
        }
    ));
}

#[tokio::test]
async fn unknown_and_unregistered_ids_cannot_send_or_record() {
    let mut f = Fixture::new();
    let (governor, params) = issue(&mut f);
    let mut other = Fixture::new();
    for params in [
        params,
        LeaseEndParams {
            lease_id: LeaseId::mint(),
        },
    ] {
        assert_eq!(
            other
                .gate
                .lease_end(params, actor(), BUDGET, |_| async {
                    panic!("unregistered lease cannot be sent")
                })
                .await
                .unwrap_err()
                .code,
            ErrorCode::NotFound
        );
    }
    assert_eq!(governor.leases().len(), 1);
    assert!(other.gate.gate_roll().unwrap().is_empty());
    assert!(f.gate.gate_roll().unwrap().is_empty());
}

#[tokio::test]
async fn a_yielded_lease_is_refused_without_refreshing_the_registration() {
    for after_expiry in [false, true] {
        let mut f = Fixture::new();
        let (mut governor, params) = issue(&mut f);
        if after_expiry {
            f.clock.set("2026-10-25T12:01:00Z");
            assert_eq!(governor.tick().unwrap().intents.len(), 1);
        }
        governor.observe_human_change(RoomMode::EmoteOnly).unwrap();
        assert_eq!(
            f.gate
                .lease_end(params, actor(), BUDGET, |_| async {
                    panic!("human replacement must never be reverted")
                })
                .await
                .unwrap_err()
                .code,
            ErrorCode::Conflict
        );
        assert!(f.gate.gate_roll().unwrap().is_empty());
    }
}

#[tokio::test]
async fn timeout_and_confirmation_error_leave_live_leases_retryable_without_audit() {
    for timeout in [false, true] {
        let mut f = Fixture::new();
        let (governor, params) = issue(&mut f);
        let mut limited = ErrorEnvelope::new(ErrorCode::RateLimited, "simulated rate limit");
        limited.retry_after_ms = Some(1250);
        let failure = limited.clone();
        let err = f
            .gate
            .lease_end(
                params.clone(),
                actor(),
                Duration::from_millis(1),
                |_| async move {
                    if timeout {
                        pending::<()>().await;
                    }
                    Err(failure)
                },
            )
            .await
            .unwrap_err();
        if timeout {
            assert_eq!(err.code, ErrorCode::Unavailable);
        } else {
            assert_eq!(err, limited);
        }
        assert_eq!(governor.leases()[0].lease_id, params.lease_id);
        assert!(f.gate.gate_roll().unwrap().is_empty());
        f.gate
            .lease_end(params, actor(), BUDGET, |_| async { Ok(()) })
            .await
            .unwrap();
        assert!(governor.leases().is_empty());
        assert_eq!(f.gate.gate_roll().unwrap().len(), 1);
    }
}

#[tokio::test]
async fn unavailable_or_zero_budget_keeps_lease_without_sending() {
    for unavailable in [true, false] {
        let mut f = Fixture::new();
        let (governor, params) = issue(&mut f);
        f.gate.set_gate_available(!unavailable);
        let budget = if unavailable { BUDGET } else { Duration::ZERO };
        assert_eq!(
            f.gate
                .lease_end(params, actor(), budget, |_| async {
                    panic!("withheld end cannot be sent")
                })
                .await
                .unwrap_err()
                .code,
            ErrorCode::Unavailable
        );
        assert_eq!(governor.leases().len(), 1);
        assert!(f.gate.gate_roll().unwrap().is_empty());
    }
}

#[tokio::test]
async fn a_human_change_during_confirmation_prevents_recording_an_end() {
    let mut f = Fixture::new();
    let (mut governor, params) = issue(&mut f);
    let result = f
        .gate
        .lease_end(params.clone(), actor(), BUDGET, |_| async {
            governor.observe_human_change(RoomMode::EmoteOnly).unwrap();
            Ok(())
        })
        .await;
    assert_eq!(result.unwrap_err().code, ErrorCode::Conflict);
    assert!(governor.leases()[0].yielded);
    assert!(f.gate.gate_roll().unwrap().is_empty());
    assert_eq!(
        f.gate
            .lease_end(params, actor(), BUDGET, |_| async {
                panic!("human yielded lease cannot retry")
            })
            .await
            .unwrap_err()
            .code,
        ErrorCode::Conflict
    );
}

#[tokio::test]
async fn expired_end_keeps_its_id_and_can_be_registered_after_tick() {
    let mut f = Fixture::new();
    let (mut governor, params) = issue(&mut f);
    f.clock.set("2026-10-25T12:01:00Z");
    assert_eq!(
        governor.tick().unwrap().intents,
        vec![RoomModeIntent::End {
            lease_id: params.lease_id.clone(),
            mode: RoomMode::EmoteOnly,
        }]
    );
    assert!(governor.leases().is_empty());
    let mut other = Fixture::new();
    other.gate.register_governor_leases(&governor);
    other
        .gate
        .lease_end(params, actor(), BUDGET, |_| async { Ok(()) })
        .await
        .unwrap();
    assert_eq!(other.gate.gate_roll().unwrap().len(), 1);
}

#[tokio::test]
async fn restart_does_not_guess_room_lease_ownership() {
    let mut f = Fixture::new();
    let (_governor, params) = issue(&mut f);
    drop(f.gate);
    let mut gate = Gatehouse::with_clock(f.root.path(), f.clock).unwrap();
    assert_eq!(
        gate.lease_end(params, actor(), BUDGET, |_| async {
            panic!("restart has no known live lease")
        })
        .await
        .unwrap_err()
        .code,
        ErrorCode::NotFound
    );
    assert!(gate.gate_roll().unwrap().is_empty());
}

#[tokio::test]
async fn a_new_tier_lease_cannot_be_disabled_by_the_previous_leases_end() {
    let mut f = Fixture::new();
    let (mut governor, previous) = issue(&mut f);
    for id in 0..12 {
        governor
            .observe_chat(&offline_common::screened(
                offline_common::recorded(id, 0, "simulated tier change"),
                cc_types::Verdict::Pass,
            ))
            .unwrap();
    }
    governor.tick().unwrap();
    f.clock.set("2026-10-25T12:00:30Z");
    governor.tick().unwrap();
    f.clock.set("2026-10-25T12:01:00Z");
    governor.tick().unwrap();
    let next = governor.leases().remove(0);
    assert_ne!(next.lease_id, previous.lease_id);
    // Shared lifecycle invalidates the old End even before another registration.
    assert_eq!(
        f.gate
            .lease_end(previous, actor(), BUDGET, |_| async {
                panic!("obsolete end must not disable the replacement lease")
            })
            .await
            .unwrap_err()
            .code,
        ErrorCode::Conflict
    );
    assert!(f.gate.gate_roll().unwrap().is_empty());
    f.gate.register_governor_leases(&governor);
    f.gate
        .lease_end(
            LeaseEndParams {
                lease_id: next.lease_id,
            },
            actor(),
            BUDGET,
            |_| async { Ok(()) },
        )
        .await
        .unwrap();
    assert_eq!(f.gate.gate_roll().unwrap().len(), 1);
}

#[tokio::test]
async fn failed_audit_leaves_the_lease_live() {
    use std::io::Write;
    let mut f = Fixture::new();
    let (governor, params) = issue(&mut f);
    let mut ledger = std::fs::OpenOptions::new()
        .append(true)
        .open(f.root.path().join("store/decisions.jsonl"))
        .unwrap();
    ledger.write_all(b"simulated corrupt tail\n").unwrap();
    drop(ledger);
    assert!(
        f.gate
            .lease_end(params.clone(), actor(), BUDGET, |_| async { Ok(()) })
            .await
            .is_err()
    );
    assert_eq!(governor.leases()[0].lease_id, params.lease_id);
    assert!(f.gate.gate_roll().is_err());
}
