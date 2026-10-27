# Lot Chamber: verifiable draws

Draft for owner review, current at `c3dea03` (2026-10-28).
Open `#/chamber/lottery` or press 1. Offline eligibility, policy checks,
seal/cast logic and independent verifiers exist. A live Twitch draw and its OBS
delivery remain pending. Sources:
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

In this revision native registration is still fixture-only: it uses a fixed
clock and recorded quicknet round 2, seeds no viewer pool, and has no live chat
intake. A new empty core may have no usable draw or eligible entries. The UI
does not create live entries for you. A future live-beacon transport exists but
is not registered; setting a live-test flag does not upgrade this workflow.
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
