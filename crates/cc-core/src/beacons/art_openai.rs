//! OpenAI generation into a custom design. One paid call per request; its
//! estimated micro-USD receipt is recorded before the image is examined.
use super::BeaconsModule;
use super::art::{provider_error, unavailable};
use super::designs::DesignOrigin;
use cc_beacons::art::{
    ArtError, OpenAiBackground, OpenAiImageRequest, OpenAiImages, OpenAiModel, OpenAiSize,
    openai_wire,
};
use cc_store::Timestamp;
use cc_types::{
    ArtBackground, ArtGenerateParams, ArtGenerateResult, ArtProvenance, ErrorCode, ErrorEnvelope,
    GeneratedArtAsset,
};
use std::sync::Arc;

impl BeaconsModule {
    /// Composition seam for natively or in tests supplied OpenAI providers.
    pub fn with_openai_provider(mut self, provider: Arc<dyn OpenAiImages>) -> Self {
        self.openai = Some(provider);
        self
    }

    /// Present only with a stored OpenAI key; the key is read per call.
    pub(super) fn openai_ready(&self) -> Result<&Arc<dyn OpenAiImages>, ErrorEnvelope> {
        let openai = self
            .openai
            .as_ref()
            .ok_or_else(|| unavailable("OpenAI has no key configured"))?;
        if !openai.available().map_err(provider_error)? {
            return Err(unavailable("OpenAI has no key configured"));
        }
        self.art_ready()?;
        Ok(openai)
    }

    pub(super) async fn generate_openai(
        &self,
        params: &ArtGenerateParams,
    ) -> Result<ArtGenerateResult, ErrorEnvelope> {
        let openai = self.openai_ready()?;
        let record = self.designs.record(&params.design_id)?;
        if record.origin != (DesignOrigin::Custom {}) {
            return Err(ErrorEnvelope::new(
                ErrorCode::Invalid,
                "generate into a design from beacons.design.create",
            ));
        }
        // One image per call, no separate cutout step (ask for a transparent
        // background instead), and the provider's size rules.
        if u8::from(params.quantity.clone()) != 1 || params.remove_background {
            return Err(provider_error(ArtError::Invalid));
        }
        let (width, height) = (
            u32::from(u16::from(params.width.clone())),
            u32::from(u16::from(params.height.clone())),
        );
        openai_wire::valid_size(width, height).map_err(provider_error)?;
        let request = OpenAiImageRequest {
            prompt: params.prompt.clone(),
            model: OpenAiModel::parse(&String::from(params.model_id.clone()))
                .map_err(provider_error)?,
            size: OpenAiSize::Exact { width, height },
            background: match params.background {
                Some(ArtBackground::Opaque) => OpenAiBackground::Opaque,
                Some(ArtBackground::Transparent) | None => OpenAiBackground::Transparent,
            },
        };
        let reference = params
            .reference
            .as_ref()
            .map(|path| self.designs.read_asset(&params.design_id, path))
            .transpose()?;
        let submitted_at = Timestamp::now();
        let image = match &reference {
            Some(bytes) => openai.edit(&request, bytes).await,
            None => openai.generate(&request).await,
        }
        .map_err(provider_error)?;
        let receipt =
            self.record_art_cost(&image.cost, submitted_at, cc_store::ImageProvider::OpenAi)?;
        // The charge is durable even when the returned image is unusable.
        let png = image.png.map_err(provider_error)?;
        let asset = self.designs.write_asset(
            &params.design_id,
            format!("generated-{}.png", receipt.call_id.as_str().to_lowercase()),
            &png,
        )?;
        Ok(ArtGenerateResult {
            design_id: params.design_id.clone(),
            assets: vec![GeneratedArtAsset {
                asset,
                generated: true,
                provenance: ArtProvenance::OpenaiGenerated,
            }],
            costs: vec![receipt],
        })
    }
}
