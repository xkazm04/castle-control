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
        let mut registry = Self::default();
        registry
            .register(Arc::new(StatusModule {
                started: Instant::now(),
            }))
            .expect("built-in method is declared and unique");
        registry
    }
}

pub struct StatusModule {
    started: Instant,
}
impl Module for StatusModule {
    fn methods(&self) -> &'static [&'static str] {
        &["status.get"]
    }
    fn call<'a>(&'a self, request: &'a RpcRequest) -> BoxFuture<'a, Result<Value, ErrorEnvelope>> {
        Box::pin(async move {
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
                })
                .map_err(|_| {
                    ErrorEnvelope::new(ErrorCode::Internal, "status serialization failed")
                }),
                _ => Err(ErrorEnvelope::new(
                    ErrorCode::NotFound,
                    "method not handled by status module",
                )),
            }
        })
    }
}
