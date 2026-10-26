#![cfg(windows)]
mod common;

use cc_engine::{
    Call, Engine, EngineClass, EngineProvider, NoKeychain, Outcome, Prices, Route, Transport,
};
use cc_store::{LedgerEvent, LedgerKind, Store};
use cc_types::{Writ, WritStatus};
use serde_json::Value;

#[tokio::test]
async fn steward_writ_ok_returns_shared_proposal_and_audits_cost() {
    check_scenario("writ-ok", |text| {
        let writ: Writ = serde_json::from_str(text).unwrap();
        let fixtures: Vec<Writ> =
            serde_json::from_str(include_str!("../../cc-types/tests/fixtures/steward.json"))
                .unwrap();
        assert_eq!(writ, fixtures[0]);
        assert_eq!(writ.status, WritStatus::Proposed);
    })
    .await;
}

#[tokio::test]
async fn steward_schema_invalid_remains_answer_for_caller_to_reject() {
    check_scenario("writ-schema-invalid", |text| {
        let value: Value = serde_json::from_str(text).unwrap();
        assert_eq!(value["chamber"], "beacons");
        assert_eq!(value["proposal"]["method"], "lots.draw.upsert");
        assert!(serde_json::from_str::<Writ>(text).is_err());
    })
    .await;
}

#[tokio::test]
async fn steward_malformed_remains_answer_for_caller_to_reject() {
    check_scenario("writ-malformed", |text| {
        assert_eq!(text, "simulated malformed writ");
        assert!(serde_json::from_str::<Value>(text).is_err());
        assert!(serde_json::from_str::<Writ>(text).is_err());
    })
    .await;
}

async fn check_scenario(scenario: &str, check_answer: fn(&str)) {
    for provider in ["codex_cli", "claude_cli"] {
        for class in [EngineClass::Batch, EngineClass::Offline] {
            let dir = tempfile::tempdir().unwrap();
            let mut routes = common::table();
            routes
                .set(Route {
                    class,
                    model: common::model(),
                    transport: Transport::Cli,
                    prices: Prices {
                        input: 1_000_000,
                        output: 3_000_000,
                    },
                    evidence: None,
                })
                .unwrap();
            let settings = common::settings(provider, "http://127.0.0.1:1/v1");
            let engine = Engine::new(
                &settings,
                routes,
                Some(common::cli(&dir.path().join("process"))),
            )
            .unwrap();
            let mut store = Store::open(dir.path().join("store")).unwrap();
            let prompt = format!("Simulated Steward request\ncc-fake-scenario:{scenario}\nEnd.");
            // An unmarked call remains the original answer and has identical billing.
            for (index, prompt) in ["simulated request", prompt.as_str()]
                .into_iter()
                .enumerate()
            {
                let reply = engine
                    .complete(
                        Call {
                            class,
                            prompt,
                            rules_verdict: None,
                        },
                        &mut store,
                        &NoKeychain,
                        None,
                    )
                    .await
                    .unwrap();
                let Outcome::Model { text } = &reply.outcome else {
                    panic!("{provider}: {scenario} must return answer text");
                };
                if index == 0 {
                    assert_eq!(text, "simulated answer");
                } else {
                    check_answer(text);
                }
                assert_eq!(reply.thread_id.as_deref(), Some("simulated-thread"));
                let rows = store.read_ledger(LedgerKind::Engine).unwrap();
                assert_eq!(rows.len(), index + 1);
                let LedgerEvent::Engine {
                    call_id,
                    class: recorded_class,
                    provider: recorded_provider,
                    model_selected,
                    model_served,
                    cost_microusd,
                } = &rows[index].event
                else {
                    panic!("expected engine audit");
                };
                assert_eq!(*call_id, reply.call_id);
                assert_eq!(*recorded_class, class);
                let (expected_provider, expected_cost) = if provider == "codex_cli" {
                    (EngineProvider::CodexCli, 70)
                } else {
                    (EngineProvider::ClaudeCli, 50)
                };
                assert_eq!(*recorded_provider, expected_provider);
                assert_eq!(model_selected.as_str(), "simulated-selected");
                assert_eq!(model_served.as_ref().unwrap().as_str(), "simulated-served");
                assert_eq!(*cost_microusd, expected_cost);
                let audit = serde_json::to_string(&rows[index]).unwrap();
                assert!(!audit.contains(prompt));
                assert!(!audit.contains(text));
                // Slow-lane answers are data, including malformed proposals; no actions.
                for kind in [LedgerKind::Decisions, LedgerKind::Draws] {
                    assert!(store.read_ledger(kind).unwrap().is_empty());
                }
            }
        }
    }
}
