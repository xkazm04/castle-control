//! Shared module ownership. Fixture defaults remain lazy and socket-free.
use crate::{
    EventHub, Module, beacons::BeaconsModule, gatehouse::GatehouseModule, lots::LotsModule,
};
use cc_types::{ErrorCode, ErrorEnvelope, RpcRequest, RuleMode};
use futures::future::BoxFuture;
use serde_json::Value;
use std::{
    path::PathBuf,
    sync::{Arc, Mutex, OnceLock, Weak},
};

#[derive(Default)]
pub(crate) struct OfflineModules {
    root: Option<PathBuf>,
    overlay_origin: Option<String>,
    native: Option<Weak<crate::NativeServices>>,
    live: bool,
    rehearsal: bool,
    events: OnceLock<Arc<EventHub>>,
    // Only a successful load is kept: a transient failure is retried next call.
    loaded: Mutex<Option<Arc<Loaded>>>,
    pipeline: OnceLock<Arc<crate::live::ShadowPipeline>>,
}

struct Loaded {
    // Other modules close before Lots releases the shared temporary fixture root.
    gatehouse: Arc<GatehouseModule>,
    tiltyard: Arc<crate::tiltyard::TiltyardModule>,
    beacons: Arc<BeaconsModule>,
    lots: Arc<LotsModule>,
}

impl OfflineModules {
    pub(crate) fn settings_root(&self) -> Option<PathBuf> {
        self.root.as_ref().map(|root| root.join("settings"))
    }

    pub(crate) fn writ_changed(&self) -> Result<(), ErrorEnvelope> {
        self.events
            .get_or_init(|| Arc::new(EventHub::new(256).expect("nonzero event capacity")))
            .publish(cc_types::EventKind::Writ)?;
        Ok(())
    }
    pub fn at(root: PathBuf, events: Arc<EventHub>) -> Self {
        Self {
            root: Some(root),
            overlay_origin: None,
            native: None,
            live: false,
            rehearsal: false,
            events: OnceLock::from(events),
            loaded: Mutex::new(None),
            pipeline: OnceLock::new(),
        }
    }

    pub fn native_at(root: PathBuf, events: Arc<EventHub>) -> Self {
        Self {
            live: true,
            ..Self::at(root, events)
        }
    }

    /// Entering rehearsal explicitly selects the real public quicknet beacon.
    /// Never read or write the owner's native opt-in, or substitute recorded time.
    pub fn rehearsal_at(root: PathBuf, events: Arc<EventHub>) -> Self {
        Self {
            rehearsal: true,
            ..Self::native_at(root, events)
        }
    }

