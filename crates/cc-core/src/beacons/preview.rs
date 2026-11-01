//! Independent test-fire ticker: no live intake worker or contribution writes.
use super::{BeaconsModule, State, internal, routing::HostClock};
use crate::NativeServices;
use cc_beacons::preview::PreviewSession;
use cc_types::{BeaconsIntensity, ErrorEnvelope, VisualId};
use std::{
    sync::{Arc, Mutex, Weak},
    time::Duration,
};

pub(super) struct Preview {
    session: PreviewSession<HostClock>,
    last: BeaconsIntensity,
}

impl BeaconsModule {
    pub(crate) fn stop_simulations(&self) -> Result<(), ErrorEnvelope> {
        let mut state = self.state.lock().map_err(|_| internal())?;
        let ids: Vec<_> = state.previews.keys().cloned().collect();
        for id in ids {
            cancel(&mut state, &id, self.native.as_ref())?;
        }
        Ok(())
    }

    pub(super) fn start_preview(
        &self,
        state: &mut State,
        session: PreviewSession<HostClock>,
        last: BeaconsIntensity,
    ) {
        state
            .previews
            .insert(last.visual_id.clone(), Preview { session, last });
        if state
            .preview_task
            .as_ref()
            .is_some_and(|task| !task.is_finished())
        {
            return;
        }
        // Module::call borrows Self. A weak state owner gives the ticker the
        // same lifetime bound without keeping the module/store alive forever.
        let weak_state = Arc::downgrade(&self.state);
        let native = self.native.clone();
        state.preview_task = Some(tokio::spawn(run(weak_state, native)));
    }

    pub(super) fn cancel_preview(
        &self,
        state: &mut State,
        id: &VisualId,
    ) -> Result<(), ErrorEnvelope> {
        cancel(state, id, self.native.as_ref())
    }
}

pub(super) fn cancel(
    state: &mut State,
    id: &VisualId,
    native: Option<&Weak<NativeServices>>,
) -> Result<(), ErrorEnvelope> {
    if state.previews.remove(id).is_some()
        && let Some(native) = native.and_then(Weak::upgrade)
    {
        native.end_beacons_simulation(id)?;
    }
    if state.previews.is_empty()
        && let Some(task) = state.preview_task.take()
    {
        task.abort();
    }
    Ok(())
}

async fn run(
    state: Weak<Mutex<State>>,
    native: Option<Weak<NativeServices>>,
) -> Result<(), ErrorEnvelope> {
    let mut tick = tokio::time::interval_at(
        tokio::time::Instant::now() + Duration::from_secs(1),
        Duration::from_secs(1),
    );
    tick.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
    loop {
        tick.tick().await;
        let Some(state) = state.upgrade() else {
            return Ok(());
        };
        let mut state = state.lock().map_err(|_| internal())?;
        let Some(native) = native.as_ref().and_then(Weak::upgrade) else {
            state.previews.clear();
            state.preview_task = None;
            return Ok(());
        };
        if let Err(error) = step(&mut state, &native) {
            // A failed tick must not strand previews: they suppress live
            // handoff for their visual. End each one, best effort.
            for id in std::mem::take(&mut state.previews).into_keys() {
                if native.end_beacons_simulation(&id).is_err() {
                    tracing::warn!(
                        visual_id = id.as_str(),
                        "preview end failed after tick error"
                    );
                }
            }
            state.preview_task = None;
            return Err(error);
        }
        if state.previews.is_empty() {
            state.preview_task = None;
            return Ok(());
        }
    }
}

fn step(state: &mut State, native: &NativeServices) -> Result<(), ErrorEnvelope> {
    let mut ended = Vec::new();
    for (id, preview) in &mut state.previews {
        match preview.session.snapshot().map_err(|_| internal())? {
            Some(value) if value != preview.last => {
                native.accept_beacons_simulation(value.clone())?;
                preview.last = value;
            }
            Some(_) => {}
            None => {
                native.end_beacons_simulation(id)?;
                ended.push(id.clone());
            }
        }
    }
    for id in ended {
        state.previews.remove(&id);
    }
    Ok(())
}
