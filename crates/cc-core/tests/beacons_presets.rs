//! Built-in atlas art, simulated configuration only; no provider or OBS connection.
mod overlay_support;
use cc_types::{DesignLayer, ErrorCode};
use overlay_support::*;
use serde_json::json;

#[tokio::test]
async fn beacons_presets_upsert_serves_verified_embedded_webp() {
    let directory = tempfile::tempdir().unwrap();
    let service = native(&directory.path().join("native")).await;
    let app = app(service.clone());
    let mut visual = visual(false);
    visual.design_id = Some("preset-heraldic-altar".to_owned().try_into().unwrap());
    call(&app, "beacons.visual.upsert", json!({"visual":visual})).await;
    let source = call(
        &app,
        "beacons.source.url",
        json!({"visual_id":visual.visual_id}),
    )
    .await;
    assert!(source["url"].as_str().unwrap().contains("?package_hash="));
    let mut stream = client()
        .get(format!(
            "{}push/beacons?visual_id={}",
            service.overlay_url(),
            visual.visual_id.as_str()
        ))
        .send()
        .await
        .unwrap();
    let snapshot = snapshot(&mut stream).await;
    let package = snapshot.package.unwrap();
    assert_eq!(package.design_id.as_str(), "preset-heraldic-altar");
    assert_eq!(package.layers.len(), 1);
    assert!(package.privileges.is_none());
    let DesignLayer::Image {
        asset,
        properties,
        bindings,
    } = &package.layers[0]
    else {
        panic!("image layer")
    };
    assert_eq!(properties.width.get(), 640);
    assert_eq!(properties.height.get(), 857);
    assert_eq!(bindings.len(), 2);
    let response = client()
        .get(format!(
            "{}assets/{}/{}/{}",
            service.overlay_url(),
            visual.visual_id.as_str(),
            String::from(package.content_hash),
            String::from(asset.clone())
        ))
        .send()
        .await
        .unwrap();
    assert_eq!(response.headers()["content-type"], "image/webp");
    assert_eq!(
        response.bytes().await.unwrap().as_ref(),
        include_bytes!("../../../apps/desktop/public/art/preset-heraldic-altar.webp")
    );
    app.shutdown();
}

#[tokio::test]
async fn beacons_presets_unknown_design_still_withholds_snapshot() {
    let directory = tempfile::tempdir().unwrap();
    let service = native(&directory.path().join("native")).await;
    let app = app(service.clone());
    let mut visual = visual(false);
    visual.design_id = Some("my-custom".to_owned().try_into().unwrap());
    call(&app, "beacons.visual.upsert", json!({"visual":visual})).await;
    let request = cc_types::parse_request(
        &serde_json::to_vec(
            &json!({"method":"beacons.source.url","params":{"visual_id":visual.visual_id}}),
        )
        .unwrap(),
    )
    .unwrap();
    assert_eq!(
        app.registry.dispatch(&request).await.unwrap_err().code,
        ErrorCode::Unavailable
    );
    let mut response = client()
        .get(format!(
            "{}push/beacons?visual_id={}",
            service.overlay_url(),
            visual.visual_id.as_str()
        ))
        .send()
        .await
        .unwrap();
    assert!(
        tokio::time::timeout(std::time::Duration::from_millis(100), response.chunk())
            .await
            .is_err()
    );
    app.shutdown();
}

#[tokio::test]
async fn beacons_presets_restart_restores_same_hash_without_extracted_assets() {
    let directory = tempfile::tempdir().unwrap();
    let data = directory.path().join("data");
    let mut previous = None;
    for first in [true, false] {
        let service = native(&directory.path().join("native")).await;
        let app = service.app_with_data_dir(32, &data).unwrap();
        let mut visual = visual(false);
        visual.design_id = Some("preset-glass-frame".to_owned().try_into().unwrap());
        if first {
            call(&app, "beacons.visual.upsert", json!({"visual":visual})).await;
        } else {
            let saved = call(&app, "beacons.visual.list", json!({})).await;
            assert_eq!(saved["visuals"][0]["design_id"], "preset-glass-frame");
        }
        let mut stream = client()
            .get(format!(
                "{}push/beacons?visual_id={}",
                service.overlay_url(),
                visual.visual_id.as_str()
            ))
            .send()
            .await
            .unwrap();
        let package = snapshot(&mut stream).await.package.unwrap();
        let hash = String::from(package.content_hash);
        if let Some(previous) = &previous {
            assert_eq!(&hash, previous);
        }
        previous = Some(hash);
        assert_no_extracted_art(directory.path());
        app.shutdown();
        drop(stream);
        drop(app);
        drop(service);
        // Let the existing native pump drop its app/store handles before reopen.
        tokio::task::yield_now().await;
    }
}

