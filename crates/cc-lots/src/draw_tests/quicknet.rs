use super::*;
use cc_verify::{BeaconRound, QuicknetChain};
use serde_json::Value;

fn chain() -> QuicknetChain {
    let info: Value = serde_json::from_str(include_str!(
        "../../../cc-verify/tests/fixtures/drand-quicknet/info.json"
    ))
    .unwrap();
    QuicknetChain::new(
        info["hash"].as_str().unwrap().into(),
        info["public_key"].as_str().unwrap().into(),
        "2023-08-23T15:09:27Z".into(),
    )
    .unwrap()
}

fn round() -> BeaconRound {
    let raw: Value = serde_json::from_str(include_str!(
        "../../../cc-verify/tests/fixtures/drand-quicknet/public-2.json"
    ))
    .unwrap();
    BeaconRound {
        round: raw["round"].as_u64().unwrap().to_string(),
        signature: raw["signature"].as_str().unwrap().into(),
        randomness: raw["randomness"].as_str().unwrap().into(),
    }
}

fn quicknet_roll(chain: &QuicknetChain, store: &mut Store) -> SealedDraw {
    let mut config = rules();
    config.winner_count = 2;
    let mut roll = Roll::new(config).unwrap();
    let seal_time = "2023-08-23T15:09:28Z".parse::<DateTime<Utc>>().unwrap();
    for n in 1..=3 {
        let mut facts = message(n, 0);
        facts.at = seal_time;
        add(&mut roll, facts);
    }
    seal_roll(
        roll,
        &guard(),
        seal_time,
        1,
        SealSource::Quicknet(chain),
        store,
        timestamp(0),
    )
    .unwrap()
}

#[test]
fn official_round_cast_matches_verifier_and_keeps_the_seal() {
    let dir = SimulatedDir::new();
    let mut store = Store::open(&dir.0).unwrap();
    let chain = chain();
    let sealed = quicknet_roll(&chain, &mut store);
    let seal_hash = sealed.seal().to_owned();
    assert_eq!(sealed.label(), "drand-quicknet");
    let result = cast_quicknet(sealed, &chain, &round(), at(0), &mut store, timestamp(1)).unwrap();
    let verified = verify_writ_json(&result.writ().to_json().unwrap(), Some(&chain)).unwrap();
    assert_eq!(result.verified().winners(), verified.winners());
    assert_eq!(result.verified().seal(), seal_hash);
    assert_eq!(result.verified().label(), "drand-quicknet");
    assert_eq!(result.winners().len(), 2);
    let lines = store.read_ledger(LedgerKind::Draws).unwrap();
    assert_eq!(lines.len(), 2);
    assert!(matches!(&lines[0].event,
        LedgerEvent::DrawSealed { draw_run_id, seal_digest, entry_count: 3, winner_count: 2, .. }
        if *draw_run_id == result.draw_run_id() && seal_digest.as_str() == seal_hash));
    assert!(matches!(&lines[1].event,
        LedgerEvent::Draw { draw_run_id, .. } if *draw_run_id == result.draw_run_id()));
}

#[test]
fn wrong_round_or_signature_preserves_only_the_seal_audit() {
    let dir = SimulatedDir::new();
    let mut store = Store::open(&dir.0).unwrap();
    let chain = chain();
    for (i, bad_signature) in [false, true].into_iter().enumerate() {
        let mut round = round();
        if bad_signature {
            round.signature = "00".repeat(48);
        } else {
            round.round = "1".into();
        }
        let result = cast_quicknet(
            quicknet_roll(&chain, &mut store),
            &chain,
            &round,
            at(0),
            &mut store,
            timestamp(1),
        );
        assert!(matches!(result, Err(Error::Proof(_))));
        assert_only_seals(&store, i + 1);
    }
}
