mod gatehouse_support;

use cc_core::gatehouse::GatehouseModule;
use cc_store::Clock;
use cc_types::ErrorCode;
use gatehouse_support::*;
use serde_json::json;

#[tokio::test]
async fn seven_methods_round_trip_and_human_reviews_are_single_use() {
    let mut h = Harness::new();
    let mut expected = GatehouseModule::METHODS.to_vec();
    expected.sort();
    assert_eq!(h.registry.methods(), expected);
    let pending = h.seed_pending(4).await;
    let rules = rpc(&h.registry, "gatehouse.rules.list", json!({})).await;
    assert!(
        rules["rules"]
            .as_array()
            .unwrap()
            .iter()
            .any(|r| { r["rule_id"] == "simulated-ban" && r["mode"] == "armed" })
    );
    for decision in &pending {
        assert_eq!(decision["kind"], "ban_pending");
        assert_eq!(decision["verdict"], "hold");
        assert!(
            decision["message_text"]
                .as_str()
                .unwrap()
                .contains("simulated")
        );
    }
    let confirmed = rpc(&h.registry, "gatehouse.ban.confirm", params(&pending[0])).await;
    assert_eq!(confirmed["kind"], "banned");
    assert_eq!(confirmed["operator"], "human");
    let undone = rpc(&h.registry, "gatehouse.decision.undo", params(&confirmed)).await;
    assert_eq!(undone["kind"], "undone");
    assert_eq!(undone["verdict"], "pass");
    let dismissed = rpc(&h.registry, "gatehouse.ban.dismiss", params(&pending[1])).await;
    assert_eq!(dismissed["kind"], "released");
    for (index, outcome, kind) in [(2, "upheld", "held"), (3, "overturned", "undone")] {
        let banned = rpc(
            &h.registry,
            "gatehouse.ban.confirm",
            params(&pending[index]),
        )
        .await;
        let petition = json!({"decision_id": banned["decision_id"], "outcome": outcome});
        let resolved = rpc(&h.registry, "gatehouse.petition.resolve", petition.clone()).await;
        assert_eq!(resolved["kind"], kind);
        assert_eq!(
            failure(&h.registry, "gatehouse.petition.resolve", petition)
                .await
                .code,
            ErrorCode::Conflict
        );
    }
    for (method, decision) in [
        ("gatehouse.ban.confirm", &pending[0]),
        ("gatehouse.ban.dismiss", &pending[0]),
        ("gatehouse.ban.confirm", &pending[1]),
        ("gatehouse.ban.dismiss", &pending[1]),
        ("gatehouse.decision.undo", &confirmed),
    ] {
        assert_eq!(
            failure(&h.registry, method, params(decision)).await.code,
            ErrorCode::Conflict
        );
    }
}

#[tokio::test]
async fn every_method_rejects_invalid_params_with_contract_errors() {
    let h = Harness::new();
    for (method, valid) in requests() {
        let mut extra = valid.clone();
        extra["unexpected"] = json!(true);
        for invalid in [extra, json!(null), json!("invalid")] {
            assert_eq!(
                failure(&h.registry, method, invalid).await.code,
                ErrorCode::Invalid
            );
        }
        if method != "gatehouse.rules.list" {
            assert_eq!(
                failure(&h.registry, method, json!({})).await.code,
                ErrorCode::Invalid
            );
        }
    }
    let mut malformed_rule = rule();
    malformed_rule["pattern"] = json!("[");
    assert_eq!(
        failure(
            &h.registry,
            "gatehouse.rules.upsert",
            json!({"rule":malformed_rule})
        )
        .await
        .code,
        ErrorCode::Invalid
    );
    rpc(
        &h.registry,
        "gatehouse.rules.upsert",
        json!({"rule":rule()}),
    )
    .await;
    assert_eq!(
        failure(
            &h.registry,
            "gatehouse.rules.setMode",
            json!({"rule_id":"simulated-ban", "mode":"armed"})
        )
        .await
        .code,
        ErrorCode::Invalid
    );
    for (method, request) in requests().into_iter().skip(3) {
        assert_eq!(
            failure(&h.registry, method, request).await.code,
            ErrorCode::NotFound
        );
    }
}

#[tokio::test]
async fn rules_pending_and_resolved_decisions_survive_module_reopen() {
    let mut h = Harness::new();
    let pending = h.seed_pending(2).await;
    let rules = rpc(&h.registry, "gatehouse.rules.list", json!({})).await;
    h.reopen();
    assert_eq!(
        rpc(&h.registry, "gatehouse.rules.list", json!({})).await,
        rules
    );
    let banned = rpc(&h.registry, "gatehouse.ban.confirm", params(&pending[0])).await;
    h.reopen();
    assert_eq!(
        failure(&h.registry, "gatehouse.ban.dismiss", params(&pending[0]))
            .await
            .code,
        ErrorCode::Conflict
    );
    assert_eq!(
        rpc(&h.registry, "gatehouse.decision.undo", params(&banned)).await["kind"],
        "undone"
    );
    assert_eq!(
        rpc(&h.registry, "gatehouse.ban.dismiss", params(&pending[1])).await["kind"],
        "released"
    );
    h.reopen();
    assert_eq!(
        failure(&h.registry, "gatehouse.decision.undo", params(&banned))
            .await
            .code,
        ErrorCode::Conflict
    );
    assert_eq!(
        failure(&h.registry, "gatehouse.ban.confirm", params(&pending[1]))
            .await
            .code,
        ErrorCode::Conflict
    );
}

#[tokio::test]
async fn injected_clock_expires_review_toward_hold() {
    let mut h = Harness::new();
    let pending = h.seed_pending(1).await;
    *h.clock.0.lock().unwrap() = "2026-10-26T12:02:00Z".into();
    let held = rpc(&h.registry, "gatehouse.ban.confirm", params(&pending[0])).await;
    assert_eq!(held["kind"], "held");
    assert_eq!(held["verdict"], "hold");
    assert_eq!(held["at"], h.clock.now().as_rfc3339());
}
