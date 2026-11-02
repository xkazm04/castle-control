//! RPC dispatch errors map to an HTTP status by ErrorCode; the JSON envelope
//! stays the contract and is identical whatever the status.
use cc_core::{AppState, Module, Registry, bind};
use cc_types::{ErrorCode, ErrorEnvelope, RpcRequest};
use futures::future::BoxFuture;
use serde_json::{Value, json};
use std::net::SocketAddr;
use std::sync::Arc;

struct Failing(ErrorCode);
impl Module for Failing {
    fn methods(&self) -> &'static [&'static str] {
        &["status.get"]
    }
    fn call<'a>(&'a self, _: &'a RpcRequest) -> BoxFuture<'a, Result<Value, ErrorEnvelope>> {
        let code = self.0;
        Box::pin(async move { Err(ErrorEnvelope::new(code, "simulated failure")) })
    }
}

#[tokio::test]
async fn dispatch_errors_map_status_by_code_and_keep_the_envelope() {
    for (code, status) in [
        (ErrorCode::Invalid, 400),
        (ErrorCode::NotFound, 404),
        (ErrorCode::Conflict, 409),
        (ErrorCode::Unauthorized, 401),
        (ErrorCode::RateLimited, 429),
        (ErrorCode::Upstream, 502),
        (ErrorCode::Unavailable, 503),
        (ErrorCode::BlockedByPolicy, 403),
        (ErrorCode::NeedsHuman, 428),
        (ErrorCode::Internal, 500),
    ] {
        let mut registry = Registry::default();
        registry.register(Arc::new(Failing(code))).unwrap();
        let state = AppState::new(registry, 4).unwrap();
        let (address, server) = bind(Arc::clone(&state), SocketAddr::from(([127, 0, 0, 1], 0)))
            .await
            .unwrap();
        let task = tokio::spawn(server);
        let response = reqwest::Client::new()
            .post(format!("http://{address}/rpc"))
            .bearer_auth(state.session_token())
            .json(&json!({"method":"status.get","params":{}}))
            .send()
            .await
            .unwrap();
        assert_eq!(response.status(), status, "{code:?}");
        let envelope = response.json::<ErrorEnvelope>().await.unwrap();
        assert_eq!(envelope, ErrorEnvelope::new(code, "simulated failure"));
        state.shutdown();
        task.await.unwrap().unwrap();
    }
}
