# Castle Control — Part 1: Analysis

Snapshot of the Claude Doc tab "Part 1 — Analysis", 2026-10-25.

Revised 2026-10-25: Codex-only builders and an OpenAI engine stack (the TwitchCon x Codex hackathon); the Claude Doc snapshot predates this.

## Summary

We build a free, open-source desktop app that gives any Twitch streamer four live-audience tools; Overlord becomes its first showcase, not its subject. "Live Audience Toolkit" is a working title only: the name, brand and UI come from the next landing contest.

- **Generic first.** Each module is a tool the streamer shapes with their own brand, rules and assets. Overlord's urn and hex map become two configurations of those tools, not built-in features.
- **Four modules.** A lottery manager, an AI moderator (the Hold Gate and the Room Governor fused into one), contribution visuals, and an Extension studio.
- **Descoped.** Sealed Decrees is out for now: it is built around AI streamers, and this hackathon is human-first.
- **Brand by contest.** Six landing prototypes: Opus develops "Castle Control", Sonnet develops "Shepherd", and the other four are wildcards. Each covers a landing page plus the main page of every module.
- **Look.** The app itself is professional and practical: dense content layout, a deliberate type scale, efficient spacing. The landing page stays bold and creative, because Twitch is full of visually talented people.
- **Stack.** The same stack as Shadowrunr OS: a Rust backend with a Tauri 2 shell and a React front end, under an OSS licence. It adds a universal multi-provider LLM engine wrapper (D10): the user's own Claude Code CLI drives the app during development, and the OpenAI lane (the Codex CLI and the OpenAI API) is proven once the app is complete. Leonardo generates images.
- **Order of work.** Research and technical design run first and in parallel. This document is Part 1; Part 2 adds the UI from the contest, then comes the implementation plan for the new repo.

## From six variants to four modules

Five of the six contest designs survive as the seeds of four generic modules. The sixth, Sealed Decrees, is parked.

| Module | Seeded by | Kept from the design | Generalized into | Dropped or changed |
| --- | --- | --- | --- | --- |
| Lottery manager | Drawing Urn (Sonnet, S2) | A seeded draw anyone can verify; cohort caps (a raid cohort capped at a third of the winners); draw size read from the room's size | A configurable draw: eligible pool, weights, number of winners, cooldowns and the draw's visual shape. Used to reward viewers or to pick their ideas and questions | The jury's binding vote, which depended on Decrees. The urn stays as the demo configuration on the Overlord sandbox |
| AI moderator | Hold Gate (Opus, O1) + Room Governor (Sonnet, S3) | The chat-delay and AutoMod hold queue; one decision ledger; room tiers with hysteresis and timed leases | One moderator: streamer-set rules with an optional LLM classifier, a consensus chart of the strongest opinion directions, and a replay simulator over past streams | **Changed:** the Governor's rule "never act on a person" is reversed. The moderator may now warn, time out and ban by rule, so shadow mode, review and appeals become mandatory parts of the design |
| Contribution visuals | Offering Altar (Sonnet, S1) | Money changes visuals only, never votes, draws or moderation; intensity tiers | Any contribution drives any visual: a camera frame, a screen border or an on-screen object. The streamer designs the asset and its intensity ranges in HTML, CSS and JS | The altar becomes one template among several |
| Extension studio | War Table (Opus, O3) | One reviewed, data-driven Extension shell; sealed turns; chants counted only after moderation | A designer for interactive Extensions: layout, the viewers' controls, and who operates it (a human or an AI streamer) | The season-long hexmap and its foil character become a template |
| Parked | Sealed Decrees (Opus, O2) | Its seal-then-count pattern lives on in the lottery's verifiable draw | Nothing for now | Descoped: built around AI streamers, while the hackathon is human-first |

All six designs agreed on a shared spine, and it carries over unchanged. A Twitch bridge, one chat-ingest path, one event bus to the console and the stage, and one moderation verdict sit in front of every module. A message the moderator removed never counts toward a draw, a chant or a consensus.

## Market

No tool we found offers a replay simulator, a consensus view, a verifiable visual draw, or a self-serve Extension designer. Those four are the gap. The commodity layer is crowded and free: chat filters, alerts, chat-only giveaways and trigger-to-effect automation.

