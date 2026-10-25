// Adapted from Shadowrunr OS @ 7e4b6f8,
// crates/shadowrunr-daemon/src/moderator/tests.rs (Apache-2.0; see NOTICE).
mod common;
use cc_gatehouse::{GatePath, Gatehouse};
use cc_store::{Purge, Store};
use cc_types::{Action, DecisionKind, DecisionParams, Verdict};
use common::*;
use std::io::Write;

#[tokio::test]
async fn expired_original_and_forgotten_viewer_never_produce_a_confirmation() {
    for forget in [false, true] {
        let mut f = Fixture::new();
        f.upsert(pattern("bad", Action::Ban));
        f.arm("bad");
        let pending = f
            .gate
            .screen_batch(
                vec![message(1, 100, "tagged ORIGINAL simulated")],
                &Fake::new("[]"),
            )
            .await
            .unwrap();
        let id = pending[0].decision.decision_id.clone();
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
            gate.ban_confirm(DecisionParams { decision_id: id })
                .is_err()
        );
    }
}

#[tokio::test]
async fn audit_failure_returns_no_successful_verdict_or_action_intent() {
    let mut f = Fixture::new();
    f.upsert(pattern("bad", Action::Delete));
    f.arm("bad");
    let mut ledger = std::fs::OpenOptions::new()
        .append(true)
        .open(f.root.path().join("store/decisions.jsonl"))
        .unwrap();
    ledger.write_all(b"simulated corrupt tail\n").unwrap();
    drop(ledger);
    let result = f
        .gate
        .screen_batch(vec![message(1, 100, "tagged")], &Fake::new("[]"))
        .await;
    assert!(result.is_err());
    assert!(
        f.gate
            .screen_batch(
                vec![message(2, 100, "ordinary simulated chat")],
                &Fake::new("[]")
            )
            .await
            .is_err()
    );
}

#[tokio::test]
async fn purging_the_store_revokes_logged_consent_even_if_rule_config_survives() {
    let mut f = Fixture::new();
    f.upsert(pattern("bad", Action::Delete));
    f.arm("bad");
    drop(f.gate);
    let mut store = Store::open(f.root.path().join("store")).unwrap();
    assert_eq!(
        store
            .preview(Purge::All, cc_store::Timestamp::parse(NOW).unwrap())
            .unwrap()
            .counts["decisions.jsonl"],
        1
    );
    store
        .purge_all(cc_store::Timestamp::parse(NOW).unwrap())
        .unwrap();
    drop(store);
    let mut gate = Gatehouse::with_clock(f.root.path(), f.clock).unwrap();
    let result = gate
        .screen_batch(vec![message(1, 100, "tagged")], &Fake::new("[]"))
        .await
        .unwrap();
    assert_eq!(result[0].path, GatePath::Shadow);
    assert!(result[0].intent.is_none());
}

#[tokio::test]
async fn care_state_is_retained_outside_recordings_and_failures_do_not_mean_clean() {
    let mut f = Fixture::new();
    f.upsert(pattern("bad", Action::Delete));
    f.arm("bad");
    f.gate
        .screen_batch(vec![message(1, 100, "I want to die")], &Fake::new("[]"))
        .await
        .unwrap();
    drop(f.gate);
    let mut store = Store::open(f.root.path().join("store")).unwrap();
    store
        .purge_expired(cc_store::Timestamp::parse("2026-12-25T12:00:00Z").unwrap())
        .unwrap();
    drop(store);
    let mut gate = Gatehouse::with_clock(f.root.path(), f.clock).unwrap();
    let result = gate
        .screen_batch(vec![message(2, 100, "tagged")], &Fake::new("[]"))
        .await
        .unwrap();
    assert_eq!(result[0].path, GatePath::Care);
    assert_eq!(result[0].decision.verdict, Verdict::Hold);
}

#[tokio::test]
async fn obfuscated_or_ambiguous_crisis_language_fails_toward_care() {
    let samples = [
        "[simulated] i want to d.i.e",
        "[simulated] I can't stay safe",
        "[simulated] I don't think I'll make it through tonight",
        "[simulated] I may not be here tomorrow",
        "[simulated] s.e.l.f h.a.r.m",
        "[simulated] I want it all to stop",
    ];
    let mut f = Fixture::new();
    let mut rule = pattern("bad", Action::Delete);
    rule.pattern = Some(".*".into());
    f.upsert(rule);
    f.arm("bad");
    for (i, sample) in samples.iter().enumerate() {
        let result = f
            .gate
            .screen_batch(vec![message(i, 100 + i as u64, sample)], &Fake::new("[]"))
            .await
            .unwrap();
        assert_eq!(result[0].decision.kind, DecisionKind::Held, "{sample}");
        assert_eq!(result[0].path, GatePath::Care);
        assert!(result[0].reaches_streamer);
    }
}
