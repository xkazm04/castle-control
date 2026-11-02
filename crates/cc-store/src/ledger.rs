use crate::{
    DrawRiskSetting, DrawSlug, EngineClass, EngineProvider, Error, ImageProvider, ModelName,
    Result, SealDigest, Store, Timestamp, TwitchUserId,
};
use cc_types::{ArtCallId, ArtCredits};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeMap,
    fs::{self, File, OpenOptions},
    io::{BufRead, BufReader, Write},
    path::Path,
    time::SystemTime,
};
use ulid::Ulid;

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub enum LedgerKind {
    Decisions,
    Draws,
    Engine,
}

impl LedgerKind {
    pub const ALL: [Self; 3] = [Self::Decisions, Self::Draws, Self::Engine];
    pub const fn filename(self) -> &'static str {
        match self {
            Self::Decisions => "decisions.jsonl",
            Self::Draws => "draws.jsonl",
            Self::Engine => "engine.jsonl",
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DecisionAction {
    Held,
    Released,
    Removed,
    Warned,
    TimedOut,
    Banned,
    BanPending,
    ModeChanged,
    Undone,
    WouldAct,
}

/// The provider's exact charge, without conversion between credits and dollars.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ImageProviderAmount {
    Credits(ArtCredits),
    MicroUsd(u64),
}

/// No free-form text is accepted by audit schemas. Viewer references are numeric IDs.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum LedgerEvent {
    Decision {
        decision_id: Ulid,
        #[serde(
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "optional_user_id"
        )]
        user_id: Option<TwitchUserId>,
        action: DecisionAction,
    },
    Draw {
        draw_run_id: Ulid,
        winner_user_ids: Vec<TwitchUserId>,
    },
    /// Proof-core seal metadata, durably written before a cast is possible.
    DrawSealed {
        draw_run_id: Ulid,
        draw_id: DrawSlug,
        seal_digest: SealDigest,
        entry_count: u32,
        winner_count: u32,
    },
    /// Store-internal acknowledgement for a configured draw, before a run exists.
    /// The enclosing line's event_at is the acknowledgement time; no reason text.
    DrawRiskAcknowledged {
        draw_id: DrawSlug,
        setting: DrawRiskSetting,
    },
    /// Store-internal engine audit metadata; model_served is absent without an answer.
    /// Schema version stays 1: no ledger has been written outside tests yet.
    Engine {
        call_id: Ulid,
        cost_microusd: u64,
        class: EngineClass,
        provider: EngineProvider,
        model_selected: ModelName,
        #[serde(
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "optional_model_name"
        )]
        model_served: Option<ModelName>,
    },
    /// One exact provider charge, with optional independently known legacy cost.
    ImageProviderCost {
        provider: ImageProvider,
        #[serde(flatten)]
        amount: ImageProviderAmount,
        #[serde(
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "optional_cost_microusd"
        )]
        cost_microusd: Option<u64>,
        call_id: ArtCallId,
    },
}

fn optional_cost_microusd<'de, D: serde::Deserializer<'de>>(
    deserializer: D,
) -> std::result::Result<Option<u64>, D::Error> {
    u64::deserialize(deserializer).map(Some)
}

// Missing means absent. An explicit null is a schema error.
fn optional_user_id<'de, D: serde::Deserializer<'de>>(
    deserializer: D,
) -> std::result::Result<Option<TwitchUserId>, D::Error> {
    TwitchUserId::deserialize(deserializer).map(Some)
}

// As with optional_user_id, omit an absent value and reject an explicit null.
fn optional_model_name<'de, D: serde::Deserializer<'de>>(
    deserializer: D,
) -> std::result::Result<Option<ModelName>, D::Error> {
    ModelName::deserialize(deserializer).map(Some)
}

