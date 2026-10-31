//! Live-only curve state. Store retention remains the contribution authority.
use super::{BeaconsModule, State, internal};
use cc_beacons::{
    intake::InputSelection,
    intensity::{Clock, IntensityEngine},
};
use cc_types::{BeaconsIntensity, Contribution, ErrorEnvelope, TwitchUserId, Visual};
use std::{collections::btree_map::Entry, sync::Weak, time::Duration};

pub(super) struct HostClock(tokio::time::Instant);
impl Default for HostClock {
    fn default() -> Self {
        Self(tokio::time::Instant::now())
    }
}
impl Clock for HostClock {
    fn now(&self) -> Duration {
        self.0.elapsed()
    }
}

pub(super) struct LiveEngine {
    broadcaster: TwitchUserId,
    engine: IntensityEngine<HostClock>,
    last: BeaconsIntensity,
}
impl LiveEngine {
    fn new(visual: &Visual, broadcaster: TwitchUserId) -> Result<Self, ErrorEnvelope> {
        let input = visual.input.as_ref().ok_or_else(internal)?;
        let inputs = InputSelection::new(vec![(input.source, 1)]).map_err(|_| internal())?;
        let mut engine = IntensityEngine::new(
            visual.clone(),
            broadcaster.clone(),
            inputs,
            HostClock(tokio::time::Instant::now()),
        )
        .map_err(|_| internal())?;
        let last = engine.snapshot().map_err(|_| internal())?;
        Ok(Self {
            broadcaster,
            engine,
            last,
        })
    }
}

impl BeaconsModule {
    pub(super) fn route_contribution(
        &self,
        state: &mut State,
        contribution: &Contribution,
    ) -> Result<(), ErrorEnvelope> {
        for visual in state
            .visuals
            .values()
            .filter(|visual| visual.input.is_some())
            .cloned()
            .collect::<Vec<_>>()
        {
            let selected = visual.input.as_ref().is_some_and(|input| {
                input.source == contribution.source
                    || matches!(
                        (input.source, contribution.source),
                        (
                            cc_types::ContributionSource::Cheer,
                            cc_types::ContributionSource::BitsUse
                        ) | (
                            cc_types::ContributionSource::BitsUse,
                            cc_types::ContributionSource::Cheer
                        )
                    )
            });
            if selected {
                // Clear even if the next live value equals the last one.
                super::preview::cancel(state, &visual.visual_id, self.native.as_ref())?;
            }
            let live = match state.engines.entry(visual.visual_id.clone()) {
                Entry::Vacant(slot) => slot.insert(LiveEngine::new(
                    &visual,
                    contribution.broadcaster_id.clone(),
                )?),
                Entry::Occupied(slot) => slot.into_mut(),
            };
            if live.broadcaster != contribution.broadcaster_id {
                *live = LiveEngine::new(&visual, contribution.broadcaster_id.clone())?;
            }
            let intensity = live
                .engine
                .contribute(contribution)
                .map_err(|_| internal())?;
            if !state.previews.contains_key(&visual.visual_id) {
                self.handoff_changed(live, intensity)?;
            }
        }
        Ok(())
    }

    pub(super) fn snapshot_live(&self) -> Result<(), ErrorEnvelope> {
        let mut state = self.state.lock().map_err(|_| internal())?;
        let State {
            engines, previews, ..
        } = &mut *state;
        for (id, live) in engines.iter_mut() {
            let intensity = live.engine.snapshot().map_err(|_| internal())?;
            if !previews.contains_key(id) {
                self.handoff_changed(live, intensity)?;
            }
        }
        Ok(())
    }

    fn handoff_changed(
        &self,
        live: &mut LiveEngine,
        intensity: BeaconsIntensity,
    ) -> Result<(), ErrorEnvelope> {
        if live.last != intensity {
            if let Some(native) = self.native.as_ref().and_then(Weak::upgrade) {
                native.accept_beacons_intensity(intensity.clone())?;
            }
            live.last = intensity;
        }
        Ok(())
    }

    pub(super) fn reset_live_visual(
        &self,
        state: &mut State,
        visual: &Visual,
    ) -> Result<(), ErrorEnvelope> {
        if state.engines.remove(&visual.visual_id).is_some()
            && let Some(native) = self.native.as_ref().and_then(Weak::upgrade)
        {
            // Configuration commits reset the total, including when an input
            // is removed. No preview ever reaches this native handoff.
            native.accept_beacons_intensity(BeaconsIntensity {
                visual_id: visual.visual_id.clone(),
                intensity: visual
                    .curve
                    .ranges
                    .first()
                    .ok_or_else(internal)?
                    .intensity
                    .clone(),
            })?;
        }
        Ok(())
    }
}
