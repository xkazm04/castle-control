# Lot Chamber: verifiable draws

Draft for owner review, updated 2026-10-29.
Open `#/chamber/lottery` or press 1. Native live mode now supports an explicitly
enabled, pinned quicknet source and a separate cast-fed OBS draw page. The owner
test-channel run and captured M2 evidence remain pending. Sources:
[core draw status](../../crates/cc-core/README.md#offline-lots-module-wp-2122),
[draw engine](../../crates/cc-lots/README.md).

## Fixture preview

The browser preview offers sample draw settings, an urn, policy reasons and a
saved simulated proof bundle. The saved proof is a fixed vector separate from
the editable sample pool; changing a preview is not generating a new verified
live writ. The fairness explanation and proof controls stay available.
Steward/design drafts remain `DRAFT` until sealed and change only simulated
presentation. Sources: [room behavior](../../apps/desktop/src/rooms/README.md),
[fixture model](../../apps/desktop/src/lots-model.ts).

## Connected core workflow and its limits

The core room can refresh/select configured draws, change winner count, check
guardrails and look up an entry by Twitch user ID. A continuous seal hold freezes
the eligible roll; **Cast the lots** asks core for the derived winners. Open
**Proof bundle**, then **Download proof bundle** to save the writ JSON for
[independent verification](verifier.md). Sources:
[connected controls](../../apps/desktop/src/rooms/lottery/core.tsx),
[validated client](../../apps/desktop/src/lots-core.ts).

The native shell launched with its public client ID and owned test channel uses
system time and the shadow Gatehouse pipeline. Only committed Pass decisions
admit chat to the pool. It does not seed viewers. **Create no-prize question
draw** creates a one-winner, equal-odds `!join` pool when that draw is absent.
Without the explicit `live-quicknet` file below, live quicknet sealing refuses
plainly; it never substitutes recorded randomness. Non-native fixture cores
retain the fixed clock and recorded public round, labelled simulated. A
live-test environment flag does not enable quicknet.
Sources: [offline registration](../../crates/cc-core/src/offline.rs),
[recorded/live beacon status](../../crates/cc-core/README.md#offline-lots-module-wp-2122).

## What the proof establishes

A draw freezes its canonical roll and SHA-256 seal before a selected future
beacon round. The proof core verifies the round's signature and derives winners
by seeded rejection sampling; animation consumes that result. Commit/reveal
fallback is labelled **streamer-controlled**. Downloaded proofs expose entry
handles and weights, so review them before sharing. Sources:
[proof algorithm and trust](../../crates/cc-verify/README.md),
[writ format](../../crates/cc-verify/src/lib.rs).

Sealed settings cannot be edited. Successful cast retries return the stored
result. An unfinished sealed attempt is memory-only and cannot resume after a
restart; a failed cast attempt is consumed. Keep the original public seal
announcement as well as the final writ: a file alone cannot establish that the
seal was announced on time or exclude discarded runs. Sources:
[draw lifecycle](../../crates/cc-core/README.md#offline-lots-module-wp-2122),
[verifier limitations](../../crates/cc-verify/README.md).

## Guardrails and live exit

Prize draws block paid entry/weight and unconfirmed high-value registration by
default. Subscriber-only or points-only entry without a free path receives a
warning. The core has no risk-acknowledgement RPC that unlocks a blocked policy.
For a live prize draw, the rules template, equal-odds free path, disclaimer and
age/region settings must be prepared. Use a no-prize question draw for the floor
demo. Sources: [policy engine](../../crates/cc-lots/README.md),
[live demo constraints](../submission/checklist.md#floor-build-and-live-evidence).

The remaining M2 exit requires a post-verdict pool on the owner's test channel,
an announced seal and trusted signed round, the cast-fed OBS visual, and matching
CLI/web verification. This guide does not mark those live steps complete.

## M2 live run

Owner-attended test only, after the Director's spike clearance. Keep every rule
Watching (shadow); use only the owner's test accounts and a **no-prize question
draw**. This implementation sends no Twitch chat or moderation write. A crisis
or held message cannot enter the pool. Cloud classification remains opt-in.

### Start and opt in

From the repository root on Windows, with OBS open, obs-websocket v5 configured,
and the owner's Twitch application/keychain setup already completed:

```powershell
# Do not install over a build worktree's node_modules junction.
pnpm --config.verify-deps-before-run=false --filter @castle-control/desktop build
# Tauri's Windows app-data store (same root used by host.rs).
$lotData = Join-Path $env:APPDATA 'io.castlecontrol.desktop/store'
New-Item -ItemType Directory -Path $lotData -Force | Out-Null
# Public local opt-in, not a credential. Read once at native module startup.
Set-Content -LiteralPath (Join-Path $lotData 'live-quicknet') -Value 'enable-live-quicknet' -Encoding ascii
cargo run --locked -p cc-desktop --features custom-protocol -- --client-id YOURPUBLICCLIENTID --test-channel YOUR_OWN_TEST_CHANNEL --login
```

Use your actual **public** client ID/channel arguments. Supply credentials only
through the existing login/keychain flow. `--obs-port` and
`--obs-password-label` are the existing optional native launch settings; the
label names a keychain entry, never its password. Never capture device codes,
launch capabilities, tokens or keychain contents as evidence. Quit the app and
remove only the `live-quicknet` file to disable the opt-in on the next launch.
Malformed opt-in files refuse module startup. The chain hash, BLS public key,
three-second schedule and genesis are compiled into `lots/live_beacon.rs`;
HTTP responses cannot replace them.

### Pool, announcement, round and OBS

1. Open the Lot Chamber. If `questions` is absent, click **Create no-prize question draw**.
   Confirm keyword `!join`, one winner and no prize. Use the saved `questions`
   draw for the source URL below. Changing setup resets the open pool, so finish
   setup before test accounts join.
2. Send `!join` from the owned test accounts. In **Entry lookup**, enter each
   account's numeric Twitch ID. Capture eligible results and the Gatehouse
   decision evidence. Wait at least one second after the last message before
   sealing (the proof format records whole-second seal times).
3. Find the separate, read-only draw origin while the native shell is running:

   ```powershell
   $lotProcess = Get-Process -Name cc-desktop | Select-Object -First 1
   $lotSource = $null
   foreach ($lotPort in (Get-NetTCPConnection -OwningProcess $lotProcess.Id -State Listen -LocalAddress 127.0.0.1).LocalPort) {
     $candidate = "http://localhost:$lotPort/lots/questions"
     try {
       $page = Invoke-WebRequest -Uri $candidate -UseBasicParsing -TimeoutSec 2
       if ($page.Content -like '*Castle Control draw*') { $lotSource = $candidate }
     } catch { Write-Verbose 'This listener is not the read-only draw source.' }
   }
   if (-not $lotSource) { throw 'Draw source unavailable; check native launch.' }
   $lotSource
   ```

   This probes local HTML only and uses no session token. In OBS, add a Browser
   source using that URL, 1280×720; keep **Refresh browser when scene becomes
   active** available. It initially says it is waiting for an accepted seal.
   The existing `obs.source.create` accepts the same owned URL after sealing;
   this runbook uses OBS's Browser-source dialog without exposing a capability.
4. Start OBS recording **before** holding **Seal the roll**. A successful seal
   synchronously publishes the existing `lots.sealed` event and the draw page's
   commitment/target round before returning to the desktop. The desktop shows
   **Seal announced** and **Live-trusted quicknet · target round …**. OBS shows
   the same seal and target round; capture both before the round arrives.
   Recorded cores stay labelled **Recorded · simulated**. No Twitch chat
   announcement is sent.
5. Wait until strictly after the target round's time, then click **Cast the
   lots**. Its time is `2023-08-23T15:09:27Z + 3 × (round − 1)` seconds. The
   current desktop requests a six-second seal margin; waiting 12 seconds after
   the announcement covers that margin and normal publication lag. An early
   Cast returns `conflict` without consuming the pending draw: wait and retry.
   A transport/signature failure consumes that attempt; preserve its evidence
   and start a fresh, separately announced roll. Never call a failed cast a win.
6. Capture OBS's winners with the seal. The HTML page refreshes once a second
   and renders only the core's verified `lots.cast` result; it never samples
   winners. This is a simple result plate, not the fixture urn animation. The
   source port changes across launches. A restart cannot resume a sealed
   attempt. Reconnect/authorization loss is not proof of an uninterrupted run.

### Writ and independent outputs

Open **Proof bundle**, then **Download proof bundle**. Save the `lots.writ.get`
result as `castle-control-writ.json` in an owner-controlled evidence directory.
Prepare this independent official trust file as `trusted-chain.json` beside it
(also compare it against the separately bundled official anchor in the web
verifier; never extract trust from the imported writ):

```json
{"hash":"52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971","public_key":"83cf0f2896adee7eb8b5f01fcad3912212c437e0073e911fb90022d3e760183c8c4b450b6a0a6c3ac6a5776a2d1064510d1fec758c921cc22b0e17e63aaf4bcb5ed66304de9cf809bd274ca73bab4af5a6e9c76a4bc09e76eae8991ef5ece45a","genesis_time":"2023-08-23T15:09:27Z","period_s":3,"scheme":"bls-unchained-g1-rfc9380"}
```

```powershell
cargo run --locked -p cc-verify --bin cc-verify -- .\castle-control-writ.json --chain .\trusted-chain.json | Tee-Object -FilePath .\cli-verified.json
```

Require exit 0 and the same seal/winners. Open
`packages/verifier-web/index.html` from disk, choose that **same** writ file in
its import control, and retain the verified outcome screenshot with matching
seal/winners. It verifies official-chain imports against its own bundled
anchor, without network access. A bundled example is not this live draw.
Keep `obs-announcement-and-result` recording, desktop pool/announcement
screenshots, the downloaded writ, `trusted-chain.json`, `cli-verified.json` and
the web-verifier screenshot together, with the UTC run interval. Local audit
files are under `$lotData/gatehouse/store/decisions.jsonl` and
`$lotData/lots/store/draws.jsonl`; the writ is also stored under the Lots store's
managed inventory. Do not commit real chat or viewer-bearing writs. The
announcement recording establishes timing; a downloaded writ alone cannot.

Offline regression commands (no Twitch/drand network; loopback OBS is fake):

```powershell
cargo test --locked -p cc-core --test lots_live --test live_beacon
pnpm --config.verify-deps-before-run=false --filter @castle-control/desktop exec vitest run src/lots-core.test.ts src/lots.test.tsx --pool=threads
```

The export test writes a temporary writ from `lots.writ.get`, runs `cc-verify`
offline against it, compares the seal/winners, then cleans up the simulated
files. The owner-run HTTPS test remains ignored. No live M2 exit is claimed by
these recorded tests; the Director updates the submission checklist only after
reviewing the genuine owner-run evidence above.
