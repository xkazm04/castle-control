//! Configured offline service composition. No Twitch executor, guessed policy,
//! new wire identifiers or access to native credentials is introduced here.
use super::{GatehouseModule, internal};
use cc_gatehouse::{
    Classifier, Gatehouse, IngestedMessage, ScreenedMessage,
    gate::{GateActor, ModerationEvent},
    governor::{Governor, GovernorConfig, GovernorUpdate, RoomLease},
};
use cc_store::Clock;
use cc_types::{Decision, ErrorCode, ErrorEnvelope, LeaseEndParams};
use std::{path::Path, sync::Arc, time::Duration};
use tokio::sync::Mutex;

type Result<T> = std::result::Result<T, ErrorEnvelope>;

pub(super) struct Service {
    pub gate: Gatehouse,
    pub governor: Option<Governor>,
    // Failed ticks are visible at every service entry, never silently skipped.
    // Restart is required after a partially audited update; no live effect exists.
    pub failure: Option<ErrorEnvelope>,
}

impl Service {
    pub fn ready(&self) -> Result<()> {
        self.failure.clone().map_or(Ok(()), Err)
    }

    pub fn tick(&mut self) -> Result<Option<GovernorUpdate>> {
        self.ready()?;
        let Some(governor) = &mut self.governor else {
            return Ok(None);
        };
        let result: Result<Option<GovernorUpdate>> = (|| {
            let update = governor.tick()?;
            self.gate
                .record_simulated_governor_update(&update, &simulated_actor()?)?;
            self.gate.register_governor_leases(governor);
            Ok(Some(update))
        })();
        if let Err(error) = &result {
            self.failure = Some(error.clone());
        }
        result
    }

    pub async fn lease_end(&mut self, params: LeaseEndParams) -> Result<Decision> {
        // Expiry must win over a late RPC, even if the periodic tick is delayed.
        self.tick()?;
        let actor = simulated_actor()?;
        // This is confirmation of a simulation only, never a Twitch ACK.
        self.gate
            .lease_end(params, actor, Duration::from_secs(1), |_| async { Ok(()) })
            .await
    }
}

impl GatehouseModule {
    /// Explicit simulated policy starts a one-second periodic task. The injected
    /// service Clock determines all deadlines; wall time only schedules ticks.
    /// Default/native registration has no governor policy and starts no task.
    pub fn open_with_governor(
        root: impl AsRef<Path>,
        clock: Arc<dyn Clock>,
        config: GovernorConfig,
    ) -> Result<Self> {
        let runtime = tokio::runtime::Handle::try_current().map_err(|_| {
            ErrorEnvelope::new(
                ErrorCode::Unavailable,
                "governor requires a service runtime",
            )
        })?;
        let governor = Governor::new(config, clock.clone())?;
        let gate = Gatehouse::with_clock(root, clock)?;
        if gate
            .rules_list(cc_types::Empty {})?
            .rules
            .iter()
            .any(|rule| {
                rule.mode == cc_types::RuleMode::Armed
                    && rule.rule_class != cc_types::RuleClass::Rail
            })
        {
            return Err(ErrorEnvelope::new(
                ErrorCode::BlockedByPolicy,
                "offline governor refuses armed rules",
            ));
        }
        let state = Arc::new(Mutex::new(Service {
            gate,
            governor: Some(governor),
            failure: None,
        }));
        let weak = Arc::downgrade(&state);
        let ticker = runtime.spawn(async move {
            let period = Duration::from_secs(1);
            let mut ticks = tokio::time::interval_at(tokio::time::Instant::now() + period, period);
            ticks.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
            loop {
                ticks.tick().await;
                let Some(state) = weak.upgrade() else { break };
                // tick latches the error for callers; a failed task grants no authority.
                if state.lock().await.tick().is_err() {
                    break;
                }
            }
        });
        Ok(Self {
            state,
            ticker: Some(ticker),
        })
    }

    /// Rust-only ingress. Every message is screened before governor observation;
    /// neither a caller-supplied verdict nor a text claim grants authority.
    pub async fn screen_batch(
        &self,
        messages: Vec<IngestedMessage>,
        classifier: &dyn Classifier,
    ) -> Result<Vec<ScreenedMessage>> {
        require_simulated(messages.iter().all(|m| m.simulated))?;
        let mut state = self.state.lock().await;
        state.ready()?;
        let screened = state.gate.screen_batch(messages, classifier).await?;
        if let Some(governor) = &mut state.governor {
            for message in &screened {
                governor.observe_chat(message)?;
            }
        }
        state.tick()?;
        Ok(screened)
    }

    /// Input is a verified external-human observation, never our own echo.
    /// Reuse the gate event path so human yielding and its audit cannot diverge.
    pub async fn ingest_moderation(&self, event: ModerationEvent) -> Result<Decision> {
        require_simulated(
            event.moderator.simulated
                && event
                    .message
                    .as_ref()
                    .is_none_or(|message| message.simulated),
        )?;
        let mut state = self.state.lock().await;
        state.ready()?;
        let Service { gate, governor, .. } = &mut *state;
        gate.ingest_moderation(event, governor.as_mut())
    }

    /// Same entry point as the periodic task, available to deterministic hosts.
    pub async fn tick_governor(&self) -> Result<Option<GovernorUpdate>> {
        self.state.lock().await.tick()
    }

    /// Last processed snapshot; use tick_governor or gate_roll to check health.
    pub async fn room_leases(&self) -> Vec<RoomLease> {
        self.state
            .lock()
            .await
            .governor
            .as_ref()
            .map_or_else(Vec::new, Governor::leases)
    }

    pub async fn gate_roll(&self) -> Result<Vec<Decision>> {
        let state = self.state.lock().await;
        state.ready()?;
        state.gate.gate_roll()
    }
}

fn require_simulated(simulated: bool) -> Result<()> {
    if simulated {
        Ok(())
    } else {
        Err(ErrorEnvelope::new(
            ErrorCode::BlockedByPolicy,
            "offline governor refuses live intake",
        ))
    }
}

fn simulated_actor() -> Result<GateActor> {
    Ok(GateActor {
        user_id: cc_store::TwitchUserId::parse("999999999").map_err(|_| internal())?,
        login: "simulated_operator".into(),
        simulated: true,
    })
}
