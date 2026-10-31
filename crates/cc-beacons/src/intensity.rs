//! Deterministic per-visual totals, decay and piecewise-linear interpolation.
use crate::intake::{InputSelection, Intake};
use cc_types::{
    BeaconsIntensity, BeaconsSimulateResult, Contribution, Intensity, IntensityCurve,
    IntensityDecay, SimulatedBurst, SimulationLabel, TwitchUserId, Visual,
};
use std::time::Duration;

/// Monotonic elapsed time supplied by the host. Logic never reads system time.
pub trait Clock {
    fn now(&self) -> Duration;
}

pub fn validate_curve(curve: &IntensityCurve) -> Result<(), &'static str> {
    if curve.ranges.is_empty() {
        return Err("expected at least one intensity range");
    }
    if curve
        .ranges
        .windows(2)
        .any(|pair| pair[0].total >= pair[1].total)
    {
        return Err("range totals must be strictly increasing and distinct");
    }
    Ok(())
}

pub(crate) fn interpolate(curve: &IntensityCurve, total: f64) -> Result<Intensity, &'static str> {
    // All callers validate once at their configuration boundary.
    let first = curve.ranges.first().ok_or("expected intensity range")?;
    let mut previous = first;
    if total <= f64::from(first.total) {
        return Ok(first.intensity.clone());
    }
    for next in curve.ranges.iter().skip(1) {
        if total <= f64::from(next.total) {
            let fraction =
                (total - f64::from(previous.total)) / f64::from(next.total - previous.total);
            let lower = f64::from(previous.intensity.clone());
            let upper = f64::from(next.intensity.clone());
            return Intensity::try_from((lower + fraction * (upper - lower)).clamp(0.0, 1.0));
        }
        previous = next;
    }
    Ok(previous.intensity.clone())
}

// One decay calculation for live totals and isolated preview sessions.
pub(crate) fn decayed_at(
    total: f64,
    updated_at: Duration,
    now: Duration,
    decay: &IntensityDecay,
) -> Result<f64, &'static str> {
    let elapsed = now.checked_sub(updated_at).ok_or("clock moved backwards")?;
    Ok(match decay {
        IntensityDecay::None {} => total,
        IntensityDecay::Exponential { half_life_s } => {
            total * 2.0_f64.powf(-elapsed.as_secs_f64() / f64::from(half_life_s.get()))
        }
    })
}

/// One broadcaster and visual per engine. Decay applies to the running weighted
/// total before interpolation; totals above the last range remain accumulated.
/// Configuration is immutable so validation cannot be bypassed after creation.
pub struct IntensityEngine<C> {
    visual: Visual,
    broadcaster_id: TwitchUserId,
    inputs: InputSelection,
    intake: Intake,
    clock: C,
    total: f64,
    updated_at: Duration,
}
impl<C: Clock> IntensityEngine<C> {
    pub fn new(
        visual: Visual,
        broadcaster_id: TwitchUserId,
        inputs: InputSelection,
        clock: C,
    ) -> Result<Self, &'static str> {
        validate_curve(&visual.curve)?;
        let updated_at = clock.now();
        Ok(Self {
            visual,
            broadcaster_id,
            inputs,
            intake: Intake::default(),
            clock,
            total: 0.0,
            updated_at,
        })
    }

    fn decayed_at(&self, now: Duration) -> Result<f64, &'static str> {
        decayed_at(self.total, self.updated_at, now, &self.visual.curve.decay)
    }

    pub fn contribute(&mut self, input: &Contribution) -> Result<BeaconsIntensity, &'static str> {
        if input.broadcaster_id != self.broadcaster_id {
            return Err("contribution belongs to another broadcaster");
        }
        let now = self.clock.now();
        let mut total = self.decayed_at(now)?;
        if let Some(amount) = self.inputs.weighted_amount(input.source, input.amount) {
            if !(total + amount).is_finite() {
                return Err("contribution total overflow");
            }
            if self.intake.accept(input)?.is_some() {
                total += amount;
            }
        }
        let result = self.result(total)?;
        self.total = total;
        self.updated_at = now;
        Ok(result)
    }

    /// Reads decay without consuming contributions or mutating dedupe state.
    pub fn snapshot(&mut self) -> Result<BeaconsIntensity, &'static str> {
        let now = self.clock.now();
        let total = self.decayed_at(now)?;
        let result = self.result(total)?;
        self.total = total;
        self.updated_at = now;
        Ok(result)
    }

    fn result(&self, total: f64) -> Result<BeaconsIntensity, &'static str> {
        Ok(BeaconsIntensity {
            visual_id: self.visual.visual_id.clone(),
            intensity: interpolate(&self.visual.curve, total)?,
        })
    }
}

/// Isolated preview from an empty total, immediately after a synthetic burst.
/// No clock, Twitch identities, live ledger, dedupe keys or live engine mutation.
pub fn simulate(
    visual: &Visual,
    inputs: &InputSelection,
    burst: &SimulatedBurst,
) -> Result<BeaconsSimulateResult, &'static str> {
    validate_curve(&visual.curve)?;
    let total = inputs
        .weighted_amount(burst.source, burst.amount)
        .ok_or("simulation source is not selected for this visual")?;
    Ok(BeaconsSimulateResult {
        label: SimulationLabel::Simulated,
        intensity: BeaconsIntensity {
            visual_id: visual.visual_id.clone(),
            intensity: interpolate(&visual.curve, total)?,
        },
    })
}
