//! Storage lifecycle for the shadow host, through existing cc-store APIs.
use crate::{Gatehouse, Result, internal};

impl Gatehouse {
    /// Live chart reads and ingestion share the host clock. Twitch event time
    /// stays intact in the message/recording: a late notification must not move
    /// the chart behind a newer RPC read and interrupt downstream intake.
    pub fn consensus_ingest_live(&mut self, screened: &crate::ScreenedMessage) -> Result<()> {
        if let Some(mut passed) = screened.for_consensus() {
            passed.at = self.now()?;
            self.consensus_ingest(passed)?;
        }
        Ok(())
    }

    pub fn purge_live_data(&mut self) -> Result<()> {
        self.gate_available = false;
        self.store.purge_all(self.clock.now()).map_err(internal)?;
        self.strikes = Default::default();
        self.analysis = crate::analysis::Analysis::new(self.now()?)?;
        Ok(())
    }

    pub fn reap_live_recordings(&mut self) -> Result<()> {
        self.store
            .purge_expired(self.clock.now())
            .map_err(internal)?;
        Ok(())
    }
}
