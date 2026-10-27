# Extension service self-hosting

**Stub for owner review. M4 is not built yet.** Current at `c3dea03` on
2026-10-28. There is no implemented `cc-ebs` service, Extension bundle or
deployment recipe to run. The Map Room is a local fixture preview. Sources:
[Map Room status](../../apps/desktop/src/rooms/studio/README.md),
[planned service](../plan/03-implementation-plan.md#wp-42--the-hosted-extension-service).

The plan proposes a stateless Rust service that holds the Extension secret,
verifies viewer JWTs, signs/coalesces broadcasts, serves design data and receives
Extension Bits webhooks. A future self-hosting guide must cover actual build,
secret-store configuration, allowed origins/hosts and test/release procedures
once those components exist. These are planned responsibilities, not currently
deployed features.

The current operator scope is local/allowlisted Hosted Test with no review
submission. Do not provision a new service or paste an Extension secret into
configuration to follow this stub. Public release needs a new owner decision.
Source: [submission policy/status](../submission/checklist.md).

Return to [Map Room](map-room.md) or the [guide index](README.md).
