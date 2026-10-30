use cc_engine::{
    Call, ConstructionError, Engine, EngineClass, Failure, NoKeychain, Outcome, SpawnDoor,
};
#[cfg(windows)]
use cc_engine::{EngineProvider, ModelName, RoutingTable};
#[cfg(windows)]
use cc_store::LedgerEvent;
use cc_store::{LedgerKind, Store};
use cc_types::{DataValue, Settings};

fn settings(provider: &str) -> Settings {
    let executable = env!("CARGO_BIN_EXE_fake-cli");
    let (path, model) = match provider {
        "claude_cli" => ("engine.claude_exe_path", "engine.model_claude"),
        "codex_cli" => ("engine.codex_exe_path", "engine.model_codex"),
        _ => unreachable!(),
    };
    Settings {
        values: [
            (
                "engine.cli_provider".into(),
                DataValue::String(provider.into()),
            ),
            (path.into(), DataValue::String(executable.into())),
            (model.into(), DataValue::String("simulated-selected".into())),
        ]
        .into(),
    }
}

fn construct(settings: &Settings, root: &std::path::Path) -> Result<Engine, ConstructionError> {
    Engine::from_settings(settings, SpawnDoor::new(root).unwrap(), 1)
}

fn error(settings: &Settings) -> ConstructionError {
    let dir = tempfile::tempdir().unwrap();
    construct(settings, dir.path())
        .err()
        .expect("construction must fail")
}

#[cfg(windows)]
#[tokio::test]
async fn claude_selected_builds_and_completes_with_only_its_path_and_model() {
    let dir = tempfile::tempdir().unwrap();
    let engine = construct(&settings("claude_cli"), &dir.path().join("process")).unwrap();
    complete_batch(&engine, dir.path(), EngineProvider::ClaudeCli).await;
}

#[test]
fn codex_selected_requires_posture_helper() {
    assert_eq!(
        error(&settings("codex_cli")),
        ConstructionError::MissingKeys(vec!["engine.posture_helper_path"])
    );
}

#[tokio::test]
async fn codex_selected_builds_with_its_path_model_and_helper() {
    let dir = tempfile::tempdir().unwrap();
    let mut settings = settings("codex_cli");
    settings.values.insert(
        "engine.posture_helper_path".into(),
        DataValue::String(env!("CARGO_BIN_EXE_fake-cli").into()),
    );
    let engine = construct(&settings, &dir.path().join("process")).unwrap();
    #[cfg(windows)]
    complete_batch(&engine, dir.path(), EngineProvider::CodexCli).await;
    #[cfg(not(windows))]
    drop(engine);
}

#[test]
fn empty_settings_report_default_selected_provider_keys_in_stable_order() {
    let settings = Settings {
        values: Default::default(),
    };
    let error = error(&settings);
    assert_eq!(
        error,
        ConstructionError::MissingKeys(vec!["engine.claude_exe_path", "engine.model_claude"])
    );
    assert_eq!(
        error.to_string(),
        "missing engine settings: engine.claude_exe_path, engine.model_claude"
    );
}

#[test]
fn codex_missing_keys_are_complete_stable_and_selected_provider_only() {
    let settings = Settings {
        values: [(
            "engine.cli_provider".into(),
            DataValue::String("codex_cli".into()),
        )]
        .into(),
    };
    assert_eq!(
        error(&settings),
        ConstructionError::MissingKeys(vec![
            "engine.codex_exe_path",
            "engine.model_codex",
            "engine.posture_helper_path"
        ])
    );
}

#[test]
fn missing_key_display_and_debug_contain_only_keys_never_setting_values() {
    let mut settings = settings("claude_cli");
    settings.values.remove("engine.model_claude");
    settings.values.insert(
        "engine.live_endpoint".into(),
        DataValue::String("http://127.0.0.1:1/simulated-endpoint".into()),
    );
    settings.values.insert(
        "engine.model_codex".into(),
        DataValue::String("simulated-unused-model".into()),
    );
    let error = error(&settings);
    assert_eq!(
        error,
        ConstructionError::MissingKeys(vec!["engine.model_claude"])
    );
    let display = error.to_string();
    let debug = format!("{error:?}");
    // Boolean assertions keep even a regression from echoing settings into output.
    for value in settings.values.values() {
        if let DataValue::String(value) = value {
            assert!(!display.contains(value));
            assert!(!debug.contains(value));
        }
    }
}

