use crate::{CliProvider, DataValue, ErrorCode, ErrorEnvelope, Settings};

/// Typed view of the existing settings map; never a second wire-settings format.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EngineSettings {
    pub cli_provider: CliProvider,
    pub live_endpoint: String,
    pub cloud_opt_in: bool,
}

impl Default for EngineSettings {
    fn default() -> Self {
        Self {
            cli_provider: CliProvider::ClaudeCli,
            live_endpoint: "http://127.0.0.1:11434/v1".into(),
            cloud_opt_in: false,
        }
    }
}

/// The sole parser for engine.* keys. No network calls or credential lookup.
/// Cloud authorization and endpoint admission remain the engine's responsibility.
pub fn parse_engine_settings(settings: &Settings) -> Result<EngineSettings, ErrorEnvelope> {
    let mut parsed = EngineSettings::default();
    if let Some(value) = settings.values.get("engine.cli_provider") {
        parsed.cli_provider = serde_json::from_value(
            serde_json::to_value(value).map_err(|_| invalid("engine.cli_provider"))?,
        )
        .map_err(|_| invalid("engine.cli_provider"))?;
    }
    if let Some(value) = settings.values.get("engine.live_endpoint") {
        match value {
            DataValue::String(url) if http_endpoint(url) => parsed.live_endpoint.clone_from(url),
            _ => return Err(invalid("engine.live_endpoint")),
        }
    }
    if let Some(value) = settings.values.get("engine.cloud_opt_in") {
        match value {
            DataValue::Bool(enabled) => parsed.cloud_opt_in = *enabled,
            _ => return Err(invalid("engine.cloud_opt_in")),
        }
    }
    Ok(parsed)
}

fn invalid(key: &str) -> ErrorEnvelope {
    // Do not echo untrusted settings, which may accidentally contain credentials.
    ErrorEnvelope::new(ErrorCode::Invalid, format!("invalid {key}"))
}

/// HTTP(S) endpoints with DNS/IP hosts, an optional port and path/query.
/// Credentials, fragments, whitespace, bad escapes and ambiguous hosts are refused.
fn http_endpoint(url: &str) -> bool {
    let Some(rest) = url
        .strip_prefix("http://")
        .or_else(|| url.strip_prefix("https://"))
    else {
        return false;
    };
    if !url.is_ascii()
        || url
            .bytes()
            .any(|b| b.is_ascii_control() || b.is_ascii_whitespace())
        || url.contains(['\\', '#', '@', '<', '>', '"', '`', '{', '}', '^', '|'])
    {
        return false;
    }
    let authority = rest.split(['/', '?']).next().unwrap_or_default();
    let (host, port) = if let Some(ipv6) = authority.strip_prefix('[') {
        let Some((host, tail)) = ipv6.split_once(']') else {
            return false;
        };
        if host.parse::<std::net::Ipv6Addr>().is_err() {
            return false;
        }
        let port = if tail.is_empty() {
            None
        } else {
            let Some(port) = tail.strip_prefix(':') else {
                return false;
            };
            Some(port)
        };
        (host, port)
    } else {
        authority
            .split_once(':')
            .map_or((authority, None), |(host, port)| (host, Some(port)))
    };
    if let Some(port) = port
        && (port.is_empty()
            || !port.bytes().all(|b| b.is_ascii_digit())
            || port.parse::<u16>().is_err())
    {
        return false;
    }
    if !authority.starts_with('[') {
        if host.is_empty() || host.len() > 253 {
            return false;
        }
        if host.bytes().all(|b| b.is_ascii_digit() || b == b'.') {
            if host.parse::<std::net::Ipv4Addr>().is_err() {
                return false;
            }
        } else if !host
            .strip_suffix('.')
            .unwrap_or(host)
            .split('.')
            .all(|label| {
                !label.is_empty()
                    && label.len() <= 63
                    && !label.starts_with('-')
                    && !label.ends_with('-')
                    && label
                        .bytes()
                        .all(|b| b.is_ascii_alphanumeric() || b == b'-')
            })
        {
            return false;
        }
    }
    let bytes = rest.as_bytes();
    bytes.iter().enumerate().all(|(i, b)| {
        *b != b'%'
            || bytes
                .get(i + 1..i + 3)
                .is_some_and(|pair| pair.iter().all(u8::is_ascii_hexdigit))
    })
}
