// Ported from Shadowrunr OS crates/shadowrunr-daemon/src/server.rs @ 7e4b6f8.
// Apache-2.0; see NOTICE. No show-specific or overlay/media routes are retained.
use crate::auth::{SessionToken, origin_allowed};
use crate::{EventHub, Registry};
use axum::body::Bytes;
use axum::extract::{Query, State, WebSocketUpgrade};
use axum::http::{HeaderMap, StatusCode, header};
use axum::middleware::{self, Next};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use cc_types::{ErrorCode, ErrorEnvelope, parse_request};
use serde::Deserialize;
use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::sync::Arc;
use tokio::net::TcpListener;
use tokio::sync::watch;

pub struct AppState {
    pub registry: Registry,
    pub events: EventHub,
    token: SessionToken,
    shutdown: watch::Sender<bool>,
}

impl AppState {
    pub fn new(registry: Registry, event_capacity: usize) -> Result<Arc<Self>, ErrorEnvelope> {
        Ok(Arc::new(Self {
            registry,
            events: EventHub::new(event_capacity)?,
            token: SessionToken::mint(),
            shutdown: watch::Sender::new(false),
        }))
    }
    /// Capability handoff to the trusted native desktop shell, never served over HTTP.
    pub fn session_token(&self) -> &str {
        self.token.as_str()
    }
    pub fn shutdown(&self) {
        self.shutdown.send_replace(true);
    }
}

fn error(status: StatusCode, code: ErrorCode, message: &str) -> Response {
    (status, Json(ErrorEnvelope::new(code, message))).into_response()
}

// Runs before body/query/upgrade extractors so neither route leaks an alternate
// unauthenticated extraction error. Origins do not grant access without a token.
async fn authenticate(
    State(state): State<Arc<AppState>>,
    request: axum::extract::Request,
    next: Next,
) -> Response {
    let websocket = request.uri().path() == "/events";
    if !state.token.permits(request.headers(), websocket) {
        return error(
            StatusCode::UNAUTHORIZED,
            ErrorCode::Unauthorized,
            "session capability required",
        );
    }
    if !origin_allowed(request.headers()) {
        return error(
            StatusCode::FORBIDDEN,
            ErrorCode::Unauthorized,
            "origin refused",
        );
    }
    next.run(request).await
}

pub fn router(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/rpc", post(rpc_handler))
        .route("/events", get(events_handler))
        .route_layer(middleware::from_fn_with_state(
            Arc::clone(&state),
            authenticate,
        ))
        .with_state(state)
}

async fn rpc_handler(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    body: Result<Bytes, axum::extract::rejection::BytesRejection>,
) -> Response {
    if !headers
        .get(header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .is_some_and(|v| {
            v.split(';')
                .next()
                .is_some_and(|v| v.trim().eq_ignore_ascii_case("application/json"))
        })
    {
        return error(
            StatusCode::UNSUPPORTED_MEDIA_TYPE,
            ErrorCode::Invalid,
            "content-type must be application/json",
        );
    }
    let body = match body {
        Ok(body) => body,
        Err(_) => {
            return error(
                StatusCode::PAYLOAD_TOO_LARGE,
                ErrorCode::Invalid,
                "request body unavailable or too large",
            );
        }
    };
    let request = match parse_request(&body) {
        Ok(request) => request,
        Err(e) => return (StatusCode::BAD_REQUEST, Json(e)).into_response(),
    };
    match state.registry.dispatch(&request).await {
        Ok(result) => Json(result).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, Json(e)).into_response(),
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Resume {
    since_seq: Option<u64>,
}

async fn events_handler(
    State(state): State<Arc<AppState>>,
    resume: Result<Query<Resume>, axum::extract::rejection::QueryRejection>,
    ws: Result<WebSocketUpgrade, axum::extract::ws::rejection::WebSocketUpgradeRejection>,
) -> Response {
    let Ok(Query(resume)) = resume else {
        return error(
            StatusCode::BAD_REQUEST,
            ErrorCode::Invalid,
            "invalid resume cursor",
        );
    };
    let Ok(ws) = ws else {
        return error(
            StatusCode::BAD_REQUEST,
            ErrorCode::Invalid,
            "WebSocket upgrade required",
        );
    };
    ws.protocols(["cc-events"])
        .on_upgrade(move |socket| async move {
            state
                .events
                .session(socket, resume.since_seq, state.shutdown.subscribe())
                .await;
        })
}

/// 127.0.0.1 only, even if an untrusted configuration supplies another loopback.
pub async fn bind(
    state: Arc<AppState>,
    address: SocketAddr,
) -> std::io::Result<(
    SocketAddr,
    impl std::future::Future<Output = std::io::Result<()>>,
)> {
    if address.ip() != IpAddr::V4(Ipv4Addr::LOCALHOST) {
        return Err(std::io::Error::new(
            std::io::ErrorKind::PermissionDenied,
            "only 127.0.0.1 is permitted",
        ));
    }
    let listener = TcpListener::bind(address).await?;
    let address = listener.local_addr()?;
    let mut shutdown = state.shutdown.subscribe();
    Ok((address, async move {
        axum::serve(listener, router(state))
            .with_graceful_shutdown(async move {
                let _ = shutdown.wait_for(|v| *v).await;
            })
            .await
    }))
}
