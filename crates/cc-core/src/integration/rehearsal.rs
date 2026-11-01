//! Rehearsal has native OBS/rendering capabilities and an inert Twitch bridge.
use super::*;

impl NativeServices {
    /// Explicit rehearsal entry opts generated Lots into real quicknet HTTPS at
    /// cast time, independently of the owner's native live-beacon preference.
    pub fn app_rehearsal(
        self: &Arc<Self>,
        capacity: usize,
        root: &std::path::Path,
    ) -> Result<Arc<AppState>, ErrorEnvelope> {
        if !self.twitch_inert {
            return Err(ErrorEnvelope::new(
                ErrorCode::BlockedByPolicy,
                "dress rehearsal requires an inert Twitch bridge",
            ));
        }
        self.attach(capacity, Some(root), false, true)
    }
}
