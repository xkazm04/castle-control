//! Generated simulated renderer/provider tests; no owner OBS or live chat.
use super::*;
use crate::Module;
use cc_types::*;
use serde_json::Value;
use std::{sync::Arc, time::Duration};

fn fixture() -> Value {
    serde_json::from_str(include_str!(
        "../../../cc-types/tests/fixtures/tiltyard.json"
    ))
    .unwrap()
}

async fn frame(response: &mut reqwest::Response) -> String {
    tokio::time::timeout(Duration::from_secs(3), async {
        let mut bytes = Vec::new();
        loop {
            bytes.extend_from_slice(&response.chunk().await.unwrap().expect("SSE ended"));
            let text = String::from_utf8_lossy(&bytes);
            if let Some((event, _)) = text.split_once("\n\n") {
                return event.to_owned();
            }
        }
    })
    .await
    .expect("latest Tiltyard snapshot within three seconds")
}
#[test]
fn shared_snapshots_escape_labels_and_keep_simulation_visible() {
    let fixture = fixture();
    for value in fixture["snapshots"].as_array().unwrap() {
        let snapshot: TiltyardRenderSnapshot = serde_json::from_value(value.clone()).unwrap();
        let html = tiltyard::render(Some(&snapshot)).unwrap();
        assert!(html.contains("background:transparent"));
        assert!(html.contains("/tiltyard.js"));
        assert_eq!(
            html.contains("class=simulated>SIMULATED"),
            snapshot.simulated
        );
        assert!(!html.contains("Simulated <left>"));
        if String::from(snapshot.left.label).contains('<') {
            assert!(html.contains("&lt;left&gt; &amp;"));
        }
    }
    let mut snapshot: TiltyardRenderSnapshot =
        serde_json::from_value(fixture["snapshots"][0].clone()).unwrap();
    snapshot.left.label = "</script><img src=x onerror=alert(1)>"
        .to_owned()
        .try_into()
        .unwrap();
    let html = tiltyard::render(Some(&snapshot)).unwrap();
    assert!(!html.contains("</script><img"));
    assert!(html.contains("\\u003c/script>"));
    snapshot.left.count = 0;
    snapshot.right.count = 0;
    snapshot.ballots = 0;
    snapshot.simulated = true;
    let sample_html = tiltyard::render(Some(&snapshot)).unwrap();
    assert!(sample_html.contains("class=simulated>SIMULATED"));
    assert!(sample_html.contains("\"ballots\":0") && sample_html.contains("\"simulated\":true"));
}

#[tokio::test]
async fn page_sse_owned_source_and_shared_client_cap() {
    let root = tempfile::tempdir().unwrap();
    let events = Arc::new(crate::EventHub::new(128).unwrap());
    let gatehouse = Arc::new(
        crate::gatehouse::GatehouseModule::open_shadow(root.path().join("gatehouse")).unwrap(),
    );
    let host = Arc::new(RenderHost::default());
    let overlay = cc_obs::Overlay::start_with_routes(0, host.routes())
        .await
        .unwrap();
    let origin = overlay.url();
    let source = crate::tiltyard::TiltyardModule::open(
        root.path().join("tiltyard"),
        gatehouse.clone(),
        events,
        Some(origin.clone()),
    )
    .unwrap();
    source
        .turn(&serde_json::from_value(fixture()["actions"][0].clone()).unwrap())
        .await
        .unwrap();
    gatehouse
        .screen_live_shadow(
            cc_gatehouse::IngestedMessage {
                message_id: "simulated-overlay-ballot".to_owned().try_into().unwrap(),
                user_id: cc_store::TwitchUserId::parse("123").unwrap(),
                login: "simulated_overlay".into(),
                text: "1 SIMULATED".into(),
                at: Timestamp::now(),
                simulated: true,
                metadata: None,
            },
            &crate::live::RulesOnly,
            vec![],
        )
        .await
        .unwrap();
    host.bind_tiltyard(source.clone()).unwrap();
    let client = reqwest::Client::builder().no_proxy().build().unwrap();
    let url = format!("{origin}tiltyard/current");
    assert_eq!(
        cc_obs::pages::OverlayPage::Tiltyard.path_and_query(),
        TILTYARD_CURRENT_ROUTE
    );
    assert_eq!(
        cc_obs::pages::parse(TILTYARD_CURRENT_ROUTE, None),
        Some(cc_obs::pages::OverlayPage::Tiltyard)
    );
    let result = source
        .call(&RpcRequest::TiltyardSourceUrl(Empty {}))
        .await
        .unwrap();
    assert_eq!(result["url"], url);
    assert!(host.owns_source(&origin, &url));
    for suffix in [
        "push/tiltyard",
        "tiltyard/current?scale=2",
        "tiltyard/current?anchor=tr",
        "tiltyard/current?shape=wheel",
        "tiltyard/current?",
        "tiltyard/current?text=private",
        "tiltyard/current/extra",
        "tiltyard.js",
    ] {
        assert!(!host.owns_source(&origin, &format!("{origin}{suffix}")));
    }
    assert!(!RenderHost::default().owns_source(&origin, &url));
    let page = client.get(&url).send().await.unwrap();
    let policy = page.headers()["content-security-policy"].to_str().unwrap();
    let connect = policy
        .split(';')
        .map(str::trim)
        .find(|directive| directive.starts_with("connect-src "))
        .unwrap();
    let push_url = format!("{origin}push/tiltyard");
    assert!(connect.split_whitespace().any(|source| source == push_url));
    let html = page.text().await.unwrap();
    assert!(html.contains("SIMULATED") && html.contains("Simulated &lt;left&gt;"));
    for query in ["scale=2", "anchor=tr", "shape=wheel", "text=private", ""] {
        assert_eq!(
            client
                .get(format!("{url}?{query}"))
                .send()
                .await
                .unwrap()
                .status(),
            404
        );
    }
    assert_eq!(client.post(&url).send().await.unwrap().status(), 405);
    assert_eq!(
        client
            .get(format!("{origin}rpc"))
            .send()
            .await
            .unwrap()
            .status(),
        404
    );
    let mut response = client
        .get(format!("{origin}push/tiltyard"))
        .send()
        .await
        .unwrap();
    assert_eq!(response.headers()["content-type"], "text/event-stream");
    let initial = frame(&mut response).await;
    assert!(initial.contains("event: tiltyard.render.snapshot") && initial.contains(": SIMULATED"));
    assert!(initial.contains("\"simulated\":true") && initial.contains("\"ballots\":1"));
    assert!(!initial.contains("simulated_overlay") && !initial.contains("user_id"));
    source
        .turn(&TiltyardAction::Pick {
            side: TiltyardWinner::Right,
        })
        .await
        .unwrap();
    let replacement = frame(&mut response).await;
    assert!(replacement.contains("\"phase\":\"called\""));
    assert!(replacement.contains("\"how\":\"call\""));
    assert!(replacement.contains(": SIMULATED"));
    assert_eq!(host.clients.available_permits(), 127);
    let cap = host.clients.clone().try_acquire_many_owned(127).unwrap();
    assert_eq!(
        client
            .get(format!("{origin}push/tiltyard"))
            .send()
            .await
            .unwrap()
            .status(),
        503
    );
    drop(cap);
    drop(response);
    drop(overlay);
}
