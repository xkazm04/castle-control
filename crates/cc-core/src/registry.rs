use crate::NativeServices;
use crate::offline::{OfflineModule, OfflineModules};
use cc_types::{ErrorCode, ErrorEnvelope, RpcRequest, StatusResult, Timestamp};
use futures::future::BoxFuture;
use serde_json::Value;
use std::collections::BTreeMap;
use std::sync::Arc;
use std::time::Instant;

/// Modules register only declared methods and receive the generated request enum.
pub trait Module: Send + Sync {
    fn methods(&self) -> &'static [&'static str];
    fn call<'a>(&'a self, request: &'a RpcRequest) -> BoxFuture<'a, Result<Value, ErrorEnvelope>>;
}

#[derive(Default)]
pub struct Registry {
    handlers: BTreeMap<&'static str, Arc<dyn Module>>,
    offline: Option<Arc<OfflineModules>>,
}

impl Registry {
    pub fn register(&mut self, module: Arc<dyn Module>) -> Result<(), ErrorEnvelope> {
        let names = module.methods();
        if names.is_empty() {
            return Err(ErrorEnvelope::new(ErrorCode::Invalid, "empty module"));
        }
        let mut seen = std::collections::BTreeSet::new();
        // Validate the complete registration before mutating the registry.
        for &name in names {
            if !RpcRequest::NAMES.contains(&name) {
                return Err(ErrorEnvelope::new(ErrorCode::Invalid, "undeclared method"));
            }
            if self.handlers.contains_key(name) || !seen.insert(name) {
                return Err(ErrorEnvelope::new(ErrorCode::Conflict, "duplicate method"));
            }
        }
        for &name in names {
            self.handlers.insert(name, Arc::clone(&module));
        }
        Ok(())
    }

    pub fn methods(&self) -> Vec<&'static str> {
        self.handlers.keys().copied().collect()
    }

    pub async fn dispatch(&self, request: &RpcRequest) -> Result<Value, ErrorEnvelope> {
        let module = self.handlers.get(request.method()).ok_or_else(|| {
            ErrorEnvelope::new(ErrorCode::Unavailable, "method is not registered yet")
        })?;
        request.validate_result(module.call(request).await?)
    }

    pub fn with_status() -> Self {
        Self::native(None)
    }
    pub fn with_native(services: Arc<NativeServices>) -> Self {
        Self::native(Some(services))
    }
    pub(crate) fn with_native_root(
        services: Arc<NativeServices>,
        root: &std::path::Path,
        events: Arc<crate::EventHub>,
    ) -> Self {
        Self::native_offline(
            Some(services),
            OfflineModules::native_at(root.to_owned(), events),
        )
    }

    /// Rust-only seam for the native subscriber and fake-bridge acceptance tests.
    /// No bridge means no pipeline and no module load or worker startup.
    pub fn shadow_pipeline(
        &self,
    ) -> Result<Option<Arc<crate::live::ShadowPipeline>>, ErrorEnvelope> {
        self.offline
            .as_ref()
            .map_or(Ok(None), |modules| modules.shadow_pipeline())
    }
    fn native(services: Option<Arc<NativeServices>>) -> Self {
        Self::native_offline(services, OfflineModules::default())
    }

    /// Caller-owned simulated state, isolated from native credentials and chat.
    pub fn with_fixture_root(
        root: impl AsRef<std::path::Path>,
        events: Arc<crate::EventHub>,
    ) -> Result<Self, ErrorEnvelope> {
        let offline = OfflineModules::at(root.as_ref().to_owned(), events);
        offline.lots()?;
        Ok(Self::native_offline(None, offline))
    }

    /// Rust-only, verdict-checked simulated intake; no RPC accepts entries.
    pub fn simulated_lots(&self) -> Result<Arc<crate::lots::LotsModule>, ErrorEnvelope> {
        self.offline
            .as_ref()
            .ok_or_else(|| {
                ErrorEnvelope::new(ErrorCode::Unavailable, "offline modules are not configured")
            })?
            .lots()
    }

    pub(crate) fn bind_events(&self, events: Arc<crate::EventHub>) -> Result<(), ErrorEnvelope> {
        if let Some(offline) = &self.offline {
            offline.bind_events(events)?;
        }
        Ok(())
    }

    fn native_offline(services: Option<Arc<NativeServices>>, offline: OfflineModules) -> Self {
        let offline = Arc::new(
            offline
                .with_overlay_origin(services.as_ref().map(|service| service.overlay_url()))
                .with_native(services.as_ref().map(Arc::downgrade)),
        );
        let mut registry = Self::default();
        registry
            .register(Arc::new(StatusModule {
                started: Instant::now(),
                services,
            }))
            .expect("built-in method is declared and unique");
        for module in OfflineModule::pair(offline.clone()) {
            registry
                .register(Arc::new(module))
                .expect("offline methods are declared and unique");
        }
        registry.offline = Some(offline);
        registry
    }
}

pub struct StatusModule {
    started: Instant,
    services: Option<Arc<NativeServices>>,
}
impl Module for StatusModule {
    fn methods(&self) -> &'static [&'static str] {
        NativeServices::METHODS
    }
    fn call<'a>(&'a self, request: &'a RpcRequest) -> BoxFuture<'a, Result<Value, ErrorEnvelope>> {
        Box::pin(async move {
            if let Some(services) = &self.services {
                return services.call(request).await;
            }
            match request {
                RpcRequest::StatusGet(_) => serde_json::to_value(StatusResult {
                    at: Timestamp::now(),
                    version: env!("CARGO_PKG_VERSION").into(),
                    uptime_ms: self
                        .started
                        .elapsed()
                        .as_millis()
                        .try_into()
                        .unwrap_or(u64::MAX),
                    // The bridge and OBS modules are not started by this foundation.
                    twitch_connected: false,
                    obs_connected: false,
                    simulated: false,
                    stream: None,
                    gatehouse: None,
                })
                .map_err(|_| {
                    ErrorEnvelope::new(ErrorCode::Internal, "status serialization failed")
                }),
                _ => Err(ErrorEnvelope::new(
                    ErrorCode::Unavailable,
                    "native adapters have not been configured",
                )),
            }
        })
    }
}
