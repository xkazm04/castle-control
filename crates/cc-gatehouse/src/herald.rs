//! Action-free chart: only a released intake token enters; only chart data leaves.
pub use crate::herald_features::HashedWords;
use crate::herald_features::{self, Features};
use crate::{Result, date, error, internal};
use cc_types::{
    ConsensusDelta, ConsensusFilter, ConsensusGetParams, ConsensusGetResult, ConsensusPoint,
    ConsensusShare, ErrorCode, GatehouseText, OpinionDirection, Timestamp,
};
use chrono::{DateTime, FixedOffset, TimeDelta};
use std::{
    collections::{BTreeMap, BTreeSet, VecDeque},
    num::NonZeroU32,
};

/// Implementations must be local and deterministic; no transport is supplied.
pub trait LocalEmbedding: Send + Sync {
    fn embed(&self, text: &str) -> Vec<f64>;
}

#[derive(Clone, Debug)]
pub struct DirectionSeed {
    pub key: GatehouseText,
    pub label: GatehouseText,
    pub keywords: Vec<String>,
}

/// Constructed only at the post-verdict seam, never from raw chat.
pub struct PassedMessage {
    pub(crate) at: Timestamp,
    pub(crate) text: String,
}

struct Entry {
    at: DateTime<FixedOffset>,
    features: Features,
}
#[derive(Default)]
struct Shed {
    all: u32,
    text: u32,
    emotes: u32,
    by_emote: BTreeMap<String, u32>,
}

pub struct Herald {
    seeds: Vec<DirectionSeed>,
    lexicon: BTreeMap<String, String>,
    embedding: Box<dyn LocalEmbedding>,
    started: DateTime<FixedOffset>,
    watermark: DateTime<FixedOffset>,
    max_window_s: NonZeroU32,
    capacity: usize,
    entries: VecDeque<Entry>,
    shed: BTreeMap<DateTime<FixedOffset>, Shed>,
}

impl Herald {
    pub fn new(
        mut seeds: Vec<DirectionSeed>,
        lexicon: BTreeMap<String, String>,
        embedding: Box<dyn LocalEmbedding>,
        max_window_s: NonZeroU32,
        capacity: usize,
        started_at: Timestamp,
    ) -> Result<Self> {
        seeds.sort_by_key(|s| String::from(s.key.clone()));
        let mut keys = BTreeSet::new();
        for seed in &seeds {
            let key = String::from(seed.key.clone());
            if key == "other" || !keys.insert(key) || seed.keywords.is_empty() {
                return Err(error(
                    ErrorCode::Invalid,
                    "duplicate/reserved direction or empty seeds",
                ));
            }
        }
        let mut normalized = BTreeMap::new();
        for (emote, meaning) in lexicon {
            let normalized_emote = emote.to_lowercase();
            if emote.is_empty()
                || emote.chars().any(char::is_whitespace)
                || meaning.trim().is_empty()
                || normalized.insert(normalized_emote, meaning).is_some()
            {
                return Err(error(ErrorCode::Invalid, "invalid or duplicate emote"));
            }
        }
        let started = date(&started_at)?;
        Ok(Self {
            seeds,
            lexicon: normalized,
            embedding,
            started,
            watermark: started,
            max_window_s,
            capacity,
            entries: VecDeque::new(),
            shed: BTreeMap::new(),
        })
    }

    fn advance(&mut self, at: DateTime<FixedOffset>) -> Result<()> {
        if at < self.watermark {
            return Err(error(ErrorCode::Invalid, "chart time must be monotonic"));
        }
        self.watermark = at;
        let maximum = i64::from(self.max_window_s.get());
        // Historical points use the same trailing window; keep their context too.
        let cutoff = at - TimeDelta::seconds((2 * maximum).max(maximum + 180));
        while self.entries.front().is_some_and(|entry| entry.at <= cutoff) {
            self.entries.pop_front();
        }
        self.shed.retain(|time, _| *time > cutoff);
        Ok(())
    }

    pub fn ingest(&mut self, message: PassedMessage) -> Result<()> {
        let at = date(&message.at)?;
        self.advance(at)?;
        let features = herald_features::features(
            &message.text,
            &self.seeds,
            &self.lexicon,
            self.embedding.as_ref(),
        );
        if self.entries.len() < self.capacity {
            self.entries.push_back(Entry { at, features });
        } else {
            let shed = self.shed.entry(at).or_default();
            shed.all = shed.all.saturating_add(1);
            shed.text = shed.text.saturating_add(u32::from(features.text));
            shed.emotes = shed
                .emotes
                .saturating_add(u32::from(!features.emotes.is_empty()));
            for key in features.emotes.keys() {
                let n = shed.by_emote.entry(key.clone()).or_default();
                *n = n.saturating_add(1);
            }
        }
        Ok(())
    }

