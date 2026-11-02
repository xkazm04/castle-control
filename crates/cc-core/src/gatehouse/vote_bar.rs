//! Read-only projection of the existing consensus handler. No raw intake door.
use crate::Module;
use cc_types::{
    ConsensusFilter, ConsensusGetParams, ConsensusGetResult, ErrorCode, ErrorEnvelope, RpcRequest,
    VoteBarDirection, VoteBarSnapshot, VoteBarSourceResult,
};
use futures::future::BoxFuture;
use serde_json::Value;
use std::sync::Weak;

pub struct VoteBarModule {
    consensus: Weak<dyn Module>,
    provenance: Option<Weak<crate::offline::OfflineModules>>,
    origin: Option<String>,
    simulated: bool,
}

impl VoteBarModule {
    pub fn new(consensus: Weak<dyn Module>, origin: Option<String>, simulated: bool) -> Self {
        Self {
            consensus,
            provenance: None,
            origin,
            simulated,
        }
    }

    pub(crate) fn with_provenance(mut self, state: Weak<crate::offline::OfflineModules>) -> Self {
        self.provenance = Some(state);
        self
    }

    /// One fixed all-message window; UI filters and replay cannot change OBS.
    pub async fn snapshot(&self) -> Result<VoteBarSnapshot, ErrorEnvelope> {
        let params = ConsensusGetParams {
            window_s: 900.try_into().expect("positive constant"),
            filter: ConsensusFilter::All {},
        };
        let request = RpcRequest::ConsensusGet(params.clone());
        let consensus = self.consensus.upgrade().ok_or_else(|| {
            ErrorEnvelope::new(ErrorCode::Unavailable, "consensus service stopped")
        })?;
        let value = request.validate_result(consensus.call(&request).await?)?;
        let consensus: ConsensusGetResult = serde_json::from_value(value).map_err(|_| invalid())?;
        let simulated = if !self.simulated
            && let Some(state) = &self.provenance
        {
            let gatehouse = state.upgrade().ok_or_else(invalid)?.gatehouse()?;
            let service = gatehouse.state.lock().await;
            // Readiness failure in this auxiliary read cannot invalidate the
            // consensus snapshot that already succeeded above.
            service.ready().is_ok()
                && service
                    .gate
                    .consensus_simulated_in_window(&params, &consensus.at)?
        } else {
            false
        };
        Ok(VoteBarSnapshot {
            directions: consensus
                .directions
                .into_iter()
                .map(|direction| VoteBarDirection {
                    share: direction.share,
                })
                .collect(),
            simulated: self.simulated || simulated,
            at: consensus.at,
            art: None,
        })
    }
}

impl Module for VoteBarModule {
    fn methods(&self) -> &'static [&'static str] {
        &["gatehouse.source.url"]
    }

    fn call<'a>(&'a self, request: &'a RpcRequest) -> BoxFuture<'a, Result<Value, ErrorEnvelope>> {
        Box::pin(async move {
            if !matches!(request, RpcRequest::VoteBarSourceUrl(_)) {
                return Err(invalid());
            }
            let origin = self.origin.as_ref().ok_or_else(|| {
                ErrorEnvelope::new(
                    ErrorCode::Unavailable,
                    "isolated overlay listener unavailable",
                )
            })?;
            // A failed or revoked read must never mint a seemingly usable source.
            self.snapshot().await?;
            serde_json::to_value(VoteBarSourceResult {
                url: format!(
                    "{}{}",
                    origin.trim_end_matches('/'),
                    cc_obs::pages::OverlayPage::VoteBar.path_and_query()
                ),
            })
            .map_err(|_| invalid())
        })
    }
}

fn invalid() -> ErrorEnvelope {
    ErrorEnvelope::new(ErrorCode::Internal, "vote bar consensus unavailable")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::offline::OfflineModules;
    use futures::FutureExt;
    use std::sync::Arc;

    struct SimulatedConsensus;
    impl Module for SimulatedConsensus {
        fn methods(&self) -> &'static [&'static str] {
            &["gatehouse.consensus.get"]
        }

        fn call<'a>(
            &'a self,
            request: &'a RpcRequest,
        ) -> BoxFuture<'a, Result<Value, ErrorEnvelope>> {
            Box::pin(async move {
                assert!(matches!(request, RpcRequest::ConsensusGet(_)));
                Ok(serde_json::json!({
                    "at":"2026-10-31T12:00:00Z", "window_s":900,
                    "filter":{"kind":"all"}, "directions":[], "shed_count":0
                }))
            })
        }
    }

    #[tokio::test]
    async fn fixture_snapshot_skips_locked_unready_gatehouse_provenance() {
        let consensus: Arc<dyn Module> = Arc::new(SimulatedConsensus);
        let state = Arc::new(OfflineModules::default());
        let gatehouse = state.gatehouse().unwrap();
        let mut service = gatehouse.state.lock().await;
        service.failure = Some(ErrorEnvelope::new(
            ErrorCode::Unavailable,
            "simulated failure",
        ));
        let source = VoteBarModule::new(Arc::downgrade(&consensus), None, true)
            .with_provenance(Arc::downgrade(&state));
        // Hold the lock: even a readiness check that discards its error would
        // leave this future pending instead of returning the fixture snapshot.
        let snapshot = source
            .snapshot()
            .now_or_never()
            .expect("fixture provenance must not lock gatehouse state")
            .unwrap();
        assert!(snapshot.simulated);
    }

    #[tokio::test]
    async fn unready_provenance_does_not_fail_a_successful_consensus_snapshot() {
        let consensus: Arc<dyn Module> = Arc::new(SimulatedConsensus);
        let state = Arc::new(OfflineModules::default());
        let gatehouse = state.gatehouse().unwrap();
        gatehouse.state.lock().await.failure = Some(ErrorEnvelope::new(
            ErrorCode::Unavailable,
            "simulated failure",
        ));
        let source = VoteBarModule::new(Arc::downgrade(&consensus), None, false)
            .with_provenance(Arc::downgrade(&state));
        assert!(!source.snapshot().await.unwrap().simulated);
    }
}
