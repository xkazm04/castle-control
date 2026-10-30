//! Accepted render state on the isolated OBS listener. Never mounted on core.
mod lots;
pub mod package;
mod routes;

use cc_types::{
    BeaconsIntensity, BeaconsRenderSnapshot, DesignId, DesignPackage, ErrorCode, ErrorEnvelope,
    Visual, VisualId,
};
use package::{VerifiedPackage, invalid, scripts};
use std::{
    collections::BTreeMap,
    path::Path,
    sync::{Arc, Mutex},
};
use tokio::sync::{Semaphore, watch};

const MAX_VISUALS: usize = 128;
const MAX_PACKAGES: usize = 16;
type Snapshot = Option<Arc<RenderPush>>;

/// Snapshot provenance is also retained in the legacy SSE comment.
#[derive(PartialEq)]
struct RenderPush {
    data: BeaconsRenderSnapshot,
    simulated: bool,
}

#[derive(Default)]
struct State {
    visuals: BTreeMap<VisualId, Visual>,
    intensities: BTreeMap<VisualId, BeaconsIntensity>,
    // Rendering overrides only: never overwrite the accepted live intensity.
    previews: BTreeMap<VisualId, BeaconsIntensity>,
    packages: BTreeMap<DesignId, VerifiedPackage>,
    slots: BTreeMap<VisualId, watch::Sender<Snapshot>>,
}

pub struct RenderHost {
    state: Mutex<State>,
    lots: Mutex<BTreeMap<cc_types::DrawId, lots::DrawScene>>,
    clients: Arc<Semaphore>,
}
impl Default for RenderHost {
    fn default() -> Self {
        Self {
            state: Mutex::new(State::default()),
            lots: Mutex::new(BTreeMap::new()),
            clients: Arc::new(Semaphore::new(128)),
        }
    }
}
impl RenderHost {
    pub fn routes(self: &Arc<Self>) -> axum::Router {
        routes::router(self.clone())
    }

    /// Native-only handoff after the configuration's atomic commit. With no live
    /// intake attached, recompute the empty total under the accepted curve.
    pub fn commit_visual(&self, visual: Visual) -> Result<(), ErrorEnvelope> {
        self.commit_visual_after(visual, || Ok(()))
    }

    /// Validate/capacity-check before committing configuration to disk. Publish
    /// only after that commit succeeds, under the same render-state lock.
    pub(crate) fn commit_visual_after(
        &self,
        visual: Visual,
        commit: impl FnOnce() -> Result<(), ErrorEnvelope>,
    ) -> Result<(), ErrorEnvelope> {
        let visual: Visual =
            serde_json::from_value(serde_json::to_value(visual).map_err(|_| invalid())?)
                .map_err(|_| invalid())?;
        cc_beacons::intensity::validate_curve(&visual.curve).map_err(|_| invalid())?;
        if serde_json::to_vec(&visual).map_err(|_| invalid())?.len() > 64 * 1024 {
            return Err(invalid());
        }
        let intensity = BeaconsIntensity {
            visual_id: visual.visual_id.clone(),
            intensity: visual
                .curve
                .ranges
                .first()
                .ok_or_else(invalid)?
                .intensity
                .clone(),
        };
        let mut state = self.state.lock().map_err(|_| unavailable())?;
        let id = visual.visual_id.clone();
        if !state.visuals.contains_key(&id) && state.visuals.len() >= MAX_VISUALS {
            return Err(unavailable());
        }
        let intensity = state
            .visuals
            .get(&id)
            .filter(|previous| previous.curve == visual.curve)
            .and_then(|_| state.intensities.get(&id))
            .cloned()
            .unwrap_or(intensity);
        commit()?;
        state.visuals.insert(id.clone(), visual);
        state.intensities.insert(id.clone(), intensity);
        state.previews.remove(&id);
        state
            .slots
            .entry(id.clone())
            .or_insert_with(|| watch::channel(None).0);
        publish(&state, &id)
    }

    /// Last accepted live engine value. Replaces this visual's preview, if any.
    pub fn accept_intensity(&self, intensity: BeaconsIntensity) -> Result<(), ErrorEnvelope> {
        let mut state = self.state.lock().map_err(|_| unavailable())?;
        let id = intensity.visual_id.clone();
        if !state.visuals.contains_key(&id) {
            return Err(invalid());
        }
        state.intensities.insert(id.clone(), intensity);
        state.previews.remove(&id);
        publish(&state, &id)
    }

