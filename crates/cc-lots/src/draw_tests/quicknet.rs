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

fn quicknet_roll(chain: &QuicknetChain) -> SealedDraw {
    let mut config = rules();
    config.winner_count = 2;
    let mut roll = Roll::new(config).unwrap();
    let seal_time = "2023-08-23T15:09:28Z".parse::<DateTime<Utc>>().unwrap();
    for n in 1..=3 {
        let mut facts = message(n, 0);
        facts.at = seal_time;
        add(&mut roll, facts);
    }
    seal_roll(roll, &guard(), seal_time, 1, SealSource::Quicknet(chain)).unwrap()
}

#[test]
fn official_round_cast_matches_verifier_and_keeps_the_seal() {
    let dir = SimulatedDir::new();
    let mut store = Store::open(&dir.0).unwrap();
    let chain = chain();
    let sealed = quicknet_roll(&chain);
    let seal_hash = sealed.seal().to_owned();
    assert_eq!(sealed.label(), "drand-quicknet");
    let result = cast_quicknet(sealed, &chain, &round(), at(0), &mut store, timestamp(1)).unwrap();
    let verified = verify_writ_json(&result.writ().to_json().unwrap(), Some(&chain)).unwrap();
    assert_eq!(result.verified().winners(), verified.winners());
    assert_eq!(result.verified().seal(), seal_hash);
    assert_eq!(result.verified().label(), "drand-quicknet");
    assert_eq!(result.winners().len(), 2);
    assert_eq!(store.read_ledger(LedgerKind::Draws).unwrap().len(), 1);
}

#[test]
fn wrong_round_or_signature_never_produces_a_cast_or_ledger_line() {
    let dir = SimulatedDir::new();
    let mut store = Store::open(&dir.0).unwrap();
    let chain = chain();
    for bad_signature in [false, true] {
        let mut round = round();
        if bad_signature {
            round.signature = "00".repeat(48);
        } else {
            round.round = "1".into();
        }
        let result = cast_quicknet(
            quicknet_roll(&chain),
            &chain,
            &round,
            at(0),
            &mut store,
            timestamp(1),
        );
        assert!(matches!(result, Err(Error::Proof(_))));
        assert!(store.read_ledger(LedgerKind::Draws).unwrap().is_empty());
    }
}
