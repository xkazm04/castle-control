use crate::{
    NativeConfig, NativeServices, bind, desktop_login_presenter,
    spike::{Options, STEPS, report},
};
use cc_store::{DecisionAction, LedgerEvent, Store, Timestamp, TwitchUserId};
use cc_twitch::{BridgeState, TwitchConfig};
use cc_types::{DecisionId, EventKind, ObsSourceParams};
use std::{sync::Arc, time::Duration};

/// Only this feature-gated operator runner can call the fault hook. No RPC does.
pub async fn run(options: Options) -> Result<(), &'static str> {
    let store = Store::open(&options.data_dir).map_err(|_| "spike store unavailable")?;
    let services = NativeServices::new(
        NativeConfig {
            twitch: TwitchConfig {
                client_id: options.client_id.clone(),
                channel: options.test_channel.clone(),
                modules: vec!["gatehouse".into()],
            },
            obs: cc_obs::Config {
                port: options.obs_port,
                password_label: options.obs_password_label.clone(),
            },
            overlay_port: options.overlay_port,
        },
        store,
        desktop_login_presenter(),
    )
    .await
    .map_err(|_| "native services unavailable")?;
    let app = services.app(1024).map_err(|_| "core setup failed")?;
    let (address, server) = bind(app.clone(), ([127, 0, 0, 1], 0).into())
        .await
        .map_err(|_| "core bind failed")?;
    let server_task = tokio::spawn(server);
    println!(
        "Core listening on {address}; session capability stays native. No live result is pre-certified."
    );
    let result = steps(&services, &app, &options).await;
    app.shutdown();
    server_task.abort();
    result
}
async fn steps(
    services: &Arc<NativeServices>,
    app: &Arc<crate::AppState>,
    options: &Options,
) -> Result<(), &'static str> {
    let budget = Duration::from_secs(options.wait_seconds);
    // Subscribe before login: no first-message race after connection.
    let mut chat = services.subscribe_chat();
    let login = async {
        services
            .start_login()
            .await
            .map_err(|_| "device login could not start")?;
        loop {
            let status = services.bridge.status();
            if status.state == BridgeState::Error {
                return Err("device login failed");
            }
            if status.state == BridgeState::Connected {
                if status.bot_login.as_deref() != Some(options.test_channel.as_str()) {
                    return Err("spike requires the test channel broadcaster login");
                }
                return Ok(());
            }
            tokio::time::sleep(Duration::from_millis(100)).await;
        }
    };
    checked(0, timed(budget, login).await)?;
    println!(
        "Send !castle-spike from the explicit owned target account in the test channel. Only this fixed marker is echoed; other chat is not logged."
    );
    let target = timed(budget, async {
        loop {
            let ingress = chat
                .recv()
                .await
                .map_err(|_| "chat receiver lagged or closed")?;
            if let Some(message) = crate::spike::target_message(ingress, &options.target_login)? {
                return Ok(message);
            }
        }
    })
    .await;
    let message = checked(1, target)?;
    println!("Live chat echo: !castle-spike (received from the explicit test target)");
    let shadow = append(services, &message.viewer.id, DecisionAction::WouldAct);
    checked(2, shadow)?;
    println!("Shadow verdict stub: pass; would_act recorded, no classifier (M1 pending).");
    // One short timeout only, then undo immediately. No retry/escalation to ban.
    // Even a failed/uncertain timeout response is followed by an undo attempt.
    let applied = services
        .bridge
        .timeout(&message.viewer.id, 30, "Castle Control owner test spike")
        .await;
    let undone = services.bridge.unban(&message.viewer.id).await;
    let moderation = match (applied, undone) {
        (_, Err(_)) => Err("undo unconfirmed: owner must check the test account in Twitch"),
        (Err(_), Ok(())) => Err("timeout unconfirmed; undo requested"),
        (Ok(()), Ok(())) => append(services, &message.viewer.id, DecisionAction::TimedOut)
            .and_then(|_| append(services, &message.viewer.id, DecisionAction::Undone)),
    };
    checked(3, moderation)?;
    checked(
        4,
        services
            .create_source(&ObsSourceParams {
                scene_name: options.scene.clone(),
                source_name: format!("Castle Control spike {}", ulid::Ulid::new()),
                url: services.overlay_url(),
                width: 1280,
                height: 720,
            })
            .await
            .map_err(|_| "OBS source creation failed"),
    )?;
    println!(
        "OBS acknowledged CreateInput. Owner must visually confirm the static page. Overlay remains until Enter or Ctrl+C after recovery."
    );
    let cursor = app
        .events
        .since(0)
        .map_err(|_| "event cursor unavailable")?
        .last()
        .map_or(0, |e| e.seq);
    services.bridge.force_socket_drop();
    let recovered = timed(budget, async {
        loop {
            let events = app
                .events
                .since(cursor)
                .map_err(|_| "event window unavailable")?;
            if events.iter().any(|e| e.kind == EventKind::Resync) {
                return Err("gap observation lost to resync");
            }
            if events.iter().any(|e| e.kind == EventKind::BridgeGap)
                && services.bridge.status().state == BridgeState::Connected
                && services.bridge.status().last_gap.is_some()
            {
                return Ok(());
            }
            tokio::time::sleep(Duration::from_millis(100)).await;
        }
    })
    .await;
    checked(5, recovered)?;
    let (sender, input) = tokio::sync::oneshot::channel();
    // A native input thread must not keep Tokio's blocking pool alive after Ctrl+C.
    std::thread::spawn(move || {
        let mut line = String::new();
        let _ = sender.send(std::io::stdin().read_line(&mut line));
    });
    tokio::select! {
        result = tokio::signal::ctrl_c() => result.map_err(|_| "console signal unavailable")?,
        result = input => { result.map_err(|_| "console input worker failed")?.map_err(|_| "console input unavailable")?; }
    }
    Ok(())
}
fn checked<T>(index: usize, result: Result<T, &'static str>) -> Result<T, &'static str> {
    println!("{}", report(STEPS[index], result.is_ok()));
    result
}
async fn timed<T>(
    budget: Duration,
    future: impl std::future::Future<Output = Result<T, &'static str>>,
) -> Result<T, &'static str> {
    tokio::time::timeout(budget, future)
        .await
        .map_err(|_| "spike step timed out")?
}
fn append(
    services: &NativeServices,
    user_id: &str,
    action: DecisionAction,
) -> Result<(), &'static str> {
    let id: ulid::Ulid = DecisionId::mint()
        .as_str()
        .parse()
        .map_err(|_| "decision ID invalid")?;
    let event = LedgerEvent::Decision {
        decision_id: id,
        user_id: Some(TwitchUserId::parse(user_id).map_err(|_| "invalid target ID")?),
        action,
    };
    services
        .store
        .lock()
        .map_err(|_| "store lock unavailable")?
        .append_ledger(Timestamp::now(), Timestamp::now(), event)
        .map_err(|_| "decision ledger write failed")?;
    Ok(())
}
