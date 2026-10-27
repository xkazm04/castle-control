//! Native registration is fixture-only. This module owns no network capability.
use crate::{EventHub, Module, gatehouse::GatehouseModule, lots::LotsModule};
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
    events: OnceLock<Arc<EventHub>>,
    loaded: OnceLock<Result<Loaded, ErrorEnvelope>>,
}

struct Loaded {
    // Gatehouse closes before Lots releases the shared temporary fixture root.
    gatehouse: GatehouseModule,
    lots: Arc<LotsModule>,
}

impl OfflineModules {
    pub fn at(root: PathBuf, events: Arc<EventHub>) -> Self {
        Self {
            root: Some(root),
            events: OnceLock::from(events),
            loaded: OnceLock::new(),
        }
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
                lots.temporary_root = temporary_root;
                Ok(Loaded {
                    gatehouse,
                    lots: Arc::new(lots),
                })
            })
            .as_ref()
            .map_err(Clone::clone)
    }
}

pub(crate) struct OfflineModule {
    shared: Arc<OfflineModules>,
    lots: bool,
}

impl OfflineModule {
    pub fn pair(shared: Arc<OfflineModules>) -> [Self; 2] {
        [
            Self {
                shared: shared.clone(),
                lots: true,
            },
            Self {
                shared,
                lots: false,
            },
        ]
    }
}

impl Module for OfflineModule {
    fn methods(&self) -> &'static [&'static str] {
        if self.lots {
            LotsModule::METHODS
        } else {
            GatehouseModule::METHODS
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
            if self.lots {
                loaded.lots.call(request).await
            } else {
                loaded.gatehouse.call(request).await
            }
        })
    }
}

fn unavailable() -> ErrorEnvelope {
    ErrorEnvelope::new(ErrorCode::Unavailable, "offline fixture state unavailable")
}
