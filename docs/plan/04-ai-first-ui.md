# 04 · AI-first UI: the fused design (supersedes the panel pages)

**Status:** decided by the owner on 2026-10-26. This is the design the desktop app is rebuilt to, starting the night of 10-26.
Wave 2b run B: AI-6 is mounted, the Beacons page is retired, and the seal slot and Overview hold now share one seal path.
It supersedes the stacked-panel chamber pages and the rejected two-layer stage (`#/lottery/stage`, section "Two-layer chambers" in 02-ui.md).
02-ui.md still governs tokens, paper, inks, type, the rampart and the port contract's fidelity rule.

## Where it comes from
The design comes from contest `cc-ai-first`: three AI-first variants by one Opus seat, judged by the owner by eye. The owner chose a **fusion**:

> "A/1 for landing page and modules detail page. A/3 will become overview and main chat interface to see full picture, yet for going into module detail A/1 can be used as nested layer."

The references are kept read-only in this repo. Open them from disk; they load `../data/`:
- `prototype/ai-first/keep/index.html`: **The Lit Keep** (A/1). This is the landing page and the chamber detail rooms.
- `prototype/ai-first/preview/index.html`: **Preview and Proclaim** (A/3). This is the overview and the main Steward chat surface.

They are references for design, layout, motion and copy. They are **not** code to copy: the prototypes are single `core.js` files with string HTML. The port rebuilds them as components over `packages/tokens` (see "Port rules").

## The three surfaces

### 1. Landing: the Keep (from A/1, its home view)
The first screen is a printed cross-section of the streamer's castle.
- **Four chamber towers:** Gatehouse (azure), Map Room (key), Lot Chamber (gules) and Beacons (or).
- **The Herald's watch tower:** carries chat consensus.
- **The moat:** runs along the bottom and is the chat delay.
- **Each room:** shows one large word and one plain line of live state, for example "3 HELD", "NO DRAW" or "PILLAR OF FIRE", plus its key number.
- **The rampart:** stays on top.
- **The Steward bar:** stays at the bottom.

Behaviour:
- Clicking a room, or pressing 1–4, opens that chamber's **detail room** (surface 3).
- "Enter the keep", pressing 0, or any Steward request that is not chamber-specific goes to the **overview** (surface 2).

