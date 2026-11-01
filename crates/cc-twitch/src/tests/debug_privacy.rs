//! `{:?}` on chat-carrying types must never echo viewer text (simulated marker below).
use crate::{BridgeEvent, ChatMessage, Notification, Viewer};
use serde_json::json;

const MARKER: &str = "SIMULATED-MARKER-do-not-log";

fn message() -> ChatMessage {
    ChatMessage {
        id: "m1".into(),
        at: "2026-01-01T00:00:00Z".into(),
        viewer: Viewer {
            id: "200".into(),
            name: "SimulatedViewer".into(),
            is_mod: false,
            sub_tier: None,
        },
        text: format!("hello {MARKER}"),
    }
}

fn notification() -> Notification {
    Notification {
        id: "n1".into(),
        at: "2026-01-01T00:00:00Z".into(),
        subscription_type: "channel.chat.message".into(),
        event: json!({"message": {"text": format!("hello {MARKER}")}}),
        chat: Some(message()),
    }
}

fn assert_clean(rendered: &[String]) {
    for text in rendered {
        assert!(!text.contains(MARKER), "chat text leaked: {text}");
    }
}

#[test]
fn debug_output_never_contains_chat_text() {
    let chat = message();
    let note = notification();
    let event = BridgeEvent::Notification(note.clone());
    assert_clean(&[
        format!("{chat:?}"),
        format!("{chat:#?}"),
        format!("{note:?}"),
        format!("{note:#?}"),
        format!("{event:?}"),
        format!("{event:#?}"),
        format!("{:?}", Some(chat)),
    ]);
}

#[test]
fn debug_output_keeps_non_sensitive_shape() {
    let rendered = format!("{:?}", notification());
    assert!(rendered.contains("n1"));
    assert!(rendered.contains("channel.chat.message"));
}
