use axum::http::{HeaderMap, header};
use rand::RngCore;

/// Never Debug/Serialize: this capability is handed only to the desktop shell.
pub(crate) struct SessionToken(String);

impl SessionToken {
    pub fn mint() -> Self {
        let mut bytes = [0_u8; 32];
        rand::rng().fill_bytes(&mut bytes);
        Self(bytes.iter().map(|b| format!("{b:02x}")).collect())
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }

    pub fn permits(&self, headers: &HeaderMap, websocket: bool) -> bool {
        let bearer = headers
            .get(header::AUTHORIZATION)
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.strip_prefix("Bearer "));
        if bearer.is_some_and(|v| self.matches(v)) {
            return true;
        }
        // Browser WebSockets cannot set Authorization. Negotiate only cc-events;
        // the capability protocol is checked, never echoed or put in a URL/log.
        websocket
            && headers
                .get(header::SEC_WEBSOCKET_PROTOCOL)
                .and_then(|v| v.to_str().ok())
                .is_some_and(|v| {
                    v.split(',')
                        .filter_map(|p| p.trim().strip_prefix("cc-session."))
                        .any(|p| self.matches(p))
                })
    }

    fn matches(&self, candidate: &str) -> bool {
        if candidate.len() != self.0.len() {
            return false;
        }
        self.0
            .bytes()
            .zip(candidate.bytes())
            .fold(0, |diff, (a, b)| diff | (a ^ b))
            == 0
    }
}

pub(crate) fn origin_allowed(headers: &HeaderMap) -> bool {
    match headers.get(header::ORIGIN) {
        None => true,
        Some(origin) => origin
            .to_str()
            .is_ok_and(|v| ["tauri://localhost", "http://tauri.localhost"].contains(&v)),
    }
}