    fn key(features: &Features, filter: &ConsensusFilter) -> Option<usize> {
        match filter {
            ConsensusFilter::All {} => Some(features.all_key),
            ConsensusFilter::Text {} => features.text.then_some(features.text_key),
            ConsensusFilter::Emotes {} => {
                (!features.emotes.is_empty()).then_some(features.emotes_key)
            }
            ConsensusFilter::Emote { emote } => features
                .emotes
                .get(&String::from(emote.clone()).to_lowercase())
                .copied(),
        }
    }

    fn counts(
        &self,
        at: DateTime<FixedOffset>,
        window: TimeDelta,
        filter: &ConsensusFilter,
    ) -> Vec<u32> {
        let mut counts = vec![0_u32; self.seeds.len() + 1];
        for entry in &self.entries {
            if entry.at > at - window
                && entry.at <= at
                && let Some(key) = Self::key(&entry.features, filter)
            {
                counts[key] = counts[key].saturating_add(1);
            }
        }
        counts
    }

    pub fn get(&mut self, params: ConsensusGetParams, at: Timestamp) -> Result<ConsensusGetResult> {
        if params.window_s > self.max_window_s {
            return Err(error(
                ErrorCode::Invalid,
                "window exceeds chart history budget",
            ));
        }
        let end = date(&at)?;
        self.advance(end)?;
        let window = TimeDelta::seconds(i64::from(params.window_s.get()));
        let start = (end - window).max(self.started);
        let now = self.counts(end, window, &params.filter);
        let baseline = end - TimeDelta::seconds(180);
        let old = (baseline - window >= self.started)
            .then(|| self.counts(baseline, window, &params.filter));
        let mut times = BTreeSet::from([start, end]);
        for entry in &self.entries {
            for time in [entry.at, entry.at + window] {
                if time >= start && time <= end {
                    times.insert(time);
                }
            }
        }
        let samples: Vec<_> = times
            .into_iter()
            .map(|time| (time, self.counts(time, window, &params.filter)))
            .collect();
        let mut directions = Vec::new();
        for key in 0..now.len() {
            if now[key] == 0
                && old.as_ref().is_none_or(|c| c[key] == 0)
                && samples.iter().all(|(_, c)| c[key] == 0)
            {
                continue;
            }
            let (name, label) = self
                .seeds
                .get(key)
                .map(|s| (s.key.clone(), s.label.clone()))
                .unwrap_or_else(|| {
                    (
                        "other".to_owned().try_into().expect("static"),
                        "Other".to_owned().try_into().expect("static"),
                    )
                });
            directions.push(OpinionDirection {
                key: name,
                label,
                messages: now[key],
                share: share(&now, key).try_into().map_err(internal)?,
                delta_3m: old
                    .as_ref()
                    .map(|c| ConsensusDelta::try_from(share(&now, key) - share(c, key)))
                    .transpose()
                    .map_err(internal)?,
                series: samples
                    .iter()
                    .map(|(time, c)| {
                        Ok(ConsensusPoint {
                            at: stamp(*time)?,
                            share: ConsensusShare::try_from(share(c, key)).map_err(internal)?,
                        })
                    })
                    .collect::<Result<_>>()?,
            });
        }
        let mut shed_count = 0_u32;
        for (time, shed) in &self.shed {
            if *time > end - window && *time <= end {
                let count = match &params.filter {
                    ConsensusFilter::All {} => shed.all,
                    ConsensusFilter::Text {} => shed.text,
                    ConsensusFilter::Emotes {} => shed.emotes,
                    ConsensusFilter::Emote { emote } => shed
                        .by_emote
                        .get(&String::from(emote.clone()).to_lowercase())
                        .copied()
                        .unwrap_or(0),
                };
                shed_count = shed_count.saturating_add(count);
            }
        }
        Ok(ConsensusGetResult {
            at,
            window_s: params.window_s,
            filter: params.filter,
            directions,
            shed_count,
        })
    }
}

fn share(counts: &[u32], key: usize) -> f64 {
    let total: u64 = counts.iter().map(|n| u64::from(*n)).sum();
    if total == 0 {
        0.0
    } else {
        f64::from(counts[key]) / total as f64
    }
}
fn stamp(at: DateTime<FixedOffset>) -> Result<Timestamp> {
    at.with_timezone(&chrono::Utc)
        .to_rfc3339_opts(chrono::SecondsFormat::Nanos, true)
        .try_into()
        .map_err(internal)
}
