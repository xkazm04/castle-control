// Adapted from Shadowrunr OS @ 7e4b6f8,
// crates/shadowrunr-daemon/src/moderator/tests.rs (Apache-2.0; see NOTICE).
mod common;
use cc_gatehouse::{GatePath, Gatehouse};
use cc_store::{LedgerEvent, LedgerKind, Store};
use cc_types::{
    Action, AutoBanGrant, DecisionKind, DecisionParams, Empty, ErrorCode, PetitionOutcome,
    PetitionResolveParams, RulesUpsertParams, Verdict,
};
use common::*;

fn grant(expires: &str, limit: u32) -> AutoBanGrant {
    AutoBanGrant {
        expires_at: at(expires),
        max_bans_per_hour: limit.try_into().unwrap(),
        breaker_tripped: false,
    }
}

#[tokio::test]
async fn pending_ban_survives_restart_with_original_text_and_ids_only_ledger() {
    let mut f = Fixture::new();
    f.upsert(pattern("bad", Action::Ban));
    f.arm("bad");
    let original = "tagged [simulated ORIGINAL; not a summary]";
    let result = f
        .gate
        .screen_batch(vec![message(1, 100, original)], &Fake::new("[]"))
        .await
        .unwrap();
    assert_eq!(result[0].decision.kind, DecisionKind::BanPending);
    assert_eq!(result[0].decision.message_text.as_deref(), Some(original));
    assert!(result[0].intent.is_none());
    let pending_id = result[0].decision.decision_id.clone();
    drop(f.gate);
    let mut gate = Gatehouse::with_clock(f.root.path(), f.clock).unwrap();
    let queue = gate.pending_bans().unwrap();
    assert_eq!(queue.len(), 1);
    assert_eq!(queue[0].message_text.as_deref(), Some(original));
    let confirmed = gate
        .ban_confirm(DecisionParams {
            decision_id: pending_id.clone(),
        })
        .unwrap();
    assert_eq!(confirmed.kind, DecisionKind::Banned);
    assert!(gate.pending_bans().unwrap().is_empty());
    assert_eq!(
        gate.ban_confirm(DecisionParams {
            decision_id: pending_id
        })
        .unwrap_err()
        .code,
        ErrorCode::Conflict
    );
    drop(gate);
    let store = Store::open(f.root.path().join("store")).unwrap();
    let ledger = store.read_ledger(LedgerKind::Decisions).unwrap();
    assert_eq!(ledger.len(), 3); // acknowledgement, pending, confirmed
    for line in ledger {
        assert!(matches!(line.event, LedgerEvent::Decision { .. }));
    }
    let text = std::fs::read_to_string(f.root.path().join("store/decisions.jsonl")).unwrap();
    assert!(!text.contains("ORIGINAL"));
    assert!(!text.contains("message_text"));
    assert!(!text.contains("sim_100"));
    let config = std::fs::read_to_string(f.root.path().join("rules.json")).unwrap();
    assert!(config.contains("Simulated test consent"));
}

#[tokio::test]
async fn review_timeout_and_unavailable_gate_hold_never_approve() {
    for unavailable in [false, true] {
        let mut f = Fixture::new();
        f.upsert(pattern("bad", Action::Ban));
        f.arm("bad");
        let pending = f
            .gate
            .screen_batch(vec![message(1, 100, "tagged")], &Fake::new("[]"))
            .await
            .unwrap();
        if unavailable {
            f.gate.set_gate_available(false);
        } else {
            f.clock.set("2026-10-25T12:02:00Z");
        }
        let result = f
            .gate
            .ban_confirm(DecisionParams {
                decision_id: pending[0].decision.decision_id.clone(),
            })
            .unwrap();
        assert_eq!(result.kind, DecisionKind::Held);
        assert_eq!(result.verdict, Verdict::Hold);
    }
}

#[tokio::test]
async fn changed_rule_or_new_care_invalidates_pending_approval() {
    for care in [false, true] {
        let mut f = Fixture::new();
        f.upsert(pattern("bad", Action::Ban));
        f.arm("bad");
        let pending = f
            .gate
            .screen_batch(vec![message(1, 100, "tagged")], &Fake::new("[]"))
            .await
            .unwrap();
        if care {
            f.gate
                .screen_batch(vec![message(2, 100, "I am in crisis")], &Fake::new("[]"))
                .await
                .unwrap();
        } else {
            f.upsert(pattern("bad", Action::Ban));
        }
        assert_eq!(
            f.gate
                .ban_confirm(DecisionParams {
                    decision_id: pending[0].decision.decision_id.clone()
                })
                .unwrap()
                .kind,
            DecisionKind::Held
        );
    }
}

