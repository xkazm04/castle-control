//! All HTTP requests are simulated and restricted to a local ephemeral server.
use cc_obs::Overlay;

#[tokio::test]
async fn simulated_overlay_csp_only_allows_inline_styles() {
    let overlay = Overlay::start(0).await.unwrap();
    let client = reqwest::Client::builder().no_proxy().build().unwrap();
    let response = client.get(overlay.url()).send().await.unwrap();
    let policy = response.headers()["content-security-policy"]
        .to_str()
        .unwrap();
    assert_eq!(
        policy.as_bytes(),
        concat!(
            "default-src 'none'; script-src 'none'; connect-src 'none'; img-src 'none'; ",
            "style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
        )
        .as_bytes()
    );
    let mut directives: Vec<_> = policy.split(';').map(str::trim).collect();
    directives.sort_unstable();
    // Exact directive/source sets reject remote styles, overrides and duplicates.
    assert_eq!(
        directives,
        [
            "base-uri 'none'",
            "connect-src 'none'",
            "default-src 'none'",
            "form-action 'none'",
            "frame-ancestors 'none'",
            "img-src 'none'",
            "script-src 'none'",
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
