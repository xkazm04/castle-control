//! Private projections of the existing Gatehouse persistence formats. No new
//! store, connection, writer, audit text or fixture format is introduced here.
use super::internal;
use cc_gatehouse::{GatePath, IngestedMessage, recorder::Recording};
use cc_store::{DataStore, LedgerEvent, LedgerKind, LedgerLine, Store};
use cc_types::{
    DecisionId, ErrorEnvelope, GatehouseProvenance, GatehouseReadDecision, RecordedMessage,
};
use serde::Deserialize;
use std::collections::BTreeMap;

/// Intentional projection: the cache also holds private gate context that this
/// read endpoint never returns. The existing service remains its schema owner.
#[derive(Deserialize)]
pub(super) struct AuditRecord {
    #[serde(flatten)]
    pub decision: AuditDecision,
    pub simulated: bool,
    pub user_id: Option<cc_store::TwitchUserId>,
    pub path: GatePath,
    pub parent: Option<DecisionId>,
}

// Avoid flattening a deny_unknown_fields wire struct into the private record.
#[derive(Deserialize)]
pub(super) struct AuditDecision {
    pub decision_id: DecisionId,
    pub message_id: cc_types::MessageId,
    pub kind: cc_types::DecisionKind,
    pub verdict: cc_types::Verdict,
    pub rule_id: Option<cc_types::RuleId>,
    pub operator: cc_types::Operator,
    pub at: cc_types::Timestamp,
    pub reason_codes: Vec<String>,
}

impl AuditRecord {
    pub fn provenance(&self) -> GatehouseProvenance {
        if self.simulated {
            GatehouseProvenance::Simulated
        } else {
            GatehouseProvenance::Live
        }
    }

    pub fn decision(&self) -> GatehouseReadDecision {
        GatehouseReadDecision {
            decision_id: self.decision.decision_id.clone(),
            message_id: self.decision.message_id.clone(),
            kind: self.decision.kind,
            verdict: self.decision.verdict,
            rule_id: self.decision.rule_id.clone(),
            operator: self.decision.operator,
            at: self.decision.at.clone(),
            reason_codes: self.decision.reason_codes.clone(),
        }
    }

    pub fn is_chat_intake(&self) -> bool {
        self.user_id.is_some()
            && self.parent.is_none()
            && !matches!(
                self.path,
                GatePath::Configuration
                    | GatePath::HumanReview
                    | GatePath::ExternalHuman
                    | GatePath::GateSetting
            )
    }
}

pub(super) struct ReadStore {
    pub ledger: Vec<LedgerLine>,
    pub audit: BTreeMap<String, AuditRecord>,
}

pub(super) fn live_captures(
    store: &Store,
) -> Result<BTreeMap<DecisionId, cc_gatehouse::live_capture::RetainedCapture>, ErrorEnvelope> {
    cc_gatehouse::live_capture::captures(store)
}

impl ReadStore {
    pub fn load(store: &Store) -> Result<Self, ErrorEnvelope> {
        let ledger = store
            .read_ledger(LedgerKind::Decisions)
            .map_err(|_| internal())?;
        let committed: BTreeMap<_, _> = ledger
            .iter()
            .filter_map(|line| {
                if let LedgerEvent::Decision {
                    decision_id,
                    action,
                    ..
                } = &line.event
                {
                    Some((decision_id.to_string(), action))
                } else {
                    None
                }
            })
            .collect();
        let mut audit = BTreeMap::new();
        for item in store.items(DataStore::Caches).map_err(|_| internal())? {
            let Some(action) = committed.get(&item.id.to_string()) else {
                continue;
            };
            let record: AuditRecord =
                serde_json::from_str(&item.content).map_err(|_| internal())?;
            // Check the existing commit marker, association and both copies of
            // provenance before publishing any cache metadata.
            if record.decision.decision_id.as_str() != item.id.to_string()
                || record.simulated != item.simulated
                || record
                    .user_id
                    .as_ref()
                    .is_some_and(|user| !item.user_ids.contains(user))
                || serde_json::to_value(record.decision.kind).map_err(|_| internal())?
                    != serde_json::to_value(action).map_err(|_| internal())?
            {
                return Err(internal());
            }
            audit.insert(item.id.to_string(), record);
        }
        Ok(Self { ledger, audit })
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct RecordingEnvelope {
    recording_version: u32,
    recording: Recording,
}

#[derive(Deserialize)]
#[serde(untagged)]
enum StoredRecording {
    Batch(RecordingEnvelope),
    Original(IngestedMessage),
}

type MessageKey = (String, String);

pub(super) struct ReadMessages {
    batches: BTreeMap<MessageKey, Option<RecordedMessage>>,
    originals: BTreeMap<String, IngestedMessage>,
}

impl ReadMessages {
    pub fn load(store: &Store) -> Result<Self, ErrorEnvelope> {
        let mut result = Self {
            batches: BTreeMap::new(),
            originals: BTreeMap::new(),
        };
        // Reads use the same retention predicate without running a write/reaper.
        let cutoff = store
            .preview(
                cc_store::Purge::ExpiredRecordings,
                cc_store::Timestamp::now(),
            )
            .map_err(|_| internal())?
            .cutoff
            .ok_or_else(internal)?;
        for item in store.items(DataStore::Recordings).map_err(|_| internal())? {
            if item.at < cutoff {
                continue;
            }
            let recording: StoredRecording =
                serde_json::from_str(&item.content).map_err(|_| internal())?;
            match recording {
                StoredRecording::Batch(envelope) => {
                    if envelope.recording_version != 1 {
                        return Err(internal());
                    }
                    for message in envelope.recording.messages {
                        let user = String::from(message.user_id.clone());
                        if !item.user_ids.iter().any(|id| id.as_str() == user) {
                            return Err(internal());
                        }
                        let key = (message.message_id.as_str().to_owned(), user);
                        // Imports may repeat an ID with different text. Ambiguity
                        // must never let imported text masquerade as live chat.
                        result
                            .batches
                            .entry(key)
                            .and_modify(|existing| {
                                if existing.as_ref() != Some(&message) {
                                    *existing = None;
                                }
                            })
                            .or_insert(Some(message));
                    }
                }
                StoredRecording::Original(message) => {
                    if !item.user_ids.contains(&message.user_id)
                        || item.simulated != message.simulated
                    {
                        return Err(internal());
                    }
                    result.originals.insert(item.id.to_string(), message);
                }
            }
        }
        Ok(result)
    }

    pub fn get(&self, audit: &AuditRecord) -> Option<RecordedMessage> {
        let user = audit.user_id.as_ref()?;
        if let Some(original) = self.originals.get(audit.decision.decision_id.as_str()) {
            if original.message_id != audit.decision.message_id
                || &original.user_id != user
                || original.simulated != audit.simulated
            {
                return None;
            }
            return Some(RecordedMessage {
                message_id: original.message_id.clone(),
                user_id: user.as_str().to_owned().try_into().ok()?,
                at: original.at.clone(),
                text: original.text.clone(),
            });
        }
        self.batches
            .get(&(
                audit.decision.message_id.as_str().to_owned(),
                user.as_str().to_owned(),
            ))?
            .clone()
    }
}
