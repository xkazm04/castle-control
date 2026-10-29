//! Fixture-first native registration: no credentials, live adapters or I/O driver.
// The shared fixture module also supplies a harness used only by tests/lots.rs.
#[allow(dead_code)]
mod lots_support;
mod offline_support;

use cc_core::{
    AppState, EventHub, NativeServices, Registry, beacons::BeaconsModule,
    gatehouse::GatehouseModule, lots::LotsModule,
};
use cc_lots::{Intake, PassedMessage};
use cc_types::{ErrorCode, EventKind, Verdict};
use lots_support::{at, draw, error, facts, rpc};
use serde_json::{Value, json};
use std::sync::Arc;

#[test]
fn exporter_lists_the_native_inventory_without_starting_services() {
    let result = std::process::Command::new(env!("CARGO_BIN_EXE_export-registry"))
        .output()
        .unwrap();
    assert!(result.status.success());
    let methods: Vec<String> = serde_json::from_slice(&result.stdout).unwrap();
    let mut expected = NativeServices::METHODS.to_vec();
    expected.extend(LotsModule::METHODS);
    expected.extend(GatehouseModule::METHODS);
    expected.extend(BeaconsModule::METHODS);
    expected.extend(["steward.ask", "steward.writ.seal", "steward.writ.tear"]);
    expected.sort();
    assert_eq!(methods, expected);
    assert_eq!(Registry::with_status().methods(), expected);
    assert!(methods.iter().any(|name| name == "beacons.source.url"));
    assert!(
        methods
            .iter()
            .all(|name| cc_types::RpcRequest::NAMES.contains(&name.as_str()))
    );
}

#[test]
fn fixture_workflow_persists_and_opens_no_sockets_without_live_flags() {
    assert!(
        !std::env::vars_os().any(|(key, _)| key.to_string_lossy().starts_with("CC_LIVE_")),
        "run offline acceptance with CC_LIVE_* unset"
    );
    offline_support::assert_no_sockets();
    // Any attempted async network operation fails: this runtime has no I/O driver.
    tokio::runtime::Builder::new_current_thread()
        .build()
        .unwrap()
        .block_on(async {
            default_registration().await;
            persisted_workflow().await;
        });
    offline_support::assert_no_sockets();
}

async fn default_registration() {
    let app = AppState::new(Registry::with_status(), 64).unwrap();
    // URL registration must not make the socket-free constructors start a server.
    let visual = json!({"visual_id":"simulated-frame", "name":"Simulated frame",
        "curve":{"ranges":[{"total":0,"intensity":0.0}],"decay":{"kind":"none"}}});
    assert_eq!(
        error(
            &app.registry,
            "beacons.source.url",
            json!({"visual_id":"missing"})
        )
        .await,
        ErrorCode::NotFound
    );
    rpc(
        &app.registry,
        "beacons.visual.upsert",
        json!({"visual":visual}),
    )
    .await;
    assert_eq!(
        error(
            &app.registry,
            "beacons.source.url",
            json!({"visual_id":"simulated-frame"})
        )
        .await,
        ErrorCode::Unavailable
    );
    assert_eq!(
        rpc(&app.registry, "lots.draw.list", json!({})).await,
        json!({"draws":[]})
    );
    rpc(&app.registry, "lots.draw.upsert", json!({"draw":draw()})).await;
    let lots = app.registry.simulated_lots().unwrap();
    add(&lots, "1");
    cast(&app.registry).await;
    assert_eq!(
        app.events
            .since(0)
            .unwrap()
            .iter()
            .map(|event| event.kind)
            .collect::<Vec<_>>(),
        [
            EventKind::Roll,
            EventKind::Roll,
            EventKind::Sealed,
            EventKind::Cast
        ]
    );
    let rules = rpc(&app.registry, "gatehouse.rules.list", json!({})).await;
    assert_eq!(rules["rules"].as_array().unwrap().len(), 1);
    assert_eq!(rules["rules"][0]["rule_class"], "rail");
    assert_eq!(rules["rules"][0]["action"], "hold");
    // Default registries own separate roots, never a process-global fixture store.
    let other = Registry::with_status();
    assert_eq!(
        rpc(&other, "lots.draw.list", json!({})).await,
        json!({"draws":[]})
    );
}

