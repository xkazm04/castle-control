use cc_twitch::DeviceLogin;
use cc_types::{ErrorCode, ErrorEnvelope};
use std::sync::Arc;

/// Native UI handoff: the RPC returns status only; codes never enter RPC or logs.
pub type LoginPresenter = Arc<dyn Fn(DeviceLogin) -> Result<(), ErrorEnvelope> + Send + Sync>;

pub fn desktop_login_presenter() -> LoginPresenter {
    Arc::new(present)
}

#[cfg(target_os = "windows")]
fn present(challenge: DeviceLogin) -> Result<(), ErrorEnvelope> {
    use std::io::Write;
    use std::os::windows::process::CommandExt;
    use std::process::{Command, Stdio};
    // Fixed script; challenge JSON goes over stdin, never interpolated into code/argv.
    let mut child = Command::new("powershell.exe")
        .args(["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command",
            "$ErrorActionPreference='Stop'; $d=[Console]::In.ReadToEnd() | ConvertFrom-Json; Add-Type -AssemblyName System.Windows.Forms; Start-Process -FilePath $d.verification_uri; [void][System.Windows.Forms.MessageBox]::Show(('Enter this code in Twitch: '+$d.user_code), 'Castle Control Twitch login')"])
        .creation_flags(0x08000000)
        .stdin(Stdio::piped()).stdout(Stdio::null()).stderr(Stdio::null())
        .spawn().map_err(|_| unavailable())?;
    let json = serde_json::to_vec(&challenge).map_err(|_| unavailable())?;
    if child
        .stdin
        .take()
        .ok_or_else(unavailable)?
        .write_all(&json)
        .is_err()
    {
        let _ = child.kill();
        let _ = child.wait();
        return Err(unavailable());
    }
    // Reap the UI helper when dismissed. It holds no access/refresh token.
    std::thread::spawn(move || {
        let _ = child.wait();
    });
    Ok(())
}
#[cfg(not(target_os = "windows"))]
fn present(_: DeviceLogin) -> Result<(), ErrorEnvelope> {
    Err(unavailable())
}
fn unavailable() -> ErrorEnvelope {
    ErrorEnvelope::new(
        ErrorCode::Unavailable,
        "native Twitch login dialog unavailable; supply a native LoginPresenter",
    )
}
