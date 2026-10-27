# Castle Control user guide

Draft for owner review, checked against `c3dea03` on 2026-10-28. This is a guide
to the current development build. Fixture previews and offline core methods do
not establish live Twitch or OBS acceptance. Public release remains pending.

| Page | What it covers |
| --- | --- |
| [Install](install.md) | Windows prerequisites, unsigned NSIS packaging and development launch |
| [Login](login.md) | Owner test-channel device authorization and keychain custody |
| [Gatehouse](gatehouse.md) | Watching rules, consensus, recording imports and replay |
| [Lot Chamber](lots.md) | Draw guardrails, seal/cast, fixture limits and proof download |
| [Beacons](beacons.md) | Visual configuration, curves, simulation and overlay limits |
| [Map Room](map-room.md) | Local war-table preview and locked Extension stages |
| [Verify a writ](verifier.md) | Offline CLI/web verification and independent quicknet trust |
| [Extension service self-hosting](self-hosting.md) | Stub: M4 service is not built yet |
| [Privacy notice](../privacy.md) | Local data, retention, erasure and optional provider calls |

Start with the isolated fixture preview if you only want to explore. It is
labelled simulated, and its Steward proposals change only the simulated
presentation after a human seal. An unknown core status is not a live result.
See [desktop modes and shortcuts](../../apps/desktop/README.md) and the
[submission checklist](../submission/checklist.md) for outstanding live exits.

Keys 1 through 4 open the chambers; 0 opens Overview, `/` focuses the Steward,
and Escape returns to the originating Keep/Overview surface. Typing in an
input suppresses navigation shortcuts. Details are in the
[shared shell instructions](../../apps/desktop/README.md#ai-first-keep-and-overview-ai-3--ai-4).
