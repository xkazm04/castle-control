//! Operator-only spike configuration and pasteable, credential-free step reports.
use std::path::PathBuf;

pub const STEPS: [&str; 6] = [
    "device_login",
    "live_chat",
    "shadow_verdict_stub",
    "timeout_and_undo",
    "obs_source",
    "socket_drop_gap",
];
#[derive(Debug)]
pub struct Options {
    pub client_id: String,
    pub test_channel: String,
    pub target_login: String,
    pub scene: String,
    pub obs_port: u16,
    pub obs_password_label: String,
    pub overlay_port: u16,
    pub data_dir: PathBuf,
    pub wait_seconds: u64,
}
impl Options {
    pub fn parse(args: impl IntoIterator<Item = String>) -> Result<Self, &'static str> {
        let mut values = std::collections::BTreeMap::new();
        let mut args = args.into_iter();
        while let Some(key) = args.next() {
            if ![
                "--client-id",
                "--test-channel",
                "--target-login",
                "--scene",
                "--obs-port",
                "--obs-password-label",
                "--overlay-port",
                "--data-dir",
                "--wait-seconds",
            ]
            .contains(&key.as_str())
            {
                return Err("unknown spike option");
            }
            let value = args.next().ok_or("spike option needs a value")?;
            if value.starts_with("--") || values.insert(key, value).is_some() {
                return Err("invalid or repeated spike option");
            }
        }
        // Check before any store, network, login or moderation operation.
        let target_login = values
            .remove("--target-login")
            .ok_or("armed timeout requires explicit --target-login for an owned test account")?;
        let test_channel = values
            .remove("--test-channel")
            .ok_or("--test-channel is required")?;
        if !login(&target_login)
            || !login(&test_channel)
            || target_login.eq_ignore_ascii_case(&test_channel)
        {
            return Err("target must be a different, valid owned test login");
        }
        let client_id = values
            .remove("--client-id")
            .filter(|v| !v.trim().is_empty())
            .ok_or("--client-id is required")?;
        let scene = values
            .remove("--scene")
            .filter(|v| !v.trim().is_empty())
            .ok_or("--scene is required")?;
        let obs_password_label = values
            .remove("--obs-password-label")
            .filter(|v| !v.trim().is_empty())
            .ok_or("--obs-password-label is required")?;
        let data_dir = values
            .remove("--data-dir")
            .filter(|v| !v.trim().is_empty())
            .ok_or("--data-dir is required")?
            .into();
        let obs_port = values
            .remove("--obs-port")
            .unwrap_or_else(|| "4455".into())
            .parse()
            .map_err(|_| "invalid OBS port")?;
        let overlay_port = values
            .remove("--overlay-port")
            .unwrap_or_else(|| "0".into())
            .parse()
            .map_err(|_| "invalid overlay port")?;
        let wait_seconds = values
            .remove("--wait-seconds")
            .unwrap_or_else(|| "300".into())
            .parse()
            .map_err(|_| "invalid wait budget")?;
        if obs_port == 0 || !(1..=900).contains(&wait_seconds) {
            return Err("invalid spike budget or port");
        }
        Ok(Self {
            client_id,
            test_channel: test_channel.to_ascii_lowercase(),
            target_login: target_login.to_ascii_lowercase(),
            scene,
            obs_port,
            obs_password_label,
            overlay_port,
            data_dir,
            wait_seconds,
        })
    }
}
fn login(value: &str) -> bool {
    (1..=25).contains(&value.len())
        && value
            .bytes()
            .all(|v| v.is_ascii_alphanumeric() || v == b'_')
}
pub fn report(step: &'static str, passed: bool) -> String {
    let at: String = cc_types::Timestamp::now().into();
    format!("{at} {} {step}", if passed { "PASS" } else { "FAIL" })
}
pub fn target_message(
    ingress: crate::ChatIngress,
    expected: &str,
) -> Result<Option<cc_twitch::ChatMessage>, &'static str> {
    if !ingress.login.eq_ignore_ascii_case(expected) || ingress.message.text != "!castle-spike" {
        return Ok(None);
    }
    if ingress.message.viewer.is_mod {
        return Err("target must be a non-moderator owned test account");
    }
    cc_store::TwitchUserId::parse(&ingress.message.viewer.id).map_err(|_| "invalid target ID")?;
    Ok(Some(ingress.message))
}
