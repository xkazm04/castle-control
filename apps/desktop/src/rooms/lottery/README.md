# Lot Chamber C · Herald, 2026-10-30

## Theatrical draw stage and Writ Lab, 2026-10-31

The room now depends on `@castle-control/renderer`. `stage.tsx` builds the
renderer's own `DrawScene` (`buildDrawScene`) for the selected shape (urn, wheel,
deck, ballot box) and drives reveals with its `createDrawPlayback` timeline,
sleeping until `next_at_ms`; the hand-synced `reveal.ts` mirror and the static
`urn.tsx` are gone. The artwork group plays the scene's motion exactly as
`paintDraw` maps it. Lots are drawn per shape in the artwork's 320×240 space
(dot area follows weight, at most 240 marks with every winner kept). A fresh
ceremony enters theatre mode (full chamber, one click back to the desk); the
latest winner is proclaimed beside the art, earlier winners settle into a
scoreboard, and decorative rays and confetti never encode the outcome. The
fixture stage plays a cast only after `verifyWrit` recomputes it; core casts are
the core's verified `LotsVerifiedCast`. Shape and theatre live in the
session-only `DrawDisplay` (no wire field); the OBS URL appends `&shape=`, which
the Rust page resolves to `data-shape` for `host.ts`.

`equalizer.tsx` plots the cc-lots concave weight table and the contract's
`LotsWeightTable` summary (`newcomers_to_outweigh_heaviest`), with Equal/Concave,
activity cap, free !join and raider-cap controls (core edits go through
`lots.draw.upsert`). `lab.tsx` (Writ Lab) tampers with an in-memory copy of the
current writ (weight, handle, seed, plan, winner order) and walks canonical
serialization, SHA-256 seal, randomness commitment and rejection-sampling
derivation; a failed step blocks the rest. For beacon writs, step 3 also runs
verifier-web's `verifyDecodedWrit` (round schedule and BLS signature) against a
compiled-in anchor (`beacon-anchors.ts`: the public quicknet key; fixture mode
adds verifier-web's simulated chain key for its specimen). A chain without an
anchor reads UNVERIFIED. "Forge the beacon" (a made-up signature with its
matching hash) is caught by BLS alone. "Open a writ file…" parses a JSON writ with
the contract's `lots.writ.get` schema (`writ-file.ts`, at most 2 MiB) and puts it
on the bench as a third specimen, checked against the room's own anchors.
A finished ceremony closes on its proof (theatre: a verdict card naming a
local recompute or a core-verified cast, with "Prove it in the Writ Lab", which
returns to the desk, restores the canonical writ and replays the walk; desk: a
verdict chip). The lab's proof strip and verdict sit beside the tamper bench so
a catch is visible without scrolling. Core mode adds `core-setup.tsx`, the full
rule set as a local draft: one save sends one `lots.draw.upsert` (then the
core check), never one per keystroke; winner count keeps its commit-on-blur
field. Core mode never shows the simulated-art "On stream" card. Evidence:
`stage.test.tsx`, `equalizer.test.tsx`, `lab.test.tsx`, `core-setup.test.tsx`, `sound.test.ts`, `result.test.tsx`,
renderer `draw/host.test.ts`, cc-obs `tests/pages.rs` and cc-core
`tests/lots_overlay_page.rs`.

### Ceremony options and choreography

Each called lot lifts out of its shape (`lift_path`: urn mouth, wheel pointer,
dealt off the deck, up through the ballot slot), and the proclamation states
the winner's share of the pool's weight. Dot area follows weight (radius ∝
√weight, floored at 35% so the lightest lot stays visible) and eases when the
curve changes; pointing at an equalizer bar lights the lots holding that weight. Two session-only options sit beside the shape
picker. **Reveal by hand** holds the renderer's cursor just before each onset
until the streamer calls the next lot (`createRevealClock().callNext`). Only the
timing changes; winners and order never do. The hold applies to this window
only: the OBS draw page keeps its own cadence. **Ceremony sound** (`sound.ts`) is
Web Audio synthesis with no assets, off until switched on. The *On stream*
preview draws the renderer artwork the OBS page paints for the chosen shape.

## Stabilize lots-06–10, 2026-10-31

Eligible pool owns subscriber/points eligibility. Prize checkboxes display its
derived values as disabled controls; the free !join path remains in effect.
Pause intake exposes its pressed state and an explicit status. Edits while
paused retain the current entries. Eligibility/weight changes require resuming
before sealing; resume regenerates the pool from the current setup.

The OBS URL maps S/M/L to scale 0.75/1/1.5 and preserves the anchor. Both current
writ and core proof controls expose expanded state and a stable controlled
section; core proof stays disabled until its writ is available. Generic hall
and desk containers carry no ineffective accessible names.

The Rust draw page scales titles, body and mounted winner typography with its
validated scale. Both winner hosts clip rather than scroll. Its no-JS fallback
shows the first eight names and an escaped +M more line; the complete immutable
seal/cast JSON islands and validators remain unchanged. Regression evidence is
in controls.test.tsx, structure.test.tsx, result.test.tsx, ../../lots.test.tsx
and crates/cc-core/tests/lots_overlay_page.rs. intake.test.ts also checks the
shared proposal cannot seal ahead of a paused roll with pending changes.

Failing-first evidence against HEAD 4d936e1: the four targeted desktop files
reported 6 failed / 40 passed before product edits (lots-06, lots-07, S/L URL
cases, and both lots-09 assertions). The served-page suite reported 0 passed /
3 failed before Rust edits (scaled typography, scrollbars and 40-winner cap).
The added shared-seal regression then failed with a resolved promise instead
of the required resume hint, and passed after the proposal path used the same
pending-intake guard. No fixture or wire schema was changed.

Validation: `cargo test -p cc-core` and `cargo test --workspace` pass, as do all 659 desktop tests across
64 files, desktop typecheck/lint/build, workspace Rust format/Clippy, and the
boundary, hygiene, file-cap and secret checks. Browser validation was attempted
with `pnpm e2e e2e/journey-lots.spec.ts e2e/journey-obs.spec.ts`; Playwright exits
with `spawn EPERM` before running a journey. `pnpm gate` exits in the unchanged
contract exporter with `spawnSync cargo EPERM`. Recursive pnpm typecheck/lint
also exit with `spawn EPERM`. These runner failures are not green checks; the
Director must rerun them in its verification environment. No install was run
over the worktree's node_modules junction.

## L1 streamer journey, 2026-10-31

In Vite fixture mode open `#/chamber/lottery`. **Next draw setup** now edits
name, content, pool/keyword, winners, cooldown, raider cap, equal/concave activity
weights, the free path and prize guardrails. Generated facts are disclosed:
every third message is !join, the others !question; every second entry follows,
every fifth has redeemed, and activity units range from 0 to 4. Pool changes
rebuild this simulated pool. Free !join admits its senders across restrictions
and forces equal weights. Concave weights mirror the Rust integer formula with
max_units=4. A virtualised weight table publishes the newcomer comparison.
Pool selection also updates subscriber/points policy flags. No paid event,
real chat, model or external service is called.

**Preview this draw** drafts the existing proposal; editing setup discards that
preview. The shared seal slot remains the sole proposal hold. A completed hold
freezes entries and disables setup. **Start simulated draw** then creates one
fixed-seed rehearsal result from the frozen entries, respecting weights,
distinct winners and cohort caps. Repeated starts preserve it. **Read current
simulated writ** shows the roll digest, setup and winners with **Not a cc-verify
proof**. The saved simulated proof and its independent recomputation remain
separate and unchanged. A new roll clears the current result/expanded writ;
empty, invalid and impossible-cap setups provide feedback.

**On stream** uses kit FieldGroups and native keyboard controls for size S/M/L,
five anchors, gules/azure/or/key colours, six kept art styles and reveal timing
(100–10000 ms, default 1500). Style list and art URLs are read-only imports from
`demo/model.ts`. Position, size, colour and art update in the session preview;
timing drives the simulated winner reveal and respects reduced motion. Missing
preview art falls back to a token-colour SVG. Display values are session-only:
LotsDraw has no size/anchor/colour/art_style/reveal_ms fields for upsert. No wire
identifier or fixture transport was added; core mode retains its validated path.

The Rust `/lots/{draw_id}` page has a viewport-sized transparent canvas and a
bounded scrolling plate. Its single parser accepts display-only scale=0.5–2
(default 1) and five anchors (default br). Missing, invalid or repeated known
parameters fall back independently; unknown keys are ignored. Recorded scenes
carry an explicit SIMULATED stamp. Only accepted core seals/casts appear, and
the origin stays read-only. It cannot serve desktop `/art` images, so it uses
default heraldic token colours without broken image requests. Browser fit at
1920x1080 and 1280x720 needs the Director's check; HTML tests do not prove layout.

### Evidence and remaining handoff

`e2e/journey-lots.spec.ts` was written first, reusing the unchanged network and
style audits. It configures the draw and guardrails, edits every urn parameter,
previews, holds Space to seal, casts, reads the writ and asserts an OBS link and
both broadcast sizes. Expected red on base: missing setup/preview/parameters,
cast result and current writ. After fixes its final **Open draw in OBS** link
assertion is still expected red: Vite fixtures have no accepted-core transport
or overlay origin. No mock hides that gap. The brief reserves browser execution
for the Director; the spec has only been typechecked/linted here.

New Vitest assertions were red before fixes for setup, pool/weights, empty
feedback, current cast/writ, stale expansion, subscriber-pool policy alignment
and incorrect equal-weight claims under concave weights. They now pass alongside
the unchanged original Lots/core/structure tests. The two new Rust page tests
were red for query attributes and the uppercase simulated stamp. They now pass
on actual loopback responses, covering seal-before-cast, accepted winners,
query defaults/injection/duplicates and 404/405 write refusal. Final commands,
counts and gate outcomes are recorded in the external result.json.

App Master decisions remain: a fixture-to-core handoff; a separate contract
delivery for persistent display fields; and ownership validation for query URLs.
The excluded `overlay/mod.rs::owns_source` currently treats the entire lots
suffix as a DrawId, so `obs.source.create` rejects query-bearing URLs. Bare
accepted-draw URLs still work; query URLs can be opened manually in an OBS
browser source. No excluded path was changed to bypass ownership validation.

## WP8 Cutaway layout

The hall is an 18-unit-gap grid of two card-paper panels with 2-unit ink
borders: the urn at left has a gules top band; the scrolling writ desk at right
has a key top band. Both use display h3 titles and serif em glosses. Below the
900px-equivalent breakpoint the panels stack. All local typography uses
text-shell roles, with a 13px minimum and 15px reading copy.

The count uses the 72px figure role, .9 line height and a single text-shadow
at token offsets 4px/3px in gules. The serif caption follows the figure; no
duplicate overprint layer is generated. The existing golden-angle
urn positions and windowing are unchanged; its ellipse uses cutaway urn paper,
a gules rim, key/gules cohort dots and azure raider rings. The cohort legend
sits above three 2.5px gules ring medals. Medal values still come from the
selected draw, cooldown fixture and pending proposal, including struck/inked
winner amendments.

Director review correction: the urn is capped at the winner's 272x203 box
and can shrink inside the 96px-count-column row when width or height is tight.
The figure yields vertical space before the legend and medals do; the windowed
large-pool path stays intact. The writ panel's top band, heading and persistent
scroll cue sit outside a named, keyboard-focusable scrolling body. Its native
scrollbar has a reserved gutter, and all desk tools keep their order inside it.

Writ templates remain selectable HeraldicCard native buttons, preserving the
single select-and-draft handler and aria-pressed state. Each row has a 40-unit
shield column, display title, 15px details/reasons and an action column. The
Draft writ face is a pbtn-styled span inside that existing button; there is no
nested button or second handler. OK uses the ink button treatment. The pool,
cooldown and weight footnote follows the templates. The remaining order is
current writ/new roll, setup, appearance, guardrail ribbon/notices, supplied
seal frame, current cast, lookup, saved proof/frozen-byte recompute and fairness.

Stamp mappings: policy ok -> ok (OK), warn -> held (Warning from copy.checks),
blocked -> blocked (Blocked). Heading: pending proposal -> draft, frozen roll
-> sealed, otherwise simulated with No draft waiting. Pending takes precedence
if an older roll is frozen. Writ impressions use draft/sealed with land; the
sealed impression and ink bleed replace the old wax drawing. The lottery-wax
class remains only as the existing outside-scope test's sealed-impression hook;
there is no wax CSS. Core round provenance uses a simulated stamp only when
simulated is true; live and unknown labels remain text. Its selector, actions,
windowed frozen entries, unknown medals, accepted results and proof download
remain separate from fixture data.

The two panels and desk sections use cc-print-in plus entranceStyle(i), giving
.35s + i*.14s mount delays. Current cast winners remain windowed, in their
original immutable order. Each lot-ticket uses entranceStyle(j) with .15s start
and the .28s motion-shell step (.15/.43/.71s for three winners). The appearance
reveal duration still comes from reveal_ms. A shared sealed Stamp lands and
bleeds; reduced motion disables ticket printing and shared stamp motion and
shows mounted tickets immediately. No winner generation, reveal cursor,
fixture/core authority, policy or transport path changed.

Review hooks: lot-urn-panel, lot-writ-panel, panel-title, panel-gloss, lot-count,
lot-stat, lot-legend, writ-row, writ-title, writ-detail, writ-action, lot-ticket.

## WP8 verification

Only structure.test.tsx changed existing selectors: StageFrame/crop marks ->
urn panel/top band/title; medals/discs -> statrow/lot-stat/ring; card title ->
writ-title; generic verdict stamp -> specific ok/blocked stamp. Order, source
values, cohort counts, policy reasons, selection and single-hold assertions
are retained. Other existing behavioural tests are unchanged. cutaway.test.tsx
adds policy mapping, heading precedence/queue lifecycle, draft/sealed land and
bleed, core provenance honesty, ticket index/timing/order, reduced-motion
visibility and section entrances.

The review correction adds regressions for the single shadowed figure and for
keeping fixture/core headings and cues outside their keyboard scroll regions.
Existing mappings, hooks and behavioural assertions are unchanged. Source and
SSR checks do not establish viewport fidelity: browser access is unavailable,
and automatic approval review rejected Google Chrome access (not approved to
use Google Chrome). Director visual confirmation at 1440x900 and 1280x800 is
still needed. No install, git write or shell-package edit was run.

Review correction checks: desktop typecheck and lint exit 0; desktop tests
pass 790/790 across 79 files; desktop build exits 0 with first-load
387638/393216 uncompressed JS+CSS bytes. node scripts/check.mjs exits 0
(boundaries, hygiene, type floor, file cap and secrets).

Director fidelity follow-up: the browser layout corrections and wider room
dimensions (O8) are accepted. The urn/writ panels and stat wrappers now use
normal line height. The count figure occupies the fixed 96px token-derived
column with normal tracking and no case transform; its 72px/.9 type and single
shadow remain. The legend uses its 14px role at line height 1. Writ rows use
the existing 16px shell figure-caption role with normal line height to match
the winner's browser-default type, overriding the kit's 14px/1.4 row font.
No child type-floor roles, handlers, hooks or layout rules changed in this pass.
Follow-up validation: pnpm --filter @castle-control/desktop test exits 0;
794 tests pass across 80 files. No existing test selector or assertion changed.


## WP13: Cutaway and hackathon merge, 2026-10-31

The room band and title card remain in the shell. The urn panel keeps its top
band, heading, count, cohort legend and three statistics. Its artwork child is
now e3's DrawStage, replacing the retired Urn import; urn.tsx stays deleted.
The four shape buttons, hand/automatic reveal, opt-in synthesized sound,
weighted lot marks, lift/ray/confetti choreography, winner rail and replay all
stay in that panel. Full stage expands the same panel; Back to desk restores
the two columns. The stage's sealed impression and desk proof verdict use the
shared Stamp. Small numbered SVG medal texture is now a check mark; the winner
rail and accessible announcement retain each winner's number and order.

The independently scrolling writ panel keeps its templates, shield rows,
proposal heading, policy ribbon, seal slot, lookup, saved proof and fairness.
It also holds the tier preset, setup, weight/cap equalizer, appearance/OBS shape
preview, current cast and Writ Lab. The equalizer retains all controls and
weight-hover highlighting. The lab retains file/specimen selection, beacon
BLS/anchor verification, all tampers, byte comparison, four-step proof strip,
trace and download. Prove it exits theatre, restores the canonical writ and
focuses the lab. Core mode retains the real core port, separate public anchor,
unknown data handling and presentation-only shape state. No authority or wire
identifier changed.

New panel styles use Cutaway paper, key rules, squared control faces and shell
type roles. Stage, lab and moat verdicts use the one Stamp API; informational
weight/cast labels use plain StatusChip. The type-floor gate is unchanged.
Existing route-level lazy imports keep first load at 388278/393216 bytes, versus
the port baseline of 388181; the first resolved measurement and final build are
both 388278, so the conditional extra split was unnecessary. No budget changed.

Final WP13 verification: desktop typecheck/lint pass; 1014 tests in 103 files
pass; desktop build passes. UI: 441 tests, kit 234236/262144 bytes. Renderer:
206 tests. Tokens: 20 tests. Site: 91001/184320 bytes. Repository boundaries,
hygiene, type floor, file cap and secrets pass; no conflict markers remain.
Contract parity and pnpm gate stop at the sandbox's spawnSync cargo EPERM.
The browser runner stops at spawn EPERM; browser access host is unavailable,
and automatic approval review rejected Chrome access (not approved to use
Google Chrome). Visual confirmation at 1440x900 and 1280x800 remains a Director
step; no screenshot or browser interaction pass is claimed.


## WP13 Director correction: fitted centrepiece

The Director's browser review found that the fixed draw-stage minimum and the
large count above it pushed the drawing below the urn panel's fold. The urn
panel now uses three bounded rows: heading/count, a flexible drawing frame,
and compact cohort/stat readings. The drawing is the frame's first child and
precedes all three stats in both fixture and core markup. The writ panel keeps
its separate scrolling body and cue. The shell band/title card and Keep moat
are unchanged.

The panel is a size container. Its stage and canvas tracks use minmax(0, 1fr)
and min-height: 0, with no fixed canvas minimum. Only the SVG geometry scales;
all lettering remains HTML at existing text tokens, at least 13. The four
shape choices, Reveal by hand, Ceremony sound, notes disclosure and labelled
full-stage control share one compact row. The numeric count sits beside the
panel heading, with the legend and three stats in a compact strip below the
stage. On short panels, stat details remain in accessible text and native
hover titles. The notes disclosure retains the full explanation and sampled
lot notice. Full-stage/replay icon controls retain their original accessible
names and native titles.

The canvas uses separate grid tracks for phase, drawing, result rail and prize
disclaimer; results no longer overlap an absolutely positioned drawing. Long
winner/proof content has its own keyboard-focusable scrolling rail, leaving
the drawing in place. Theatre still expands the same panel across the room;
returning restores both columns. All display state and ceremony behavior are
unchanged.

structure.test.tsx now pins the drawing as the frame's first child, before the
readings/stats, in fixture and core rooms. The connected-room presentation
assertion uses numeric count sizing; its provenance and announcement checks
are unchanged. journey-lots-stage.spec.ts adds six viewport/theme cases
(1280x800, 1440x900, 1920x1080; paper and stock), checking all four shapes,
control-row containment, the type floor, an unscrolled urn panel and theatre
enter/return. Browser execution is blocked by spawn EPERM before assertions,
including a direct headless launch; no browser layout pass is claimed.


## WP13 fidelity re-check after dae85b9

The urn panel restores the port's space-16 horizontal padding and the legend's
text-shell-legend/1 rule (14 with line height 14). The compact count/stat widths
and flexible stage-first tracks remain the accepted structural changes.
The Keep's moat-label hook is back on the label span. Its azure, white, bold
700 print face, .02em tracking, space-6/space-12 padding, key rule and offset
shadow match the pre-merge treatment; only the old absolute art coordinates
are omitted so the accepted heartbeat/footer stays in normal flow.

## FU-2: readable desk ceremony at 1280x800

Desktop rooms shorter than 32rem use a wider urn column and a shared panel
grid. The heading/count, compact controls, phase, cohort legend, narrow
three-stat strip and scrollable winner rail sit beside the drawing. The four
shape choices share one row; ceremony options, notes and theatre share the
next. Ceremony results no longer split the drawing's width in this layout.
At window heights through 900px, local vertical padding drops to zero; panel
horizontal padding remains 16px. All text keeps the existing token
roles and the 13px floor. The ellipsised heading retains its full accessible
text and a native hover title; phase and seed labels also retain full text and
hover titles. Stat details retain their accessible text and native titles.
Manual calls stay first in the result rail with their Space shortcut; the seal
hash stays in accessible text while a call waits. Taller desk views give the
drawing the larger share of the existing drawing/result split. Theatre retains
its original layout; timing,
reduced motion, winner order, sound, keys and authority paths are unchanged.

`e2e/journey-lots-stage.spec.ts` now requires at least 260px of rendered drawing
height, using the SVG viewBox and screen transform rather than only a frame's
bounding box. It covers all four shapes at 1280x800, 1440x900 and 1920x1080 on
paper and stock, retains panel/type/control containment checks, adds horizontal
overflow checks, enters/returns from theatre with Enter, then seals with Space
and checks the completed cast. Winner results must remain in view. A dedicated
1280x800 reduced-motion journey calls all three lots with Space and checks the
focused call button is fully in view. Each viewport case prints its measured
drawing height for the Director's verification record.

Validation in this sandbox: frozen install, 1,031 desktop unit tests, desktop
typecheck/lint/build and e2e typecheck/lint pass. The desktop build remains
within its first-load budget. `pnpm gate` passes the 13 harness and 35 tooling
tests, then stops at contract export with `spawnSync cargo EPERM`. Both Lots
browser journeys stop before running with `spawn EPERM`. Browser host access
is unavailable; automatic approval review also rejected Chrome access because
Google Chrome use was not approved.

| Window | Before | After |
| --- | --- | --- |
| 1280x800 | About 130px, reported by the owner; not measured here | 260px minimum pinned in e2e; browser measurement pending |
| 1440x900 | Browser measurement unavailable | 260px minimum pinned in e2e; browser measurement pending |

No measured before/after values or browser layout pass are claimed. The
Director must run the two Lots journeys with browser access to close visual
acceptance. No external result path was supplied in the FU-2 brief.
