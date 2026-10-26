//! Synthetic payloads only; the README records live-spike verification limits.
use serde_json::{Value, json};

pub(super) fn actor() -> Value {
    json!({"broadcaster_user_id": "111", "broadcaster_user_login": "simulated_channel",
        "broadcaster_user_name": "SimulatedChannel", "user_id": "222",
        "user_login": "simulated_viewer", "user_name": "SimulatedViewer",
        "moderator_user_id": "999", "moderator_user_login": "simulated_mod",
        "moderator_user_name": "SimulatedMod"})
}

pub(super) fn message() -> Value {
    json!({"text": "simulated text", "fragments": [
        {"type": "text", "text": "simulated text", "emote": null, "cheermote": null}]})
}

pub(super) fn fixtures() -> Vec<(&'static str, &'static str, Value)> {
    let mut hold = actor();
    hold["message_id"] = json!("simulated-message");
    hold["message"] = message();
    hold["held_at"] = json!("2026-10-26T12:00:00Z");
    hold["reason"] = json!("automod");
    hold["automod"] = json!({"category": "aggression", "level": 2,
        "boundaries": [{"start_pos": 0, "end_pos": 8}]});
    hold["blocked_term"] = Value::Null;
    let mut update = actor();
    update["message_id"] = json!("simulated-message");
    update["message"] = message();
    update["status"] = json!("Approved");
    let mut moderate = actor();
    moderate["action"] = json!("ban");
    moderate["ban"] = json!({"user_id": "222", "user_login": "simulated_viewer",
        "user_name": "SimulatedViewer", "reason": "simulated reason"});
    moderate["timeout"] = Value::Null;
    let mut suspicious = actor();
    suspicious["message"] = message();
    suspicious["message"]["message_id"] = json!("simulated-message");
    suspicious["low_trust_status"] = json!("restricted");
    suspicious["shared_ban_channel_ids"] = json!(["333"]);
    suspicious["types"] = json!(["manually_added", "ban_evader", "shared_channel_ban"]);
    suspicious["ban_evasion_evaluation"] = json!("likely");
    let mut begin = actor();
    begin["started_at"] = json!("2026-10-26T12:00:00Z");
    let mut end = actor();
    end["ended_at"] = json!("2026-10-26T12:01:00Z");
    vec![
        ("automod.message.hold", "2", hold),
        ("automod.message.update", "2", update),
        ("channel.moderate", "2", moderate),
        ("channel.suspicious_user.message", "1", suspicious),
        ("channel.shield_mode.begin", "1", begin),
        ("channel.shield_mode.end", "1", end),
    ]
}
