use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

macro_rules! wire_enum {
    ($name:ident { $($variant:ident => $wire:literal),+ $(,)? }) => {
        #[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
        pub enum $name { $(#[serde(rename = $wire)] $variant),+ }
        impl $name {
            pub const VALUES: &'static [&'static str] = &[$($wire),+];
        }
    };
}

wire_enum!(Verdict { Pass => "pass", Hold => "hold", Bar => "bar" });
wire_enum!(RuleMode { Shadow => "shadow", Armed => "armed" });
wire_enum!(RuleClass { Rail => "rail", Pattern => "pattern", Classifier => "classifier" });
wire_enum!(PetitionOutcome { Upheld => "upheld", Overturned => "overturned" });
wire_enum!(CliProvider { ClaudeCli => "claude_cli", CodexCli => "codex_cli" });
wire_enum!(BridgeState {
    Disconnected => "disconnected", Connecting => "connecting", Connected => "connected", Error => "error"
});
wire_enum!(Action {
    Warn => "warn", Delete => "delete", Timeout => "timeout", Ban => "ban", Hold => "hold"
});
wire_enum!(DecisionKind {
    Held => "held", Released => "released", Removed => "removed", Warned => "warned",
    TimedOut => "timed_out", Banned => "banned", BanPending => "ban_pending",
    ModeChanged => "mode_changed", Undone => "undone", WouldAct => "would_act"
});
wire_enum!(Tier { S => "s", M => "m", L => "l", Xl => "xl" });
wire_enum!(RoomMode {
    Slow => "slow", FollowerOnly => "follower_only", EmoteOnly => "emote_only",
    UniqueChat => "unique_chat"
});
wire_enum!(DrawContent {
    Prize => "prize", Question => "question", Idea => "idea", Seat => "seat"
});
wire_enum!(CheckResult { Ok => "ok", Warn => "warn", Blocked => "blocked" });
wire_enum!(RandomnessSource { DrandQuicknet => "drand_quicknet", StreamerCommit => "streamer_commit" });
wire_enum!(DesignStage { LocalTest => "local_test", HostedTest => "hosted_test", Released => "released" });
wire_enum!(Operator { Human => "human", Ai => "ai", AiProposes => "ai_proposes" });
wire_enum!(EngineLane { Live => "live", Batch => "batch" });
// Terminal marker for a sealed draw that never produced a Draw row. Coarse codes
// only: no viewer, entry or chat content.
wire_enum!(DrawFailureReason {
    BeaconUnavailable => "beacon_unavailable", CapUnsatisfiable => "cap_unsatisfiable",
    InvalidCast => "invalid_cast", SealMissing => "seal_missing", Abandoned => "abandoned"});
// How an engine call ended, for the audit row; carries no model text.
wire_enum!(EngineOutcome { Model => "model", RulesOnly => "rules_only", Refused => "refused" });
// Coarse engine failure label beside a non-model outcome; mirrors the engine's
// failure kinds without payloads.
wire_enum!(EngineFailureReason {
    Invalid => "invalid", MissingModel => "missing_model", Unavailable => "unavailable",
    Timeout => "timeout", RateLimited => "rate_limited", Auth => "auth", Parse => "parse",
    NotAdmitted => "not_admitted", CloudOptIn => "cloud_opt_in", CliOnLive => "cli_on_live",
    Posture => "posture", Audit => "audit", Supervision => "supervision"
});
wire_enum!(ErrorCode {
    Invalid => "invalid", NotFound => "not_found", Conflict => "conflict",
    Unauthorized => "unauthorized", RateLimited => "rate_limited", Upstream => "upstream",
    Unavailable => "unavailable", BlockedByPolicy => "blocked_by_policy",
    NeedsHuman => "needs_human", Internal => "internal"
});

/// Numeric on the wire, including zero (no non-moderator delay).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(try_from = "u8", into = "u8")]
#[schemars(with = "u8", extend("enum" = [0, 2, 4, 6]))]
pub struct ChatDelay(u8);

impl TryFrom<u8> for ChatDelay {
    type Error = &'static str;
    fn try_from(value: u8) -> Result<Self, Self::Error> {
        [0, 2, 4, 6]
            .contains(&value)
            .then_some(Self(value))
            .ok_or("invalid chat delay")
    }
}
impl From<ChatDelay> for u8 {
    fn from(value: ChatDelay) -> Self {
        value.0
    }
}
