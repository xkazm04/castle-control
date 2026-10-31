//! All input is generated SIMULATED consensus. No Twitch, OBS or credentials.
use cc_core::{Module, Registry, gatehouse::VoteBarModule, overlay::RenderHost};
use cc_obs::{Overlay, pages};
use cc_types::{ErrorCode, ErrorEnvelope, RpcRequest, VoteBarSnapshot};
use futures::future::BoxFuture;
use serde_json::{Value, json};
use std::sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
};
mod overlay_support;
use overlay_support::{call, client, package, seal, visual};
#[allow(dead_code)]
#[path = "overlay_support/browser.rs"]
mod browser;

#[tokio::test]
async fn native_registry_returns_the_bound_overlay_url_with_simulated_fixture_provenance() {
    let root = tempfile::tempdir().unwrap();
    let services = overlay_support::native(root.path()).await;
    let app = overlay_support::app(services.clone());
    let result = overlay_support::call(&app, "gatehouse.source.url", json!({})).await;
    assert_eq!(
        result["url"],
        format!("{}gatehouse/current", services.overlay_url())
    );
    let html = overlay_support::client()
        .get(result["url"].as_str().unwrap())
        .send()
        .await
        .unwrap()
        .text()
        .await
        .unwrap();
    assert!(html.contains("SIMULATED"));
    assert!(html.contains("src=\"/vote-bar.js\""));
    let second = Registry::with_native(services);
    let request =
        cc_types::parse_request(br#"{"method":"gatehouse.source.url","params":{}}"#).unwrap();
    assert_eq!(
        second.dispatch(&request).await.unwrap_err().code,
        ErrorCode::Unavailable
    );
    // The second view cannot hijack or invalidate the first view's source.
    assert_eq!(
        overlay_support::call(&app, "gatehouse.source.url", json!({})).await,
        result
    );
    app.shutdown();
}

struct Consensus(Arc<AtomicBool>);
impl Module for Consensus {
    fn methods(&self) -> &'static [&'static str] {
        &["gatehouse.consensus.get"]
    }
    fn call<'a>(&'a self, request: &'a RpcRequest) -> BoxFuture<'a, Result<Value, ErrorEnvelope>> {
        Box::pin(async move {
            assert!(matches!(request, RpcRequest::ConsensusGet(params)
                if params.window_s.get() == 900 && matches!(params.filter, cc_types::ConsensusFilter::All {})));
            if self.0.load(Ordering::SeqCst) {
                return Err(ErrorEnvelope::new(
                    ErrorCode::Unauthorized,
                    "simulated revocation",
                ));
            }
            Ok(
                json!({"at":"2026-10-31T12:00:00Z","window_s":900,"filter":{"kind":"all"},
                "directions":[{"key":"simulated-private-key","label":"simulated private chat label",
                    "share":0.75,"messages":3,"series":[]},
                    {"key":"other","label":"Other","share":0.25,"messages":1,"series":[]}],"shed_count":0}),
            )
        })
    }
}

