//! The Gatehouse chapter end to end in a dress rehearsal: the streamer writes
//! a rule, arms it, generated SIMULATED chat breaks it, a ban is proposed for
//! that generated chatter, and the confirmed ban is a SIMULATED record only.
use super::*;
use crate::gatehouse::GatehouseModule;

async fn rpc(app: &AppState, method: &str, params: Value) -> Result<Value, ErrorEnvelope> {
    app.registry.dispatch(&request(method, params)).await
}

async fn rehearsal_app() -> (Arc<AppState>, Arc<NativeServices>, Root) {
    let root = Root::new();
    let services = NativeServices::new(
        NativeConfig {
            // An empty client id is the inert bridge: no Twitch session can exist.
            twitch: cc_twitch::TwitchConfig::default(),
            obs: cc_obs::Config {
                port: 0,
                password_label: "simulated-unused".into(),
            },
            overlay_port: 0,
        },
        cc_store::Store::open(root.0.join("native")).unwrap(),
        Arc::new(|_| panic!("simulated rehearsal cannot log in")),
    )
    .await
    .unwrap();
    let app = services.app_rehearsal(4096, &root.0).unwrap();
    (app, services, root)
}

/// Follow history pages to the end; the ledger is append-ordered.
async fn history(app: &AppState) -> Vec<Value> {
    let mut items = Vec::new();
    let mut cursor: Option<String> = None;
    loop {
        let params = match &cursor {
            Some(cursor) => json!({"limit":100,"cursor":cursor}),
            None => json!({"limit":100}),
        };
        let page = rpc(app, "gatehouse.history.list", params).await.unwrap();
        items.extend(page["items"].as_array().unwrap().iter().cloned());
        match page.get("next_cursor").and_then(Value::as_str) {
            Some(next) => cursor = Some(next.to_owned()),
            None => return items,
        }
    }
}

