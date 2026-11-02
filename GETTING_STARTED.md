# Getting started with Castle Control

This guide takes you from a fresh checkout to Castle Control running beside
OBS on your Twitch channel, one chamber at a time. Follow it in order. Each
part builds on the one before, and you can stop after any part.

| Part | You get | Needs |
| --- | --- | --- |
| [1. Try it in the browser](#1-try-it-in-the-browser) | Every screen on sample data | Node.js and pnpm |
| [2. Build the desktop app](#2-build-the-desktop-app) | The real app and core on your PC | Rust and the Windows build tools |
| [3. Connect OBS](#3-connect-obs) | Castle Control can add sources to your scenes | OBS Studio 28 or newer |
| [4. Dress rehearsal](#4-dress-rehearsal) | Every chamber running against your OBS with a generated crowd | Parts 2 and 3 |
| [5. Connect Twitch](#5-connect-twitch) | Your real chat, cheers and subs reach the app | A Twitch developer application |
| [6. Integrate each chamber](#6-integrate-each-chamber) | Gatehouse, Lot Chamber, Beacons and Map Room on your stream | Parts 3 and 5 |
| [7. Optional: AI design and the Steward engine](#7-optional-ai-design-and-the-steward-engine) | Generated art and a model-driven Steward | An OpenAI key or a Codex / Claude Code sign-in |

> **Project status.** Castle Control is hackathon software. Every chamber is
> wired to the real core, but the long live acceptance runs (a two-hour
> moderation shadow run, a recorded fair draw on a test channel, a real cheer
> timed on OBS) are not finished yet. Start on a **test channel** with accounts
> you own. Move to your main channel only once you trust what you have seen.
> There is no signed installer yet, so you build from source.

## Before you begin

- **Windows 10 or 11.** Windows is the first supported platform. macOS and
  Linux builds are not ready.
- **Node.js 24.14.0 or newer** and **pnpm 11.3.0**
  (`corepack enable; corepack prepare pnpm@11.3.0 --activate`).
- **Rust** through [rustup](https://rustup.rs). The repository's
  `rust-toolchain.toml` picks the exact version.
- **Visual Studio Build Tools** with the *Desktop development with C++*
  workload (the MSVC compiler and the Windows SDK).
- **WebView2 Runtime.** It ships with Windows 11. On Windows 10, install it
  from Microsoft if it's missing.
- **OBS Studio 28 or newer**, which includes obs-websocket v5.
- **Git**.

Castle Control never asks you to paste a token, password or key into a
command line, a config file or chat. Secrets live in the Windows Credential
Manager, and the app refers to them by a label only.

## 1. Try it in the browser

This takes about two minutes and needs no Rust, OBS or Twitch.

```powershell
git clone https://github.com/xkazm04/castle-control.git
cd castle-control
pnpm install --frozen-lockfile
pnpm --filter @castle-control/desktop dev
```

Open the address Vite prints (usually `http://127.0.0.1:5173/`). You land on
**the Keep**, with four lit windows, one per chamber.

- Press `1`–`4` to open the Lot Chamber, Gatehouse, Beacons and Map Room. Esc
  returns to the Keep.
- Use the sun and moon button in the header to switch between day and night.
- Talk to **the Steward**, the bar at the bottom of each chamber. It walks you
  through setup. Nothing it proposes takes effect until you **hold to seal**.
- Open **See it on stream** from the Keep (`#/demo`) to see the overlays
  composed on a sample stream in six art styles.

Everything in the browser preview is generated and labelled **SIMULATED**.
It never contacts Twitch or OBS.

## 2. Build the desktop app

The desktop app embeds the frontend and runs the real Castle Control core on
your PC. Build the frontend once, then build the native app:

```powershell
pnpm --filter @castle-control/desktop build
cargo build --locked -p cc-desktop --features custom-protocol
```

The first Rust build takes several minutes. Then run it:

```powershell
.\target\debug\cc-desktop.exe
```

With no options, the app starts a real core with nothing connected. The
header shows Twitch and OBS as disconnected or unknown, and that is expected.
It never logs in or takes moderation actions on its own.

Optional: run the full local check, the same one CI runs:

```powershell
pnpm gate
```

> Rebuild the frontend (`pnpm --filter @castle-control/desktop build`)
> whenever you pull new code. The `custom-protocol` feature embeds whatever
> is in `apps/desktop/dist` at build time.

### Launch options used in this guide

| Option | What it does |
| --- | --- |
| `--rehearsal` | Start in Dress rehearsal: real core, no Twitch, separate storage |
| `--client-id <id>` | Your Twitch application's public client ID (not a secret) |
| `--test-channel <login>` | The channel login to connect to, such as `mychannel` (not a URL) |
| `--login` | Start Twitch device-code sign-in on this launch |
| `--overlay-port <port>` | Serve the OBS overlays on a fixed port so browser-source URLs stay the same between launches |
| `--obs-port <port>` | The obs-websocket port, if it isn't 4455 |
| `--obs-password-label <label>` | Which Credential Manager entry holds the OBS password (default `streamer`) |
| `--steward-live` | Let a configured AI engine drive the Steward (see part 7) |

**Always pass `--overlay-port`** (for example `17891`) once you start adding
sources to OBS. Without it, the overlay port changes on every launch, and you
would have to re-add each browser source.

## 3. Connect OBS

### 3.1 Turn on obs-websocket

1. In OBS, open **Tools → WebSocket Server Settings**.
2. Tick **Enable WebSocket server**. Keep port **4455** unless you need another.
3. Tick **Enable Authentication** and set a strong password.
4. Click **Apply**.

### 3.2 Store the OBS password in Credential Manager

Castle Control reads the OBS password from the Windows Credential Manager. It
never reads it from a command line or a file.

1. Open **Control Panel → Credential Manager → Windows Credentials**.
2. Click **Add a generic credential** and fill it in:
   - **Internet or network address:** `streamer.castlecontrol-obs`
   - **User name:** `streamer`
   - **Password:** your obs-websocket password
3. Click **OK**.

If you use a different label with `--obs-password-label mylabel`, the address
becomes `mylabel.castlecontrol-obs` and the user name `mylabel`.

You can also connect from the **Dress rehearsal** screen (part 4). It asks for
the password in a masked field and offers to remember it in the keychain for
you.

### 3.3 Add Castle Control's outputs to a scene

Each chamber has a transparent browser source for OBS:

| Output | Chamber | Shows |
| --- | --- | --- |
| Beacons visual | Beacons | A visual that bits, subs and gifts kindle |
| Gatehouse vote bar | Gatehouse | An aggregate chat vote bar: no names, no messages |
| Duel stage | Map Room | The chat duel and its bracket |
| Lot plate | Lot Chamber | The sealed draw's seal, target round and winners |

1. Launch the app with a fixed overlay port:
   `.\target\debug\cc-desktop.exe --overlay-port 17891`
2. From the Keep, open **Set up OBS** (`#/stream`).
3. Refresh. The page should say **OBS is listening**. If it says OBS is not
   listening, check part 3.1.
4. Type the name of an existing OBS scene exactly as OBS shows it. Then pick a
   size: **1080p**, **720p** or **vertical**.
5. For each output, either **hold to add** it straight into that scene, or
   **copy** its browser-source URL and add it in OBS yourself (**+ → Browser**).
   You can also ask the Steward to **add every output** at once.
6. The Lot plate is added per draw from the Lot Chamber (see part 6.2).

In OBS, keep the browser sources' backgrounds transparent. Don't add custom
CSS. Castle Control's pages carry their own styling.

## 4. Dress rehearsal

Dress rehearsal is the safest way to learn the app. It runs the **real core**
against **your OBS**, with no Twitch session and a separate store, so nothing
you do here touches your real settings or your channel. A generated crowd
stands in for viewers, and its chat is labelled SIMULATED.

```powershell
.\target\debug\cc-desktop.exe --rehearsal --overlay-port 17891
```

The window title reads **Castle Control · SIMULATED · Dress rehearsal**. You
can also enter and leave rehearsal from the Keep. The app relaunches itself.

1. Open **Dress rehearsal** (`#/rehearsal`).
2. Connect to OBS with host `127.0.0.1`, port `4455` and your password. The
   app creates and uses its own scene, **Castle Control · Rehearsal**, and never
   touches your other scenes.
3. Set the crowd's pace (0–600 messages a minute) and start it.
4. Run the scenarios and watch each chamber react, in the app and in OBS:
   - **Fill a draw:** 20 generated viewers type `!join` in the Lot Chamber.
   - **Vote round:** 30 generated opinions fill the Gatehouse vote bar.
   - **Duel round:** 30 generated `1` / `2` ballots decide a Map Room match.
   - **Beacon fire:** a generated 100-bit burst kindles a Beacons visual.
   - **Armed rule:** in the Gatehouse, arm a rule and watch it propose
     SIMULATED bans for you to review and confirm.
5. When you're done, **clean up**. This removes only what rehearsal added to
   OBS.

Rehearsal blocks Twitch login, and generated chat can never be mistaken for
real chat: every message comes from a `simulated_viewer_<n>` account.

## 5. Connect Twitch

### 5.1 Register a Twitch application (once)

1. Sign in at the [Twitch Developer Console](https://dev.twitch.tv/console/apps)
   with your streamer account and click **Register Your Application**.
2. **Name:** anything, for example `Castle Control (my channel)`.
3. **OAuth Redirect URLs:** `http://localhost`. Device-code login doesn't use
   it, but the form requires one.
4. **Category:** *Application Integration*.
5. **Client Type:** **Public**. Device-code login needs a public client, and
   Castle Control never uses a client secret.
6. Save, then copy the **Client ID**. It is public and safe to pass on the
   command line.

### 5.2 Sign in from the app

```powershell
.\target\debug\cc-desktop.exe --client-id YOUR_CLIENT_ID --test-channel your_channel_login --overlay-port 17891 --login
```

1. The app opens Twitch's activation page in your browser and shows a short
   code in a dialog.
2. Enter the code on Twitch, signed in as the channel owner, and approve the
   requested access.
3. The header's Twitch chip turns connected.

The token is stored in Credential Manager (`castlecontrol-twitch`). On later
launches, leave out `--login` and the app reuses it. Don't show the
activation code or the dialog on stream.

**Use a test channel first.** Create a second Twitch account as your test
channel, and a third as an owned test viewer. Do every step in part 6 there
before you point Castle Control at your main channel.

### 5.3 What the app reads and does on Twitch

- **Reads (EventSub):** chat messages, AutoMod holds, moderator actions,
  Shield mode, suspicious users, bits (cheers), subs, resubs and gift subs.
- **Does (Helix), only after a person confirms:** warnings, timeouts and bans,
  allowing or denying AutoMod-held messages, Shield mode and chat delay.
- **Never:** it never posts in chat as you, and it never changes odds or
  outcomes because of money.

## 6. Integrate each chamber

From here on, launch the app with your Twitch options and the fixed overlay
port from part 5.2. Open each chamber with its number key.

### 6.1 Gatehouse: moderation (press `2`)

The Gatehouse sits in front of everything. Chat reaches the other chambers
only after it has a verdict.

1. **Start in Watching.** Every rule starts in *Watching* (shadow) mode. It
   records what it would have done and takes no action. Fixed safety rails,
   such as routing crisis messages to a human, are always on.
2. **Draft rules with the Steward.** Describe what to catch, for example
   "hold links from first-time chatters". Check the pattern's hits against
   chat in the room, then hold to seal.
3. **Watch a stream.** Let a full stream run in Watching. Review the decision
   history and the **consensus** chart, which describes what passed, to see
   whether the rules would have been right.
4. **Replay in the drill.** Open the drill to replay a recorded session
   through the same rules and compare its decisions with the original run.
5. **Arm a rule only when you trust it.** Armed rules propose timeouts and
   bans to a review queue, and nothing is sent to Twitch until you or a
   moderator confirm.
6. **On stream:** add the **Gatehouse vote bar** output (part 3.3) to show an
   aggregate of what chat is saying, with no names and no messages.

The Gatehouse classifies with your rules locally by default. Cloud
classification is off unless you opt in (part 7).

### 6.2 Lot Chamber: fair draws (press `1`)

Draws in the Lot Chamber are sealed before the randomness exists. Anyone can
verify the result afterwards.

**One-time: enable public randomness.** Live draws use the
[drand quicknet](https://drand.love) public randomness beacon. Turn it on by
creating a local opt-in file (it is not a secret), then restart the app:

```powershell
$store = Join-Path $env:APPDATA 'io.castlecontrol.desktop\store'
New-Item -ItemType Directory -Path $store -Force | Out-Null
Set-Content -LiteralPath (Join-Path $store 'live-quicknet') -Value 'enable-live-quicknet' -Encoding ascii
```

Delete that file to turn it off again.

**Run a question draw (no prize):**

1. Ask the Steward for a **question draw**. Keep the keyword `!join` and one
   winner. Finish the setup **before** people join, because changing the
   setup resets the pool.
2. Add the draw's **Lot plate** to OBS as a 1280×720 browser source:
   `http://localhost:17891/lots/questions`. Use your own overlay port. The
   last part of the path is the draw's name.
3. Viewers type `!join`. Only messages the Gatehouse passed enter the pool.
4. Wait a second after the last entry, then **hold to seal**. The seal and the
   future drand round it is bound to appear in the app and on the OBS plate
   *before* that round exists. That is the fairness promise, so make sure it
   is on stream.
5. A few seconds later, once the round has been published, **cast the lots**.
   The winners come from the signed public round and appear on the plate. If
   you cast too early, the app refuses and keeps the draw. Just wait and try
   again.
6. **Download the proof bundle** (the writ) and share it with chat.

**Let viewers verify it:**

- **In a browser:** open `packages/verifier-web/index.html` from disk and
  choose the writ file. It works offline, makes no network call, and shows
  the recomputed seal and winners, or REJECTED if anything was changed.
- **On the command line:**
  ```powershell
  cargo run --locked -p cc-verify --bin cc-verify -- .\writ.json --chain .\trusted-chain.json
  ```
  `trusted-chain.json` holds the quicknet chain's hash, public key, genesis
  time, period and scheme, checked from an independent source. See
  [Verify a writ](docs/guide/verifier.md).

**Giveaways with a prize** require the official-rules template and Twitch's
disclaimer, and keep a free, equal-odds entry path. Paid entry is blocked.
Check your local giveaway law before running one.

### 6.3 Beacons: visuals kindled by support (press `3`)

1. **Pick a visual** and an art style, or one of the ready-made library
   designs.
2. **Choose what drives it:** bits (cheers), subs or gift subs.
3. **Tune the curve.** Drag the kindling curve so a typical cheer makes a
   visible change and a big moment reaches full blaze. Then set how fast it
   **decays**. Save the visual to the core.
4. **Add it to OBS.** Use **Set up OBS** (part 3.3) or copy the visual's
   browser-source URL from the room. Size it to your scene.
5. **Test fire.** Fire a simulated burst, such as 50 gift subs or a chosen
   number of bits. It moves the OBS visual with a **SIMULATED** badge and
   never adds to your live totals.
6. **Go live.** Real cheers, subs and gifts now kindle the visual. The live
   contribution feed in the room lists each one as it arrives.

Money changes visuals only. It never changes draw odds or any outcome.

### 6.4 Map Room: chat duels (press `4`)

1. Ask the Steward to **start a duel**. Pick a ready-made bracket or type
   your own options, such as "which snack wins?", and set the voting window.
2. Add the **Duel stage** output to OBS (part 3.3).
3. Start the match. Viewers type `1` or `2` in chat. Only messages the
   Gatehouse passed count, and each viewer counts once per match.
4. When the window closes, the core decides the match and the bracket moves
   on, until a champion is crowned. You can pause, undo the last call or
   reset from the room.

Under **More**, the Map Room also has local demos: Showdown and Ladder duel
modes, a hex map sand table, the Spyglass viewer frames and Rehearse. They
run only inside the app and send nothing to OBS or Twitch. A Twitch Extension
for the Map Room is planned and not built yet.

## 7. Optional: AI design and the Steward engine

Castle Control works fully without AI. Out of the box, the Steward runs
scripted setup flows, and Custom design uses the built-in presets and the
library of 86 ready-made assets.

### 7.1 Generate custom designs with OpenAI

With an OpenAI API key, Custom design can generate new art for an on-stream
artifact (urn, beacon, vote bar or duel page). The core splits the art into
layers and serves the sealed design to OBS. Each generation spends OpenAI
credits on your key, and the app records an estimated cost for each one.

Store the key in Credential Manager. Never put it in a file or a command:

1. **Control Panel → Credential Manager → Windows Credentials → Add a generic
   credential.**
2. **Internet or network address:** `openai.castle-control`
3. **User name:** `openai`
4. **Password:** your OpenAI API key.

Restart the app. Custom design can now generate with OpenAI.

### 7.2 A model-driven Steward (preview)

Launching with `--steward-live` lets an AI engine drive the Steward, instead
of the scripted flows. The engine can use the **Codex CLI** or **Claude Code
CLI** with your own sign-in, or a local OpenAI-compatible model (by default
`http://127.0.0.1:11434/v1`). Every change it proposes still waits for your
seal.

This is a developer preview. There is no settings screen yet. The engine
reads `engine.*` settings (provider, executable path, model) from the app's
store. Until they are set, the Steward says which keys are missing and keeps
working in scripted mode. See the
[implementation plan](docs/plan/03-implementation-plan.md) for the setting
names.

**Cloud classification** for the Gatehouse is off by default. Turning it on
sends chat to OpenAI with your key. Enable it only after you've reviewed
Twitch's data rules and the [privacy notice](docs/privacy.md).

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Header shows Twitch *disconnected* | Launch with `--client-id` and `--test-channel`. Add `--login` the first time, or when the stored grant has expired. |
| **OBS is not listening** | Turn on the WebSocket server in OBS (part 3.1). Check the port, the Credential Manager entry (part 3.2) and `--obs-port`. |
| OBS browser source is blank after a restart | Launch with the same `--overlay-port` every time, or re-add the source. |
| The app won't start: port in use | Another program holds your `--overlay-port`. Pick another free port and update the OBS sources. |
| Cast the lots is refused | The drand round hasn't been published yet. Wait a few seconds and try again. |
| Lot draws stay *recorded · simulated* | Create the `live-quicknet` opt-in file (part 6.2) and restart. |
| The Steward says an engine is unavailable | Expected without `--steward-live` and `engine.*` settings. Scripted flows still work. |
| Changes don't show after `git pull` | Rebuild the frontend, then the desktop app (part 2). |

## Safety rules worth keeping

- Rehearse in **Dress rehearsal**, then on a **test channel**, before going
  to your main channel.
- Keep Gatehouse rules in **Watching** until you've reviewed a full stream of
  their decisions. Bans always wait for a person.
- Never show login dialogs, codes, keys or Credential Manager on stream.
- Generated data is always labelled **SIMULATED**. Never present it as real
  viewers or a real result.

## More detail

- [Chamber guides](docs/guide/README.md): [Gatehouse](docs/guide/gatehouse.md),
  [Lot Chamber](docs/guide/lots.md), [Beacons](docs/guide/beacons.md),
  [Map Room](docs/guide/map-room.md), [Verify a writ](docs/guide/verifier.md)
- [Login and credential labels](docs/guide/login.md)
- [Desktop app internals and launch modes](apps/desktop/README.md)
- [Privacy notice](docs/privacy.md)
