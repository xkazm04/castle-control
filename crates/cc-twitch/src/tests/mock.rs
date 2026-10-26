// Adapted from Shadowrunr OS @ 7e4b6f8,
// crates/shadowrunr-daemon/src/platform/twitch/tests.rs.
//! Simulated OAuth/Helix server, bound by the harness to loopback only.
use super::fixtures::*;
use axum::{
    body::Bytes,
    extract::State,
    http::{HeaderMap, Method, StatusCode, Uri},
    response::{IntoResponse, Response},
};
use serde_json::{Value, json};
use std::sync::{
    Arc, Mutex,
    atomic::{AtomicBool, AtomicI64, AtomicU32, Ordering},
};

#[derive(Clone)]
pub(super) struct Call {
    pub method: String,
    pub path: String,
    pub query: Vec<(String, String)>,
    pub body: String,
    pub auth: String,
}

impl Call {
    pub fn form(&self) -> Vec<(String, String)> {
        serde_urlencoded::from_str(&self.body).expect("simulated form")
    }
    pub fn json(&self) -> Value {
        serde_json::from_str(&self.body).expect("simulated JSON")
    }
}

#[derive(Default)]
pub(super) struct Mock {
    pub calls: Mutex<Vec<Call>>,
    pub device_polls: AtomicU32,
    pub reject: AtomicBool,
    pub rate_limit: AtomicBool,
    pub exhaust_bucket: AtomicBool,
    pub reset_at_s: AtomicI64,
    pub omit_reset: AtomicBool,
    pub echo_403: AtomicBool,
    pub reject_refresh: AtomicBool,
    pub drop_chat: AtomicBool,
    pub malformed_chat: AtomicBool,
    pub slow_down: AtomicBool,
    pub deny_device: AtomicBool,
    pub expire_device: AtomicBool,
    pub short_grant: AtomicBool,
    pub malformed_subscription: AtomicBool,
}

impl Mock {
    pub fn calls_to(&self, method: &str, path: &str) -> Vec<Call> {
        self.calls
            .lock()
            .expect("simulated calls")
            .iter()
            .filter(|c| c.method == method && c.path == path)
            .cloned()
            .collect()
    }
    pub fn refresh_count(&self) -> usize {
        self.calls_to("POST", "/oauth2/token")
            .iter()
            .filter(|c| get(&c.form(), "grant_type") == Some("refresh_token"))
            .count()
    }
}

pub(super) fn get<'a>(pairs: &'a [(String, String)], key: &str) -> Option<&'a str> {
    pairs
        .iter()
        .find(|(k, _)| k == key)
        .map(|(_, v)| v.as_str())
}

fn reply(status: u16, body: Value) -> Response {
    (
        StatusCode::from_u16(status).expect("simulated status"),
        [("content-type", "application/json")],
        body.to_string(),
    )
        .into_response()
}