#[tokio::test]
async fn an_armed_rule_proposes_a_simulated_ban_that_the_streamer_confirms() {
    let (app, services, root) = rehearsal_app().await;
    let rule = json!({"rule_id":"no-boss-spoilers","name":"No boss spoilers","rule_class":"pattern",
        "mode":"shadow","action":"ban","delivery":"streamer","pattern":"spoiler|boss dies"});
    rpc(&app, "gatehouse.rules.upsert", json!({ "rule": rule }))
        .await
        .unwrap();
    let armed = rpc(&app, "gatehouse.rules.setMode", json!({"rule_id":"no-boss-spoilers","mode":"armed",
        "acknowledgement":{"at":Timestamp::now(),"reason":"Armed in dress rehearsal; SIMULATED chat only"}}))
    .await
    .unwrap();
    assert_eq!(armed["kind"], "mode_changed");
    rpc(&app, "rehearsal.start", json!({})).await.unwrap();
    rpc(&app, "rehearsal.crowd.set", json!({"per_minute":600}))
        .await
        .unwrap();
    let proposal = tokio::time::timeout(Duration::from_secs(20), async {
        loop {
            if let Some(item) = history(&app)
                .await
                .into_iter()
                .find(|item| item["decision"]["kind"] == "ban_pending")
            {
                return item;
            }
            tokio::time::sleep(Duration::from_millis(50)).await;
        }
    })
    .await
    .expect("an armed rule proposes a ban from generated chat");
    rpc(&app, "rehearsal.crowd.set", json!({"per_minute":0}))
        .await
        .unwrap();
    let decision = &proposal["decision"];
    assert_eq!(proposal["provenance"], "simulated");
    assert_eq!(decision["rule_id"], "no-boss-spoilers");
    assert_eq!(decision["verdict"], "hold");
    assert!(
        decision["reason_codes"]
            .as_array()
            .unwrap()
            .contains(&json!("ban_pending"))
    );
    // The proposal names the recurring generated chatter, quoted from the ledger.
    let mut chat = Vec::new();
    let mut cursor: Option<String> = None;
    loop {
        let params = match &cursor {
            Some(cursor) => json!({"limit":100,"cursor":cursor}),
            None => json!({"limit":100}),
        };
        let page = rpc(&app, "gatehouse.chat.list", params).await.unwrap();
        chat.extend(page["items"].as_array().unwrap().iter().cloned());
        match page.get("next_cursor").and_then(Value::as_str) {
            Some(next) => cursor = Some(next.to_owned()),
            None => break,
        }
    }
    let line = chat
        .iter()
        .find(|item| item["decision"]["decision_id"] == decision["decision_id"])
        .unwrap();
    assert_eq!(line["message"]["user_id"], "900000001");
    assert!(
        line["message"]["text"]
            .as_str()
            .unwrap()
            .starts_with("SIMULATED spoiler:")
    );
    // Backseating does not break this rule; cheering never acts.
    assert!(chat.iter().all(|item| {
        item["message"]["text"]
            .as_str()
            .unwrap()
            .contains("spoiler")
            == (item["decision"]["kind"] == "ban_pending")
    }));
    assert!(
        history(&app)
            .await
            .iter()
            .all(|item| item["decision"]["kind"] != "banned"),
        "nothing is banned before the streamer confirms"
    );
    let confirmed = rpc(
        &app,
        "gatehouse.ban.confirm",
        json!({"decision_id": decision["decision_id"]}),
    )
    .await
    .unwrap();
    assert_eq!(confirmed["kind"], "banned");
    assert_eq!(confirmed["operator"], "human");
    assert_eq!(confirmed["simulated"], true);
    assert_eq!(confirmed["reason_codes"], json!(["ban_confirmed"]));
    assert_eq!(confirmed["message_id"], decision["message_id"]);
    // Resolved once: a second confirm is a conflict, never a second ban.
    let again = rpc(
        &app,
        "gatehouse.ban.confirm",
        json!({"decision_id": decision["decision_id"]}),
    )
    .await
    .unwrap_err();
    assert_eq!(again.code, ErrorCode::Conflict);
    let recorded = history(&app).await;
    let banned: Vec<_> = recorded
        .iter()
        .filter(|item| item["decision"]["kind"] == "banned")
        .collect();
    assert_eq!(banned.len(), 1);
    assert_eq!(banned[0]["provenance"], "simulated");
    // No Twitch session exists in rehearsal, so nothing was sent anywhere.
    assert!(services.bridge.connections().is_empty());
    rpc(&app, "rehearsal.stop", json!({})).await.unwrap();
    app.shutdown();
    drop(app);
    drop(services);
    tokio::task::yield_now().await;
    drop(root);
}

#[tokio::test]
async fn the_rehearsal_gate_refuses_chat_that_is_not_simulated() {
    let root = Root::new();
    let gatehouse = GatehouseModule::open_rehearsal(root.0.join("gatehouse"), Vec::new()).unwrap();
    let message = |simulated: bool| cc_gatehouse::IngestedMessage {
        message_id: format!("simulated-door-{simulated}").try_into().unwrap(),
        user_id: cc_store::TwitchUserId::parse("42").unwrap(),
        login: "simulated_viewer_42".into(),
        text: "SIMULATED hello".into(),
        at: Timestamp::now(),
        simulated,
        metadata: None,
    };
    let refused = gatehouse
        .screen_live_shadow(message(false), &crate::live::RulesOnly, vec![])
        .await
        .unwrap_err();
    assert_eq!(refused.code, ErrorCode::BlockedByPolicy);
    let screened = gatehouse
        .screen_live_shadow(message(true), &crate::live::RulesOnly, vec![])
        .await
        .unwrap();
    assert!(screened.message.simulated && screened.decision.simulated);
    let mut probe = message(true);
    probe.message_id = "simulated-door-probe".to_owned().try_into().unwrap();
    probe.user_id = cc_store::TwitchUserId::parse("900000002").unwrap();
    probe.login = "simulated_viewer_backseat".into();
    probe.text = "SIMULATED backseat: go left, use the shield, why are you not healing".into();
    // A recurring generated chatter fits the store's login rules.
    for breaker in &super::super::crowd::BREAKERS {
        assert!(breaker.login.len() <= 25 && breaker.login.starts_with("simulated_viewer_"));
    }
    gatehouse
        .screen_live_shadow(probe, &crate::live::RulesOnly, vec![])
        .await
        .unwrap();
}
