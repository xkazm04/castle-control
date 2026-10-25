# WP 0.4: prototype inventory and component kit

Baseline: `3e325fb899ebedb467de4a514e6801b9c8f1e9d4` (WP 0.6), 2026-10-25.
Neither `packages/tokens` nor `packages/ui` existed on that main tip. This is
the Q0 (read-only surface/duplicate inventory) and Q1 (token reality, states,
keymaps and URL contracts) record. The prototype is reference only. No prototype
file or product behavior was copied or modified. Mark paths and grain are design
assets; declared token values and measured layout dimensions are design data.

The tables below distinguish shared kit primitives from module-owned content.
Putting a complex preview inside a `NumberedPanel` does not implement its renderer.
The following module work packages still own those renderers and business states.

## Shared visuals and duplicate resolution

Every repeated visual has one shared implementation. Evidence cites the defining
style or template and additional consumers; the selector index below expands
this to every class in every prototype stylesheet, including inline styles.

| Visual and duplicate evidence in prototype | Single kit component | Resolution |
| --- | --- | --- |
| Masthead, air stamp, live figures, registration marks, demo sample tag: `app.js:183`, `app.js:264`, `app.css:40`; shared by all four chamber HTML files | `Rampart` | Controlled `on_air`, viewers, uptime, Twitch, OBS, Shield Mode and counts; callbacks for settings/Steward. Optional sample/simulated label. |
| Keep-bubble: `mark.js:6`, `app.js:187`, `index.html:16`, `brand.html:90` | `Mark` | One vector asset in React; no string injection or DOM helper. |
| Armed/watching/Bridge up chip: `app.js:278`, `app.css:63`; all four ramparts | `GatehouseChip` | Counts and Shield Mode supplied by caller; zero-count watching state remains explicit. |
| Connected/reconnecting/down: `app.js:134`, `app.js:275` | `ConnectionMark` | Text plus registration mark, independent of color. |
| Contents links, hall summary, four-color strip: `app.js:198`, `app.css:112`; landing equivalents `index.html:253`, `brand.html:165` | `ChambersColumn` | One chamber metadata table; hrefs and live figures supplied by caller. Landing bar layout remains WP 6.2. |
| Breadcrumb, ghost title, plain description, actions: `app.css:172`, `lottery.html:119`, `moderator.html:107`, `visuals.html:61`, `studio.html:98` | `PageHeader` | Nested breadcrumbs, title and actions use the same component. |
| Number, section heading, gloss, metadata, top rule: `app.css:186`; section occurrences across all four pages | `NumberedPanel` | Rule-separated content slots, not card wrappers. |
| All `.btn`, `.sm`, `.icon`, `.ghost`, `.primary`, `.plate`, `.danger`, disabled buttons: `app.css:78`, `lottery.html:138`, `moderator.html:140`, `visuals.html:91`, `studio.html:135`; landing variants `landing.css:29` | `InkButton` | One native button API with size and appearance variants. Landing shadow treatment remains WP 6.2, not a second kit button. |
| Paper/stock button: `app.js:194`, `app.js:221`, `landing.js:455`, `brand.html:73` | `ThemeToggle` | Controlled theme and callback; native keyboard activation; no localStorage or global listener. |
| Outline/solid ink, ok/bad/warn/dashed badges: `app.css:221`, `app-lottery.js:172`, `app-studio.js:183` | `StatusChip` | Eleven enumerated appearances, each tested in both themes. |
| Pass/Hold/Bar marks: `app.css:229`, `moderator.html:136`, `app-moderator.js:146` | `VerdictChip` | Three labels, plain-language descriptions and decorative icons. |
| Rule grid and replay rule controls: `moderator.html:141`, `moderator.html:168`, `app-moderator.js:194`, `app.css:237` | `RuleTable` | Named row model, shadow/armed button, optional hits, windowed body. Replay-specific settings remain WP 1.6. |
| Empty callouts: `app.css:248`, `app-lottery.js:180`, `app-moderator.js:239`, `app-studio.js:151` | `EmptyState` | Title, description and optional action; shared mark illustration replaces module-specific empty icons. |
| Page grid, paper/stock backdrop: `app.css:38`, `app.css:15`; all four pages | `KitShell`, `ThemeFrame` | Layout and theme scope; the desktop route and status wiring remain WP 0.5. |

## Chamber-specific visual inventory

These compositions reuse the kit names above; their unique art, charts and
content are recorded here for their owning work packages rather than copied.

| Surface | Visual components and source evidence | Shared duplicate resolution / remaining owner |
| --- | --- | --- |
| Lot Chamber | Roll hero/count/state/actions (`lottery.html:131`); numbered-ticket strip and cohort dot field/legend (`lottery.html:142`); saved-draw radio list (`lottery.html:149`); handle lookup/table (`lottery.html:152`); configuration and policy verdict (`lottery.html:159`); four-step proof tracker (`lottery.html:166`); OBS stage/camera/disclaimer, shape selector, timing and trial/cast actions (`lottery.html:169`); past-draw table (`lottery.html:178`); nested writ, bundle file list, seal, round, editable entries, recompute/tamper/reset (`lottery.html:184`) | `PageHeader`, `NumberedPanel`, `InkButton`, `StatusChip`, `EmptyState`; WP 2.3 owns draw visuals, lookup and writ compositions. WP 2.2 supplies proof semantics. |
| Gatehouse | Consensus band chart, filters and direction deltas (`moderator.html:120`); live-chat search, mark/direction filters, pause and lines (`moderator.html:128`); rules/hits/mode table (`moderator.html:140`); tiers, leases, delay and Shield control (`moderator.html:147`); held queue (`moderator.html:150`); decision log/undo/petitions (`moderator.html:153`); replay summary (`moderator.html:156`); nested replay totals, editable rules and result lines (`moderator.html:164`) | `PageHeader`, `NumberedPanel`, `RuleTable`, `InkButton`, `StatusChip`, `VerdictChip`, `EmptyState`; WP 1.7 owns charts, held/ledger/room pages; WP 1.6 owns replay. |
| Beacons | Three beacon radio cards, halftone previews, blaze/range rulers (`visuals.html:71`); editable curve/handles, decay and weighting (`visuals.html:78`); stylised test-fire preview and intensity slider (`visuals.html:89`); browser-source URL/copy and Extension checkbox (`visuals.html:94`); feed filters/table and sample-clock controls (`visuals.html:103`); layers and code view (`visuals.html:109`) | `PageHeader`, `NumberedPanel`, `InkButton`, `StatusChip`, `EmptyState`; WP 3.3 owns designer/curve/feed; WP 3.2 owns renderer. |
| Map Room | Piece switches (`studio.html:109`); operator controls/cadence/seal/limits (`studio.html:114`); map tools, hex canvas, fog, selection/inspection and turn/tallies (`studio.html:120`); five template cards (`studio.html:127`); desktop/mobile spyglass (`studio.html:131`); test ladder/allowlist/submission (`studio.html:135`) | `PageHeader`, `NumberedPanel`, `InkButton`, `StatusChip`, `EmptyState`; WP 4.3 owns studio compositions. Viewer renderer remains WP 4.1. |
| Steward | Engine selector, brief chips, prompt, slips, diff/insert/delete, Seal/Tear, done/torn state (`app.js:205`, `app.css:139`, `app.js:340`) | `NumberedPanel`, `InkButton`, `StatusChip`; UI and writ flow remain WP 5.2. No kit control applies a real configuration. |
| Landing | Top brand/theme/open-app bar (`index.html:15`); registered multi-plate keep, moat, towers, drum, gate and map (`index.html:25`); custom wordmark and four names (`index.html:128`); hover labels/hit zones (`index.html:143`); mobile poster/strips (`index.html:163`); opened chamber scenes with Back/full-feature expander (`landing.js:391`, `landing.js:445`); persistent chamber banner and honesty footer (`index.html:253`) | `Mark`, `ThemeToggle`, `InkButton`, chamber metadata; WP 6.2 owns landing art/layout/intro. No landing product script is imported. |
| Brand sheet | Hero, working-name badge, mark sizes, ink swatches, overlap diagrams, four font specimens, chamber cards, vocabulary table, voice examples and honesty footer (`brand.html:78` through `brand.html:162`) | `Mark`, `StatusChip`, `NumberedPanel`, `ThemeToggle`; reference documentation, not another independent kit implementation. |

## Token reality and generation

`packages/tokens/src/source.ts` is the only editable token source. It contains
all 36 paper declarations and 20 stock overrides from `prototype/tokens.css`,
the app-only root/theme declarations from `app.css:3`, and named layout metrics.
`pnpm --filter @castle-control/tokens generate` emits `generated.css` and a
literal, readonly typed mirror (`generated.ts`). Import the package root to load
the CSS and access `tokens`, `Theme` and `TokenName`. Consumers never import
workspace internals. Package `typecheck`, `lint` and `test` use the unchanged
shared package-gate runner.

The token test reads both immutable prototype declarations and the token source,
checks every value as a UTF-8 Buffer, verifies declaration counts, then checks the
entire generated CSS/mirror against the generator. Formatting around declarations
is normalized; the values themselves preserve case, quotes, spacing and decimal
notation byte for byte. Prototype files are never written during tests.
The real counts are printed in the generated table below; that table is the
authoritative enumeration, including app-only tokens and rejected candidates.

Accepted layout dimensions include masthead 56 px, chambers column 212 px, page
padding 24 px, title 54 px, chamber number 40 px, label floor 13 px, button 32 px,
small button 28 px, chip 22 px, table row 32 px, panel rule 2 px and table rule
1.5 px. Sizes and colors live in the shared token source, not component CSS.
The 1420 px media breakpoint remains a CSS media constant because custom
properties cannot be used in ordinary media queries. SVG numbers are vector
coordinates rather than CSS dimensions. Derived virtual table spacer heights
are calculated from the shared row token and row count, never hardcoded sizes.

## State machines (observed, not ported business logic)

