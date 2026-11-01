//! Internal reads and writes; only rehearsal may mark sample contestants.
use super::{TiltyardModule, projection};
use cc_types::*;

impl TiltyardModule {
    pub(crate) async fn turn(
        &self,
        action: &TiltyardAction,
    ) -> Result<TiltyardStageResult, ErrorEnvelope> {
        self.turn_with_source(action, false).await
    }

    pub(crate) async fn start_sample(
        &self,
        list: TiltyardList,
        key: TiltyardId,
        window_ms: TiltyardWindowMs,
    ) -> Result<TiltyardStageResult, ErrorEnvelope> {
        self.turn_with_source(
            &TiltyardAction::Start {
                list,
                key,
                window_ms,
            },
            true,
        )
        .await
    }

    async fn turn_with_source(
        &self,
        action: &TiltyardAction,
        simulated_start: bool,
    ) -> Result<TiltyardStageResult, ErrorEnvelope> {
        let mut state = self.state.lock().await;
        self.advance(&mut state).await?;
        self.apply(&mut state, Some(action), simulated_start)
            .await?;
        let result = TiltyardStageResult {
            session: state.saved.session.clone(),
            at: Timestamp::now(),
        };
        drop(state);
        self.start_clock()?;
        Ok(result)
    }

    pub(crate) async fn stage(&self) -> Result<TiltyardStageResult, ErrorEnvelope> {
        let mut state = self.state.lock().await;
        self.apply(&mut state, None, false).await?;
        Ok(TiltyardStageResult {
            session: state.saved.session.clone(),
            at: Timestamp::now(),
        })
    }

    pub(crate) async fn snapshot(&self) -> Result<Option<TiltyardRenderSnapshot>, ErrorEnvelope> {
        let mut state = self.state.lock().await;
        self.apply(&mut state, None, false).await?;
        state
            .saved
            .session
            .as_ref()
            .map(|s| {
                let mut snapshot =
                    projection::snapshot(s, state.saved.last_closed.as_ref(), Timestamp::now())?;
                // Session provenance describes ballots; render provenance also
                // describes the generated contestants visible on the card.
                snapshot.simulated |= state.saved.simulated;
                Ok(snapshot)
            })
            .transpose()
    }
}
