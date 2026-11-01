//! Storage lifecycle for the shadow host, through existing cc-store APIs.
use crate::{Gatehouse, Result, internal};
use cc_types::ErrorCode;

/// The chart's refusal of a rewound clock (herald.rs `advance`).
const CHART_REWOUND: &str = "chart time must be monotonic";

impl Gatehouse {
    /// Live chart reads and ingestion share the host clock. Twitch event time
    /// stays intact in the message/recording: a late notification must not move
    /// the chart behind a newer RPC read and interrupt downstream intake.
    pub fn consensus_ingest_live(&mut self, screened: &crate::ScreenedMessage) -> Result<()> {
        if let Some(mut passed) = screened.for_consensus() {
            passed.at = self.now()?;
            match self.consensus_ingest(passed) {
                Ok(()) => {}
                // A wall-clock step back is a chart gap; the verdict is committed.
                Err(e) if e.code == ErrorCode::Invalid && e.message == CHART_REWOUND => {}
                Err(e) => return Err(e),
            }
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
