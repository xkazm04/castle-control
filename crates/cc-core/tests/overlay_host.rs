//! All fixtures, capabilities and content are simulated; no live Twitch or OBS.
mod overlay_support;
use cc_core::{
    bind,
    overlay::package::{Asset, VerifiedPackage},
};
use cc_types::{BeaconsIntensity, DesignLayer, DesignPrivileges, ErrorCode};
use overlay_support::*;
use serde_json::json;
use std::{collections::BTreeMap, sync::Arc};

#[tokio::test]
async fn local_bundle_assets_sse_contract_and_origin_isolation() {
    let directory = tempfile::tempdir().unwrap();
    let service = native(&directory.path().join("store")).await;
    let app = app(service.clone());
    let (address, server) = bind(app.clone(), ([127, 0, 0, 1], 0).into()).await.unwrap();
    let task = tokio::spawn(server);
    let client = client();
    let origin = service.overlay_url();
    let visual = visual(true);
    call(&app, "beacons.visual.upsert", json!({"visual":visual})).await;
    let path = directory.path().join("assets");
    std::fs::create_dir(&path).unwrap();
    let image: Arc<[u8]> = b"\x89PNG\r\n\x1a\nSimulated raster".to_vec().into();
    std::fs::write(path.join("art.png"), &image).unwrap();
    let mut package = package("Simulated");
    let DesignLayer::Text {
        properties,
        bindings,
        ..
    } = package.layers[0].clone()
    else {
        unreachable!()
    };
    package.layers.push(DesignLayer::Image {
        asset: "art.png".to_owned().try_into().unwrap(),
        properties,
        bindings,
    });
    let package = seal(
        package,
        &BTreeMap::from([(
            "art.png".into(),
            Asset {
                bytes: image.clone(),
                mime: "image/png",
            },
        )]),
    );
    service
        .accept_beacons_package(package.clone(), &path, false)
        .unwrap();
    std::fs::write(path.join("art.png"), b"unverified later edit").unwrap();
    let source = call(
        &app,
        "beacons.source.url",
        json!({"visual_id":"simulated-frame"}),
    )
    .await;
    let hash = String::from(package.content_hash.clone());
    assert_eq!(
        source["url"],
        format!("{origin}beacons/simulated-frame?package_hash={hash}")
    );
    let page = client
        .get(source["url"].as_str().unwrap())
        .send()
        .await
        .unwrap();
    assert_eq!(page.status(), 200);
    let policy = page.headers()["content-security-policy"].clone();
    assert!(page.text().await.unwrap().contains("src=\"/bundle.js\""));
    for route in [
        "bundle.js".to_owned(),
        format!("assets/simulated-frame/{hash}/art.png"),
        "push/beacons?visual_id=simulated-frame".to_owned(),
    ] {
        let mut response = client.get(format!("{origin}{route}")).send().await.unwrap();
        assert_eq!(response.status(), 200);
        assert_eq!(response.headers()["content-security-policy"], policy);
        assert_eq!(response.headers()["x-content-type-options"], "nosniff");
        assert_eq!(response.headers()["cache-control"], "no-store");
        if route.starts_with("push/") {
            assert!(
                response.headers()["content-type"]
                    .to_str()
                    .unwrap()
                    .starts_with("text/event-stream")
            );
            assert_eq!(snapshot(&mut response).await.package, Some(package.clone()));
        } else if route.starts_with("assets/") {
            assert_eq!(response.bytes().await.unwrap().as_ref(), image.as_ref());
        } else {
            assert!(
                response
                    .text()
                    .await
                    .unwrap()
                    .contains("beacons.render.snapshot")
            );
        }
        let wrong = client
            .get(format!("{origin}{route}"))
            .header("host", "evil.example")
            .send()
            .await
            .unwrap();
        assert_eq!(wrong.status(), 403);
        assert_eq!(wrong.headers()["cache-control"], "no-store");
    }
    for route in ["rpc", "events", "forward", "beacons/invalid_slug"] {
        assert_eq!(
            client
                .get(format!("{origin}{route}"))
                .send()
                .await
                .unwrap()
                .status(),
            404
        );
        assert_eq!(
            client
                .post(format!("{origin}{route}"))
                .send()
                .await
                .unwrap()
                .status(),
            if route == "beacons/invalid_slug" {
                405
            } else {
                404
            }
        );
    }
    let denied = client
        .post(format!("http://{address}/rpc"))
        .bearer_auth(app.session_token())
        .header("origin", origin.trim_end_matches('/'))
        .json(&json!({"method":"status.get","params":{}}))
        .send()
        .await
        .unwrap();
    assert_eq!(denied.status(), 403);
    assert!(!denied.headers().contains_key("access-control-allow-origin"));
    for target in [
        format!("{origin}rpc"),
        format!("{origin}beacons/missing"),
        format!("{origin}beacons/simulated-frame"),
        format!(
            "{origin}beacons/simulated-frame?package_hash={}",
            "0".repeat(64)
        ),
        "http://127.0.0.1:1234/".into(),
    ] {
        let error = service
            .create_source(&cc_types::ObsSourceParams {
                scene_name: "Simulated".into(),
                source_name: "Simulated".into(),
                url: target,
                width: 1280,
                height: 720,
            })
            .await
            .unwrap_err();
        assert_eq!(error.code, ErrorCode::Invalid);
    }
    app.shutdown();
    task.await.unwrap().unwrap();
}

