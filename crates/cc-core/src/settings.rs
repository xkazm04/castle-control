//! Authenticated engine configuration only. Never spawns or contacts an engine.
use crate::Module;
use cc_store::{ENGINE_SETTING_KEYS, Store};
use cc_types::{ErrorCode, ErrorEnvelope, RpcRequest, parse_engine_settings};
use futures::future::BoxFuture;
use serde_json::Value;
use std::{
    path::PathBuf,
    sync::{Arc, Mutex, OnceLock},
};

pub(crate) struct SettingsModule {
    root: Option<PathBuf>,
    loaded: OnceLock<Result<SettingsStore, ErrorEnvelope>>,
}

struct SettingsStore {
    store: Arc<Mutex<Store>>,
    // Store's lock is released before deleting its temporary directory.
    _temporary_root: Option<tempfile::TempDir>,
}

impl SettingsModule {
    pub fn new(native: Option<Arc<Mutex<Store>>>, root: Option<PathBuf>) -> Self {
        Self {
            root,
            loaded: native.map_or_else(OnceLock::new, |store| {
                OnceLock::from(Ok(SettingsStore {
                    store,
                    _temporary_root: None,
                }))
            }),
        }
    }

    fn store(&self) -> Result<Arc<Mutex<Store>>, ErrorEnvelope> {
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
                    .or_else(|| temporary_root.as_ref().map(|dir| dir.path()))
                    .ok_or_else(unavailable)?;
                let store = Store::open(root).map_err(|_| unavailable())?;
                Ok(SettingsStore {
                    store: Arc::new(Mutex::new(store)),
                    _temporary_root: temporary_root,
                })
            })
            .as_ref()
            .map(|loaded| loaded.store.clone())
            .map_err(Clone::clone)
    }
}

impl Module for SettingsModule {
    fn methods(&self) -> &'static [&'static str] {
        &["settings.get", "settings.set"]
    }

    fn call<'a>(&'a self, request: &'a RpcRequest) -> BoxFuture<'a, Result<Value, ErrorEnvelope>> {
        Box::pin(async move {
            // Validate the WHOLE input before opening even the lazy fixture
            // store. The Store also protects callers using its public API.
            if let RpcRequest::SettingsSet(settings) = request {
                parse_engine_settings(settings)?;
                if settings
                    .values
                    .keys()
                    .any(|key| !ENGINE_SETTING_KEYS.contains(&key.as_str()))
                {
                    return Err(ErrorEnvelope::new(
                        ErrorCode::Invalid,
                        "unknown engine settings key",
                    ));
                }
            }
            let request = request.clone();
            let store = self.store()?;
            tokio::task::spawn_blocking(move || {
                let mut store = store.lock().map_err(|_| unavailable())?;
                let settings = match request {
                    RpcRequest::SettingsGet(_) => store.engine_settings(),
                    RpcRequest::SettingsSet(settings) => {
                        store.set_engine_settings(&settings).map(|()| settings)
                    }
                    _ => {
                        return Err(ErrorEnvelope::new(
                            ErrorCode::Unavailable,
                            "method is outside settings module",
                        ));
                    }
                }
                .map_err(|_| unavailable())?;
                serde_json::to_value(settings).map_err(|_| unavailable())
            })
            .await
            .map_err(|_| unavailable())?
        })
    }
}

fn unavailable() -> ErrorEnvelope {
    // Never echo a storage error: it can include a path or endpoint.
    ErrorEnvelope::new(ErrorCode::Unavailable, "engine settings store unavailable")
}
