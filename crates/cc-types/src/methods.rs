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
    BridgeStatusGet => ("bridge.status.get", Empty, BridgeStatus, "WP 0.7"),
    ObsStatusGet => ("obs.status.get", Empty, ObsStatus, "WP 0.7"),
    ObsSourceCreate => ("obs.source.create", ObsSourceParams, ObsSourceResult, "WP 0.7"),
    StoreForgetUser => ("store.forgetUser", ForgetUserParams, PurgeResult, "WP 0.3"),
    StorePurgeAll => ("store.purgeAll", PurgeAllParams, PurgeResult, "WP 0.3"),
    RulesList => ("gatehouse.rules.list", Empty, RulesListResult, "WP 1.1"),
    RulesUpsert => ("gatehouse.rules.upsert", RulesUpsertParams, Rule, "WP 1.1"),
    RulesSetMode => ("gatehouse.rules.setMode", RulesSetModeParams, Decision, "WP 1.1"),
    BanConfirm => ("gatehouse.ban.confirm", DecisionParams, Decision, "WP 1.1"),
    BanDismiss => ("gatehouse.ban.dismiss", DecisionParams, Decision, "WP 1.1"),
    DecisionUndo => ("gatehouse.decision.undo", DecisionParams, Decision, "WP 1.1"),
    PetitionResolve => ("gatehouse.petition.resolve", PetitionResolveParams, Decision, "WP 1.1"),
    HeldResolve => ("gatehouse.held.resolve", HeldResolveParams, Decision, "WP 1.2"),
    DelaySet => ("gatehouse.delay.set", DelaySetParams, DelaySetResult, "WP 1.2"),
    ShieldSet => ("gatehouse.shield.set", ShieldSetParams, ShieldState, "WP 1.2"),
    LeaseEnd => ("gatehouse.lease.end", LeaseEndParams, Decision, "WP 1.3"),
    ConsensusGet => ("gatehouse.consensus.get", ConsensusGetParams, ConsensusGetResult, "WP 1.5"),
    DrillRun => ("gatehouse.drill.run", DrillRunParams, DrillRunResult, "WP 1.6"),
    DrillDiff => ("gatehouse.drill.diff", DrillDiffParams, DrillDiffResult, "WP 1.6"),
    RecordingImport => ("gatehouse.recording.import", RecordingImportParams, RecordingImportResult, "WP 1.6"),
    DrawList => ("lots.draw.list", Empty, DrawListResult, "WP 2.1"),
    DrawUpsert => ("lots.draw.upsert", DrawUpsertParams, LotsDraw, "WP 2.1"),
    ImageUpload => ("lots.image.upload", ImageUploadParams, ImageUploadResult, "Owner rulings 2/5"),
    DrawCheck => ("lots.draw.check", DrawCheckParams, DrawCheckResult, "WP 2.1"),
    RollLookup => ("lots.roll.lookup", RollLookupParams, RollLookupResult, "WP 2.1"),
    RollSeal => ("lots.roll.seal", RollSealParams, RollSealResult, "WP 2.2"),
    Cast => ("lots.cast", CastParams, CastResult, "WP 2.2"),
    WritGet => ("lots.writ.get", WritGetParams, LotsWrit, "WP 2.2"),
    VisualList => ("beacons.visual.list", Empty, VisualListResult, "WP 3.1"),
    ContributionList => ("beacons.contribution.list", ContributionListParams, ContributionListResult, "WP 3.1"),
    VisualUpsert => ("beacons.visual.upsert", VisualUpsertParams, Visual, "WP 3.1"),
    CurveSet => ("beacons.curve.set", CurveSetParams, Visual, "WP 3.1"),
    Simulate => ("beacons.simulate", BeaconsSimulateParams, BeaconsSimulateResult, "WP 3.1"),
    SourceUrl => ("beacons.source.url", SourceUrlParams, SourceUrlResult, "WP 3.2"),
    ArtStatus => ("beacons.art.status", Empty, ArtStatusResult, "WP 3.4"),
    ArtGenerate => ("beacons.art.generate", ArtGenerateParams, ArtGenerateResult, "WP 3.4"),
    DesignGet => ("maproom.design.get", Pending, Pending, "WP 4.3"),
    DesignUpsert => ("maproom.design.upsert", DesignUpsertParams, Pending, "WP 4.3"),
    StageGet => ("maproom.stage.get", Pending, Pending, "WP 4.3"),
    TurnRun => ("maproom.turn.run", Pending, Pending, "WP 4.3"),
    Ask => ("steward.ask", AskParams, AskResult, "WP 5.1"),
    WritSeal => ("steward.writ.seal", WritSealParams, WritSealResult, "WP 5.1"),
    WritTear => ("steward.writ.tear", WritTearParams, WritTearResult, "WP 5.1"),
    ChatList => ("gatehouse.chat.list", GatehouseReadParams, GatehouseChatResult, "Gatehouse live reads"),
    HistoryList => ("gatehouse.history.list", GatehouseReadParams, GatehouseHistoryResult, "Gatehouse live reads"),
    LiveRunGet => ("gatehouse.liveRun.get", GatehouseReadParams, GatehouseLiveRunResult, "Gatehouse live capture"),
    VoteBarSourceUrl => ("gatehouse.source.url", Empty, VoteBarSourceResult, "Owner ruling 3")
}

/// Single parse door for requests, including unknown-method and shape errors.
pub fn parse_request(bytes: &[u8]) -> Result<RpcRequest, ErrorEnvelope> {
    let invalid = || ErrorEnvelope::new(ErrorCode::Invalid, "invalid RPC request");
    let value: Value = serde_json::from_slice(bytes).map_err(|_| invalid())?;
    if value
        .get("params")
        .is_some_and(|params| !params.is_object())
    {
        return Err(invalid());
    }
    // Keep typed parsing on the original bytes so duplicate fields stay invalid.
    serde_json::from_slice(bytes).map_err(|_| invalid())
}