#[tokio::test]
async fn accepted_state_only_consent_widening_and_latest_on_reconnect() {
    let directory = tempfile::tempdir().unwrap();
    let service = native(&directory.path().join("store")).await;
    let app = app(service.clone());
    let client = client();
    let url = format!(
        "{}push/beacons?visual_id=simulated-frame",
        service.overlay_url()
    );
    let visual = visual(true);
    call(&app, "beacons.visual.upsert", json!({"visual":visual})).await;
    let root = directory.path().join("package");
    std::fs::create_dir(&root).unwrap();
    let data = seal(package("Default data-only"), &BTreeMap::new());
    assert!(data.privileges.is_none());
    let mut response = client.get(&url).send().await.unwrap();
    assert!(
        tokio::time::timeout(std::time::Duration::from_millis(30), response.chunk())
            .await
            .is_err()
    );
    service
        .accept_beacons_package(data.clone(), &root, false)
        .unwrap();
    assert_eq!(snapshot(&mut response).await.package, Some(data.clone()));
    let script = "entry.js".to_owned();
    let bytes: Arc<[u8]> = b"document.body.dataset.scriptRan = 'simulated';"
        .to_vec()
        .into();
    std::fs::write(root.join(&script), &bytes).unwrap();
    let mut scripted = data.clone();
    scripted.privileges = Some(DesignPrivileges::Scripts {
        scripts: vec![script.clone().try_into().unwrap()],
    });
    scripted = seal(
        scripted,
        &BTreeMap::from([(
            script.clone(),
            Asset {
                bytes: bytes.clone(),
                mime: "text/javascript; charset=utf-8",
            },
        )]),
    );
    assert_eq!(
        service
            .accept_beacons_package(scripted.clone(), &root, false)
            .unwrap_err()
            .code,
        ErrorCode::NeedsHuman
    );
    assert_eq!(
        client
            .get(format!(
                "{}assets/simulated-frame/{}/{script}",
                service.overlay_url(),
                String::from(scripted.content_hash.clone())
            ))
            .send()
            .await
            .unwrap()
            .status(),
        404
    );
    let mut reconnect = client.get(&url).send().await.unwrap();
    assert_eq!(snapshot(&mut reconnect).await.package, Some(data));
    service
        .accept_beacons_package(scripted.clone(), &root, true)
        .unwrap();
    assert_eq!(
        snapshot(&mut response).await.package,
        Some(scripted.clone())
    );
    std::fs::write(root.join("wider.js"), &bytes).unwrap();
    let mut wider = scripted.clone();
    wider.privileges = Some(DesignPrivileges::Scripts {
        scripts: vec![
            script.clone().try_into().unwrap(),
            "wider.js".to_owned().try_into().unwrap(),
        ],
    });
    wider = seal(
        wider,
        &BTreeMap::from([
            (
                script,
                Asset {
                    bytes: bytes.clone(),
                    mime: "text/javascript",
                },
            ),
            (
                "wider.js".into(),
                Asset {
                    bytes,
                    mime: "text/javascript",
                },
            ),
        ]),
    );
    assert_eq!(
        service
            .accept_beacons_package(wider, &root, false)
            .unwrap_err()
            .code,
        ErrorCode::NeedsHuman
    );
    for value in 0..1000 {
        service
            .accept_beacons_intensity(BeaconsIntensity {
                visual_id: visual.visual_id.clone(),
                intensity: (f64::from(value) / 1000.0).try_into().unwrap(),
            })
            .unwrap();
    }
    assert_eq!(
        f64::from(snapshot(&mut response).await.intensity.intensity),
        0.999
    );
    let mut reconnect = client.get(&url).send().await.unwrap();
    let latest = snapshot(&mut reconnect).await;
    assert_eq!(f64::from(latest.intensity.intensity), 0.999);
    assert_eq!(latest.package, Some(scripted.clone()));
    let mut invalid = scripted;
    invalid.content_hash = "0".repeat(64).try_into().unwrap();
    assert_eq!(
        service
            .accept_beacons_package(invalid, &root, true)
            .unwrap_err()
            .code,
        ErrorCode::Invalid
    );
    let mut curve = visual.curve;
    curve.ranges[0].intensity = 0.25.try_into().unwrap();
    call(
        &app,
        "beacons.curve.set",
        json!({"visual_id":"simulated-frame","curve":curve}),
    )
    .await;
    let mut reconnect = client.get(&url).send().await.unwrap();
    assert_eq!(
        f64::from(snapshot(&mut reconnect).await.intensity.intensity),
        0.25
    );
    app.shutdown();
}

