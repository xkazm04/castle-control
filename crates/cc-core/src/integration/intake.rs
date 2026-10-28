//! Internal bridge pump. Contribution parsing has one schema door at ingress.
use super::*;
use crate::ingress::{ContributionIngress, contribution_ingress};
use cc_twitch::{BridgeEvent, Notification};
use tokio::sync::mpsc;

pub(crate) fn forward_contribution(
    sender: &broadcast::Sender<ContributionIngress>,
    notification: &Notification,
) -> Result<(), ErrorEnvelope> {
    if let Some(input) = contribution_ingress(notification)? {
        sender.send(input).map_err(|_| internal())?;
    }
    Ok(())
}

impl NativeServices {
    pub(super) fn bridge_pump(
        self: &Arc<Self>,
        events: Arc<EventHub>,
        live: bool,
        contribution: Option<broadcast::Sender<ContributionIngress>>,
    ) -> AbortHandle {
        let (sender, mut receiver) = mpsc::channel(256);
        self.bridge.start(sender);
        let weak = Arc::downgrade(self);
        tokio::spawn(async move {
            let mut poll = tokio::time::interval(Duration::from_millis(100));
            let mut previous = None;
            loop {
                tokio::select! {
                    event = receiver.recv() => {
                        let Some(event) = event else { break; };
                        if (!live || !matches!(&event, BridgeEvent::Notification(n) if n.chat.is_some()))
                            && forward_bridge_event(&events, &event).is_err() { break; }
                        if let BridgeEvent::Notification(n) = event {
                            if let Some(sender) = &contribution
                                && forward_contribution(sender, &n).is_err()
                                && events.publish(EventKind::BridgeGap).is_err() { break; }
                            if let Some(chat) = crate::ingress::chat_ingress(n)
                                && let Some(service) = weak.upgrade() {
                                    // No unmoderated chat leaves the internal broadcast.
                                    let _ = service.chat.send(chat);
                                }
                        }
                    }
                    _ = poll.tick() => {
                        let Some(service) = weak.upgrade() else { break; };
                        let Ok(status) = bridge_status(service.bridge.status()) else { break; };
                        if previous.as_ref() != Some(&status) {
                            previous = Some(status);
                            if events.publish(EventKind::BridgeStatus).is_err() { break; }
                        }
                    }
                }
            }
        }).abort_handle()
    }
}
