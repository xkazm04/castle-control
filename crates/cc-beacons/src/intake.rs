//! Typed contribution intake. Transport decoding belongs to the contract door.
use cc_types::{Contribution, ContributionSource};
use std::collections::HashSet;

/// Native units; amounts are already normalized integers in the wire contract.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ContributionUnit {
    Bits,
    Count,
    Level,
    Points,
    MinorCurrency,
}

pub fn unit(source: ContributionSource) -> ContributionUnit {
    use ContributionSource::*;
    match source {
        Cheer | BitsUse => ContributionUnit::Bits,
        Subscribe | Gift | Resub | PowerUp => ContributionUnit::Count,
        HypeTrain => ContributionUnit::Level,
        ChannelPoints => ContributionUnit::Points,
        Charity | Goal => ContributionUnit::MinorCurrency,
    }
}

fn canonical(source: ContributionSource) -> ContributionSource {
    match source {
        ContributionSource::BitsUse => ContributionSource::Cheer,
        other => other,
    }
}

/// An accepted contribution cannot be constructed without passing intake.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NormalizedContribution {
    source: ContributionSource,
    amount: u32,
}
impl NormalizedContribution {
    pub fn source(&self) -> ContributionSource {
        self.source
    }

    pub fn amount(&self) -> u32 {
        self.amount
    }

    pub fn unit(&self) -> ContributionUnit {
        unit(self.source)
    }
}

/// Deduplication lasts for the lifetime of this intake. Start a fresh intake for
/// a new accounting session, never evict keys during one (replays can be late).
/// The adapter must supply the same underlying identity for overlapping topics;
/// neither event_id, a viewer ID nor (source, amount) identifies a contribution.
#[derive(Debug, Default)]
pub struct Intake {
    seen: HashSet<(String, String)>,
}
impl Intake {
    pub fn accept(
        &mut self,
        input: &Contribution,
    ) -> Result<Option<NormalizedContribution>, &'static str> {
        if input.dedupe_key.trim().is_empty() {
            return Err("expected nonblank underlying contribution identity");
        }
        if !self.seen.insert((
            input.broadcaster_id.clone().into(),
            input.dedupe_key.clone(),
        )) {
            return Ok(None);
        }
        Ok(Some(NormalizedContribution {
            source: canonical(input.source),
            amount: input.amount,
        }))
    }
}

/// Internal source routing, deliberately separate from the wire Visual schema.
/// Positive integer weights operate only within one native unit. Selecting cheer
/// also selects bits_use; selecting both is rejected rather than double weighted.
/// Monetary inputs require upstream currency partitioning: Contribution has no
/// currency field, so this layer cannot convert or identify different currencies.
#[derive(Debug, Clone)]
pub struct InputSelection {
    sources: Vec<(ContributionSource, u32)>,
}
impl InputSelection {
    pub fn new(sources: Vec<(ContributionSource, u32)>) -> Result<Self, &'static str> {
        let Some((first, _)) = sources.first() else {
            return Err("expected at least one selected source");
        };
        let expected = unit(*first);
        let mut selected = Vec::with_capacity(sources.len());
        for (source, weight) in sources {
            let source = canonical(source);
            if weight == 0 {
                return Err("expected positive source weight");
            }
            if unit(source) != expected {
                return Err("cannot aggregate incompatible contribution units");
            }
            if selected.iter().any(|(existing, _)| *existing == source) {
                return Err("duplicate selected source (including overlapping Bits topics)");
            }
            selected.push((source, weight));
        }
        Ok(Self { sources: selected })
    }

    pub(crate) fn weighted_amount(&self, source: ContributionSource, amount: u32) -> Option<f64> {
        let source = canonical(source);
        self.sources
            .iter()
            .find(|(selected, _)| *selected == source)
            .map(|(_, weight)| f64::from(amount) * f64::from(*weight))
    }
}
