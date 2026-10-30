//! Viewer-free proposals. Generation has no configuration mutation authority.
mod native;
mod proposal;
mod storage;

use crate::{Module, Registry};
use cc_engine::{Call, Engine, EngineClass, Keychain, Outcome};
use cc_store::Store;
use cc_types::{
    AskParams, AskResult, ErrorCode, ErrorEnvelope, RpcRequest, Timestamp, Writ, WritId,
    WritSealResult, WritStatus, WritTearResult,
};
use futures::future::BoxFuture;
use serde_json::Value;
use std::sync::Arc;
use tokio::sync::Mutex;

/// Rust-only composition seam. Store ownership stays with the host's inventory;
/// the host must include this Store in its revocation/full-purge lifecycle.
#[derive(Clone)]
pub struct StewardConfig {
    engine: native::EngineSource,
    store: native::StoreOwner,
    vault: Arc<dyn Keychain>,
    key_label: Option<String>,
    simulated: bool,
}

impl StewardConfig {
    pub fn new(
        engine: Engine,
        store: Arc<Mutex<Store>>,
        vault: Arc<dyn Keychain>,
        simulated: bool,
    ) -> Self {
        Self {
            engine: native::EngineSource::Fixed(Arc::new(engine)),
            store: native::StoreOwner::Isolated(store),
            vault,
            key_label: None,
            simulated,
        }
    }

    /// Only a keychain label is accepted. The engine owns credential custody.
    pub fn with_key_label(mut self, label: String) -> Self {
        self.key_label = Some(label);
        self
    }
}

#[derive(Default)]
pub(crate) struct StewardModule {
    config: Option<StewardConfig>,
}

impl StewardModule {
    pub const METHODS: &'static [&'static str] =
        &["steward.ask", "steward.writ.seal", "steward.writ.tear"];

    pub fn configured(config: StewardConfig) -> Self {
        Self {
            config: Some(config),
        }
    }

    async fn handle(
        &self,
        request: &RpcRequest,
        registry: &Registry,
    ) -> Result<Value, ErrorEnvelope> {
        let config = self.config.as_ref().ok_or_else(unavailable)?;
        let config = config.clone();
        let request = request.clone();
        // Registry clones share handlers, events and the configuration lock.
        // Keep the entire lifecycle under the Store's existing lock, including
        // native purge/revoke. Never hold a synchronous guard on an RPC worker.
        let registry = registry.clone();
        tokio::task::spawn_blocking(move || {
            let runtime = tokio::runtime::Handle::current();
            match &config.store {
                native::StoreOwner::Isolated(store) => {
                    let mut store = store.blocking_lock();
                    runtime.block_on(config.handle_store(&request, &registry, &mut store))
                }
                native::StoreOwner::Native(store) => {
                    let mut store = store.lock().map_err(|_| internal())?;
                    runtime.block_on(config.handle_store(&request, &registry, &mut store))
                }
            }
        })
        .await
        .map_err(|_| internal())?
    }
}

impl StewardConfig {
    async fn handle_store(
        &self,
        request: &RpcRequest,
        registry: &Registry,
        store: &mut Store,
    ) -> Result<Value, ErrorEnvelope> {
        match request {
            RpcRequest::Ask(params) => {
                let writ = self.ask(params, store, registry).await?;
                encode(AskResult { writ })
            }
            RpcRequest::WritSeal(params) => {
                let mut writ = storage::find(store, &params.writ_id)?;
                require_proposed(&writ)?;
                // Direct mutations take this same lock. Snapshot check, policy
                // check and authoritative apply form one configuration operation.
                let _configuration = registry.configuration.lock().await;
                let current = proposal::snapshot(&writ.proposal, registry).await?;
                if current != writ.proposal {
                    return Err(ErrorEnvelope::new(
                        ErrorCode::Conflict,
                        "writ proposal is stale",
                    ));
                }
                proposal::check(&writ.proposal, registry).await?;
                registry
                    .dispatch_inner(&proposal::mutation(&writ.proposal))
                    .await?;
                writ.status = WritStatus::Sealed;
                storage::advance(&mut writ)?;
                storage::append(store, &writ, self.simulated)?;
                registry.writ_changed()?;
                encode(WritSealResult { writ })
            }
            RpcRequest::WritTear(params) => {
                let mut writ = storage::find(store, &params.writ_id)?;
                require_proposed(&writ)?;
                writ.status = WritStatus::Torn;
                storage::advance(&mut writ)?;
                storage::append(store, &writ, self.simulated)?;
                registry.writ_changed()?;
                encode(WritTearResult { writ })
            }
            _ => Err(ErrorEnvelope::new(
                ErrorCode::Invalid,
                "method is outside Steward module",
            )),
        }
    }
}

