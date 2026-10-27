//! Native registration is fixture-only. This module owns no network capability.
use crate::{
    EventHub, Module, beacons::BeaconsModule, gatehouse::GatehouseModule, lots::LotsModule,
};
use cc_types::{ErrorCode, ErrorEnvelope, RpcRequest, RuleMode};
use futures::future::BoxFuture;
use serde_json::Value;
use std::{
    path::PathBuf,
    sync::{Arc, OnceLock},
};

#[derive(Default)]
pub(crate) struct OfflineModules {
    root: Option<PathBuf>,
    overlay_origin: Option<String>,
    events: OnceLock<Arc<EventHub>>,
    loaded: OnceLock<Result<Loaded, ErrorEnvelope>>,
}

struct Loaded {
    // Other modules close before Lots releases the shared temporary fixture root.
    gatehouse: GatehouseModule,
    beacons: BeaconsModule,
    lots: Arc<LotsModule>,
}

impl OfflineModules {
    pub fn at(root: PathBuf, events: Arc<EventHub>) -> Self {
        Self {
            root: Some(root),
            overlay_origin: None,
            events: OnceLock::from(events),
            loaded: OnceLock::new(),
        }
    }

    /// Only native services supply an already-bound overlay origin. This never
    /// starts a listener or grants these modules access to core RPC credentials.
    pub fn with_overlay_origin(mut self, origin: Option<String>) -> Self {
        self.overlay_origin = origin;
        self
    }

    pub fn bind_events(&self, events: Arc<EventHub>) -> Result<(), ErrorEnvelope> {
        let bound = self.events.get_or_init(|| events.clone());
        if !Arc::ptr_eq(bound, &events) {
            return Err(ErrorEnvelope::new(
                ErrorCode::Conflict,
                "offline event hub already bound",
            ));
        }
        Ok(())
    }

    pub fn lots(&self) -> Result<Arc<LotsModule>, ErrorEnvelope> {
        Ok(self.load()?.lots.clone())
    }

    fn load(&self) -> Result<&Loaded, ErrorEnvelope> {
        self.loaded
            .get_or_init(|| {
                let temporary_root = if self.root.is_none() {
                    Some(tempfile::tempdir().map_err(|_| unavailable())?)
                } else {
                    None
                };
                let root = self
                    .root
                    .as_deref()
                    .or_else(|| temporary_root.as_ref().map(|root| root.path()))
                    .ok_or_else(unavailable)?;
                let events = self
                    .events
                    .get_or_init(|| {
                        Arc::new(EventHub::new(256).expect("nonzero offline event capacity"))
                    })
                    .clone();
                let recorded = Arc::new(crate::lots::recorded::RecordedBeacon);
                let mut lots =
                    LotsModule::open(root.join("lots"), events, recorded.clone(), recorded, true)?;
                let gatehouse = GatehouseModule::open_offline(root.join("gatehouse"))?;
                let beacons = BeaconsModule::open(root.join("beacons"))?
                    .with_overlay_origin(self.overlay_origin.clone());
                lots.temporary_root = temporary_root;
                Ok(Loaded {
                    gatehouse,
                    beacons,
                    lots: Arc::new(lots),
                })
            })
            .as_ref()
            .map_err(Clone::clone)
    }
}

pub(crate) struct OfflineModule {
    shared: Arc<OfflineModules>,
    kind: OfflineKind,
}

enum OfflineKind {
    Lots,
    Gatehouse,
    Beacons,
}

impl OfflineModule {
    // Preserve the registry's existing factory entry point as modules are added.
    pub fn pair(shared: Arc<OfflineModules>) -> [Self; 3] {
        [
            Self {
                shared: shared.clone(),
                kind: OfflineKind::Lots,
            },
            Self {
                shared: shared.clone(),
                kind: OfflineKind::Gatehouse,
            },
            Self {
                shared,
                kind: OfflineKind::Beacons,
            },
        ]
    }
}

impl Module for OfflineModule {
    fn methods(&self) -> &'static [&'static str] {
        match self.kind {
            OfflineKind::Lots => LotsModule::METHODS,
            OfflineKind::Gatehouse => GatehouseModule::METHODS,
            OfflineKind::Beacons => BeaconsModule::METHODS,
        }
    }

    fn call<'a>(&'a self, request: &'a RpcRequest) -> BoxFuture<'a, Result<Value, ErrorEnvelope>> {
        Box::pin(async move {
            // Even acknowledged arming is unavailable through fixture registration.
            // The standalone domain service retains its existing testable semantics.
            let arming = match request {
                RpcRequest::RulesSetMode(params) => params.mode == RuleMode::Armed,
                RpcRequest::RulesUpsert(params) => params.rule.mode == RuleMode::Armed,
                _ => false,
            };
            if arming {
                return Err(ErrorEnvelope::new(
                    ErrorCode::BlockedByPolicy,
                    "offline registration cannot arm rules",
                ));
            }
            let loaded = self.shared.load()?;
            match self.kind {
                OfflineKind::Lots => loaded.lots.call(request).await,
                OfflineKind::Gatehouse => loaded.gatehouse.call(request).await,
                OfflineKind::Beacons => loaded.beacons.call(request).await,
            }
        })
    }
}

fn unavailable() -> ErrorEnvelope {
    ErrorEnvelope::new(ErrorCode::Unavailable, "offline fixture state unavailable")
}
