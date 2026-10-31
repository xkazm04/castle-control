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
    origin: Option<String>,
    simulated: bool,
}

impl VoteBarModule {
    pub fn new(consensus: Weak<dyn Module>, origin: Option<String>, simulated: bool) -> Self {
        Self {
            consensus,
            origin,
            simulated,
        }
    }

    /// One fixed all-message window; UI filters and replay cannot change OBS.
    pub async fn snapshot(&self) -> Result<VoteBarSnapshot, ErrorEnvelope> {
        let request = RpcRequest::ConsensusGet(ConsensusGetParams {
            window_s: 900.try_into().expect("positive constant"),
            filter: ConsensusFilter::All {},
        });
        let consensus = self.consensus.upgrade().ok_or_else(|| {
            ErrorEnvelope::new(ErrorCode::Unavailable, "consensus service stopped")
        })?;
        let value = request.validate_result(consensus.call(&request).await?)?;
        let consensus: ConsensusGetResult = serde_json::from_value(value).map_err(|_| invalid())?;
        Ok(VoteBarSnapshot {
            directions: consensus
                .directions
                .into_iter()
                .map(|direction| VoteBarDirection {
                    share: direction.share,
                })
                .collect(),
            simulated: self.simulated,
            at: consensus.at,
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
