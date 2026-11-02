//! Shared Beacons configuration, simulated overlay previews and live routing.
mod art;
mod art_assets;
mod art_openai;
mod design_package;
mod design_rpc;
pub(crate) mod designs;
#[cfg(test)]
mod intake_cost;
mod layers;
mod library;
mod live;
pub(crate) mod presets;
mod preview;
mod routing;
pub use art_assets::{ArtCatalog, ArtDownload};
#[cfg(test)]
mod routing_tests;
mod storage;
#[cfg(test)]
mod tests;

use crate::Module;
use cc_beacons::{
    intake::InputSelection,
    intensity::{simulate, validate_curve},
};
use cc_store::Store;
use cc_types::{
    ErrorCode, ErrorEnvelope, RpcRequest, SourceUrlResult, Visual, VisualId, VisualListResult,
};
use futures::future::BoxFuture;
use serde::Serialize;
use serde_json::Value;
use std::{
    collections::BTreeMap,
    path::{Path, PathBuf},
    sync::{Arc, Mutex, Weak},
};

struct State {
    // Hold cc-store's exclusive writer lock across configuration reads and writes.
    _store: Store,
    visuals: BTreeMap<VisualId, Visual>,
    engines: BTreeMap<VisualId, routing::LiveEngine>,
    previews: BTreeMap<VisualId, preview::Preview>,
    preview_task: Option<tokio::task::JoinHandle<Result<(), ErrorEnvelope>>>,
    revoked: bool,
    // Dedupe keys of retained rows. Seeded once from the store; None means
    // rebuild (first use, after a purge or expiry, or an unfinished intake).
    seen: Option<cc_beacons::intake::Intake>,
}

pub struct BeaconsModule {
    art: Option<art::ArtRuntime>,
    openai: Option<Arc<dyn cc_beacons::art::OpenAiImages>>,
    designs: Arc<designs::DesignStore>,
    art_serial: tokio::sync::Mutex<()>,
    state: Arc<Mutex<State>>,
    root: PathBuf,
    overlay_origin: Option<String>,
    native: Option<Weak<crate::NativeServices>>,
}

