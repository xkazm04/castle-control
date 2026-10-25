use super::*;
use std::io::{Read, Write};

#[tokio::test]
async fn responses_http_transport_uses_bearer_key_and_store_false_against_fake_loopback() {
    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    let task = std::thread::spawn(move || {
        let (mut socket, _) = listener.accept().unwrap();
        socket
            .set_read_timeout(Some(Duration::from_secs(3)))
            .unwrap();
        let mut request = Vec::new();
        let mut buf = [0u8; 4096];
        loop {
            let n = socket.read(&mut buf).unwrap();
            assert_ne!(n, 0);
            request.extend_from_slice(&buf[..n]);
            if let Some(end) = request.windows(4).position(|w| w == b"\r\n\r\n") {
                let headers = String::from_utf8_lossy(&request[..end]).to_lowercase();
                let length: usize = headers
                    .lines()
                    .find_map(|line| line.strip_prefix("content-length: "))
                    .unwrap()
                    .parse()
                    .unwrap();
                if request.len() >= end + 4 + length {
                    break;
                }
            }
        }
        let body = r#"{"model":"simulated-served","status":"completed","output":[{"type":"message","content":[{"type":"output_text","text":"simulated answer"}]}],"usage":{"input_tokens":10,"output_tokens":20}}"#;
        write!(
            socket,
            "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
            body.len()
        )
        .unwrap();
        String::from_utf8(request).unwrap()
    });
    // Test-local override of private fields, never a production policy escape hatch.
    let mut endpoint = Endpoint::new(&EngineSettings::default()).unwrap();
    endpoint.url = reqwest::Url::parse(&format!("http://{address}/v1/responses")).unwrap();
    endpoint.provider = EngineProvider::OpenaiApi;
    let answer = endpoint
        .complete(
            &ModelName::parse("simulated-selected").unwrap(),
            "simulated prompt",
            Prices {
                input: 1_000_000,
                output: 2_000_000,
            },
            Some("simulated"),
            2_000,
        )
        .await
        .unwrap();
    assert_eq!(answer.cost_microusd, 50);
    let request = task.join().unwrap();
    assert!(request.starts_with("POST /v1/responses "));
    assert!(
        request
            .to_lowercase()
            .contains("authorization: bearer simulated")
    );
    assert!(request.contains("\"store\":false"));
    assert!(request.contains("\"input\":\"simulated prompt\""));
}
