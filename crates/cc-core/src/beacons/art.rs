//! Credit-only RPC integration. Never retry a paid submission or invent credits.
use super::art_assets::{ArtCatalog, ArtDownload};
use super::{BeaconsModule, encode, internal};
use cc_beacons::art::{ArtError, Charge, GenerationState, ImageProvider, ImageRequest};
use cc_store::{ImageProviderAmount, LedgerEvent, Timestamp};
use cc_types::{
    ArtCharge, ArtCostReceipt, ArtGenerateParams, ArtGenerateResult, ArtStatusResult, ErrorCode,
    ErrorEnvelope, RpcRequest,
};
use serde_json::Value;
use std::{sync::Arc, time::Duration};

pub(super) struct ArtRuntime {
    pub provider: Arc<dyn ImageProvider>,
    pub download: Arc<dyn ArtDownload>,
    pub catalog: Arc<ArtCatalog>,
}

impl BeaconsModule {
    /// Native/test composition seam. No key, provider URL or root is an RPC input.
    pub fn with_art_provider(
        mut self,
        provider: Arc<dyn ImageProvider>,
        download: Arc<dyn ArtDownload>,
        catalog: Arc<ArtCatalog>,
    ) -> Self {
        self.art = Some(ArtRuntime {
            provider,
            download,
            catalog,
        });
        self
    }

    pub(super) async fn art_call(&self, request: &RpcRequest) -> Result<Value, ErrorEnvelope> {
        match request {
            RpcRequest::ArtStatus(_) => encode(ArtStatusResult {
                available: match &self.art {
                    Some(art) => art.provider.available().map_err(provider_error)?,
                    None => false,
                },
            }),
            RpcRequest::ArtGenerate(params) => {
                // Before key access, package resolution, or ANY provider operation.
                if params.remove_background {
                    return Err(unavailable("background removal is not supported yet"));
                }
                let _serial = self.art_serial.lock().await;
                let art = self
                    .art
                    .as_ref()
                    .ok_or_else(|| unavailable("Leonardo has no key configured"))?;
                if !art.provider.available().map_err(provider_error)? {
                    return Err(unavailable("Leonardo has no key configured"));
                }
                self.art_ready()?;
                encode(self.generate_art(art, params).await?)
            }
            _ => Err(unavailable("method is outside art module")),
        }
    }

    fn art_ready(&self) -> Result<(), ErrorEnvelope> {
        let state = self.state.lock().map_err(|_| internal())?;
        if state.revoked {
            return Err(unavailable("art is unavailable after revocation"));
        }
        state
            ._store
            .read_ledger(cc_store::LedgerKind::Engine)
            .map_err(|_| internal())?;
        Ok(())
    }

    async fn generate_art(
        &self,
        art: &ArtRuntime,
        params: &ArtGenerateParams,
    ) -> Result<ArtGenerateResult, ErrorEnvelope> {
        let (root, anchor) = art
            .catalog
            .selection(&params.design_id, params.reference.as_ref())?;
        let request = ImageRequest {
            prompt: params.prompt.clone(),
            model_id: String::from(params.model_id.clone()),
            width: params.width.clone().into(),
            height: params.height.clone().into(),
        };
        let submitted_at = Timestamp::now();
        let generation = match anchor {
            Some(anchor) => {
                art.provider
                    .generate_matching_set(&request, &anchor, params.quantity.clone().into())
                    .await
            }
            None => art.provider.generate_anchor(&request).await,
        }
        .map_err(provider_error)?;
        // A dollar-only response is refused before any ledger mutation, polling,
        // download or further paid call. There is no credits conversion/fallback.
        if !matches!(generation.cost.charge, Charge::Credits(_)) {
            return Err(unavailable(
                "art receipts without credits are not supported yet",
            ));
        }
        let receipt: ArtCostReceipt =
            serde_json::from_value(serde_json::to_value(&generation.cost).map_err(|_| internal())?)
                .map_err(|_| provider_error(ArtError::Response))?;
        let ArtCharge::Credits(credits) = &receipt.charge else {
            return Err(unavailable(
                "art receipts without credits are not supported yet",
            ));
        };
        self.state
            .lock()
            .map_err(|_| internal())?
            ._store
            .append_ledger(
                submitted_at,
                Timestamp::now(),
                LedgerEvent::ImageProviderCost {
                    provider: cc_store::ImageProvider::Leonardo,
                    amount: ImageProviderAmount::Credits(credits.clone()),
                    cost_microusd: None,
                    call_id: receipt.call_id.clone(),
                },
            )
            .map_err(|_| internal())?;
        // The charge is durable even for withheld/failed output, timeout, or a
        // failed import. Failures stay typed errors rather than empty successes.
        let mut result = ArtGenerateResult {
            design_id: params.design_id.clone(),
            assets: Vec::new(),
            costs: vec![receipt],
        };
        let outputs = tokio::time::timeout(Duration::from_secs(30), async {
            loop {
                match art
                    .provider
                    .generation_state(&generation.generation_id)
                    .await
                {
                    Ok(GenerationState::Complete(images)) => return Ok(images),
                    Ok(GenerationState::Pending) => {
                        tokio::time::sleep(Duration::from_millis(250)).await
                    }
                    Ok(GenerationState::Failed) => return Err(provider_error(ArtError::Response)),
                    Err(error) => return Err(provider_error(error)),
                }
            }
        })
        .await
        .map_err(|_| unavailable("image generation did not finish in time"))??;
        if outputs.len() > usize::from(u8::from(params.quantity.clone())) {
            return Err(provider_error(ArtError::Response));
        }
        for (index, image) in outputs.into_iter().enumerate() {
            let bytes = art.download.fetch(&image.url).await.map_err(|_| {
                ErrorEnvelope::new(ErrorCode::Upstream, "generated art download failed")
            })?;
            let name = format!("{}-{index}", result.costs[0].call_id.as_str());
            let asset = art
                .catalog
                .import(&params.design_id, &root, name, image, bytes)?;
            result.assets.push(asset);
        }
        Ok(result)
    }
}

fn unavailable(message: &'static str) -> ErrorEnvelope {
    ErrorEnvelope::new(ErrorCode::Unavailable, message)
}
pub(super) fn provider_error(error: ArtError) -> ErrorEnvelope {
    let code = match error {
        ArtError::Unavailable | ArtError::Keychain => ErrorCode::Unavailable,
        ArtError::Invalid => ErrorCode::Invalid,
        _ => ErrorCode::Upstream,
    };
    // ArtError carries only closed local messages, never upstream text or keys.
    ErrorEnvelope::new(code, error.to_string())
}
