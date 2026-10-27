//! Recorded public quicknet round 2 from cc-verify's independently verified fixture.
//! Simulated time is fixed before that round. There is no HTTP implementation.
use super::{BeaconSource, LotsClock};
use cc_types::{ErrorCode, ErrorEnvelope, LotsSealedRoll};
use cc_verify::{BeaconRound, QuicknetChain};
use chrono::{DateTime, Utc};

pub(crate) struct RecordedBeacon;

impl LotsClock for RecordedBeacon {
    fn now(&self) -> DateTime<Utc> {
        "2023-08-23T15:09:28Z"
            .parse()
            .expect("recorded fixture time")
    }
}

impl BeaconSource for RecordedBeacon {
    fn chain(&self) -> Result<QuicknetChain, ErrorEnvelope> {
        QuicknetChain::new(
            "52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971".into(),
            concat!(
                "83cf0f2896adee7eb8b5f01fcad3912212c437e0073e911fb90022d3e760183c8c4b",
                "450b6a0a6c3ac6a5776a2d1064510d1fec758c921cc22b0e17e63aaf4bcb5ed66304d",
                "e9cf809bd274ca73bab4af5a6e9c76a4bc09e76eae8991ef5ece45a"
            )
            .into(),
            "2023-08-23T15:09:27Z".into(),
        )
        .map_err(|_| ErrorEnvelope::new(ErrorCode::Internal, "invalid recorded chain"))
    }

    fn round(&self, _: &LotsSealedRoll) -> Result<BeaconRound, ErrorEnvelope> {
        Ok(BeaconRound {
            round: "2".into(),
            signature: concat!(
                "b6b6a585449b66eb12e875b64fcbab3799861a00e4dbf092d99e969a5eac57dd",
                "3f798acf61e705fe4f093db926626807"
            )
            .into(),
            randomness: "5782d6987841c654515a0e72b2d1ebb4e741234042c37cb19608ae50d93fb60c".into(),
        })
    }
}
