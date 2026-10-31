//! Generated simulated draws and packages; ephemeral read-only loopback only.
#[allow(dead_code)]
#[path = "lots_support/mod.rs"]
mod lots_support;
mod overlay_support;
use cc_core::{EventHub, lots::LotsModule, overlay::RenderHost};
use cc_obs::{
    Overlay,
    pages::{self, OverlayPage},
};
use overlay_support::*;
use serde::Deserialize;
use serde_json::json;
use std::sync::{Arc, Mutex, atomic::AtomicBool};

#[derive(Deserialize)]
struct Case {
    target: String,
    kind: Option<String>,
}

#[tokio::test]
async fn page_router_and_ownership_follow_the_shared_grammar() {
    let directory = tempfile::tempdir().unwrap();
    let host = Arc::new(RenderHost::default());
    host.commit_visual(visual(true)).unwrap();
    let package = seal(package("Simulated page"), &Default::default());
    let hash = String::from(package.content_hash.clone());
    host.accept_package(package, directory.path(), false)
        .unwrap();
    let module = Arc::new(
        LotsModule::open(
            directory.path().join("lots"),
            Arc::new(EventHub::new(32).unwrap()),
            Arc::new(lots_support::RecordedBeacon(AtomicBool::new(false))),
            Arc::new(lots_support::Clock(Mutex::new(lots_support::at()))),
            true,
        )
        .unwrap()
        .with_render_host(host.clone()),
    );
    let mut registry = cc_core::Registry::default();
    registry.register(module.clone()).unwrap();
    lots_support::rpc(
        &registry,
        "lots.draw.upsert",
        json!({"draw":lots_support::draw()}),
    )
    .await;
    module
        .map_user(cc_store::TwitchUserId::parse("1").unwrap(), "simulated_1")
        .unwrap();
    module
        .intake(
            &"simulated-draw".to_owned().try_into().unwrap(),
            cc_lots::PassedMessage::from_verdict(
                lots_support::facts("1", lots_support::at()),
                cc_types::Verdict::Pass,
            )
            .unwrap(),
        )
        .unwrap();
    lots_support::rpc(
        &registry,
        "lots.roll.seal",
        json!({"draw_id":"simulated-draw","source":"streamer_commit","margin_s":1}),
    )
    .await;
    let overlay = Overlay::start_with_routes(0, host.routes()).await.unwrap();
    let origin = overlay.url();
    let source = host
        .source_url(&origin, &"simulated-frame".to_owned().try_into().unwrap())
        .unwrap();
    let uri: axum::http::Uri = source.parse().unwrap();
    assert_eq!(
        pages::parse(uri.path(), uri.query()),
        Some(OverlayPage::Beacons {
            visual: "simulated-frame",
            package_hash: Some(hash.as_str()),
        })
    );
    assert!(host.owns_source(&origin, &source));
    let wrong = source.replace(&hash, &"f".repeat(64));
    assert!(!host.owns_source(&origin, &wrong));
    assert!(!host.owns_source(&origin, &format!("{origin}lots/unsealed?scale=&anchor=")));
    let client = client();
    let cases: Vec<Case> = serde_json::from_str(include_str!(
        "../../cc-obs/tests/fixtures/overlay-paths.json"
    ))
    .unwrap();
    for case in cases {
        // These are resource URLs, deliberately excluded from page capabilities.
        if ["/bundle.js", "/push/beacons"].contains(&case.target.as_str()) {
            continue;
        }
        let target = case.target.replace(&"a".repeat(64), &hash);
        let url = format!("{}{target}", origin.trim_end_matches('/'));
        let response = client.get(&url).send().await.unwrap();
        assert_eq!(
            response.status().as_u16(),
            if case.kind.is_some() { 200 } else { 404 },
            "{target}"
        );
        assert_eq!(response.headers()["cache-control"], "no-store");
        if case.kind.is_some() {
            // A hashless Beacons URL is routable, but this visual needs its current hash.
            let owned = case.kind.as_deref() != Some("beacons") || target.contains("package_hash=");
            assert_eq!(host.owns_source(&origin, &url), owned, "{target}");
        } else {
            assert!(!host.owns_source(&origin, &url), "{target}");
        }
    }
    assert!(!host.owns_source(&origin, &format!("{source}&other=1")));
    assert!(!host.owns_source(&origin, &source.replace("localhost:", "127.0.0.1:")));
}
