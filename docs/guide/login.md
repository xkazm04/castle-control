# Log in on the owner's test channel

Draft for owner review, current at `c3dea03` (2026-10-28). Device-code login and
keychain storage are implemented. Owner-attended live verification is still
pending; this page does not claim a successful Twitch session. Browser/Vite
fixture mode cannot log in. Sources:
[desktop native setup](../../apps/desktop/README.md#tauri-shell),
[live evidence template](../spike-log.md).

## Prepare and authorize

The owner supplies a registered public Twitch application client ID and the
owner's test-channel login. Use the channel's login, not its URL or numeric ID.
Prepare OBS WebSocket v5 separately if testing overlays. The owner also keeps
two owned test-viewer accounts for any later armed spike action. Do not use
real viewers. See [live-test rules](../../AGENTS.md#safety-and-live-tests).

After [building the native frontend](install.md), run from the repository root:

```powershell
cargo run -p cc-desktop --features custom-protocol -- --client-id YOURPUBLICCLIENTID --test-channel your_test_channel --login
```

The public placeholders above are not credentials. The Windows native presenter
opens Twitch's verification page and shows a user code and expiry in a native
dialog. Enter that code at Twitch and approve the requested access as the test
channel owner. The app polls at Twitch's interval and stops on denial or expiry.
Do not paste codes, tokens or keychain contents into chat, logs or screenshots.
Sources: [native presenter](../../crates/cc-core/src/login.rs),
[authorization behavior](../SECURITY.md#brokered-calls).

Omit `--login` on a later configured launch to try the existing keychain grant.
Check the actual Twitch status in the rampart; an unavailable/unknown status is
not authorization. These launch options do not arm moderation. Source:
[native shell options](../../apps/desktop/README.md#tauri-shell).

## Credential labels and disconnect

| Use | Keychain service | Account / selection |
| --- | --- | --- |
| Twitch access token, refresh token and expiry | `castlecontrol-twitch` | `streamer` |
| OBS password | `castlecontrol-obs` | `streamer` by default; `--obs-password-label` selects a label |
| Optional Leonardo key, client library only | `castlecontrol-leonardo` | User-supplied label; desktop art controls are not connected yet |

OBS defaults to port 4455; `--obs-port` changes the port. Supply only labels,
never a password or token, in command-line options. An unavailable keychain is
an error, with no plaintext fallback for Twitch. This is OS-user custody,
not protection from software running as you. Sources:
[keyring custody](../SECURITY.md#keyring-custody-class),
[desktop OBS configuration](../../apps/desktop/README.md#tauri-shell),
[Leonardo key door](../../crates/cc-beacons/src/art/key.rs).

The implemented native `auth.twitch.revoke` path disconnects through the bridge,
which deletes its credential entry and invokes the native store's full-purge
callback. A finished login/logout settings workflow is not documented as
available in this desktop cut. Closing the shell stops services but does not
revoke authorization or erase recordings. See the
[privacy notice](../privacy.md#forget-and-purge) and
[revocation implementation](../SECURITY.md#revocation-and-purge_all).