async fn persisted_workflow() {
    let root = tempfile::tempdir().unwrap();
    let events = Arc::new(EventHub::new(64).unwrap());
    let registry = Registry::with_fixture_root(root.path(), events.clone()).unwrap();
    let app = AppState::with_events(registry, events).unwrap();
    let mut expected_rules = rpc(&app.registry, "gatehouse.rules.list", json!({})).await;
    let lots = app.registry.simulated_lots().unwrap();
    assert_eq!(
        rpc(&app.registry, "lots.draw.upsert", json!({"draw":draw()})).await,
        draw()
    );
    assert_eq!(
        rpc(
            &app.registry,
            "lots.draw.check",
            json!({"policy":draw()["policy"]})
        )
        .await,
        json!({"result":"ok","reasons":[]})
    );
    add(&lots, "1");
    add(&lots, "2");
    let cast = cast(&app.registry).await;
    let rule = json!({"rule_id":"simulated-links", "name":"Simulated links", "rule_class":"pattern",
        "mode":"shadow", "action":"delete", "delivery":"streamer", "pattern":"simulated link"});
    assert_eq!(
        rpc(
            &app.registry,
            "gatehouse.rules.upsert",
            json!({"rule":rule})
        )
        .await,
        rule
    );
    expected_rules["rules"]
        .as_array_mut()
        .unwrap()
        .push(rule.clone());
    let mode = rpc(
        &app.registry,
        "gatehouse.rules.setMode",
        json!({"rule_id":"simulated-links","mode":"shadow"}),
    )
    .await;
    assert_eq!(mode["kind"], "mode_changed");
    assert_eq!(error(&app.registry, "gatehouse.rules.setMode", json!({"rule_id":"simulated-links",
        "mode":"armed", "acknowledgement":{"at":"2026-10-27T12:00:00Z","reason":"Simulated consent"}})).await,
        ErrorCode::BlockedByPolicy);
    let mut armed = rule.clone();
    armed["mode"] = json!("armed");
    assert_eq!(
        error(
            &app.registry,
            "gatehouse.rules.upsert",
            json!({"rule":armed})
        )
        .await,
        ErrorCode::BlockedByPolicy
    );
    for method in [
        "gatehouse.ban.confirm",
        "gatehouse.ban.dismiss",
        "gatehouse.decision.undo",
    ] {
        assert_eq!(
            error(
                &app.registry,
                method,
                json!({"decision_id":cc_types::DecisionId::mint()})
            )
            .await,
            ErrorCode::NotFound
        );
    }
    drop(lots);
    drop(app);
    let gate_store = cc_store::Store::open(root.path().join("gatehouse/store")).unwrap();
    let decisions = gate_store
        .read_ledger(cc_store::LedgerKind::Decisions)
        .unwrap();
    assert_eq!(decisions.len(), 1);
    match &decisions[0].event {
        cc_store::LedgerEvent::Decision {
            decision_id,
            action,
            ..
        } => {
            assert_eq!(
                decision_id.to_string(),
                mode["decision_id"].as_str().unwrap()
            );
            assert_eq!(*action, cc_store::DecisionAction::ModeChanged);
        }
        _ => panic!("expected persisted mode change"),
    }
    drop(gate_store);
    let stored = cc_store::Store::open(root.path().join("lots/store")).unwrap();
    let writs = stored.items(cc_store::DataStore::Writs).unwrap();
    assert_eq!(writs.len(), 1);
    assert!(writs[0].simulated);
    drop(stored);
    let events = Arc::new(EventHub::new(64).unwrap());
    let registry = Registry::with_fixture_root(root.path(), events).unwrap();
    assert_eq!(
        rpc(&registry, "lots.draw.list", json!({})).await,
        json!({"draws":[draw()]})
    );
    assert_eq!(
        rpc(
            &registry,
            "lots.cast",
            json!({"draw_run_id":cast["draw_run_id"]})
        )
        .await,
        cast
    );
    assert_eq!(
        rpc(&registry, "gatehouse.rules.list", json!({})).await,
        expected_rules
    );
}

fn add(lots: &LotsModule, user: &str) {
    lots.map_user(
        cc_store::TwitchUserId::parse(user).unwrap(),
        &format!("simulated_{user}"),
    )
    .unwrap();
    assert_eq!(
        lots.intake(
            &"simulated-draw".to_owned().try_into().unwrap(),
            PassedMessage::from_verdict(facts(user, at()), Verdict::Pass).unwrap()
        )
        .unwrap(),
        Intake::Added
    );
}

async fn cast(registry: &Registry) -> Value {
    let sealed = rpc(
        registry,
        "lots.roll.seal",
        json!({"draw_id":"simulated-draw","source":"drand_quicknet","margin_s":1}),
    )
    .await;
    assert_eq!(sealed["sealed"]["roll"]["randomness"]["round"], "2");
    let cast = rpc(
        registry,
        "lots.cast",
        json!({"draw_run_id":sealed["draw_run_id"]}),
    )
    .await;
    let writ = rpc(
        registry,
        "lots.writ.get",
        json!({"writ_id":cast["writ_id"]}),
    )
    .await;
    let verified =
        cc_verify::verify_writ_json(&writ.to_string(), Some(&lots_support::chain())).unwrap();
    assert_eq!(serde_json::to_value(verified).unwrap(), cast["cast"]);
    cast
}

#[test]
fn fixture_root_refuses_previously_armed_user_rules() {
    let root = tempfile::tempdir().unwrap();
    let mut gate = cc_gatehouse::Gatehouse::open(root.path().join("gatehouse")).unwrap();
    gate.rules_upsert(
        serde_json::from_value(json!({"rule":{
            "rule_id":"simulated", "name":"Simulated", "rule_class":"pattern",
            "mode":"shadow", "action":"delete", "delivery":"streamer", "pattern":"simulated"
        }}))
        .unwrap(),
    )
    .unwrap();
    gate.rules_set_mode(
        serde_json::from_value(json!({
            "rule_id":"simulated", "mode":"armed", "acknowledgement":{
                "at":"2026-10-27T12:00:00Z", "reason":"Simulated standalone domain test"
            }
        }))
        .unwrap(),
    )
    .unwrap();
    drop(gate);
    let result = Registry::with_fixture_root(root.path(), Arc::new(EventHub::new(64).unwrap()));
    assert_eq!(result.err().unwrap().code, ErrorCode::BlockedByPolicy);
}
