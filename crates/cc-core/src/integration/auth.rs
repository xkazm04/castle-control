//! Truthful Twitch auth status: a bridge that reports Connected is not usable
//! while the live lane is locked out after a revoke (until the app restarts).
use cc_twitch::BridgeState;
use cc_types::TwitchAuthStatus;

pub(super) fn auth_status_for(
    state: BridgeState,
    scopes: &[String],
    locked_out: bool,
) -> TwitchAuthStatus {
    let connected = state == BridgeState::Connected && !locked_out;
    TwitchAuthStatus {
        connected,
        pending: state == BridgeState::Connecting,
        user_id: None,
        scopes: if connected { scopes.to_vec() } else { vec![] },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn revoked_lane_is_not_reported_connected_even_if_the_bridge_is() {
        let scopes = vec!["simulated:scope".to_owned()];
        let live = auth_status_for(BridgeState::Connected, &scopes, false);
        assert!(live.connected);
        assert_eq!(live.scopes, scopes);
        let locked = auth_status_for(BridgeState::Connected, &scopes, true);
        assert!(!locked.connected);
        assert!(locked.scopes.is_empty());
    }
}
