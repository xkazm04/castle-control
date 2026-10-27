//! Explicit opt-in only; native fixture registration never constructs this source.
use super::{BeaconSource, convert};
use cc_types::{ErrorCode, ErrorEnvelope, LotsSealedRoll};
use cc_verify::{BeaconRound, Entry, QuicknetChain, QuicknetClient, SealedRoll};
use std::sync::Arc;

/// Transport seam for recorded fixtures. Its output is always untrusted: the
/// source independently verifies the selected round and signature with cc-verify.
pub trait BeaconTransport: Send + Sync {
    fn fetch(&self, sealed: &SealedRoll) -> Result<BeaconRound, ErrorEnvelope>;
}

/// A caller-provided trust anchor, never learned from a writ or HTTP response.
/// Construction is the opt-in; there is no default, flag, RPC or registration.
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
        // an I/O runtime there. This call still blocks: future live registration
        // must dispatch lots operations from a blocking worker, not a UI thread.
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
