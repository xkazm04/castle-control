use cc_types::*;
use serde_json::{Value, json};

fn settings(values: Value) -> Settings {
    serde_json::from_value(json!({"values":values})).unwrap()
}

#[test]
fn defaults_are_local_cloud_off_and_development_cli_provider() {
    assert_eq!(
        parse_engine_settings(&settings(json!({}))).unwrap(),
        EngineSettings::default()
    );
    let default = EngineSettings::default();
    assert_eq!(default.cli_provider, CliProvider::ClaudeCli);
    assert_eq!(default.live_endpoint, "http://127.0.0.1:11434/v1");
    assert!(!default.cloud_opt_in);
    assert_eq!(
        parse_engine_settings(&settings(json!({"unrelated":"simulated"}))).unwrap(),
        default
    );
}

#[test]
fn typed_parser_reads_all_keys_without_changing_call_sites() {
    for provider in ["claude_cli", "codex_cli"] {
        for endpoint in [
            "http://localhost:1234/v1",
            "http://[::1]:11434/v1",
            "http://127.0.0.1:11434/v1",
            "https://api.openai.com/v1",
            "https://example.test/v1?mode=simulated%20test",
        ] {
            let parsed = parse_engine_settings(&settings(json!({
                "engine.cli_provider":provider, "engine.live_endpoint":endpoint, "engine.cloud_opt_in":true
            }))).unwrap();
            assert_eq!(
                serde_json::to_value(parsed.cli_provider).unwrap(),
                json!(provider)
            );
            assert_eq!(parsed.live_endpoint, endpoint);
            assert!(parsed.cloud_opt_in);
        }
    }
}

#[test]
fn invalid_values_produce_invalid_envelopes_without_echoing_input() {
    for (key, values) in [
        (
            "engine.cli_provider",
            vec![json!("unknown"), json!(true), json!({}), json!(1)],
        ),
        (
            "engine.cloud_opt_in",
            vec![json!("true"), json!(0), json!([])],
        ),
        (
            "engine.live_endpoint",
            vec![
                json!(false),
                json!(42),
                json!(""),
                json!("not-a-url"),
                json!("ftp://localhost"),
                json!("http://"),
                json!("http://localhost:"),
                json!("http://localhost:65536"),
                json!("http://[::1]garbage]"),
                json!("http://[::1"),
                json!("http://bad host/v1"),
                json!("http://127.0.0.999"),
                json!("http://user:simulated@localhost"),
                json!("http://localhost/v1%Q1"),
                json!("http://localhost/v1#fragment"),
                json!("http://localhost../v1"),
                json!("http://localhost/<invalid>"),
                json!("http://localhost/v1|invalid"),
                json!("http://localhost/\n"),
            ],
        ),
    ] {
        for value in values {
            let error = parse_engine_settings(&settings(json!({key:value}))).unwrap_err();
            assert_eq!(error.code, ErrorCode::Invalid);
            assert_eq!(error.message, format!("invalid {key}"));
        }
    }
    for key in [
        "engine.cli_provider",
        "engine.live_endpoint",
        "engine.cloud_opt_in",
    ] {
        assert!(serde_json::from_value::<Settings>(json!({"values":{key:null}})).is_err());
    }
    for invalid in [json!(null), json!("unknown"), json!(0)] {
        assert!(serde_json::from_value::<CliProvider>(invalid).is_err());
    }
}
