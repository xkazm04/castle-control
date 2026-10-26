//! FIXTURE twins: every prompt, reply and endpoint here is simulated.
mod common;
mod floor_wire_support;

use cc_engine::{EngineClass, Evidence, LatencySample, simulated_bank};
use cc_store::{EngineProvider, LedgerEvent};
use floor_wire_support::{case, reading, structured, target};
use serde_json::{Value, json};

async fn fixture(responses: Vec<(u16, String)>, correct: usize) {
    let cases: Vec<_> = responses
        .iter()
        .map(|_| case(r#"{"verdict":"pass"}"#))
        .collect();
    let server = common::Server::new(responses);
    let target = target(&server.endpoint, "simulated-selected").unwrap();
    let (report, _) = reading(&target, &cases).await;
    assert_eq!(report.evidence.structured_correct, correct);
    assert_eq!(report.failed, cases.len() - correct);
}

fn answer() -> Value {
    serde_json::from_str(&common::local_answer("pass")).unwrap()
}

#[test]
fn simulated_fixture_local_only() {
    use floor_wire_support::{LIVE_GUARD, guarded_target};
    for flag in [None, Some("0"), Some("true"), Some("01"), Some("1 ")] {
        assert_eq!(guarded_target(flag, None, None).err(), Some(LIVE_GUARD));
    }
    assert!(guarded_target(Some("1"), None, None).is_err());
    assert!(guarded_target(Some("1"), Some("http://127.0.0.1/v1"), None).is_err());
    for url in [
        "https://api.openai.com/v1",
        "http://192.0.2.1/v1",
        "http://localhost/v1",
        "http://127.0.0.1.example.invalid/v1",
        "http://[::ffff:192.0.2.1]/v1",
        "http://user@127.0.0.1/v1",
        "file:///v1",
    ] {
        assert!(target(url, "simulated-selected").is_err());
    }
    for url in ["http://127.0.0.1:11434/v1", "http://[::1]:1234/v1"] {
        assert!(target(url, "simulated-selected").is_ok());
    }
}

#[tokio::test]
async fn simulated_fixture_request_shape() {
    let bank = simulated_bank();
    let server = common::Server::new(
        ["pass", "hold", "bar", "bar", "pass", "hold"]
            .map(|v| (200, common::local_answer(v)))
            .to_vec(),
    );
    let (report, _) = reading(
        &target(&server.endpoint, "simulated-selected").unwrap(),
        &bank,
    )
    .await;
    structured(&report);
    let requests = server.requests.lock().unwrap();
    assert_eq!(requests.len(), bank.len());
    for (request, case) in requests.iter().zip(bank) {
        let (headers, body) = request.split_once("\r\n\r\n").unwrap();
        assert!(headers.starts_with("POST /v1/chat/completions HTTP/1.1"));
        assert!(!headers.to_ascii_lowercase().contains("authorization:"));
        assert!(
            headers
                .to_ascii_lowercase()
                .contains("content-type: application/json")
        );
        assert_eq!(
            serde_json::from_str::<Value>(body).unwrap(),
            json!({"model":"simulated-selected", "messages":[{"role":"user","content":case.prompt}],
                "stream":false, "max_tokens":2048, "response_format":{"type":"json_object"}})
        );
    }
}

#[tokio::test]
async fn simulated_fixture_response_shape() {
    fixture(vec![(200, answer().to_string())], 1).await;
    let mut invalid = Vec::new();
    for content in [
        json!(null),
        json!([]),
        json!(""),
        json!("not JSON"),
        json!(r#"{"verdict":"unknown"}"#),
        json!(r#"{"verdict":"pass","extra":true}"#),
        json!(r#"[{"verdict":"pass"}]"#),
    ] {
        let mut body = answer();
        body["choices"][0]["message"]["content"] = content;
        invalid.push((200, body.to_string()));
    }
    for finish in [json!(null), json!("length"), json!("tool_calls")] {
        let mut body = answer();
        body["choices"][0]["finish_reason"] = finish;
        invalid.push((200, body.to_string()));
    }
    let mut missing_choices = answer();
    missing_choices.as_object_mut().unwrap().remove("choices");
    invalid.push((200, missing_choices.to_string()));
    let mut first_only = answer();
    first_only["choices"] = json!([
        {"message":{"content":"invalid simulated first choice"},"finish_reason":"stop"},
        answer()["choices"][0].clone()
    ]);
    invalid.push((200, first_only.to_string()));
    fixture(invalid, 0).await;
}

#[tokio::test]
async fn simulated_fixture_usage_shape() {
    // The usage object is required, its unsigned counters default to zero.
    let mut empty = answer();
    empty["usage"] = json!({});
    let mut ignored = answer();
    ignored["usage"] = json!({"total_tokens":30, "input_tokens":10, "output_tokens":20});
    fixture(
        vec![(200, empty.to_string()), (200, ignored.to_string())],
        2,
    )
    .await;
    let mut invalid = Vec::new();
    for usage in [
        json!(null),
        json!({"prompt_tokens":-1}),
        json!({"completion_tokens":"20"}),
    ] {
        let mut body = answer();
        body["usage"] = usage;
        invalid.push((200, body.to_string()));
    }
    let mut missing = answer();
    missing.as_object_mut().unwrap().remove("usage");
    invalid.push((200, missing.to_string()));
    fixture(invalid, 0).await;
    let server = common::Server::new(vec![(200, answer().to_string())]);
    let (_, rows) = reading(
        &target(&server.endpoint, "simulated-selected").unwrap(),
        &[case(r#"{"verdict":"pass"}"#)],
    )
    .await;
    assert!(matches!(
        rows[0].event,
        LedgerEvent::Engine {
            cost_microusd: 0,
            ..
        }
    ));
}

#[test]
fn simulated_fixture_latency_budgets() {
    for (class, total, silence) in [
        (EngineClass::Live, 2_000, 1_500),
        (EngineClass::NearLive, 5_000, 3_000),
    ] {
        let evidence = |total_ms, longest_silence_ms, correct, n| {
            Evidence::measure(
                &vec![
                    LatencySample {
                        total_ms,
                        longest_silence_ms
                    };
                    n
                ],
                correct,
                n,
            )
            .unwrap()
        };
        assert!(evidence(total, silence, 6, 6).admits(class));
        assert!(!evidence(total + 1, silence, 6, 6).admits(class));
        assert!(!evidence(total, silence + 1, 6, 6).admits(class));
        assert!(!evidence(1, 1, 5, 5).admits(class));
        assert!(!evidence(1, 1, 5, 6).admits(class));
    }
}

#[tokio::test]
async fn simulated_fixture_measurement_timeout() {
    // Accept the simulated request, but never supply headers/body before the 5s deadline.
    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let url = format!("http://{}/v1", listener.local_addr().unwrap());
    let (finished, measurement) = std::sync::mpsc::channel();
    let thread = std::thread::spawn(move || {
        let (_socket, _) = listener.accept().unwrap();
        // Hold the connection without a response until the floor reports its timeout.
        measurement
            .recv_timeout(std::time::Duration::from_secs(10))
            .unwrap();
    });
    let (report, rows) = reading(
        &target(&url, "simulated-selected").unwrap(),
        &[case(r#"{"verdict":"pass"}"#)],
    )
    .await;
    finished.send(()).unwrap();
    thread.join().unwrap();
    assert_eq!(report.failed, 1);
    assert!(report.evidence.longest_silence_ms >= 5_000);
    assert_eq!(report.evidence.p95_ms, report.evidence.longest_silence_ms);
    assert!(matches!(
        rows[0].event,
        LedgerEvent::Engine {
            model_served: None,
            ..
        }
    ));
}

#[tokio::test]
async fn simulated_fixture_model_identity() {
    let server = common::Server::new(vec![(200, answer().to_string()); 6]);
    let selected = target(&server.endpoint, "simulated-explicit-id").unwrap();
    let (_, rows) = reading(&selected, &simulated_bank()).await;
    for row in rows {
        let LedgerEvent::Engine {
            model_selected,
            model_served,
            provider,
            ..
        } = row.event
        else {
            panic!("expected floor audit");
        };
        assert_eq!(provider, EngineProvider::LocalEndpoint);
        assert_eq!(model_selected.as_str(), "simulated-explicit-id");
        assert_eq!(model_served.unwrap().as_str(), "simulated-served");
    }
    // No GET /models discovery, alias substitution or extra request is made.
    {
        let requests = server.requests.lock().unwrap();
        assert_eq!(requests.len(), 6);
        assert!(
            requests
                .iter()
                .all(|r| r.starts_with("POST /v1/chat/completions "))
        );
    }
    let mut missing = answer();
    missing.as_object_mut().unwrap().remove("model");
    let mut invalid = answer();
    invalid["model"] = json!("invalid model id");
    fixture(
        vec![(200, missing.to_string()), (200, invalid.to_string())],
        0,
    )
    .await;
    let replies = ["pass", "hold", "bar", "bar", "pass", "hold"]
        .into_iter()
        .enumerate()
        .map(|(i, verdict)| {
            let mut body: Value = serde_json::from_str(&common::local_answer(verdict)).unwrap();
            if i == 5 {
                body["model"] = json!("simulated-changed");
            }
            (200, body.to_string())
        })
        .collect();
    let drift = common::Server::new(replies);
    let (report, _) = reading(
        &target(&drift.endpoint, "simulated-selected").unwrap(),
        &simulated_bank(),
    )
    .await;
    assert_eq!(report.failed, 6);
}

#[tokio::test]
async fn simulated_fixture_http_errors() {
    fixture(
        [400, 401, 403, 404, 429, 500, 503, 302]
            .map(|status| {
                (
                    status,
                    json!({"error":{"message":"simulated provider error", "type":"simulated"}})
                        .to_string(),
                )
            })
            .to_vec(),
        0,
    )
    .await;
    fixture(
        vec![(
            200,
            json!({"error":{"message":"simulated error in a 200 response"}}).to_string(),
        )],
        0,
    )
    .await;
}

#[tokio::test]
async fn simulated_fixture_refusal_shapes() {
    let mut bodies = Vec::new();
    for content in [json!(null), json!(r#"{"refusal":"simulated"}"#)] {
        let mut body = answer();
        body["choices"][0]["message"] = json!({"content":content,"refusal":"simulated"});
        bodies.push((200, body.to_string()));
    }
    let mut filtered = answer();
    filtered["choices"][0]["finish_reason"] = json!("content_filter");
    bodies.push((200, filtered.to_string()));
    fixture(bodies, 0).await;
    let mut ignored_property = answer();
    ignored_property["choices"][0]["message"]["refusal"] = json!("simulated");
    fixture(vec![(200, ignored_property.to_string())], 1).await;
}