| Machine | Transitions / guards | Evidence | Kit owner or later owner |
| --- | --- | --- | --- |
| Stream and links | live/offline; each link connected/reconnecting/down. Twitch failure takes banner priority over offline, then OBS failure. Offline pauses figures. | `app.js:54`, `app.js:238`, `app.js:264` | `Rampart`, `ConnectionMark`; banner composition WP 0.5. |
| Theme | paper ↔ stock; app/landing prototype synchronize saved `cc.state.v1` and storage events. | `app.js:54`, `app.js:75`, `app.js:221`, `landing.js:455` | `ThemeFrame`, `ThemeToggle`; persistence deliberately belongs to desktop owner. |
| Rules and Shield | shadow ↔ armed, counts recomputed; Shield off → confirm → on → off; held messages pending → resolved; actions append ledger. | `app.js:74`, `app-moderator.js:194`, `app-moderator.js:207`, `app-moderator.js:239` | `RuleTable`, `GatehouseChip`, `InkButton`; safety/confirmation belongs to Gatehouse, not the kit. |
| Steward | closed/open; proposed slip → sealed or torn; canned briefs in prototype. No effect before seal. | `app.js:205`, `app.js:319`, `app.js:340` | Native button callbacks; business implementation WP 5.1/5.2. |
| Draw | open → sealed → arrived → cast; intake only while open/live/connected; breaking seal voids and reopens; trial cast does not advance real phase; animation consumes result. Prototype hash ranking is illustrative, not production rejection sampling. | `app-lottery.js:93`, `app-lottery.js:108`, `app-lottery.js:168`, `app-lottery.js:295`, `app-lottery.js:319`, `app-lottery.js:363` | `StatusChip`, `InkButton`; engine WP 2.1/2.2, page WP 2.3. |
| Drill | nested replay initializes isolated adjustable rules; filters and result summary update without changing live rules until Apply. | `app-moderator.js:295`, `app-moderator.js:315`, `app-moderator.js:375` | `RuleTable`, `VerdictChip`, `PageHeader`; WP 1.6. |
| Beacons | selected asset; live-follow versus detached intensity preview; simulated gift bomb; paused/running sample clock at 1×/6×/30×; curve/decay/gift weighting controls. | `app-visuals.js:7`, `visuals.html:78`, `visuals.html:91`, `visuals.html:106` | `InkButton`, `StatusChip`; WP 3.3. |
| Map | select/repaint/fog/menu tools; menu ≤3 tiles; human/AI/both drivers; proposed AI menu approved/rejected; turn idle → running sealed → revealed; desktop/mobile preview; sand → muster → submitted (proclaimed waits review); allowlist changes. | `app-studio.js:15`, `app-studio.js:38`, `app-studio.js:71`, `app-studio.js:92`, `app-studio.js:117`, `app-studio.js:134`, `app-studio.js:174` | `InkButton`, `StatusChip`; WP 4.3, with Twitch policy gate. |
| Landing | pre → run → done; skip/first interaction/reduced motion end intro. Idle/hover chamber/open scene; Back returns focus; details collapsed/expanded; responsive mobile composition. | `landing.js:366`, `landing.js:391`, `landing.js:409`, `landing.js:445`, `landing.js:473` | Shared primitives only; WP 6.2. |

## Keymaps and URL contracts

| Surface | Observed contract | Evidence / disposition |
| --- | --- | --- |
| App navigation | `1` lottery, `2` moderator, `3` visuals, `4` studio; `/` opens/focuses Steward; Escape closes demo popover. Ignore modified shortcuts and normal navigation while typing. | `app.js:156`–`app.js:168`, `app.js:226`. One exported `keymap` table covers the kit's four chambers and Steward. React element `onKeyDown`, no raw listener. Demo popover is not ported. |
| Landing | 1–4 open chambers; Left/Right cycle open scenes; Escape closes; typing and modifier guards. | `landing.js:434`. Separate future site surface, WP 6.2. |
| Native controls | Buttons use native Enter/Space; form Enter sends/adds where appropriate; hex Enter/Space picks a tile. | `app.js:209`, `app-studio.js:59`, `app-studio.js:186`. Kit buttons remain native. |
| App documents | `lottery.html`, `moderator.html`, `visuals.html`, `studio.html`; `index.html` whole keep, `brand.html` brand sheet. | `app.js:156`, `app.js:187`, `app.js:202`. Components accept href props so WP 0.5 owns real routes. |
| Nested proof/replay | Lot `#writ/live` or `#writ/<id>`, default `#`/main; moderator `#replay`, Back `#`; unknown view falls back to main. | `app.js:327`, `app-lottery.js:316`, `app-lottery.js:475`, `app-moderator.js:375`. Heavy detail remains a page with breadcrumb/Back. |
| Landing scenes | `#lots`, `#gate`, `#beacons`, `#map`; hash/popstate keep selection; Back removes hash. Underlying links still target the HTML documents. | `landing.js:366`, `landing.js:389`, `landing.js:419`, `index.html:155`. |
| Asset/data URLs | `tokens.css`, `mark.js`, `app.css/app.js`, per-page scripts; `../data/sample.js` with `sample.copy.js` fallback. Illustrative overlay `http://localhost:4821/feeds/altar`. | `NOTES.md:44`, `visuals.html:94`. Kit imports only workspace CSS/React; no fetching, real chat, or remote fonts. Overlay URL is a prototype sample, not a new wire contract. |
| Kit | `pnpm --filter @castle-control/ui dev`; two vertically stacked 1440×900 sheets, paper then stock. Each theme toggle is local; state controls cycle live/links/Shield; chamber links and 1–4 change the selected chamber. | `packages/ui/src/kit.tsx`. Hash links are kit anchors only. No endpoint or product route is declared. |

## Written side-by-side: prototype shell and kit at 1440×900

This is the written comparison option from the brief: source declarations and
React static render output were compared side by side. Browser discovery returned
no available browser surfaces; there are no screenshots or measured pixel claims.
The kit builds successfully with Vite. Inspect paper at the top and stock on the
second 900 px sheet. A browser visual check remains useful to catch rasterization
or clipping differences which source comparison cannot establish.

| Named role | Prototype paper / stock | Kit paper / stock | Result |
| --- | --- | --- | --- |
| Paper | `#F4F0E6` / `#121317`; card `#FBF9F3` / `#1D2027`; app grain .5 / .28 | Same source values and grain asset; theme scope on each frame | Zero token-value deviations; grain is scoped to the frame rather than fixed to the browser body. |
| Inks | Azure `#3F86DC`, gules `#E4472E`, or `#F2B233`, theme-specific dark companions, multiply/screen | Same values, aliases and blend modes | Zero token-value deviations in either theme. |
| Type | Four system stacks; wordmark 19 px, title 54 px, chamber label 22 px, section title 17 px; several UI labels 12/12.5 px | Same stacks and major sizes; labels raised to 13 px | Explicit deviation: caption, button, table heading, breadcrumb, chip, figure label and sidebar figure floor is 13 px, as required by the port contract. Verdict/gloss 13.5 px becomes 13 px in this cut. |
| Rules | Masthead single 1 px plus offset 1 px rule, panel 2 px, table heading 1.5 px, theme hairlines | Same widths, rule/ink/hair aliases and 5 px masthead offset | Zero declared rule-value deviations in either theme. |
| Layout | Masthead 56 px; sidebar 212 px; main padding 24 px | Same dimensions | Kit content is a primitive gallery, not Gatehouse's hero chart. No editor, footer or connection alert banner is mounted. Those compositions belong to later packages. |
| Rampart details | Armed/watch/shield icons, quill icon, tooltip titles, links and sample demo popup | Same brand mark, counts and status words; native settings, theme and Steward buttons | Explicit deviations: text-only moderation segments and Steward; reconstructed theme/verdict/settings symbols; no demo popover. Thirteen-pixel labels can alter group width; no pixel claim is made. |
| Sidebar details | Whole-keep and brand-sheet icons; live summary | Same names, descriptions, figures and summary slots | Explicit deviation: secondary-link icons omitted; figures are supplied as props. |
| Tables/empty states | Auto-layout rule table, module-specific empty artwork | Fixed-layout virtualised rule table, common keep-bubble empty illustration | Explicit deviations: fixed equal column widths for bounded rows; common empty art. Text is clipped with ellipsis rather than widening the table. |

