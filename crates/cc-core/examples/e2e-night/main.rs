//! Test-only night core: the real native composition (Lots, Gatehouse, Beacons,
//! the render host and overlay listener, obs.* and status) on simulated Twitch.
//!
//! - Twitch: no bridge connection. An empty client id means the bridge never
//!   opens a socket, and `auth.twitch.*` is refused at this launcher's HTTP door
//!   so nothing can reach the owner's keychain credential.
//! - Chat: generated SIMULATED messages enter through the public Rust seam
//!   `ShadowPipeline::start`, the same post-bridge door the native host uses.
//!   Node drives them with stdin lines: `join <count>` and `ballots <count>`.
//! - OBS: `CC_NIGHT_OBS_PORT` and `CC_NIGHT_OBS_PASSWORD` (in memory) select an
//!   isolated OBS; without them a generated fake OBS peer is started. Either way
//!   the core reaches OBS through the authenticating relay in `obs.rs`.
//! - Lots randomness: `CC_NIGHT_LOTS_BEACON=live` (default) writes the product's
//!   own `live-quicknet` opt-in into the temporary data root, so a seal uses the
//!   public drand quicknet over HTTPS. `off` leaves the native NoBeacon.
//! - `CC_NIGHT_REHEARSAL=1` selects app_rehearsal instead of the native app.
//!   Its own generated-chat consumer owns the pipeline; stdin only keeps it alive.
//!   It explicitly selects real quicknet regardless of the native opt-in file.
//!
//! No RPC method is added. stdout carries one capability handoff line for the
//! Node owner, then only `{"obs":...}` metadata lines.
mod ballots;
mod obs;

use axum::{
    body::{Body, Bytes},
    http::{Request, StatusCode},
    middleware::{self, Next},
    response::{IntoResponse, Response},
};
use cc_core::{AppState, ChatIngress, NativeConfig, NativeServices, live::RulesOnly, router};
use std::{io::Write, sync::Arc};
use tokio::{
    io::{AsyncBufReadExt, BufReader},
    sync::broadcast,
};
use zeroize::Zeroizing;

type LauncherResult = Result<(), Box<dyn std::error::Error + Send + Sync>>;
const REFUSED: &[&str] = &["auth.twitch.start", "auth.twitch.revoke"];

/// Refuse the Twitch login and revoke methods before the registry sees them:
/// revoke would retire the keychain credential, start would open a login.
async fn refuse_twitch_auth(request: Request<Body>, next: Next) -> Response {
    if request.uri().path() != "/rpc" {
        return next.run(request).await;
    }
    let (parts, body) = request.into_parts();
    let Ok(bytes): Result<Bytes, _> = axum::body::to_bytes(body, 1 << 20).await else {
        return StatusCode::PAYLOAD_TOO_LARGE.into_response();
    };
    let method = serde_json::from_slice::<serde_json::Value>(&bytes)
        .ok()
        .and_then(|value| value["method"].as_str().map(str::to_owned));
    if method.is_some_and(|method| REFUSED.contains(&method.as_str())) {
        let envelope = cc_types::ErrorEnvelope::new(
            cc_types::ErrorCode::BlockedByPolicy,
            "the night core has no Twitch login",
        );
        return (StatusCode::BAD_REQUEST, axum::Json(envelope)).into_response();
    }
    next.run(Request::from_parts(parts, Body::from(bytes)))
        .await
}

fn chat(sequence: u64, user: u64, text: &str) -> ChatIngress {
    ChatIngress {
        simulated: true,
        login: format!("simulated_viewer_{user}"),
        message: cc_twitch::ChatMessage {
            id: format!("simulated-night-{sequence}"),
            at: cc_types::Timestamp::now().into(),
            viewer: cc_twitch::Viewer {
                id: user.to_string(),
                name: format!("simulated_viewer_{user}"),
                is_mod: false,
                sub_tier: None,
            },
            text: text.into(),
        },
    }
}

/// Every generated message carries SIMULATED in its text and a simulated login.
async fn drive_chat(sender: broadcast::Sender<ChatIngress>) -> LauncherResult {
    let mut lines = BufReader::new(tokio::io::stdin()).lines();
    let mut sequence = 0_u64;
    let mut user = 9000_u64;
    while let Some(line) = lines.next_line().await? {
        let mut words = line.split_whitespace();
        let (command, count) = (words.next(), words.next().and_then(|n| n.parse().ok()));
        let count: u64 = count.unwrap_or(0).min(500);
        for index in 0..count {
            sequence += 1;
            user += 1;
            let text = match command {
                Some("join") => "SIMULATED !join".to_owned(),
                Some("ballots") => ballots::text(index).to_owned(),
                _ => break,
            };
            sender.send(chat(sequence, user, &text))?;
        }
    }
    // EOF: the Node owner closed the pipe (or died). Exit the launcher.
    Ok(())
}

