//! Developer-only headless core: the native rehearsal composition with no
//! Twitch, no OBS and an isolated data root, driven over loopback JSON-RPC.
//!
//! Usage: `cc-headless <data_root>`. The caller owns the data root (creates and
//! removes it); the core only writes beneath it.
//!
//! - Twitch: an empty client id keeps the bridge inert, rehearsal refuses
//!   `auth.twitch.start`/`revoke` in the registry, and the login presenter
//!   refuses too, so no login or keychain credential is ever reached.
//! - OBS: port 0 means the core never dials a peer, the password door refuses
//!   every read and write (no OS keychain), and this launcher refuses the OBS
//!   mutations at its HTTP door, so `obs.status.get` stays `{"connected":false}`
//!   and the owner's OBS is unreachable.
//! - Chat: only generated SIMULATED traffic, from `rehearsal.*` RPC. Stdin is
//!   not a command channel; it only keeps the core alive until it closes.
//!
//! stdout carries exactly one handoff line `{endpoint, token, overlay_origin}`
//! (the e2e-lots shape) and nothing else. The token is never logged or written.
use axum::{
    body::{Body, Bytes},
    http::{Request, StatusCode},
    middleware::{self, Next},
    response::{IntoResponse, Response},
};
use cc_core::{AppState, NativeConfig, NativeServices, router};
use cc_types::{ErrorCode, ErrorEnvelope, RpcRequest};
use std::{io::Write, path::PathBuf, process::ExitCode, sync::Arc};
use tokio::io::AsyncReadExt;
use zeroize::Zeroizing;

const USAGE: &str = "usage: cc-headless <data_root>";
const EVENT_CAPACITY: usize = 1024;
const BODY_LIMIT: usize = 1 << 20;

type Failure = Box<dyn std::error::Error + Send + Sync>;

/// The OBS password door of a core that has no OBS: nothing is read or stored.
struct NoObsPasswords;

impl cc_obs::PasswordReader for NoObsPasswords {
    fn read(&self, _label: &str) -> Result<Zeroizing<String>, cc_obs::Error> {
        Err(cc_obs::Error::Keychain)
    }
}

impl cc_obs::PasswordStore for NoObsPasswords {
    fn write(&self, _label: &str, _password: &str) -> Result<(), cc_obs::Error> {
        Err(cc_obs::Error::Keychain)
    }
}

fn refused(request: &RpcRequest) -> bool {
    matches!(
        request,
        RpcRequest::ObsConnect(_)
            | RpcRequest::ObsSourceCreate(_)
            | RpcRequest::ObsSceneEnsure(_)
            | RpcRequest::ObsRehearsalClear(_)
    )
}

/// Refuse OBS mutations before the registry sees them: the headless core keeps
/// OBS disconnected, and the owner's OBS is an armed target. The request is
/// read through the contract's own parser; anything it rejects passes on to
/// the server, which answers with its usual envelope.
async fn refuse_obs(request: Request<Body>, next: Next) -> Response {
    if request.uri().path() != "/rpc" {
        return next.run(request).await;
    }
    let (parts, body) = request.into_parts();
    let Ok(bytes): Result<Bytes, _> = axum::body::to_bytes(body, BODY_LIMIT).await else {
        let envelope = ErrorEnvelope::new(ErrorCode::Invalid, "request body too large");
        return (StatusCode::PAYLOAD_TOO_LARGE, axum::Json(envelope)).into_response();
    };
    if cc_types::parse_request(&bytes).is_ok_and(|request| refused(&request)) {
        let envelope = ErrorEnvelope::new(
            ErrorCode::BlockedByPolicy,
            "the headless core has no OBS connection",
        );
        return (StatusCode::FORBIDDEN, axum::Json(envelope)).into_response();
    }
    next.run(Request::from_parts(parts, Body::from(bytes)))
        .await
}

fn data_root(mut args: impl Iterator<Item = std::ffi::OsString>) -> Option<PathBuf> {
    let _program = args.next();
    let root = args.next()?;
    if args.next().is_some() || root.is_empty() {
        return None;
    }
    Some(PathBuf::from(root))
}