fn assert_no_extracted_art(root: &std::path::Path) {
    for entry in std::fs::read_dir(root).unwrap() {
        let path = entry.unwrap().path();
        if path.is_dir() {
            assert_no_extracted_art(&path);
        } else {
            assert_ne!(path.extension().and_then(|e| e.to_str()), Some("webp"));
        }
    }
}

#[tokio::test]
async fn beacons_presets_parity_with_real_desktop_catalog_and_webp_headers() {
    // Evaluate the real TS display data with the repo's existing TypeScript
    // compiler. No parallel style list or hand-maintained parser approximation.
    let workspace = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    let output = std::process::Command::new("node")
        .current_dir(&workspace)
        .args(["--input-type=module", "-e", r#"
import ts from 'typescript';
import { readFileSync } from 'node:fs';
const compile = path => ts.transpileModule(readFileSync(path, 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext }
}).outputText;
const url = source => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
const model = url(compile('apps/desktop/src/demo/model.ts'));
const source = compile('apps/desktop/src/rooms/visuals/presets.ts').replace('../../demo/model.js', model);
const { presets } = await import(url(source));
process.stdout.write(JSON.stringify(presets));
"#])
        .output().unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    let presets: Vec<serde_json::Value> = serde_json::from_slice(&output.stdout).unwrap();
    assert_eq!(presets.len(), 12);
    let ids: std::collections::BTreeSet<_> =
        presets.iter().map(|p| p["id"].as_str().unwrap()).collect();
    assert_eq!(ids.len(), 12);
    let directory = tempfile::tempdir().unwrap();
    let service = native(&directory.path().join("native")).await;
    let app = app(service.clone());
    for preset in presets {
        let mut visual = visual(false);
        visual.design_id = Some(
            preset["id"]
                .as_str()
                .unwrap()
                .to_owned()
                .try_into()
                .unwrap(),
        );
        call(&app, "beacons.visual.upsert", json!({"visual":visual})).await;
        let mut stream = client()
            .get(format!(
                "{}push/beacons?visual_id={}",
                service.overlay_url(),
                visual.visual_id.as_str()
            ))
            .send()
            .await
            .unwrap();
        let package = snapshot(&mut stream)
            .await
            .package
            .expect("every desktop ID is installed natively");
        assert_eq!(package.design_id, visual.design_id.unwrap());
        let DesignLayer::Image {
            asset,
            properties,
            bindings,
        } = &package.layers[0]
        else {
            panic!("image")
        };
        let asset = String::from(asset.clone());
        assert_eq!(format!("/art/{asset}"), preset["url"].as_str().unwrap());
        let bytes = std::fs::read(
            workspace
                .join("apps/desktop/public")
                .join(preset["url"].as_str().unwrap().trim_start_matches('/')),
        )
        .unwrap();
        assert_eq!(&bytes[12..16], b"VP8X");
        let dimension =
            |start| 1 + u32::from_le_bytes([bytes[start], bytes[start + 1], bytes[start + 2], 0]);
        assert_eq!(properties.width.get(), dimension(24));
        assert_eq!(properties.height.get(), dimension(27));
        assert_eq!(preset["width"], properties.width.get());
        assert_eq!(preset["height"], properties.height.get());
        let object = preset["kind"] == "object";
        assert_eq!(
            serde_json::to_value(bindings).unwrap()[0],
            json!({"property":"opacity","output_range":{"at_zero":if object {0.35} else {0.25},"at_one":1.0}})
        );
        assert_eq!(bindings.len(), if object { 2 } else { 1 });
        if object {
            assert_eq!(
                serde_json::to_value(&bindings[1]).unwrap(),
                json!({"property":"scale","output_range":{"at_zero":0.9,"at_one":1.05}})
            );
        }
    }
    app.shutdown();
}
