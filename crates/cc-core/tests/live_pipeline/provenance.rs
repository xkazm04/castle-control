//! Generated chat models live and simulated provenance without a Twitch login.
use super::support::*;
use cc_core::live::RulesOnly;
use cc_types::VoteBarSnapshot;
use serde_json::{Value, json};
use std::sync::Arc;
use tokio::sync::broadcast;

async fn vote_bar(h: &Harness, simulated: bool) {
    let source = rpc(&h.app, "gatehouse.source.url", json!({})).await;
    assert_eq!(
        source["url"],
        format!("{}gatehouse/current", h.services.overlay_url())
    );
    let html = page(source["url"].as_str().unwrap()).await;
    assert_eq!(html.contains("SIMULATED"), simulated);
    let json = html
        .split("id=\"cc-vote-bar\">")
        .nth(1)
        .unwrap()
        .split("</script>")
        .next()
        .unwrap();
    let snapshot: VoteBarSnapshot = serde_json::from_str(json).unwrap();
    assert_eq!(snapshot.simulated, simulated);
}

async fn page(url: &str) -> String {
    let response = reqwest::Client::builder()
        .no_proxy()
        .build()
        .unwrap()
        .get(url)
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 200);
    response.text().await.unwrap()
}

async fn ballots(h: &Harness, first: u32, simulated: bool) {
    let (sender, receiver) = broadcast::channel(16);
    let worker = h
        .pipeline()
        .start(Some(receiver), Arc::new(RulesOnly))
        .unwrap();
    for (id, simulated) in [(first, false), (first + 1, simulated)] {
        let mut ingress = chat(id, "simulated ballot !join");
        ingress.simulated = simulated;
        // Keep eligibility before the whole-second seal cutoff without sleeping.
        ingress.message.at = (chrono::Utc::now() - chrono::Duration::seconds(1))
            .to_rfc3339_opts(chrono::SecondsFormat::Secs, true);
        sender.send(ingress).unwrap();
    }
    drop(sender);
    worker.await.unwrap().unwrap();
}

async fn seal_and_cast(h: &Harness, simulated: bool) -> Value {
    let url = format!("{}lots/simulated-draw", h.services.overlay_url());
    let seal = rpc(
        &h.app,
        "lots.roll.seal",
        json!({"draw_id":"simulated-draw","source":"streamer_commit","margin_s":1}),
    )
    .await;
    let html = page(&url).await;
    assert!(html.contains("Seal announced"));
    assert_eq!(html.contains("SIMULATED"), simulated);
    let cast = rpc(
        &h.app,
        "lots.cast",
        json!({"draw_run_id":seal["draw_run_id"]}),
    )
    .await;
    let html = page(&url).await;
    assert!(html.contains("Winners"));
    assert_eq!(html.contains("SIMULATED"), simulated);
    cast
}

async fn native_provenance(simulated: bool) {
    let h = Harness::new().await;
    h.draw().await;
    vote_bar(&h, false).await;
    ballots(&h, 1, simulated).await;
    vote_bar(&h, simulated).await;
    let consensus = rpc(
        &h.app,
        "gatehouse.consensus.get",
        json!({"window_s":900,"filter":{"kind":"all"}}),
    )
    .await;
    assert_eq!(consensus["directions"][0]["messages"], 2);
    assert!(consensus.get("simulated").is_none());
    let first = seal_and_cast(&h, simulated).await;
    // An empty next roll retains cooldowns, but no previous simulated entrants.
    ballots(&h, 3, false).await;
    let second = seal_and_cast(&h, false).await;
    drop(h.app);
    drop(h.services);
    tokio::task::yield_now().await;
    let store = cc_store::Store::open(h.root.path().join("lots/store")).unwrap();
    let writs = store.items(cc_store::DataStore::Writs).unwrap();
    assert_eq!(writs.len(), 2);
    for (cast, simulated) in [(first, simulated), (second, false)] {
        let writ = writs
            .iter()
            .find(|writ| writ.content.contains(cast["writ_id"].as_str().unwrap()))
            .unwrap();
        assert_eq!(writ.simulated, simulated);
    }
}

#[tokio::test]
async fn native_mixed_ballots_mark_vote_bar_and_lots_then_next_roll_clears_provenance() {
    native_provenance(true).await;
}

#[tokio::test]
async fn native_real_only_ballots_keep_vote_bar_lots_and_saved_writ_badges_off() {
    native_provenance(false).await;
}
