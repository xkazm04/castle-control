//! Mode changes cross a process boundary: native workers have no joined stop API.
use crate::{host::CoreHost, options::Options};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::Manager;

pub const WINDOW_TITLE: &str = "Castle Control · SIMULATED · Dress rehearsal";

pub struct Relaunch {
    options: Options,
    pending: AtomicBool,
}
impl Relaunch {
    pub fn new(options: Options) -> Self {
        Self {
            options,
            pending: AtomicBool::new(false),
        }
    }
}

/// Retain public native configuration, but never replay a device-login request
/// or opt a rehearsal into an engine. A no-login rehearsal leaves to offline core.
fn arguments(options: &Options, rehearsal: bool) -> Vec<String> {
    let mut args = vec!["--relaunch".into()];
    if rehearsal {
        args.push("--rehearsal".into());
    }
    if let Some(native) = &options.native {
        if !native.client_id.is_empty() {
            args.extend([
                "--client-id".into(),
                native.client_id.clone(),
                "--test-channel".into(),
                native.test_channel.clone(),
            ]);
        }
        if rehearsal || !native.client_id.is_empty() {
            args.extend([
                "--obs-port".into(),
                native.obs_port.to_string(),
                "--obs-password-label".into(),
                native.obs_password_label.clone(),
            ]);
            if native.overlay_port != 0 {
                args.extend(["--overlay-port".into(), native.overlay_port.to_string()]);
            }
        }
    }
    args
}

fn relaunch(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    rehearsal: bool,
) -> Result<(), &'static str> {
    if window.label() != "main" {
        return Err("rehearsal requires the main window");
    }
    let state = app
        .try_state::<Relaunch>()
        .ok_or("rehearsal requires the built frontend")?;
    if state.options.rehearsal == rehearsal {
        return Ok(());
    }
    if state.pending.swap(true, Ordering::AcqRel) {
        return Err("desktop relaunch is pending");
    }
    let mut env = app.env();
    env.args_os.truncate(1);
    env.args_os.extend(
        arguments(&state.options, rehearsal)
            .into_iter()
            .map(std::ffi::OsString::from),
    );
    if let Some(host) = app.try_state::<CoreHost>() {
        host.shutdown();
    }
    // Tauri restarts the installed binary with public arguments. The fresh
    // process mints and injects a new capability; no capability crosses restart.
    app.cleanup_before_exit();
    tauri::process::restart(&env);
}

#[tauri::command]
pub fn enter_rehearsal(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
) -> Result<(), &'static str> {
    relaunch(app, window, true)
}

#[tauri::command]
pub fn leave_rehearsal(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
) -> Result<(), &'static str> {
    relaunch(app, window, false)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn toggles_round_trip_public_settings_without_login_or_engine_opt_in() {
        assert!(WINDOW_TITLE.contains("SIMULATED · Dress rehearsal"));
        let native = Options::parse(
            [
                "--client-id",
                "simulatedPublicId",
                "--test-channel",
                "simulated_owner",
                "--overlay-port",
                "17891",
                "--login",
                "--steward-live",
            ]
            .map(String::from),
        )
        .unwrap();
        let entered = Options::parse(arguments(&native, true)).unwrap();
        assert!(entered.rehearsal && !entered.login && !entered.steward_live);
        let left = Options::parse(arguments(&entered, false)).unwrap();
        assert!(!left.rehearsal && !left.login && !left.steward_live);
        assert_eq!(left.native.unwrap().overlay_port, 17891);
        let entered = Options::parse(arguments(&Options::default(), true)).unwrap();
        assert!(entered.rehearsal);
        assert!(
            Options::parse(arguments(&entered, false))
                .unwrap()
                .native
                .is_none()
        );
    }
}
