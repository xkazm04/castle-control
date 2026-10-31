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
    let value = module
        .call(&request)
        .await
        .unwrap_or_else(|error| panic!("{method}: {error:?}"));
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
        assert!(!html.contains("overflow: auto"));
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
    for (content, winner_count) in [("question", 2), ("prize", 40)] {
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
        let mut draw = call(&module, "lots.draw.upsert", json!({"draw":{
        "draw_id":"simulated-draw", "name":"SIMULATED questions",
        "policy":{"content":content,"paid_entry":false,"paid_weight":false,"subscriber_only":false,
            "channel_points":false,"free_entry_equal_odds":true,"regions":[],"prize_value_usd_cents":0,
            "registration_confirmed":false,"official_rules":true,"twitch_disclaimer":true},
        "rules":{"pool":{"kind":"chatters"},"winner_count":winner_count,"cooldown_s":0,
            "cohort_caps":[],"weight_curve":{"kind":"equal"},"free_join_equal_odds":true}
    }})).await;
        for user_id in 42..42 + winner_count {
            let user = cc_store::TwitchUserId::parse(&user_id.to_string()).unwrap();
            module
                .map_user(user.clone(), &format!("simulated_viewer_{user_id}"))
                .unwrap();
            module
                .intake(
                    &"simulated-draw".to_owned().try_into().unwrap(),
                    cc_lots::PassedMessage::from_verdict(
                        cc_lots::MessageFacts {
                            message_id: format!("simulated-message-{user_id}").try_into().unwrap(),
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
        }
        let server = cc_obs::Overlay::start_with_routes(0, host.routes())
            .await
            .unwrap();
        let url = format!("{}lots/simulated-draw?scale=2&anchor=tl", server.url());
        let mut events = module.subscribe();
        let sealed = call(
            &module,
            "lots.roll.seal",
            json!({"draw_id":"simulated-draw","source":"streamer_commit","margin_s":1}),
        )
        .await;
        let html = reqwest::get(&url).await.unwrap().text().await.unwrap();
        assert!(html.contains("Seal announced"));
        assert_eq!(island(&html, "cc-seal"), sealed);
        assert!(!html.contains("id=\"cc-cast\""));
        assert!(html.contains("<script type=\"module\" src=\"/bundle.js\"></script>"));
        assert!(html.contains("http-equiv=\"refresh\" content=\"1\""));
        assert!(html.contains(&format!("data-content=\"{content}\"")));
        let cc_types::LotsEventPayload::Sealed(event) = events.recv().await.unwrap() else {
            panic!("seal event expected")
        };
        assert_eq!(serde_json::to_value(event).unwrap(), sealed);
        assert!(html.contains(sealed["sealed"]["seal"].as_str().unwrap()));
        assert!(!html.contains("<h2>Winners"));
        assert!(html.contains("SIMULATED"));
        let cast = call(
            &module,
            "lots.cast",
            json!({"draw_run_id":sealed["draw_run_id"]}),
        )
        .await;
        // Reconfiguration after a cast must not change its seal-time content.
        draw["policy"]["content"] = json!(if content == "prize" {
            "question"
        } else {
            "prize"
        });
        call(&module, "lots.draw.upsert", json!({"draw": draw})).await;
        let html = reqwest::get(&url).await.unwrap().text().await.unwrap();
        assert!(html.contains(&format!("data-content=\"{content}\"")));
        assert!(html.contains("<h2>Winners"));
        assert_eq!(island(&html, "cc-cast"), cast);
        assert_eq!(cast["cast"]["seal"], sealed["sealed"]["seal"]);
        assert!(html.contains("http-equiv=\"refresh\" content=\"60\""));
        let parsed: cc_types::CastResult =
            serde_json::from_value(island(&html, "cc-cast")).unwrap();
        assert_eq!(
            parsed,
            host.lots_cast(&"simulated-draw".to_owned().try_into().unwrap())
                .unwrap()
                .unwrap()
        );
        assert_eq!(
            html.contains("<footer>Twitch does not sponsor this promotion</footer>"),
            content == "prize"
        );
        let expected = cast["cast"]["winners"]
            .as_array()
            .unwrap()
            .iter()
            .take(8)
            .map(|winner| format!("<li>{}</li>", winner.as_str().unwrap()))
            .collect::<String>();
        assert!(html.contains(&format!("<ol>{expected}</ol>")));
        assert_eq!(html.matches("<li>").count(), winner_count.min(8));
        if winner_count > 8 {
            assert!(html.contains("<p class=\"draw-more\">+32 more</p>"));
        } else {
            assert!(!html.contains("class=\"draw-more\""));
        }
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
}

#[tokio::test]
async fn lots_10_served_typography_scales_and_both_winner_hosts_refuse_scrollbars() {
    let host = Arc::new(RenderHost::default());
    let server = cc_obs::Overlay::start_with_routes(0, host.routes())
        .await
        .unwrap();
    for scale in [0.5, 1.0, 2.0] {
        let html = reqwest::get(format!("{}lots/simulated-draw?scale={scale}", server.url()))
            .await
            .unwrap()
            .text()
            .await
            .unwrap();
        let rule = |selector: &str| {
            html.split_once(&format!("\n{selector} {{"))
                .unwrap()
                .1
                .split_once('}')
                .unwrap()
                .0
        };
        assert!(rule("p, li").contains("font-size: calc(var(--text-body) * var(--draw-scale))"));
        assert!(rule("h2").contains("font-size: calc(var(--text-section) * var(--draw-scale))"));
        assert!(rule("h1").contains("calc(var(--text-chamber) * var(--draw-scale))"));
        assert!(rule(".draw-winners li").contains("var(--draw-scale)"));
        for selector in ["main", ".draw-winners"] {
            assert!(rule(selector).contains("overflow: hidden"));
            assert!(!rule(selector).contains("overflow: auto"));
        }
    }
}

fn island(html: &str, id: &str) -> Value {
    let start = format!("<script type=\"application/json\" id=\"{id}\">");
    let json = html
        .split_once(&start)
        .unwrap()
        .1
        .split_once("</script>")
        .unwrap()
        .0;
    serde_json::from_str(json).unwrap()
}
