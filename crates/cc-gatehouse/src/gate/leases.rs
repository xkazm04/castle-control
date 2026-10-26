use super::GateActor;
use crate::{
    GatePath, Gatehouse, Result, error,
    governor::{Governor, RoomModeIntent},
};
use cc_types::{Decision, DecisionKind, ErrorCode, LeaseEndParams, Verdict};
use std::{future::Future, time::Duration};

impl Gatehouse {
    /// Register issued leases before dispatching their room-mode intents.
    /// Lifecycle handles stay shared: yielding needs no later snapshot refresh,
    /// and a confirmed end cannot be resurrected by registering the same lease.
    /// Register again after each tick to pick up newly issued leases. Expired
    /// registrations remain until confirmed end; timeout must permit retry.
    pub fn register_governor_leases(&mut self, governor: &Governor) {
        self.room_leases.retain(|_, lease| !lease.ended());
        for lease in governor.registrations() {
            self.room_leases
                .entry(lease.lease_id.clone())
                .or_insert(lease);
        }
    }

    /// An offline room-only confirmation seam; no viewer action or transport.
    pub async fn lease_end<F, Fut>(
        &mut self,
        params: LeaseEndParams,
        actor: GateActor,
        response_budget: Duration,
        confirm: F,
    ) -> Result<Decision>
    where
        F: FnOnce(RoomModeIntent) -> Fut,
        Fut: Future<Output = Result<()>>,
    {
        let lease = self
            .room_leases
            .get(&params.lease_id)
            .cloned()
            .ok_or_else(|| error(ErrorCode::NotFound, "room lease not found or already ended"))?;
        if lease.yielded() || lease.ended() {
            return Err(error(
                ErrorCode::Conflict,
                "room lease yielded or already ended",
            ));
        }
        if !self.gate_available || response_budget.is_zero() {
            return Err(error(ErrorCode::Unavailable, "gate unavailable"));
        }
        let intent = RoomModeIntent::End {
            lease_id: lease.lease_id.clone(),
            mode: lease.setting.mode(),
        };
        tokio::time::timeout(response_budget, confirm(intent))
            .await
            .map_err(|_| error(ErrorCode::Unavailable, "lease end confirmation timed out"))??;
        // A human change observed while confirmation was pending still wins.
        if lease.yielded() || lease.ended() {
            return Err(error(
                ErrorCode::Conflict,
                "room lease changed during confirmation",
            ));
        }
        let mut decision = self.gate_decision(
            None,
            DecisionKind::ModeChanged,
            Verdict::Hold,
            actor.simulated,
            "lease_ended",
        )?;
        decision
            .reason_codes
            .push(format!("lease_id:{}", lease.lease_id.as_str()));
        let decision = self.record_external(decision, None, GatePath::GateSetting, None, &actor)?;
        lease.end();
        self.room_leases.remove(&params.lease_id);
        Ok(decision)
    }
}
