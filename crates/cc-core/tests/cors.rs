use cc_core::{AppState, Registry, bind};
use cc_types::{ErrorCode, ErrorEnvelope, StatusResult};
use reqwest::{Client, Method, Response, header};
use serde_json::json;
use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;
use tokio::task::JoinHandle;

struct Harness {
    state: Arc<AppState>,
    address: SocketAddr,
    task: Option<JoinHandle<std::io::Result<()>>>,
}

impl Harness {
    async fn start() -> Self {
        let state = AppState::new(Registry::with_status(), 4).unwrap();
        let (address, server) = bind(Arc::clone(&state), SocketAddr::from(([127, 0, 0, 1], 0)))
            .await
            .unwrap();
        Self {
            state,
            address,
            task: Some(tokio::spawn(server)),
        }
    }

    fn url(&self, path: &str) -> String {
        format!("http://{}{path}", self.address)
    }

    async fn stop(mut self) {
        self.state.shutdown();
        tokio::time::timeout(Duration::from_secs(3), self.task.take().unwrap())
            .await
            .unwrap()
            .unwrap()
            .unwrap();
    }
}

impl Drop for Harness {
    fn drop(&mut self) {
        self.state.shutdown();
        if let Some(task) = self.task.take() {
            task.abort();
        }
    }
}

fn assert_origin(response: &Response, origin: &str) {
    assert_eq!(
        response.headers()[header::ACCESS_CONTROL_ALLOW_ORIGIN],
        origin
    );
    assert_eq!(response.headers()[header::VARY], "Origin");
    assert!(
        !response
            .headers()
            .contains_key(header::ACCESS_CONTROL_ALLOW_CREDENTIALS)
    );
}

fn assert_no_cors(response: &Response) {
    for name in [
        header::ACCESS_CONTROL_ALLOW_ORIGIN,
        header::ACCESS_CONTROL_ALLOW_METHODS,
        header::ACCESS_CONTROL_ALLOW_HEADERS,
        header::ACCESS_CONTROL_ALLOW_CREDENTIALS,
        header::ACCESS_CONTROL_MAX_AGE,
        header::VARY,
    ] {
        assert!(!response.headers().contains_key(name));
    }
}

#[tokio::test]
async fn allowed_preflights_need_no_token_and_echo_only_the_exact_origin() {
    let h = Harness::start().await;
    let client = Client::new();
    for origin in ["http://tauri.localhost", "tauri://localhost"] {
        for requested_headers in ["content-type, authorization", "Authorization, CONTENT-TYPE"] {
            let response = client
                .request(Method::OPTIONS, h.url("/rpc"))
                .header(header::ORIGIN, origin)
                .header(header::ACCESS_CONTROL_REQUEST_METHOD, "POST")
                .header(header::ACCESS_CONTROL_REQUEST_HEADERS, requested_headers)
                .send()
                .await
                .unwrap();
            assert_eq!(response.status(), 204);
            assert_origin(&response, origin);
            assert_eq!(
                response.headers()[header::ACCESS_CONTROL_ALLOW_METHODS],
                "POST"
            );
            assert_eq!(
                response.headers()[header::ACCESS_CONTROL_ALLOW_HEADERS],
                "content-type, authorization"
            );
            assert_eq!(response.headers()[header::ACCESS_CONTROL_MAX_AGE], "600");
            assert!(response.bytes().await.unwrap().is_empty());
        }
    }
    h.stop().await;
}

