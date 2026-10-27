//! Offline RPC module. Native registration refuses arming and starts no executor.

use crate::Module;
use cc_gatehouse::Gatehouse;
use cc_store::Clock;
use cc_types::{ErrorCode, ErrorEnvelope, RpcRequest};
use futures::future::BoxFuture;
use serde::Serialize;
use serde_json::Value;
use std::{path::Path, sync::Arc};
use tokio::sync::Mutex;

pub struct GatehouseModule {
    state: Mutex<Gatehouse>,
}

impl GatehouseModule {
    pub const METHODS: &'static [&'static str] = &[
        "gatehouse.rules.list",
        "gatehouse.rules.upsert",
        "gatehouse.rules.setMode",
        "gatehouse.ban.confirm",
        "gatehouse.ban.dismiss",
        "gatehouse.decision.undo",
        "gatehouse.petition.resolve",
        "gatehouse.recording.import",
        "gatehouse.drill.run",
        "gatehouse.drill.diff",
        "gatehouse.consensus.get",
    ];

    /// The caller owns the persistence root and clock. No live adapter is started;
    /// decisions and rule configuration remain owned by the Gatehouse service.
    pub fn open(root: impl AsRef<Path>, clock: Arc<dyn Clock>) -> Result<Self, ErrorEnvelope> {
        Ok(Self {
            state: Mutex::new(Gatehouse::with_clock(root, clock)?),
        })
    }

    pub(crate) fn open_offline(root: impl AsRef<Path>) -> Result<Self, ErrorEnvelope> {
        let module = Self::open(root, Arc::new(cc_store::SystemClock))?;
        let rules = module
            .state
            .try_lock()
            .map_err(|_| internal())?
            .rules_list(cc_types::Empty {})?;
        if rules.rules.iter().any(|rule| {
            rule.mode == cc_types::RuleMode::Armed && rule.rule_class != cc_types::RuleClass::Rail
        }) {
            return Err(ErrorEnvelope::new(
                ErrorCode::BlockedByPolicy,
                "offline registration refuses armed rules",
            ));
        }
        Ok(module)
    }

    async fn handle(&self, request: &RpcRequest) -> Result<Value, ErrorEnvelope> {
        let mut gate = self.state.lock().await;
        match request {
            RpcRequest::RulesList(params) => encode(gate.rules_list(params.clone())?),
            RpcRequest::RulesUpsert(params) => encode(gate.rules_upsert(params.clone())?),
            RpcRequest::RulesSetMode(params) => encode(gate.rules_set_mode(params.clone())?),
            RpcRequest::BanConfirm(params) => encode(gate.ban_confirm(params.clone())?),
            RpcRequest::BanDismiss(params) => encode(gate.ban_dismiss(params.clone())?),
            RpcRequest::DecisionUndo(params) => encode(gate.decision_undo(params.clone())?),
            RpcRequest::PetitionResolve(params) => encode(gate.petition_resolve(params.clone())?),
            RpcRequest::RecordingImport(params) => encode(gate.recording_import(params.clone())?),
            RpcRequest::DrillRun(params) => encode(gate.drill_run(params.clone()).await?),
            RpcRequest::DrillDiff(params) => encode(gate.drill_diff(params.clone()).await?),
            RpcRequest::ConsensusGet(params) => encode(gate.consensus_get(params.clone())?),
            _ => Err(ErrorEnvelope::new(
                ErrorCode::Unavailable,
                "method is outside gatehouse module",
            )),
        }
    }
}

impl Module for GatehouseModule {
    fn methods(&self) -> &'static [&'static str] {
        Self::METHODS
    }

    fn call<'a>(&'a self, request: &'a RpcRequest) -> BoxFuture<'a, Result<Value, ErrorEnvelope>> {
        Box::pin(async move { self.handle(request).await })
    }
}

fn internal() -> ErrorEnvelope {
    ErrorEnvelope::new(
        ErrorCode::Internal,
        "gatehouse state or serialization unavailable",
    )
}

fn encode(value: impl Serialize) -> Result<Value, ErrorEnvelope> {
    serde_json::to_value(value).map_err(|_| internal())
}