    /// Only native services supply an already-bound overlay origin. This never
    /// starts a listener or grants these modules access to core RPC credentials.
    pub fn with_overlay_origin(mut self, origin: Option<String>) -> Self {
        self.overlay_origin = origin;
        self
    }
    pub fn with_native(mut self, native: Option<Weak<crate::NativeServices>>) -> Self {
        self.native = native;
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

    pub(crate) fn gatehouse(&self) -> Result<Arc<GatehouseModule>, ErrorEnvelope> {
        Ok(self.load()?.gatehouse.clone())
    }

    pub(crate) fn tiltyard(&self) -> Result<Arc<crate::tiltyard::TiltyardModule>, ErrorEnvelope> {
        Ok(self.load()?.tiltyard.clone())
    }

    pub(crate) fn beacons(&self) -> Result<Arc<BeaconsModule>, ErrorEnvelope> {
        Ok(self.load()?.beacons.clone())
    }

    pub fn shadow_pipeline(
        &self,
    ) -> Result<Option<Arc<crate::live::ShadowPipeline>>, ErrorEnvelope> {
        if !self.live {
            return Ok(None);
        }
        let loaded = self.load()?;
        Ok(Some(
            self.pipeline
                .get_or_init(|| {
                    Arc::new(crate::live::ShadowPipeline::new(
                        loaded.gatehouse.clone(),
                        loaded.lots.clone(),
                        loaded.beacons.clone(),
                        self.events
                            .get()
                            .expect("loaded modules bind events")
                            .clone(),
                    ))
                })
                .clone(),
        ))
    }

    fn load(&self) -> Result<Arc<Loaded>, ErrorEnvelope> {
        let mut cached = self.loaded.lock().map_err(|_| unavailable())?;
        if let Some(loaded) = cached.as_ref() {
            return Ok(loaded.clone());
        }
        let loaded = self.open_all()?;
        *cached = Some(loaded.clone());
        Ok(loaded)
    }

    fn open_all(&self) -> Result<Arc<Loaded>, ErrorEnvelope> {
        (|| {
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
            let (mut lots, gatehouse) = if self.live {
                (
                    LotsModule::open(
                        root.join("lots"),
                        events.clone(),
                        if self.rehearsal {
                            Arc::new(crate::lots::live_beacon::LiveBeacon::new(
                                crate::lots::live_beacon::official_chain(),
                            ))
                        } else {
                            crate::lots::live_beacon::configured(root)?
                        },
                        Arc::new(crate::lots::SystemLotsClock),
                        false,
                    )?,
                    if self.rehearsal {
                        GatehouseModule::open_shadow_with_directions(
                            root.join("gatehouse"),
                            crate::rehearsal::directions::seeds(),
                        )?
                    } else {
                        GatehouseModule::open_shadow(root.join("gatehouse"))?
                    },
                )
            } else {
                let recorded = Arc::new(crate::lots::recorded::RecordedBeacon);
                (
                    LotsModule::open(
                        root.join("lots"),
                        events.clone(),
                        recorded.clone(),
                        recorded,
                        true,
                    )?,
                    GatehouseModule::open_offline(root.join("gatehouse"))?,
                )
            };
            if self.live
                && let Some(native) = self.native.as_ref().and_then(Weak::upgrade)
            {
                lots = lots.with_render_host(native.lots_render_host());
            }
            let beacons = BeaconsModule::open(root.join("beacons"))?
                .with_overlay_origin(self.overlay_origin.clone())
                .with_native(self.native.clone())?;
            let gatehouse = Arc::new(gatehouse);
            let tiltyard = crate::tiltyard::TiltyardModule::open(
                root.join("tiltyard"),
                gatehouse.clone(),
                events,
                self.overlay_origin.clone(),
            )?;
            if let Some(native) = self.native.as_ref().and_then(Weak::upgrade) {
                native.lots_render_host().bind_tiltyard(tiltyard.clone())?;
            }
            lots.temporary_root = temporary_root;
            Ok(Arc::new(Loaded {
                gatehouse,
                tiltyard,
                beacons: Arc::new(beacons),
                lots: Arc::new(lots),
            }))
        })()
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
    Tiltyard,
}

impl OfflineModule {
    // Preserve the registry's existing factory entry point as modules are added.
    pub fn pair(shared: Arc<OfflineModules>) -> [Self; 4] {
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
                shared: shared.clone(),
                kind: OfflineKind::Beacons,
            },
            Self {
                shared,
                kind: OfflineKind::Tiltyard,
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
            OfflineKind::Tiltyard => crate::tiltyard::TiltyardModule::METHODS,
        }
    }

    fn call<'a>(&'a self, request: &'a RpcRequest) -> BoxFuture<'a, Result<Value, ErrorEnvelope>> {
        Box::pin(async move {
            // Even acknowledged arming is unavailable through fixture registration.
            // The standalone domain service retains its existing testable semantics.
            let arming = match request {
                RpcRequest::RulesSetMode(params) => params.mode == RuleMode::Armed,
                // The rail is always armed and only its delivery is configurable, so
                // the domain service alone decides whether an upsert may change it.
                RpcRequest::RulesUpsert(params) => {
                    params.rule.mode == RuleMode::Armed
                        && params.rule.rule_class != cc_types::RuleClass::Rail
                }
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
                OfflineKind::Lots => {
                    let lots = loaded.lots.clone();
                    let request = request.clone();
                    // HTTPS is a synchronous, bounded transport. Never block the
                    // async bridge or UI executor while verifying a round.
                    tokio::task::spawn_blocking(move || lots.handle(&request))
                        .await
                        .map_err(|_| unavailable())?
                }
                OfflineKind::Gatehouse => loaded.gatehouse.call(request).await,
                OfflineKind::Beacons => loaded.beacons.call(request).await,
                OfflineKind::Tiltyard => loaded.tiltyard.call(request).await,
            }
        })
    }
}

fn unavailable() -> ErrorEnvelope {
    ErrorEnvelope::new(ErrorCode::Unavailable, "offline fixture state unavailable")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_transient_load_failure_is_not_cached_for_later_calls() {
        let dir = tempfile::tempdir().unwrap();
        let modules =
            OfflineModules::at(dir.path().to_owned(), Arc::new(EventHub::new(16).unwrap()));
        // A file where a module directory belongs blocks the first load.
        let blocked = dir.path().join("lots");
        std::fs::write(&blocked, b"simulated blocker").unwrap();
        assert!(modules.lots().is_err());
        std::fs::remove_file(&blocked).unwrap();
        assert!(modules.lots().is_ok());
    }
}
