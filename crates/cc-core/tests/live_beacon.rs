//! Simulated entries and recorded public beacons; only the ignored owner test uses HTTPS.
use cc_core::{
    EventHub, Registry,
    lots::{
        BeaconSource, LotsModule,
        live_beacon::{BeaconTransport, LiveBeacon},
    },
};
use cc_lots::{MessageFacts, PassedMessage};
use cc_types::{ErrorCode, ErrorEnvelope, EventKind, LotsSealedRoll, Verdict, parse_request};
use cc_verify::{BeaconRound, Entry, QuicknetChain, SealedRoll};
use serde_json::{Value, json};
use std::sync::{
    Arc,
    atomic::{AtomicUsize, Ordering},
};

fn chain() -> QuicknetChain {
    let info: Value = serde_json::from_str(include_str!(
        "../../cc-verify/tests/fixtures/drand-quicknet/info.json"
    ))
    .unwrap();
    QuicknetChain::new(
        info["hash"].as_str().unwrap().into(),
        info["public_key"].as_str().unwrap().into(),
        "2023-08-23T15:09:27Z".into(),
    )
    .unwrap()
}

fn fixture(text: &str) -> BeaconRound {
    let raw: Value = serde_json::from_str(text).unwrap();
    BeaconRound {
        round: raw["round"].as_u64().unwrap().to_string(),
        signature: raw["signature"].as_str().unwrap().into(),
        randomness: raw["randomness"].as_str().unwrap().into(),
    }
}

fn round_two() -> BeaconRound {
    fixture(include_str!(
        "../../cc-verify/tests/fixtures/drand-quicknet/public-2.json"
    ))
}

fn sealed() -> LotsSealedRoll {
    let roll = SealedRoll::quicknet(
        vec![Entry {
            handle: "simulated_1".into(),
            weight: 1,
        }],
        1,
        "2023-08-23T15:09:28Z".into(),
        1,
        &chain(),
    )
    .unwrap();
    serde_json::from_str(&roll.to_json().unwrap()).unwrap()
}

struct FakeTransport {
    reply: Result<BeaconRound, ErrorEnvelope>,
    calls: AtomicUsize,
}
impl BeaconTransport for FakeTransport {
    fn fetch(&self, _: &SealedRoll) -> Result<BeaconRound, ErrorEnvelope> {
        self.calls.fetch_add(1, Ordering::SeqCst);
        self.reply.clone()
    }
}
fn source(reply: Result<BeaconRound, ErrorEnvelope>) -> (LiveBeacon, Arc<FakeTransport>) {
    let transport = Arc::new(FakeTransport {
        reply,
        calls: AtomicUsize::new(0),
    });
    (
        LiveBeacon::with_transport(chain(), transport.clone()),
        transport,
    )
}

#[test]
fn live_beacon_accepts_correct_recorded_round_after_seal_plus_margin() {
    let (source, transport) = source(Ok(round_two()));
    assert_eq!(transport.calls.load(Ordering::SeqCst), 0);
    assert_eq!(source.round(&sealed()).unwrap().round, "2");
    assert_eq!(transport.calls.load(Ordering::SeqCst), 1);
}

#[test]
fn live_beacon_rejects_tampered_signature() {
    let mut round = round_two();
    round.signature = "00".repeat(48);
    let (source, _) = source(Ok(round));
    assert_eq!(
        source.round(&sealed()).unwrap_err().code,
        ErrorCode::Invalid
    );
}

#[test]
fn live_beacon_rejects_valid_signature_for_wrong_round() {
    let round = fixture(include_str!(
        "../../cc-verify/tests/fixtures/drand-quicknet/public-1.json"
    ));
    chain().verify_round(&round).unwrap();
    let (source, _) = source(Ok(round));
    assert_eq!(
        source.round(&sealed()).unwrap_err().code,
        ErrorCode::Invalid
    );
}

#[test]
fn live_beacon_rejects_modified_seal_before_transport() {
    let (source, transport) = source(Ok(round_two()));
    let mut roll = sealed();
    roll.roll.margin_s = 4.try_into().unwrap();
    assert_eq!(source.round(&roll).unwrap_err().code, ErrorCode::Invalid);
    assert_eq!(transport.calls.load(Ordering::SeqCst), 0);
}

struct Clock(std::sync::atomic::AtomicBool);
impl cc_core::lots::LotsClock for Clock {
    fn now(&self) -> chrono::DateTime<chrono::Utc> {
        if self.0.load(Ordering::SeqCst) {
            "2023-08-23T15:09:31Z"
        } else {
            "2023-08-23T15:09:28Z"
        }
        .parse()
        .unwrap()
    }
}

