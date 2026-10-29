//! Native quicknet opt-in and an independently pinned chain; fixtures stay offline.
use super::{BeaconSource, convert};
use cc_types::{ErrorCode, ErrorEnvelope, LotsSealedRoll};
use cc_verify::{BeaconRound, Entry, QuicknetChain, QuicknetClient, SealedRoll};
use std::sync::Arc;

/// Trust is compiled in, never learned from the round response or imported writ.
pub fn official_chain() -> QuicknetChain {
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
    .expect("compiled quicknet trust anchor")
}

pub(crate) fn configured(root: &std::path::Path) -> Result<Arc<dyn BeaconSource>, ErrorEnvelope> {
    let path = root.join("live-quicknet");
    match std::fs::symlink_metadata(&path) {
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            Ok(Arc::new(crate::live::NoBeacon))
        }
        Ok(metadata) if metadata.is_file() && metadata.len() <= 64 => {
            let text = std::fs::read_to_string(path).map_err(|_| invalid())?;
            if text.trim() != "enable-live-quicknet" {
                return Err(invalid());
            }
            Ok(Arc::new(LiveBeacon::new(official_chain())))
        }
        _ => Err(invalid()),
    }
}

/// Transport seam for recorded fixtures. Its output is always untrusted: the
/// source independently verifies the selected round and signature with cc-verify.
pub trait BeaconTransport: Send + Sync {
    fn fetch(&self, sealed: &SealedRoll) -> Result<BeaconRound, ErrorEnvelope>;
}

/// A caller-provided trust anchor, never learned from a writ or HTTP response.
/// Native registration constructs this only with an explicit local opt-in file.
pub struct LiveBeacon {
    chain: QuicknetChain,
    transport: Arc<dyn BeaconTransport>,
}

impl LiveBeacon {
    /// Use cc-verify's bounded HTTPS transport, with redirects disabled and a
    /// ten-second timeout. No request is made until BeaconSource::round is called.
    pub fn new(chain: QuicknetChain) -> Self {
        Self::with_transport(chain.clone(), Arc::new(HttpsTransport(chain)))
    }

    /// Inject a transport for offline tests; this never bypasses verification.
    pub fn with_transport(chain: QuicknetChain, transport: Arc<dyn BeaconTransport>) -> Self {
        Self { chain, transport }
    }

    fn snapshot(&self, sealed: &LotsSealedRoll) -> Result<SealedRoll, ErrorEnvelope> {
        let roll = &sealed.roll;
        let snapshot = SealedRoll::quicknet(
            roll.entries
                .iter()
                .map(|entry| Entry {
                    handle: entry.handle.clone().into(),
                    weight: entry.weight.get(),
                })
                .collect(),
            roll.winner_count.get(),
            roll.sealed_at.clone().into(),
            roll.margin_s.get(),
            &self.chain,
        )
        .map_err(verify_error)?;
        // The verifier chooses the first round strictly after seal + margin.
        // Comparing the complete projection also rejects a changed seal, source,
        // chain, ordering or schedule before anything reaches the transport.
        let canonical: LotsSealedRoll = convert::project(&snapshot)?;
        if canonical != *sealed {
            return Err(invalid());
        }
        Ok(snapshot)
    }
}

impl BeaconSource for LiveBeacon {
    fn round_time(
        &self,
        sealed: &LotsSealedRoll,
    ) -> Result<Option<chrono::DateTime<chrono::Utc>>, ErrorEnvelope> {
        // The schedule comes from our validated anchor, never the round response.
        let anchor = serde_json::to_value(&self.chain).map_err(|_| invalid())?;
        let genesis: chrono::DateTime<chrono::Utc> = anchor["genesis_time"]
            .as_str()
            .ok_or_else(invalid)?
            .parse()
            .map_err(|_| invalid())?;
        let cc_types::LotsRandomnessPlan::Drand { round, .. } = &sealed.roll.randomness else {
            return Ok(None);
        };
        let number: u64 = String::from(round.clone()).parse().map_err(|_| invalid())?;
        let seconds = number
            .checked_sub(1)
            .and_then(|n| n.checked_mul(3))
            .and_then(|n| i64::try_from(n).ok())
            .ok_or_else(invalid)?;
        let duration = chrono::Duration::try_seconds(seconds).ok_or_else(invalid)?;
        Ok(Some(
            genesis.checked_add_signed(duration).ok_or_else(invalid)?,
        ))
    }

    fn chain(&self) -> Result<QuicknetChain, ErrorEnvelope> {
        Ok(self.chain.clone())
    }

    fn round(&self, sealed: &LotsSealedRoll) -> Result<BeaconRound, ErrorEnvelope> {
        let snapshot = self.snapshot(sealed)?;
        let round = self.transport.fetch(&snapshot)?;
        let expected = self
            .chain
            .round_after(
                &String::from(sealed.roll.sealed_at.clone()),
                sealed.roll.margin_s.get(),
            )
            .map_err(verify_error)?;
        if round.round != expected {
            return Err(invalid());
        }
        self.chain.verify_round(&round).map_err(verify_error)?;
        Ok(round)
    }
}

struct HttpsTransport(QuicknetChain);
impl BeaconTransport for HttpsTransport {
    fn fetch(&self, sealed: &SealedRoll) -> Result<BeaconRound, ErrorEnvelope> {
        let chain = self.0.clone();
        let sealed = sealed.clone();
        // BeaconSource is synchronous. Own the async client and runtime on a
        // worker so calling from a Tokio runtime never nests block_on or drops
        // an I/O runtime there. Native registration dispatches Lots operations
        // from a blocking worker, never the async bridge or UI executor.
        std::thread::Builder::new()
            .name("quicknet-beacon".into())
            .spawn(move || {
                let runtime = tokio::runtime::Builder::new_current_thread()
                    .enable_all()
                    .build()
                    .map_err(|_| convert::internal())?;
                runtime.block_on(async {
                    QuicknetClient::new(chain)
                        .map_err(verify_error)?
                        .fetch(&sealed)
                        .await
                        .map_err(verify_error)
                })
            })
            .map_err(|_| convert::internal())?
            .join()
            .map_err(|_| convert::internal())?
    }
}

fn invalid() -> ErrorEnvelope {
    ErrorEnvelope::new(
        ErrorCode::Invalid,
        "quicknet proof or sealed schedule is invalid",
    )
}

fn verify_error(error: cc_verify::Error) -> ErrorEnvelope {
    match error {
        cc_verify::Error::Http(_) => {
            ErrorEnvelope::new(ErrorCode::Upstream, "quicknet transport unavailable")
        }
        _ => invalid(),
    }
}