### 2. Overview: Preview and Proclaim (from A/3)
The main working surface. The full picture:
- **The preview:** a 16:9 preview of the stream (Malakor's crypt scene) is the dominant layer. Every chamber is a **layer on that picture**:
  - urn and writ (Lots);
  - the chat overlay and the vote bar (Gatehouse/Herald);
  - altar, frames and border (Beacons);
  - war-table panel (Map Room).
  Drafts carry a dashed **DRAFT · NOT ON AIR** frame. Held chat shows greyed and never reaches Program.
- **The Program monitor:** shows what is on air, top right.
- **The seal control:** under the monitor, the red **Hold to seal and proclaim** control is the only thing that puts a draft on air.
- **Talkback / Inspector tabs:** in the right column.
  - **Talkback** is the Steward conversation log.
  - The **Inspector** shows a short summary of the selected layer: the fields of the current draft and the always-visible fairness box for draws. It also has an **"Open the room"** link into the detail room.
- **The Steward panel:** under the preview. It holds the Steward's last message, the input (**Talk to the Steward…**, Hold to speak, Tell) and suggestion chips.
- **The chamber strip:** at the bottom, one tile per chamber with its state line and **On air / Preview / Draft** lamps. Clicking a tile selects its layer; double-click or Enter opens the detail room.

### 3. Chamber detail rooms: nested, from A/1
Opening a chamber, from the landing page, the strip, the Inspector link, the Steward, or keys 1–4, zooms into **that chamber's room as A/1 draws it**:
- **The scale:** the keep stays faintly visible behind.
- **The header:** a breadcrumb (`The keep › The Lot Chamber › Writ · draft · rev 1`), the 1–4 locator and **Back** (Esc).
- **The work:** the room holds the chamber's full work, the way A/1 does it.
  - **Lot Chamber:** the writ, with its fields struck and re-inked as the streamer amends it, beside **the urn**, with every lot drawn as a mark. Also the past writs, recompute, and the fairness steps.
  - **Gatehouse:** the 420-line replay marked Pass, Hold and Bar; holds at the portcullis; the rules (Watching or Armed); the moat; the drill; the gate log.
  - **Beacons:** the altar, the frames and the border with their intensity ranges, the 60 offerings on a timeline, and test fire.
  - **Map Room:** the 9×6 hex war table, proposals and the test ladder.
- **The seal slot:** proposals wait in the seal slot on the right (A/1's "PROPOSAL · AWAITING YOUR SEAL"), with **Hold to seal** and **Tear it up**.
- **The Steward:** the bar stays at the bottom and works inside the room.

Esc from a room returns to where the streamer came from: overview or landing.

## The Steward: one conversation everywhere
- There is **one Steward input** in the app, the same component on all three surfaces. It is labelled **SIMULATED STEWARD · SAMPLE DATA** until the live engine is wired. The `/` key focuses it.
- **The draft loop:** the streamer speaks; the Steward replies in Talkback and **drafts in front of their eyes**.
  - On the overview, the draft appears as a dashed layer in the preview.
  - In a room, it appears as the writ inking in.
  - Amendments ("make it 5 winners", "no raiders", "prize is a signed print") **re-ink**: the old value is struck in the chamber ink and the new one is written beside it.
- **Two seals, one rule: nothing acts until a human holds.**
  - **Hold to seal**: anything that acts on people or prizes (moderation verdicts, sealing a roll, casting).
  - **Hold to seal and proclaim**: anything that changes what viewers see (overlays, beacons, the war-table panel).
  - Sealing a roll stamps a wax seal whose hash anyone can recompute (SHA-256 over the frozen entry list, as both references do).
  - **Tear it up** discards.
- **Proposals queue:** a proposal waits in **one** queue that both the overview Inspector and the room's seal slot read. It is never duplicated.

## Engine boundary (tonight: offline)
- Build a `StewardPort` interface: `ask(text, context) -> StewardTurn` (`reply`, `proposals[]`, `focus` chamber/layer), plus `amend` and `tearUp`.
- Tonight's implementation is a `SimulatedSteward`: a deterministic phrase grammar like the references' (draft a question draw; make it N winners; no raiders; prize is …; pass / bar <line>; pass all as proposed; raise the drawbridge; test fire N gifts; what does chat want; catch me up; what should the next turn be). It is pure TypeScript, with table-driven tests.
- Tomorrow: wire the live engine through the same port.
  - Steward writs use `cc-types` Writ shapes where they exist (WP 5.1).
  - Registration in cc-core waits for the spike, as before.
- **No network, no model call, no eval** tonight. The no-eval scan stays green.

## Data
Use the app's existing read model and fixture source (`client.ts`, `simulated.ts`, and the per-chamber fixtures). Where a reference shows sample material the fixtures lack (hexmap tiles, contribution timeline, consensus per minute), port it from `prototype/ai-first/data/sample.js` into the matching fixture module, labelled illustrative. Never present sample data as real.

## Keymap
| Key | Action |
|---|---|
| 0 | overview |
| 1–4 | chamber room |
| Esc | back |
| / | Steward input |
| Enter | open the selected tile |
| Del | tear up the focused proposal |
| Space (held) | the hold-to-seal control in focus |

Declare the keymap once.

## Port rules (from the contest skill's port contract)
- **Tokens:** come from `packages/tokens`. No re-typed literals and no new palette or fonts. Paper, the four chamber inks, key and the type families all stay.
- **Components:** one component per visual thing. Shared pieces go in `packages/ui`: `StewardBar`, `SealButton` (hold), `ProposalCard`, `ChamberStrip`, `ProgramMonitor`, `DraftFrame`, `Breadcrumb`. Chamber-specific illustration stays in `apps/desktop`.
- **Proposal lifecycle:** a state table (data), shared by every chamber: `drafted → amended* → sealed | torn`, and `proclaimed` for visual layers.
- **Type floor:** 13 px for all readable text. The Program monitor is a miniature picture, but any label rendered as text in it must stay at 12 px or more. The A/3 reference fails this; do not port that failure.
- **Bundle:** the desktop first-load budget (`check-build.ts`, 393,216 bytes) holds. Illustrations and rooms load lazily.
- **Fidelity:** each surface is compared with its reference at 1440×900 and 1280×800. The Director re-shoots and the owner judges.
- **Delete the superseded code in the same work package that replaces it.** That covers the stacked panel pages once their room exists, and the `#/lottery/stage` route with `lots-stage-*`. Domain models and their tests (lots-model, moderation-model, beacons-model, guardrails) are **reused**, not rewritten.

## Work packages (Codex, at most 5 parallel threads, disjoint paths)

**Wave 1** (contracts first):
- **AI-1 Steward core:** `packages/ui/src/steward/`, pure TS. It contains `StewardPort`, `SimulatedSteward` (grammar), the proposal state table and the shared proposal queue store, with table-driven tests. It renders no UI.
- **AI-2 Shell and routes:** `apps/desktop/src/shell/`, `view.tsx`, `navigation.ts`.
  - Routes `#/keep` (default landing), `#/overview` and `#/chamber/<lottery|moderator|visuals|studio>`.
  - The keymap, declared once.
  - The `StewardBar`, `SealButton` and `Breadcrumb` kit components in `packages/ui`.
  - Placeholders for the three surfaces.
  - Delete `#/lottery/stage` and `lots-stage-*`.

**Wave 2** (after wave 1 merges, in parallel):
- **AI-3 Landing Keep:** `apps/desktop/src/keep/`. The cross-section with live room states from the read model.
- **AI-4 Overview:** `apps/desktop/src/overview/`. The preview with four layers, `DraftFrame`, `ProgramMonitor`, Talkback/Inspector and `ChamberStrip`.
- **AI-5 Rooms, Lots and Gatehouse:** `apps/desktop/src/rooms/lottery/` and `rooms/moderator/`. They reuse the existing models, and delete `lots-page`, `moderation-page` and their panel files once the room replaces them.
- **AI-6 Rooms, Beacons and Map Room:** `apps/desktop/src/rooms/visuals/` and `rooms/studio/`, with the same reuse and deletion rule.

**Wave 3** (only after the owner sees wave 2): presets, Restyle and custom design through the Steward (02-ui.md's preset rule), wired through the same draft and proclaim loop.

**Wave 3 status (AI-10):** `@castle-control/ui/design` supplies the preset catalog, shared-queue Restyle and Custom design proposals, and the side-by-side `DesignFocus`. Custom design is data-only scene/style parameters, validated at one schema door, and stays a labelled SIMULATED fixture until the live engine is wired. Preview captures both proposal and current-look revisions; stale drafts require another preview, a human hold applies exactly that preview to the simulated look, and tear-up discards it. No code frame, network, model call or new contract identifier is registered. Room mounting after AI-9 is the next step: lazy-import the design subpath, share `designSession` (or one `DesignSession` for the existing queue), and route design preview/seal/tear through it. Plain queue authorization cannot apply a design look. AI-10 does not mount rooms or change live output.

Each work package's acceptance:
- tests for its behaviour, including the keyboard path;
- every drafted proposal is visibly a proposal, and nothing acts without a hold;
- the repo's full gate is green, including the desktop build and budget;
- no em dashes in UI copy;
- the result reports how to open the surface.
