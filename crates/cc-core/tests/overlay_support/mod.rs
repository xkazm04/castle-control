#![allow(dead_code)]
use cc_core::{AppState, NativeConfig, NativeServices, Registry};
use cc_store::Store;
use cc_types::{BeaconsRenderSnapshot, DesignPackage, Visual, parse_request};
use serde_json::{Value, json};
use std::{collections::BTreeMap, sync::Arc};

pub async fn native(root: &std::path::Path) -> Arc<NativeServices> {
    NativeServices::new(
        NativeConfig {
            twitch: Default::default(),
            obs: cc_obs::Config {
                port: 0,
                password_label: "simulated-unused".into(),
            },
            overlay_port: 0,
        },
        Store::open(root).unwrap(),
        Arc::new(|_| panic!("no live login")),
    )
    .await
    .unwrap()
}
pub fn app(service: Arc<NativeServices>) -> Arc<AppState> {
    AppState::new(Registry::with_native(service), 32).unwrap()
}
pub async fn call(app: &AppState, method: &str, params: Value) -> Value {
    let request =
        parse_request(&serde_json::to_vec(&json!({"method":method,"params":params})).unwrap())
            .unwrap();
    app.registry.dispatch(&request).await.unwrap()
}
pub fn visual(design: bool) -> Visual {
    let mut value = json!({"visual_id":"simulated-frame","name":"Simulated frame", "curve":{"ranges":[{"total":0,"intensity":0.0},{"total":100,"intensity":1.0}],"decay":{"kind":"none"}}});
    if design {
        value["design_id"] = json!("simulated-art");
    }
    serde_json::from_value(value).unwrap()
}
pub fn package(text: &str) -> DesignPackage {
    serde_json::from_value(json!({"design_id":"simulated-art","content_hash":"0".repeat(64),"layers":[{"kind":"text","text":text,"properties":{"x":0.0,"y":0.0,"width":100,"height":80,"scale":1.0,"opacity":1.0},"bindings":[{"property":"opacity","output_range":{"at_zero":0.2,"at_one":1.0}}]}]})).unwrap()
}
pub fn seal(
    mut package: DesignPackage,
    assets: &BTreeMap<String, cc_core::overlay::package::Asset>,
) -> DesignPackage {
    package.content_hash = cc_core::overlay::package::package_hash(&package, assets)
        .unwrap()
        .try_into()
        .unwrap();
    package
}
pub fn client() -> reqwest::Client {
    reqwest::Client::builder().no_proxy().build().unwrap()
}
pub async fn snapshot(response: &mut reqwest::Response) -> BeaconsRenderSnapshot {
    tokio::time::timeout(std::time::Duration::from_secs(2), async {
        let mut bytes = Vec::new();
        loop {
            bytes.extend_from_slice(&response.chunk().await.unwrap().expect("SSE ended"));
            let text = String::from_utf8_lossy(&bytes);
            if let Some((event, _)) = text.split_once("\n\n") {
                assert!(
                    event
                        .lines()
                        .any(|line| line == "event: beacons.render.snapshot")
                );
                let payload = event
                    .lines()
                    .find_map(|line| line.strip_prefix("data: "))
                    .unwrap();
                return serde_json::from_str(payload).unwrap();
            }
        }
    })
    .await
    .expect("latest accepted snapshot within two seconds")
}
