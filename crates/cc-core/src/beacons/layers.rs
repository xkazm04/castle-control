//! `beacons.art.layers`: anchors by deterministic image analysis and the bound
//! DesignPackage. Only a beacon makes a paid call (one OpenAI edit removing the
//! effect); without a key, or when the edit gives no plausible split, the
//! beacon keeps base = original and no effect (glow-only binding).
use super::art::provider_error;
use super::design_package::{self, Layers};
use super::designs::DesignOrigin;
use super::{BeaconsModule, internal};
use cc_beacons::art::{
    ArtError, OpenAiBackground, OpenAiImageRequest, OpenAiModel, OpenAiSize, anchors, openai_wire,
    raster,
};
use cc_store::Timestamp;
use cc_types::{
    ArtAnchors, ArtAssetKind, ArtCostReceipt, ArtLayers, ArtLayersParams, ErrorCode, ErrorEnvelope,
    LocalAssetPath,
};

const EDIT_PROMPT: &str = "Remove only the glowing energy core, light, sparks and glow effect \
from this object. Keep the body, silhouette, materials, colours, framing, scale, position and \
the transparent background exactly the same; where the core was, show the object's dark, \
unlit, empty chamber. No text, no letters, no numbers, no logos, no watermark.";

fn analysis(error: ArtError) -> ErrorEnvelope {
    ErrorEnvelope::new(ErrorCode::Invalid, format!("art analysis refused: {error}"))
}

/// Base and effect of a beacon split, with the receipts it cost.
struct BeaconSplit {
    base: LocalAssetPath,
    effect: Option<(LocalAssetPath, ArtAnchors)>,
    costs: Vec<ArtCostReceipt>,
}

impl BeaconsModule {
    pub(super) async fn art_layers(
        &self,
        params: &ArtLayersParams,
    ) -> Result<ArtLayers, ErrorEnvelope> {
        let _serial = self.art_serial.lock().await;
        let record = self.designs.record(&params.design_id)?;
        if record.origin != (DesignOrigin::Custom {}) {
            return Err(ErrorEnvelope::new(
                ErrorCode::Invalid,
                "library designs are already layered",
            ));
        }
        if record.kind != params.kind {
            return Err(ErrorEnvelope::new(
                ErrorCode::Invalid,
                "design is a different kind",
            ));
        }
        let bytes = self.designs.read_asset(&params.design_id, &params.asset)?;
        let image = raster::decode(&bytes).map_err(analysis)?;
        let (base, effect, anchors, costs) = match params.kind {
            ArtAssetKind::VoteBar => (
                params.asset.clone(),
                None,
                anchors::vote_bar(&image).map_err(analysis)?,
                Vec::new(),
            ),
            ArtAssetKind::Frame => (
                params.asset.clone(),
                None,
                anchors::frame(&image).map_err(analysis)?,
                Vec::new(),
            ),
            ArtAssetKind::DrawVessel => (
                params.asset.clone(),
                None,
                anchors::draw_vessel(&image).map_err(analysis)?,
                Vec::new(),
            ),
            ArtAssetKind::Beacon => {
                let split = self.split_beacon(params, &bytes, &image).await?;
                let (effect, anchors) = split
                    .effect
                    .map_or((None, ArtAnchors::default()), |(e, a)| (Some(e), a));
                (split.base, effect, anchors, split.costs)
            }
        };
        let package = design_package::build(
            &params.design_id,
            &Layers {
                kind: params.kind,
                width: image.width,
                height: image.height,
                base: &base,
                effect: effect.as_ref(),
                effect_behind: false,
                token: None,
                anchors: &anchors,
            },
        )?;
        let package = self.designs.set_layers(
            &params.design_id,
            package,
            anchors.clone(),
            base.clone(),
            None,
        )?;
        self.republish(&params.design_id)?;
        Ok(ArtLayers {
            design_id: params.design_id.clone(),
            base,
            effect,
            anchors,
            package,
            costs,
        })
    }

    async fn split_beacon(
        &self,
        params: &ArtLayersParams,
        bytes: &[u8],
        original: &raster::Rgba,
    ) -> Result<BeaconSplit, ErrorEnvelope> {
        let unsplit = || BeaconSplit {
            base: params.asset.clone(),
            effect: None,
            costs: Vec::new(),
        };
        let Some(openai) = &self.openai else {
            return Ok(unsplit());
        };
        if !openai.available().map_err(provider_error)? {
            return Ok(unsplit());
        }
        let openai = self.openai_ready()?;
        let size = match openai_wire::valid_size(original.width, original.height) {
            Ok(()) => OpenAiSize::Exact {
                width: original.width,
                height: original.height,
            },
            Err(_) => OpenAiSize::Auto,
        };
        let request = OpenAiImageRequest {
            prompt: EDIT_PROMPT.into(),
            model: OpenAiModel::Sunburst,
            size,
            background: OpenAiBackground::Transparent,
        };
        let submitted_at = Timestamp::now();
        let image = openai.edit(&request, bytes).await.map_err(provider_error)?;
        let receipt =
            self.record_art_cost(&image.cost, submitted_at, cc_store::ImageProvider::OpenAi)?;
        let mut split = unsplit();
        split.costs.push(receipt.clone());
        // Paid but unusable output falls back to base = original (risk noted
        // in the brief); the receipt above stays recorded.
        let Ok(png) = image.png else {
            return Ok(split);
        };
        let edited = raster::decode(&png).map_err(analysis)?;
        let Some(found) = anchors::split(original, &edited).map_err(analysis)? else {
            return Ok(split);
        };
        let call = receipt.call_id.as_str().to_lowercase();
        let base = self
            .designs
            .write_asset(&params.design_id, format!("base-{call}.png"), &png)?;
        let effect_png = raster::encode_png(&found.effect).map_err(analysis)?;
        let effect = self.designs.write_asset(
            &params.design_id,
            format!("effect-{call}.png"),
            &effect_png,
        )?;
        let anchors = ArtAnchors {
            core_rect: Some(anchors::rect(original, found.core).map_err(analysis)?),
            ..ArtAnchors::default()
        };
        split.base = base;
        split.effect = Some((effect, anchors));
        Ok(split)
    }

    /// Re-publish a re-layered design when a visual already shows it.
    fn republish(&self, id: &cc_types::DesignId) -> Result<(), ErrorEnvelope> {
        let Some(native) = self.native.as_ref().and_then(std::sync::Weak::upgrade) else {
            return Ok(());
        };
        let shown = self
            .state
            .lock()
            .map_err(|_| internal())?
            .visuals
            .values()
            .any(|visual| visual.design_id.as_ref() == Some(id));
        if shown {
            self.publish_design(&native, Some(id))?;
        }
        Ok(())
    }
}
