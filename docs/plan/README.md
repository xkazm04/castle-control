# Castle Control — live-audience toolkit (concept, not started)

A free, open-source desktop app that gives any Twitch streamer four live-audience tools:

- the **Lot Chamber**, verifiable draws;
- the **Gatehouse**, an AI moderator with a consensus chart and a replay simulator;
- the **Beacons**, contribution-driven visuals;
- the **Map Room**, an Extension studio.

Overlord is its first showcase. The urn and the war table become data templates in it.

**Status, 2026-10-25:**
- Analysis, UI and implementation plan are done and owner-approved.
- No code and no repo exist yet. The build happens in a **new repo**, `castle-control`, which a later session creates once the owner says development starts. Nothing here is built inside Overlord.

## Read in this order

| File | What it holds |
| --- | --- |
| [01-analysis.md](01-analysis.md) | Market, Twitch platform limits, the four module designs, architecture, safety and legal rules, risks |
| [02-ui.md](02-ui.md) | The brand, the castle vocabulary beside the plain terms, tokens and type, the app shell, each chamber page, the landing, and the port contract |
| [03-implementation-plan.md](03-implementation-plan.md) | Decisions, repo shape, how Codex and Claude execute, 7 milestones and 30 work packages, contract identifiers, standards, risks, first steps |
| [prototype/](prototype/) | The winning UI prototype. Open `prototype/index.html` from disk. Its data is illustrative, and its code is reference, not a base to copy |

The same three parts live in the Claude Doc [Castle Control — Analysis and Implementation Plan](https://claude.ai/artifact/8oSKf6Qtan1d9fQ2rFAkHt), which may get newer edits. If the two differ, ask the owner which is current. When a doc edit lands, refresh these files from it.

## Pending on the owner

### Decisions to confirm or reverse

The plan proceeds on these defaults, set by the director on 2026-10-25 because the owner had not yet answered. Each is cheap to reverse before the milestone named.

| # | Question | Default taken | Reverse before |
| --- | --- | --- | --- |
| D1 | Who runs the Extension service | One shared, stateless service we host, plus a self-host guide | M4 |
| D2 | Live moderation engine default | Rules plus a local model; a cloud key is opt-in, with a notice | M1 (WP 1.4) |
| D3 | Overlord's urn and hex map | Data templates in the new repo; Overlord adopts the toolkit later | M2 |
| D4 | Licence | Apache-2.0, the same as Shadowrunr OS | M0 (WP 0.1) |
| D5 | Platforms | Twitch only for v1 | After v1 |
| D6 | Sequencing against the Kiroween Shadowrunr v2 rebuild ([../kiroween-shadowrunr-v2.md](../kiroween-shadowrunr-v2.md)) | An independent repo. Code is copied with provenance; there is no cross-repo dependency | M0 |
| D7 | Ban autonomy (left as a comment in the Claude Doc, Part 1) | A ban needs a human click by default. Auto-ban is allowed only on an armed, pattern-based rule, under an expiring grant with a cap on bans per hour and a circuit breaker. A classifier-only rule can never ban alone | M1 (WP 1.1) |
| D8 | Desktop platforms | Windows first; macOS and Linux in M6 | M6 |
| D9 | Name | "Castle Control" is a working name. Run a trademark search before release | M6 |

### Owner tasks before development starts

Credentials go straight into the app or the OS keychain. Never paste them into chat or commit them to the repo.

- [ ] Say when development starts. The next session then creates the `castle-control` repo and begins M0.
- [ ] Set up a Twitch test channel, plus two test viewer accounts that armed actions may target.
- [ ] Register a Twitch application for the desktop app (device-code flow).
- [ ] Enable obs-websocket v5 in OBS.
- [ ] Install a local model runtime (Ollama or LM Studio).
- [ ] Send Twitch Extensions support the policy question in WP 4.0. It asks whether one reviewed shell may render streamer-authored design data with per-streamer branding (policy 4.9). Its answer gates M4 and takes the longest, so it can go out now.

### Owner tasks before public release

These are WP 6.3 in the plan.

- [ ] A trademark search on "Castle Control"; keep the name or replace it.
- [ ] A lawyer's review of the official-rules template and the giveaway guardrail table.
- [ ] Confirm Leonardo's API terms on ownership before AI art ships in a public Extension. The terms page returned 403 during research.
- [ ] Written sign-off at the M1 exit before any rule is armed against real viewers.

## Open tasks for the next session

1. When the owner gives the word, create the `castle-control` repo and copy `prototype/` into it read-only.
2. Copy this plan in as `docs/PLAN.md` plus the three parts.
3. Write the briefs for WP 0.1 (repo and gates) and WP 0.6 (Twitch bridge port) and run them in parallel. Book the live spike, WP 0.7, with the owner.
4. Re-read the governing registry subjects listed in the plan's "Standards" section before each work package. The registry moves.
5. Contest housekeeping in Overlord: run `contest wrap` for `twitch-live`, `toolkit-landing` and `toolkit-landing-r2`. The arenas and the vault under `.contest/` are git-ignored, so this folder is the durable copy.
6. Optionally contribute a "verifiable randomness" technique (seal, beacon, cast, writ) back to the knowledge registry. No subject covers it today.

## Where it came from

- `/spark` idea `twitch-live-audience`, kept in the git-ignored vault at `.spark/Spark/ideas/twitch-live-audience.md`.
- Three contests, all in the git-ignored vault at `.contest/`:
  - `twitch-live`: six design reports, combined A/1, A/2, A/3, B/1 and B/3 into four modules, with Sealed Decrees descoped;
  - `toolkit-landing`: six brands; B/3 Overprint won on style and clarity, but its brand was rejected;
  - `toolkit-landing-r2`: Overprint rebranded twice; Castle Control won over Shepherd.
- Before the work packages were written, 20 subjects of the knowledge registry were read on 2026-10-25, and their rules are folded into the acceptance criteria.
