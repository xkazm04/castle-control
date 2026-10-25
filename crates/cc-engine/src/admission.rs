// Adapted from Shadowrunr OS @ 7e4b6f8,
// crates/shadowrunr-engine/src/admission.rs.
use crate::{Failure, Result};
use cc_store::EngineClass;
use std::{sync::Arc, time::Duration};
use tokio::sync::{OwnedSemaphorePermit, Semaphore};

#[derive(Clone, Copy, Debug)]
pub struct LatencySample {
    pub total_ms: u64,
    pub longest_silence_ms: u64,
}
/// Instrument designed 2026-10-25; not a claim about any installed model.
/// No samples means unavailable. Failed capability-floor cases count.
#[derive(Clone, Debug)]
pub struct Evidence {
    pub samples: usize,
    pub p95_ms: u64,
    pub longest_silence_ms: u64,
    pub structured_correct: usize,
    pub structured_total: usize,
    pub(crate) identity: Option<(crate::ModelName, String)>,
    pub(crate) served_model: Option<crate::ModelName>,
}
impl Evidence {
    pub fn measure(samples: &[LatencySample], correct: usize, total: usize) -> Result<Self> {
        if samples.is_empty() || total == 0 || correct > total || samples.len() != total {
            return Err(Failure::Invalid);
        }
        let mut sorted: Vec<_> = samples.iter().map(|s| s.total_ms).collect();
        sorted.sort_unstable();
        Ok(Self {
            samples: samples.len(),
            p95_ms: sorted[(samples.len() * 95).div_ceil(100) - 1],
            longest_silence_ms: samples
                .iter()
                .map(|s| s.longest_silence_ms)
                .max()
                .unwrap_or(0),
            structured_correct: correct,
            structured_total: total,
            identity: None,
            served_model: None,
        })
    }
    pub fn admits(&self, class: EngineClass) -> bool {
        let budget = budget(class);
        self.samples >= 6
            && self.structured_total == self.samples
            && self.structured_correct == self.structured_total
            && self.p95_ms <= budget.total_ms
            && self.longest_silence_ms <= budget.silence_ms
    }
    pub(crate) fn matches(&self, model: &crate::ModelName, endpoint: &str) -> bool {
        self.identity
            .as_ref()
            .is_some_and(|(measured, url)| measured == model && url == endpoint)
    }
}
pub(crate) struct Budget {
    pub total_ms: u64,
    pub silence_ms: u64,
}
pub(crate) fn budget(class: EngineClass) -> Budget {
    // Provisional ceilings from Part 1's 0.3–2 s live budget.
    let (total_ms, silence_ms) = match class {
        EngineClass::Live => (2_000, 1_500),
        EngineClass::NearLive => (5_000, 3_000),
        EngineClass::Batch => (120_000, 30_000),
        EngineClass::Offline => (300_000, 60_000),
    };
    Budget {
        total_ms,
        silence_ms,
    }
}
#[derive(Clone)]
pub(crate) struct Admission(Arc<Semaphore>);
impl Admission {
    pub fn new(max_processes: usize) -> Result<Self> {
        if max_processes == 0 {
            return Err(Failure::Invalid);
        }
        Ok(Self(Arc::new(Semaphore::new(max_processes))))
    }
    pub async fn enter(&self, class: EngineClass, wait: Duration) -> Result<OwnedSemaphorePermit> {
        if crate::model::live(class) {
            return Err(Failure::CliOnLive);
        }
        tokio::time::timeout(wait, self.0.clone().acquire_owned())
            .await
            .map_err(|_| Failure::Timeout)?
            .map_err(|_| Failure::Unavailable)
    }
}
