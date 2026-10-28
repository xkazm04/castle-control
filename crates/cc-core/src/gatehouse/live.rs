//! Live observation has no moderation executor or bridge reference.
use super::{GatehouseModule, internal};
use cc_gatehouse::{Classifier, IngestedMessage, ScreenedMessage};
use cc_types::{BridgeGap, ErrorEnvelope, RecordedMessage, RecordingImportParams};
use std::{path::Path, sync::Arc};

impl GatehouseModule {
    pub(crate) fn open_shadow(root: impl AsRef<Path>) -> Result<Self, ErrorEnvelope> {
        let module = Self::open(root, Arc::new(cc_store::SystemClock))?;
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
        state.gate.require_shadow();
        state.gate.reap_live_recordings()?;
        // Preserve the original in cc-store's existing retention/erasure inventory
        // for the owner's drill. This is a recording, never a diagnostic log.
        state.gate.recording_import(RecordingImportParams {
            source: "live-shadow"
                .to_owned()
                .try_into()
                .map_err(|_| internal())?,
            messages: vec![RecordedMessage {
                message_id: message.message_id.clone(),
                user_id: message
                    .user_id
                    .as_str()
                    .to_owned()
                    .try_into()
                    .map_err(|_| internal())?,
                at: message.at.clone(),
                text: message.text.clone(),
            }],
            gaps,
        })?;
        let mut screened = state.gate.screen_batch(vec![message], classifier).await?;
        let screened = screened.pop().ok_or_else(internal)?;
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
