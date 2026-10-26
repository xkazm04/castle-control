//! All HTTP requests are simulated and restricted to a local ephemeral server.
use cc_obs::Overlay;
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