async fn obs_upstream() -> Result<(u16, Zeroizing<String>), Box<dyn std::error::Error + Send + Sync>>
{
    match std::env::var("CC_NIGHT_OBS_PORT") {
        Ok(port) => {
            let port: u16 = port.parse()?;
            if port == obs::OWNER_PORT || port == 0 {
                return Err("CC_NIGHT_OBS_PORT must be an isolated OBS, never 4455".into());
            }
            let password = Zeroizing::new(
                std::env::var("CC_NIGHT_OBS_PASSWORD")
                    .map_err(|_| "CC_NIGHT_OBS_PASSWORD is required with CC_NIGHT_OBS_PORT")?,
            );
            Ok((port, password))
        }
        Err(_) => {
            let password = Zeroizing::new(
                std::env::var("CC_NIGHT_OBS_PASSWORD").unwrap_or_else(|_| obs::random_hex(16)),
            );
            let port = obs::fake_peer(password.clone()).await?;
            Ok((port, password))
        }
    }
}

#[tokio::main]
async fn main() -> LauncherResult {
    // The Node owner supplies a fresh temporary parent and removes it even if
    // the process must be killed. Rust also owns its child directory normally.
    let parent = std::env::args_os()
        .nth(1)
        .ok_or("temporary parent required")?;
    let directory = tempfile::tempdir_in(parent)?;
    let root = directory.path();
    match std::env::var("CC_NIGHT_LOTS_BEACON").as_deref() {
        Ok("off") => {}
        Ok("live") | Err(_) => std::fs::write(root.join("live-quicknet"), "enable-live-quicknet")?,
        Ok(_) => return Err("CC_NIGHT_LOTS_BEACON must be live or off".into()),
    }
    let (upstream, password) = obs_upstream().await?;
    let relay = obs::relay(upstream, password).await?;
    let rehearsal = std::env::var("CC_NIGHT_REHEARSAL").as_deref() == Ok("1");

    let services = NativeServices::new(
        NativeConfig {
            // Empty client id: the bridge never opens a Twitch socket.
            twitch: cc_twitch::TwitchConfig::default(),
            obs: cc_obs::Config {
                port: relay,
                // The relay sends no challenge, so this label is never read.
                password_label: "e2e-night-relay".into(),
            },
            overlay_port: 0,
        },
        cc_store::Store::open(root.join("native"))?,
        Arc::new(|_| {
            Err(cc_types::ErrorEnvelope::new(
                cc_types::ErrorCode::BlockedByPolicy,
                "the night core has no Twitch login",
            ))
        }),
    )
    .await
    .map_err(|_| "native services unavailable")?;
    let state: Arc<AppState> = if rehearsal {
        services.app_rehearsal(1024, root)
    } else {
        services.app_with_data_dir(1024, root)
    }
    .map_err(|_| "night app unavailable")?;
    let pipeline = state
        .registry
        .shadow_pipeline()
        .map_err(|_| "shadow pipeline unavailable")?
        .ok_or("native composition has no shadow pipeline")?;
    let (sender, receiver) = broadcast::channel(512);
    let worker = if rehearsal {
        None
    } else {
        Some(
            pipeline
                .start(Some(receiver), Arc::new(RulesOnly))
                .ok_or("chat worker did not start")?,
        )
    };

    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await?;
    let address = listener.local_addr()?;
    let app = router(state.clone()).layer(middleware::from_fn(refuse_twitch_auth));
    let (stop, stopped) = tokio::sync::oneshot::channel::<()>();
    let server = tokio::spawn(async move {
        axum::serve(listener, app)
            .with_graceful_shutdown(async move {
                let _ = stopped.await;
            })
            .await
    });

    // The sole capability handoff is piped to Node memory, never to a browser
    // URL, file or diagnostic. AppState mints a new capability for each launch.
    println!(
        "{}",
        serde_json::json!({
            "endpoint": format!("http://{address}/"),
            "token": state.session_token(),
            "overlay_origin": services.overlay_url().trim_end_matches('/'),
            "obs_port": upstream,
        })
    );
    std::io::stdout().flush()?;

    let result = drive_chat(sender).await;
    state.shutdown();
    let _ = stop.send(());
    if let Some(worker) = worker {
        worker.abort();
    }
    let _ = server.await;
    drop(state);
    drop(services);
    result
}
