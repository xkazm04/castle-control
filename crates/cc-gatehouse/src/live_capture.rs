//! Additive capture evidence in existing viewer-associated Caches/Recordings.
//! The decision ledger remains the commit marker; no old row is rewritten.
use crate::{
    Classifier, Gatehouse, IngestedMessage, Result, ScreenedMessage, error, instrument, internal,
    recorder::Recorder,
};
use cc_store::{DataStore, LedgerEvent, LedgerKind, Store};
use cc_types::{
    BridgeGap, DecisionId, DrillConfiguration, ErrorCode, GatehouseLiveCapture,
    GatehouseLiveRunGapReason, GatehouseText, RuleClass,
};
use std::collections::{BTreeMap, BTreeSet};

/// Clear the transient capture even when screening is cancelled at an await.
struct CaptureScope<'a>(&'a mut Gatehouse);
impl Drop for CaptureScope<'_> {
    fn drop(&mut self) {
        self.0.live_capture = None;
    }
}

/// A missing recording retains its decision-keyed gap, never its expired content.
pub struct RetainedCapture {
    pub capture: GatehouseLiveCapture,
    pub simulated: bool,
    pub recording_available: bool,
    pub message_id: cc_types::MessageId,
    pub user_ids: Vec<cc_store::TwitchUserId>,
}

pub fn captures(store: &Store) -> Result<BTreeMap<DecisionId, RetainedCapture>> {
    let cutoff = store
        .preview(
            cc_store::Purge::ExpiredRecordings,
            cc_store::Timestamp::now(),
        )
        .map_err(internal)?
        .cutoff
        .ok_or_else(|| internal("missing cutoff"))?;
    let recordings: BTreeMap<_, _> = store
        .items(DataStore::Recordings)
        .map_err(internal)?
        .into_iter()
        .map(|item| (item.id, item))
        .collect();
    let mut result = BTreeMap::new();
    let committed: std::collections::BTreeSet<_> = store
        .read_ledger(LedgerKind::Decisions)
        .map_err(internal)?
        .into_iter()
        .filter_map(|line| match line.event {
            LedgerEvent::Decision { decision_id, .. } => Some(decision_id),
            _ => None,
        })
        .collect();
    for item in store.items(DataStore::Caches).map_err(internal)? {
        if !committed.contains(&item.id) {
            continue;
        }
        let record: crate::store::Record = serde_json::from_str(&item.content).map_err(internal)?;
        let Some(capture) = record.live_capture else {
            continue;
        };
        if record.decision_id.as_str() != item.id.to_string()
            || record.simulated != item.simulated
            || record
                .user_id
                .as_ref()
                .is_none_or(|id| !item.user_ids.contains(id))
        {
            return Err(internal("capture association mismatch"));
        }
        validate_snapshot(&capture)?;
        let available = recordings
            .get(&reference_id(&capture.recording)?)
            .is_some_and(|recording| {
                recording.at >= cutoff
                    && recording.user_ids == item.user_ids
                    && recording.simulated == item.simulated
            });
        if result
            .insert(
                record.decision_id,
                RetainedCapture {
                    capture,
                    simulated: item.simulated,
                    recording_available: available,
                    message_id: record.message_id,
                    user_ids: item.user_ids,
                },
            )
            .is_some()
        {
            return Err(internal("duplicate decision capture"));
        }
    }
    Ok(result)
}

fn reference_id(reference: &GatehouseText) -> Result<ulid::Ulid> {
    let reference = String::from(reference.clone());
    reference
        .strip_prefix("recording-")
        .and_then(|id| id.parse::<ulid::Ulid>().ok())
        .filter(|id| format!("recording-{id}") == reference)
        .ok_or_else(|| internal("invalid capture reference"))
}

fn validate_snapshot(capture: &GatehouseLiveCapture) -> Result<()> {
    let parts = &capture.instrument;
    if instrument::hash(&capture.configuration.rules)? != parts.rules_hash
        || instrument::hash(&capture.inputs.bank)? != parts.bank_hash
        || instrument::hash(&capture.inputs.judge)? != parts.judge_hash
        || instrument::hash(&capture.inputs.prompts)? != parts.prompts_hash
        || instrument::hash(parts)? != capture.instrument_hash
        || capture.inputs.bank.label != capture.configuration.bank
        || capture.inputs.prompts.prompts != capture.configuration.prompts
        || String::from(capture.configuration.judge.clone()) != "rules-only"
        || crate::date(&capture.from)? > crate::date(&capture.to)?
    {
        return Err(error(
            ErrorCode::Conflict,
            "capture instrument integrity mismatch",
        ));
    }
    Ok(())
}

