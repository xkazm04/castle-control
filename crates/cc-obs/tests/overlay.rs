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
    assert!(page.contains("<style>html, body { background: transparent; margin: 0; }</style>"));
    assert!(!page.contains("<script") && !page.contains("src=") && !page.contains("<link"));
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
