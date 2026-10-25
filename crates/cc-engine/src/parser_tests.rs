use crate::{Failure, Prices, api::parse_response, stream::TurnParser};
use cc_store::EngineProvider;
use cc_types::CliProvider;

#[test]
fn codex_jsonl_preserves_thread_and_never_treats_errors_as_answers() {
    let mut parser = TurnParser::default();
    for line in [
        r#"{"type":"thread.started","thread_id":"simulated-thread"}"#,
        r#"{"type":"item.updated","item":{"type":"reasoning"}}"#,
        r#"{"type":"item.completed","item":{"type":"agent_message","text":"simulated answer"}}"#,
        r#"{"type":"turn.failed","error":{"message":"simulated raw error"},"usage":{"input_tokens":10,"output_tokens":20}}"#,
    ] {
        parser.feed(line.as_bytes(), CliProvider::CodexCli).unwrap();
    }
    let answer = parser
        .finish(Prices {
            input: 1_000_000,
            output: 2_000_000,
        })
        .unwrap();
    assert_eq!(answer.failure, Some(Failure::Unavailable));
    assert!(answer.model_served.is_none() && answer.text.is_empty());
    assert_eq!(answer.cost_microusd, 50);
}
#[test]
fn unknown_or_missing_child_posture_and_truncated_turn_fail_closed() {
    let mut parser = TurnParser::default();
    parser
        .feed(
            br#"{"type":"system","subtype":"init"}"#,
            CliProvider::ClaudeCli,
        )
        .unwrap();
    parser
        .feed(
            br#"{"type":"result","subtype":"success","is_error":false,"result":"simulated"}"#,
            CliProvider::ClaudeCli,
        )
        .unwrap();
    assert!(matches!(
        parser.finish(Prices::default()),
        Err(Failure::Posture)
    ));
    let mut parser = TurnParser::default();
    assert_eq!(
        parser.feed(
            br#"{"type":"thread.started","sandbox":"danger-full-access"}"#,
            CliProvider::CodexCli
        ),
        Err(Failure::Posture)
    );
    assert!(matches!(
        TurnParser::default().finish(Prices::default()),
        Err(Failure::Parse)
    ));
}
#[test]
fn responses_schema_records_served_model_and_prices_usage() {
    let bytes = br#"{"model":"simulated-served","status":"completed","output":[{"type":"message","content":[{"type":"output_text","text":"simulated answer"}]}],"usage":{"input_tokens":10,"output_tokens":20}}"#;
    let answer = parse_response(
        bytes,
        EngineProvider::OpenaiApi,
        Prices {
            input: 1_000_000,
            output: 2_000_000,
        },
    )
    .unwrap();
    assert_eq!(answer.model_served.unwrap().as_str(), "simulated-served");
    assert_eq!(answer.cost_microusd, 50);
    assert_eq!(answer.text, "simulated answer");
    assert!(
        parse_response(
            br#"{"model":"arbitrary text is refused"}"#,
            EngineProvider::OpenaiApi,
            Prices::default()
        )
        .is_err()
    );
}
#[test]
fn structured_verdict_boundary_rejects_unknown_values_and_extra_fields() {
    for invalid in [
        r#"{"verdict":"allow"}"#,
        r#"{"verdict":"pass","other":true}"#,
        "pass",
        "null",
    ] {
        assert!(crate::floor::verdict(invalid).is_err());
    }
}
