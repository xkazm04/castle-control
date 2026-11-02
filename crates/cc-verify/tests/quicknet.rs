use cc_verify::{BeaconRound, Entry, QuicknetChain, SealedRoll, verify_writ_json};
use serde_json::{Value, json};

fn info() -> Value {
    serde_json::from_str(include_str!("fixtures/drand-quicknet/info.json")).unwrap()
}

fn trusted_chain() -> QuicknetChain {
    let info = info();
    assert_eq!(info["schemeID"], "bls-unchained-g1-rfc9380");
    assert_eq!(info["period"], 3);
    assert_eq!(info["genesis_time"], 1692803367);
    QuicknetChain::new(
        info["hash"].as_str().unwrap().into(),
        info["public_key"].as_str().unwrap().into(),
        "2023-08-23T15:09:27Z".into(),
    )
    .unwrap()
}

fn rounds() -> Vec<(BeaconRound, &'static str)> {
    [
        (
            include_str!("fixtures/drand-quicknet/public-1.json"),
            "2023-08-23T15:09:25Z",
        ),
        (
            include_str!("fixtures/drand-quicknet/public-2.json"),
            "2023-08-23T15:09:28Z",
        ),
        (
            include_str!("fixtures/drand-quicknet/public-1000.json"),
            "2023-08-23T15:59:22Z",
        ),
    ]
    .into_iter()
    .map(|(text, seal_at)| {
        let raw: Value = serde_json::from_str(text).unwrap();
        (
            BeaconRound {
                round: raw["round"].as_u64().unwrap().to_string(),
                signature: raw["signature"].as_str().unwrap().into(),
                randomness: raw["randomness"].as_str().unwrap().into(),
            },
            seal_at,
        )
    })
    .collect()
}

fn generated_public_writs() -> Value {
    let chain = trusted_chain();
    let cases: Vec<_> = rounds()
        .into_iter()
        .map(|(beacon, at)| {
            let entries = (0..5)
                .map(|i| Entry {
                    handle: format!("simulated_{i:02}"),
                    weight: i + 1,
                })
                .collect();
            let sealed = SealedRoll::quicknet(entries, 3, at.into(), 1, &chain).unwrap();
            let writ = sealed.finish_quicknet(&chain, &beacon).unwrap();
            let cast = verify_writ_json(&writ.to_json().unwrap(), Some(&chain)).unwrap();
            json!({ "round": beacon.round, "writ": writ, "winners": cast.winners() })
        })
        .collect();
    json!({ "label": "simulated-draws-with-official-quicknet-beacons", "chain": chain, "cases": cases })
}

#[test]
fn official_quicknet_rounds_1_2_1000_verify_in_rust() {
    let chain = trusted_chain();
    let rounds = rounds();
    for (beacon, _) in &rounds {
        let randomness = chain.verify_round(beacon).unwrap();
        assert_eq!(hex::encode(randomness), beacon.randomness);
        let other = if beacon.round == "1" { 1 } else { 0 };
        let wrong = BeaconRound {
            round: beacon.round.clone(),
            ..rounds[other].0.clone()
        };
        assert!(chain.verify_round(&wrong).is_err());
    }
}

#[test]
fn official_beacon_writs_match_the_rust_generated_web_fixture() {
    let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../packages/verifier-web/src/public-writs.json");
    let fixture: Value = serde_json::from_slice(&std::fs::read(path).unwrap()).unwrap();
    assert_eq!(fixture, generated_public_writs());
}

#[test]
#[ignore = "explicit public-beacon fixture generation with simulated entries"]
fn generate_public_writs() {
    let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../packages/verifier-web/src/public-writs.json");
    std::fs::write(path, serde_json::to_vec(&generated_public_writs()).unwrap()).unwrap();
}

mod transport {
    use super::*;
    use cc_verify::QuicknetClient;
    use std::io::{Read, Write};
    use std::net::TcpListener;

    /// Serves one canned HTTP reply on loopback and returns the base URL.
    fn serve_once(body: String) -> String {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let base = format!("http://{}", listener.local_addr().unwrap());
        std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut request = [0u8; 2048];
            let _ = stream.read(&mut request).unwrap();
            let head = format!(
                "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                body.len()
            );
            let _ = stream.write_all(head.as_bytes());
            let _ = stream.write_all(body.as_bytes());
        });
        base
    }

    fn roll() -> SealedRoll {
        // Sealed just before round 2 of the official quicknet chain.
        let entries = (0..3)
            .map(|i| Entry {
                handle: format!("simulated_{i:02}"),
                weight: 1,
            })
            .collect();
        SealedRoll::quicknet(
            entries,
            1,
            "2023-08-23T15:09:28Z".into(),
            1,
            &trusted_chain(),
        )
        .unwrap()
    }

    fn round2() -> String {
        include_str!("fixtures/drand-quicknet/public-2.json").into()
    }

    async fn fetch(body: String) -> Result<BeaconRound, cc_verify::Error> {
        let client = QuicknetClient::with_base_url(trusted_chain(), serve_once(body)).unwrap();
        client.fetch(&roll()).await
    }

    fn message(result: Result<BeaconRound, cc_verify::Error>) -> String {
        result.expect_err("fetch must refuse").to_string()
    }

    #[tokio::test]
    async fn real_reply_shape_is_parsed_and_verified() {
        let round = fetch(round2()).await.unwrap();
        assert_eq!(round.round, "2");
        assert_eq!(round.randomness, rounds()[1].0.randomness);
    }

    #[tokio::test]
    async fn empty_previous_signature_is_tolerated() {
        let body = round2().replace('}', ",\"previous_signature\":\"\"}");
        assert_eq!(fetch(body).await.unwrap().round, "2");
    }

    #[tokio::test]
    async fn chained_signature_is_rejected() {
        let body = round2().replace('}', ",\"previous_signature\":\"abcd\"}");
        assert!(message(fetch(body).await).contains("chained"));
    }

    #[tokio::test]
    async fn oversize_reply_is_rejected_before_parsing() {
        // Valid JSON padded with whitespace: only the size cap can refuse it.
        let body = format!("{}{}", round2(), " ".repeat(20_000));
        assert!(message(fetch(body).await).contains("too large"));
    }

    #[tokio::test]
    async fn wrong_round_is_rejected() {
        let body = include_str!("fixtures/drand-quicknet/public-1.json").into();
        assert!(message(fetch(body).await).contains("unexpected round"));
    }

    #[tokio::test]
    async fn unknown_fields_and_bad_signature_are_rejected() {
        let extra = round2().replace('}', ",\"extra\":1}");
        assert!(fetch(extra).await.is_err());
        let bad = round2().replace("\"signature\":\"b6", "\"signature\":\"b7");
        assert!(message(fetch(bad).await).contains("BLS"));
    }
}
