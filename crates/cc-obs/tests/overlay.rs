//! All HTTP requests are simulated and restricted to a local ephemeral server.
use cc_obs::Overlay;
use std::{
    io::Write,
    sync::{Arc, Mutex},
};

#[derive(Clone, Default)]
struct Captured(Arc<Mutex<Vec<u8>>>);
impl Write for Captured {
    fn write(&mut self, bytes: &[u8]) -> std::io::Result<usize> {
        self.0.lock().unwrap().extend_from_slice(bytes);
        Ok(bytes.len())
    }
    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}

#[tokio::test]
async fn beacons_placeholder_keeps_csp_and_does_not_log_session_sentinel() {
    let output = Captured::default();
    let writer = output.clone();
    let subscriber = tracing_subscriber::fmt()
        .with_max_level(tracing::Level::TRACE)
        .with_writer(move || writer.clone())
        .finish();
    let _guard = tracing::subscriber::set_default(subscriber);
    let overlay = Overlay::start(0).await.unwrap();
    let client = reqwest::Client::builder().no_proxy().build().unwrap();
    let root = client.get(overlay.url()).send().await.unwrap();
    let policy = root.headers()["content-security-policy"].clone();
    let sentinel = "simulated-session-sentinel";
    let url = format!("{}beacons/simulated-frame", overlay.url());
    let response = client.get(&url).bearer_auth(sentinel).send().await.unwrap();
    assert_eq!(response.status(), 200);
    assert_eq!(response.headers()["content-security-policy"], policy);
    assert_eq!(response.headers()["cache-control"], "no-store");
    assert_eq!(response.headers()["x-content-type-options"], "nosniff");
    let page = response.text().await.unwrap();
    assert!(page.contains("rendering unavailable"));
    assert!(page.contains("<body></body>"));
    assert!(page.contains("background: transparent"));
    for forbidden in [
        "<script", "@import", "url(", "http:", "https:", "//", "src=", "<link",
    ] {
        assert!(
            !page.contains(forbidden),
            "unexpected resource: {forbidden}"
        );
    }
    assert_eq!(client.post(&url).send().await.unwrap().status(), 405);
    assert_eq!(
        client
            .get(&url)
            .header("host", "remote.example")
            .send()
            .await
            .unwrap()
            .status(),
        403
    );
    tracing::info!("simulated Beacons URL check complete");
    let logs = String::from_utf8(output.0.lock().unwrap().clone()).unwrap();
    assert!(logs.contains("simulated Beacons URL check complete"));
    for text in [&url, &page, &logs] {
        assert!(!text.contains(sentinel));
    }
}

#[tokio::test]
async fn simulated_overlay_csp_matches_adr_exactly() {
    let overlay = Overlay::start(0).await.unwrap();
    let client = reqwest::Client::builder().no_proxy().build().unwrap();
    let response = client.get(overlay.url()).send().await.unwrap();
    let policy = response.headers()["content-security-policy"]
        .to_str()
        .unwrap();
    let port = reqwest::Url::parse(&overlay.url()).unwrap().port().unwrap();
    assert_eq!(
        policy,
        format!(
            "default-src 'none'; script-src 'self'; connect-src http://localhost:{port}/push/beacons http://localhost:{port}/push/gatehouse; img-src 'self' data:; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
        )
    );
    let mut directives: Vec<_> = policy.split(';').map(str::trim).collect();
    directives.sort_unstable();
    // Exact directive/source sets reject remote styles, overrides and duplicates.
    let connect = format!(
        "connect-src http://localhost:{port}/push/beacons http://localhost:{port}/push/gatehouse"
    );
    assert_eq!(
        directives,
        [
            "base-uri 'none'",
            connect.as_str(),
            "default-src 'none'",
            "form-action 'none'",
            "frame-ancestors 'none'",
            "img-src 'self' data:",
            "script-src 'self'",
            "style-src 'unsafe-inline'",
        ]
    );
}

#[tokio::test]
async fn simulated_overlay_declares_transparent_background() {
    let overlay = Overlay::start(0).await.unwrap();
    let client = reqwest::Client::builder().no_proxy().build().unwrap();
    let page = client
        .get(overlay.url())
        .send()
        .await
        .unwrap()
        .text()
        .await
        .unwrap();
    assert!(page.contains("html, body { background: transparent; margin: 0; }"));
    assert!(page.contains("<title>Castle Control spike</title>"));
    assert!(page.contains("WP 0.7 OBS connection test"));
    assert!(page.contains("<main class=\"spike-plate\">"));
    let plate = page
        .split_once(".spike-plate {")
        .and_then(|(_, style)| style.split_once('}'))
        .expect("inline plate style must exist")
        .0;
    for declaration in [
        "color: #fff;",
        "background: rgba(0, 0, 0, 0.6);",
        "text-shadow:",
        "padding:",
        "border-radius:",
    ] {
        assert!(plate.contains(declaration), "missing {declaration}");
    }
    let page = page.to_ascii_lowercase();
    for forbidden in [
        "<script", "@import", "url(", "http:", "https:", "//", "src=", "<link",
    ] {
        assert!(
            !page.contains(forbidden),
            "unexpected resource: {forbidden}"
        );
    }
}

#[tokio::test]
async fn simulated_overlay_origin() {
    let overlay = Overlay::start(0).await.unwrap();
    let client = reqwest::Client::builder().no_proxy().build().unwrap();
    let response = client.get(overlay.url()).send().await.unwrap();
    assert_eq!(response.status(), 200);
    assert_eq!(response.headers()["x-content-type-options"], "nosniff");
    assert_eq!(response.headers()["cache-control"], "no-store");
    assert!(
        response.headers()["content-security-policy"]
            .to_str()
            .unwrap()
            .contains("default-src 'none'")
    );
    assert!(response.text().await.unwrap().contains("Static test page"));
    for route in ["rpc", "events"] {
        let url = format!("{}{route}", overlay.url());
        assert_eq!(client.get(&url).send().await.unwrap().status(), 404);
        assert_eq!(
            client
                .post(&url)
                .body("simulated body")
                .send()
                .await
                .unwrap()
                .status(),
            404
        );
    }
    assert_eq!(
        client.post(overlay.url()).send().await.unwrap().status(),
        405
    );
    assert_eq!(
        client
            .get(overlay.url())
            .header("host", "untrusted.example")
            .send()
            .await
            .unwrap()
            .status(),
        403
    );
    assert_eq!(
        client
            .get(overlay.url())
            .header("host", "localhost:1")
            .send()
            .await
            .unwrap()
            .status(),
        403
    );
}
