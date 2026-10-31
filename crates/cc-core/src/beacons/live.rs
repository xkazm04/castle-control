//! Retained contributions decide deduplication before any live curve is fed.
use super::{BeaconsModule, internal};
use crate::{EventHub, ingress::ContributionIngress};
use cc_beacons::intake::Intake;
use cc_store::{DataStore, StoredItem, Timestamp, TwitchUserId};
use cc_types::{Contribution, ErrorCode, ErrorEnvelope, EventKind};
use std::sync::Arc;
use tokio::{sync::broadcast, task::JoinHandle};

#[derive(serde::Serialize, serde::Deserialize)]
#[serde(deny_unknown_fields)]
struct RetainedContribution {
    contribution: Contribution,
    at: cc_types::Timestamp,
}

impl BeaconsModule {
    // Read from the inventoried store rather than a second in-memory count.
    #[cfg(test)]
    pub(crate) fn contributions(&self) -> Result<Vec<Contribution>, ErrorEnvelope> {
        let state = self.state.lock().map_err(|_| internal())?;
        read(&state._store)
    }

    pub(crate) fn intake(&self, input: ContributionIngress) -> Result<bool, ErrorEnvelope> {
        let mut state = self.state.lock().map_err(|_| internal())?;
        if state.revoked {
            return Err(ErrorEnvelope::new(
                ErrorCode::Unauthorized,
                "live authorization revoked",
            ));
        }
        let store = &mut state._store;
        store
            .purge_expired(Timestamp::now())
            .map_err(|_| internal())?;
        // Retained rows are the dedupe authority, including across restarts.
        // Rebuild before inserting: an unsuccessful write never consumes a key.
        let mut intake = Intake::default();
        for contribution in read(store)? {
            intake.accept(&contribution).map_err(|_| internal())?;
        }
        if intake
            .accept(&input.contribution)
            .map_err(|_| internal())?
            .is_none()
        {
            return Ok(false);
        }
        let broadcaster =
            TwitchUserId::parse(&String::from(input.contribution.broadcaster_id.clone()))
                .map_err(|_| internal())?;
        store
            .map_user(broadcaster.clone(), &input.broadcaster_login)
            .map_err(|_| internal())?;
        let mut user_ids = vec![broadcaster];
        if let Some(user) = &input.contribution.user_id {
            let user = TwitchUserId::parse(&String::from(user.clone())).map_err(|_| internal())?;
            store
                .map_user(
                    user.clone(),
                    input.user_login.as_deref().ok_or_else(internal)?,
                )
                .map_err(|_| internal())?;
            if !user_ids.contains(&user) {
                user_ids.push(user);
            }
        }
        store
            .insert(
                DataStore::Recordings,
                &StoredItem {
                    id: ulid::Ulid::new(),
                    // Retention follows host receipt, not a redelivery's old timestamp.
                    at: Timestamp::now(),
                    user_ids,
                    content: serde_json::to_string(&RetainedContribution {
                        contribution: input.contribution.clone(),
                        at: input.at.try_into().map_err(|_| internal())?,
                    })
                    .map_err(|_| internal())?,
                    simulated: false,
                },
            )
            .map_err(|_| internal())?;
        // The store accepted this key. Duplicates return before routing, even
        // after a configuration reset or restart clears the engine's state.
        self.route_contribution(&mut state, &input.contribution)?;
        Ok(true)
    }

    pub(crate) fn start_intake(
        self: &Arc<Self>,
        mut receiver: broadcast::Receiver<ContributionIngress>,
        events: Arc<EventHub>,
    ) -> JoinHandle<Result<(), ErrorEnvelope>> {
        let module = self.clone();
        tokio::spawn(async move {
            let mut tick = tokio::time::interval(std::time::Duration::from_secs(1));
            tick.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
            loop {
                tokio::select! {
                    _ = tick.tick() => {
                        if let Err(error) = module.snapshot_live() {
                            events.publish(EventKind::BridgeGap)?;
                            return Err(error);
                        }
                    }
                    input = receiver.recv() => {
                        match input {
                            Ok(input) => match module.intake(input) {
                                Ok(true) => {
                                    events.publish(EventKind::Contribution)?;
                                }
                                Ok(false) => {}
                                Err(error) => {
                                    events.publish(EventKind::BridgeGap)?;
                                    return Err(error);
                                }
                            },
                            Err(broadcast::error::RecvError::Lagged(_)) => {
                                events.publish(EventKind::BridgeGap)?;
                            }
                            Err(broadcast::error::RecvError::Closed) => return Ok(()),
                        }
                    }
                }
            }
        })
    }

    pub(crate) fn purge_live_data(&self) -> Result<(), ErrorEnvelope> {
        let mut state = self.state.lock().map_err(|_| internal())?;
        state.revoked = true;
        for id in state.previews.keys().cloned().collect::<Vec<_>>() {
            self.cancel_preview(&mut state, &id)?;
        }
        state.engines.clear();
        state
            ._store
            .purge_all(Timestamp::now())
            .map_err(|_| internal())?;
        Ok(())
    }
}

pub(super) fn read(store: &cc_store::Store) -> Result<Vec<Contribution>, ErrorEnvelope> {
    let mut items = store.items(DataStore::Recordings).map_err(|_| internal())?;
    // Receipt time orders accepted rows, including redeliveries whose Twitch
    // timestamp predates other events. Store IDs break equal-time ties.
    items.sort_by(|left, right| left.at.cmp(&right.at).then(left.id.cmp(&right.id)));
    items
        .into_iter()
        .map(|item| {
            serde_json::from_str::<RetainedContribution>(&item.content)
                .map(|record| record.contribution)
                .map_err(|_| internal())
        })
        .collect()
}
