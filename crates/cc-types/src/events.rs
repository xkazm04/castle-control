use crate::Timestamp;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

macro_rules! event_kinds {
    ($($variant:ident => $wire:literal),+ $(,)?) => {
        #[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
        pub enum EventKind { $(#[serde(rename = $wire)] $variant),+ }
        impl EventKind { pub const NAMES: &'static [&'static str] = &[$($wire),+]; }
    };
}
event_kinds! {
    BridgeStatus => "bridge.status", BridgeGap => "bridge.gap", ObsStatus => "obs.status",
    ChatMessage => "chat.message", Verdict => "gatehouse.verdict", Decision => "gatehouse.decision",
    Room => "gatehouse.room", Consensus => "gatehouse.consensus", Roll => "lots.roll",
    Sealed => "lots.sealed", Cast => "lots.cast", Contribution => "beacons.contribution",
    Intensity => "beacons.intensity", Turn => "maproom.turn", Writ => "steward.writ", Resync => "resync"
}

/// Invalidation only: refetch authoritative reads after these events, including resync.
/// Payloads beyond seq/at/kind belong to their module WPs, not this transport.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct StreamEvent {
    pub seq: u64,
    pub at: Timestamp,
    pub kind: EventKind,
}

/// Module payload binding; the shared StreamEvent remains invalidation-only.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "kind", content = "payload", deny_unknown_fields)]
pub enum BeaconsEventPayload {
    #[serde(rename = "beacons.contribution")]
    Contribution(crate::Contribution),
    #[serde(rename = "beacons.intensity")]
    Intensity(crate::BeaconsIntensity),
}
