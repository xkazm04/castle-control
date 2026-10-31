//! Test-only real core/OBS composition. No Twitch, network beacon or paid engine.
use cc_core::{
    AppState, EventHub, Registry, bind,
    lots::{BeaconSource, LotsClock, LotsModule},
    overlay::RenderHost,
};
use cc_lots::{MessageFacts, PassedMessage};
use cc_types::{DrawId, LotsEventPayload, Verdict};
use std::{io::Write, sync::Arc};

// Reuse the core's recorded round and fixed clock verbatim, without exposing a
// new product API or copying cryptographic fixture values into this launcher.
#[path = "../src/lots/recorded.rs"]
mod recorded;

const DRAW_ID: &str = "simulated-core-draw";
type LauncherResult = Result<(), Box<dyn std::error::Error + Send + Sync>>;

fn core_error(_: cc_types::ErrorEnvelope) -> std::io::Error {
    std::io::Error::other("offline Lots core operation failed")
}

fn participants(module: &LotsModule) -> LauncherResult {
    let draw_id: DrawId = DRAW_ID.to_owned().try_into()?;
    for id in 100..112 {
        let user_id = cc_store::TwitchUserId::parse(&id.to_string())?;
        module
            .map_user(user_id.clone(), &format!("simulated_viewer_{id}"))
            .map_err(core_error)?;
        let passed = PassedMessage::from_verdict(
            MessageFacts {
                message_id: format!("simulated-message-{id}").try_into()?,
                user_id,
                at: recorded::RecordedBeacon.now(),
                text: "SIMULATED !join".into(),
                follower: false,
                subscriber: false,
                redeemed: false,
                activity_units: 0,
                cohorts: Default::default(),
            },
            Verdict::Pass,
        )?;
        if module.intake(&draw_id, passed).map_err(core_error)? != cc_lots::Intake::Added {
            return Err("generated participant was not admitted".into());
        }
    }
    Ok(())
}

async fn generate(
    module: Arc<LotsModule>,
    mut intake: tokio::sync::broadcast::Receiver<LotsEventPayload>,
) -> LauncherResult {
    loop {
        if let LotsEventPayload::Roll(roll) = intake.recv().await?
            && String::from(roll.draw_id) == DRAW_ID
            && roll.weight_table.rows.is_empty()
        {
            participants(&module)?;
        }
    }
}

struct OfflineCore {
    state: Arc<AppState>,
    module: Arc<LotsModule>,
    intake: tokio::sync::broadcast::Receiver<LotsEventPayload>,
    overlay: cc_obs::Overlay,
}

async fn compose(
    root: &std::path::Path,
) -> Result<OfflineCore, Box<dyn std::error::Error + Send + Sync>> {
    let events = Arc::new(EventHub::new(256).map_err(core_error)?);
    let render = Arc::new(RenderHost::default());
    let recorded = Arc::new(recorded::RecordedBeacon);
    let module = Arc::new(
        LotsModule::open(root, events.clone(), recorded.clone(), recorded, true)
            .map_err(core_error)?
            .with_render_host(render.clone()),
    );
    let intake = module.subscribe();
    let mut registry = Registry::default();
    registry.register(module.clone()).map_err(core_error)?;
    let state = AppState::with_events(registry, events).map_err(core_error)?;
    let overlay = cc_obs::Overlay::start_with_routes(0, render.routes()).await?;
    Ok(OfflineCore {
        state,
        module,
        intake,
        overlay,
    })
}

