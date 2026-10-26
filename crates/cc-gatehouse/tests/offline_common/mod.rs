#![allow(dead_code)]
use cc_gatehouse::{GatePath, IngestedMessage, ScreenedMessage};
use cc_types::{
    Decision, DecisionId, DecisionKind, GatehouseText, Operator, RecordedMessage, Timestamp,
    Verdict,
};

pub fn text(s: &str) -> GatehouseText {
    s.to_owned().try_into().unwrap()
}
pub fn at(seconds: i64) -> Timestamp {
    (chrono::DateTime::parse_from_rfc3339("2026-10-25T12:00:00Z").unwrap()
        + chrono::TimeDelta::seconds(seconds))
    .with_timezone(&chrono::Utc)
    .to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
    .try_into()
    .unwrap()
}
pub fn recorded(id: usize, seconds: i64, body: &str) -> RecordedMessage {
    RecordedMessage {
        message_id: format!("simulated-{id}").try_into().unwrap(),
        user_id: (100 + id).to_string().try_into().unwrap(),
        at: at(seconds),
        text: body.into(),
    }
}
pub fn ingested(message: &RecordedMessage) -> IngestedMessage {
    IngestedMessage {
        message_id: message.message_id.clone(),
        user_id: String::from(message.user_id.clone()).try_into().unwrap(),
        login: format!("sim_{}", String::from(message.user_id.clone())),
        text: message.text.clone(),
        at: message.at.clone(),
        simulated: true,
        metadata: None,
    }
}
pub fn screened(message: RecordedMessage, verdict: Verdict) -> ScreenedMessage {
    let decision = Decision {
        decision_id: DecisionId::mint(),
        message_id: message.message_id.clone(),
        kind: if verdict == Verdict::Pass {
            DecisionKind::Released
        } else {
            DecisionKind::Removed
        },
        verdict,
        rule_id: None,
        operator: Operator::Ai,
        at: message.at.clone(),
        simulated: true,
        reason_codes: vec!["simulated".into()],
        message_text: None,
    };
    ScreenedMessage {
        message: ingested(&message),
        decision,
        intent: None,
        path: GatePath::FoundNothing,
        reaches_streamer: false,
    }
}
