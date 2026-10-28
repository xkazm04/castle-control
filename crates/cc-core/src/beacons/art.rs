//! Art RPC integration. Never retry a paid submission or invent credits.
use super::art_assets::{ArtCatalog, ArtDownload};
use super::{BeaconsModule, encode, internal};
use cc_beacons::art::{ArtError, Charge, CostRecord, GenerationState, ImageProvider, ImageRequest};
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
        let receipt = self.record_art_cost(&generation.cost, submitted_at)?;
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
        let outputs = if params.remove_background {
            let mut cutouts = Vec::new();
            for image in outputs {
                let submitted_at = Timestamp::now();
                let removed = art
                    .provider
                    .remove_background(&image)
                    .await
                    .map_err(provider_error)?;
                // Persist the exact receipt before examining/importing output.
                // Withheld output and later failures never erase a paid call.
                result
                    .costs
                    .push(self.record_art_cost(&removed.cost, submitted_at)?);
                cutouts.extend(removed.assets);
            }
            cutouts
        } else {
            outputs
        };
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

    fn record_art_cost(
        &self,
        cost: &CostRecord,
        submitted_at: Timestamp,
    ) -> Result<ArtCostReceipt, ErrorEnvelope> {
        let receipt: ArtCostReceipt =
            serde_json::from_value(serde_json::to_value(cost).map_err(|_| internal())?)
                .map_err(|_| provider_error(ArtError::Response))?;
        let amount = match &receipt.charge {
            ArtCharge::Credits(credits) => ImageProviderAmount::Credits(credits.clone()),
            ArtCharge::MicroUsd(value) => ImageProviderAmount::MicroUsd(*value),
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
                    amount,
                    cost_microusd: None,
                    call_id: receipt.call_id.clone(),
                },
            )
            .map_err(|_| internal())?;
        Ok(receipt)
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

#[cfg(test)]
#[allow(dead_code)]
#[path = "../../../cc-beacons/tests/leonardo_support/mod.rs"]
mod test_support;

#[cfg(test)]
mod tests {
    use super::*;
    use cc_beacons::art::LeonardoClient;
    use cc_store::{LedgerKind, Store};
    use serde_json::json;
    use test_support::{MemoryStore, Recording};

    struct RefuseCutouts;
    #[async_trait::async_trait]
    impl ArtDownload for RefuseCutouts {
        async fn fetch(&self, url: &str) -> Result<Vec<u8>, ErrorEnvelope> {
            assert!(url.starts_with("https://cdn.example.invalid/simulated-"));
            if url.ends_with("simulated-cutout.png") {
                return Err(unavailable("simulated cutout download failure"));
            }
            Ok(b"\x89PNG\r\n\x1a\nSimulated anchor".to_vec())
        }
    }

    fn request() -> ArtGenerateParams {
        let image = test_support::image_request();
        serde_json::from_value(json!({
            "design_id":"simulated-frame", "prompt":image.prompt, "model_id":image.model_id,
            "width":image.width, "height":image.height, "quantity":1, "remove_background":true
        }))
        .unwrap()
    }

    fn module(root: &std::path::Path, transport: Recording) -> BeaconsModule {
        let provider =
            LeonardoClient::new(transport, MemoryStore::present(), "simulated".into()).unwrap();
        BeaconsModule::open(root).unwrap().with_art_provider(
            Arc::new(provider),
            Arc::new(RefuseCutouts),
            Arc::default(),
        )
    }

    #[tokio::test]
    async fn no_provider_or_revoked_refuses_removal_before_package_or_paid_operations() {
        let root = tempfile::tempdir().unwrap();
        let module = BeaconsModule::open(root.path()).unwrap();
        let call = RpcRequest::ArtGenerate(request());
        assert_eq!(
            module.art_call(&call).await.unwrap_err().code,
            ErrorCode::Unavailable
        );
        drop(module);
        let transport = Recording::empty();
        let module = self::module(root.path(), transport.clone());
        module.purge_live_data().unwrap();
        assert_eq!(
            module.art_call(&call).await.unwrap_err().code,
            ErrorCode::Unavailable
        );
        assert!(transport.sent().is_empty());
        assert!(
            module
                .state
                .lock()
                .unwrap()
                ._store
                .read_ledger(LedgerKind::Engine)
                .unwrap()
                .is_empty()
        );
    }

    #[tokio::test]
    async fn cutout_import_failure_keeps_all_paid_rows_after_reopening() {
        let root = tempfile::tempdir().unwrap();
        let transport = Recording::background_flow(false, None, false);
        let module = module(root.path(), transport.clone());
        let art = module.art.as_ref().unwrap();
        let mut params = request();
        art.catalog
            .accept_design(params.design_id.clone(), root.path())
            .unwrap();
        params.remove_background = false;
        let anchor = module.generate_art(art, &params).await.unwrap();
        params.remove_background = true;
        params.reference = Some(anchor.assets[0].asset.clone());
        params.quantity = 2.try_into().unwrap();
        let error = module
            .art_call(&RpcRequest::ArtGenerate(params))
            .await
            .unwrap_err();
        assert_eq!(error.code, ErrorCode::Upstream);
        assert_eq!(transport.sent().len(), 7, "no paid call is retried");
        transport.assert_finished();
        drop(module);
        let store = Store::open(root.path().join("store")).unwrap();
        let rows = store.read_ledger(LedgerKind::Engine).unwrap();
        assert_eq!(rows.len(), 4);
        for row in rows.iter().skip(2) {
            assert!(matches!(
                row.event,
                LedgerEvent::ImageProviderCost {
                    amount: ImageProviderAmount::MicroUsd(104_700),
                    ..
                }
            ));
        }
    }
}