#[test]
fn schema_rejects_remote_assets_and_hash_verifier_rejects_tampering() {
    let directory = tempfile::tempdir().unwrap();
    let mut remote = serde_json::to_value(package("Simulated")).unwrap();
    remote["layers"][0]["kind"] = json!("image");
    remote["layers"][0].as_object_mut().unwrap().remove("text");
    for path in [
        "https://remote.example/a.png",
        "data:image/png;base64,AA",
        "../outside.png",
        "/absolute.png",
        "a%2fb.png",
    ] {
        remote["layers"][0]["asset"] = json!(path);
        assert!(serde_json::from_value::<cc_types::DesignPackage>(remote.clone()).is_err());
    }
    let valid = seal(package("Accepted"), &BTreeMap::new());
    assert!(VerifiedPackage::read(valid.clone(), directory.path()).is_ok());
    let mut altered = valid;
    if let DesignLayer::Text { text, .. } = &mut altered.layers[0] {
        *text = "Unverified edit".into();
    }
    assert!(VerifiedPackage::read(altered, directory.path()).is_err());
}

#[test]
fn asset_symlink_escape_is_refused() {
    let directory = tempfile::tempdir().unwrap();
    let root = directory.path().join("root");
    let outside = directory.path().join("outside");
    std::fs::create_dir(&root).unwrap();
    std::fs::create_dir(&outside).unwrap();
    std::fs::write(outside.join("art.png"), b"\x89PNG\r\n\x1a\nSimulated").unwrap();
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        assert!(
            std::process::Command::new("cmd")
                .creation_flags(0x08000000)
                .args(["/c", "mklink", "/J"])
                .arg(root.join("linked"))
                .arg(&outside)
                .output()
                .unwrap()
                .status
                .success()
        );
    }
    #[cfg(unix)]
    std::os::unix::fs::symlink(&outside, root.join("linked")).unwrap();
    let mut value = serde_json::to_value(package("Simulated")).unwrap();
    let layer = value["layers"][0].as_object_mut().unwrap();
    layer.remove("text");
    layer.insert("kind".into(), json!("image"));
    layer.insert("asset".into(), json!("linked/art.png"));
    let assets = BTreeMap::from([(
        "linked/art.png".into(),
        Asset {
            bytes: b"\x89PNG\r\n\x1a\nSimulated".to_vec().into(),
            mime: "image/png",
        },
    )]);
    let package = seal(serde_json::from_value(value).unwrap(), &assets);
    assert!(VerifiedPackage::read(package, &root).is_err());
}
