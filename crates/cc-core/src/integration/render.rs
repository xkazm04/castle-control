use super::NativeServices;
use cc_types::{BeaconsIntensity, DesignPackage, ErrorEnvelope, Visual, VisualId};
use std::path::Path;

impl NativeServices {
    /// Only catalog selections install embedded data. Unknown IDs stay withheld;
    /// no filesystem import or ArtCatalog registration occurs for a preset.
    pub(crate) fn ensure_beacons_preset(
        &self,
        id: Option<&cc_types::DesignId>,
    ) -> Result<(), ErrorEnvelope> {
        if let Some(id) = id
            && let Some(verified) = crate::beacons::presets::embedded(id)?
        {
            self.render.accept_verified(verified, false)?;
        }
        Ok(())
    }
    /// Separate Lots handoff; no draw is represented as a Beacons visual.
    pub(crate) fn lots_render_host(&self) -> std::sync::Arc<crate::overlay::RenderHost> {
        self.render.clone()
    }
    /// Trusted native package-import door. No RPC or overlay route accepts this
    /// decision. Verify bytes first, then consent, then atomically publish.
    pub fn accept_beacons_package(
        &self,
        package: DesignPackage,
        root: &Path,
        consent: bool,
    ) -> Result<(), ErrorEnvelope> {
        let id = package.design_id.clone();
        self.render.accept_package(package, root, consent)?;
        self.art_catalog.accept_design(id, root)
    }
    /// Only the committed Beacons configuration calls this handoff. No drafts.
    pub(crate) fn accept_beacons_visual(&self, visual: Visual) -> Result<(), ErrorEnvelope> {
        self.render.commit_visual(visual)
    }
    pub(crate) fn commit_beacons_visual(
        &self,
        visual: Visual,
        commit: impl FnOnce() -> Result<(), ErrorEnvelope>,
    ) -> Result<(), ErrorEnvelope> {
        self.render.commit_visual_after(visual, commit)
    }
    /// Live engine/reset handoff. Clears that visual's simulated overlay preview;
    /// simulation RPCs use the sibling handoff and never enter live totals.
    pub fn accept_beacons_intensity(
        &self,
        intensity: BeaconsIntensity,
    ) -> Result<(), ErrorEnvelope> {
        self.render.accept_intensity(intensity)
    }
    /// A single-visual SIMULATED render override, never a contribution or total.
    pub(crate) fn accept_beacons_simulation(
        &self,
        intensity: BeaconsIntensity,
    ) -> Result<(), ErrorEnvelope> {
        self.render.accept_simulation(intensity)
    }
    pub(crate) fn beacons_source_url(&self, id: &VisualId) -> Result<String, ErrorEnvelope> {
        self.render.source_url(&self.overlay_url(), id)
    }
    /// End only this visual's test fire and restore its accepted live value.
    pub(crate) fn end_beacons_simulation(&self, id: &VisualId) -> Result<(), ErrorEnvelope> {
        self.render.clear_simulation(id)
    }
}
