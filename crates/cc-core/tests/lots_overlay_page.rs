//! Loopback page evidence only. Generated participants, no live/paid transport.
use cc_core::{EventHub, Module, lots::LotsModule, overlay::RenderHost};
use cc_types::{ErrorCode, ErrorEnvelope, LotsSealedRoll, parse_request};
use serde_json::{Value, json};
use std::sync::Arc;

struct NoBeacon;
impl cc_core::lots::LotsClock for NoBeacon {
    fn now(&self) -> chrono::DateTime<chrono::Utc> {
        "2026-10-25T12:00:00Z".parse().unwrap()
    }
}
impl cc_core::lots::BeaconSource for NoBeacon {
    fn chain(&self) -> Result<cc_verify::QuicknetChain, ErrorEnvelope> {
        Err(ErrorEnvelope::new(
            ErrorCode::Unavailable,
            "no network in test",
        ))
    }
    fn round(&self, _: &LotsSealedRoll) -> Result<cc_verify::BeaconRound, ErrorEnvelope> {
        Err(ErrorEnvelope::new(
            ErrorCode::Unavailable,
            "no network in test",
        ))
    }
}
async fn call(module: &LotsModule, method: &str, params: Value) -> Value {
    let request =
        parse_request(&serde_json::to_vec(&json!({"method":method,"params":params})).unwrap())
            .unwrap();
    let value = module.call(&request).await.unwrap();
    request.validate_result(value).unwrap()
}

#[tokio::test]
async fn display_query_is_parsed_once_with_safe_defaults_and_no_markup_injection() {
    let host = Arc::new(RenderHost::default());
    let server = cc_obs::Overlay::start_with_routes(0, host.routes())
        .await
        .unwrap();
    let client = reqwest::Client::new();
    for (query, scale, anchor) in [
        ("", "1", "br"),
        ("?scale=0.5&anchor=tl", "0.5", "tl"),
        ("?scale=2&anchor=center", "2", "center"),
        ("?scale=1.25&anchor=bl", "1.25", "bl"),
        ("?scale=NaN&anchor=unknown", "1", "br"),
        ("?scale=3&anchor=tr", "1", "tr"),
        ("?scale=0.1&anchor=br", "1", "br"),
        ("?scale=inf&anchor=tl", "1", "tl"),
        ("?scale=&anchor=", "1", "br"),
        ("?scale=2&scale=1&anchor=tl&anchor=tr", "1", "br"),
        (
            "?scale=%22%3E%3Cscript%3E&anchor=%22%3E%3Cscript%3E",
            "1",
            "br",
        ),
    ] {
        let response = client
            .get(format!("{}lots/simulated-draw{query}", server.url()))
            .send()
            .await
            .unwrap();
        assert_eq!(response.status(), 200, "{query}");
        let html = response.text().await.unwrap();
        assert!(
            html.contains(&format!("data-anchor=\"{anchor}\"")),
            "{query}"
        );
        assert!(html.contains(&format!("--draw-scale:{scale}")), "{query}");
        assert!(html.contains("name=\"viewport\""));
        assert!(html.contains("Waiting for an accepted seal"));
        assert!(!html.contains("<script>"));
        assert!(
            !html.contains("<img"),
            "Unavailable desktop artwork must not request a broken image"
        );
        assert!(html.contains("background: transparent"));
        assert!(html.contains("max-height: 100%"));
        assert!(html.contains("overflow: auto"));
    }
    let rejected = format!("{}lots/simulated-draw?other=ignored", server.url());
    assert_eq!(
        client.get(&rejected).send().await.unwrap().status(),
        404,
        "unknown query keys are refused by the page table"
    );
    assert!(!host.owns_source(&server.url(), &rejected));
}

#[tokio::test]
async fn page_shows_only_accepted_seal_then_fixed_simulated_winners_and_no_write_door() {
    let root = tempfile::tempdir().unwrap();
    let host = Arc::new(RenderHost::default());
    let module = LotsModule::open(
        root.path(),
        Arc::new(EventHub::new(32).unwrap()),
        Arc::new(NoBeacon),
        Arc::new(NoBeacon),
        true,
    )
    .unwrap()
    .with_render_host(host.clone());
    call(&module, "lots.draw.upsert", json!({"draw":{
        "draw_id":"simulated-draw", "name":"SIMULATED questions",
        "policy":{"content":"question","paid_entry":false,"paid_weight":false,"subscriber_only":false,
            "channel_points":false,"free_entry_equal_odds":true,"regions":[],"prize_value_usd_cents":0,
            "registration_confirmed":false,"official_rules":true,"twitch_disclaimer":true},
        "rules":{"pool":{"kind":"chatters"},"winner_count":1,"cooldown_s":0,
            "cohort_caps":[],"weight_curve":{"kind":"equal"},"free_join_equal_odds":true}
    }})).await;
    let user = cc_store::TwitchUserId::parse("42").unwrap();
    module.map_user(user.clone(), "simulated_viewer").unwrap();
    module
        .intake(
            &"simulated-draw".to_owned().try_into().unwrap(),
            cc_lots::PassedMessage::from_verdict(
                cc_lots::MessageFacts {
                    message_id: "simulated-message".to_owned().try_into().unwrap(),
                    user_id: user,
                    at: "2026-10-25T12:00:00Z".parse().unwrap(),
                    text: "!join".into(),
                    follower: false,
                    subscriber: false,
                    redeemed: false,
                    activity_units: 0,
                    cohorts: Default::default(),
                },
                cc_types::Verdict::Pass,
            )
            .unwrap(),
        )
        .unwrap();
    let server = cc_obs::Overlay::start_with_routes(0, host.routes())
        .await
        .unwrap();
    let url = format!("{}lots/simulated-draw?scale=2&anchor=tl", server.url());
    let sealed = call(
        &module,
        "lots.roll.seal",
        json!({"draw_id":"simulated-draw","source":"streamer_commit","margin_s":1}),
    )
    .await;
    let html = reqwest::get(&url).await.unwrap().text().await.unwrap();
    assert!(html.contains("Seal announced"));
    assert!(html.contains(sealed["sealed"]["seal"].as_str().unwrap()));
    assert!(!html.contains("<h2>Winners"));
    assert!(html.contains("SIMULATED"));
    let cast = call(
        &module,
        "lots.cast",
        json!({"draw_run_id":sealed["draw_run_id"]}),
    )
    .await;
    let html = reqwest::get(&url).await.unwrap().text().await.unwrap();
    assert!(html.contains("<h2>Winners"));
    assert!(html.contains(cast["cast"]["winners"][0].as_str().unwrap()));
    assert!(html.contains("data-anchor=\"tl\""));
    assert!(html.contains("--draw-scale:2"));
    let client = reqwest::Client::new();
    assert_eq!(client.post(&url).send().await.unwrap().status(), 405);
    assert_eq!(
        client
            .get(format!("{}rpc", server.url()))
            .send()
            .await
            .unwrap()
            .status(),
        404
    );
}