| Tool | Type, licence | Overlaps | What it lacks for us |
| --- | --- | --- | --- |
| [Streamer.bot](https://streamer.bot/) | Local Windows app, free; main repo shows no licence | Strong on triggers to OBS and overlays; giveaways weak | Its [giveaway docs](https://docs.streamer.bot/guide/giveaways) are missing; needs C# actions knowledge |
| [Firebot](https://github.com/crowbartools/Firebot) | Desktop, GPL-3.0, free | Basic moderation, effects and alerts | No LLM, no replay; Twitch only |
| [Mix It Up](https://mixitup.bot/) | Desktop, local data | Giveaways, custom overlays | Licence and price unverified |
| [StreamElements](https://docs.streamelements.com/chatbot/modules/giveaways) | Cloud, closed, free core | Giveaways with sub "luck" 1x to 10x, rules, custom widgets | No on-stream draw visual; paid weight is the very pattern our lottery blocks by default |
| [Streamlabs Cloudbot](https://streamlabs.com/cloudbot) | Cloud, closed | Filters, points-weighted giveaways, widgets, a prebuilt Extension | No AI; the Extension is fixed, not designable |
| [Fossabot](https://fossabot.com/) | Cloud, closed, free | 15 spam filters, regex terms, lookalikes, audit logs | Rules only, no AI on its site |
| [Lumia Stream](https://www.lumiastream.com/features) | Desktop, closed, Premium $5.99/mo | Overlays, alerts, raffles, lights | Key features paywalled |
| [StreamChat AI](https://www.streamchatai.com) | Cloud, closed, $6.99 to $13.99/mo | LLM moderation with escalation and logs | No rule preview or replay |
| [ForgetMeNot](https://github.com/thedeutschmark/forgetmenot) | Local, AGPL-3.0, bring your own key | LLM timeouts with shadow mode and fixture evals | Memory bot first; single author |
| [Wheel of Names](https://wheelofnames.com/) | Web, free | Weighted wheel as an OBS source | No Twitch eligibility, no audit trail |
| [Crowd Control](https://crowdcontrol.live/blog/complete-guide-to-the-crowd-control-effect-manager-2026-update) | Cloud with game connectors | Viewer spend triggers in-game effects | Effects land in games, not the streamer's own visuals |
| [Muxy](https://www.muxy.io/post/learn-about-the-pokémon-panel-extension-for-giveaways) | Custom Extensions | Giveaway panels for publishers | Agency work, not self-serve |
| [Twitch itself](https://dev.twitch.tv/docs/chat/moderation/) | Platform | AutoMod, Shield Mode, suspicious users, an AutoMod testing tool | AutoMod holds but never bans; its test tool takes pasted lines, not a whole past stream |

**The gap we can own:**

1. **Replay simulator.** It runs a whole past stream through the streamer's own rules and shows the difference. We found no tool that does this.
2. **Consensus chart.** Other tools filter, rank or reply to messages. None clusters text, emotes and reactions into opinion directions.
3. **Visual, verifiable draws.** Twitch-aware eligibility, a themed on-stream object and a proof anyone can check, in one place.
4. **A designer, not a trigger list.** Intensity ranges mapped onto the streamer's own assets.
5. **A self-serve Extension studio,** open-source and free.

**Threats:**

- **Twitch is moving into moderation preview.** It has a learning AutoMod and an AutoMod testing tool.
- **Twitch is reshaping contribution mechanics.** Custom Power-ups and Community Trains were announced at TwitchCon Rotterdam in May 2026 ([recap](https://blog.twitch.tv/en/2026/05/30/everything-we-announced-at-twitchcon-rotterdam-2026/)).
- **Incumbents could copy single features cheaply.** StreamElements and Streamlabs could add a draw animation or AI. A Streamer.bot community extension could clone one feature.

Our defence is the combination: one moderation verdict in front of every module, local-first, free, and auditable.

Market figures come from the vendors' own pages; licence and price cells we could not verify are omitted.

## Twitch platform constraints

Three modules can run entirely on the streamer's own user token over EventSub WebSocket, with no server. The Extension studio is the exception: it needs a hosted service, a review per shell version, and allowlisted hosts.

| Module | Twitch surfaces | Scopes, token | Limits that shape the design |
| --- | --- | --- | --- |
| Lottery | `channel.chat.message`; channel-point redemptions; Get Chatters; Send Chat Message | `user:read:chat`, `channel:read:redemptions`, `moderator:read:chatters`; streamer's token | Get Chatters lags joins and leaves, so draw from people who chatted, not from the viewer list. The bot can send 20 messages per 30 s, or 100 as a moderator |
| AI moderator | Ban/timeout, unban, delete, warn, AutoMod held messages and settings, Update Chat Settings, Shield Mode, suspicious users, unban requests; EventSub `channel.moderate` v2, `automod.message.hold` v2, `channel.suspicious_user.message` | About 14 `moderator:*` scopes; the streamer's token, or a mod's token whose ID matches `moderator_id` | Chat delay is 2, 4 or 6 s; slow mode 3 to 120 s; timeouts up to 14 days; reasons up to 500 characters. Ban, unban and warn carry an unpublished per-channel cap, so honour the `Ratelimit-*` headers. Restricted users' messages arrive only on the suspicious-user event |
| Contribution visuals | `channel.cheer`, `channel.bits.use`, subscribe, gift, resub, Hype Train v2, channel-point redemptions (custom and automatic v2), charity, goals, Custom Power-up redemptions | `bits:read`, `channel:read:subscriptions`, `channel:read:hype_train`, `channel:read:redemptions`, `channel:read:charity`, `channel:read:goals` | `channel.cheer` and `channel.bits.use` overlap, so dedupe them. Hype Train v1 is gone (2025-06-13). Extension Bits events arrive only by webhook or conduit, never by WebSocket |
| Extension studio | Extension shell; Configuration Service; Extension PubSub; viewer JWT | Extension client ID and secret on a hosted service | All code is bundled and reviewed, with no `eval` or remote scripts. Every fetched or image host is allowlisted per version, and generic public hosts are banned. Configuration is 5 KB per segment and 20 writes a minute. PubSub is 5 KB per message. Review takes 8 to 14 days, and a rejection revokes the client ID for good |

**Shared limits.**

- **WebSocket transport.** Three connections per token, 300 subscriptions per connection, and no replay after a drop. The bridge resubscribes and marks the gap in every ledger.
- **No AutoMod at bulk.** Check AutoMod Status, the only official "would AutoMod flag this?" call, allows 5 to 30 calls a minute. The replay simulator therefore uses its own rules and model, never Twitch's AutoMod.
- **Replay data.** Twitch has [no API for past-VOD chat](https://dev.twitch.tv/docs/api/reference/). The [Developer Agreement](https://legal.twitch.com/en/legal/developer-agreement/) forbids undocumented endpoints, and the [Terms](https://legal.twitch.com/en/legal/terms-of-service/) forbid scraping. Replay therefore covers streams the app recorded itself, from install day on, plus logs the streamer supplies. A stream from before install day has no clean source.
- **Test before review.** Every module except the Extension runs fully on the streamer's own channel from day one. The Extension runs in Local and Hosted Test for allowlisted accounts, without review.

## Module designs

Each module is a configuration engine with a preview. The streamer shapes it, tests it without a live audience, then turns it on. Every module reads chat only after the moderator's verdict.

### Lottery manager

A draw is a saved configuration with these settings:

- the pool (chatters, followers, subscribers, channel-point redeemers, keyword typists);
- weights and the number of winners;
- cooldowns and cohort caps (raiders fill at most a third of the winners);
- what is drawn: a prize, a question, an idea or a seat;
- the visual shape: an urn, a wheel, a deck or a ballot box.

A draw runs in five steps:

1. **Freeze.** The app freezes the entry list and hashes it.
2. **Announce.** It posts that hash with a future [drand](https://docs.drand.love/developer/) beacon round, which comes every 3 seconds.
3. **Derive.** The winners come from that round's signed value, by seeded rejection sampling.
4. **Animate.** The animation shows a result that is already decided.
5. **Publish.** A downloadable proof bundle and a one-file verifier let anyone recompute the result.

Without network access the app falls back to a plain commit-and-reveal, labelled "streamer-controlled".

| Setting on a prize draw | Default |
| --- | --- |
| Entry needs a sub, Bits or a gift sub; or a payment buys extra weight | Blocked; unlock needs a logged risk acknowledgement |
| Subscriber-only entry; channel points with no free path; no age or region set | Warning, one click to proceed |
| Prize value over $5,000 in total | Blocked until the streamer confirms registration (Florida and New York thresholds) |
| No prize (featuring a viewer's question or idea) | Allowed with no friction |
| Free path with equal odds, official-rules template, Twitch disclaimer on stream | Built in |

The demo configuration is Malakor's urn: it draws 3, 7 or 15 viewers depending on the room tier.

### AI moderator

The Hold Gate and the Room Governor merge into three layers that share one ledger.

- **Gate.** It holds the room's intake: a non-moderator chat delay of 2, 4 or 6 seconds, the AutoMod held queue with approve and deny, and Shield Mode as the emergency switch.
- **Governor.** It sets room modes (slow, follower-only, emote-only, unique chat) by room-size tier. Hysteresis stops it flapping, and each mode runs on a timed lease that ends by itself.
- **Rules on people.** Streamer-set rules (patterns, links, repeats, account age) and plain-language rules judged by an LLM in batches lead to warn, delete, timeout or ban. Mode is per rule: **shadow** reports what it would do, **armed** acts. Bans default to a human click. Every action logs its reason, and every reversible action has an undo.

The moderator also reads the room, in two ways.

- **Consensus chart.** Messages that pass the gate are grouped into *directions*. The grouping uses message embeddings, keyword seeds the streamer sets, and an emote lexicon the streamer tags by meaning. Each direction's share is plotted over a sliding window, filterable by emote or emotion. It describes the room and never acts on anyone.
- **Replay simulator.** It runs a past stream's chat through today's rules and shows what would have been held, removed or switched, and who would have been timed out. A diff view compares two rule sets. The source is the streamer's own chat, recorded by the app from install day on, because Twitch offers no clean way to fetch older chat. Imported logs carry their source on every result.

The Overlord repo already has the rule model, the shadow and armed split, strike escalation, a batched classifier with fenced prompts, and an append-only decision log. It has no gate, governor, consensus or replay.

### Contribution visuals

The module works in three parts.

- **Events into intensity.** Contribution events (Bits, subs, gifts, Hype Train level, channel points, charity, goals) feed an intensity engine. Each visual maps totals onto 0 to 1 through the streamer's ranges, with a decay rule, for example "halves every 5 minutes".
- **Intensity into looks.** Intensity drives the properties of a declarative **design package**: layers of image, shape, text and particle presets, with glow, size, colour and sound.
- **One renderer, two hosts.** A single renderer draws a package in an OBS browser source served on localhost. The same bundle runs inside the Extension.

The asset designer has an intensity slider and a "simulate a 50-sub gift bomb" button. The co-pilot can generate art through Leonardo: it makes an anchor image, uses it as the reference for matching assets, then removes backgrounds.

Money changes looks only. It never touches a draw, a vote, a rank or a moderation decision.

### Extension studio

The app ships **one reviewed Extension** whose bundled code interprets design data: layout, components, viewer controls and art. A new design is a data change, so it needs no review. Executable per-channel code is impossible under Twitch's rules, and the studio never produces any.

- **Templates.** A hex map (Malakor's war table), a choice board, a viewer card, the lottery's draw and a contribution meter.
- **Operation.** The operator is a human, an AI streamer, or an AI that proposes while a human approves. Viewer actions are vote, pick a tile or join a side, each with a cadence and limits.
- **Test stages.** Each design moves through local test, hosted test and released. The first two run live on the streamer's channel for allowlisted test accounts only.

The Extension needs a small hosted service that holds its secret, signs messages and serves design data. It is the only part of the product that is not on the streamer's machine (see Architecture).

## Architecture

The app is local-first and runs on the Shadowrunr OS stack. Its one hosted part is a thin service the Extension needs, because Twitch requires an Extension's secret to sit on a server.

_[Embedded diagram: see the Claude Doc]_

Chat enters once through the Twitch bridge and passes one verdict before any module sees it. Moderator actions flow back out through the same bridge.

| Component | Built with | Pattern copied from Shadowrunr OS |
| --- | --- | --- |
| Shell and UI | Tauri 2, React 19, Vite, TypeScript | The console's thin client: query cache, `/events` socket, mutation invalidation |
| Core service | Rust, tokio, axum on loopback | The daemon's `/rpc` and `/events`, with resume by sequence number |
| Contract | Rust types, then JSON Schema, then TypeScript types and validators, with a drift gate | `packages/contract` codegen from one method table |
| Twitch bridge | Device-code login, OS keyring, EventSub WebSocket, Helix wrapper | `platform/twitch`. Never run live: widen the scopes and subscriptions, and make the keyring cross-platform |
| Engine wrapper | A trait with role routing, live and batch admission lanes, and a cost ledger | `shadowrunr-engine`, with the backend order changed (below) |
| Moderator | Rules, shadow and armed modes, strikes, batched fenced classifier, JSONL ledger | `daemon/moderator` |
| Renderer | Declarative design packages; CSS-first animation for OBS's embedded Chromium | stage-kit's pure reducer, timed slots and lost-signal watchdog |
| Store | SQLite with append-only JSONL ledgers | The brain store and the moderator decision log |
| Extension service | A small hosted Rust service | None; new |

**Engine wrapper.** It has two paths.

- **Fast path.** Live moderation has a budget of roughly 0.3 to 2 seconds. It uses the OpenAI API (Responses API) or any OpenAI-compatible local endpoint, with a preloaded local model (Ollama, LM Studio), a short timeout and a stated fail-open or fail-closed rule per rule.
- **Slow path.** The co-pilot's design work runs on a CLI provider chosen in settings, behind one trait: the user's own Claude Code CLI (headless `claude -p --output-format stream-json`; the development default) or the user's own Codex CLI run headless ([non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode)): `codex exec --json`, prompt on stdin, the `-s read-only` sandbox, `-o` for the last message, `--output-schema` for writs where useful, and `codex exec resume <id>` for follow-ups. The JSONL events are parsed: `thread.started` carries the thread id; `turn.completed`, `turn.failed`, `item.*` and `error` carry the rest.

The app detects the CLI and asks the user to sign in to Codex themselves (ChatGPT sign-in), or to bring an OpenAI API key, kept in the OS keychain and passed as `CODEX_API_KEY` only to that child, never logged. The app never reads `~/.codex/auth.json`, and never uses `--dangerously-bypass-approvals-and-sandbox`. The product name and UI do not imply OpenAI endorsement; any "Built with Codex" or "Powered by OpenAI" attribution follows OpenAI's brand guidelines (verify current guidelines).

**Images.** Leonardo runs on the streamer's own key, kept in the OS keychain. Every request is private (`public:false`). Transparent assets come from generating on a flat background, then `remove-bg`. Each response's cost goes into the engine ledger ([Leonardo docs](https://docs.leonardo.ai/docs/getting-started)).

**Delivery to OBS.** The app creates the browser source itself through obs-websocket v5 (`CreateInput`), and busts the cache with the design's hash. Shadowrunr already learned to serve on `localhost`, not `127.0.0.1`, so its origin check passes.

**Delivery to the Extension.** It is the same renderer bundle. State goes out as coalesced snapshots of at most 5 KB, sent at most once a second. Twitch's docs disagree on the limit: 100 a minute per channel in the [API reference](https://dev.twitch.tv/docs/api/reference/), 1 a second elsewhere. The design comes from the 5 KB configuration segment or from our service. Images load only from our one allowlisted host.

**Modules as plugins.** Each module registers with the core in four ways:

- it subscribes to post-verdict events;
- it adds its methods to the one contract table;
- it emits typed stream events;
- it ships its templates as data.

A fifth module later is a new package, not a fork.

## Safety, legal and policy

The product's defaults carry its safety: shadow before armed, a human before a ban, free entry before paid, local before cloud. This section is product research, not legal advice.

| Area | Rule the app enforces | Why |
| --- | --- | --- |
| Automated actions on people | Shadow mode by default, per rule. Actions escalate from warn to timeout to ban. A ban needs a human click unless the streamer arms it. Every action logs a reason (Twitch allows 500 characters) and offers an undo where Twitch allows one. Unban requests reach a human queue | Twitch frames AutoMod as "hold for a human". An LLM's false positive must cost a timeout, not a lost viewer |
| Disclosures | A message about self-harm or crisis is never actioned automatically; it goes to the streamer | Carried over from Shadowrunr's moderator policy |
| Room reading | The consensus chart and room tiers describe the room and never act on a person | Keeps the Governor's original principle where it still fits |
| Chat data | Stored on the streamer's machine only. A retention cap, a "forget this user" action, and a full purge when Twitch reports the authorization revoked. Real chat never ships as a fixture or dataset | [Developer Agreement](https://legal.twitch.com/en/legal/developer-agreement/) Schedule 1 §2 and §VI.F |
| Chat sent to a cloud LLM | Off by default. Live classification runs on rules and a local model; a cloud engine is opt-in with a plain notice | §VI.C bars sharing Twitch data with third parties without Twitch's permission; whether an LLM call counts is unclear |
| Giveaways | Paid entry or paid weight on a prize draw is blocked by default. A free path gets equal odds. The rules template, the Twitch disclaimer, and age and region settings are built in. Totals over $5,000 need confirmed registration | Prize plus chance plus consideration makes an illegal lottery ([Odin Law](https://odinlaw.com/are-giveaways-on-twitch-legal/), [UK Gambling Commission](https://www.gamblingcommission.gov.uk/public-and-players/guide/page/free-draws-and-prize-competitions)) |
| Bits in the Extension | Bits never buy an entry, a ticket or a random outcome | Extension policies 6.2.4 to 6.2.6 ([guidelines](https://dev.twitch.tv/docs/extensions/guidelines-and-policies/)) |
| Viewer content in the Extension | Twitch ID required, streamer approves or rejects, username shown, removal possible | Extension policy section 7 |
| AI engines | The user signs in to their own Codex CLI or brings their own OpenAI key. The app never reads, stores or injects credentials, and the product name and UI do not imply OpenAI endorsement | OpenAI's terms of use and the [Codex docs](https://learn.chatgpt.com/docs/cli/reference) |
| Generated art | Leonardo runs private (`public:false`) on the user's key, and generated art is labelled as such | Leonardo's API terms on ownership could not be read (the page returned 403); confirm them before AI art ships in a public Extension |

## Risks and open questions

The largest risk is the Extension studio. It depends on a policy reading Twitch has not confirmed, and on a hosted service a free app has to pay for.

| Risk | Effect if it lands | Mitigation |
| --- | --- | --- |
| Twitch rejects a data-driven Extension, or per-streamer branding (policy 4.9) | The studio loses its premise; a rejection revokes the client ID for good | Ask Twitch Extensions support before building. Submit a minimal shell first. Fallback: generic art with streamer colours only |
| The hosted Extension service | Running cost and operations for a free product | Keep it stateless and tiny; decide who hosts it (question 1) |
| Shadowrunr's Twitch code has never met the real service | Login, refresh, reconnect and armed actions may fail on day one | First work package is a live spike on a real channel |
| LLM false positives or latency on the fast path | Wrong timeouts; held chat that feels laggy | Shadow by default, a human before bans, measured latency budgets, rules first |
| Replay only covers streams from install day on | A weaker first demo | Seed the demo with simulated chat, which Shadowrunr's simulator already generates, labelled as simulated |
| Driving the Codex CLI under a user's ChatGPT plan, rather than an API key, from inside another app may be policy-fragile or plan-limited | The default slow lane could break or throttle for users | The OpenAI API key and local paths are first-class from day one |
| Twitch ships the same features | AutoMod already learns from moderator actions and has a testing tool | Compete on the combination, local-first and auditable, not on any single feature |
| PubSub limit: the docs say 100 a minute in one place and 1 a second in another | Throttled Extension updates | Coalesced snapshots, at most one a second; measure in Hosted Test |
| Brand name not cleared | A rename after launch | Run a name search before the brand is final |

**Open questions for the owner:**

- [ ] Who runs the Extension service: one shared service we host, or a self-host option for each streamer?
- [ ] Live moderation engine default: a local model only, or the streamer's own cloud key as an opt-in?
- [ ] Overlord's urn and hex map: built in the new repo as shipped templates, or by Overlord as the toolkit's first external user?
- [ ] Licence: Apache-2.0 like Shadowrunr OS, or a copyleft licence such as GPL-3.0?
- [ ] Platforms: Twitch only for v1 (recommended), or Kick and YouTube later?
- [ ] Sequencing against the Kiroween Shadowrunr v2 rebuild: both plans start a new repo on the same stack.

## Next

**Update, 2026-10-25:** the landing contest is decided, and **Castle Control** won. The UI is in [Part 2 — UI](02-ui.md) and the plan is in [Part 3 — Implementation plan](03-implementation-plan.md). The note below is as written before the contest ran: the landing contest was running then. Opus (xhigh) develops "Castle Control" plus two wildcards, and Sonnet (max) develops "Shepherd" plus two wildcards. Each variant is a brand: a landing page plus the main page of all four modules, built on illustrative Overlord-sandbox data.

1. **Part 2: UI.** The owner reviews the six brands blind and picks or fuses one. Its module pages become the UI layer of this document.
2. **Implementation plan.** Work packages for the new repo, sized for Codex builders and a reviewing Director. It starts with a live spike on a real channel, because none of Shadowrunr's Twitch code has met the real service: device login, EventSub, one armed timeout, one OBS browser source.
3. **Before public release.** Clear the brand name, check the Extension policy questions with Twitch (see Risks), and have a lawyer review the official-rules template.

## Sources

Research was done on 2026-10-25 by five research agents and one code scout, using the pages below. The contest's six design reports and the Overlord repo itself are the other inputs.

- Twitch: [API reference](https://dev.twitch.tv/docs/api/reference/), [EventSub types](https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types/), [chat moderation](https://dev.twitch.tv/docs/chat/moderation/), [Extensions](https://dev.twitch.tv/docs/extensions/), [Extension guidelines](https://dev.twitch.tv/docs/extensions/guidelines-and-policies/), [Extension life cycle](https://dev.twitch.tv/docs/extensions/life-cycle/), [Developer Agreement](https://legal.twitch.com/en/legal/developer-agreement/), [Terms of Service](https://legal.twitch.com/en/legal/terms-of-service/), [TwitchCon Rotterdam 2026 recap](https://blog.twitch.tv/en/2026/05/30/everything-we-announced-at-twitchcon-rotterdam-2026/)
- OBS: [browser source](https://obsproject.com/kb/browser-source), [obs-websocket protocol](https://github.com/obsproject/obs-websocket)
- Giveaways and fairness: [Odin Law](https://odinlaw.com/are-giveaways-on-twitch-legal/), [Legal Moves](https://legalmoveslawfirm.com/twitch-giveaway-rules/), [UK Gambling Commission](https://www.gamblingcommission.gov.uk/public-and-players/guide/page/free-draws-and-prize-competitions), [drand](https://docs.drand.love/developer/), [NIST beacon](https://csrc.nist.gov/projects/interoperable-randomness-beacons)
- Engines and images: [Codex non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode), [Codex CLI reference](https://learn.chatgpt.com/docs/cli/reference), [Codex SDK](https://learn.chatgpt.com/docs/codex-sdk), [Leonardo API](https://docs.leonardo.ai/docs/getting-started), [Ollama OpenAI compatibility](https://docs.ollama.com/api/openai-compatibility)
- Consensus prior art: [Emote-Controlled](https://github.com/konstantinkobs/emote-controlled), [FeelsGoodMan](https://arxiv.org/abs/2108.08411), [Polis opinion groups](https://compdemocracy.org/opinion-groups)
- Market: the vendor pages linked in the Market table
