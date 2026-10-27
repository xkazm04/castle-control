//! Simulated governor audit only: no room executor or viewer action authority.
use super::GateActor;
use crate::{
    GatePath, Gatehouse, Result,
    governor::{GovernorUpdate, RoomModeIntent, RoomSetting},
};
use cc_types::{DecisionKind, LeaseId, Operator, Verdict};

impl Gatehouse {
    /// Persist each proposed room change and every expiry through the existing
    /// ledger chokepoint. Yielded expiry is an observation, never an End command.
    /// This offline seam cannot claim Twitch confirmed any setting.
    pub fn record_simulated_governor_update(
        &mut self,
        update: &GovernorUpdate,
        actor: &GateActor,
    ) -> Result<()> {
        if !actor.simulated {
            return Err(crate::error(
                cc_types::ErrorCode::BlockedByPolicy,
                "simulated governor requires a simulated operator",
            ));
        }
        for lease in &update.expired {
            self.record_governor_room(
                &lease.lease_id,
                lease.setting,
                "governor_lease_expired",
                actor,
            )?;
            if let Some(registration) = self.room_leases.remove(&lease.lease_id) {
                registration.end();
            }
        }
        for intent in &update.intents {
            if let RoomModeIntent::Apply {
                lease_id, setting, ..
            } = intent
            {
                self.record_governor_room(lease_id, *setting, "governor_room_proposed", actor)?;
            }
        }
        Ok(())
    }

    fn record_governor_room(
        &mut self,
        lease_id: &LeaseId,
        setting: RoomSetting,
        reason: &'static str,
        actor: &GateActor,
    ) -> Result<()> {
        let mut decision =
            self.gate_decision(None, DecisionKind::ModeChanged, Verdict::Hold, true, reason)?;
        decision.operator = Operator::AiProposes;
        decision
            .reason_codes
            .push(format!("lease_id:{}", lease_id.as_str()));
        let setting = match setting {
            RoomSetting::Slow { interval_s } => format!("slow:{interval_s}"),
            RoomSetting::FollowerOnly { minimum_age_s } => format!("follower_only:{minimum_age_s}"),
            RoomSetting::EmoteOnly => "emote_only".into(),
            RoomSetting::UniqueChat => "unique_chat".into(),
        };
        decision
            .reason_codes
            .push(format!("room_setting:{setting}"));
        self.record_external(decision, None, GatePath::GateSetting, None, actor)?;
        Ok(())
    }
}
