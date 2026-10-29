# AI-5: offline Gatehouse room and shared seal slot

M1a (2026-10-29): core mode now reads retained chat and decision history using
the existing generated `gatehouse.chat.list` / `gatehouse.history.list` contracts,
alongside consensus. `rooms/moderator/core-reads.tsx` windows the lists, shows
live/simulated provenance per row and accumulates explicit unavailable counts
over cursor pages, including empty pages. Refresh restarts the read walk. The
drill remains simulated and says `live parity: pending capture evidence`; no
capture-time hash or recording reference is invented. No action/arming control
was added. See [the runbook](../../../docs/guide/gatehouse.md#m1-live-run) for
owner capture and the still-pending live exit. The existing shell integration
test's two-read mock/expectation needs a separate authorized update; see the room
README. The fixture description below remains unchanged.

Open `#/chamber/moderator`; the nested replay is
`#/chamber/moderator/drill`. The room replaces the numbered panels with the Lit
Keep's three working columns: the portcullis and consensus, 420 sample chat
lines marked Pass/Hold/Bar, and the rules, moat, drill and gate log. All lists
that grow use the kit's WindowedRows. The existing 4,200-message fixture remains
for the ten-times-volume endpoint tests. Both room components accept snapshot
and replay, remain lazy, and are gated to fixture mode by shell/room.tsx.
Beacons and Map Room now mount their AI-6 rooms in fixture mode; live mode
retains the shell empty states.

## Proposals and local model behavior

The moderator model, its contract-decoded fixtures and copy remain in use.
Pass/Bar, Ban/Dismiss, rule-mode changes, delay, Shield, Undo and Petition create
visibly labelled proposals in the same queue as the Steward. They do not send a
model command until the seal slot's kit SealButton finishes a hold. Original
held or ban messages are shown before review and carried into the proposal;
unavailable originals block decisions. Unsupported or missing Steward targets
remain unsealed with an explanation. Ban review requires a human hold. No
actual rule leaves shadow mode: Armed is a fixture preview only.

After sealing, the existing model still waits its 400 ms fixture confirmation
before changing a held verdict, delay or Shield pressed state. Opposing pending
decisions cannot replace one another. A stale Shield proposal cannot silently
toggle an already-confirmed setting back. Human actions from Twitch remain
labelled as simulated provenance. The drill shows source, instrument hashes,
recording gaps, all named states and over-moderation on its own axis. It has no
live-ledger write path.

Illustrative per-minute consensus was ported as data only from
prototype/ai-first/data/sample.js into moderation-fixture.ts. It is explicitly
labelled illustrative and rendered as stacked shares; the existing filtered
consensus fixtures retain their shed counts, barred-message exclusion and
3-minute deltas. The chart accepts no action port.

## Shared slot

`rooms/seal-slot` uses useSyncExternalStore against the queue singleton's stable
snapshot, then reads pending(chamber). Each proposal uses the shared kit ProposalCard for its fields and
revision, Hold to seal (or Hold to seal and proclaim), and Tear it up. Its root
carries data-proposal-focused=true and its tear button data-tear-proposal, exactly
as the existing app Delete handler expects. Focus selection works without a new
keyboard listener. Core mode displays the slot but no fixture actions. Tests
seed separate ProposalQueue instances. Revision changes remount the hold button
to cancel unfinished holds. Visual and studio proposals use their lifecycle's
single proclaim transition; no extra seal transition is invented.

## Review and verification

Use the commands in lots.md for narrowed tests, the full gate and the desktop
build/budget. Tests preserve the domain policy assertions, original-message
review, public contract handles, all four ChatDelay choices, delayed applied
states, opposing in-flight requests, model isolation and no-network guarantees.
Shared room tests drive the real kit held-Space handler, cancellation before
the deadline, Delete through the tear button, room keys 1-4, Esc to either
origin, lazy content and the drill deep link.

Build then run the production preview command in lots.md. Open:

- `http://127.0.0.1:4178/#/chamber/lottery`
- `http://127.0.0.1:4178/#/chamber/moderator`
- `http://127.0.0.1:4178/#/chamber/moderator/drill`

Review at 1440x900 and 1280x800 in both paper and stock, beside the Lit Keep
reference. Room styles are co-located, with mount/slot styles in shell/room.css;
all colors, type, spacing and motion come from packages/tokens. The shared
rampart and single Steward input remain outside these rooms. No new services,
packages, generated contract identifiers or live actions were introduced.

Visual screenshots could not be captured: the browser connector inventory was
empty and native Chrome computer use was not approved. The Director must perform
the reference comparison. The Overview hold and the room now share sealRoomProposal, including lottery
hash/guardrail preparation. Room-wide provenance strips are removed; artifact
safety labels and the rampart/Steward markers remain.
