use serde::Serialize;
use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use tauri::Url;

#[cfg(target_os = "windows")]
pub const BUILT_ORIGIN: &str = "http://tauri.localhost";
#[cfg(not(target_os = "windows"))]
pub const BUILT_ORIGIN: &str = "tauri://localhost";

// Deliberately not Debug: the serialized value is a capability, never a diagnostic.
#[derive(Serialize)]
#[serde(untagged)]
pub enum Launch<'a> {
    Core {
        mode: &'static str,
        endpoint: String,
        session_token: &'a str,
        #[serde(skip_serializing_if = "Option::is_none")]
        steward: Option<&'static str>,
    },
    Fixture {
        mode: &'static str,
    },
}

impl<'a> Launch<'a> {
    pub fn core(
        address: SocketAddr,
        session_token: &'a str,
        steward_live: bool,
    ) -> Result<Self, &'static str> {
        if address.ip() != IpAddr::V4(Ipv4Addr::LOCALHOST) || address.port() == 0 {
            return Err("desktop requires a bound 127.0.0.1 endpoint");
        }
        if session_token.len() != 64
            || !session_token
                .bytes()
                .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
        {
            return Err("invalid desktop session capability");
        }
        Ok(Self::Core {
            mode: "core",
            endpoint: format!("http://{address}"),
            session_token,
            steward: steward_live.then_some("live"),
        })
    }

    pub fn fixture() -> Self {
        Self::Fixture { mode: "fixture" }
    }

    pub fn script(&self, origin: &Url) -> Result<String, &'static str> {
        let json = serde_json::to_string(self).map_err(|_| "desktop injection unavailable")?;
        // Navigation and this main-frame guard both prevent handing the capability
        // to an external document. The frontend consumes and deletes the property.
        let scheme = serde_json::to_string(&format!("{}:", origin.scheme())).unwrap();
        let host = serde_json::to_string(origin.host_str().unwrap_or("")).unwrap();
        let port = serde_json::to_string(&origin.port().map(|p| p.to_string()).unwrap_or_default())
            .unwrap();
        Ok(format!(
            "if (window === window.top && location.protocol === {scheme} && location.hostname === {host} && location.port === {port}) {{ window.__CASTLE_CONTROL_LAUNCH__ = {json}; }}"
        ))
    }
}

pub fn same_origin(candidate: &Url, trusted: &Url) -> bool {
    candidate.scheme() == trusted.scheme()
        && candidate.host_str() == trusted.host_str()
        && candidate.port_or_known_default() == trusted.port_or_known_default()
        && candidate.username().is_empty()
        && candidate.password().is_none()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn non_loopback_unbound_or_malformed_capabilities_never_produce_a_launch() {
        let token = "a".repeat(64); // Generated simulated input, never an account credential.
        for address in [
            "0.0.0.0:7",
            "192.0.2.1:7",
            "[::1]:7",
            "127.0.0.2:7",
            "127.0.0.1:0",
        ] {
            assert!(Launch::core(address.parse().unwrap(), &token, false).is_err());
        }
        assert!(Launch::core("127.0.0.1:7".parse().unwrap(), "invalid", true).is_err());
    }

    #[test]
    fn fixture_is_exactly_one_key_and_external_navigation_is_refused() {
        assert_eq!(
            serde_json::to_value(Launch::fixture()).unwrap(),
            serde_json::json!({"mode":"fixture"})
        );
        let trusted = Url::parse(BUILT_ORIGIN).unwrap();
        assert!(same_origin(&trusted.join("/#/studio").unwrap(), &trusted));
        for url in [
            "https://example.invalid",
            "http://127.0.0.1:5173",
            "http://tauri.localhost.evil.invalid",
            "http://tauri.localhost:1234",
        ] {
            assert!(!same_origin(&Url::parse(url).unwrap(), &trusted));
        }
    }
}
