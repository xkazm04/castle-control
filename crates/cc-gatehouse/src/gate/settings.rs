use super::GateActor;
use crate::{GatePath, Gatehouse, Result, error};
use cc_types::{
    DecisionId, DecisionKind, DelaySetParams, DelaySetResult, ErrorCode, ShieldSetParams,
    ShieldState, Verdict,
};
use std::{future::Future, time::Duration};

/// Applied settings are unknown until confirmation; restart never guesses state.
pub(crate) struct Settings {
    pub delay: Option<DelaySetResult>,
    pub shield: Option<ShieldState>,
    pub delay_epoch: DecisionId,
    pub shield_epoch: DecisionId,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            delay: None,
            shield: None,
            delay_epoch: DecisionId::mint(),
            shield_epoch: DecisionId::mint(),
        }
    }
}

/// Service-bound pending change. No state or authority is granted by preparation.
pub struct DelayChange {
    requested: DelaySetParams,
    epoch: DecisionId,
    actor: GateActor,
}
pub struct ShieldChange {
    requested: ShieldSetParams,
    epoch: DecisionId,
    actor: GateActor,
}

impl Gatehouse {
    /// One-call service seam. Once sent, the old applied state is no longer
    /// reliable: timeout, failure or cancellation must leave it unknown.
    /// Rotate the epoch before dispatch so older preparations cannot revive it.
    pub async fn delay_set<F, Fut>(
        &mut self,
        params: DelaySetParams,
        actor: GateActor,
        response_budget: Duration,
        confirm: F,
    ) -> Result<DelaySetResult>
    where
        F: FnOnce(DelaySetParams) -> Fut,
        Fut: Future<Output = Result<DelaySetResult>>,
    {
        if !self.gate_available || response_budget.is_zero() {
            return Err(error(ErrorCode::Unavailable, "gate unavailable"));
        }
        self.gate_settings.delay = None;
        self.gate_settings.delay_epoch = DecisionId::mint();
        let change = self.delay_prepare(params.clone(), actor)?;
        let confirmed = tokio::time::timeout(response_budget, confirm(params))
            .await
            .map_err(|_| error(ErrorCode::Unavailable, "delay confirmation timed out"))?;
        self.delay_confirm(change, confirmed)
    }

    /// Only a matching, audited confirmation publishes the requested Shield state.
    pub async fn shield_set<F, Fut>(
        &mut self,
        params: ShieldSetParams,
        actor: GateActor,
        response_budget: Duration,
        confirm: F,
    ) -> Result<ShieldState>
    where
        F: FnOnce(ShieldSetParams) -> Fut,
        Fut: Future<Output = Result<ShieldState>>,
    {
        if !self.gate_available || response_budget.is_zero() {
            return Err(error(ErrorCode::Unavailable, "gate unavailable"));
        }
        self.gate_settings.shield = None;
        self.gate_settings.shield_epoch = DecisionId::mint();
        let change = self.shield_prepare(params.clone(), actor)?;
        let confirmed = tokio::time::timeout(response_budget, confirm(params))
            .await
            .map_err(|_| error(ErrorCode::Unavailable, "Shield confirmation timed out"))?;
        self.shield_confirm(change, confirmed)
    }

    pub fn delay_state(&self) -> Option<DelaySetResult> {
        self.gate_settings.delay.clone()
    }
    pub fn shield_state(&self) -> Option<ShieldState> {
        self.gate_settings.shield.clone()
    }

    pub fn delay_prepare(&self, params: DelaySetParams, actor: GateActor) -> Result<DelayChange> {
        if !self.gate_available {
            return Err(error(ErrorCode::Unavailable, "gate unavailable"));
        }
        Ok(DelayChange {
            requested: params,
            epoch: self.gate_settings.delay_epoch.clone(),
            actor,
        })
    }

    pub fn shield_prepare(
        &self,
        params: ShieldSetParams,
        actor: GateActor,
    ) -> Result<ShieldChange> {
        if !self.gate_available {
            return Err(error(ErrorCode::Unavailable, "gate unavailable"));
        }
        Ok(ShieldChange {
            requested: params,
            epoch: self.gate_settings.shield_epoch.clone(),
            actor,
        })
    }

    pub fn delay_confirm(
        &mut self,
        change: DelayChange,
        confirmation: Result<DelaySetResult>,
    ) -> Result<DelaySetResult> {
        let confirmed = confirmation?;
        if change.epoch != self.gate_settings.delay_epoch
            || change.requested.delay_s != confirmed.delay_s
        {
            return Err(error(
                ErrorCode::Conflict,
                "stale or mismatched delay confirmation",
            ));
        }
        let decision = self.gate_decision(
            None,
            DecisionKind::ModeChanged,
            Verdict::Hold,
            change.actor.simulated,
            "delay_confirmed",
        )?;
        let mut decision = decision;
        decision
            .reason_codes
            .push(format!("delay_s:{}", u8::from(confirmed.delay_s)));
        self.record_external(decision, None, GatePath::GateSetting, None, &change.actor)?;
        self.gate_settings.delay = Some(confirmed.clone());
        self.gate_settings.delay_epoch = DecisionId::mint();
        Ok(confirmed)
    }

    pub fn shield_confirm(
        &mut self,
        change: ShieldChange,
        confirmation: Result<ShieldState>,
    ) -> Result<ShieldState> {
        let confirmed = confirmation?;
        if change.epoch != self.gate_settings.shield_epoch
            || change.requested.enabled != confirmed.enabled
        {
            return Err(error(
                ErrorCode::Conflict,
                "stale or mismatched Shield confirmation",
            ));
        }
        let decision = self.gate_decision(
            None,
            DecisionKind::ModeChanged,
            Verdict::Hold,
            change.actor.simulated,
            "shield_confirmed",
        )?;
        let mut decision = decision;
        decision
            .reason_codes
            .push(format!("shield_enabled:{}", confirmed.enabled));
        self.record_external(decision, None, GatePath::GateSetting, None, &change.actor)?;
        self.gate_settings.shield = Some(confirmed.clone());
        self.gate_settings.shield_epoch = DecisionId::mint();
        Ok(confirmed)
    }
}
