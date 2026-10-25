use crate::*;
use schemars::{JsonSchema, schema_for};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

/// One table drives dispatch, per-method schemas and all generated TS metadata.
macro_rules! methods {
    ($($variant:ident => ($wire:literal, $params:ty, $result:ty, $owner:literal)),+ $(,)?) => {
        #[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
        #[serde(tag = "method", content = "params", deny_unknown_fields)]
        pub enum RpcRequest { $(#[serde(rename = $wire)] $variant($params)),+ }
        impl RpcRequest {
            pub const NAMES: &'static [&'static str] = &[$($wire),+];
            pub fn method(&self) -> &'static str { match self { $(Self::$variant(_) => $wire),+ } }
            /// Results use the same typed table as requests, before crossing the wire.
            pub fn validate_result(&self, result: Value) -> Result<Value, ErrorEnvelope> {
                match self { $(Self::$variant(_) => {
                    let typed: $result = serde_json::from_value(result)
                        .map_err(|_| ErrorEnvelope::new(ErrorCode::Internal, "handler returned invalid result"))?;
                    serde_json::to_value(typed)
                        .map_err(|_| ErrorEnvelope::new(ErrorCode::Internal, "result serialization failed"))
                }),+ }
            }
        }
        pub fn method_schemas() -> Vec<Value> {
            vec![$(json!({"name": $wire, "owner": $owner,
                "params": schema_for!($params), "result": schema_for!($result)})),+]
        }
    };
}

methods! {
    StatusGet => ("status.get", Empty, StatusResult, "WP 0.2"),
    SettingsGet => ("settings.get", Empty, Settings, "WP 0.5"),
    SettingsSet => ("settings.set", Settings, Settings, "WP 0.5"),
    AuthTwitchStart => ("auth.twitch.start", Empty, TwitchAuthStatus, "WP 0.6"),
    AuthTwitchStatus => ("auth.twitch.status", Empty, TwitchAuthStatus, "WP 0.6"),
    AuthTwitchRevoke => ("auth.twitch.revoke", Empty, Empty, "WP 0.6"),
    ObsStatusGet => ("obs.status.get", Empty, ObsStatus, "WP 0.7"),
    ObsSourceCreate => ("obs.source.create", ObsSourceParams, ObsSourceResult, "WP 0.7"),
    StoreForgetUser => ("store.forgetUser", ForgetUserParams, PurgeResult, "WP 0.3"),
    StorePurgeAll => ("store.purgeAll", PurgeAllParams, PurgeResult, "WP 0.3"),
    RulesList => ("gatehouse.rules.list", Pending, Pending, "WP 1.1"),
    RulesUpsert => ("gatehouse.rules.upsert", Pending, Pending, "WP 1.1"),
    RulesSetMode => ("gatehouse.rules.setMode", Pending, Pending, "WP 1.1"),
    BanConfirm => ("gatehouse.ban.confirm", Pending, Pending, "WP 1.1"),
    BanDismiss => ("gatehouse.ban.dismiss", Pending, Pending, "WP 1.1"),
    DecisionUndo => ("gatehouse.decision.undo", Pending, Pending, "WP 1.1"),
    PetitionResolve => ("gatehouse.petition.resolve", Pending, Pending, "WP 1.1"),
    HeldResolve => ("gatehouse.held.resolve", Pending, Pending, "WP 1.2"),
    DelaySet => ("gatehouse.delay.set", Pending, Pending, "WP 1.2"),
    ShieldSet => ("gatehouse.shield.set", Pending, Pending, "WP 1.2"),
    LeaseEnd => ("gatehouse.lease.end", Pending, Pending, "WP 1.3"),
    ConsensusGet => ("gatehouse.consensus.get", Pending, Pending, "WP 1.5"),
    DrillRun => ("gatehouse.drill.run", Pending, Pending, "WP 1.6"),
    DrillDiff => ("gatehouse.drill.diff", Pending, Pending, "WP 1.6"),
    RecordingImport => ("gatehouse.recording.import", Pending, Pending, "WP 1.6"),
    DrawList => ("lots.draw.list", Pending, Pending, "WP 2.1"),
    DrawUpsert => ("lots.draw.upsert", Pending, Pending, "WP 2.1"),
    DrawCheck => ("lots.draw.check", Pending, Pending, "WP 2.1"),
    RollLookup => ("lots.roll.lookup", Pending, Pending, "WP 2.1"),
    RollSeal => ("lots.roll.seal", Pending, Pending, "WP 2.2"),
    Cast => ("lots.cast", Pending, Pending, "WP 2.2"),
    WritGet => ("lots.writ.get", Pending, Pending, "WP 2.2"),
    VisualList => ("beacons.visual.list", Pending, Pending, "WP 3.1"),
    VisualUpsert => ("beacons.visual.upsert", Pending, Pending, "WP 3.1"),
    CurveSet => ("beacons.curve.set", Pending, Pending, "WP 3.1"),
    Simulate => ("beacons.simulate", Pending, Pending, "WP 3.1"),
    SourceUrl => ("beacons.source.url", Pending, Pending, "WP 3.2"),
    DesignGet => ("maproom.design.get", Pending, Pending, "WP 4.3"),
    DesignUpsert => ("maproom.design.upsert", Pending, Pending, "WP 4.3"),
    StageGet => ("maproom.stage.get", Pending, Pending, "WP 4.3"),
    TurnRun => ("maproom.turn.run", Pending, Pending, "WP 4.3"),
    Ask => ("steward.ask", Pending, Pending, "WP 5.1"),
    WritSeal => ("steward.writ.seal", Pending, Pending, "WP 5.1"),
    WritTear => ("steward.writ.tear", Pending, Pending, "WP 5.1")
}

/// Single parse door for requests, including unknown-method and shape errors.
pub fn parse_request(bytes: &[u8]) -> Result<RpcRequest, ErrorEnvelope> {
    serde_json::from_slice(bytes)
        .map_err(|_| ErrorEnvelope::new(ErrorCode::Invalid, "invalid RPC request"))
}
