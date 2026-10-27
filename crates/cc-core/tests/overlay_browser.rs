//! Explicit integration probe, never connects to the owner's browser or OBS.
#[path = "overlay_support/browser.rs"]
mod browser;
mod overlay_support;
use browser::{Browser, report};
use cc_core::overlay::package::Asset;
use cc_types::{DesignPrivileges, ErrorCode};
use overlay_support::*;
use serde_json::json;
use std::{
    collections::BTreeMap,
    sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    },
    time::{Duration, Instant},
};

#[tokio::test]
#[ignore = "requires installed Chrome; run explicitly with --ignored --nocapture"]
async fn native_handoff_to_browser_render_delivery_budget_and_csp() {
    let directory = tempfile::tempdir().unwrap();
    let service = native(&directory.path().join("store")).await;
    let app = app(service.clone());
    let root = directory.path().join("package");
    std::fs::create_dir(&root).unwrap();
    let visual = visual(true);
    call(&app, "beacons.visual.upsert", json!({"visual":visual})).await;
    let initial = seal(package("Simulated browser probe"), &BTreeMap::new());
    service
        .accept_beacons_package(initial.clone(), &root, false)
        .unwrap();
    let url = format!("{}beacons/simulated-frame", service.overlay_url());
    let mut browser = Browser::open(&url).await;
    browser
        .applied(&String::from(initial.content_hash.clone()), 0.0)
        .await;
    assert_eq!(
        browser
            .evaluate("document.getElementById('scene').textContent")
            .await,
        "Simulated browser probe"
    );
    assert_eq!(
        browser
            .evaluate("document.body.dataset.scriptRan || ''")
            .await,
        ""
    );
    // A disallowed resource targets only this simulated second loopback server.
    // A real browser enforces CSP before it can hit that listener.
    let requests = Arc::new(AtomicUsize::new(0));
    let count = requests.clone();
    let remote = axum::Router::new().fallback(move || {
        let count = count.clone();
        async move {
            count.fetch_add(1, Ordering::SeqCst);
            "Simulated forbidden resource"
        }
    });
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();
    let remote_task = tokio::spawn(async move {
        axum::serve(listener, remote).await.unwrap();
    });
    browser.evaluate("globalThis.violations=[]; document.addEventListener('securitypolicyviolation',e=>globalThis.violations.push(e.effectiveDirective)); true").await;
    browser.evaluate(&format!("const img=document.createElement('img'); img.src='http://127.0.0.1:{port}/remote.png'; document.body.append(img); fetch('http://127.0.0.1:{port}/remote').catch(()=>false); const script=document.createElement('script'); script.textContent='document.body.dataset.inlineRan=1'; document.body.append(script); true")).await;
    // Test the JS evaluator too, with CDP's unsafe-eval override explicitly off.
    browser.evaluate("try { globalThis['eval']('document.body.dataset.evalRan=1'); } catch { document.body.dataset.evalBlocked='yes'; } true").await;
    tokio::time::sleep(Duration::from_millis(100)).await;
    assert_eq!(requests.load(Ordering::SeqCst), 0);
    assert_eq!(
        browser
            .evaluate("document.body.dataset.inlineRan || document.body.dataset.evalRan || ''")
            .await,
        ""
    );
    assert_eq!(
        browser.evaluate("document.body.dataset.evalBlocked").await,
        "yes"
    );
    for directive in ["img-src", "connect-src", "script-src-elem"] {
        assert_eq!(
            browser
                .evaluate(&format!("globalThis.violations.includes('{directive}')"))
                .await,
            true
        );
    }
    let mut samples = Vec::new();
    for index in 0..20 {
        let next = seal(
            package(&format!("Simulated package {index}")),
            &BTreeMap::new(),
        );
        let start = Instant::now();
        service
            .accept_beacons_package(next.clone(), &root, false)
            .unwrap();
        browser.applied(&String::from(next.content_hash), 0.0).await;
        samples.push(start.elapsed().as_secs_f64() * 1000.0);
    }
    report("accepted package handoff", samples);
    let current = seal(package("Simulated package 19"), &BTreeMap::new());
    browser
        .evaluate("globalThis.originalNode=document.getElementById('scene').firstChild; true")
        .await;
    let mut samples = Vec::new();
    for index in 0..20 {
        let intensity = if index % 2 == 0 { 0.25 } else { 0.75 };
        let mut curve = visual.curve.clone();
        curve.ranges[0].intensity = intensity.try_into().unwrap();
        let start = Instant::now();
        call(
            &app,
            "beacons.curve.set",
            json!({"visual_id":"simulated-frame","curve":curve}),
        )
        .await;
        browser
            .applied(&String::from(current.content_hash.clone()), intensity)
            .await;
        samples.push(start.elapsed().as_secs_f64() * 1000.0);
    }
    report("accepted curve commit/handoff", samples);
    assert_eq!(
        browser
            .evaluate("globalThis.originalNode===document.getElementById('scene').firstChild")
            .await,
        true
    );
    browser.command("Page.reload", json!({})).await;
    browser
        .applied(&String::from(current.content_hash.clone()), 0.75)
        .await;
    // Initial scripted permission and widening both require native consent.
    let bytes: Arc<[u8]> = b"document.body.dataset.scriptRan='simulated';"
        .to_vec()
        .into();
    std::fs::write(root.join("entry.js"), &bytes).unwrap();
    let mut scripted = current;
    scripted.privileges = Some(DesignPrivileges::Scripts {
        scripts: vec!["entry.js".to_owned().try_into().unwrap()],
    });
    let mut assets = BTreeMap::from([(
        "entry.js".into(),
        Asset {
            bytes,
            mime: "text/javascript",
        },
    )]);
    scripted = seal(scripted, &assets);
    assert_eq!(
        service
            .accept_beacons_package(scripted.clone(), &root, false)
            .unwrap_err()
            .code,
        ErrorCode::NeedsHuman
    );
    assert_eq!(
        browser
            .evaluate("document.body.dataset.scriptRan || ''")
            .await,
        ""
    );
    service
        .accept_beacons_package(scripted.clone(), &root, true)
        .unwrap();
    browser
        .applied(&String::from(scripted.content_hash.clone()), 0.75)
        .await;
    assert_eq!(
        browser.evaluate("document.body.dataset.scriptRan").await,
        "simulated"
    );
    let wider: Arc<[u8]> = b"document.body.dataset.widerRan='simulated';"
        .to_vec()
        .into();
    std::fs::write(root.join("wider.js"), &wider).unwrap();
    assets.insert(
        "wider.js".into(),
        Asset {
            bytes: wider,
            mime: "text/javascript",
        },
    );
    scripted.privileges = Some(DesignPrivileges::Scripts {
        scripts: vec![
            "entry.js".to_owned().try_into().unwrap(),
            "wider.js".to_owned().try_into().unwrap(),
        ],
    });
    let scripted = seal(scripted, &assets);
    assert_eq!(
        service
            .accept_beacons_package(scripted.clone(), &root, false)
            .unwrap_err()
            .code,
        ErrorCode::NeedsHuman
    );
    assert_eq!(
        browser
            .evaluate("document.body.dataset.widerRan || ''")
            .await,
        ""
    );
    service
        .accept_beacons_package(scripted.clone(), &root, true)
        .unwrap();
    browser
        .applied(&String::from(scripted.content_hash), 0.75)
        .await;
    assert_eq!(
        browser.evaluate("document.body.dataset.widerRan").await,
        "simulated"
    );
    browser::obs_demo(&service, &app, &root).await;
    browser.close().await;
    remote_task.abort();
    app.shutdown();
}
