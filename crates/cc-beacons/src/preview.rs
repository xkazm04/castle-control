//! Isolated test-fire lifecycle. No contributions, dedupe or ledgers are written.
use crate::{
    intake::InputSelection,
    intensity::{Clock, decayed_at, interpolate, validate_curve},
};
use cc_types::{BeaconsIntensity, IntensityDecay, SimulatedBurst, Visual};
use std::time::Duration;

/// Owner-visible hold for a test fire whose visual has no decay: 30 seconds.
pub const PREVIEW_HOLD_S: u64 = 30;
/// Owner-visible maximum duration of every test fire: 600 seconds (10 minutes).
pub const PREVIEW_MAX_S: u64 = 600;

/// A burst starts empty and decays from its original weighted total. Ended
/// sessions never reactivate, including if the host clock subsequently rewinds.
pub struct PreviewSession<C> {
    visual: Visual,
    clock: C,
    started_at: Duration,
    total: f64,
    ended: bool,
}
impl<C: Clock> PreviewSession<C> {
    pub fn new(
        visual: &Visual,
        inputs: &InputSelection,
        burst: &SimulatedBurst,
        clock: C,
    ) -> Result<Self, &'static str> {
        validate_curve(&visual.curve)?;
        let total = inputs
            .weighted_amount(burst.source, burst.amount)
            .ok_or("simulation source is not selected for this visual")?;
        Ok(Self {
            visual: visual.clone(),
            started_at: clock.now(),
            clock,
            total,
            ended: false,
        })
    }

    /// None at the first observation within 0.005 of the first range's
    /// intensity, at the no-decay hold limit, or at the maximum duration.
    pub fn snapshot(&mut self) -> Result<Option<BeaconsIntensity>, &'static str> {
        if self.ended {
            return Ok(None);
        }
        let now = self.clock.now();
        let elapsed = now
            .checked_sub(self.started_at)
            .ok_or("clock moved backwards")?;
        let curve = &self.visual.curve;
        let total = decayed_at(self.total, self.started_at, now, &curve.decay)?;
        let intensity = interpolate(curve, total)?;
        let floor = curve.ranges.first().ok_or("expected intensity range")?;
        self.ended = elapsed >= Duration::from_secs(PREVIEW_MAX_S)
            || (matches!(curve.decay, IntensityDecay::None {})
                && elapsed >= Duration::from_secs(PREVIEW_HOLD_S))
            || (f64::from(intensity.clone()) - f64::from(floor.intensity.clone())).abs() <= 0.005;
        Ok((!self.ended).then(|| BeaconsIntensity {
            visual_id: self.visual.visual_id.clone(),
            intensity,
        }))
    }
}
