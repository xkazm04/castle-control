//! Immutable recording batches in the existing erasure/retention inventory.
use crate::{Gatehouse, IngestedMessage, Result, date, error, internal, sha256};
use cc_store::{Clock, DataStore, Store, StoredItem, TwitchUserId};
use cc_types::{
    BridgeGap, ErrorCode, GatehouseText, RecordedMessage, RecordingImportParams,
    RecordingImportResult, Timestamp,
};
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;

/// Inert, resolved recording. No caller-supplied path is ever opened.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Recording {
    pub source: GatehouseText,
    pub messages: Vec<RecordedMessage>,
    pub gaps: Vec<BridgeGap>,
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Envelope {
    recording_version: u32,
    recording: Recording,
}

/// Borrows the sole store writer; never opens a competing connection.
pub struct Recorder<'a> {
    store: &'a mut Store,
    clock: &'a dyn Clock,
    owner: Option<TwitchUserId>,
    installed_at: Timestamp,
}

impl Gatehouse {
    pub fn recorder(&mut self, owner: TwitchUserId, installed_at: Timestamp) -> Recorder<'_> {
        Recorder {
            store: &mut self.store,
            clock: self.clock.as_ref(),
            owner: Some(owner),
            installed_at,
        }
    }
}

impl<'a> Recorder<'a> {
    /// The shadow host has already authenticated intake. Keep its original
    /// simulated flag and erasure associations; imports cannot mint this evidence.
    pub(crate) fn record_shadow(
        &mut self,
        message: &IngestedMessage,
        gaps: Vec<BridgeGap>,
    ) -> Result<RecordingImportResult> {
        self.save(
            RecordingImportParams {
                source: (if message.simulated {
                    "simulated-live-shadow"
                } else {
                    "live-shadow"
                })
                .to_owned()
                .try_into()
                .map_err(internal)?,
                messages: vec![RecordedMessage {
                    message_id: message.message_id.clone(),
                    user_id: message
                        .user_id
                        .as_str()
                        .to_owned()
                        .try_into()
                        .map_err(internal)?,
                    at: message.at.clone(),
                    text: message.text.clone(),
                }],
                gaps,
            },
            message.simulated,
            std::slice::from_ref(message),
        )
    }

    /// Offline imports have no authenticated channel owner. Associate only the
    /// recorded viewers with the existing erasure inventory; invent no identity.
    pub(crate) fn for_import(store: &'a mut Store, clock: &'a dyn Clock) -> Result<Self> {
        Ok(Self {
            store,
            clock,
            owner: None,
            installed_at: clock.now().as_rfc3339().try_into().map_err(internal)?,
        })
    }

    /// Capture batches from the authenticated channel adapter. Each batch is an
    /// immutable handle; the host schedules batches, not a second data store.
    pub fn record_live(
        &mut self,
        source: GatehouseText,
        messages: &[IngestedMessage],
        gaps: Vec<BridgeGap>,
    ) -> Result<RecordingImportResult> {
        let installed = date(&self.installed_at)?;
        for message in messages {
            if date(&message.at)? < installed {
                return Err(error(
                    ErrorCode::Invalid,
                    "live recording predates installation",
                ));
            }
        }
        for gap in &gaps {
            if date(&gap.from)? < installed {
                return Err(error(ErrorCode::Invalid, "live gap predates installation"));
            }
        }
        let params = RecordingImportParams {
            source,
            messages: messages
                .iter()
                .map(|m| {
                    Ok(RecordedMessage {
                        message_id: m.message_id.clone(),
                        user_id: m.user_id.as_str().to_owned().try_into().map_err(internal)?,
                        at: m.at.clone(),
                        text: m.text.clone(),
                    })
                })
                .collect::<Result<_>>()?,
            gaps,
        };
        self.save(
            params,
            !messages.is_empty() && messages.iter().all(|m| m.simulated),
            messages,
        )
    }

    /// Imported content supplies neither authority nor executable locations.
    /// The store's simulated flag is conservative: imports are not asserted fake.
    pub fn import(&mut self, params: RecordingImportParams) -> Result<RecordingImportResult> {
        self.save(params, false, &[])
    }