#[tokio::test]
async fn missing_lane_model_fails_at_call_time_without_inference_or_audit() {
    let dir = tempfile::tempdir().unwrap();
    let engine = construct(&settings("claude_cli"), &dir.path().join("process")).unwrap();
    let mut store = Store::open(dir.path().join("store")).unwrap();
    for class in [EngineClass::Live, EngineClass::NearLive] {
        let result = engine
            .complete(
                Call {
                    class,
                    prompt: "simulated request",
                    rules_verdict: None,
                },
                &mut store,
                &NoKeychain,
                None,
            )
            .await;
        assert!(matches!(
            result,
            Err(Failure::MissingModel("engine.model_local"))
        ));
    }
    assert!(store.read_ledger(LedgerKind::Engine).unwrap().is_empty());
}

#[tokio::test]
async fn settings_constructor_keeps_endpoint_admission_and_cloud_authorization() {
    let dir = tempfile::tempdir().unwrap();
    let mut store = Store::open(dir.path().join("store")).unwrap();
    for (index, (endpoint, reason)) in [
        ("http://127.0.0.1:1/v1", Failure::NotAdmitted),
        ("https://api.openai.com/v1", Failure::CloudOptIn),
    ]
    .into_iter()
    .enumerate()
    {
        let mut settings = settings("claude_cli");
        settings.values.insert(
            "engine.model_local".into(),
            DataValue::String("simulated-local".into()),
        );
        settings.values.insert(
            "engine.live_endpoint".into(),
            DataValue::String(endpoint.into()),
        );
        let engine = construct(&settings, &dir.path().join(format!("process-{index}"))).unwrap();
        let reply = engine
            .complete(
                Call {
                    class: EngineClass::Live,
                    prompt: "simulated request",
                    rules_verdict: None,
                },
                &mut store,
                &NoKeychain,
                None,
            )
            .await
            .unwrap();
        assert_eq!(reply.outcome, Outcome::Refused { reason });
    }
    assert_eq!(store.read_ledger(LedgerKind::Engine).unwrap().len(), 2);
}

#[test]
fn invalid_settings_fail_without_echoing_values() {
    let mut settings = settings("claude_cli");
    settings.values.insert(
        "engine.cli_provider".into(),
        DataValue::String("simulated-invalid-provider".into()),
    );
    let error = error(&settings);
    assert_eq!(error, ConstructionError::InvalidSettings);
    assert!(!error.to_string().contains("simulated-invalid-provider"));
    assert!(!format!("{error:?}").contains("simulated-invalid-provider"));
}

#[cfg(windows)]
#[tokio::test]
async fn legacy_routing_and_engine_constructors_keep_their_behavior() {
    let dir = tempfile::tempdir().unwrap();
    // Legacy callers need not put models or paths in the settings map.
    let settings = Settings {
        values: Default::default(),
    };
    let model = ModelName::parse("simulated-selected").unwrap();
    let executable = std::path::PathBuf::from(env!("CARGO_BIN_EXE_fake-cli"));
    let cli = cc_engine::CliRuntime::new(
        SpawnDoor::new(dir.path().join("process")).unwrap(),
        cc_engine::CliExecutables {
            claude: executable.clone(),
            codex: executable.clone(),
            posture_probe: executable,
        },
        1,
    )
    .unwrap();
    let engine = Engine::new(
        &settings,
        RoutingTable::new(model.clone(), model.clone(), model),
        Some(cli),
    )
    .unwrap();
    complete_batch(&engine, dir.path(), EngineProvider::ClaudeCli).await;
}

#[cfg(windows)]
async fn complete_batch(engine: &Engine, root: &std::path::Path, provider: EngineProvider) {
    let mut store = Store::open(root.join("store")).unwrap();
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
    assert!(matches!(reply.outcome, Outcome::Model { text } if text == "simulated answer"));
    let rows = store.read_ledger(LedgerKind::Engine).unwrap();
    assert_eq!(rows.len(), 1);
    assert!(matches!(&rows[0].event, LedgerEvent::Engine {
        provider: selected, model_selected, ..
    } if *selected == provider && model_selected.as_str() == "simulated-selected"));
}
