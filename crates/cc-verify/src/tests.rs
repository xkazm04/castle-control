use super::*;
use bls12_381::hash_to_curve::{ExpandMsgXmd, HashToCurve};
use bls12_381::{G1Affine, G1Projective, G2Affine, G2Projective, Scalar};
use serde_json::{Value, json};

const AT: &str = "2026-10-25T12:00:00Z";

fn entries() -> Vec<Entry> {
    vec![
        Entry {
            handle: "simulated_b".into(),
            weight: 7,
        },
        Entry {
            handle: "simulated_a".into(),
            weight: 1,
        },
    ]
}

fn test_chain() -> QuicknetChain {
    // Public, deliberately deterministic simulated keypair, never a production key.
    let key = G2Affine::from(G2Projective::generator() * Scalar::from(42_u64));
    QuicknetChain::new(
        hex::encode(hash(b"simulated-chain")),
        hex::encode(key.to_compressed()),
        "2026-10-25T00:00:00Z".into(),
    )
    .unwrap()
}

fn sign(round: &str) -> BeaconRound {
    let message = hash(round_number(round).unwrap().to_be_bytes());
    let point = <G1Projective as HashToCurve<ExpandMsgXmd<sha2_09::Sha256>>>::hash_to_curve(
        message,
        beacon::DST,
    );
    let signature = G1Affine::from(point * Scalar::from(42_u64)).to_compressed();
    BeaconRound {
        round: round.into(),
        signature: hex::encode(signature),
        randomness: hex::encode(hash(signature)),
    }
}

fn offline() -> Writ {
    let seed = hash(b"simulated-seed");
    SealedRoll::streamer(entries(), 1, AT.into(), 6, SealedRoll::commitment(&seed))
        .unwrap()
        .finish_streamer(seed)
        .unwrap()
}

#[test]
fn seal_is_canonical_and_input_is_owned() {
    let seed = [7; 32];
    let mut input = entries();
    let a = SealedRoll::streamer(
        input.clone(),
        1,
        AT.into(),
        6,
        SealedRoll::commitment(&seed),
    )
    .unwrap();
    input.reverse();
    let b = SealedRoll::streamer(
        input.clone(),
        1,
        AT.into(),
        6,
        SealedRoll::commitment(&seed),
    )
    .unwrap();
    input[0].weight = 999;
    assert_eq!(a.seal(), b.seal());
    assert_eq!(
        a.finish_streamer(seed).unwrap().to_json().unwrap(),
        b.finish_streamer(seed).unwrap().to_json().unwrap()
    );
}

#[test]
fn invalid_round_signature_is_rejected() {
    let chain = test_chain();
    let sealed = SealedRoll::quicknet(entries(), 1, AT.into(), 6, &chain).unwrap();
    let round = sign(sealed.selected_round(&chain).unwrap());
    let writ = sealed.finish_quicknet(&chain, &round).unwrap();
    assert!(verify_writ_json(&writ.to_json().unwrap(), Some(&chain)).is_ok());
    let mut bad: Value = serde_json::from_str(&writ.to_json().unwrap()).unwrap();
    // Valid group encoding of a signature from a DIFFERENT round must fail.
    let different = sign("1");
    bad["proof"]["signature"] = json!(different.signature);
    bad["proof"]["randomness"] = json!(different.randomness);
    assert!(verify_writ_json(&bad.to_string(), Some(&chain)).is_err());
    assert!(verify_writ_json(&writ.to_json().unwrap(), None).is_err());
    let mut bad_randomness = round.clone();
    bad_randomness.randomness = "00".repeat(32);
    assert!(chain.verify_round(&bad_randomness).is_err());
    let mut identity = round;
    identity.signature = hex::encode(G1Affine::identity().to_compressed());
    identity.randomness = hex::encode(hash(G1Affine::identity().to_compressed()));
    assert!(chain.verify_round(&identity).is_err());
}

#[test]
fn round_schedule_is_strictly_after_margin() {
    let chain = test_chain();
    assert_eq!(chain.round_after("2026-10-24T23:59:50Z", 1).unwrap(), "1");
    assert_eq!(chain.round_after("2026-10-24T23:59:59Z", 1).unwrap(), "2");
    assert_eq!(chain.round_after("2026-10-25T00:00:00Z", 3).unwrap(), "3");
    assert_eq!(chain.round_after("2026-10-25T00:00:01Z", 3).unwrap(), "3");
    assert!(chain.round_after(AT, 0).is_err());
}

#[test]
fn sealed_fields_and_winners_cannot_be_substituted() {
    let value: Value = serde_json::from_str(&offline().to_json().unwrap()).unwrap();
    let mutations = [
        ("/roll/winner_count", json!(2)),
        ("/roll/entries/0/weight", json!(100)),
        ("/roll/sealed_at", json!("2026-10-25T12:00:01Z")),
        ("/roll/margin_s", json!(9)),
        ("/winners/0", json!("simulated_intruder")),
        ("/proof/seed", json!("00".repeat(32))),
        ("/roll/randomness/commitment", json!("00".repeat(32))),
    ];
    for (path, replacement) in mutations {
        let mut changed = value.clone();
        *changed.pointer_mut(path).unwrap() = replacement;
        assert!(
            verify_writ_json(&changed.to_string(), None).is_err(),
            "{path}"
        );
    }
}

