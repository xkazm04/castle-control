//! Persisted settings are the only source of native executable/model selection.
use super::{StewardConfig, StewardModule, internal, keychain::Vault};
use cc_engine::{ConstructionError, Engine, SpawnDoor};
use cc_store::Store;
use cc_types::{ErrorCode, ErrorEnvelope};
use std::{path::PathBuf, sync::Arc};

#[cfg(test)]
#[path = "native_tests.rs"]
mod tests;

#[derive(Clone)]
pub(super) enum StoreOwner {
    Isolated(Arc<tokio::sync::Mutex<Store>>),
    Native(Arc<std::sync::Mutex<Store>>),
}

#[derive(Clone)]
pub(super) enum EngineSource {
    Fixed(Arc<Engine>),
    Settings(PathBuf),
}

impl EngineSource {
    pub(super) fn resolve(&self, store: &Store) -> Result<Arc<Engine>, ErrorEnvelope> {
        match self {
            Self::Fixed(engine) => Ok(engine.clone()),
            Self::Settings(root) => {
                let settings = store.engine_settings().map_err(|_| internal())?;
                let door = SpawnDoor::new(root).map_err(|_| {
                    ErrorEnvelope::new(ErrorCode::Unavailable, "Steward spawn control unavailable")
                })?;
                // The same native Store lock serializes the entire ask, so a
                // fresh runtime cannot bypass admission across settings changes.
                Engine::from_settings(&settings, door, 1)
                    .map(Arc::new)
                    .map_err(|error| {
                        let message = match error {
                            ConstructionError::MissingKeys(_) => error.to_string(),
                            _ => "Steward engine settings unavailable".into(),
                        };
                        ErrorEnvelope::new(ErrorCode::Unavailable, message)
                    })
            }
        }
    }
}

impl StewardModule {
    pub(crate) fn native(store: Arc<std::sync::Mutex<Store>>, process_root: PathBuf) -> Self {
        Self::configured(StewardConfig {
            engine: EngineSource::Settings(process_root),
            store: StoreOwner::Native(store),
            vault: Arc::new(Vault::default()),
            // Batch always routes to CLI today. Never let live endpoint settings
            // inject an API credential into the user's subscription CLI lane.
            key_label: None,
            simulated: false,
        })
    }
}