impl StewardConfig {
    async fn ask(
        &self,
        params: &AskParams,
        store: &mut Store,
        registry: &Registry,
    ) -> Result<Writ, ErrorEnvelope> {
        let context = params
            .writ_id
            .as_ref()
            .map(|id| storage::find(store, id))
            .transpose()?;
        if context
            .as_ref()
            .is_some_and(|writ| writ.chamber != params.chamber)
        {
            return Err(ErrorEnvelope::new(
                ErrorCode::Invalid,
                "follow-up chamber differs from writ",
            ));
        }
        let result_schema = cc_types::method_schemas()
            .into_iter()
            .find(|method| method["name"] == "steward.ask")
            .ok_or_else(internal)?["result"]
            .clone();
        let prompt = format!(
            "Draft a viewer-free configuration Writ as JSON for {:?}. Return the writ itself, satisfying the Writ definition in this result schema: {}. Return data only; no action or consent is granted.\nRequest: {}\nPrevious writ: {}",
            params.chamber,
            result_schema,
            params.prompt,
            context
                .map(|writ| encode(writ).map(|value| value.to_string()))
                .transpose()?
                .unwrap_or_else(|| "none".into())
        );
        let engine = self.engine.resolve(store)?;
        // This future is thread-local and runs on handle()'s blocking worker.
        let reply = engine
            .complete(
                Call {
                    class: EngineClass::Batch,
                    prompt: &prompt,
                    rules_verdict: None,
                },
                store,
                self.vault.as_ref(),
                self.key_label.as_deref(),
            )
            .await;
        let reply = reply.map_err(|_| {
            ErrorEnvelope::new(ErrorCode::Unavailable, "Steward engine call failed")
        })?;
        let Outcome::Model { text } = reply.outcome else {
            return Err(ErrorEnvelope::new(
                ErrorCode::Unavailable,
                "Steward engine returned no proposal",
            ));
        };
        let mut writ: Writ = serde_json::from_str(&text).map_err(|_| {
            ErrorEnvelope::new(ErrorCode::Invalid, "Steward returned an invalid writ")
        })?;
        if writ.chamber != params.chamber {
            return Err(ErrorEnvelope::new(
                ErrorCode::Invalid,
                "Steward returned a different chamber",
            ));
        }
        // IDs, status, time and before snapshots are service authority, never
        // claims accepted from the model. Model-supplied acknowledgements are
        // not a grant; authoritative handlers still enforce their own gates.
        writ.writ_id = WritId::mint();
        writ.status = WritStatus::Proposed;
        writ.created_at = Timestamp::now();
        writ.updated_at = writ.created_at.clone();
        writ.error = None;
        let _configuration = registry.configuration.lock().await;
        writ.proposal = proposal::snapshot(&writ.proposal, registry).await?;
        storage::append(store, &writ, self.simulated)?;
        registry.writ_changed()?;
        Ok(writ)
    }
}

impl Module for StewardModule {
    fn methods(&self) -> &'static [&'static str] {
        Self::METHODS
    }
    fn call<'a>(&'a self, _: &'a RpcRequest) -> BoxFuture<'a, Result<Value, ErrorEnvelope>> {
        Box::pin(async { Err(unavailable()) })
    }
    fn call_in<'a>(
        &'a self,
        request: &'a RpcRequest,
        registry: &'a Registry,
    ) -> BoxFuture<'a, Result<Value, ErrorEnvelope>> {
        Box::pin(async move { self.handle(request, registry).await })
    }
}

pub(crate) fn is_mutation(request: &RpcRequest) -> bool {
    matches!(
        request,
        RpcRequest::DrawUpsert(_)
            | RpcRequest::RulesUpsert(_)
            | RpcRequest::RulesSetMode(_)
            | RpcRequest::VisualUpsert(_)
            | RpcRequest::CurveSet(_)
    )
}
fn require_proposed(writ: &Writ) -> Result<(), ErrorEnvelope> {
    if writ.status == WritStatus::Proposed {
        Ok(())
    } else {
        Err(ErrorEnvelope::new(
            ErrorCode::Conflict,
            "writ is no longer proposed",
        ))
    }
}
fn unavailable() -> ErrorEnvelope {
    ErrorEnvelope::new(ErrorCode::Unavailable, "no Steward engine is configured")
}
fn internal() -> ErrorEnvelope {
    ErrorEnvelope::new(
        ErrorCode::Internal,
        "Steward storage or serialization unavailable",
    )
}
fn encode(value: impl serde::Serialize) -> Result<Value, ErrorEnvelope> {
    serde_json::to_value(value).map_err(|_| internal())
}
