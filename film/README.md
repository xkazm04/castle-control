# film/ - the Castle Control demo film (draft)

A 3:14 film with no narration. The music is the owner's own track. Every module's
setup and result explains itself through picture and captions. The film is built
with the demo-film kit (`ai-registry/skills/demo-film`), as the Athena submission
film was (`kiro/athena-portable/film`): one `film.json` drives the capture and the
Remotion cut, and the cut is a command.

Status: **draft, 2026-11-01.** `film.json` is timed and passes the kit contract
(`narrate --dry`: 3:14, 194000 ms of maxMs 194000). Nothing below is built yet:
no capture adapter, no bespoke heroes, no take, no render.

## How the kit is used without a voice

- Every beat has `line: ""` and `breathMs` is 0, so the kit's hold is exactly
  `settleMs` (`holdMs = max(estimate(""), settleMs) + 0`). **The sum of `settleMs`
  is the film length.** Transitions add no frames (the kit animates half a
  transition on each side of the cut).
- Never run `narrate` for real, and **never run `music`**. The single cue `bed`
  is the owner's track "Count Us All" (194.88 s, 48 kHz WAV, about 85 BPM,
  -15.5 LUFS; sound from 0.00 s to 193.36 s). It is copied to
  `audio/music-bed.wav`, which is gitignored: copy it from the owner's Downloads
  on a fresh clone. Its `manifest.music.bed` entry is hand-written with an
  `owner:` hash. `music.mjs --dry` reports the cue as "to generate" because
  that hash is not its own, so a real run would replace the track. `narrate --dry`
  keeps `manifest.music`.
  The kit's gate "zero estimated beats" does not apply to a film with no voice.
  Every beat is "estimated" by design.
- The kit fades music in over 300 ms and out over 1000 ms. The render masters to
  -14 LUFS. Its whoosh fx sits on every transition: listen against the track and
  drop it if it fights the music.
- **Grid: half bars at 85 BPM** (2 beats = 1411.76 ms). Each cut sits on the
  nearest millisecond to a half-bar line, counted from the track's first
  sample, through 3:00.7. The outro (`end`, 13294 ms) carries the remainder,
  and the kit's 1 s fade lands on the track's own silent tail. The BPM is
  approximate and the downbeat is assumed at 0.00 s. Section markers come
  later, once the app is finished: then move cuts to the sections and keep
  the total at 194000.

## Structure (194 s, in half bars at 85 BPM)

| Segment | Time | Half bars | Beats (half bars) |
|---|---|---|---|
| Intro | 0:00.0-0:14.1 | 10 | open-mark 3, open-keep 4, open-promise 3 |
| Gatehouse | 0:14.1-0:56.5 | 30 | gh-title 3, gh-setup 7, gh-impact 13 (split), gh-drill 7 |
| Lot Chamber | 0:56.5-1:47.3 | 36 | lot-title 3, lot-setup 7, lot-fill 6, lot-seal 7, lot-cast 8 (OBS full), lot-proof 5 |
| Beacons | 1:47.3-2:26.8 | 28 | bea-title 3, bea-setup 7, bea-fire 13 (split), bea-peak 5 (OBS full) |
| Map Room | 2:26.8-2:46.6 | 14 | map-title 3, map-design 5, map-spyglass 6 |
| Built with Codex | 2:46.6-3:00.7 | 10 | codex-claim 4, codex-count 6 |
| Outro | 3:00.7-3:14.0 | remainder | end 13294 ms |

Every module follows one grammar, so a viewer learns it once:

1. **Chapter card (4 s):** number, chamber name, one line, and three step chips.
2. **Setup:** the app only. A caption names the step, and a callout points at
   the control that changed.
3. **Impact:** the app and OBS together, or a whip to OBS full frame at the
   moment of the action.
4. **Result:** a held end state with a figure or a short claim.

