//! Bounded shadow consumer. Its capabilities are domain modules and events only;
//! no Twitch bridge, moderation client, vault, engine router or CLI is reachable.
use crate::{ChatIngress, EventHub, gatehouse::GatehouseModule, lots::LotsModule};
use cc_gatehouse::{Classifier, ClassifierError, IngestedMessage, VerifiedMetadata};
use cc_lots::MessageFacts;
use cc_types::{BridgeGap, ErrorCode, ErrorEnvelope, EventKind, Timestamp};
use std::sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
};
use tokio::{sync::broadcast, task::JoinHandle};
mod beacon;
pub(crate) use beacon::NoBeacon;

/// No configured local model: the fast lane never constructs a CLI backend or
/// opts chat into a cloud endpoint. Pending classifier rules fail to a hold.
pub struct RulesOnly;
#[async_trait::async_trait]
impl Classifier for RulesOnly {
    async fn classify(&self, _: &str, _: &str) -> Result<String, ClassifierError> {
        Err(ClassifierError::RulesOnly)
    }
}

pub struct ShadowPipeline {
    gatehouse: Arc<GatehouseModule>,
    lots: Arc<LotsModule>,
    beacons: Arc<crate::beacons::BeaconsModule>,
    events: Arc<EventHub>,
    serial: tokio::sync::Mutex<()>,
    revoked: AtomicBool,
}

impl ShadowPipeline {
    pub(crate) fn new(
        gatehouse: Arc<GatehouseModule>,
        lots: Arc<LotsModule>,
        beacons: Arc<crate::beacons::BeaconsModule>,
        events: Arc<EventHub>,
    ) -> Self {
        Self {
            gatehouse,
            lots,
            beacons,
            events,
            serial: tokio::sync::Mutex::new(()),
            revoked: AtomicBool::new(false),
        }
    }

    /// Rust-only bridge seam. None starts no task; fixture registration never
    /// supplies a receiver. A single worker bounds in-flight verdicts to one.
    /// The sender never awaits this lane: broadcast retains at most 256 chats
    /// in production and reports overflow explicitly instead of growing memory.
    pub fn start(
        self: &Arc<Self>,
        receiver: Option<broadcast::Receiver<ChatIngress>>,
        classifier: Arc<dyn Classifier>,
    ) -> Option<JoinHandle<Result<(), ErrorEnvelope>>> {
        let mut receiver = receiver?;
        let pipeline = self.clone();
        Some(tokio::spawn(async move {
            let mut last = Timestamp::now();
            let mut gap = None;
            loop {
                match receiver.recv().await {
                    Ok(chat) => {
                        let at = chat.message.at.clone();
                        if let Err(error) = pipeline
                            .process(chat, classifier.as_ref(), gap.take().into_iter().collect())
                            .await
                        {
                            pipeline.events.publish(EventKind::BridgeGap)?;
                            return Err(error);
                        }
                        // Overflow may have happened while the model waited.
                        // Start the gap at the last observed event, not at the
                        // later completion time which could hide that loss.
                        last = at.try_into().map_err(|_| invalid())?;
                    }
                    Err(broadcast::error::RecvError::Lagged(_)) => {
                        pipeline.events.publish(EventKind::BridgeGap)?;
                        // Bind the interval to the next retained message's real
                        // viewer association; cc-store forbids ownerless records.
                        gap = Some(BridgeGap {
                            from: last.clone(),
                            to: Timestamp::now(),
                        });
                    }
                    Err(broadcast::error::RecvError::Closed) => return Ok(()),
                }
            }
        }))
    }

    async fn process(
        &self,
        chat: ChatIngress,
        classifier: &dyn Classifier,
        gaps: Vec<BridgeGap>,
    ) -> Result<(), ErrorEnvelope> {
        let _serial = self.serial.lock().await;
        if self.revoked.load(Ordering::Acquire) {
            return Err(ErrorEnvelope::new(
                ErrorCode::Unauthorized,
                "live authorization revoked",
            ));
        }
        let message = message(&chat)?;
        let screened = self
            .gatehouse
            .screen_live_shadow(message, classifier, gaps)
            .await?;
        // The ledger commit precedes both invalidations and every downstream use.
        self.events.publish(EventKind::ChatMessage)?;
        self.events.publish(EventKind::Verdict)?;
        self.events.publish(EventKind::Decision)?;
        if screened.decision.verdict == cc_types::Verdict::Pass {
            self.events.publish(EventKind::Consensus)?;
        }
        self.lots.intake_screened(
            &screened,
            MessageFacts {
                message_id: screened.message.message_id.clone(),
                user_id: screened.message.user_id.clone(),
                at: String::from(screened.message.at.clone())
                    .parse()
                    .map_err(|_| invalid())?,
                text: screened.message.text.clone(),
                // Twitch chat does not prove follow/redemption state. Fail closed.
                follower: false,
                subscriber: chat.message.viewer.sub_tier.is_some(),
                redeemed: false,
                activity_units: 0,
                cohorts: Default::default(),
            },
        )?;
        Ok(())
    }

    pub(crate) async fn revoke(&self) -> Result<(), ErrorEnvelope> {
        self.revoked.store(true, Ordering::Release);
        // Wait for the current verdict before erasure; queued messages cannot
        // race a purge and repopulate the stores afterwards.
        let _serial = self.serial.lock().await;
        self.gatehouse.purge_live_data().await?;
        self.lots.purge_live_data()?;
        self.beacons.purge_live_data()
    }
}

fn message(chat: &ChatIngress) -> Result<IngestedMessage, ErrorEnvelope> {
    let m = &chat.message;
    if chat.login.is_empty()
        || !chat
            .login
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_')
    {
        return Err(invalid());
    }
    let message = IngestedMessage {
        message_id: m.id.clone().try_into().map_err(|_| invalid())?,
        user_id: cc_store::TwitchUserId::parse(&m.viewer.id).map_err(|_| invalid())?,
        login: chat.login.to_ascii_lowercase(),
        text: m.text.clone(),
        at: m.at.clone().try_into().map_err(|_| invalid())?,
        simulated: false,
        metadata: Some(VerifiedMetadata {
            moderator: m.viewer.is_mod,
            broadcaster: false,
        }),
    };
    // One schema door for the internal adapter boundary, not another wire type.
    serde_json::from_value(serde_json::to_value(message).map_err(|_| invalid())?)
        .map_err(|_| invalid())
}

fn invalid() -> ErrorEnvelope {
    ErrorEnvelope::new(ErrorCode::Invalid, "invalid live chat metadata")
}