The known prototype landing wordmark defect, 1280 px Beacons/Map wrapping and
long-draw-title ellipsis (`NOTES.md:46`, UI plan's port contract) are recorded,
not imported into a new landing or chamber page by this kit.

## Validation evidence

- Token mismatch red proof: temporarily changed only the owned source's paper
  value to `#F5F0E6`; `pnpm --filter @castle-control/tokens test` exited 1, with
  the byte equality and generated drift tests failing. Source was restored;
  prototype remained untouched. No seeded violation remains.
- UI tests render each component in both themes: all eleven status chips, all
  three verdicts, link states, live/offline/sample/simulated, all button variants,
  sizes/disabled, both theme-toggle directions, moderation count/Shield
  combinations, shell/navigation, breadcrumbs/panels and empty/action states.
- A generated, labelled 10,000-row rule fixture renders at most 16 rows; range
  tests verify height conservation and access to the last row. Tests exercise
  bounded output without a new DOM/test dependency.
- Catalog React/React DOM 19.3.1, Vite 8.3.5, TypeScript 6.0.3 and Vitest 5.0.5.
  Director's 2026-10-25 exception authorizes `@types/react` and
  `@types/react-dom`; registry's compatible release is 19.3.0 for both. Added
  through `pnpm --dir packages/ui add -D ...@catalog:`. Existing Node typing
  version reused; no other new direct external dependency. Only pnpm updated
  the lockfile. The worktree's node_modules was absent before install; pnpm
  created a real local directory, never following or replacing a junction.
- Final frozen install, full gate counts and build bytes are recorded below.
  Source hashes below make the read-only reference reviewable.

### Final command results, 2026-10-25

| Command | Actual outcome |
| --- | --- |
| `pnpm install --frozen-lockfile` | Exit 0, four workspace projects, lockfile up to date. |
| `pnpm gate` | Exit 1. Manifest inventory 3, TypeScript inventory 19 at that execution, Rust format inventory 33 and format passed. Clippy inventory 33, then Cargo failed fetching existing `cc-store` dependency `chrono` from crates.io: Windows Schannel `SEC_E_NO_CREDENTIALS (0x8009030e)`, Cargo exit 101. Rust tests and the remaining stages were not reached by the full gate. |
| `pnpm typecheck`, `pnpm lint`, `pnpm test` | Each root recursive invocation failed with sandbox `spawn EPERM` while pnpm tried to start package lifecycle workers. Root tooling lint itself passed: tooling 11, workspace manifests 3, TypeScript 19, boundaries/hygiene/file-cap 72, secrets 130 at that execution. These failures are not counted as passes. |
| `pnpm --filter @castle-control/tokens typecheck`, `lint`, `test` | All exit 0; 7 source files, 1 test file, 2 passing tests, including original-token byte equality and generated drift. |
| `pnpm --filter @castle-control/ui typecheck`, `lint`, `test` | All exit 0; final typecheck/lint walked 11 source files. UI tests walked 10 files before the standalone budget checker was added, 2 test files, 65 passing tests. No component source changed after that test run. Final custom lint inventories: boundaries/hygiene/file-cap 73 each, secrets 131. |
| `pnpm --filter @castle-control/ui build` | Exit 0; Vite transformed 29 modules. Initial JS+CSS assets 253,499 bytes against a blocking 262,144-byte (256 KiB) budget, inventory 2 files. `check-build.ts` follows only assets referenced by the built entry, excluding stale build artifacts. |
| `git diff --exit-code HEAD -- Cargo.toml Cargo.lock crates scripts prototype packages/contract` | Exit 0. All Rust inputs, gate scripts, prototype files and contract package are unchanged from the baseline. No unrelated baseline fix or sandbox weakening was attempted. |

The complete gate remains unverified in this sandbox. App Master must rerun
`pnpm install --frozen-lockfile` then `pnpm gate` where Cargo TLS and pnpm
recursive worker spawning function. The unchanged Rust dependency/configuration
inputs and sandbox errors are the evidence for this external verification limit;
there was no second checkout or mutation of the main checkout to establish it.

<!-- Generated read-only evidence indexes follow. -->

## Q0 reference manifest

All 18 files were read for hashes and structural indexes; no writes target prototype.

| File | Lines | SHA-256 of worktree bytes |
| --- | ---: | --- |
| prototype/NOTES.md | 79 | be1d4c272826bd1d29180d86c38133b0c272b208497ed652f246330da4c6f025 |
| prototype/app-lottery.js | 480 | 244f43ac787e7055ab9a01b43962bd6c5ae56a3c5179cfbe4caacdde5da2a87b |
| prototype/app-moderator.js | 381 | 9f7cfdf7f723ae1d8f70681088af28aadec606d818e4a1603a1489d948052d13 |
| prototype/app-studio.js | 225 | 70791d81a4b1294936ce673e10d4fa69de545e4d7212f26dba097815ae02aa26 |
| prototype/app-visuals.js | 256 | 8b72ff83fba2901c7e3da062bba26571d6416b7b55864225fa3926d31b8efe9a |
| prototype/app.css | 270 | 16eb443cfedabe8fc567433b957554919276fde18b785dd8980b43dbd0776b8d |
| prototype/app.js | 396 | cc75dc18a802614eca49dd077d0a47840111774d755d30f86d8356d58c00ed1f |
| prototype/brand.html | 179 | e9780cac7569a357cb540722d85232ff0d0beec50510e0fe5f9fccbe9cb4011b |
| prototype/index.html | 465 | 713546d0ca61bbe46b79df48ccb13aa3af2fd4fed5f18c3be30cdafeded91193 |
| prototype/landing.css | 290 | 9e3688b1e6a668c8c05d4267461346ee6f3f18293616fc0177317c15106dcf3f |
| prototype/landing.js | 531 | 2c51f4fe556402050999e2914c59504449bdb4f939525acc756a748d5cd9f0dc |
| prototype/lottery.html | 213 | cb8e20d76fc009a6af923cca27acd2d6baec75e3a2deff0559ad5780f9c177e1 |
| prototype/mark.js | 18 | 54fde2432ff2a0dd408e134f679b01726959e7edfe9d3361cfebfc0f00afa927 |
| prototype/moderator.html | 184 | 8acf944b72dd2d797822392046842d7445e47cfcedaae94037145bcc4215e519 |
| prototype/sample.copy.js | 2 | d4266e94d7f709f516956505c4e10098def098aeb897bec2e8ee7993b07374b0 |
| prototype/studio.html | 147 | 32859c6b6da4c5c1c0183d91b98b5b8bc0087c35941538afbbfb34baa0213613 |
| prototype/tokens.css | 30 | 753859d290a97cf3a815b584809e51d1a1f93c36c28903e4cdb790934ca5d6e3 |
| prototype/visuals.html | 121 | 1f6b6bc3ecb26d69dda44ebefb2ae8bc2b81e8cbc46612aa3b77adc9d04578a7 |

## Q1 exhaustive token candidate register

Candidate set: every declared custom-property name in all 18 reference files.
Values used only via var() are references, not additional declarations.

| Candidate | All declaration evidence | Decision and reason |
| --- | --- | --- |
| --art | landing.css:284 | Reject as global token: local illustration coordinate, animation phase/depth, viewport transform or per-instance configuration, not a reusable design invariant. Keep with its owning illustration/module. |
| --azure | tokens.css:8 | Accept: unchanged shared theme/design declaration; see exact values below. |
| --azure-text | tokens.css:11, tokens.css:27 | Accept: unchanged shared theme/design declaration; see exact values below. |
| --bar-h | landing.css:6 | Reject as app token: landing-specific sheet sizing, knockout or grain; keep with WP 6.2. App grain has its own accepted asset. |
| --blend | brand.html:24, tokens.css:18, tokens.css:27 | Accept: unchanged shared theme/design declaration; see exact values below. |
| --c | brand.html:127, brand.html:128, brand.html:129, brand.html:130, brand.html:139, brand.html:140, brand.html:146, brand.html:147, index.html:205, index.html:206, index.html:207, index.html:208 | Reject as global token: contextual chamber/instance alias. Components derive the relevant shared ink; publishing it globally would erase scope. |
| --card | tokens.css:6, tokens.css:26 | Accept: unchanged shared theme/design declaration; see exact values below. |
| --cream | tokens.css:16 | Accept: unchanged shared theme/design declaration; see exact values below. |
| --cw | app.css:5 | Accept: shared app layout/theme metric or asset, retained in token source. |
| --d | landing.css:58, landing.css:59, landing.css:60, landing.css:61, landing.css:62 | Reject as global token: local illustration coordinate, animation phase/depth, viewport transform or per-instance configuration, not a reusable design invariant. Keep with its owning illustration/module. |
| --danger | tokens.css:14, tokens.css:28 | Accept: unchanged shared theme/design declaration; see exact values below. |
| --dc | app-moderator.js:116, app-visuals.js:64 | Reject as global token: local illustration coordinate, animation phase/depth, viewport transform or per-instance configuration, not a reusable design invariant. Keep with its owning illustration/module. |
| --dl | index.html:68, index.html:69, index.html:70, index.html:71 | Reject as global token: local illustration coordinate, animation phase/depth, viewport transform or per-instance configuration, not a reusable design invariant. Keep with its owning illustration/module. |
| --du | landing.css:8 | Reject as app token: landing-specific sheet sizing, knockout or grain; keep with WP 6.2. App grain has its own accepted asset. |
| --dur | index.html:66, index.html:67, index.html:68, index.html:69, index.html:70, index.html:71 | Reject as global token: local illustration coordinate, animation phase/depth, viewport transform or per-instance configuration, not a reusable design invariant. Keep with its owning illustration/module. |
| --ease | tokens.css:23 | Accept: unchanged shared theme/design declaration; see exact values below. |
| --ew | app.css:5, app.css:39 | Accept: shared app layout/theme metric or asset, retained in token source. |
| --faint | tokens.css:6, tokens.css:26 | Accept: unchanged shared theme/design declaration; see exact values below. |
| --field | landing.css:136, landing.css:138 | Reject as global token: local illustration coordinate, animation phase/depth, viewport transform or per-instance configuration, not a reusable design invariant. Keep with its owning illustration/module. |
| --font-display | tokens.css:19 | Accept: unchanged shared theme/design declaration; see exact values below. |
| --font-num | tokens.css:22 | Accept: unchanged shared theme/design declaration; see exact values below. |
| --font-serif | tokens.css:20 | Accept: unchanged shared theme/design declaration; see exact values below. |
| --font-ui | tokens.css:21 | Accept: unchanged shared theme/design declaration; see exact values below. |
| --grain | landing.css:9 | Reject as global token: landing-specific grain asset. The app uses a separately named --paper-grain extracted from app.css, so the two art textures never collide. |
| --grain-o | app.css:5, app.css:9 | Accept: shared app layout/theme metric or asset, retained in token source. |
| --green | tokens.css:13, tokens.css:28 | Accept: unchanged shared theme/design declaration; see exact values below. |
| --gules | tokens.css:9 | Accept: unchanged shared theme/design declaration; see exact values below. |
| --gules-text | tokens.css:11, tokens.css:27 | Accept: unchanged shared theme/design declaration; see exact values below. |
| --hair | app.css:4, app.css:9 | Accept: shared app layout/theme metric or asset, retained in token source. |
| --hair-2 | app.css:4, app.css:9 | Accept: shared app layout/theme metric or asset, retained in token source. |
| --hdr-h | landing.css:6 | Reject as app token: landing-specific sheet sizing, knockout or grain; keep with WP 6.2. App grain has its own accepted asset. |
| --i | landing.css:58, landing.css:59, landing.css:60, landing.css:61, landing.css:62 | Reject as global token: local illustration coordinate, animation phase/depth, viewport transform or per-instance configuration, not a reusable design invariant. Keep with its owning illustration/module. |
| --info | tokens.css:14, tokens.css:28 | Accept: unchanged shared theme/design declaration; see exact values below. |
| --ink | tokens.css:6, tokens.css:26 | Accept: unchanged shared theme/design declaration; see exact values below. |
| --ink-2 | tokens.css:6, tokens.css:26 | Accept: unchanged shared theme/design declaration; see exact values below. |
| --ir | landing.css:58, landing.css:59, landing.css:60, landing.css:61, landing.css:62 | Reject as global token: local illustration coordinate, animation phase/depth, viewport transform or per-instance configuration, not a reusable design invariant. Keep with its owning illustration/module. |
| --ix | landing.css:58, landing.css:59, landing.css:60, landing.css:61, landing.css:62 | Reject as global token: local illustration coordinate, animation phase/depth, viewport transform or per-instance configuration, not a reusable design invariant. Keep with its owning illustration/module. |
| --iy | landing.css:58, landing.css:59, landing.css:60, landing.css:61, landing.css:62 | Reject as global token: local illustration coordinate, animation phase/depth, viewport transform or per-instance configuration, not a reusable design invariant. Keep with its owning illustration/module. |
| --k | landing.js:36 | Reject as global token: local illustration coordinate, animation phase/depth, viewport transform or per-instance configuration, not a reusable design invariant. Keep with its owning illustration/module. |
| --key | tokens.css:6, tokens.css:26 | Accept: unchanged shared theme/design declaration; see exact values below. |
| --ko | landing.css:5, landing.css:11 | Reject as app token: landing-specific sheet sizing, knockout or grain; keep with WP 6.2. App grain has its own accepted asset. |
| --line | tokens.css:6, tokens.css:26 | Accept: unchanged shared theme/design declaration; see exact values below. |
| --mh | app.css:5 | Accept: shared app layout/theme metric or asset, retained in token source. |
| --muted | tokens.css:6, tokens.css:26 | Accept: unchanged shared theme/design declaration; see exact values below. |
| --n | app-visuals.js:200, index.html:276, index.html:277, index.html:278, index.html:279, index.html:280, index.html:281, index.html:282, index.html:293, index.html:332, index.html:333, index.html:334, index.html:335, index.html:336, index.html:337, index.html:338, index.html:350, index.html:389, index.html:390, index.html:391, index.html:392, index.html:393, index.html:394, index.html:395, index.html:406, index.html:437, index.html:438, index.html:439, index.html:440, index.html:441, index.html:442, index.html:443, index.html:454 | Reject as global token: local illustration coordinate, animation phase/depth, viewport transform or per-instance configuration, not a reusable design invariant. Keep with its owning illustration/module. |
| --navy | tokens.css:13, tokens.css:28 | Accept: unchanged shared theme/design declaration; see exact values below. |
| --ok | tokens.css:14, tokens.css:28 | Accept: unchanged shared theme/design declaration; see exact values below. |
| --on-plate | app.css:14 | Reject as global token: contextual chamber/instance alias. Components derive the relevant shared ink; publishing it globally would erase scope. |
| --or | tokens.css:10 | Accept: unchanged shared theme/design declaration; see exact values below. |
| --or-text | tokens.css:11, tokens.css:27 | Accept: unchanged shared theme/design declaration; see exact values below. |
| --orange | tokens.css:13, tokens.css:28 | Accept: unchanged shared theme/design declaration; see exact values below. |
| --ox | landing.css:136 | Reject as global token: local illustration coordinate, animation phase/depth, viewport transform or per-instance configuration, not a reusable design invariant. Keep with its owning illustration/module. |
| --oy | landing.css:136 | Reject as global token: local illustration coordinate, animation phase/depth, viewport transform or per-instance configuration, not a reusable design invariant. Keep with its owning illustration/module. |
| --paper | tokens.css:6, tokens.css:26 | Accept: unchanged shared theme/design declaration; see exact values below. |
| --paper-2 | tokens.css:6, tokens.css:26 | Accept: unchanged shared theme/design declaration; see exact values below. |
| --pc | app.css:125, app.css:126, app.css:127, app.css:128 | Reject as global token: contextual chamber/instance alias. Components derive the relevant shared ink; publishing it globally would erase scope. |
| --pc-text | app.css:125, app.css:126, app.css:127, app.css:128 | Reject as global token: contextual chamber/instance alias. Components derive the relevant shared ink; publishing it globally would erase scope. |
| --plate | app.css:6, app.css:11, app.css:12, app.css:13, app.css:14 | Accept: shared app layout/theme metric or asset, retained in token source. |
| --plate-text | app.css:6, app.css:11, app.css:12, app.css:13, app.css:14 | Accept: shared app layout/theme metric or asset, retained in token source. |
| --press | tokens.css:16 | Accept: unchanged shared theme/design declaration; see exact values below. |
| --press-2 | tokens.css:16 | Accept: unchanged shared theme/design declaration; see exact values below. |
| --px | landing.css:54 | Reject as global token: local illustration coordinate, animation phase/depth, viewport transform or per-instance configuration, not a reusable design invariant. Keep with its owning illustration/module. |
| --py | landing.css:54 | Reject as global token: local illustration coordinate, animation phase/depth, viewport transform or per-instance configuration, not a reusable design invariant. Keep with its owning illustration/module. |
| --r-lg | tokens.css:17 | Accept: unchanged shared theme/design declaration; see exact values below. |
| --r-md | tokens.css:17 | Accept: unchanged shared theme/design declaration; see exact values below. |
| --r-sm | tokens.css:17 | Accept: unchanged shared theme/design declaration; see exact values below. |
| --rise | index.html:68, index.html:69, index.html:70, index.html:71 | Reject as global token: local illustration coordinate, animation phase/depth, viewport transform or per-instance configuration, not a reusable design invariant. Keep with its owning illustration/module. |
| --rule | tokens.css:6, tokens.css:26 | Accept: unchanged shared theme/design declaration; see exact values below. |
| --sheet | tokens.css:16 | Accept: unchanged shared theme/design declaration; see exact values below. |
| --tint | app.css:4, app.css:9 | Accept: shared app layout/theme metric or asset, retained in token source. |
| --tint-2 | app.css:4, app.css:9 | Accept: shared app layout/theme metric or asset, retained in token source. |
| --tone | landing.css:77 | Reject as global token: local illustration coordinate, animation phase/depth, viewport transform or per-instance configuration, not a reusable design invariant. Keep with its owning illustration/module. |
| --u | landing.css:7 | Reject as app token: landing-specific sheet sizing, knockout or grain; keep with WP 6.2. App grain has its own accepted asset. |
| --warn | tokens.css:14 | Accept: unchanged shared theme/design declaration; see exact values below. |

### Exact shared theme values

| Token | Paper bytes | Stock override bytes (omitted means inherit) |
| --- | --- | --- |
| --paper | #F4F0E6 | #121317 |
| --paper-2 | #EAE4D4 | #1A1C22 |
| --card | #FBF9F3 | #1D2027 |
| --ink | #16181D | #F2EEE3 |
| --ink-2 | #3A3D45 | #C9C5B8 |
| --muted | #656972 | #8E919A |
| --faint | #9A9DA4 | #5F626B |
| --line | #D9D2BE | #2A2D36 |
| --rule | #16181D | #F2EEE3 |
| --key | #16181D | #F2EEE3 |
| --azure | #3F86DC | inherit |
| --gules | #E4472E | inherit |
| --or | #F2B233 | inherit |
| --azure-text | #1D5BAA | #86B6F0 |
| --gules-text | #B3321B | #FF8B72 |
| --or-text | #7A5800 | #FFD36B |
| --green | #0A9A5E | #2FCB86 |
| --orange | #D9682A | #FF8A4C |
| --navy | #24467E | #6F93D6 |
| --ok | #0A9A5E | #37D08E |
| --warn | #E8A800 | inherit |
| --danger | #CC2149 | #FF5C7E |
| --info | #1D6FC4 | #86B6F0 |
| --press | #16181D | inherit |
| --press-2 | #3A3D45 | inherit |
| --sheet | #F7F3E8 | inherit |
| --cream | #F2EEE3 | inherit |
| --r-sm | 3px | inherit |
| --r-md | 6px | inherit |
| --r-lg | 12px | inherit |
| --blend | multiply | screen |
| --font-display | "Bahnschrift","Arial Narrow","Roboto Condensed","Helvetica Neue",Impact,sans-serif | inherit |
| --font-serif | "Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif | inherit |
| --font-ui | "Segoe UI Variable Text","Segoe UI",system-ui,-apple-system,"Helvetica Neue",Arial,sans-serif | inherit |
| --font-num | ui-monospace,"Cascadia Mono","SF Mono",Consolas,Menlo,monospace | inherit |
| --ease | cubic-bezier(.2,.8,.2,1) | inherit |

Counts: 36 paper values; 20 stock overrides; 5 app stock overrides.

### Literal color candidates

Every literal spelling below was considered. Shared declared values stay exact;
art colors and alpha mixtures are not flattened to visually similar palette
values. File/line evidence lists all unique locations.

| Literal | Evidence | Decision / reason |
| --- | --- | --- |
| #000 | landing.js:184, lottery.html:23 | Reject as new global color: illustration, translucent overlay, browser fallback or sample data only; use existing semantic inks for kit controls. Preserve artwork-specific values with its future renderer rather than approximating them. |
| #0A9A5E | tokens.css:13, tokens.css:14 | Accept exact value via --green; reject duplicate hardcoded spelling in components. |
| #0b0c0f | landing.css:11 | Reject as new global color: illustration, translucent overlay, browser fallback or sample data only; use existing semantic inks for kit controls. Preserve artwork-specific values with its future renderer rather than approximating them. |
| #121317 | tokens.css:26 | Accept exact stock override via --paper; reject duplicate component literal. |
| #16181D | brand.html:103, tokens.css:6, tokens.css:16 | Accept exact value via --ink; reject duplicate hardcoded spelling in components. |
| #1A1C22 | tokens.css:26 | Accept exact stock override via --paper-2; reject duplicate component literal. |
| #1D2027 | tokens.css:26 | Accept exact stock override via --card; reject duplicate component literal. |
| #1D5BAA | tokens.css:11 | Accept exact value via --azure-text; reject duplicate hardcoded spelling in components. |
| #1D6FC4 | tokens.css:14 | Accept exact value via --info; reject duplicate hardcoded spelling in components. |
| #24467E | tokens.css:13 | Accept exact value via --navy; reject duplicate hardcoded spelling in components. |
| #2A2D36 | tokens.css:26 | Accept exact stock override via --line; reject duplicate component literal. |
| #2FCB86 | tokens.css:28 | Accept exact stock override via --green; reject duplicate component literal. |
| #37D08E | tokens.css:28 | Accept exact stock override via --ok; reject duplicate component literal. |
| #3A3D45 | tokens.css:6, tokens.css:16 | Accept exact value via --ink-2; reject duplicate hardcoded spelling in components. |
| #3F86DC | brand.html:101, tokens.css:8 | Accept exact value via --azure; reject duplicate hardcoded spelling in components. |
| #5F626B | tokens.css:26 | Accept exact stock override via --faint; reject duplicate component literal. |
| #656972 | tokens.css:6 | Accept exact value via --muted; reject duplicate hardcoded spelling in components. |
| #6F93D6 | tokens.css:28 | Accept exact stock override via --navy; reject duplicate component literal. |
| #7A5800 | tokens.css:11 | Accept exact value via --or-text; reject duplicate hardcoded spelling in components. |
| #86B6F0 | tokens.css:27, tokens.css:28 | Accept exact stock override via --azure-text; reject duplicate component literal. |
| #8E919A | tokens.css:26 | Accept exact stock override via --muted; reject duplicate component literal. |
| #9A9DA4 | tokens.css:6 | Accept exact value via --faint; reject duplicate hardcoded spelling in components. |
| #acc | app-studio.js:185, app-studio.js:186 | Reject as new global color: illustration, translucent overlay, browser fallback or sample data only; use existing semantic inks for kit controls. Preserve artwork-specific values with its future renderer rather than approximating them. |
| #B3321B | tokens.css:11 | Accept exact value via --gules-text; reject duplicate hardcoded spelling in components. |
| #C9C5B8 | tokens.css:26 | Accept exact stock override via --ink-2; reject duplicate component literal. |
| #cad | app-studio.js:129 | Reject as new global color: illustration, translucent overlay, browser fallback or sample data only; use existing semantic inks for kit controls. Preserve artwork-specific values with its future renderer rather than approximating them. |
| #CC2149 | tokens.css:14 | Accept exact value via --danger; reject duplicate hardcoded spelling in components. |
| #D9682A | tokens.css:13 | Accept exact value via --orange; reject duplicate hardcoded spelling in components. |
| #D9D2BE | tokens.css:6 | Accept exact value via --line; reject duplicate hardcoded spelling in components. |
| #E4472E | brand.html:100, tokens.css:9 | Accept exact value via --gules; reject duplicate hardcoded spelling in components. |
| #E8A800 | tokens.css:14 | Accept exact value via --warn; reject duplicate hardcoded spelling in components. |
| #EAE4D4 | tokens.css:6 | Accept exact value via --paper-2; reject duplicate hardcoded spelling in components. |
| #F2B233 | brand.html:102, tokens.css:10 | Accept exact value via --or; reject duplicate hardcoded spelling in components. |
| #F2EEE3 | tokens.css:16, tokens.css:26 | Accept exact value via --cream; reject duplicate hardcoded spelling in components. |
| #F4F0E6 | NOTES.md:57, brand.html:109, tokens.css:6 | Accept exact value via --paper; reject duplicate hardcoded spelling in components. |
| #F7F3E8 | tokens.css:16 | Accept exact value via --sheet; reject duplicate hardcoded spelling in components. |
| #FBF9F3 | tokens.css:6 | Accept exact value via --card; reject duplicate hardcoded spelling in components. |
| #feed | app-visuals.js:102, app-visuals.js:107, app-visuals.js:109, app-visuals.js:110, app-visuals.js:197, app-visuals.js:249 | Reject as new global color: illustration, translucent overlay, browser fallback or sample data only; use existing semantic inks for kit controls. Preserve artwork-specific values with its future renderer rather than approximating them. |
| #FF5C7E | tokens.css:28 | Accept exact stock override via --danger; reject duplicate component literal. |
| #FF8A4C | tokens.css:28 | Accept exact stock override via --orange; reject duplicate component literal. |
| #FF8B72 | tokens.css:27 | Accept exact stock override via --gules-text; reject duplicate component literal. |
| #FFD36B | tokens.css:27 | Accept exact stock override via --or-text; reject duplicate component literal. |
| #fff | app.css:69, app.css:91, landing.css:5, landing.js:184, moderator.html:102 | Accept exact value via --white; reject duplicate hardcoded spelling in components. |
| rgba(22,24,29,.045) | app.css:4 | Accept exact value via --tint; reject duplicate hardcoded spelling in components. |
| rgba(22,24,29,.08) | app.css:4 | Accept exact value via --tint-2; reject duplicate hardcoded spelling in components. |
| rgba(22,24,29,.12) | app.css:4 | Accept exact value via --hair-2; reject duplicate hardcoded spelling in components. |
| rgba(22,24,29,.24) | app.css:4 | Accept exact value via --hair; reject duplicate hardcoded spelling in components. |
| rgba(242,238,227,.05) | app.css:9 | Reject as new global color: illustration, translucent overlay, browser fallback or sample data only; use existing semantic inks for kit controls. Preserve artwork-specific values with its future renderer rather than approximating them. |
| rgba(242,238,227,.09) | app.css:9 | Reject as new global color: illustration, translucent overlay, browser fallback or sample data only; use existing semantic inks for kit controls. Preserve artwork-specific values with its future renderer rather than approximating them. |
| rgba(242,238,227,.13) | app.css:9 | Reject as new global color: illustration, translucent overlay, browser fallback or sample data only; use existing semantic inks for kit controls. Preserve artwork-specific values with its future renderer rather than approximating them. |
| rgba(242,238,227,.26) | app.css:9 | Reject as new global color: illustration, translucent overlay, browser fallback or sample data only; use existing semantic inks for kit controls. Preserve artwork-specific values with its future renderer rather than approximating them. |

## Exhaustive stylesheet visual-selector index

Each selector is inventoried with every defining location. Repeated shared
visuals resolve through the single kit component shown; class-name collisions
inside otherwise unrelated artwork are not an instruction to merge their art.
This index includes every class/type/state selector in app, landing and inline
chamber/brand CSS. Generated markup references those same visual definitions.

| Visual selector | Definition evidence | Kit resolution or explicitly retained owner |
| --- | --- | --- |
| :root | app.css:3, landing.css:4, tokens.css:4 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| [data-theme="stock"] | app.css:8, landing.css:11, tokens.css:25 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| body[data-module="lottery"] | app.css:11 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| body[data-module="moderator"] | app.css:12 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| body[data-module="visuals"] | app.css:13 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| body[data-module="studio"] | app.css:14 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| * | app.css:16, landing.css:12 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| html | app.css:17, landing.css:13 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| html[data-theme="stock"] | app.css:18 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| body | app.css:19, landing.css:14 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| body::before | app.css:21 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| a | app.css:23, landing.css:15 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| button | app.css:24 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| :focus-visible | app.css:25, landing.css:16 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| [data-theme="stock"] :focus-visible | app.css:26 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| h1,h2,h3,h4,p | app.css:27 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .num,.mono | app.css:28 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .sr | app.css:29 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| [hidden] | app.css:30 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| ::selection | app.css:31 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .kicker | app.css:32 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .serif | app.css:33, landing.css:19 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .muted | app.css:34 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .t-azure | app.css:35 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .t-gules | app.css:35 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .t-or | app.css:35 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .t-ok | app.css:35 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .t-bad | app.css:35 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .shell | app.css:38 | KitShell / ThemeFrame |
| .shell.editor-open | app.css:39 | KitShell / ThemeFrame |
| .masthead | app.css:40, app.css:76 | Rampart (mark asset ? Mark) |
| .masthead::after | app.css:41 | Rampart (mark asset ? Mark) |
| .brand | app.css:42, landing.css:24 | Rampart (mark asset ? Mark) |
| .brand .mark | app.css:43 | Rampart (mark asset ? Mark) |
| .wm | app.css:44 | Rampart (mark asset ? Mark) |
| .wm::after | app.css:45 | Rampart (mark asset ? Mark) |
| .mh-group | app.css:46 | Rampart (mark asset ? Mark) |
| .mh-sep | app.css:47, app.css:76 | Rampart (mark asset ? Mark) |
| .stamp | app.css:48 | Rampart (mark asset ? Mark) |
| .stamp .dot | app.css:49, app.css:267 | Rampart (mark asset ? Mark) |
| .stamp.off | app.css:50 | Rampart (mark asset ? Mark) |
| .stamp.off .dot | app.css:51 | Rampart (mark asset ? Mark) |
| .fig | app.css:53 | Rampart (mark asset ? Mark) |
| .fig b | app.css:54 | Rampart (mark asset ? Mark) |
| .fig small | app.css:55 | Rampart (mark asset ? Mark) |
| .link | app.css:56 | Rampart (mark asset ? Mark) |
| .link svg | app.css:57 | Rampart (mark asset ? Mark) |
| .link span | app.css:58 | Rampart (mark asset ? Mark) |
| .link b | app.css:59 | Rampart (mark asset ? Mark) |
| .link small | app.css:60 | Rampart (mark asset ? Mark) |
| .link.is-down b | app.css:61 | Rampart (mark asset ? Mark) |
| .link.is-re b | app.css:62 | Rampart (mark asset ? Mark) |
| .modchip | app.css:63 | GatehouseChip |
| .modchip .seg | app.css:64 | GatehouseChip |
| .modchip .seg b | app.css:65 | GatehouseChip |
| .modchip .on | app.css:66 | GatehouseChip |
| .modchip .pr | app.css:67 | GatehouseChip |
| .modchip .on+.pr | app.css:68 | GatehouseChip |
| .modchip.shield .shieldseg | app.css:69, app.css:76 | GatehouseChip |
| .modchip.shield .seg | app.css:70 | GatehouseChip |
| .modchip.shield .seg:not(.shieldseg) svg | app.css:71 | GatehouseChip |
| .modchip.shield .seg.on | app.css:72 | GatehouseChip |
| .modchip svg | app.css:73 | GatehouseChip |
| .mh-spacer | app.css:74 | Rampart (mark asset ? Mark) |
| .tag-sample | app.css:75, app.css:77 | Rampart (mark asset ? Mark) |
| .modchip.shield .shieldseg .t | app.css:76 | GatehouseChip |
| .btn | app.css:78, landing.css:29, landing.css:240, landing.css:243 | InkButton |
| .btn:hover | app.css:79, landing.css:30 | InkButton |
| .btn:active | app.css:80, landing.css:31 | InkButton |
| .btn svg | app.css:81 | InkButton |
| .btn.primary | app.css:82 | InkButton |
| .btn.primary:hover | app.css:83 | InkButton |
| .btn.plate | app.css:84 | InkButton |
| .btn.plate:hover | app.css:85 | InkButton |
| body[data-module="studio"] .btn.plate:hover | app.css:86 | InkButton |
| .btn.sm | app.css:87 | InkButton |
| .btn.ghost | app.css:88, landing.css:32 | InkButton |
| .btn.ghost:hover | app.css:89, landing.css:33 | InkButton |
| .btn.danger | app.css:90 | InkButton |
| .btn.danger:hover | app.css:91 | InkButton |
| .btn[disabled] | app.css:92 | InkButton |
| .btn.icon | app.css:93 | InkButton |
| .btn.on | app.css:94 | InkButton |
| .demo | app.css:95 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .pop | app.css:96 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .pop h4 | app.css:97 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .pop .row | app.css:98 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .pop .row label | app.css:99 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .seg2 | app.css:100 | InkButton |
| .seg2 button | app.css:101 | InkButton |
| .seg2 button:last-child | app.css:102 | InkButton |
| .seg2 button[aria-pressed="true"] | app.css:103 | InkButton |
| .seg2 button:hover:not([aria-pressed="true"]) | app.css:104 | InkButton |
| .banner | app.css:106, landing.css:118 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .banner.show | app.css:107 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .banner b | app.css:108 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .banner.bad | app.css:109 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .banner.warn | app.css:109 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .banner.info | app.css:109 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .contents | app.css:112 | ChambersColumn (site composition WP 6.2) |
| .contents .kicker | app.css:113 | ChambersColumn (site composition WP 6.2) |
| .plate-link | app.css:114 | Rampart (mark asset ? Mark) |
| .plate-link:last-of-type | app.css:115 | Rampart (mark asset ? Mark) |
| .plate-link::before | app.css:116 | Rampart (mark asset ? Mark) |
| .plate-link .no | app.css:117 | Rampart (mark asset ? Mark) |
| .plate-link .tx | app.css:118 | Rampart (mark asset ? Mark) |
| .plate-link .tx b | app.css:119 | Rampart (mark asset ? Mark) |
| .plate-link .tx i | app.css:120 | Rampart (mark asset ? Mark) |
| .plate-link .tx em | app.css:121 | Rampart (mark asset ? Mark) |
| .plate-link:hover::before | app.css:122 | Rampart (mark asset ? Mark) |
| .plate-link[aria-current="page"] | app.css:123 | Rampart (mark asset ? Mark) |
| .plate-link[aria-current="page"]::before | app.css:124 | Rampart (mark asset ? Mark) |
| .plate-link[data-module="lottery"] | app.css:125 | Rampart (mark asset ? Mark) |
| .plate-link[data-module="moderator"] | app.css:126 | Rampart (mark asset ? Mark) |
| .plate-link[data-module="visuals"] | app.css:127 | Rampart (mark asset ? Mark) |
| .plate-link[data-module="studio"] | app.css:128 | Rampart (mark asset ? Mark) |
| .contents .also | app.css:129 | ChambersColumn (site composition WP 6.2) |
| .contents .also a | app.css:130 | ChambersColumn (site composition WP 6.2) |
| .contents .also a:hover | app.css:131 | ChambersColumn (site composition WP 6.2) |
| .contents .also svg | app.css:132 | ChambersColumn (site composition WP 6.2) |
| .contents .now | app.css:133 | ChambersColumn (site composition WP 6.2) |
| .contents .now b | app.css:134 | ChambersColumn (site composition WP 6.2) |
| .colorbar | app.css:135, landing.css:39, landing.css:241 | ChambersColumn (site composition WP 6.2) |
| .colorbar i | app.css:136 | ChambersColumn (site composition WP 6.2) |
| .colorbar i:nth-child(1) | app.css:136 | ChambersColumn (site composition WP 6.2) |
| .colorbar i:nth-child(2) | app.css:136 | ChambersColumn (site composition WP 6.2) |
| .colorbar i:nth-child(3) | app.css:136 | ChambersColumn (site composition WP 6.2) |
| .colorbar i:nth-child(4) | app.css:136 | ChambersColumn (site composition WP 6.2) |
| .editor | app.css:139 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .shell.editor-open .editor | app.css:140 | KitShell / ThemeFrame |
| .shell:not(.editor-open) .editor | app.css:141 | KitShell / ThemeFrame |
| .editor-in | app.css:142 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .ed-head | app.css:143 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .ed-head h3 | app.css:144 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .ed-head p | app.css:145 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .ed-eng | app.css:146 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .ed-eng select | app.css:147 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .ed-log | app.css:148 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .ed-chips | app.css:149 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .ed-chips button | app.css:150 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .ed-chips button:hover | app.css:151 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .slip | app.css:152 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .slip.me | app.css:153 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .slip h5 | app.css:154 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .slip .redline | app.css:155 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .slip .redline div | app.css:156 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| ins,.ins | app.css:157 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| del,.del | app.css:158 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .slip .acts | app.css:159 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .slip.done | app.css:160 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .slip .state | app.css:161 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .slip .state.torn | app.css:162 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .ed-foot | app.css:163 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .ed-foot textarea | app.css:164 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .ed-foot .row | app.css:165 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .ed-foot small | app.css:166 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .ed-note | app.css:167 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .page-wrap | app.css:170 | KitShell / ThemeFrame |
| .page | app.css:171 | KitShell / ThemeFrame |
| .pagehead | app.css:172 | PageHeader |
| .folio | app.css:173, landing.css:153 | PageHeader |
| .folio a | app.css:174 | PageHeader |
| .folio a:hover | app.css:174 | PageHeader |
| .folio b | app.css:175 | PageHeader |
| .folio .crumbs | app.css:176 | PageHeader |
| .titlerow | app.css:177 | PageHeader |
| .h1 | app.css:178 | PageHeader |
| .h1::after | app.css:179, lottery.html:13 | PageHeader |
| body[data-module="studio"] .h1::after | app.css:180 | PageHeader |
| .stand | app.css:181, landing.css:158 | PageHeader |
| .stand b | app.css:182 | PageHeader |
| .titlerow .actions | app.css:183 | PageHeader |
| .view | app.css:184 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .sec | app.css:186, brand.html:17 | NumberedPanel |
| .sec-h | app.css:187 | NumberedPanel |
| .sec-h h2 | app.css:188 | NumberedPanel |
| .sec-h .no | app.css:189 | NumberedPanel |
| .sec-h .meta | app.css:190 | NumberedPanel |
| .sec-h .gloss | app.css:191 | NumberedPanel |
| .grid | app.css:192 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .panel | app.css:193 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .panel.flat | app.css:194 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .hero | app.css:195 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .hero .hero-tag | app.css:196 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .hero .hero-tag i | app.css:197 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .crop | app.css:198 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .crop::before,.crop::after | app.css:199 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .crop::before | app.css:200 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .crop::after | app.css:200 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .crop.tl | app.css:201 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .crop.tr | app.css:201 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .crop.bl | app.css:202 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .crop.br | app.css:202 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| label.f | app.css:205 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| label.f>span,.f-l | app.css:206 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| input[type=text],input[type=number],input[type=search],select,textarea | app.css:207 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| textarea | app.css:208 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| input:focus,select:focus,textarea:focus | app.css:209 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| select | app.css:210 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| input[type=range] | app.css:211 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| input[type=checkbox],input[type=radio] | app.css:212 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .chk | app.css:213 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .chk input | app.css:214 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .rowf | app.css:215 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .rowf.three | app.css:216 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .stack | app.css:217 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .hint | app.css:218 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .chip | app.css:221 | StatusChip (interactive actions ? InkButton) |
| .chip.gules | app.css:222 | StatusChip (interactive actions ? InkButton) |
| .chip.azure | app.css:222 | StatusChip (interactive actions ? InkButton) |
| .chip.or | app.css:222 | StatusChip (interactive actions ? InkButton) |
| .chip.solid-gules | app.css:223 | StatusChip (interactive actions ? InkButton) |
| .chip.solid-azure | app.css:223 | StatusChip (interactive actions ? InkButton) |
| .chip.solid-or | app.css:223 | StatusChip (interactive actions ? InkButton) |
| .chip.solid | app.css:223 | StatusChip (interactive actions ? InkButton) |
| .chip.ok | app.css:224 | StatusChip (interactive actions ? InkButton) |
| .chip.bad | app.css:224 | StatusChip (interactive actions ? InkButton) |
| .chip.warn | app.css:224 | StatusChip (interactive actions ? InkButton) |
| .chip.dash | app.css:224 | StatusChip (interactive actions ? InkButton) |
| button.chip | app.css:225 | StatusChip (interactive actions ? InkButton) |
| button.chip:hover | app.css:226 | StatusChip (interactive actions ? InkButton) |
| button.chip[aria-pressed="true"] | app.css:227 | StatusChip (interactive actions ? InkButton) |
| .chips | app.css:228 | StatusChip (interactive actions ? InkButton) |
| .mk | app.css:229 | VerdictChip |
| .mk svg | app.css:230 | VerdictChip |
| .mk.pass | app.css:231 | VerdictChip |
| .mk.bar | app.css:231 | VerdictChip |
| .mk.hold | app.css:231 | VerdictChip |
| .meter | app.css:232 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .meter>i | app.css:233 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .dots-h | app.css:234 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .tbl | app.css:237 | RuleTable (other module table data remains with owner) |
| .tbl th | app.css:238 | RuleTable (other module table data remains with owner) |
| .tbl td | app.css:239 | RuleTable (other module table data remains with owner) |
| .tbl tbody tr:hover td | app.css:240 | RuleTable (other module table data remains with owner) |
| .tbl td.n,.tbl th.n | app.css:241 | RuleTable (other module table data remains with owner) |
| .tbl tr[aria-selected="true"] td | app.css:242 | RuleTable (other module table data remains with owner) |
| .scroll | app.css:243 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .scroll::-webkit-scrollbar | app.css:244 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .scroll::-webkit-scrollbar-thumb | app.css:244 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .row-sel | app.css:245 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .empty | app.css:248 | EmptyState |
| .empty svg | app.css:249 | EmptyState |
| .empty b | app.css:250 | EmptyState |
| .empty p | app.css:251 | EmptyState |
| .toasts | app.css:254 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .toast | app.css:255 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .flash | app.css:258 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .footer | app.css:259 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .footer .colorbar | app.css:260 | ChambersColumn (site composition WP 6.2) |
| .backbtn | app.css:261 | InkButton |
| .backbtn:hover | app.css:262 | InkButton |
| .backbtn svg | app.css:263 | InkButton |
| *,*::before,*::after | app.css:266, landing.css:250 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .masthead,.contents,.editor | app.css:269 | Rampart (mark asset ? Mark) |
| .bs | brand.html:12 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .bs-hero | brand.html:13 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .bs-hero h1 | brand.html:14 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .bs-hero p | brand.html:15 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .bs-hero .wn | brand.html:16 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .sec>aside .fo | brand.html:18 | NumberedPanel |
| .sec>aside h2 | brand.html:19 | NumberedPanel |
| .sec>aside p | brand.html:20 | NumberedPanel |
| .cols | brand.html:21 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .c2 | brand.html:22 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .c3 | brand.html:22 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .c4 | brand.html:22 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .tile | brand.html:23 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .tile.dark | brand.html:24 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .tile .lab | brand.html:25 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .tile .big | brand.html:26 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .tile .big .mark-slot | brand.html:27 | Mark |
| .tile .big .mark-slot.s2 | brand.html:28 | Mark |
| .tile .big .mark-slot.s3 | brand.html:28 | Mark |
| .tile .row | brand.html:29 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .tile p | brand.html:30 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .inkc | brand.html:31 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .inkc small | brand.html:32 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .inkc.k | brand.html:33 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .ovl | brand.html:34 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .ov | brand.html:35 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .ov .o | brand.html:36 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .ov .o i | brand.html:37 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .ov .o i:first-child | brand.html:38 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .ov .o i:last-child | brand.html:38 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .ov b | brand.html:39 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .ov span | brand.html:40 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .spec | brand.html:41, brand.html:65 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .spec:first-child | brand.html:42 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .spec .k | brand.html:43 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .spec .v1 | brand.html:44 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .spec .v2 | brand.html:45 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .spec .v3 | brand.html:46 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .spec .v4 | brand.html:47 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .spec small | brand.html:48 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .chm | brand.html:49 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .chm .no | brand.html:50 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .chm svg.w | brand.html:51 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .chm .fn | brand.html:52 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .chm p | brand.html:53 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .voc | brand.html:54 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .voc th | brand.html:55 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .voc td | brand.html:56 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .voc td:first-child | brand.html:57 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .voc .sw | brand.html:58 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .say | brand.html:59 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .say h3 | brand.html:60 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .say ul | brand.html:61 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .say.no h3 | brand.html:62 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .say li q | brand.html:63 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .bs-hero,.sec | brand.html:64 | NumberedPanel |
| .c3,.c4 | brand.html:64 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .c2,.c3,.c4 | brand.html:65 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .vh | landing.css:17 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .disp | landing.css:18 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .num | landing.css:20 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .bar-top | landing.css:23 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .brand .mark-slot | landing.css:25 | Rampart (mark asset ? Mark) |
| .mark-slot svg | landing.css:25 | Mark |
| .mark-slot.sm | landing.css:25 | Mark |
| .brand-text | landing.css:26, landing.css:242 | Rampart (mark asset ? Mark) |
| .top-actions | landing.css:27 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .top-note | landing.css:28, landing.css:246 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .theme-toggle | landing.css:34 | ThemeToggle |
| .theme-toggle i | landing.css:35 | ThemeToggle |
| .theme-toggle:hover | landing.css:36 | ThemeToggle |
| .theme-toggle:hover i | landing.css:36 | ThemeToggle |
| .bar-bottom | landing.css:38 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .colorbar .sw | landing.css:40, landing.css:236 | ChambersColumn (site composition WP 6.2) |
| .colorbar .sw b | landing.css:41, landing.css:238 | ChambersColumn (site composition WP 6.2) |
| .colorbar .sw small | landing.css:42, landing.css:246 | ChambersColumn (site composition WP 6.2) |
| .colorbar .sw.lots | landing.css:43 | ChambersColumn (site composition WP 6.2) |
| .colorbar .sw.gate | landing.css:43 | ChambersColumn (site composition WP 6.2) |
| .colorbar .sw.beacons | landing.css:43 | ChambersColumn (site composition WP 6.2) |
| .colorbar .sw.map | landing.css:43 | ChambersColumn (site composition WP 6.2) |
| [data-theme="stock"] .colorbar .sw.map | landing.css:44 | ChambersColumn (site composition WP 6.2) |
| .colorbar .sw:hover,.colorbar .sw:focus-visible | landing.css:45, landing.css:260 | ChambersColumn (site composition WP 6.2) |
| .colorbar .sw:focus-visible | landing.css:46 | ChambersColumn (site composition WP 6.2) |
| .colorbar .mix | landing.css:47 | ChambersColumn (site composition WP 6.2) |
| .colorbar .mix.g | landing.css:48 | ChambersColumn (site composition WP 6.2) |
| .colorbar .mix.o | landing.css:48 | ChambersColumn (site composition WP 6.2) |
| .colorbar .mix.n | landing.css:48 | ChambersColumn (site composition WP 6.2) |
| .colorbar .go | landing.css:49, landing.css:237 | ChambersColumn (site composition WP 6.2) |
| .colorbar .go:hover | landing.css:50 | ChambersColumn (site composition WP 6.2) |
| .sheet | landing.css:53, landing.css:210 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .stage | landing.css:54, landing.css:209, lottery.html:85 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .stage::after | landing.css:55 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .layer | landing.css:56 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .plate | landing.css:57, landing.css:252 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .p-stone | landing.css:58 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .p-beacons | landing.css:59 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .p-lots | landing.css:60 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .p-gate | landing.css:61 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .p-map | landing.css:62 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .tone | landing.css:63 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .ko | landing.css:64 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .kos | landing.css:64 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .key | landing.css:65 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .keys | landing.css:65 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .type | landing.css:66, landing.css:254 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .type .wm,.type .name | landing.css:67 | Rampart (mark asset ? Mark) |
| .type .wm .ghost rect | landing.css:68 | Rampart (mark asset ? Mark) |
| .type .wm .face rect | landing.css:68 | Rampart (mark asset ? Mark) |
| .type .name path.gl | landing.css:69, landing.css:255 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .type .name | landing.css:70 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .type .name.n-lots .gl | landing.css:71 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .type .name.n-gate .gl | landing.css:71 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .type .name.n-beacons .gl | landing.css:71 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .type .name.n-map .gl | landing.css:71 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .stage[data-focus]:not([data-focus=""]) .plate | landing.css:74 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .stage[data-focus]:not([data-focus=""]) .plate.p-stone | landing.css:75 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .stage[data-focus]:not([data-focus=""]) .type .wm | landing.css:76 | Rampart (mark asset ? Mark) |
| .stage[data-focus="lots"] .plate.p-lots,.stage[data-focus="gate"] .plate.p-gate,.stage[data-focus="beacons"] .plate.p-beacons,.stage[data-focus="map"] .plate.p-map | landing.css:77 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .stage[data-focus="lots"] .type .n-lots,.stage[data-focus="gate"] .type .n-gate,.stage[data-focus="beacons"] .type .n-beacons,.stage[data-focus="map"] .type .n-map | landing.css:78 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .stage[data-focus="lots"] .type .n-lots .gl,.stage[data-focus="gate"] .type .n-gate .gl,.stage[data-focus="beacons"] .type .n-beacons .gl,.stage[data-focus="map"] .type .n-map .gl | landing.css:79 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .furniture | landing.css:82 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .mc | landing.css:83 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .mc .num | landing.css:84 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .mc-tl | landing.css:85 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .mc-tr | landing.css:86 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .mc-bl | landing.css:87 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .mc-br | landing.css:88 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .mc .dot | landing.css:89 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .mc-bl .sample | landing.css:90 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .meta | landing.css:93 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .meta .eyebrow | landing.css:94 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .meta .fn | landing.css:95 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .meta .pr | landing.css:96 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .meta .hint | landing.css:97 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .meta-idle | landing.css:98 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .meta-idle .fn | landing.css:99 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .stage[data-focus]:not([data-focus=""]) .meta-idle | landing.css:100 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .meta-lots | landing.css:101 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .meta-gate | landing.css:101 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .meta-beacons | landing.css:101 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .meta-map | landing.css:101 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .stage[data-focus="lots"] .meta-lots,.stage[data-focus="gate"] .meta-gate,.stage[data-focus="beacons"] .meta-beacons,.stage[data-focus="map"] .meta-map | landing.css:102 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .hits | landing.css:105 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .hit | landing.css:106 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .hit * | landing.css:107 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .hit .zone | landing.css:108 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .hit:focus-visible .zone,.hit.is-key .zone | landing.css:109 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .fx .flame | landing.css:116 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .fx .ember | landing.css:117 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .banner.b2 | landing.css:118 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .bridge | landing.css:119, landing.css:253 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| [data-phase="pre"] .bridge | landing.css:120 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| [data-phase="run"] .bridge | landing.css:121 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| [data-phase="pre"] .plate | landing.css:124 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| [data-phase="pre"] .type,[data-phase="pre"] .furniture,[data-phase="pre"] .mc,[data-phase="pre"] .meta | landing.css:125 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| [data-phase="run"] .plate | landing.css:126 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| [data-phase="run"] .type,[data-phase="run"] .furniture,[data-phase="run"] .mc | landing.css:127 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| [data-phase="run"] .meta-idle | landing.css:128 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .skip | landing.css:130 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .skip:hover | landing.css:131 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| [data-phase="pre"] .skip,[data-phase="run"] .skip | landing.css:132 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .scenes | landing.css:135 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .scene | landing.css:136, landing.css:224, landing.css:256 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .scene.is-open | landing.css:137, landing.css:257 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .scene[data-plate="lots"] | landing.css:138 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .scene[data-plate="gate"] | landing.css:138 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .scene[data-plate="beacons"] | landing.css:138 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .scene[data-plate="map"] | landing.css:138 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .scene-art | landing.css:139, landing.css:225, landing.css:275, landing.css:284 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .scene-art::after | landing.css:140 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .scene[data-plate="map"] .scene-art::after | landing.css:141 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .scene-art>svg | landing.css:142, landing.css:226, landing.css:258, landing.css:285 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .scene.is-open .scene-art>svg | landing.css:143 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .scene-art .cap | landing.css:144, landing.css:227, landing.css:276 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .scene[data-plate="map"] .scene-art .cap | landing.css:145 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .scene-copy | landing.css:146, landing.css:228 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .scene-copy>* | landing.css:147 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .st>* | landing.css:148, landing.css:259 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .scene.is-open .st>* | landing.css:149 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .back | landing.css:150 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .back:hover | landing.css:151 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .back kbd | landing.css:152, landing.css:279 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .folio i | landing.css:154 | PageHeader |
| .word | landing.css:155 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .scene h2 | landing.css:156 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .fnline | landing.css:157 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .notes | landing.css:159 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .notes li | landing.css:160 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .notes li::before | landing.css:161 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .scene[data-plate="map"] .notes li::before | landing.css:162 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .notes li b | landing.css:163 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .notes li .sd | landing.css:164 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .cta-row | landing.css:165 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .cta | landing.css:166 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .more | landing.css:167 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .full | landing.css:168 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .full[hidden] | landing.css:169 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .full h3 | landing.css:170 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .full ul | landing.css:171 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .full ul:last-child | landing.css:172 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .full li | landing.css:173 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .scene-links | landing.css:174 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .scene-links button | landing.css:175 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .scene-links button:hover | landing.css:176 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .hon a | landing.css:177 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .facts | landing.css:180 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .facts-in | landing.css:181 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .facts h2 | landing.css:182 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .facts .lede | landing.css:183 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .fgrid | landing.css:184, landing.css:229, landing.css:245 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .fi | landing.css:185 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .fi:not(:nth-child(3n)) | landing.css:186, landing.css:230, landing.css:245 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .fi h3 | landing.css:187 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .fi h3 i | landing.css:188 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .fi p | landing.css:189 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .fi p b | landing.css:190 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .hon | landing.css:191 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .hon .tagbox | landing.css:192 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .modrow | landing.css:193, landing.css:231 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .modrow a | landing.css:194 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .modrow a:last-child | landing.css:195 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .modrow a::before | landing.css:196 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .modrow a:hover | landing.css:197 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .modrow .k | landing.css:198 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .modrow .t | landing.css:199 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .modrow .d | landing.css:200 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .foot | landing.css:201 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .foot a | landing.css:202 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .foot .col | landing.css:203 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .foot .reg | landing.css:204 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .m-poster | landing.css:207, landing.css:211 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .m-wm | landing.css:212 | Rampart (mark asset ? Mark) |
| .m-tag | landing.css:213, landing.css:281 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .m-micro | landing.css:214 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .m-strips | landing.css:215 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .strip | landing.css:216, lottery.html:24 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .strip .art | landing.css:217 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .strip .art svg | landing.css:218 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .strip .nm svg | landing.css:219 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .strip .nm .f | landing.css:220 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .strip .nm .e | landing.css:221 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .strip .chev | landing.css:222 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .strip:active | landing.css:223 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .modrow a:nth-child(2) | landing.css:232 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .modrow a:nth-child(-n+2) | landing.css:233 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .top-note,.top-actions .theme-toggle span | landing.css:234 | ThemeToggle |
| .colorbar .sw small,.colorbar .mix | landing.css:235 | ChambersColumn (site composition WP 6.2) |
| .colorbar .sw .ln | landing.css:239 | ChambersColumn (site composition WP 6.2) |
| .fi:nth-child(odd) | landing.css:245 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .plate,.type .wm,.type .name,.type .name path.gl,.meta,.tone,.btn,.colorbar .sw | landing.css:251 | Rampart (mark asset ? Mark) |
| .sa | landing.css:264 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .sa .mono | landing.css:265 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .sa .ser | landing.css:266 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| body.scene-open | landing.css:267 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .strip[data-m="lots"] .nm svg | landing.css:268 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .strip[data-m="gate"] .nm svg | landing.css:268 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .strip[data-m="beacons"] .nm svg | landing.css:268 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .strip[data-m="map"] .nm svg | landing.css:268 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .type .name .gh .gl | landing.css:271 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .type .name.n-beacons .gh .gl | landing.css:272 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .xm | landing.css:281 | Site-only content, WP 6.2; shared controls above resolve through the named kit |
| .colorbar .sw .sn | landing.css:288, landing.css:289 | ChambersColumn (site composition WP 6.2) |
| .hero-roll | lottery.html:14, lottery.html:46 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .hr-left | lottery.html:15, lottery.html:46 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .hr-left .kicker | lottery.html:16 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .hr-left .big | lottery.html:17 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .hr-left .big::after | lottery.html:18 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .hr-left .nm | lottery.html:19 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .hr-left .st | lottery.html:20 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .hr-left .acts | lottery.html:21 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .hr-right | lottery.html:22 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .strip-wrap | lottery.html:23 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .tk | lottery.html:25 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .tk::before,.tk::after | lottery.html:26 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .tk::before | lottery.html:27 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .tk::after | lottery.html:28 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .tk .stub | lottery.html:29 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .tk .stub b | lottery.html:30 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .tk .body | lottery.html:31 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .tk .h | lottery.html:32 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .tk .fl | lottery.html:33 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .tk .fl i | lottery.html:34 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .tk .no | lottery.html:35 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .tk.new | lottery.html:36 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .tk.win | lottery.html:37 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .dotmap | lottery.html:39 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .dotmap svg | lottery.html:40 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .legend | lottery.html:41 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .legend span | lottery.html:42 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .legend i | lottery.html:43 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .cols3 | lottery.html:44, lottery.html:45, lottery.html:46 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .cols3>.c3 | lottery.html:45, lottery.html:46 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .drawlist | lottery.html:47 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .drawrow | lottery.html:48 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .drawrow:hover | lottery.html:49 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .drawrow[aria-checked="true"] | lottery.html:50 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .drawrow[aria-checked="true"]::before | lottery.html:51 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .drawrow .ic | lottery.html:52 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .drawrow b | lottery.html:53 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .drawrow small | lottery.html:54 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .drawrow .ct | lottery.html:55 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .drawrow .ct small | lottery.html:56 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .rollbox | lottery.html:57 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .rolltbl | lottery.html:58 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .verdict | lottery.html:59 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .verdict.blocked | lottery.html:60 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .verdict.warn | lottery.html:61 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .verdict.ready | lottery.html:62 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .verdict h4 | lottery.html:63 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .verdict ul | lottery.html:64 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .verdict li | lottery.html:65 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .verdict li .chip | lottery.html:66 | StatusChip (interactive actions ? InkButton) |
| .verdict li .btn | lottery.html:67 | InkButton |
| .cfg | lottery.html:68 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .seg3 | lottery.html:69 | InkButton |
| .seg3 button | lottery.html:70 | InkButton |
| .seg3 button:last-child | lottery.html:71 | InkButton |
| .seg3 button[aria-pressed="true"] | lottery.html:72 | InkButton |
| .seg3 button:hover:not([aria-pressed="true"]) | lottery.html:73 | InkButton |
| .steps | lottery.html:74 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .step | lottery.html:75 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .step::before | lottery.html:76 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .step:last-child::before | lottery.html:77 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .step .n | lottery.html:78 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .step.done .n | lottery.html:79 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .step.now .n | lottery.html:80 | ChambersColumn (site composition WP 6.2) |
| .step b | lottery.html:81 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .step p b | lottery.html:82 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .step p | lottery.html:83 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .step .hash | lottery.html:84 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .stage svg.shape | lottery.html:86 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .stage .cam | lottery.html:87 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .stage .lbl | lottery.html:88 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .stage .disc | lottery.html:89 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .stage.prize .disc | lottery.html:90 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .shaperow | lottery.html:91 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .shaperow .seg3 button | lottery.html:92 | InkButton |
| .tray | lottery.html:93 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .tray .tk | lottery.html:94 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .tray .tk .h | lottery.html:95 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .tray .tk .stub b | lottery.html:95 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .tray .tk .body | lottery.html:95 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .spin | lottery.html:96 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .pastcols td .chip | lottery.html:98 | StatusChip (interactive actions ? InkButton) |
| #wr-back | lottery.html:99 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .wr | lottery.html:100, lottery.html:101 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .wrtk | lottery.html:102 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .wrtk::before | lottery.html:103 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .wrtk .stubcol | lottery.html:104 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .wrtk .stubcol b | lottery.html:105 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .wrtk dl | lottery.html:106 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .wrtk dt | lottery.html:107 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .wrtk dd | lottery.html:108 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .wrtk .ribbon | lottery.html:109 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .filelist | lottery.html:110 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .filelist li | lottery.html:111 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .filelist li span:last-child | lottery.html:112 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .rk td.win | lottery.html:113 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| textarea.entries | lottery.html:114 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .mgrid | moderator.html:13, moderator.html:14 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .mcol | moderator.html:15 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .hero-chart | moderator.html:16 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .chart-top | moderator.html:17 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .chart-top .kick | moderator.html:18 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .hero-chart svg | moderator.html:19 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .chart-foot | moderator.html:20 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .dir | moderator.html:21 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .dir:last-child | moderator.html:22 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .dir:hover | moderator.html:23 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .dir[aria-pressed="true"]::after | moderator.html:24 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .dir .nm | moderator.html:25 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .dir .nm i | moderator.html:26 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .dir .v | moderator.html:27 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .dir .d | moderator.html:28 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .dir .d.up | moderator.html:29 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .dir .d.dn | moderator.html:29 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .tip | moderator.html:30 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .tip b | moderator.html:31 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .gate | moderator.html:32 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .gate-bar | moderator.html:33 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .gate-bar input[type=search] | moderator.html:34 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .gate-bar select | moderator.html:35 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .plines | moderator.html:36 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .ln | moderator.html:37 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .ln:hover | moderator.html:38 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .ln .t | moderator.html:39 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .ln .who | moderator.html:40 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .ln .tx | moderator.html:41 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .ln .dr | moderator.html:42 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .ln.pass .mk | moderator.html:43 | VerdictChip |
| .ln.bar .tx | moderator.html:44 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .ln.bar | moderator.html:45 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .ln.hold .tx | moderator.html:46 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .ln.hold | moderator.html:47 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .ln.sep | moderator.html:48 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .mkcol | moderator.html:49 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .chip.mkchip | moderator.html:50 | StatusChip (interactive actions ? InkButton) |
| .mkchip small | moderator.html:51 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .mkchip[aria-pressed="true"] small | moderator.html:52 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .rules td | moderator.html:53 | RuleTable (other module table data remains with owner) |
| .rules th.n | moderator.html:54 | RuleTable (other module table data remains with owner) |
| .rules th .nw | moderator.html:54 | RuleTable (other module table data remains with owner) |
| .rules .act | moderator.html:55 | RuleTable (other module table data remains with owner) |
| .rules .mfn | moderator.html:56 | RuleTable (other module table data remains with owner) |
| .toggle | moderator.html:57 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .toggle button | moderator.html:58 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .toggle button svg | moderator.html:59 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .toggle button[aria-pressed="true"].watch | moderator.html:60 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .toggle button[aria-pressed="true"].arm | moderator.html:61 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .toggle button:hover:not([aria-pressed="true"]) | moderator.html:62 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .ladder | moderator.html:63 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .rung | moderator.html:64 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .rung:last-child | moderator.html:65 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .rung .l | moderator.html:66 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .rung .n | moderator.html:67 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .rung .c | moderator.html:68 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .rung.cur | moderator.html:69 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .rung.cur::after | moderator.html:70 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .lease | moderator.html:71 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .qrow | moderator.html:72 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .qrow .txt | moderator.html:73 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .qrow .meta | moderator.html:74 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .qrow .btns | moderator.html:75 | InkButton |
| .led | moderator.html:76 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .led .t | moderator.html:77 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .led .why | moderator.html:78 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .led .acts | moderator.html:79 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .led.new | moderator.html:80 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .replay-card | moderator.html:81 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .replay-card .big | moderator.html:82 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .replay-card .big div | moderator.html:83 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .replay-card .big b | moderator.html:84 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .replay-card .big small | moderator.html:85 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .rp-grid | moderator.html:86, moderator.html:87 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .rp-tot | moderator.html:88 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .rp-tot div | moderator.html:89 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .rp-tot div:last-child | moderator.html:90 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .rp-tot b | moderator.html:91 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .rp-tot small | moderator.html:92 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .rp-rule | moderator.html:93 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .rp-rule .hd | moderator.html:94 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .rp-rule .hd b | moderator.html:95 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .rp-rule .hd .toggle | moderator.html:96 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .rp-rule .hd .toggle button | moderator.html:97 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .rp-rule .hd .muted | moderator.html:98 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .rp-rule .pm | moderator.html:99 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .rp-rule input[type=range] | moderator.html:100 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .diffnote | moderator.html:101 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .shield-btn.armed | moderator.html:102 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .pagehead .h1::after | studio.html:13 | PageHeader |
| .sgrid | studio.html:14, studio.html:15, studio.html:16 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .sgrid>.s3 | studio.html:15 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .canvas-hero | studio.html:17 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .tb | studio.html:18 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .tb .sw | studio.html:19 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .tb .sw[aria-pressed="true"] | studio.html:20 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .canvas | studio.html:21 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .canvas svg | studio.html:22 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .hexg | studio.html:23 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .hexg:hover polygon.base | studio.html:24 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .hexg:focus-visible polygon.base | studio.html:25 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .inspect | studio.html:26 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .inspect b.t | studio.html:27 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .turnbar | studio.html:28 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .turnbar .clock | studio.html:29 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .tal | studio.html:30 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .tal div | studio.html:31 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .tal .bar | studio.html:32 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .tal .bar i | studio.html:33 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .tal .sealed | studio.html:34 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .tal small | studio.html:35 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .pieces | studio.html:36 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .pieces li | studio.html:37 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .pieces li svg | studio.html:38 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .pieces li b | studio.html:39 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .pieces li small | studio.html:40 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .sw2 | studio.html:41 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .sw2::after | studio.html:42 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .sw2[aria-pressed="true"] | studio.html:43 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .sw2[aria-pressed="true"]::after | studio.html:44 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .sw2[disabled] | studio.html:45 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .pvbox | studio.html:46 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .pvbox.desk | studio.html:47 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .pvbox.mob | studio.html:48 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .pv-stream | studio.html:49 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .pv-ext | studio.html:50 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .desk .pv-ext | studio.html:51 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .mob .pv-ext | studio.html:52 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .pv-ext .hd | studio.html:53 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .pv-ext .bd | studio.html:54 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .pv-ext svg | studio.html:55 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .pv-menu | studio.html:56 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .pv-menu button | studio.html:57 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .mob .pv-menu button | studio.html:58 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .pv-menu button[aria-pressed="true"] | studio.html:59 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .pv-menu button:hover | studio.html:60 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .pv-status | studio.html:61 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .pv-empty | studio.html:62 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .pv-ext .pv-empty svg | studio.html:63 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .pv-empty b | studio.html:64 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .ladder3 | studio.html:65 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .rg | studio.html:66 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .rg::before | studio.html:67 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .rg:last-child::before | studio.html:68 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .rg .n | studio.html:69 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .rg.done .n | studio.html:70 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .rg.now .n | studio.html:71 | ChambersColumn (site composition WP 6.2) |
| .rg.lock .n | studio.html:72 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .rg>div | studio.html:73 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .rg .n .ic | studio.html:74 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .rg .rh | studio.html:75 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .rg .rh b | studio.html:76 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .rg .pl | studio.html:77 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .rg p | studio.html:78 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .checks | studio.html:79 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .checks li | studio.html:80 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .checks li svg | studio.html:81 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .tpl | studio.html:82, studio.html:83 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .tpl button | studio.html:84 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .tpl button:hover | studio.html:85 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .tpl button[aria-pressed="true"] | studio.html:86 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .tpl svg | studio.html:87 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .tpl b | studio.html:88 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .tpl small | studio.html:89 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .acct | studio.html:90 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .acct .chip | studio.html:91 | StatusChip (interactive actions ? InkButton) |
| .ai-card | studio.html:92 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .ai-card .redline div | studio.html:93 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .plates | visuals.html:13 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .pl | visuals.html:14 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .pl:last-child | visuals.html:15 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .pl:hover | visuals.html:16 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .pl[aria-pressed="true"] | visuals.html:17 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .pl .hd | visuals.html:18 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .pl .hd b | visuals.html:19 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .pl .hd .chip | visuals.html:20 | StatusChip (interactive actions ? InkButton) |
| .pl svg.cov | visuals.html:21 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .pl .stg | visuals.html:22 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .pl .stg::after | visuals.html:23 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .pl .val | visuals.html:24 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .pl .val b | visuals.html:25 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .pl .val span | visuals.html:26 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .pl .rng | visuals.html:27 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .pl .rng i | visuals.html:28 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .pl .rng u | visuals.html:29 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .pl .rl | visuals.html:30 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .pl .ft | visuals.html:31 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .vgrid | visuals.html:32, visuals.html:33 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .feed | visuals.html:34 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .fk | visuals.html:35 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .fk svg | visuals.html:36 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .curvebox | visuals.html:37 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .curvebox svg | visuals.html:38 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .curvebox .h | visuals.html:39 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .curvebox .h:active | visuals.html:40 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .cv-tools | visuals.html:41 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .cv-tools label.f | visuals.html:42 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .preview | visuals.html:43 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .preview svg | visuals.html:44 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .preview .lbl | visuals.html:45 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .preview.bomb::after | visuals.html:46 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .url | visuals.html:47 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .url span | visuals.html:48 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| pre.code | visuals.html:49 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| pre.code .c | visuals.html:50 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .layers | visuals.html:51 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .layers li | visuals.html:52 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .layers li .no | visuals.html:53 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
| .flick | visuals.html:54, visuals.html:56 | NumberedPanel content slot; module-owned composition recorded in chamber inventory above |
