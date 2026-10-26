//! Twitch ingress schemas, not RPC identifiers or authority to act on a viewer.
//! Extra wire fields are retained on Notification::event, never used as authority.
mod actions;
pub use actions::*;

use chrono::{DateTime, Utc};
use serde::Deserialize;
use serde_json::Value;

use crate::BridgeError;

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct Broadcaster {
    pub broadcaster_user_id: String,
    pub broadcaster_user_login: String,
    pub broadcaster_user_name: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct Moderator {
    pub moderator_user_id: String,
    pub moderator_user_login: String,
    pub moderator_user_name: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct User {
    pub user_id: String,
    pub user_login: String,
    pub user_name: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct Message {
    pub text: String,
    pub fragments: Vec<Fragment>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct Fragment {
    #[serde(rename = "type")]
    pub kind: FragmentKind,
    pub text: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FragmentKind {
    Text,
    Emote,
    Cheermote,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct Boundary {
    pub start_pos: u32,
    pub end_pos: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct AutoModDetail {
    // Category is a provider-defined label, not an action/decision enum.
    pub category: String,
    pub level: u8,
    pub boundaries: Vec<Boundary>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct BlockedTermDetail {
    pub terms_found: Vec<FoundTerm>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct FoundTerm {
    pub term_id: String,
    pub boundary: Boundary,
    pub owner_broadcaster_user_id: String,
    pub owner_broadcaster_user_login: String,
    pub owner_broadcaster_user_name: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(tag = "reason", rename_all = "snake_case")]
pub enum HoldReason {
    Automod { automod: AutoModDetail },
    BlockedTerm { blocked_term: BlockedTermDetail },
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct AutoModHold {
    #[serde(flatten)]
    pub broadcaster: Broadcaster,
    #[serde(flatten)]
    pub user: User,
    pub message_id: String,
    pub message: Message,
    pub held_at: DateTime<Utc>,
    #[serde(flatten)]
    pub reason: HoldReason,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
pub enum AutoModStatus {
    Approved,
    Denied,
    Expired,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AutoModReason {
    Automod,
    BlockedTerm,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct AutoModUpdate {
    #[serde(flatten)]
    pub broadcaster: Broadcaster,
    #[serde(flatten)]
    pub moderator: Moderator,
    #[serde(flatten)]
    pub user: User,
    pub message_id: String,
    pub message: Message,
    pub status: AutoModStatus,
    // V2 enrichments are validated when supplied, not invented when absent.
    pub reason: Option<AutoModReason>,
    pub automod: Option<AutoModDetail>,
    pub blocked_term: Option<BlockedTermDetail>,
    pub held_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LowTrustStatus {
    None,
    ActiveMonitoring,
    Restricted,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SuspicionType {
    ManuallyAdded,
    BanEvader,
    SharedChannelBan,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BanEvasionEvaluation {
    Unknown,
    Possible,
    Likely,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct SuspiciousMessage {
    #[serde(flatten)]
    pub broadcaster: Broadcaster,
    #[serde(flatten)]
    pub user: User,
    pub message: SuspiciousText,
    pub low_trust_status: LowTrustStatus,
    pub shared_ban_channel_ids: Vec<String>,
    pub types: Vec<SuspicionType>,
    pub ban_evasion_evaluation: BanEvasionEvaluation,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct SuspiciousText {
    pub message_id: String,
    #[serde(flatten)]
    pub content: Message,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct ShieldBegin {
    #[serde(flatten)]
    pub broadcaster: Broadcaster,
    #[serde(flatten)]
    pub moderator: Moderator,
    pub started_at: DateTime<Utc>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct ShieldEnd {
    #[serde(flatten)]
    pub broadcaster: Broadcaster,
    #[serde(flatten)]
    pub moderator: Moderator,
    pub ended_at: DateTime<Utc>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ModerationNotification {
    AutoModHold(AutoModHold),
    AutoModUpdate(AutoModUpdate),
    Moderate(Moderate),
    SuspiciousMessage(SuspiciousMessage),
    ShieldBegin(ShieldBegin),
    ShieldEnd(ShieldEnd),
}

/// Single schema door for ingress and typed views; unknown enums/versions fail closed.
/// Unrelated topics return None and keep the bridge's existing handling.
pub fn parse_notification(
    kind: &str,
    version: Option<&str>,
    event: &Value,
) -> Result<Option<ModerationNotification>, BridgeError> {
    use ModerationNotification as N;
    let expected = match kind {
        "automod.message.hold" | "automod.message.update" | "channel.moderate" => "2",
        "channel.suspicious_user.message"
        | "channel.shield_mode.begin"
        | "channel.shield_mode.end" => "1",
        _ => return Ok(None),
    };
    if version != Some(expected) {
        return Err(BridgeError::Invalid(
            "unsupported moderation EventSub version",
        ));
    }
    let invalid = |_| BridgeError::Invalid("invalid moderation EventSub payload");
    let parsed = match kind {
        "automod.message.hold" => {
            N::AutoModHold(serde_json::from_value(event.clone()).map_err(invalid)?)
        }
        "automod.message.update" => {
            N::AutoModUpdate(serde_json::from_value(event.clone()).map_err(invalid)?)
        }
        "channel.moderate" => N::Moderate(serde_json::from_value(event.clone()).map_err(invalid)?),
        "channel.suspicious_user.message" => {
            N::SuspiciousMessage(serde_json::from_value(event.clone()).map_err(invalid)?)
        }
        "channel.shield_mode.begin" => {
            N::ShieldBegin(serde_json::from_value(event.clone()).map_err(invalid)?)
        }
        "channel.shield_mode.end" => {
            N::ShieldEnd(serde_json::from_value(event.clone()).map_err(invalid)?)
        }
        _ => unreachable!("topic was matched above"),
    };
    Ok(Some(parsed))
}