impl LedgerEvent {
    pub const fn ledger_kind(&self) -> LedgerKind {
        match self {
            Self::Decision { .. } => LedgerKind::Decisions,
            Self::Draw { .. } | Self::DrawSealed { .. } | Self::DrawRiskAcknowledged { .. } => {
                LedgerKind::Draws
            }
            Self::Engine { .. } | Self::ImageProviderCost { .. } => LedgerKind::Engine,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct LedgerLine {
    pub digest: String,
    pub event_at: Timestamp,
    pub event: LedgerEvent,
    pub recorded_at: Timestamp,
    pub schema_version: u8,
}

// Canonical profile: recursively sorted keys, compact UTF-8 JSON, integers only.
// Explicit recursion keeps ordering stable even with serde_json's preserve_order feature.
pub(crate) fn canonical<T: Serialize>(value: &T) -> Result<Vec<u8>> {
    fn write(value: &serde_json::Value, output: &mut Vec<u8>) -> Result<()> {
        match value {
            serde_json::Value::Object(map) => {
                output.push(b'{');
                let ordered: BTreeMap<_, _> = map.iter().collect();
                for (i, (key, value)) in ordered.into_iter().enumerate() {
                    if i != 0 {
                        output.push(b',');
                    }
                    serde_json::to_writer(&mut *output, key)?;
                    output.push(b':');
                    write(value, output)?;
                }
                output.push(b'}');
            }
            serde_json::Value::Array(values) => {
                output.push(b'[');
                for (i, value) in values.iter().enumerate() {
                    if i != 0 {
                        output.push(b',');
                    }
                    write(value, output)?;
                }
                output.push(b']');
            }
            value => serde_json::to_writer(output, value)?,
        }
        Ok(())
    }
    let mut output = Vec::new();
    write(&serde_json::to_value(value)?, &mut output)?;
    Ok(output)
}

impl LedgerLine {
    fn computed_digest(&self) -> Result<String> {
        #[derive(Serialize)]
        struct Unsigned<'a> {
            event_at: &'a Timestamp,
            event: &'a LedgerEvent,
            recorded_at: &'a Timestamp,
            schema_version: u8,
        }
        let bytes = canonical(&Unsigned {
            event_at: &self.event_at,
            event: &self.event,
            recorded_at: &self.recorded_at,
            schema_version: self.schema_version,
        })?;
        Ok(format!("{:x}", Sha256::digest(bytes)))
    }
}

pub(crate) fn read_file(path: &Path, kind: LedgerKind) -> Result<Vec<LedgerLine>> {
    let mut reader = BufReader::new(File::open(path)?);
    let mut records = Vec::new();
    loop {
        let mut bytes = Vec::new();
        if reader.read_until(b'\n', &mut bytes)? == 0 {
            break;
        }
        if bytes.pop() != Some(b'\n') {
            return Err(Error::LedgerIntegrity);
        }
        let line: LedgerLine = serde_json::from_slice(&bytes)?;
        if line.schema_version != 1
            || line.event.ledger_kind() != kind
            || line.digest != line.computed_digest()?
            || bytes != canonical(&line)?
        {
            return Err(Error::LedgerIntegrity);
        }
        records.push(line);
    }
    Ok(records)
}

// Erasure must remain possible with a corrupt ledger. Count frames, including
// an incomplete tail, without making a successful integrity check a prerequisite.
pub(crate) fn count_frames(path: &Path) -> Result<u64> {
    let reader = BufReader::new(File::open(path)?);
    let mut count = 0;
    for frame in reader.split(b'\n') {
        frame?;
        count += 1;
    }
    Ok(count)
}

/// A fully verified ledger, valid only while the file still has this exact length and mtime.
pub(crate) struct CachedLedger {
    len: u64,
    mtime: SystemTime,
    lines: Vec<LedgerLine>,
}

/// Work done by `read_ledger` since the store opened. Counters only, no ledger content.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct LedgerReadStats {
    pub full_verifications: u64,
    pub lines_verified: u64,
    pub bytes_read: u64,
    pub cache_hits: u64,
}

impl Store {
    pub fn ledger_read_stats(&self) -> LedgerReadStats {
        self.ledger_stats.get()
    }

    fn bump_stats(&self, change: impl FnOnce(&mut LedgerReadStats)) {
        let mut stats = self.ledger_stats.get();
        change(&mut stats);
        self.ledger_stats.set(stats);
    }

    /// Verified lines are reused only if length, mtime and the store's own expected length all
    /// match; any doubt (different handle, truncation, erasure, no mtime) re-verifies in full.
    pub fn read_ledger(&self, kind: LedgerKind) -> Result<Vec<LedgerLine>> {
        self.ready()?;
        let path = self.root.join(kind.filename());
        let stat = fs::metadata(&path).and_then(|m| Ok((m.len(), m.modified()?)));
        if let Ok((len, mtime)) = &stat
            && self.ledger_lengths.get(&kind) == Some(len)
            && let Some(cached) = self.ledger_cache.borrow().get(&kind)
            && cached.len == *len
            && cached.mtime == *mtime
        {
            self.bump_stats(|s| s.cache_hits += 1);
            return Ok(cached.lines.clone());
        }
        self.ledger_cache.borrow_mut().remove(&kind);
        let result = read_file(&path, kind);
        match &result {
            Err(_) => self.ledger_fault.set(true),
            Ok(lines) => {
                self.bump_stats(|s| {
                    s.full_verifications += 1;
                    s.lines_verified += lines.len() as u64;
                    s.bytes_read += stat.as_ref().map_or(0, |(len, _)| *len);
                });
                // Stat taken before the read: a concurrent change makes the next stat differ.
                if let Ok((len, mtime)) = stat {
                    let lines = lines.clone();
                    self.ledger_cache
                        .borrow_mut()
                        .insert(kind, CachedLedger { len, mtime, lines });
                }
            }
        }
        result
    }

    pub fn append_ledger(
        &mut self,
        event_at: Timestamp,
        recorded_at: Timestamp,
        event: LedgerEvent,
    ) -> Result<LedgerLine> {
        self.ready()?;
        let kind = event.ledger_kind();
        let mut line = LedgerLine {
            digest: String::new(),
            event_at,
            event,
            recorded_at,
            schema_version: 1,
        };
        line.digest = line.computed_digest()?;
        let mut bytes = canonical(&line)?;
        bytes.push(b'\n');
        let mut file = OpenOptions::new()
            .append(true)
            .open(self.root.join(kind.filename()))?;
        let before = file.metadata()?;
        if self.ledger_lengths.get(&kind).copied() != Some(before.len()) {
            self.ledger_fault.set(true);
            return Err(Error::LedgerIntegrity);
        }
        self.ledger_fault.set(true);
        file.write_all(&bytes)?;
        file.sync_all()?;
        let after = file.metadata()?;
        self.ledger_lengths.insert(kind, after.len());
        // Extend the cache only if it described exactly the file we appended to.
        let cache = self.ledger_cache.get_mut();
        match (cache.get_mut(&kind), before.modified(), after.modified()) {
            (Some(cached), Ok(old), Ok(new))
                if cached.len == before.len() && cached.mtime == old =>
            {
                cached.lines.push(line.clone());
                cached.len = after.len();
                cached.mtime = new;
            }
            _ => {
                cache.remove(&kind);
            }
        }
        self.ledger_fault.set(false);
        Ok(line)
    }
}