    /// SIMULATED per-visual render override. No live intensity or store mutation.
    pub(crate) fn accept_simulation(
        &self,
        intensity: BeaconsIntensity,
    ) -> Result<(), ErrorEnvelope> {
        let mut state = self.state.lock().map_err(|_| unavailable())?;
        let id = intensity.visual_id.clone();
        if !state.visuals.contains_key(&id) {
            return Err(invalid());
        }
        state.previews.insert(id.clone(), intensity);
        publish(&state, &id)
    }

    /// Hash/asset verification happens before consent and publication. `consent`
    /// is a trusted native decision; no overlay route accepts it or a package.
    pub fn accept_package(
        &self,
        package: DesignPackage,
        root: &Path,
        consent: bool,
    ) -> Result<(), ErrorEnvelope> {
        if serde_json::to_vec(&package).map_err(|_| invalid())?.len() > 128 * 1024 {
            return Err(invalid());
        }
        let verified = VerifiedPackage::read(package, root)?;
        let mut state = self.state.lock().map_err(|_| unavailable())?;
        let id = verified.package.design_id.clone();
        let previous = state
            .packages
            .get(&id)
            .map(|p| scripts(&p.package))
            .unwrap_or_default();
        if !consent
            && scripts(&verified.package)
                .iter()
                .any(|s| !previous.contains(s))
        {
            return Err(ErrorEnvelope::new(
                ErrorCode::NeedsHuman,
                "package privilege expansion needs consent",
            ));
        }
        if !state.packages.contains_key(&id) && state.packages.len() >= MAX_PACKAGES {
            return Err(unavailable());
        }
        state.packages.insert(id.clone(), verified);
        for visual in state
            .visuals
            .values()
            .filter(|v| v.design_id.as_ref() == Some(&id))
        {
            publish(&state, &visual.visual_id)?;
        }
        Ok(())
    }

    pub fn source_url(&self, origin: &str, id: &VisualId) -> Result<String, ErrorEnvelope> {
        let state = self.state.lock().map_err(|_| unavailable())?;
        let snapshot = state
            .slots
            .get(id)
            .and_then(|s| s.borrow().clone())
            .ok_or_else(unavailable)?;
        let mut url = format!("{origin}beacons/{}", id.as_str());
        if let Some(package) = &snapshot.data.package {
            url.push_str("?package_hash=");
            url.push_str(&String::from(package.content_hash.clone()));
        }
        Ok(url)
    }

    pub fn owns_source(&self, origin: &str, url: &str) -> bool {
        if let Some(id) = url.strip_prefix(&format!("{origin}lots/")) {
            return cc_types::DrawId::try_from(id.to_owned())
                .is_ok_and(|id| self.lots_seal(&id).is_ok_and(|seal| seal.is_some()));
        }
        if url == origin {
            return true;
        } // The owner-attended spike's static plate.
        let Some(path) = url.strip_prefix(&format!("{origin}beacons/")) else {
            return false;
        };
        let id = path.split('?').next().unwrap_or("");
        let Ok(id) = VisualId::try_from(id.to_owned()) else {
            return false;
        };
        self.source_url(origin, &id)
            .is_ok_and(|expected| expected == url)
    }
}

fn publish(state: &State, id: &VisualId) -> Result<(), ErrorEnvelope> {
    let visual = state.visuals.get(id).ok_or_else(invalid)?.clone();
    let package = visual
        .design_id
        .as_ref()
        .and_then(|id| state.packages.get(id))
        .map(|p| p.package.clone());
    let slot = state.slots.get(id).ok_or_else(invalid)?;
    if visual.design_id.is_some() && package.is_none() {
        slot.send_replace(None); // Named but unverified: emit nothing, including on reconnect.
        return Ok(());
    }
    let simulated = state.previews.contains_key(id);
    let snapshot = BeaconsRenderSnapshot {
        visual,
        package,
        simulated,
        intensity: state
            .previews
            .get(id)
            .or_else(|| state.intensities.get(id))
            .ok_or_else(invalid)?
            .clone(),
    };
    let snapshot: BeaconsRenderSnapshot =
        serde_json::from_value(serde_json::to_value(snapshot).map_err(|_| invalid())?)
            .map_err(|_| invalid())?;
    let push = RenderPush {
        data: snapshot,
        simulated,
    };
    if slot.borrow().as_deref() != Some(&push) {
        slot.send_replace(Some(Arc::new(push)));
    }
    Ok(())
}
fn unavailable() -> ErrorEnvelope {
    ErrorEnvelope::new(
        ErrorCode::Unavailable,
        "accepted render state unavailable or full",
    )
}
