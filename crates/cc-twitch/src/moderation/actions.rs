//! channel.moderate v2: action selects the required typed detail; no catch-all.
use super::{Broadcaster, Moderator, User};
use chrono::{DateTime, Utc};
use serde::Deserialize;

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct Moderate {
    #[serde(flatten)]
    pub broadcaster: Broadcaster,
    #[serde(flatten)]
    pub moderator: Moderator,
    #[serde(flatten)]
    pub action: ModerationAction,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(tag = "action", rename_all = "snake_case")]
pub enum ModerationAction {
    Ban { ban: Ban },
    Timeout { timeout: Timeout },
    Unban { unban: User },
    Untimeout { untimeout: User },
    Clear,
    Emoteonly,
    Emoteonlyoff,
    Followers { followers: Followers },
    Followersoff,
    Uniquechat,
    Uniquechatoff,
    Slow { slow: Slow },
    Slowoff,
    Subscribers,
    Subscribersoff,
    Unraid { unraid: User },
    Delete { delete: DeletedMessage },
    Vip { vip: User },
    Unvip { unvip: User },
    Raid { raid: Raid },
    Mod { r#mod: User },
    Unmod { unmod: User },
    AddBlockedTerm { automod_terms: AutoModTerms },
    AddPermittedTerm { automod_terms: AutoModTerms },
    RemoveBlockedTerm { automod_terms: AutoModTerms },
    RemovePermittedTerm { automod_terms: AutoModTerms },
    ApproveUnbanRequest { unban_request: UnbanRequest },
    DenyUnbanRequest { unban_request: UnbanRequest },
    Warn { warn: Warning },
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct Ban {
    #[serde(flatten)]
    pub user: User,
    pub reason: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct Timeout {
    #[serde(flatten)]
    pub user: User,
    pub reason: String,
    pub expires_at: DateTime<Utc>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct Followers {
    pub follow_duration_minutes: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct Slow {
    pub wait_time_seconds: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct DeletedMessage {
    #[serde(flatten)]
    pub user: User,
    pub message_id: String,
    pub message_body: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct Raid {
    #[serde(flatten)]
    pub user: User,
    pub viewer_count: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TermList {
    Blocked,
    Permitted,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TermOperation {
    Add,
    Remove,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct AutoModTerms {
    pub action: TermOperation,
    pub list: TermList,
    pub terms: Vec<String>,
    pub from_automod: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct UnbanRequest {
    #[serde(flatten)]
    pub user: User,
    pub is_approved: bool,
    pub moderator_message: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct Warning {
    #[serde(flatten)]
    pub user: User,
    pub reason: Option<String>,
    pub chat_rules_cited: Option<Vec<String>>,
}
