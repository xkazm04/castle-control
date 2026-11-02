// Adapted from Shadowrunr OS @ 7e4b6f8,
// crates/shadowrunr-daemon/src/platform/twitch/tests.rs.
//! Every identity, chat line and credential in these local-server tests is simulated.
mod auth;
mod contributions;
mod debug_privacy;
mod eventsub;
mod fault;
mod fixtures;
mod harness;
mod helix;
mod mock;
mod moderation;
mod moderation_actions;
mod moderation_fixtures;
mod moderation_notifications;
mod reauth;
mod safety;
mod spike_checks;
mod spike_fixtures;
mod spike_live;
mod spike_session;
mod subscription_isolation;
mod wire_hardening;
