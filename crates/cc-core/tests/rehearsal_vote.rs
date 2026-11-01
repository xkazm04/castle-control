//! Generated SIMULATED ballots only; no Twitch login, keychain or public HTTP.
use cc_core::{AppState, ChatIngress, NativeConfig, NativeServices, live::RulesOnly};
use cc_types::{ConsensusGetResult, VoteBarSnapshot, parse_request};
use serde_json::{Value, json};
use std::{path::Path, sync::Arc, time::Duration};

async fn services(root: &Path) -> Arc<NativeServices> {
    NativeServices::new(
        NativeConfig {
            twitch: Default::default(),
            obs: cc_obs::Config {
                port: 0,
                password_label: "simulated-unused".into(),
            },
            overlay_port: 0,
        },
        cc_store::Store::open(root.join("native")).unwrap(),
        Arc::new(|_| panic!("no simulated login")),
    )
    .await
    .unwrap()
}

async fn rpc(app: &AppState, method: &str, params: Value) -> Value {
    let request =
        parse_request(&serde_json::to_vec(&json!({"method":method,"params":params})).unwrap())
            .unwrap();
    app.registry.dispatch(&request).await.unwrap()
}

async fn consensus(app: &AppState, messages: u32) -> ConsensusGetResult {
    tokio::time::timeout(Duration::from_secs(10), async {
        loop {
            let result: ConsensusGetResult = serde_json::from_value(
                rpc(
                    app,
                    "gatehouse.consensus.get",
                    json!({"window_s":900,"filter":{"kind":"all"}}),
                )
                .await,
            )
            .unwrap();
            if result.directions.iter().map(|d| d.messages).sum::<u32>() == messages {
                return result;
            }
            tokio::time::sleep(Duration::from_millis(20)).await;
        }
    })
    .await
    .unwrap()
}

async fn vote_bar(services: &NativeServices) -> (String, VoteBarSnapshot) {
    let html = reqwest::Client::builder()
        .no_proxy()
        .build()
        .unwrap()
        .get(format!("{}gatehouse/current", services.overlay_url()))
        .send()
        .await
        .unwrap()
        .error_for_status()
        .unwrap()
        .text()
        .await
        .unwrap();
    let snapshot = serde_json::from_str(
        html.split_once("id=\"cc-vote-bar\">")
            .unwrap()
            .1
            .split_once("</script>")
            .unwrap()
            .0,
    )
    .unwrap();
    (html, snapshot)
}

#[tokio::test]
async fn app_rehearsal_vote_round_has_three_nonzero_sample_directions() {
    let root = tempfile::tempdir().unwrap();
    let services = services(root.path()).await;
    let app = services.app_rehearsal(4096, root.path()).unwrap();
    assert!(consensus(&app, 0).await.directions.is_empty());
    rpc(&app, "rehearsal.start", json!({})).await;
    assert_eq!(
        rpc(
            &app,
            "rehearsal.scenario.run",
            json!({"scenario":"vote_round"}),
        )
        .await,
        json!({"accepted":true})
    );
    let result = consensus(&app, 30).await;
    assert_eq!(result.shed_count, 0);
    assert_eq!(result.directions.len(), 3);
    for (direction, (key, label, counts)) in result.directions.iter().zip([
        ("sample_castle", "Sample: Castle", 14..=16),
        ("sample_forest", "Sample: Forest", 8..=10),
        ("sample_sea", "Sample: Sea", 4..=8),
    ]) {
        assert_eq!(String::from(direction.key.clone()), key);
        assert_eq!(String::from(direction.label.clone()), label);
        assert!(counts.contains(&direction.messages));
    }
    let (_, snapshot) = vote_bar(&services).await;
    assert!(snapshot.simulated);
    assert_eq!(snapshot.directions.len(), 3);
    let shares: Vec<f64> = snapshot
        .directions
        .iter()
        .map(|direction| direction.share.clone().into())
        .collect();
    assert!(shares.iter().all(|share| *share > 0.0));
    assert!((shares.iter().sum::<f64>() - 1.0).abs() < 1e-9);
    rpc(&app, "rehearsal.stop", json!({})).await;
    app.shutdown();
    drop(app);
    drop(services);
    tokio::task::yield_now().await;

    // Even reopening that root through the ordinary native composition cannot
    // recover sample seeds: they were never stored in configuration or settings.
    assert_native_has_no_seeds(root.path()).await;
}

async fn assert_native_has_no_seeds(root: &Path) {
    let services = services(root).await;
    let app = services.app_with_data_dir(4096, root).unwrap();
    assert!(consensus(&app, 0).await.directions.is_empty());
    assert!(!vote_bar(&services).await.1.simulated);
    let (sender, receiver) = tokio::sync::broadcast::channel(16);
    let worker = app
        .registry
        .shadow_pipeline()
        .unwrap()
        .unwrap()
        .start(Some(receiver), Arc::new(RulesOnly))
        .unwrap();
    for (index, word) in ["castle", "forest", "sea"].into_iter().enumerate() {
        let user = (index + 1).to_string();
        let login = format!("simulated_viewer_{user}");
        sender
            .send(ChatIngress {
                simulated: true,
                login: login.clone(),
                message: cc_twitch::ChatMessage {
                    id: format!("simulated-native-vote-{user}"),
                    at: cc_types::Timestamp::now().into(),
                    viewer: cc_twitch::Viewer {
                        id: user,
                        name: login,
                        is_mod: false,
                        sub_tier: None,
                    },
                    text: format!("SIMULATED vote {word}"),
                },
            })
            .unwrap();
    }
    let result = consensus(&app, 3).await;
    assert_eq!(result.directions.len(), 1);
    assert_eq!(String::from(result.directions[0].key.clone()), "other");
    assert_eq!(String::from(result.directions[0].label.clone()), "Other");
    assert_eq!(f64::from(result.directions[0].share.clone()), 1.0);
    assert_eq!(vote_bar(&services).await.1.directions.len(), 1);
    worker.abort();
    assert!(worker.await.unwrap_err().is_cancelled());
    app.shutdown();
    drop(app);
    drop(services);
    tokio::task::yield_now().await;
}

#[tokio::test]
async fn fresh_native_composition_has_no_sample_seeds() {
    let root = tempfile::tempdir().unwrap();
    assert_native_has_no_seeds(root.path()).await;
}