async fn compose(root: &std::path::Path) -> Result<(Arc<NativeServices>, Arc<AppState>), Failure> {
    std::fs::create_dir_all(root)?;
    let services = NativeServices::new_with_obs_password_store(
        NativeConfig {
            // Empty client id: the bridge never opens a Twitch socket.
            twitch: cc_twitch::TwitchConfig::default(),
            obs: cc_obs::Config {
                // Port 0 is refused before any socket or password read.
                port: 0,
                password_label: "cc-headless-no-obs".into(),
            },
            overlay_port: 0,
        },
        cc_store::Store::open(root.join("native"))?,
        Arc::new(|_| {
            Err(ErrorEnvelope::new(
                ErrorCode::BlockedByPolicy,
                "the headless core has no Twitch login",
            ))
        }),
        Arc::new(NoObsPasswords),
    )
    .await
    .map_err(|_| "native services unavailable")?;
    let state = services
        .app_rehearsal(EVENT_CAPACITY, root)
        .map_err(|_| "rehearsal app unavailable")?;
    Ok((services, state))
}

/// Wait for the owner to close stdin (or die). Input bytes are discarded.
async fn until_stdin_closes() {
    let mut stdin = tokio::io::stdin();
    let mut buffer = [0_u8; 1024];
    while matches!(stdin.read(&mut buffer).await, Ok(read) if read > 0) {}
}

async fn run(root: PathBuf) -> Result<(), Failure> {
    let (services, state) = compose(&root).await?;
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await?;
    let address = listener.local_addr()?;
    let app = router(state.clone()).layer(middleware::from_fn(refuse_obs));
    let (stop, stopped) = tokio::sync::oneshot::channel::<()>();
    let server = tokio::spawn(async move {
        axum::serve(listener, app)
            .with_graceful_shutdown(async move {
                let _ = stopped.await;
            })
            .await
    });

    // The sole capability handoff goes to the owner's pipe, never to a file,
    // URL or diagnostic. AppState mints a new capability for each launch.
    let line = serde_json::json!({
        "endpoint": format!("http://{address}/"),
        "token": state.session_token(),
        "overlay_origin": services.overlay_url().trim_end_matches('/'),
    });
    let mut stdout = std::io::stdout().lock();
    writeln!(stdout, "{line}")?;
    stdout.flush()?;
    drop(stdout);
    drop(line);

    until_stdin_closes().await;
    // Stops any rehearsal session and its simulated chat before the server.
    state.shutdown();
    let _ = stop.send(());
    let served = server.await;
    drop(state);
    drop(services);
    served??;
    Ok(())
}

fn main() -> ExitCode {
    let Some(root) = data_root(std::env::args_os()) else {
        eprintln!("{USAGE}");
        return ExitCode::from(2);
    };
    let runtime = match tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
    {
        Ok(runtime) => runtime,
        Err(_) => {
            eprintln!("cc-headless: async runtime unavailable");
            return ExitCode::FAILURE;
        }
    };
    match runtime.block_on(run(root)) {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            // Startup and shutdown errors are fixed texts or io/store errors;
            // none carries the session capability.
            eprintln!("cc-headless: {error}");
            ExitCode::FAILURE
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(values: &[&str]) -> Option<PathBuf> {
        data_root(values.iter().map(std::ffi::OsString::from))
    }

    #[test]
    fn data_root_is_exactly_one_argument() {
        assert_eq!(args(&["cc-headless", "root"]), Some(PathBuf::from("root")));
        assert_eq!(args(&["cc-headless"]), None);
        assert_eq!(args(&["cc-headless", ""]), None);
        assert_eq!(args(&["cc-headless", "a", "b"]), None);
    }

    #[test]
    fn obs_mutations_are_refused_and_reads_pass() {
        let parse = |body: &str| cc_types::parse_request(body.as_bytes()).unwrap();
        assert!(refused(&parse(
            r#"{"method":"obs.connect","params":{"host":"127.0.0.1","port":4455,"password":"SIMULATED","remember":false}}"#
        )));
        assert!(!refused(&parse(
            r#"{"method":"obs.status.get","params":{}}"#
        )));
        assert!(!refused(&parse(r#"{"method":"status.get","params":{}}"#)));
    }
}
