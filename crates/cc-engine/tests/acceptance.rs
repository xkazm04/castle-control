mod common;
use cc_engine::{
    Call, Engine, EngineClass, EngineProvider, Failure, NoKeychain, Outcome, Prices, Route,
    Transport,
};
use cc_store::{LedgerEvent, LedgerKind, Store};
use cc_types::Verdict;

#[tokio::test]
async fn cli_never_runs_on_live_lane() {
    let dir = tempfile::tempdir().unwrap();
    let mut routes = common::table();
    for class in [EngineClass::Live, EngineClass::NearLive] {
        assert_eq!(
            routes
                .set(Route {
                    class,
                    model: common::model(),
                    transport: Transport::Cli,
                    prices: Prices::default(),
                    evidence: None
                })
                .unwrap_err(),
            Failure::CliOnLive
        );
    }
    let engine = Engine::new(
        &common::settings("claude_cli", "http://127.0.0.1:1/v1"),
        routes,
        None,
    )
    .unwrap();
    let mut store = Store::open(dir.path()).unwrap();
    let reply = engine
        .complete(
            Call {
                class: EngineClass::Live,
                prompt: "simulated chat",
                rules_verdict: Some(Verdict::Hold),
            },
            &mut store,
            &NoKeychain,
            None,
        )
        .await
        .unwrap();
    assert!(matches!(
        reply.outcome,
        Outcome::RulesOnly {
            reason: Failure::NotAdmitted,
            ..
        }
    ));
    let records = store.read_ledger(LedgerKind::Engine).unwrap();
    assert!(matches!(
        records[0].event,
        LedgerEvent::Engine {
            provider: EngineProvider::LocalEndpoint,
            ..
        }
    ));
}

#[cfg(windows)]
#[tokio::test]
async fn both_cli_backends_share_contract_and_settings_switch_call_sites() {
    for provider in ["claude_cli", "codex_cli"] {
        let dir = tempfile::tempdir().unwrap();
        let engine = common::engine(provider, &dir.path().join("process"));
        let mut store = Store::open(dir.path().join("store")).unwrap();
        let reply = engine
            .complete(
                Call {
                    class: EngineClass::Batch,
                    prompt: "simulated request",
                    rules_verdict: None,
                },
                &mut store,
                &NoKeychain,
                None,
            )
            .await
            .unwrap();
        assert!(matches!(&reply.outcome, Outcome::Model { text } if text == "simulated answer"));
        assert_eq!(reply.thread_id.as_deref(), Some("simulated-thread"));
        let rows = store.read_ledger(LedgerKind::Engine).unwrap();
        match &rows[0].event {
            LedgerEvent::Engine {
                call_id,
                class,
                provider: recorded,
                model_selected,
                model_served,
                ..
            } => {
                assert_eq!(*call_id, reply.call_id);
                assert_eq!(*class, EngineClass::Batch);
                let expected = if provider == "claude_cli" {
                    EngineProvider::ClaudeCli
                } else {
                    EngineProvider::CodexCli
                };
                assert_eq!(*recorded, expected);
                assert_eq!(model_selected.as_str(), "simulated-selected");
                assert_eq!(model_served.as_ref().unwrap().as_str(), "simulated-served");
            }
            _ => panic!("wrong ledger"),
        }
        for prompt in [
            "simulated failure",
            "simulated malformed",
            "simulated nonzero",
            "simulated overflow",
        ] {
            let reply = engine
                .complete(
                    Call {
                        class: EngineClass::Offline,
                        prompt,
                        rules_verdict: None,
                    },
                    &mut store,
                    &NoKeychain,
                    None,
                )
                .await
                .unwrap();
            assert_eq!(reply.outcome.label(), "refused", "{provider}: {prompt}");
        }
        let rows = store.read_ledger(LedgerKind::Engine).unwrap();
        assert_eq!(rows.len(), 5);
        for row in &rows[1..] {
            assert!(matches!(
                row.event,
                LedgerEvent::Engine {
                    model_served: None,
                    ..
                }
            ));
            assert!(!serde_json::to_string(row).unwrap().contains("null"));
        }
    }
}