#[tokio::main]
async fn main() -> LauncherResult {
    // The Node owner supplies a fresh temporary parent and removes it even if
    // the process must be killed. Rust also owns its child directory normally.
    let parent = std::env::args_os()
        .nth(1)
        .ok_or("temporary parent required")?;
    let directory = tempfile::tempdir_in(parent)?;
    let OfflineCore {
        state,
        module,
        intake,
        overlay,
    } = compose(directory.path()).await?;
    let (address, server) = bind(state.clone(), "127.0.0.1:0".parse()?).await?;

    // The sole capability handoff is piped to Node memory, never to a browser,
    // URL, file or diagnostic. AppState mints a new capability for each launch.
    println!(
        "{}",
        serde_json::json!({
            "endpoint": format!("http://{address}/"),
            "token": state.session_token(),
            "overlay_origin": overlay.url().trim_end_matches('/'),
        })
    );
    std::io::stdout().flush()?;

    // Upsert resets the roll. Populate only after its real committed Roll
    // event, through the existing Rust post-verdict door, never an HTTP fixture.
    let mut stdin = tokio::io::stdin();
    let mut byte = [0];
    tokio::select! {
        result = server => result?,
        result = generate(module, intake) => result?,
        // Closing the owning pipe exits the launcher if its Node worker dies.
        result = tokio::io::AsyncReadExt::read(&mut stdin, &mut byte) => { result?; },
    }
    state.shutdown();
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{Value, json};

    async fn call(
        client: &reqwest::Client,
        endpoint: &str,
        state: &AppState,
        method: &str,
        params: Value,
    ) -> Value {
        let body = json!({ "method": method, "params": params });
        let request = cc_types::parse_request(&serde_json::to_vec(&body).unwrap()).unwrap();
        let response = client
            .post(endpoint)
            .bearer_auth(state.session_token())
            .json(&body)
            .send()
            .await
            .unwrap();
        assert_eq!(response.status(), 200, "{method}");
        request
            .validate_result(response.json().await.unwrap())
            .unwrap()
    }

    #[tokio::test]
    async fn real_rpc_seal_cast_and_read_only_overlay_use_generated_participants() {
        let directory = tempfile::tempdir().unwrap();
        let OfflineCore {
            state,
            module,
            intake,
            overlay,
        } = compose(directory.path()).await.unwrap();
        let (address, server) = bind(state.clone(), "127.0.0.1:0".parse().unwrap())
            .await
            .unwrap();
        let server = tokio::spawn(server);
        let generated = tokio::spawn(generate(module, intake));
        let endpoint = format!("http://{address}/rpc");
        let client = reqwest::Client::new();
        // Neither a browser/Vite origin nor a missing capability gains RPC.
        assert_eq!(client.post(&endpoint).send().await.unwrap().status(), 401);
        assert_eq!(
            client
                .post(&endpoint)
                .bearer_auth(state.session_token())
                .header("Origin", "http://127.0.0.1:5174")
                .json(&json!({"method":"lots.draw.list","params":{}}))
                .send()
                .await
                .unwrap()
                .status(),
            403
        );
        let draw = call(
            &client,
            &endpoint,
            &state,
            "lots.draw.upsert",
            json!({"draw": {
                "draw_id": DRAW_ID, "name": "SIMULATED audience questions",
                "policy": {"content":"question", "paid_entry":false, "paid_weight":false,
                    "subscriber_only":false, "channel_points":false, "free_entry_equal_odds":true,
                    "regions":[], "prize_value_usd_cents":0, "registration_confirmed":false,
                    "official_rules":true, "twitch_disclaimer":true},
                "rules": {"pool":{"kind":"chatters"}, "winner_count":3, "cooldown_s":0,
                    "cohort_caps":[], "weight_curve":{"kind":"equal"}, "free_join_equal_odds":true}
            }}),
        )
        .await;
        let check = call(
            &client,
            &endpoint,
            &state,
            "lots.draw.check",
            json!({"policy":draw["policy"]}),
        )
        .await;
        assert_eq!(check, json!({"result":"ok", "reasons":[]}));
        tokio::time::timeout(std::time::Duration::from_secs(5), async {
            loop {
                let lookup = call(
                    &client,
                    &endpoint,
                    &state,
                    "lots.roll.lookup",
                    json!({"draw_id":DRAW_ID,"user_id":"111"}),
                )
                .await;
                if lookup.get("entry").is_some() {
                    break;
                }
                tokio::task::yield_now().await;
            }
        })
        .await
        .unwrap();
        let sealed = call(
            &client,
            &endpoint,
            &state,
            "lots.roll.seal",
            json!({"draw_id":DRAW_ID,"source":"drand_quicknet","margin_s":1}),
        )
        .await;
        assert_eq!(
            sealed["sealed"]["roll"]["entries"]
                .as_array()
                .unwrap()
                .len(),
            12
        );
        let cast = call(
            &client,
            &endpoint,
            &state,
            "lots.cast",
            json!({"draw_run_id":sealed["draw_run_id"]}),
        )
        .await;
        assert_eq!(cast["cast"]["seal"], sealed["sealed"]["seal"]);
        assert_eq!(cast["cast"]["winners"].as_array().unwrap().len(), 3);
        assert_eq!(
            call(
                &client,
                &endpoint,
                &state,
                "lots.cast",
                json!({"draw_run_id":sealed["draw_run_id"]})
            )
            .await,
            cast
        );
        let url = format!("{}lots/{DRAW_ID}?scale=1&anchor=tl", overlay.url());
        let response = client.get(&url).send().await.unwrap();
        assert_eq!(response.status(), 200);
        let html = response.text().await.unwrap();
        assert!(html.contains("data-simulated=\"true\""));
        assert!(html.contains("SIMULATED"));
        for winner in cast["cast"]["winners"].as_array().unwrap() {
            assert!(html.contains(&format!("<li>{}</li>", winner.as_str().unwrap())));
        }
        assert_eq!(client.post(&url).send().await.unwrap().status(), 405);
        assert_eq!(
            client
                .post(format!("{}rpc", overlay.url()))
                .send()
                .await
                .unwrap()
                .status(),
            404
        );
        state.shutdown();
        server.await.unwrap().unwrap();
        generated.abort();
        assert!(generated.await.unwrap_err().is_cancelled());
    }
}