Caption rules: at most 7 words per line (the kit's KineticClaim keeps 6 words),
at least 2.5 s on screen, at most two captions at once.

## Stage: Dress rehearsal, isolated OBS

- **App:** the built desktop in Dress rehearsal (`cc-desktop --rehearsal`,
  `apps/desktop/README.md`). It is the real native core with no Twitch session,
  separate rehearsal stores, and the title "Castle Control · SIMULATED · Dress
  rehearsal". Its scenarios supply generated chat: `LotsFill` (20 `!join`),
  `VoteRound`/`DuelRound` (30 ballots), `BeaconFire` (100 bits).
- **CDP:** `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222`
  on a bundled debug build, as in Athena and `e2e/tauri/`.
- **OBS:** the isolated OBS of the night lane (`scripts/night/obs.mjs`:
  `--multi`, its own profile and scene collection, per-run websocket password
  held in memory). The app connects with `obs.connect` and ensures the scene
  `Castle Control · Rehearsal`. The owner's OBS profile is never touched.
- **Recording, two streams:**
  - `take/app.mp4`: ffmpeg `ddagrab` of the app window region, as in Athena's
    `lib/desktop.mjs`.
  - `take/obs.mp4`: OBS records its own program output through obs-websocket
    `StartRecord`/`StopRecord` (the night lane's `e2e/night/obs-ws.ts` client),
    clean 1080p with no window chrome.
  - **One clock:** a full-frame magenta flash at the start and end of the take
    is drawn in the app *and* in an OBS colour source at the same instant. Both
    files are put on the take clock from the flash frames (Athena's two-flash
    method). `take.json` carries `record.obsOffsetMs` for the split hero.

## Bespoke heroes (`film/local/index.tsx`, at the kit limit of 3)

| Hero | Does | Props |
|---|---|---|
| `ChapterCard` | the module card: number, name, line, step chips | `index`, `name`, `line`, `steps[]` |
| `SplitStage` | plays `take/obs.mp4` beside the app footage (`split`, 60/40 toward `lead`, an animated divider) or over it (`full`). It reads `obsOffsetMs` from the run record | `mode`, `lead`, `appLabel`, `obsLabel` |
| `ProvenanceChip` | a corner chip on every captured beat | `text` |

`SplitStage` exists because the kit's picture lane plays one take per beat. The
OBS file has to be drawn in the motion lane. If a fourth hero seems needed, the
kit is missing a plate: say so in the kit's LESSONS.md instead.

## Honesty boundary

- **Real:** the desktop app, its native core, the isolated OBS, every click
  and wait, the public drand round, and the verifier's result.
- **Simulated (and labelled on screen):** all chat, ballots, entries and bits
  come from the rehearsal scenarios. `ProvenanceChip` reads "SIMULATED · dress
  rehearsal" on every captured beat, and the app and overlay keep their own
  SIMULATED badges. Map Room is a local SIMULATED preview: no Extension claim.
- **Explanatory (added by the film):** chapter cards, captions, callouts, the
  Codex count.
- No real chat, no login screen, no keychain screen, no owner OBS profile. If
  a real participant appears, stop the take (repo law, `CLAUDE.md`).
- A moment with `claim` must sit on footage that shows it. `check` enforces
  this (the promise ledger).

## Capture plan (`film/capture.mjs` + `film/plan.mjs`, to build)

Target keys are logical names (`app|rule-bench`, `obs|program`), not CSS. The
adapter maps each key to a Playwright locator and logs its rect under the key,
so the film adds no attributes to the product. The routes and accessible names
below come from `origin/main` e2e journeys. **Probe them on the live
rehearsal DOM before the take**, because the Cutaway port re-skinned the shell.

| Beat | Route | Actions | Targets → locator |
|---|---|---|---|
| open-keep | `#/keep` | none (`from: ready`) | keep → `main` |
| gh-setup | `#/chamber/moderator` | Watching rule name + match pattern, "Draft matches" | feed → `.moderator-feed`; rule-bench → region "Rule bench" |
| gh-impact | same | `rehearsal.start` with `DuelRound`; OBS shows `/gatehouse/current` vote bar | feed; program = OBS file |
| gh-drill | `#/keep` moat or "Run the drill" | open the finished moat (`from: ready`) | moat → `.moat-report` (`apps/desktop/src/moat/moat-report.tsx`) |
| lot-setup | `#/chamber/lottery` | Draw name, Eligible pool = keyword `!join`, Winners, Content type = question | draw-form → the form; guardrails → `.cc-desk` |
| lot-fill | same | `LotsFill` scenario; record `entries` = entry count read off the page | entries (probe) |
| lot-seal | same | "Hold to seal"; wait "Entry list frozen" | seal (probe the seal hash line) |
| lot-cast | OBS | wait for the drand round, then cast; footage from the OBS plate with winners (`from: ready`, the wait is cut out) | program |
| lot-proof | writ, then `packages/verifier-web` | export the writ, open it in the web verifier; record that winners match | verify (probe) |
| bea-setup | `#/chamber/visuals` | pick a visual ("Beacon visuals"), drag the curve in "Kindling curve editor" | curve → form "Kindling curve editor" |
| bea-fire | same | `BeaconFire` (100 bits); OBS `/beacons/{id}` climbs | events → table of contribution events; program |
| bea-peak | OBS | hold on the beacon at its peak (`from: ready`) | program |
| map-design | `#/chamber/studio` | inspect "House Tallow banner", "Replay local reveal" | map → figure "Session-only map preview" |
| map-spyglass | same | "Spyglass", wait for "Simulated viewer pick" | spyglass → status "Simulated viewer pick" |

Athena's adapter rules apply as written: drive each beat for its hold, never
let a jump land in the window, start page-change beats `from: "ready"`, assert
each beat's end state and carry on, and fail the run at the end.

Figures: `entries` comes from lot-fill's record. `workPackages` (codex-count)
is counted from git by a small `film/figures.mjs` and pinned with its commit,
as in Athena's `figures.pinned.json`.

## Commands (once built)

```powershell
cd <kit>; npm ci                                   # once
node scripts/night/obs.mjs                         # the isolated OBS (or the film's own launcher)
node film/capture.mjs                              # app + OBS take, writes film/take/take.json
node <kit>/tools/check.mjs film --balance overlay
node <kit>/tools/render.mjs film --balance overlay --out film/out/castle-overlay.mp4
```

Render `overlay` and `sandwich` and pick by watching. `led` puts motion first,
which works against a no-narration film whose picture has to carry the story.

## Open items

- Owner, later: the track's section markers, once the app is finished. Then
  re-balance the segments against them.
- `brand/mark.png` is a placeholder crest (gules shield, paper castle, or
  beacon, from the token palette), drawn for the film. Replace it if a real
  mark arrives. The end card links github.com/xkazm04/castle-control.
- Dress rehearsal's D4 UI is not on main yet. Until it lands, the adapter calls
  `obs.connect`, `obs.scene.ensure` and `rehearsal.start` over the core RPC.
- Build: `capture.mjs`, `plan.mjs`, `lib/` (port Athena's `desktop.mjs` and its
  window layout), and the three heroes.
- Map Room is in active development. Its two beats are the most likely to need
  re-probing.