#[tokio::test]
async fn dismiss_undo_and_petition_outcomes_are_durable_and_not_repeatable() {
    let mut f = Fixture::new();
    f.upsert(pattern("bad", Action::Ban));
    f.arm("bad");
    let result = f
        .gate
        .screen_batch(vec![message(1, 100, "tagged")], &Fake::new("[]"))
        .await
        .unwrap();
    let dismissed = f
        .gate
        .ban_dismiss(DecisionParams {
            decision_id: result[0].decision.decision_id.clone(),
        })
        .unwrap();
    assert_eq!(dismissed.kind, DecisionKind::Released);
    assert!(f.gate.pending_bans().unwrap().is_empty());
    f.upsert(pattern("bad", Action::Timeout));
    f.arm("bad");
    for (id, outcome) in [
        (2, PetitionOutcome::Upheld),
        (3, PetitionOutcome::Overturned),
    ] {
        let action = f
            .gate
            .screen_batch(vec![message(id, 100, "tagged")], &Fake::new("[]"))
            .await
            .unwrap();
        let params = PetitionResolveParams {
            decision_id: action[0].decision.decision_id.clone(),
            outcome,
        };
        let petition = f.gate.petition_resolve(params.clone()).unwrap();
        assert_eq!(
            petition.kind,
            if outcome == PetitionOutcome::Overturned {
                DecisionKind::Undone
            } else {
                DecisionKind::Held
            }
        );
        assert!(f.gate.petition_resolve(params).is_err());
    }
    let action = f
        .gate
        .screen_batch(vec![message(4, 100, "tagged")], &Fake::new("[]"))
        .await
        .unwrap();
    assert_eq!(
        f.gate
            .decision_undo(DecisionParams {
                decision_id: action[0].decision.decision_id.clone()
            })
            .unwrap()
            .kind,
        DecisionKind::Undone
    );
}

#[tokio::test]
async fn auto_ban_requires_scoped_logged_unexpired_pattern_grant_and_hourly_ceiling() {
    let mut f = Fixture::new();
    let mut rule = pattern("bad", Action::Ban);
    rule.auto_ban_grant = Some(grant("2026-10-25T14:00:00Z", 1));
    f.upsert(rule);
    let fake = Fake::new("[]");
    let shadow = f
        .gate
        .screen_batch(vec![message(1, 100, "tagged")], &fake)
        .await
        .unwrap();
    assert_eq!(shadow[0].path, GatePath::Shadow);
    f.arm("bad");
    let first = f
        .gate
        .screen_batch(vec![message(2, 100, "tagged")], &fake)
        .await
        .unwrap();
    assert_eq!(first[0].decision.kind, DecisionKind::Banned);
    drop(f.gate);
    let mut gate = Gatehouse::with_clock(f.root.path(), f.clock.clone()).unwrap();
    let next = gate
        .screen_batch(vec![message(3, 101, "tagged")], &fake)
        .await
        .unwrap();
    assert_eq!(next[0].decision.kind, DecisionKind::BanPending);
    assert!(
        gate.rules_list(Empty {})
            .unwrap()
            .rules
            .iter()
            .find(|r| r.rule_id.as_str() == "bad")
            .unwrap()
            .auto_ban_grant
            .as_ref()
            .unwrap()
            .breaker_tripped
    );
    // The circuit breaker stays tripped even after its hourly window has passed.
    f.clock.set("2026-10-25T13:01:00Z");
    let next = gate
        .screen_batch(vec![message(4, 102, "tagged")], &fake)
        .await
        .unwrap();
    assert_eq!(next[0].decision.kind, DecisionKind::BanPending);
}

#[tokio::test]
async fn expired_or_tripped_grant_and_classifier_bans_require_human_click() {
    for tripped in [false, true] {
        let mut f = Fixture::new();
        let mut rule = pattern("bad", Action::Ban);
        let mut g = grant(if tripped { "2026-10-25T13:00:00Z" } else { NOW }, 10);
        g.breaker_tripped = tripped;
        rule.auto_ban_grant = Some(g);
        f.upsert(rule);
        f.arm("bad");
        let result = f
            .gate
            .screen_batch(vec![message(1, 100, "tagged")], &Fake::new("[]"))
            .await
            .unwrap();
        assert_eq!(result[0].decision.kind, DecisionKind::BanPending);
    }
    let mut f = Fixture::new();
    let mut rule = plain(Action::Ban);
    rule.auto_ban_grant = Some(grant("2026-10-25T13:00:00Z", 10));
    assert!(f.gate.rules_upsert(RulesUpsertParams { rule }).is_err());
    f.upsert(plain(Action::Ban));
    f.arm("classifier");
    let fake = Fake::new(r#"[{"msg_id":"m1","rule_id":"classifier","verdict":"bar"}]"#);
    let result = f
        .gate
        .screen_batch(vec![message(1, 100, "tagged")], &fake)
        .await
        .unwrap();
    assert_eq!(result[0].decision.kind, DecisionKind::BanPending);
}

#[tokio::test]
async fn erasing_a_viewer_cannot_reset_the_hourly_auto_ban_ceiling() {
    let mut f = Fixture::new();
    let mut rule = pattern("bad", Action::Ban);
    rule.auto_ban_grant = Some(grant("2026-10-25T13:00:00Z", 1));
    f.upsert(rule);
    f.arm("bad");
    let fake = Fake::new("[]");
    f.gate
        .screen_batch(vec![message(1, 100, "tagged")], &fake)
        .await
        .unwrap();
    drop(f.gate);
    let mut store = Store::open(f.root.path().join("store")).unwrap();
    store
        .forget_user("sim_100", cc_store::Timestamp::parse(NOW).unwrap())
        .unwrap();
    drop(store);
    let mut gate = Gatehouse::with_clock(f.root.path(), f.clock).unwrap();
    let result = gate
        .screen_batch(vec![message(2, 101, "tagged")], &fake)
        .await
        .unwrap();
    assert_eq!(result[0].decision.kind, DecisionKind::BanPending);
}