#[tokio::test]
async fn projection_source_registration_and_revocation_are_read_only() {
    let revoked = Arc::new(AtomicBool::new(false));
    let consensus: Arc<dyn Module> = Arc::new(Consensus(revoked.clone()));
    let source = Arc::new(VoteBarModule::new(
        Arc::downgrade(&consensus),
        Some("http://localhost:3001/".into()),
        true,
    ));
    let snapshot = source.snapshot().await.unwrap();
    let json = serde_json::to_value(&snapshot).unwrap();
    assert_eq!(
        json,
        json!({"at":"2026-10-31T12:00:00Z","simulated":true,
        "directions":[{"share":0.75},{"share":0.25}]})
    );
    let mut registry = Registry::default();
    registry.register(source.clone()).unwrap();
    let request =
        cc_types::parse_request(br#"{"method":"gatehouse.source.url","params":{}}"#).unwrap();
    assert_eq!(
        registry.dispatch(&request).await.unwrap(),
        json!({"url":"http://localhost:3001/gatehouse/current"})
    );
    revoked.store(true, Ordering::SeqCst);
    assert_eq!(
        registry.dispatch(&request).await.unwrap_err().code,
        ErrorCode::Unauthorized
    );
    let unavailable = Registry::with_status()
        .dispatch(&request)
        .await
        .unwrap_err();
    assert_eq!(unavailable.code, ErrorCode::Unavailable);
}

#[tokio::test]
async fn transparent_route_both_obs_sizes_and_guard_agree_and_private_paths_stay_closed() {
    let revoked = Arc::new(AtomicBool::new(false));
    let host = Arc::new(RenderHost::default());
    let consensus: Arc<dyn Module> = Arc::new(Consensus(revoked.clone()));
    host.bind_vote_bar(Arc::new(VoteBarModule::new(
        Arc::downgrade(&consensus),
        None,
        true,
    )))
    .unwrap();
    let overlay = Overlay::start_with_routes(0, host.routes()).await.unwrap();
    let origin = overlay.url();
    let client = reqwest::Client::builder().no_proxy().build().unwrap();
    for anchor in ["center", "br"] {
        let response = client
            .get(format!("{origin}gatehouse/current?scale=1&anchor={anchor}"))
            .send()
            .await
            .unwrap();
        assert_eq!(response.status(), 200);
        let html = response.text().await.unwrap();
        assert!(html.contains("background:transparent"));
        assert!(html.contains("width:100%; height:100%; overflow:hidden"));
        assert!(html.contains("max-height:90vh"));
        assert!(html.contains("SIMULATED"));
        assert!(html.contains("Direction 1 · 75%"));
        assert!(!html.contains("simulated private chat"));
        assert!(!html.contains("simulated-private-key"));
        let json = html
            .split("id=\"cc-vote-bar\">")
            .nth(1)
            .unwrap()
            .split("</script>")
            .next()
            .unwrap();
        assert!(
            serde_json::from_str::<VoteBarSnapshot>(json)
                .unwrap()
                .simulated
        );
    }
    for (path, accepted) in [
        ("gatehouse/current", true),
        ("gatehouse/current?scale=NaN&anchor=invalid", true),
        (
            "gatehouse/current?scale=1&scale=2&anchor=br&anchor=tr",
            true,
        ),
        ("gatehouse/unknown", false),
        ("gatehouse/123", false),
        ("gatehouse/current/extra", false),
        ("gatehouse/current?text=private", false),
        ("gatehouse/current?user_id=1", false),
        ("gatehouse/current?", false),
        ("unknown/current", false),
        ("rpc", false),
        ("events", false),
    ] {
        let url = format!("{origin}{path}");
        let (path, query) = path
            .split_once('?')
            .map_or((path, None), |(p, q)| (p, Some(q)));
        assert_eq!(pages::parse(&format!("/{path}"), query).is_some(), accepted);
        assert_eq!(host.owns_source(&origin, &url), accepted);
        let response = client.get(&url).send().await.unwrap();
        assert_eq!(
            response.status().as_u16(),
            if accepted { 200 } else { 404 },
            "{url}"
        );
        if accepted && query.is_some_and(|q| q.contains("NaN") || q.contains("scale=1&scale=2")) {
            let html = response.text().await.unwrap();
            assert!(html.contains("calc(60vw * 1)"));
            assert!(html.contains("data-anchor=\"center\""));
        }
    }
    assert_eq!(
        client
            .post(format!("{origin}gatehouse/current"))
            .send()
            .await
            .unwrap()
            .status(),
        405
    );
    let mut push = client
        .get(format!("{origin}push/gatehouse"))
        .send()
        .await
        .unwrap();
    let event = String::from_utf8(push.chunk().await.unwrap().unwrap().to_vec()).unwrap();
    assert!(event.contains("event: gatehouse.render.snapshot"));
    assert!(event.contains("\"simulated\":true"));
    assert!(!event.contains("private"));
    revoked.store(true, Ordering::SeqCst);
    assert_eq!(
        client
            .get(format!("{origin}gatehouse/current"))
            .send()
            .await
            .unwrap()
            .status(),
        503
    );
    assert!(
        tokio::time::timeout(std::time::Duration::from_secs(3), push.chunk())
            .await
            .unwrap()
            .unwrap()
            .is_none()
    );
}

#[tokio::test]
#[ignore = "isolated headless Chrome geometry probe; Director runs with --ignored --nocapture"]
async fn vote_bar_browser_transparent_and_contained_at_both_obs_sizes() {
    let consensus: Arc<dyn Module> = Arc::new(Consensus(Arc::new(AtomicBool::new(false))));
    let host = Arc::new(RenderHost::default());
    host.bind_vote_bar(Arc::new(VoteBarModule::new(
        Arc::downgrade(&consensus),
        None,
        true,
    )))
    .unwrap();
    let overlay = Overlay::start_with_routes(0, host.routes()).await.unwrap();
    let mut browser = browser::Browser::open(&format!("{}gatehouse/current", overlay.url())).await;
    for (width, height) in [(1920, 1080), (1280, 720)] {
        browser
            .command(
                "Emulation.setDeviceMetricsOverride",
                json!({
                    "width":width,"height":height,"deviceScaleFactor":1,"mobile":false
                }),
            )
            .await;
        tokio::time::timeout(std::time::Duration::from_secs(5), async {
            while browser
                .evaluate(
                    "document.getElementById('vote-bar')?.textContent.includes('75%') === true",
                )
                .await
                != true
            {
                tokio::time::sleep(std::time::Duration::from_millis(20)).await;
            }
        })
        .await
        .unwrap();
        let result = browser.evaluate(r#"(() => {
            const bar = document.getElementById('vote-bar'), box = bar.getBoundingClientRect();
            return { width: innerWidth, height: innerHeight,
                html: getComputedStyle(document.documentElement).backgroundColor,
                body: getComputedStyle(document.body).backgroundColor,
                fits: box.left >= 0 && box.top >= 0 && box.right <= innerWidth && box.bottom <= innerHeight,
                simulated: bar.textContent.includes('SIMULATED'),
                no_chat: !document.querySelector('[data-message-row]') && !bar.textContent.includes('private') };
        })()"#).await;
        assert_eq!(result["width"], width);
        assert_eq!(result["height"], height);
        assert_eq!(result["html"], "rgba(0, 0, 0, 0)");
        assert_eq!(result["body"], "rgba(0, 0, 0, 0)");
        assert_eq!(result["fits"], true);
        assert_eq!(result["simulated"], true);
        assert_eq!(result["no_chat"], true);
    }
    browser.close().await;
}