    fn save(
        &mut self,
        params: RecordingImportParams,
        simulated: bool,
        live: &[IngestedMessage],
    ) -> Result<RecordingImportResult> {
        let params: RecordingImportParams =
            serde_json::from_value(serde_json::to_value(params).map_err(internal)?)
                .map_err(|_| error(ErrorCode::Invalid, "invalid recording"))?;
        validate(&params.messages, &params.gaps)?;
        let now = self.clock.now();
        let now_date = chrono::DateTime::parse_from_rfc3339(&now.as_rfc3339()).map_err(internal)?;
        let mut oldest = now_date;
        for message in &params.messages {
            oldest = oldest.min(date(&message.at)?);
        }
        for gap in &params.gaps {
            oldest = oldest.min(date(&gap.from)?);
        }
        let preview = self
            .store
            .preview(cc_store::Purge::ExpiredRecordings, now)
            .map_err(internal)?;
        let cutoff = preview
            .cutoff
            .ok_or_else(|| internal("retention cutoff missing"))?;
        let cutoff =
            chrono::DateTime::parse_from_rfc3339(&cutoff.as_rfc3339()).map_err(internal)?;
        if oldest < cutoff
            || params
                .messages
                .iter()
                .any(|m| date(&m.at).is_ok_and(|t| t > now_date))
            || params
                .gaps
                .iter()
                .any(|g| date(&g.to).is_ok_and(|t| t > now_date))
        {
            return Err(error(
                ErrorCode::Invalid,
                "recording outside retention or in the future",
            ));
        }
        let mut users: BTreeSet<_> = self.owner.iter().map(|id| id.as_str().to_owned()).collect();
        for message in &params.messages {
            users.insert(String::from(message.user_id.clone()));
        }
        let mut user_ids = Vec::new();
        for message in live {
            self.store
                .map_user(message.user_id.clone(), &message.login)
                .map_err(internal)?;
        }
        // ID-only aliases enable cc-store erasure for logs that contain no login.
        // They reveal no handle and preserve any existing real-login aliases.
        for user in users {
            let id = TwitchUserId::parse(&user)
                .map_err(|_| error(ErrorCode::Invalid, "recording user id unsupported by store"))?;
            let alias = format!("rec_{}", &sha256::digest(user.as_bytes())[..20]);
            if self
                .store
                .lookup_user(&alias)
                .map_err(internal)?
                .is_some_and(|mapped| mapped != id)
            {
                return Err(error(
                    ErrorCode::Conflict,
                    "recording alias already associated",
                ));
            }
            self.store.map_user(id.clone(), &alias).map_err(internal)?;
            user_ids.push(id);
        }
        let id = ulid::Ulid::new();
        let result = RecordingImportResult {
            recording: format!("recording-{id}").try_into().map_err(internal)?,
            source: params.source.clone(),
            message_count: u32::try_from(params.messages.len()).map_err(internal)?,
            gaps: params.gaps.clone(),
        };
        let envelope = Envelope {
            recording_version: 1,
            recording: Recording {
                source: params.source,
                messages: params.messages,
                gaps: params.gaps,
            },
        };
        self.store
            .insert(
                DataStore::Recordings,
                &StoredItem {
                    id,
                    at: cc_store::Timestamp::parse(&oldest.to_rfc3339()).map_err(internal)?,
                    user_ids,
                    content: serde_json::to_string(&envelope).map_err(internal)?,
                    simulated,
                },
            )
            .map_err(internal)?;
        Ok(result)
    }

    pub fn resolve(&self, reference: &GatehouseText) -> Result<Recording> {
        let raw = String::from(reference.clone());
        let id = raw
            .strip_prefix("recording-")
            .and_then(|id| id.parse::<ulid::Ulid>().ok())
            .filter(|id| format!("recording-{id}") == raw)
            .ok_or_else(|| error(ErrorCode::NotFound, "recording not found"))?;
        let item = self
            .store
            .items(DataStore::Recordings)
            .map_err(internal)?
            .into_iter()
            .find(|item| item.id == id)
            .ok_or_else(|| error(ErrorCode::NotFound, "recording erased, expired or missing"))?;
        let now = self.clock.now();
        // Same store policy/predicate as the scheduled reaper, without deleting.
        let preview = self
            .store
            .preview(cc_store::Purge::ExpiredRecordings, now)
            .map_err(internal)?;
        if preview
            .cutoff
            .as_ref()
            .is_some_and(|cutoff| item.at < *cutoff)
        {
            return Err(error(ErrorCode::NotFound, "recording expired"));
        }
        let envelope: Envelope = serde_json::from_str(&item.content).map_err(internal)?;
        if envelope.recording_version != 1 {
            return Err(internal("unsupported recording version"));
        }
        validate(&envelope.recording.messages, &envelope.recording.gaps)?;
        if envelope.recording.messages.iter().any(|message| {
            !item
                .user_ids
                .iter()
                .any(|user| user.as_str() == String::from(message.user_id.clone()))
        }) {
            return Err(internal("recording association mismatch"));
        }
        Ok(envelope.recording)
    }
}

fn validate(messages: &[RecordedMessage], gaps: &[BridgeGap]) -> Result<()> {
    let mut ids = BTreeSet::new();
    let mut previous = None;
    for message in messages {
        let at = date(&message.at)?;
        if !ids.insert(&message.message_id) || previous.is_some_and(|p| p > at) {
            return Err(error(
                ErrorCode::Invalid,
                "duplicate message or unordered recording",
            ));
        }
        previous = Some(at);
    }
    for gap in gaps {
        if date(&gap.from)? > date(&gap.to)? {
            return Err(error(ErrorCode::Invalid, "reversed recording gap"));
        }
    }
    Ok(())
}