impl Gatehouse {
    /// Rebuild at each screening boundary so forget/purge remain authoritative.
    pub(crate) fn care_users(&self) -> Result<BTreeSet<String>> {
        Ok(self
            .records()?
            .into_iter()
            .filter(|r| r.care)
            .filter_map(|r| r.user_id)
            .map(|id| id.as_str().to_owned())
            .collect())
    }

    /// Same seam used by the live host and generated, labelled offline tests.
    /// Snapshot before screening; the existing audit chokepoint writes it before
    /// the ledger commits. No separate cache row or post-commit update is needed.
    pub async fn capture_live_shadow(
        &mut self,
        message: IngestedMessage,
        classifier: &dyn Classifier,
        gaps: Vec<BridgeGap>,
    ) -> Result<ScreenedMessage> {
        self.require_shadow();
        self.reap_live_recordings()?;
        let care = self.care_users()?;
        let configuration = DrillConfiguration {
            rules: self
                .config
                .values()
                .map(|managed| managed.rule.clone())
                .collect(),
            bank: "simulated-near-misses-v1"
                .to_owned()
                .try_into()
                .map_err(internal)?,
            judge: "rules-only".to_owned().try_into().map_err(internal)?,
            prompts: Vec::new(),
        };
        // Context the existing recording/drill schema cannot reproduce is explicit.
        let replay_gap = if configuration
            .rules
            .iter()
            .any(|rule| rule.rule_class == RuleClass::Classifier)
        {
            Some(GatehouseLiveRunGapReason::ClassifierNotReplayable)
        } else if message.privileged()
            || care.contains(message.user_id.as_str())
            || !self.gate_available
            || message.text.trim().is_empty()
            || configuration.rules.iter().any(|rule| {
                rule.strikes.is_some()
                    || (rule.rule_class != RuleClass::Rail
                        && rule.mode == cc_types::RuleMode::Armed)
            })
        {
            Some(GatehouseLiveRunGapReason::RuntimeContextNotReplayable)
        } else if !gaps.is_empty() {
            Some(GatehouseLiveRunGapReason::BridgeGap)
        } else {
            None
        };
        let (configuration, instrument, instrument_hash, inputs) =
            self.analysis.drill.snapshot(configuration)?;
        let recording = Recorder::for_import(&mut self.store, self.clock.as_ref())?
            .record_shadow(&message, gaps.clone())?;
        let capture = GatehouseLiveCapture {
            recording: recording.recording,
            from: message.at.clone(),
            to: message.at.clone(),
            configuration,
            instrument,
            instrument_hash,
            inputs,
            gaps,
            replay_gap,
        };
        let scope = CaptureScope(self);
        scope.0.live_capture = Some(capture);
        let mut screened = scope
            .0
            .screen_batch_with_care(
                vec![message],
                classifier,
                crate::gate::HoldBudget::default(),
                care,
            )
            .await?
            .messages;
        let screened = screened
            .pop()
            .ok_or_else(|| internal("no screened message"))?;
        Ok(screened)
    }

    /// No caller hash exists. Resolve authoritative capture evidence by recording
    /// reference, and compare a freshly resolved replay instrument with that hash.
    /// Legacy imported recordings preserve their existing drill behavior.
    pub(crate) fn check_capture_instrument(
        &self,
        recording: &GatehouseText,
        source: &GatehouseText,
        configuration: &DrillConfiguration,
    ) -> Result<()> {
        let captures = captures(&self.store)?;
        let Some(retained) = captures
            .values()
            .find(|entry| &entry.capture.recording == recording)
        else {
            if matches!(
                String::from(source.clone()).as_str(),
                "live-shadow" | "simulated-live-shadow"
            ) {
                return Err(error(
                    ErrorCode::Unavailable,
                    "live recording has no retained capture instrument",
                ));
            }
            return Ok(());
        };
        if !retained.recording_available || retained.capture.replay_gap.is_some() {
            return Err(error(
                ErrorCode::Unavailable,
                "capture has a recording or replay coverage gap",
            ));
        }
        let (_, parts, hash, inputs) = self.analysis.drill.snapshot(configuration.clone())?;
        if hash != retained.capture.instrument_hash
            || parts != retained.capture.instrument
            || inputs != retained.capture.inputs
        {
            return Err(error(
                ErrorCode::Conflict,
                "replay instrument differs from stored capture",
            ));
        }
        Ok(())
    }
}
