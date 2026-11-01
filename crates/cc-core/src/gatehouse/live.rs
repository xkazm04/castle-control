//! Live observation has no moderation executor or bridge reference.
use super::{GatehouseModule, internal};
use cc_gatehouse::{
    Classifier, Gatehouse, IngestedMessage, ScreenedMessage, herald::DirectionSeed,
};
use cc_types::{BridgeGap, ErrorEnvelope};
use std::{path::Path, sync::Arc};

impl GatehouseModule {
    pub(crate) fn open_shadow(root: impl AsRef<Path>) -> Result<Self, ErrorEnvelope> {
        Self::open_shadow_with_directions(root, Vec::new())
    }

    pub(crate) fn open_shadow_with_directions(
        root: impl AsRef<Path>,
        seeds: Vec<DirectionSeed>,
    ) -> Result<Self, ErrorEnvelope> {
        let module = Self::with_gate(Gatehouse::with_clock_and_directions(
            root,
            Arc::new(cc_store::SystemClock),
            seeds,
        )?);
        module
            .state
            .try_lock()
            .map_err(|_| internal())?
            .gate
            .require_shadow();
        Ok(module)
    }

    pub(crate) async fn screen_live_shadow(
        &self,
        message: IngestedMessage,
        classifier: &dyn Classifier,
        gaps: Vec<BridgeGap>,
    ) -> Result<ScreenedMessage, ErrorEnvelope> {
        let mut state = self.state.lock().await;
        state.ready()?;
        let screened = state
            .gate
            .capture_live_shadow(message, classifier, gaps)
            .await?;
        state.gate.consensus_ingest_live(&screened)?;
        Ok(screened)
    }

    pub(crate) async fn purge_live_data(&self) -> Result<(), ErrorEnvelope> {
        let mut state = self.state.lock().await;
        state.gate.purge_live_data()?;
        state.failure = Some(cc_types::ErrorEnvelope::new(
            cc_types::ErrorCode::Unauthorized,
            "live authorization revoked",
        ));
        Ok(())
    }
}
