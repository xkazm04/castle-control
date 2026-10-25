// Adapted from Shadowrunr OS @ 7e4b6f8,
// crates/shadowrunr-engine/src/ledger.rs.
//! Single engine audit chokepoint. No second writer or persistent log.
use crate::{Failure, Result};
use cc_store::{EngineClass, EngineProvider, LedgerEvent, ModelName, Store, Timestamp};
use ulid::Ulid;
pub(crate) struct Audit {
    pub call_id: Ulid,
    pub at: Timestamp,
    pub class: EngineClass,
    pub provider: EngineProvider,
    pub model_selected: ModelName,
    pub model_served: Option<ModelName>,
    pub cost_microusd: u64,
}
impl Audit {
    pub fn append(self, store: &mut Store) -> Result<()> {
        store
            .append_ledger(
                self.at,
                Timestamp::now(),
                LedgerEvent::Engine {
                    call_id: self.call_id,
                    class: self.class,
                    provider: self.provider,
                    model_selected: self.model_selected,
                    model_served: self.model_served,
                    cost_microusd: self.cost_microusd,
                },
            )
            .map(|_| ())
            .map_err(|_| Failure::Audit)
    }
}
