use super::NativeServices;
use cc_types::{BeaconsIntensity, DesignPackage, ErrorEnvelope, Visual, VisualId};
use std::path::Path;

impl NativeServices {
    /// Trusted native package-import door. No RPC or overlay route accepts this
    /// decision. Verify bytes first, then consent, then atomically publish.
    pub fn accept_beacons_package(
        &self,
        package: DesignPackage,
        root: &Path,
        consent: bool,
    ) -> Result<(), ErrorEnvelope> {
        self.render.accept_package(package, root, consent)
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
    /// Native engine handoff; simulated preview RPCs never call it.
    pub fn accept_beacons_intensity(
        &self,
        intensity: BeaconsIntensity,
    ) -> Result<(), ErrorEnvelope> {
        self.render.accept_intensity(intensity)
    }
    pub(crate) fn beacons_source_url(&self, id: &VisualId) -> Result<String, ErrorEnvelope> {
        self.render.source_url(&self.overlay_url(), id)
    }
}