pub(super) async fn handle(
    State(m): State<Arc<Mock>>,
    method: Method,
    uri: Uri,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    let header = |key: &str| {
        headers
            .get(key)
            .and_then(|v| v.to_str().ok())
            .unwrap_or("")
            .to_string()
    };
    let call = Call {
        method: method.to_string(),
        path: uri.path().into(),
        query: serde_urlencoded::from_str(uri.query().unwrap_or("")).expect("simulated query"),
        body: String::from_utf8_lossy(&body).into_owned(),
        auth: header("authorization"),
    };
    m.calls.lock().expect("simulated calls").push(call.clone());
    match (call.method.as_str(), call.path.as_str()) {
        ("POST", "/oauth2/device") => reply(
            200,
            json!({"device_code": "simulated-device-secret",
            "expires_in": if m.expire_device.load(Ordering::SeqCst) { 1 } else { 1800 },
            "interval": 1, "user_code": "SIMULATED", "verification_uri": "https://www.twitch.tv/activate"}),
        ),
        ("POST", "/oauth2/token") => {
            let form = call.form();
            let grant = get(&form, "grant_type");
            if grant == Some("urn:ietf:params:oauth:grant-type:device_code") {
                let poll = m.device_polls.fetch_add(1, Ordering::SeqCst);
                if m.deny_device.load(Ordering::SeqCst) {
                    return reply(400, json!({"message": "access_denied"}));
                }
                if poll == 0 {
                    return reply(
                        400,
                        json!({"message": if m.slow_down.load(Ordering::SeqCst) {
                    "slow_down" } else { "authorization_pending" }}),
                    );
                }
                reply(
                    200,
                    json!({"access_token": ACCESS, "refresh_token": REFRESH, "expires_in": 14400}),
                )
            } else if grant == Some("refresh_token")
                && !m.reject_refresh.load(Ordering::SeqCst)
                && get(&form, "client_id") == Some("cid")
                && get(&form, "client_secret").is_none()
                && matches!(get(&form, "refresh_token"), Some(REFRESH | REFRESH2))
            {
                reply(
                    200,
                    json!({"access_token": ACCESS2, "refresh_token": REFRESH2,
                    "expires_in": if m.short_grant.load(Ordering::SeqCst) { 1 } else { 14400 }}),
                )
            } else {
                reply(400, json!({"message": "simulated invalid refresh"}))
            }
        }
        ("GET", "/oauth2/validate") => {
            if !matches!(call.auth.strip_prefix("OAuth "), Some(ACCESS | ACCESS2)) {
                return reply(401, json!({"message": "simulated invalid access"}));
            }
            let scopes: Vec<_> = crate::scopes::MODULE_SCOPES
                .iter()
                .flat_map(|row| row.scopes.iter())
                .collect();
            reply(
                200,
                json!({"client_id": "cid", "login": "simulated-bot", "user_id": BOT_ID,
                "scopes": scopes, "expires_in": 3600}),
            )
        }
        ("POST", "/oauth2/revoke") => reply(200, json!({})),
        (_, path) if path.starts_with("/helix/") => {
            let token = call.auth.strip_prefix("Bearer ").unwrap_or("");
            if header("client-id") != "cid"
                || !matches!(token, ACCESS | ACCESS2)
                || (token == ACCESS && m.reject.load(Ordering::SeqCst))
            {
                return reply(401, json!({"message": "simulated unauthorized"}));
            }
            if m.echo_403.load(Ordering::SeqCst) {
                return reply(403, json!({"message": format!("simulated echo {token}")}));
            }
            if m.rate_limit.load(Ordering::SeqCst) {
                let mut response = reply(429, json!({}));
                if !m.omit_reset.load(Ordering::SeqCst) {
                    let reset = m.reset_at_s.load(Ordering::SeqCst);
                    response.headers_mut().insert(
                        "Ratelimit-Reset",
                        (if reset == 0 {
                            chrono::Utc::now().timestamp() + 30
                        } else {
                            reset
                        })
                        .to_string()
                        .parse()
                        .expect("header"),
                    );
                }
                response
                    .headers_mut()
                    .insert("Ratelimit-Remaining", "0".parse().expect("header"));
                return response;
            }
            let mut response = match (call.method.as_str(), path) {
                ("GET", "/helix/users") => reply(200, json!({"data": [{"id": BROADCASTER_ID}]})),
                ("POST", "/helix/eventsub/subscriptions") => {
                    if m.malformed_subscription.load(Ordering::SeqCst) {
                        return reply(202, json!({"data": []}));
                    }
                    let request = call.json();
                    reply(
                        202,
                        json!({"data": [{"id": "simulated-sub", "status": "enabled",
                        "type": request["type"], "version": request["version"]}]}),
                    )
                }
                ("DELETE", "/helix/moderation/chat" | "/helix/moderation/bans") => {
                    StatusCode::NO_CONTENT.into_response()
                }
                ("POST", "/helix/moderation/bans") => reply(200, json!({"data": [{}]})),
                ("POST", "/helix/moderation/warnings") => reply(
                    200,
                    json!({"data": [{
                    "broadcaster_id": BROADCASTER_ID, "moderator_id": BOT_ID,
                    "user_id": call.json()["data"]["user_id"]}]}),
                ),
                ("POST", "/helix/moderation/automod/message") => {
                    StatusCode::NO_CONTENT.into_response()
                }
                ("PUT", "/helix/moderation/shield_mode") => reply(
                    200,
                    json!({"data": [{
                    "is_active": call.json()["is_active"], "moderator_id": BOT_ID,
                    "moderator_login": "simulated_mod", "moderator_name": "SimulatedMod",
                    "last_activated_at": "2026-10-26T12:00:00Z"}]}),
                ),
                ("PATCH", "/helix/chat/settings") => {
                    let mut settings = call.json();
                    settings["broadcaster_id"] = json!(BROADCASTER_ID);
                    settings["moderator_id"] = json!(BOT_ID);
                    reply(200, json!({"data": [settings]}))
                }
                ("POST", "/helix/chat/messages") if m.malformed_chat.load(Ordering::SeqCst) => {
                    reply(200, json!({}))
                }
                ("POST", "/helix/chat/messages") => reply(
                    200,
                    json!({"data": [{"is_sent": !m.drop_chat.load(Ordering::SeqCst)}]}),
                ),
                _ => reply(404, json!({"message": "simulated not found"})),
            };
            response
                .headers_mut()
                .insert("Ratelimit-Limit", "800".parse().expect("header"));
            response
                .headers_mut()
                .insert("Ratelimit-Remaining", "799".parse().expect("header"));
            let reset = m.reset_at_s.load(Ordering::SeqCst);
            if reset != 0 {
                response.headers_mut().insert(
                    "Ratelimit-Reset",
                    reset.to_string().parse().expect("header"),
                );
            }
            if m.exhaust_bucket.load(Ordering::SeqCst) {
                response
                    .headers_mut()
                    .insert("Ratelimit-Remaining", "0".parse().expect("header"));
                response.headers_mut().insert(
                    "Ratelimit-Reset",
                    (chrono::Utc::now().timestamp() + 30)
                        .to_string()
                        .parse()
                        .expect("header"),
                );
            }
            response
        }
        _ => reply(404, json!({"message": "simulated not found"})),
    }
}
