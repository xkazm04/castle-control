# Demo film: current state and next steps

Handoff for the sessions that build and shoot the demo film. As of 2026-11-01
the film is **designed and timed, not built**. Read this first, then the
working notes in [`film/README.md`](../../film/README.md), which say how the
kit is used, the stage, the heroes, the honesty boundary and the capture plan.

## The film in one paragraph

A 3:14 (194000 ms) film with **no narration**. The only audio is the owner's
track "Count Us All" (about 85 BPM). Each chamber explains itself through a
chapter card, captions, callouts, and the real app beside or followed by OBS
showing the on-stream effect. It is built with the demo-film kit
(`../ai-registry/skills/demo-film`) the way the Athena film was
(`kiro/athena-portable/film`): `film/film.json` drives capture and render, and
the cut is a command.

## What exists

| File | State |
|---|---|
| `film/film.json` | 23 beats timed on a half-bar grid at 85 BPM. Contract-valid: the kit's `narrate --dry` reports 3:14 (194000 ms) of maxMs 194000 |
| `film/README.md` | working notes: kit usage without a voice, stage, recording, heroes, boundary, capture plan with locators |
| `film/audio/manifest.json` | the `bed` cue → `audio/music-bed.wav`, hand-written with an `owner:` hash |
| `film/audio/music-bed.wav` | **gitignored.** Copy it from `C:\Users\kazda\Downloads\Count Us All.wav` on each clone. 194.88 s, 48 kHz; sound from 0.00 s to 193.36 s |
| `film/brand/mark.png` | the official crest (Leonardo, cut onto transparency, 1024×1024) |
| `docs/assets/banner.jpg` | the README header banner, the same artwork family |

Nothing else is built: no capture adapter, no heroes, no take, no render.

## Timeline

| Segment | Time | Beats |
|---|---|---|
| Intro | 0:00.0-0:14.1 | open-mark, open-keep, open-promise |
| Gatehouse | 0:14.1-0:56.5 | gh-title, gh-setup, gh-impact (app + OBS split), gh-drill |
| Lot Chamber | 0:56.5-1:47.3 | lot-title, lot-setup, lot-fill, lot-seal, lot-cast (OBS full), lot-proof |
| Beacons | 1:47.3-2:26.8 | bea-title, bea-setup, bea-fire (split), bea-peak (OBS full) |
| Map Room | 2:26.8-2:46.6 | map-title, map-design, map-spyglass |
| Built with Codex | 2:46.6-3:00.7 | codex-claim, codex-count |
| Outro | 3:00.7-3:14.0 | end (github.com/xkazm04/castle-control) |

## Decisions already taken (do not re-ask)

- Length **194 s**, to fit the music. The 180 s cap in
  `docs/submission/floor-demo-script.md` belongs to the earlier narrated plan.
- No narration. Captions are at most 7 words and on screen at least 2.5 s.
- Map Room is in the film (20 s), labelled SIMULATED.
- Stage: Dress rehearsal (`cc-desktop --rehearsal`) plus the isolated night
  OBS (`scripts/night/obs.mjs`). Never the owner's OBS profile, never real chat.
- Two recordings, app (`ddagrab`) and OBS (`StartRecord`), on one clock from
  two magenta flashes.
- Three bespoke heroes: `ChapterCard`, `SplitStage`, `ProvenanceChip`.
- Target keys are logical names mapped to Playwright locators. No product
  attributes are added for the film.
- Render `overlay` and `sandwich` and choose by watching. `led` is rejected.
- Section markers are deferred until the app is complete. Then re-balance the
  cuts and keep the total at 194000.

## Traps

- **Never run the kit's `music.mjs` for real.** It treats the owner's track as
  stale and would generate a replacement over it. Never run `narrate` for real.
- The kit's "zero estimated beats" gate does not apply: every beat is
  estimated by design, and `settleMs` is the length.
- The render refuses a missing `style.logo` (`film/brand/mark.png`).
- Dress rehearsal's UI (D4) is not built. Drive `obs.connect`,
  `obs.scene.ensure` and `rehearsal.start` over the core RPC until it lands.
- Re-probe the locators on the live rehearsal DOM before a take. Map Room
  changes the most.

## Next steps, in order

1. Port Athena's `film/lib/desktop.mjs` (window layout, `ddagrab`, flash clock)
   and write `film/capture.mjs` and `film/plan.mjs`. Add OBS
   `StartRecord`/`StopRecord` through `e2e/night/obs-ws.ts`.
2. Build the heroes in `film/local/index.tsx`, then run
   `node <kit>/tools/check.mjs film --balance overlay`.
3. Dry walk: drive every beat once without recording, before a real take.
4. Take, render `overlay` and `sandwich`, and watch both against the music.
5. Once the app is final: section markers, re-balance, final render, and the
   owner's sign-off.

The design record is in `.spark/Spark/ideas/demo-film.md`, which is not
version-controlled.
