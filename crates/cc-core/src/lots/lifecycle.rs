use super::{LotsModule, Pending, State, convert, not_found, storage, unavailable_roll};
use cc_lots::{GuardedDraw, SealSource, cast_quicknet, cast_streamer, seal_roll};
use cc_types::*;
use cc_verify::SealedRoll;
use chrono::Timelike;
use convert::{domain, encode, internal, project};
use serde_json::Value;

impl LotsModule {
    pub(super) fn seal(
        &self,
        state: &mut State,
        params: &RollSealParams,
    ) -> Result<Value, ErrorEnvelope> {
        let draw = state.draws.get(&params.draw_id).ok_or_else(not_found)?;
        if convert::check(&draw.policy).result == CheckResult::Blocked {
            return Err(ErrorEnvelope::new(
                ErrorCode::BlockedByPolicy,
                "draw policy is blocked",
            ));
        }
        let guarded = GuardedDraw::new(draw.draw_id.clone(), convert::policy(&draw.policy));
        // Source errors leave the open pool untouched. After transfer to the domain,
        // every failed attempt is consumed; there is no reroll of a frozen snapshot.
        let (chain, seed) = match params.source {
            RandomnessSource::DrandQuicknet => (Some(self.beacon.chain()?), None),
            RandomnessSource::StreamerCommit => (None, Some(rand::random::<[u8; 32]>())),
        };
        let source = match (&chain, &seed) {
            (Some(chain), None) => SealSource::Quicknet(chain),
            (None, Some(seed)) => SealSource::StreamerCommit(SealedRoll::commitment(seed)),
            _ => return Err(internal()),
        };
        let roll = state
            .rolls
            .remove(&params.draw_id)
            .ok_or_else(|| unavailable_roll(state, &params.draw_id))?;
        let at = self
            .now()
            .with_nanosecond(0)
            .expect("zero nanoseconds is valid");
        let sealed = seal_roll(
            roll,
            &guarded,
            at,
            params.margin_s.get(),
            source,
            &mut state.store,
            cc_store::Timestamp::now(),
        )
        .map_err(domain)?;
        let published = RollSealResult {
            draw_id: params.draw_id.clone(),
            draw_run_id: sealed
                .draw_run_id()
                .to_string()
                .try_into()
                .map_err(|_| internal())?,
            sealed: serde_json::from_str(&sealed.to_json().map_err(domain)?)
                .map_err(|_| internal())?,
        };
        if self
            .beacon
            .round_time(&published.sealed)?
            .is_some_and(|target| self.now() >= target)
        {
            return Err(ErrorEnvelope::new(
                ErrorCode::Conflict,
                "seal announcement missed the target round; attempt consumed",
            ));
        }
        self.emit(LotsEventPayload::Sealed(published.clone()))?;
        // Publication is synchronous. Do not accept a late announcement even if
        // store/event work exhausted the margin; it can never be cast.
        if self
            .beacon
            .round_time(&published.sealed)?
            .is_some_and(|target| self.now() >= target)
        {
            return Err(ErrorEnvelope::new(
                ErrorCode::Conflict,
                "seal announcement missed the target round; attempt consumed",
            ));
        }
        state.pending.insert(
            published.draw_run_id.clone(),
            Pending {
                draw_id: params.draw_id.clone(),
                sealed,
                published: published.clone(),
                seed,
                chain,
            },
        );
        encode(published)
    }

    pub(super) fn cast(
        &self,
        state: &mut State,
        params: &CastParams,
    ) -> Result<Value, ErrorEnvelope> {
        // A retry returns the durable result, never another random sample or event.
        if let Some(saved) = storage::saved_casts(&state.store)?
            .into_iter()
            .find(|s| s.result.draw_run_id == params.draw_run_id)
        {
            return encode(saved.result);
        }
        if let Some(pending) = state.pending.get(&params.draw_run_id)
            && pending.chain.is_some()
            && self
                .beacon
                .round_time(&pending.published.sealed)?
                .is_some_and(|target| self.now() < target)
        {
            return Err(ErrorEnvelope::new(
                ErrorCode::Conflict,
                "seal announced; wait for the target quicknet round before casting",
            ));
        }
        let pending = state
            .pending
            .remove(&params.draw_run_id)
            .ok_or_else(not_found)?;
        let at = self.now();
        let result = match (pending.chain, pending.seed) {
            (Some(chain), None) => {
                let round = self.beacon.round(&pending.published.sealed)?;
                cast_quicknet(
                    pending.sealed,
                    &chain,
                    &round,
                    at,
                    &mut state.store,
                    cc_store::Timestamp::now(),
                )
            }
            (None, Some(seed)) => cast_streamer(
                pending.sealed,
                seed,
                at,
                &mut state.store,
                cc_store::Timestamp::now(),
            ),
            _ => return Err(internal()),
        }
        .map_err(domain)?;
        let saved = storage::SavedCast {
            result: CastResult {
                draw_run_id: params.draw_run_id.clone(),
                writ_id: WritId::mint(),
                cast: project(result.verified())?,
            },
            writ: serde_json::from_str(&result.writ().to_json().map_err(|_| internal())?)
                .map_err(|_| internal())?,
        };
        storage::save_cast(&mut state.store, &saved, at, self.simulated)?;
        state.rolls.insert(pending.draw_id, result.into_next_roll());
        self.emit(LotsEventPayload::Cast(saved.result.clone()))?;
        encode(saved.result)
    }
}
