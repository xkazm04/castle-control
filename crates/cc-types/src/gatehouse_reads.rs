//! Bounded read projections; these methods grant no moderation authority.
use crate::{
    DecisionId, DecisionKind, MessageId, Operator, RecordedMessage, RuleId, Timestamp, Verdict,
};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

pub const GATEHOUSE_MAX_PAGE_SIZE: u32 = 100;

/// Above-maximum limits are refused, never silently expanded or clamped.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(try_from = "u32", into = "u32")]
#[schemars(with = "u32", extend("minimum" = 1, "maximum" = 100))]
pub struct GatehouseReadLimit(u32);

impl TryFrom<u32> for GatehouseReadLimit {
    type Error = &'static str;
    fn try_from(value: u32) -> Result<Self, Self::Error> {
        (1..=GATEHOUSE_MAX_PAGE_SIZE)
            .contains(&value)
            .then_some(Self(value))
            .ok_or("Gatehouse page limit must be between 1 and 100")
    }
}
impl From<GatehouseReadLimit> for u32 {
    fn from(value: GatehouseReadLimit) -> Self {
        value.0
    }
}

/// Opaque endpoint-scoped position in the append-only decision ledger. Clients
/// return it unchanged; an absent cursor starts at the beginning of history.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(try_from = "String", into = "String")]
#[schemars(with = "String", extend("pattern" = r"^(chat|history):(0|[1-9][0-9]{0,15})$(?![\s\S])"))]
pub struct GatehouseReadCursor(String);

impl TryFrom<String> for GatehouseReadCursor {
    type Error = &'static str;
    fn try_from(value: String) -> Result<Self, Self::Error> {
        let valid = value.split_once(':').is_some_and(|(kind, offset)| {
            matches!(kind, "chat" | "history")
                && !offset.is_empty()
                && offset.len() <= 16
                && (offset == "0" || !offset.starts_with('0'))
                && offset.bytes().all(|byte| byte.is_ascii_digit())
        });
        valid
            .then_some(Self(value))
            .ok_or("invalid Gatehouse cursor")
    }
}
impl From<GatehouseReadCursor> for String {
    fn from(value: GatehouseReadCursor) -> Self {
        value.0
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum GatehouseProvenance {
    Live,
    Simulated,
}

/// Read an append-ordered ledger window with a required limit of 1 through 100.
/// Legacy ledger-only decisions and retention-removed metadata are counted as
/// unavailable in the response; their verdicts or provenance are never fabricated.
/// Follow the returned cursor even when the page contains no available items.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct GatehouseReadParams {
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "crate::present"
    )]
    #[schemars(with = "GatehouseReadCursor")]
    pub cursor: Option<GatehouseReadCursor>,
    pub limit: GatehouseReadLimit,
}

/// Retained audit metadata, without message text or action intents. Pending ban
/// review still uses its existing human-review door and original-message checks.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct GatehouseReadDecision {
    pub decision_id: DecisionId,
    pub message_id: MessageId,
    pub kind: DecisionKind,
    pub verdict: Verdict,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "crate::present"
    )]
    #[schemars(with = "RuleId")]
    pub rule_id: Option<RuleId>,
    pub operator: Operator,
    pub at: Timestamp,
    pub reason_codes: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct GatehouseChatItem {
    pub message: RecordedMessage,
    pub decision: GatehouseReadDecision,
    pub provenance: GatehouseProvenance,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct GatehouseHistoryItem {
    pub decision: GatehouseReadDecision,
    pub recorded_at: Timestamp,
    pub provenance: GatehouseProvenance,
}

macro_rules! page {
    ($name:ident, $fields:ident, $fields_name:literal, $item:ty) => {
        /// A page scans at most `limit` ledger entries in append order. A page
        /// may be empty and still have a next cursor. unavailable_count counts
        /// legacy ledger-only decisions and entries missing required metadata
        /// or text after retention/erasure; verdicts or provenance are never
        /// fabricated for these unavailable rows. Follow next_cursor
        /// until absent, rather than stopping on an empty items array.
        #[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
        #[serde(try_from = $fields_name)]
        #[schemars(with = $fields_name)]
        pub struct $name {
            pub items: Vec<$item>,
            #[serde(skip_serializing_if = "Option::is_none")]
            pub next_cursor: Option<GatehouseReadCursor>,
            pub unavailable_count: u32,
        }

        #[derive(Deserialize, JsonSchema)]
        #[serde(deny_unknown_fields)]
        struct $fields {
            #[schemars(length(max = 100))]
            items: Vec<$item>,
            #[serde(
                default,
                skip_serializing_if = "Option::is_none",
                deserialize_with = "crate::present"
            )]
            #[schemars(with = "GatehouseReadCursor")]
            next_cursor: Option<GatehouseReadCursor>,
            unavailable_count: u32,
        }

        impl TryFrom<$fields> for $name {
            type Error = &'static str;
            fn try_from(value: $fields) -> Result<Self, Self::Error> {
                if value.items.len() > GATEHOUSE_MAX_PAGE_SIZE as usize {
                    return Err("Gatehouse page exceeds maximum");
                }
                Ok(Self {
                    items: value.items,
                    next_cursor: value.next_cursor,
                    unavailable_count: value.unavailable_count,
                })
            }
        }
    };
}

page!(
    GatehouseChatResult,
    GatehouseChatPageFields,
    "GatehouseChatPageFields",
    GatehouseChatItem
);
page!(
    GatehouseHistoryResult,
    GatehouseHistoryPageFields,
    "GatehouseHistoryPageFields",
    GatehouseHistoryItem
);