#[cfg(windows)]
#[test]
fn parent_sentinel_is_invisible_and_only_keychain_child_receives_key() {
    let dir = tempfile::tempdir().unwrap();
    let status = std::process::Command::new(env!("CARGO_BIN_EXE_fake-cli"))
        .args(["supervise", dir.path().to_str().unwrap()])
        .env(
            "CC_PARENT_SENTINEL",
            format!("{}-{}", "simulated", "sentinel"),
        )
        .env("CLAUDE_CODE_PLUGIN_DIRS", "simulated-plugin-directory")
        .env("OPENAI_API_KEY", format!("{}-{}", "simulated", "ambient"))
        .status()
        .unwrap();
    assert!(status.success());
    // Source inventory proves no auth file reader, not merely no observed read today.
    for source in [
        include_str!("../src/process.rs"),
        include_str!("../src/cli.rs"),
        include_str!("../src/health.rs"),
        include_str!("../src/codex_cli.rs"),
    ] {
        assert!(!source.contains(&["auth", ".json"].concat()));
    }
}

#[tokio::test]
async fn ledger_records_class_selected_served_and_cost_for_every_call() {
    let mut responses: Vec<_> = ["pass", "hold", "bar", "bar", "pass", "hold"]
        .into_iter()
        .map(|v| (200, common::local_answer(v)))
        .collect();
    responses.extend([(200, common::local_answer("pass")), (503, "{}".into())]);
    let server = common::Server::new(responses);
    let mut routes = common::table();
    let measuring = tempfile::tempdir().unwrap();
    let mut measuring_store = Store::open(measuring.path()).unwrap();
    let evidence = cc_engine::measure_floor(
        &common::settings("claude_cli", &server.endpoint),
        &common::model(),
        &cc_engine::simulated_bank(),
        &mut measuring_store,
    )
    .await
    .unwrap()
    .evidence;
    routes
        .set(Route {
            class: EngineClass::Live,
            model: common::model(),
            transport: Transport::Endpoint,
            prices: Prices {
                input: 1_000_000,
                output: 2_000_000,
            },
            evidence: Some(evidence),
        })
        .unwrap();
    let engine = Engine::new(
        &common::settings("claude_cli", &server.endpoint),
        routes,
        None,
    )
    .unwrap();
    let dir = tempfile::tempdir().unwrap();
    let mut store = Store::open(dir.path()).unwrap();
    for _ in 0..2 {
        engine
            .complete(
                Call {
                    class: EngineClass::Live,
                    prompt: "simulated data",
                    rules_verdict: Some(Verdict::Pass),
                },
                &mut store,
                &NoKeychain,
                None,
            )
            .await
            .unwrap();
    }
    let rows = store.read_ledger(LedgerKind::Engine).unwrap();
    assert_eq!(rows.len(), 2);
    match &rows[0].event {
        LedgerEvent::Engine {
            class,
            provider,
            model_selected,
            model_served,
            cost_microusd,
            ..
        } => {
            assert_eq!(*class, EngineClass::Live);
            assert_eq!(*provider, EngineProvider::LocalEndpoint);
            assert_eq!(model_selected.as_str(), "simulated-selected");
            assert_eq!(model_served.as_ref().unwrap().as_str(), "simulated-served");
            assert_eq!(*cost_microusd, 50);
        }
        _ => panic!("wrong ledger"),
    }
    assert!(matches!(
        rows[1].event,
        LedgerEvent::Engine {
            model_served: None,
            cost_microusd: 0,
            ..
        }
    ));
}

#[tokio::test]
async fn unavailable_model_continues_rules_only_and_no_rules_refuses() {
    let dir = tempfile::tempdir().unwrap();
    let engine = Engine::new(
        &common::settings("codex_cli", "http://127.0.0.1:1/v1"),
        common::table(),
        None,
    )
    .unwrap();
    let mut store = Store::open(dir.path()).unwrap();
    let with_rules = engine
        .complete(
            Call {
                class: EngineClass::Live,
                prompt: "simulated",
                rules_verdict: Some(Verdict::Bar),
            },
            &mut store,
            &NoKeychain,
            None,
        )
        .await
        .unwrap();
    assert_eq!(with_rules.outcome.label(), "rules-only");
    assert!(matches!(
        with_rules.outcome,
        Outcome::RulesOnly {
            verdict: Verdict::Bar,
            ..
        }
    ));
    let without_rules = engine
        .complete(
            Call {
                class: EngineClass::Live,
                prompt: "simulated",
                rules_verdict: None,
            },
            &mut store,
            &NoKeychain,
            None,
        )
        .await
        .unwrap();
    assert_eq!(without_rules.outcome.label(), "refused");
    for row in store.read_ledger(LedgerKind::Engine).unwrap() {
        assert!(matches!(
            row.event,
            LedgerEvent::Engine {
                model_served: None,
                ..
            }
        ));
    }
}