#[tokio::test]
async fn refused_preflights_never_get_cors_headers() {
    let h = Harness::start().await;
    let client = Client::new();
    for (origin, method, headers) in [
        (Some("http://localhost:1420"), Some("POST"), "content-type"),
        (Some("http://evil.example"), Some("POST"), "authorization"),
        (None, Some("POST"), "content-type, authorization"),
        (Some("http://tauri.localhost"), Some("PUT"), "content-type"),
        (Some("http://tauri.localhost"), Some("POST"), "x-other"),
        (Some("http://tauri.localhost"), None, "content-type"),
        (
            Some("http://tauri.localhost/"),
            Some("POST"),
            "content-type",
        ),
        (Some("http://tauri.localhost"), Some("post"), "content-type"),
    ] {
        let mut request = client
            .request(Method::OPTIONS, h.url("/rpc"))
            .header(header::ACCESS_CONTROL_REQUEST_HEADERS, headers);
        if let Some(origin) = origin {
            request = request.header(header::ORIGIN, origin);
        }
        if let Some(method) = method {
            request = request.header(header::ACCESS_CONTROL_REQUEST_METHOD, method);
        }
        let response = request.send().await.unwrap();
        assert_eq!(response.status(), 403);
        assert_no_cors(&response);
    }
    let response = client
        .request(Method::OPTIONS, h.url("/rpc"))
        .header(header::ORIGIN, "http://tauri.localhost")
        .header(header::ACCESS_CONTROL_REQUEST_METHOD, "POST")
        .header(header::ACCESS_CONTROL_REQUEST_HEADERS, "content-type")
        .header(header::ACCESS_CONTROL_REQUEST_HEADERS, "x-other")
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 403);
    assert_no_cors(&response);
    h.stop().await;
}

#[tokio::test]
async fn allowed_origins_can_read_rpc_success_and_error_envelopes() {
    let h = Harness::start().await;
    let client = Client::new();
    for origin in ["http://tauri.localhost", "tauri://localhost"] {
        let response = client
            .post(h.url("/rpc"))
            .bearer_auth(h.state.session_token())
            .header(header::ORIGIN, origin)
            .json(&json!({"method":"status.get","params":{}}))
            .send()
            .await
            .unwrap();
        assert_eq!(response.status(), 200);
        assert_origin(&response, origin);
        response.json::<StatusResult>().await.unwrap();

        for (authenticated, content_type, body, status, code) in [
            (
                false,
                "application/json",
                "{}",
                401,
                ErrorCode::Unauthorized,
            ),
            (true, "text/plain", "{}", 415, ErrorCode::Invalid),
            (true, "application/json", "{", 400, ErrorCode::Invalid),
        ] {
            let mut request = client
                .post(h.url("/rpc"))
                .header(header::ORIGIN, origin)
                .header(header::CONTENT_TYPE, content_type)
                .body(body);
            if authenticated {
                request = request.bearer_auth(h.state.session_token());
            }
            let response = request.send().await.unwrap();
            assert_eq!(response.status(), status);
            assert_origin(&response, origin);
            assert_eq!(response.json::<ErrorEnvelope>().await.unwrap().code, code);
        }
    }
    h.stop().await;
}

#[tokio::test]
async fn absent_and_refused_origins_get_no_rpc_cors_headers() {
    let h = Harness::start().await;
    let client = Client::new();
    for (origin, status) in [(None, 200), (Some("http://evil.example"), 403)] {
        let mut request = client
            .post(h.url("/rpc"))
            .bearer_auth(h.state.session_token())
            .json(&json!({"method":"status.get","params":{}}));
        if let Some(origin) = origin {
            request = request.header(header::ORIGIN, origin);
        }
        let response = request.send().await.unwrap();
        assert_eq!(response.status(), status);
        assert_no_cors(&response);
    }
    h.stop().await;
}

#[tokio::test]
async fn events_still_require_authentication_and_origin_checks_without_cors() {
    let h = Harness::start().await;
    let client = Client::new();
    for (authenticated, origin, status) in [
        (false, "http://tauri.localhost", 401),
        (true, "http://evil.example", 403),
        (true, "http://tauri.localhost", 400),
        (true, "tauri://localhost", 400),
    ] {
        let mut request = client.get(h.url("/events")).header(header::ORIGIN, origin);
        if authenticated {
            request = request.bearer_auth(h.state.session_token());
        }
        let response = request.send().await.unwrap();
        assert_eq!(response.status(), status);
        assert_no_cors(&response);
    }
    h.stop().await;
}
