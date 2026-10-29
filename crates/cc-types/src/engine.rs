use crate::{CliProvider, DataValue, ErrorCode, ErrorEnvelope, Settings};

/// Typed view of the existing settings map; never a second wire-settings format.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EngineSettings {
    pub cli_provider: CliProvider,
    pub live_endpoint: String,
    pub cloud_opt_in: bool,
    pub claude_exe_path: Option<String>,
    pub codex_exe_path: Option<String>,
    pub posture_helper_path: Option<String>,
    pub model_local: Option<String>,
    pub model_claude: Option<String>,
    pub model_codex: Option<String>,
}

impl Default for EngineSettings {
    fn default() -> Self {
        Self {
            cli_provider: CliProvider::ClaudeCli,
            live_endpoint: "http://127.0.0.1:11434/v1".into(),
            cloud_opt_in: false,
            claude_exe_path: None,
            codex_exe_path: None,
            posture_helper_path: None,
            model_local: None,
            model_claude: None,
            model_codex: None,
        }
    }
}

/// The sole parser for engine.* keys. No filesystem access, spawning or network/
/// credential lookup. Optional paths and models have no inferred defaults.
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
    parsed.claude_exe_path = optional_string(settings, "engine.claude_exe_path", absolute_path)?;
    parsed.codex_exe_path = optional_string(settings, "engine.codex_exe_path", absolute_path)?;
    parsed.posture_helper_path =
        optional_string(settings, "engine.posture_helper_path", absolute_path)?;
    parsed.model_local = optional_string(settings, "engine.model_local", model_id)?;
    parsed.model_claude = optional_string(settings, "engine.model_claude", model_id)?;
    parsed.model_codex = optional_string(settings, "engine.model_codex", model_id)?;
    Ok(parsed)
}

fn optional_string(
    settings: &Settings,
    key: &str,
    accepts: fn(&str) -> bool,
) -> Result<Option<String>, ErrorEnvelope> {
    match settings.values.get(key) {
        None => Ok(None),
        Some(DataValue::String(value)) if accepts(value) => Ok(Some(value.clone())),
        Some(_) => Err(invalid(key)),
    }
}

fn absolute_path(value: &str) -> bool {
    // Native path rules: on Windows a root without a drive is not absolute.
    std::path::Path::new(value).is_absolute() && !value.chars().any(char::is_control)
}

fn model_id(value: &str) -> bool {
    !value.is_empty() && value.len() <= 128 && value.bytes().all(|b| b.is_ascii_graphic())
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