async fn rpc(registry: &Registry, method: &str, params: Value) -> Result<Value, ErrorEnvelope> {
    let request =
        parse_request(&serde_json::to_vec(&json!({"method":method,"params":params})).unwrap())
            .unwrap();
    let value = registry.dispatch(&request).await?;
    assert_eq!(request.validate_result(value.clone()).unwrap(), value);
    Ok(value)
}

#[tokio::test]
async fn live_beacon_network_failure_is_typed_without_cast_and_streamer_commit_still_works() {
    let (source, transport) = source(Err(ErrorEnvelope::new(
        ErrorCode::Upstream,
        "beacon transport unavailable",
    )));
    let root = tempfile::tempdir().unwrap();
    let events = Arc::new(EventHub::new(64).unwrap());
    let clock = Arc::new(Clock(std::sync::atomic::AtomicBool::new(false)));
    let module = Arc::new(
        LotsModule::open(
            root.path(),
            events.clone(),
            Arc::new(source),
            clock.clone(),
            true,
        )
        .unwrap(),
    );
    let mut registry = Registry::default();
    registry.register(module.clone()).unwrap();
    let draw = json!({
        "draw_id":"simulated-draw", "name":"Simulated questions",
        "policy": {
            "content":"question", "paid_entry":false, "paid_weight":false,
            "subscriber_only":false, "channel_points":false, "free_entry_equal_odds":true,
            "regions":[], "prize_value_usd_cents":0, "registration_confirmed":false,
            "official_rules":true, "twitch_disclaimer":true
        },
        "rules": {
            "pool":{"kind":"chatters"}, "winner_count":1, "cooldown_s":0,
            "cohort_caps":[], "weight_curve":{"kind":"equal"}, "free_join_equal_odds":true
        }
    });
    for randomness in ["drand_quicknet", "streamer_commit"] {
        clock.0.store(false, Ordering::SeqCst);
        rpc(&registry, "lots.draw.upsert", json!({"draw":draw}))
            .await
            .unwrap();
        let user = cc_store::TwitchUserId::parse("1").unwrap();
        module.map_user(user.clone(), "simulated_1").unwrap();
        module
            .intake(
                &"simulated-draw".to_owned().try_into().unwrap(),
                PassedMessage::from_verdict(
                    MessageFacts {
                        message_id: "simulated-message".to_owned().try_into().unwrap(),
                        user_id: user,
                        at: "2023-08-23T15:09:28Z".parse().unwrap(),
                        text: "simulated !join".into(),
                        follower: false,
                        subscriber: false,
                        redeemed: false,
                        activity_units: 0,
                        cohorts: Default::default(),
                    },
                    Verdict::Pass,
                )
                .unwrap(),
            )
            .unwrap();
        let sealed = rpc(
            &registry,
            "lots.roll.seal",
            json!({"draw_id":"simulated-draw", "source":randomness, "margin_s":1}),
        )
        .await
        .unwrap();
        let params = json!({"draw_run_id":sealed["draw_run_id"]});
        clock.0.store(true, Ordering::SeqCst);
        let cast = rpc(&registry, "lots.cast", params.clone()).await;
        if randomness == "drand_quicknet" {
            let error = cast.unwrap_err();
            assert_eq!(error.code, ErrorCode::Upstream);
            let _: ErrorEnvelope =
                serde_json::from_value(serde_json::to_value(error).unwrap()).unwrap();
            assert_eq!(
                rpc(&registry, "lots.cast", params).await.unwrap_err().code,
                ErrorCode::NotFound
            );
            assert!(
                events
                    .since(0)
                    .unwrap()
                    .iter()
                    .all(|event| event.kind != EventKind::Cast)
            );
        } else {
            let cast = cast.unwrap();
            assert_eq!(cast["cast"]["label"], "streamer-controlled");
            let writ = rpc(
                &registry,
                "lots.writ.get",
                json!({"writ_id":cast["writ_id"]}),
            )
            .await
            .unwrap();
            cc_verify::verify_writ_json(&writ.to_string(), None).unwrap();
        }
    }
    assert_eq!(transport.calls.load(Ordering::SeqCst), 1);
    drop(registry);
    drop(module);
    let store = cc_store::Store::open(root.path().join("store")).unwrap();
    let writs = store.items(cc_store::DataStore::Writs).unwrap();
    assert_eq!(writs.len(), 1);
    let saved: Value = serde_json::from_str(&writs[0].content).unwrap();
    assert_eq!(saved["writ"]["proof"]["source"], "streamer_commit");
}

#[test]
#[ignore = "owner-run: contacts https://api.drand.sh; never run by gates"]
fn owner_run_live_beacon_fetches_verified_quicknet_round() {
    let source = LiveBeacon::new(chain());
    let round = source.round(&sealed()).unwrap();
    assert_eq!(round.round, "2");
    chain().verify_round(&round).unwrap();
}
