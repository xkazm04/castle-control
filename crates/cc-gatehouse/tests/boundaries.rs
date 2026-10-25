// Adapted from Shadowrunr OS @ 7e4b6f8,
// crates/shadowrunr-daemon/src/moderator/tests.rs (Apache-2.0; see NOTICE).
mod common;
use async_trait::async_trait;
use cc_gatehouse::{Classifier, ClassifierError, GatePath};
use cc_types::{Action, AutoBanGrant, DecisionKind};
use common::*;

struct Never;
#[async_trait]
impl Classifier for Never {
    async fn classify(&self, _: &str, _: &str) -> Result<String, ClassifierError> {
        std::future::pending().await
    }
}

#[tokio::test]
async fn classifier_timeout_is_withheld_and_not_a_clean_gate() {
    let mut f = Fixture::new();
    f.upsert(plain(Action::Delete));
    f.arm("classifier");
    let result = f
        .gate
        .screen_batch(vec![message(1, 100, "ordinary simulated chat")], &Never)
        .await
        .unwrap();
    assert_eq!(result[0].path, GatePath::Withheld);
    assert!(result[0].intent.is_none());
}

#[tokio::test]
async fn pattern_grant_is_scoped_and_cannot_authorize_another_rule() {
    let mut f = Fixture::new();
    let mut granted = pattern("alpha", Action::Ban);
    granted.pattern = Some("alpha".into());
    granted.auto_ban_grant = Some(AutoBanGrant {
        expires_at: at("2026-10-25T13:00:00Z"),
        max_bans_per_hour: 10.try_into().unwrap(),
        breaker_tripped: false,
    });
    f.upsert(granted);
    f.arm("alpha");
    let mut ungranted = pattern("beta", Action::Ban);
    ungranted.pattern = Some("beta".into());
    f.upsert(ungranted);
    f.arm("beta");
    let result = f
        .gate
        .screen_batch(vec![message(1, 100, "beta")], &Fake::new("[]"))
        .await
        .unwrap();
    assert_eq!(result[0].decision.kind, DecisionKind::BanPending);
}

#[tokio::test]
async fn human_and_classifier_paths_are_reported_separately_in_ledger_summary() {
    let mut f = Fixture::new();
    f.upsert(pattern("pattern", Action::Ban));
    f.arm("pattern");
    f.upsert(plain(Action::Delete));
    f.arm("classifier");
    let reply = Fake::new(r#"[{"msg_id":"m1","rule_id":"classifier","verdict":"bar"}]"#);
    let result = f
        .gate
        .screen_batch(
            vec![
                message(1, 100, "tagged"),
                message(2, 101, "ordinary simulated chat"),
            ],
            &reply,
        )
        .await
        .unwrap();
    f.gate
        .ban_dismiss(cc_types::DecisionParams {
            decision_id: result[0].decision.decision_id.clone(),
        })
        .unwrap();
    let summary = f.gate.ledger_summary().unwrap();
    assert_eq!(summary["ban_pending"], 1);
    assert_eq!(summary["classifier_action"], 1);
    assert_eq!(summary["human_review"], 1);
    assert_eq!(summary["unmeasured_or_configuration"], 2);
}
