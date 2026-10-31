//! One fixed diagnostic per observed outage, including an initial failed probe.
use super::{Duration, NativeServices, Weak};
use cc_obs::Error;
use tokio::task::AbortHandle;
use tracing::instrument::WithSubscriber;

pub(super) fn start(services: Weak<NativeServices>) -> AbortHandle {
    tokio::spawn(
        async move {
            let mut poll = tokio::time::interval(Duration::from_secs(2));
            let mut disconnected = false;
            loop {
                poll.tick().await;
                let Some(service) = services.upgrade() else {
                    break;
                };
                match service.obs_status().await {
                    Ok(_) => disconnected = false,
                    Err(error) => {
                        if !disconnected && let Some(reason) = fixed_reason(&error.message) {
                            tracing::warn!(%reason, "OBS probe failed");
                        }
                        disconnected = true;
                    }
                }
            }
        }
        .with_current_subscriber(),
    )
    .abort_handle()
}

fn fixed_reason(message: &str) -> Option<Error> {
    // Envelopes can also carry event-hub errors. Log only the OBS door's fixed
    // Display values, never an arbitrary envelope, peer frame, label or URL.
    [
        Error::Invalid,
        Error::Keychain,
        Error::Transport,
        Error::Protocol,
        Error::Rejected,
        Error::Timeout,
    ]
    .into_iter()
    .find(|reason| reason.to_string() == message)
}
