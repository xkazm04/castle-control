//! Opt-in EventSub transport faults; no credential or store operations.
use std::future::Future;

use crate::{BridgeError, TwitchBridge};

impl TwitchBridge {
    /// Drop every active EventSub connection attempt without logging out.
    ///
    /// Requests cancellation of the socket-owning future in each connection worker.
    /// The ordinary retry/backoff path then reconnects, resubscribes and emits a gap.
    /// This is asynchronous; watch the gap event or status to observe recovery.
    /// With no active workers the request has no effect on future sessions.
    pub fn force_socket_drop(&self) {
        self.socket_drop.send_replace(());
    }

    pub(crate) async fn interrupt_socket(
        &self,
        attempt: impl Future<Output = Result<(), BridgeError>>,
    ) -> Result<(), BridgeError> {
        let mut requested = self.socket_drop.subscribe();
        tokio::select! {
            result = attempt => result,
            _ = requested.changed() => Err(BridgeError::Unavailable("EventSub forced socket drop")),
        }
    }
}
