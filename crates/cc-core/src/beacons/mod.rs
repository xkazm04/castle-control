//! Offline Beacons configuration and isolated previews; no live contribution sink.
mod storage;

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
    sync::{Mutex, Weak},
};

struct State {
    // Hold cc-store's exclusive writer lock across configuration reads and writes.
    _store: Store,
    visuals: BTreeMap<VisualId, Visual>,
}

pub struct BeaconsModule {
    state: Mutex<State>,
    root: PathBuf,
    overlay_origin: Option<String>,
    native: Option<Weak<crate::NativeServices>>,
}

impl BeaconsModule {
    pub const METHODS: &'static [&'static str] = &[
        "beacons.visual.list",
        "beacons.visual.upsert",
        "beacons.curve.set",
        "beacons.simulate",
        "beacons.source.url",
    ];

    /// Caller-owned root. As with Lots, viewer-free configuration is atomic JSON
    /// beside cc-store's inventoried directory, never a new table or audit kind.
    pub fn open(root: impl AsRef<Path>) -> Result<Self, ErrorEnvelope> {
        let root = root.as_ref().to_owned();
        let store = Store::open(root.join("store")).map_err(|_| internal())?;
        let visuals = storage::load(&root)?;
        Ok(Self {
            state: Mutex::new(State {
                _store: store,
                visuals,
            }),
            root,
            overlay_origin: None,
            native: None,
        })
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
            for visual in self.state.lock().map_err(|_| internal())?.visuals.values() {
                service.accept_beacons_visual(visual.clone())?;
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
                encode(simulate(visual, &inputs, &params.burst).map_err(invalid)?)
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
            native.commit_beacons_visual(visual, || storage::save(&self.root, &visuals))?;
        } else {
            storage::save(&self.root, &visuals)?;
        }
        state.visuals = visuals;
        Ok(())
    }
}

impl Module for BeaconsModule {
    fn methods(&self) -> &'static [&'static str] {
        Self::METHODS
    }

    fn call<'a>(&'a self, request: &'a RpcRequest) -> BoxFuture<'a, Result<Value, ErrorEnvelope>> {
        Box::pin(async move { self.handle(request) })
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