impl BeaconsModule {
    pub const METHODS: &'static [&'static str] = &[
        "beacons.art.status",
        "beacons.art.generate",
        "beacons.visual.list",
        "beacons.contribution.list",
        "beacons.visual.upsert",
        "beacons.curve.set",
        "beacons.simulate",
        "beacons.source.url",
        "beacons.design.create",
        "beacons.art.layers",
        "beacons.library.import",
    ];

    /// Caller-owned root. As with Lots, viewer-free configuration is atomic JSON
    /// beside cc-store's inventoried directory, never a new table or audit kind.
    pub fn open(root: impl AsRef<Path>) -> Result<Self, ErrorEnvelope> {
        let root = root.as_ref().to_owned();
        let store = Store::open(root.join("store")).map_err(|_| internal())?;
        let visuals = storage::load(&root)?;
        let designs = Arc::new(designs::DesignStore::open(root.join("designs"))?);
        Ok(Self {
            art: None,
            openai: None,
            designs,
            art_serial: tokio::sync::Mutex::new(()),
            state: Arc::new(Mutex::new(State {
                _store: store,
                visuals,
                engines: BTreeMap::new(),
                previews: BTreeMap::new(),
                preview_task: None,
                revoked: false,
                seen: None,
            })),
            root,
            overlay_origin: None,
            native: None,
        })
    }

    /// Persisted custom and library designs, shared with the overlay host.
    pub(crate) fn designs(&self) -> Arc<designs::DesignStore> {
        self.designs.clone()
    }

    /// Supplied only by native registry composition from its bound overlay.
    /// No caller URL or core session capability is accepted at the RPC door.
    pub(crate) fn with_overlay_origin(mut self, origin: Option<String>) -> Self {
        self.overlay_origin = origin;
        self
    }

    pub(crate) fn with_native(
        mut self,
        native: Option<Weak<crate::NativeServices>>,
    ) -> Result<Self, ErrorEnvelope> {
        self.native = native;
        if let Some(service) = self.native.as_ref().and_then(Weak::upgrade) {
            self.art = Some(art::ArtRuntime {
                provider: std::sync::Arc::new(
                    cc_beacons::art::LeonardoClient::from_keychain("default".into())
                        .map_err(art::provider_error)?,
                ),
                download: std::sync::Arc::new(art_assets::LeonardoDownload),
                catalog: service.art_catalog.clone(),
            });
            self.openai = Some(Arc::new(
                cc_beacons::art::OpenAiClient::from_keychain().map_err(art::provider_error)?,
            ));
            let visuals: Vec<Visual> = self
                .state
                .lock()
                .map_err(|_| internal())?
                .visuals
                .values()
                .cloned()
                .collect();
            for visual in visuals {
                self.publish_design(&service, visual.design_id.as_ref())?;
                service.accept_beacons_visual(visual)?;
            }
        }
        Ok(self)
    }

    fn handle(&self, request: &RpcRequest) -> Result<Value, ErrorEnvelope> {
        let mut state = self.state.lock().map_err(|_| internal())?;
        match request {
            RpcRequest::VisualList(_) => encode(VisualListResult {
                visuals: state.visuals.values().cloned().collect(),
            }),
            RpcRequest::ContributionList(params) => encode(cc_types::ContributionListResult {
                items: live::read(&state._store)?
                    .into_iter()
                    .rev()
                    .take(u32::from(params.limit.clone()) as usize)
                    .collect(),
            }),
            RpcRequest::VisualUpsert(params) => {
                self.save(&mut state, params.visual.clone())?;
                encode(&params.visual)
            }
            RpcRequest::CurveSet(params) => {
                let mut visual = state
                    .visuals
                    .get(&params.visual_id)
                    .cloned()
                    .ok_or_else(not_found)?;
                visual.curve = params.curve.clone();
                self.save(&mut state, visual.clone())?;
                encode(visual)
            }
            RpcRequest::Simulate(params) => {
                let visual = state.visuals.get(&params.visual_id).ok_or_else(not_found)?;
                // Each preview starts empty, selecting only this burst's native
                // unit at weight one. No cross-source totals or live state exist.
                let inputs =
                    InputSelection::new(vec![(params.burst.source, 1)]).map_err(invalid)?;
                let preview = simulate(visual, &inputs, &params.burst).map_err(invalid)?;
                if let Some(native) = self.native.as_ref().and_then(Weak::upgrade) {
                    let session = cc_beacons::preview::PreviewSession::new(
                        visual,
                        &inputs,
                        &params.burst,
                        routing::HostClock::default(),
                    )
                    .map_err(invalid)?;
                    native.accept_beacons_simulation(preview.intensity.clone())?;
                    self.start_preview(&mut state, session, preview.intensity.clone());
                }
                encode(preview)
            }
            RpcRequest::SourceUrl(params) => {
                // Existence is checked first, including in socket-free registries.
                let visual = state.visuals.get(&params.visual_id).ok_or_else(not_found)?;
                let origin = self.overlay_origin.as_ref().ok_or_else(|| {
                    ErrorEnvelope::new(ErrorCode::Unavailable, "beacons overlay is not configured")
                })?;
                let url = if let Some(native) = self.native.as_ref().and_then(Weak::upgrade) {
                    native.beacons_source_url(&visual.visual_id)?
                } else {
                    format!("{origin}beacons/{}", visual.visual_id.as_str())
                };
                encode(SourceUrlResult {
                    url: url.try_into().map_err(|_| internal())?,
                })
            }
            _ => Err(ErrorEnvelope::new(
                ErrorCode::Unavailable,
                "method is outside beacons module",
            )),
        }
    }

    fn save(&self, state: &mut State, visual: Visual) -> Result<(), ErrorEnvelope> {
        validate_curve(&visual.curve).map_err(invalid)?;
        let mut visuals = state.visuals.clone();
        visuals.insert(visual.visual_id.clone(), visual.clone());
        if let Some(native) = self.native.as_ref().and_then(Weak::upgrade) {
            self.publish_design(&native, visual.design_id.as_ref())?;
            native.commit_beacons_visual(visual.clone(), || storage::save(&self.root, &visuals))?;
        } else {
            storage::save(&self.root, &visuals)?;
        }
        state.visuals = visuals;
        self.cancel_preview(state, &visual.visual_id)?;
        self.reset_live_visual(state, &visual)?;
        Ok(())
    }
}

impl Module for BeaconsModule {
    fn methods(&self) -> &'static [&'static str] {
        Self::METHODS
    }

    fn call<'a>(&'a self, request: &'a RpcRequest) -> BoxFuture<'a, Result<Value, ErrorEnvelope>> {
        Box::pin(async move {
            match request {
                RpcRequest::ArtStatus(_) | RpcRequest::ArtGenerate(_) => {
                    self.art_call(request).await
                }
                RpcRequest::DesignCreate(params) => encode(self.create_design(params)?),
                RpcRequest::LibraryImport(params) => encode(self.import_library(params)?),
                RpcRequest::ArtLayers(params) => encode(self.art_layers(params).await?),
                _ => self.handle(request),
            }
        })
    }
}

fn invalid(message: &'static str) -> ErrorEnvelope {
    ErrorEnvelope::new(ErrorCode::Invalid, message)
}

fn not_found() -> ErrorEnvelope {
    ErrorEnvelope::new(ErrorCode::NotFound, "visual not found")
}

fn internal() -> ErrorEnvelope {
    ErrorEnvelope::new(
        ErrorCode::Internal,
        "beacons state or serialization unavailable",
    )
}

fn encode(value: impl Serialize) -> Result<Value, ErrorEnvelope> {
    serde_json::to_value(value).map_err(|_| internal())
}
