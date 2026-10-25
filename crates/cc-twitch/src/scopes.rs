// Adapted from Shadowrunr OS @ 7e4b6f8,
// crates/shadowrunr-daemon/src/platform/twitch/{mod.rs,helix.rs}.
// Topic versions/authorization checked against Twitch's subscription-types reference.
use std::collections::BTreeMap;

use serde_json::{Value, json};

use crate::BridgeError;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Actor {
    Broadcaster,
    Moderator,
    User,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Topic {
    pub name: &'static str,
    pub version: &'static str,
    pub actor: Actor,
}

impl Topic {
    pub(crate) fn condition(&self, broadcaster: &str, user: &str) -> Value {
        let mut condition = json!({"broadcaster_user_id": broadcaster});
        match self.actor {
            Actor::Broadcaster => {}
            Actor::Moderator => condition["moderator_user_id"] = json!(user),
            Actor::User => condition["user_id"] = json!(user),
        }
        condition
    }
}

pub struct ModuleScopes {
    pub module: &'static str,
    pub scopes: &'static [&'static str],
    pub topics: &'static [Topic],
    /// Hosted EBS only; never subscribe these on the desktop's WebSocket.
    pub webhook_topics: &'static [&'static str],
}

macro_rules! topic {
    ($name:literal, $version:literal, $actor:ident) => {
        Topic {
            name: $name,
            version: $version,
            actor: Actor::$actor,
        }
    };
}

pub const MODULE_SCOPES: &[ModuleScopes] = &[
    ModuleScopes {
        module: "core",
        scopes: &["user:read:chat", "user:write:chat"],
        topics: &[topic!("channel.chat.message", "1", User)],
        webhook_topics: &[],
    },
    ModuleScopes {
        module: "gatehouse",
        scopes: &[
            "moderator:manage:banned_users",
            "moderator:manage:chat_messages",
            "moderator:manage:warnings",
            "moderator:manage:automod",
            "moderator:manage:automod_settings",
            "moderator:manage:chat_settings",
            "moderator:manage:shield_mode",
            "moderator:read:suspicious_users",
            "moderator:manage:unban_requests",
            "moderator:read:blocked_terms",
            "moderator:read:moderators",
            "moderator:read:vips",
        ],
        topics: &[
            topic!("automod.message.hold", "2", Moderator),
            topic!("automod.message.update", "2", Moderator),
            topic!("channel.moderate", "2", Moderator),
            topic!("channel.suspicious_user.message", "1", Moderator),
            topic!("channel.suspicious_user.update", "1", Moderator),
            topic!("channel.chat_settings.update", "1", User),
            topic!("channel.shield_mode.begin", "1", Moderator),
            topic!("channel.shield_mode.end", "1", Moderator),
            topic!("channel.unban_request.create", "1", Moderator),
            topic!("channel.unban_request.resolve", "1", Moderator),
        ],
        webhook_topics: &[],
    },
    ModuleScopes {
        module: "lots",
        scopes: &[
            "moderator:read:chatters",
            "channel:read:redemptions",
            "moderator:read:followers",
            "channel:read:subscriptions",
        ],
        topics: &[
            topic!(
                "channel.channel_points_custom_reward_redemption.add",
                "1",
                Broadcaster
            ),
            topic!("channel.follow", "2", Moderator),
        ],
        webhook_topics: &[],
    },
    ModuleScopes {
        module: "beacons",
        scopes: &[
            "bits:read",
            "channel:read:subscriptions",
            "channel:read:hype_train",
            "channel:read:redemptions",
            "channel:read:charity",
            "channel:read:goals",
        ],
        topics: &[
            topic!("channel.cheer", "1", Broadcaster),
            // Includes custom Power-ups; overlaps cheer, cc-beacons dedupes contributions.
            topic!("channel.bits.use", "1", Broadcaster),
            topic!("channel.subscribe", "1", Broadcaster),
            topic!("channel.subscription.gift", "1", Broadcaster),
            topic!("channel.subscription.message", "1", Broadcaster),
            topic!("channel.hype_train.begin", "2", Broadcaster),
            topic!("channel.hype_train.progress", "2", Broadcaster),
            topic!("channel.hype_train.end", "2", Broadcaster),
            topic!(
                "channel.channel_points_custom_reward_redemption.add",
                "1",
                Broadcaster
            ),
            topic!(
                "channel.channel_points_automatic_reward_redemption.add",
                "2",
                Broadcaster
            ),
            topic!("channel.charity_campaign.start", "1", Broadcaster),
            topic!("channel.charity_campaign.progress", "1", Broadcaster),
            topic!("channel.charity_campaign.stop", "1", Broadcaster),
            topic!("channel.charity_campaign.donate", "1", Broadcaster),
            topic!("channel.goal.begin", "1", Broadcaster),
            topic!("channel.goal.progress", "1", Broadcaster),
            topic!("channel.goal.end", "1", Broadcaster),
        ],
        webhook_topics: &[],
    },
    ModuleScopes {
        module: "maproom",
        scopes: &[],
        topics: &[],
        webhook_topics: &["extension.bits_transaction.create"],
    },
    ModuleScopes {
        module: "steward",
        scopes: &[],
        topics: &[],
        webhook_topics: &[],
    },
];

pub(crate) fn module_plan(modules: &[String]) -> Result<(String, Vec<Topic>), BridgeError> {
    if modules
        .iter()
        .any(|module| !MODULE_SCOPES.iter().any(|row| row.module == module))
    {
        return Err(BridgeError::Invalid("unknown Twitch module"));
    }
    let mut scopes = std::collections::BTreeSet::new();
    let mut topics = BTreeMap::new();
    for row in MODULE_SCOPES
        .iter()
        .filter(|row| row.module == "core" || modules.iter().any(|module| module == row.module))
    {
        scopes.extend(row.scopes.iter().copied());
        for topic in row.topics {
            topics.insert((topic.name, topic.version), *topic);
        }
    }
    Ok((
        scopes.into_iter().collect::<Vec<_>>().join(" "),
        topics.into_values().collect(),
    ))
}

/// Pack before opening sockets. Each worker owns one group and its own reconnect loop.
pub(crate) fn pack(topics: &[Topic], capacity: usize) -> Result<Vec<Vec<Topic>>, BridgeError> {
    if capacity == 0 || capacity > 300 || topics.len() > capacity * 3 {
        return Err(BridgeError::Invalid(
            "EventSub connection capacity exceeded",
        ));
    }
    Ok(topics.chunks(capacity).map(<[Topic]>::to_vec).collect())
}