#[test]
fn unknown_fields_and_noncanonical_values_fail_at_the_door() {
    let value: Value = serde_json::from_str(&offline().to_json().unwrap()).unwrap();
    for path in ["", "/roll", "/roll/entries/0", "/roll/randomness", "/proof"] {
        let mut bad = value.clone();
        bad.pointer_mut(path)
            .unwrap()
            .as_object_mut()
            .unwrap()
            .insert("surprise".into(), json!(true));
        assert!(verify_writ_json(&bad.to_string(), None).is_err(), "{path}");
    }
    assert!(verify_writ_json("{}", None).is_err());
    assert!(verify_writ_json(&" ".repeat(2_000_001), None).is_err());
    for invalid in [
        "",
        "1970-02-29T00:00:00Z",
        "2026-10-25T12:00:00+00:00",
        "2026-10-25T12:00:60Z",
    ] {
        assert!(time::timestamp(invalid).is_err());
    }
    assert_eq!(time::timestamp("1970-01-01T00:00:00Z").unwrap(), 0);
    assert_eq!(time::timestamp("2000-03-01T00:00:00Z").unwrap(), 951868800);
    for invalid in ["01", "0", "-1", "18446744073709551616"] {
        assert!(round_number(invalid).is_err());
    }
    let mut duplicates = entries();
    duplicates.push(duplicates[0].clone());
    assert!(SealedRoll::streamer(duplicates, 1, AT.into(), 6, "00".repeat(32)).is_err());
}

#[test]
fn rejection_sampling_rejects_the_biased_tail() {
    assert_eq!(cast::sample(u64::MAX, 3), None);
    assert_eq!(cast::sample(u64::MAX - 1, 3), Some(2));
    assert_eq!(cast::sample(u64::MAX, 2), Some(1));
    assert_eq!(cast::sample(0, 1), Some(0));
}

#[test]
fn verified_cast_is_the_animation_output() {
    let output = verify_writ_json(&offline().to_json().unwrap(), None).unwrap();
    assert_eq!(output.label(), "streamer-controlled");
    assert_eq!(output.winners().len(), 1);
    let json = serde_json::to_value(&output).unwrap();
    assert_eq!(json.as_object().unwrap().len(), 3);
    assert!(json.get("seed").is_none());
    assert!(json.get("entries").is_none());
}

#[test]
#[ignore = "explicit deterministic simulated fixture generation"]
fn generate_simulated_fixture() {
    let chain = test_chain();
    let round = sign(&chain.round_after(AT, 6).unwrap());
    let mut cases = Vec::new();
    for n in 0..1000_u32 {
        let entries: Vec<_> = (0..(2 + n % 9))
            .map(|j| Entry {
                handle: format!("simulated_{j:02}"),
                weight: if n % 37 == 0 {
                    u32::MAX - j
                } else {
                    1 + (n * 13 + j * 7) % 97
                },
            })
            .collect();
        let count = 1 + n % entries.len() as u32;
        let writ = if n % 10 == 0 {
            SealedRoll::quicknet(entries, count, AT.into(), 6, &chain)
                .unwrap()
                .finish_quicknet(&chain, &round)
                .unwrap()
        } else {
            let seed = hash(n.to_be_bytes());
            SealedRoll::streamer(entries, count, AT.into(), 6, SealedRoll::commitment(&seed))
                .unwrap()
                .finish_streamer(seed)
                .unwrap()
        };
        let text = writ.to_json().unwrap();
        let cast = verify_writ_json(&text, Some(&chain)).unwrap();
        cases.push(json!({ "writ": writ, "winners": cast.winners() }));
    }
    let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../packages/verifier-web/src/simulated-writs.json");
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    std::fs::write(
        path,
        serde_json::to_vec(&json!({ "label": "simulated", "chain": chain, "cases": cases }))
            .unwrap(),
    )
    .unwrap();
}

#[test]
fn thousand_generated_simulated_writs_verify_in_rust() {
    let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../packages/verifier-web/src/simulated-writs.json");
    let fixture: Value = serde_json::from_slice(&std::fs::read(path).unwrap()).unwrap();
    assert_eq!(fixture["label"], "simulated");
    let chain = QuicknetChain::from_json(&fixture["chain"].to_string()).unwrap();
    let cases = fixture["cases"].as_array().unwrap();
    assert_eq!(cases.len(), 1000);
    for case in cases {
        let cast = verify_writ_json(&case["writ"].to_string(), Some(&chain)).unwrap();
        assert_eq!(
            serde_json::to_value(cast.winners()).unwrap(),
            case["winners"]
        );
    }
}
