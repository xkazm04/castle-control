use cc_types::*;
use schemars::schema_for;
use serde_json::{Value, json};

fn main() {
    let mut types = serde_json::Map::new();
    macro_rules! add { ($($ty:ty),+ $(,)?) => { $(types.insert(stringify!($ty).into(), json!(schema_for!($ty)));)+ }; }
    add!(
        Verdict,
        RuleMode,
        RuleClass,
        PetitionOutcome,
        CliProvider,
        Action,
        StrikePolicy,
        DecisionKind,
        Tier,
        RoomMode,
        ChatDelay,
        DrawContent,
        CheckResult,
        RandomnessSource,
        DesignStage,
        Operator,
        EngineLane,
        ErrorCode,
        MessageId,
        DecisionId,
        WritId,
        DrawRunId,
        RuleId,
        DrawId,
        VisualId,
        DesignId,
        ErrorEnvelope,
        StreamEvent,
        RpcRequest
    );
    let doc: Value = json!({"methods": method_schemas(), "types": types,
        "event_kinds": EventKind::NAMES, "error_codes": ErrorCode::VALUES});
    println!(
        "{}",
        serde_json::to_string(&doc).expect("schema is serializable")
    );
}
