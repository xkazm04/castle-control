# Cutaway token admissions

`src/source.ts` is the only source; the CSS and typed mirror are generated. These roles are shared by recurring room, navigation, print and drawing instances. Each definition states its reusable intent; no role is a hex value disguised as a name. `src/winner-reference.ts` pins extracted design data for tests only (including input SHA-256 hashes), so a clean checkout does not require local `.port` reference files.

161 new names: 20 art paints, 35 surfaces/inks/scrims, 24 motion roles, 82 type roles.

Stock art remains a printed paper picture with exactly the paper paints. Shell papers use the existing stock palette (#121317, #1A1C22, #1D2027, #2A2D36); the inverse press ink becomes dark against the theme ink. Stamp ink stays light on gules, and all rampart inks stay light against its fixed dark background. The night wash and translucent gold draft wash remain unchanged.

The three press-like shades remain distinct: #FBF6EA is inverse key-plate lettering; #FFF8EC is gules-stamp lettering; #F5EFE2 is fixed on-dark rampart lettering and independently the top stage gradient stop. Merging them would alter pixels or couple unrelated contrast roles. Writ rows and count tiles share panel-paper (#FFFDF7); camera plaques use plaque-paper (the winner resolves var(--card) to #FBF9F3).

All 17 keep-art addendum names are admitted (16 durations/delays plus ease-stamp); no fallback name is rejected. The 2.7s landing handover is rejected as local orchestration, not an art animation duration.

Validation on 2026-10-31 (no install; changes left uncommitted in `packages/tokens`):

| command | result |
| --- | --- |
| `pnpm --filter @castle-control/tokens generate` | exit 0; `[token generation] walked 1 source; generated 2 files` |
| `pnpm --filter @castle-control/tokens typecheck` | exit 0; `[pnpm typecheck] walked 12 files` |
| `pnpm --filter @castle-control/tokens lint` | exit 0; `[pnpm lint] walked 12 files`; all five repository checks passed |
| `pnpm --filter @castle-control/tokens test` | exit 0; `Test Files 4 passed (4)`; `Tests 16 passed (16)` |
| `node scripts/check.mjs` | exit 0; boundaries/hygiene/file-cap 871 files, type-floor 151 files, secrets 1223 files |
| `node scripts/check.mjs type-floor` | exit 0; `[type-floor] walked 151 files` |
| `pnpm --filter @castle-control/ui test` | exit 0; `Test Files 21 passed (21)`; `Tests 359 passed (359)` |
| `pnpm --filter @castle-control/desktop test` | exit 0; `Test Files 72 passed (72)`; `Tests 728 passed (728)` |
| `pnpm gate` | exit 1 after 35 tooling tests passed; contract export failed with `spawnSync cargo EPERM` in `packages/contract/scripts/codegen.mjs:26` |

The full gate cannot complete in this sandbox because its contract exporter cannot spawn Cargo. No contract files were edited. The generated files remain below the 400-line cap by placing two declarations per line, with duplicate group names rejected before rendering. The original theme byte-equality and generator drift tests remain, and layout-group hashes pin the pre-Cutaway WP1 values.

| token | paper | stock | reusable intent |
| --- | --- | --- | --- |
| `--art-key` | `#16181D` | `#16181D` | The fixed key ink outlines the printed drawing. |
| `--art-gules` | `#E4472E` | `#E4472E` | The gules plate paints the drawing red. |
| `--art-azure` | `#3F86DC` | `#3F86DC` | The azure plate paints the drawing blue. |
| `--art-or` | `#F2B233` | `#F2B233` | The or plate paints the drawing gold. |
| `--art-paper` | `#FBF6EA` | `#FBF6EA` | The paper paint fills unprinted drawing areas. |
| `--art-stone` | `#EAE4D4` | `#EAE4D4` | The stone paint shades the keep masonry. |
| `--art-azure-text` | `#1D5BAA` | `#1D5BAA` | The dark azure ink letters the printed drawing. |
| `--art-gules-text` | `#B3321B` | `#B3321B` | The dark gules ink letters the printed drawing. |
| `--art-night` | `#1E2C4A` | `#1E2C4A` | The night paint dims rooms outside the current focus. |
| `--art-room-1` | `#FFF7DE` | `#FFF7DE` | The first room-light stop illuminates each room centre. |
| `--art-room-2` | `#F7EEDA` | `#F7EEDA` | The second room-light stop warms each room. |
| `--art-room-3` | `#E8DCC2` | `#E8DCC2` | The third room-light stop shades each room edge. |
| `--art-floor` | `#E2D3B4` | `#E2D3B4` | The floor paint fills the room floorboards. |
| `--art-wood` | `#7A5A35` | `#7A5A35` | The wood paint fills tables and the drawbridge. |
| `--art-void` | `#2A2C31` | `#2A2C31` | The void paint fills dark passages. |
| `--art-sheet` | `#FFFDF6` | `#FFFDF6` | The sheet paint fills scrolls and writs. |
| `--art-table` | `#E7D6B1` | `#E7D6B1` | The table paint fills the sand table. |
| `--art-sun-1` | `#FFE7A8` | `#FFE7A8` | The first sun stop paints the sun centre. |
| `--art-sun-2` | `#F8D78A` | `#F8D78A` | The second sun stop paints the sun halo. |
| `--art-hatch` | `#FFF3E6` | `#FFF3E6` | The hatch paint stipples the gules plate. |
| `--stage-paper` | `#F1EBDC` | `#121317` | The stage paper is the base behind the fitted composition. |
| `--body-top` | `#F6F1E5` | `#1D2027` | The upper body gradient stop lights the outer canvas. |
| `--body-low` | `#E9E1CD` | `#121317` | The lower body gradient stop shades the outer canvas. |
| `--stage-top` | `#F5EFE2` | `#1D2027` | The upper stage gradient stop lights the composition. |
| `--stage-mid` | `#EFE8D8` | `#1A1C22` | The middle stage gradient stop warms the composition. |
| `--stage-low` | `#E7DEC8` | `#121317` | The lower stage gradient stop shades the composition. |
| `--night` | `#1E2C4A` | `#1E2C4A` | The night wash dims unfocused rooms. |
| `--glow` | `#FFF3D1` | `#FFD36B` | The glow paint lights focused rooms. |
| `--press-paper` | `#FBF6EA` | `#121317` | The inverse ink letters key-filled buttons, tags and count tiles. |
| `--stamp-paper` | `#FFF8EC` | `#FFF8EC` | The light stamp ink letters gules-filled stamps and actions. |
| `--rampart-paper` | `#F5EFE2` | `#F5EFE2` | The rampart ink letters its fixed dark masthead. |
| `--rampart-background` | `#16181D` | `#16181D` | The rampart background stays dark behind its on-dark inks. |
| `--strip-paper` | `#EFE7D5` | `#1A1C22` | The strip paper backs the persistent chamber navigation. |
| `--strip-hover` | `#F7F1E3` | `#1D2027` | The strip hover paper highlights chamber targets. |
| `--column-paper` | `#E9E1CD` | `#1A1C22` | The column paper separates Program and Preview from the room. |
| `--plaque-paper` | `#FBF9F3` | `#1D2027` | The plaque paper backs room identity and state labels. |
| `--panel-paper` | `#FFFDF7` | `#1D2027` | The panel paper backs writ rows and status tiles. |
| `--draft-paper` | `#FFF4D6` | `#2A2D36` | The draft paper highlights draft pins and suggestion targets. |
| `--steward-paper` | `#F3EBD8` | `#1A1C22` | The Steward paper backs the assistant identity column. |
| `--monitor-paper` | `#F7F1E2` | `#121317` | The monitor paper backs Program and Preview pictures. |
| `--ticket-paper` | `#FFFDF6` | `#1D2027` | The ticket paper backs a revealed draw ticket. |
| `--rampart-muted` | `#B9B6AE` | `#B9B6AE` | The rampart muted ink letters secondary meter labels. |
| `--rampart-rule` | `#4A4D55` | `#4A4D55` | The rampart rule separates masthead groups. |
| `--rampart-offair` | `#FF8A73` | `#FF8A73` | The rampart off-air ink identifies the off-air state. |
| `--rampart-shadow` | `#8DBBF2` | `#8DBBF2` | The rampart shadow ink identifies watch-only state. |
| `--rampart-secondary` | `#D6D2C8` | `#D6D2C8` | The rampart secondary ink labels inverse count tiles. |
| `--plaque-shadow` | `rgba(22,24,29,.85)` | `rgba(0,0,0,.85)` | The plaque shadow lifts camera-following room labels. |
| `--stage-vignette` | `rgba(60,44,20,.16)` | `rgba(0,0,0,.16)` | The stage vignette shades the outer stage edges. |
| `--topbar-scrim` | `rgba(245,239,226,.86)` | `rgba(18,19,23,.86)` | The topbar scrim keeps navigation legible over the stage. |
| `--footer-scrim` | `rgba(245,239,226,.94)` | `rgba(18,19,23,.94)` | The footer scrim keeps room-mode footer controls legible. |
| `--stage-label-scrim` | `rgba(251,249,243,.9)` | `rgba(29,32,39,.9)` | The stage label scrim keeps landing illustration labels legible. |
| `--toy-scrim` | `rgba(251,249,243,.96)` | `rgba(29,32,39,.96)` | The toy scrim separates interactive demonstrations from the drawing. |
| `--shell-label-scrim` | `rgba(251,249,243,.88)` | `rgba(29,32,39,.88)` | The shell label scrim keeps app illustration labels legible. |
| `--draft-wash` | `rgba(242,178,51,.09)` | `rgba(242,178,51,.09)` | The draft wash tints the pending Preview frame. |
| `--reveal-scrim` | `rgba(247,241,226,.78)` | `rgba(18,19,23,.78)` | The reveal scrim separates a revealed draw from its Program picture. |
| `--m-print` | `.62s` | `.62s` | The print duration controls roller-sweep entrances. |
| `--m-stamp` | `.46s` | `.46s` | The stamp duration controls honesty-stamp landings. |
| `--m-slip` | `.42s` | `.42s` | The slip duration settles display-ink registration. |
| `--m-bleed` | `.9s` | `.9s` | The bleed duration disperses action feedback ink. |
| `--m-dolly` | `1.15s` | `1.15s` | The dolly duration moves the shared room camera. |
| `--ease-press` | `cubic-bezier(.2,.8,.2,1)` | `cubic-bezier(.2,.8,.2,1)` | The press easing settles print and control movement. |
| `--ease-stamp` | `cubic-bezier(.34,1.72,.52,1)` | `cubic-bezier(.34,1.72,.52,1)` | The stamp easing overshoots and settles stamps and registration. |
| `--ease-dolly` | `cubic-bezier(.65,0,.25,1)` | `cubic-bezier(.65,0,.25,1)` | The dolly easing accelerates and brakes room camera moves. |
| `--m-plate-key` | `.5s` | `.5s` | The key-plate duration prints the outline before colour. |
| `--m-plate-key-delay` | `.05s` | `.05s` | The key-plate delay starts the shared ink sequence. |
| `--m-plate-colour` | `.45s` | `.45s` | The colour-plate duration prints each colour plate. |
| `--m-plate-gules-delay` | `.55s` | `.55s` | The gules-plate delay schedules the first colour. |
| `--m-plate-azure-delay` | `1s` | `1s` | The azure-plate delay schedules the second colour. |
| `--m-plate-or-delay` | `1.45s` | `1.45s` | The or-plate delay schedules the third colour. |
| `--m-register` | `.32s` | `.32s` | The registration duration aligns all colour plates. |
| `--m-register-delay` | `2.05s` | `2.05s` | The registration delay aligns the shared intro sequence. |
| `--m-cloud` | `38s` | `38s` | The cloud duration drifts the first cloud layer. |
| `--m-cloud-2` | `52s` | `52s` | The second cloud duration offsets the slower cloud layer. |
| `--m-flame` | `1.6s` | `1.6s` | The flame duration flickers primary beacon flames. |
| `--m-flame-2` | `1.15s` | `1.15s` | The second flame duration offsets secondary flames. |
| `--m-flame-2-delay` | `-.4s` | `-.4s` | The second flame delay dephases adjacent flames. |
| `--m-ember` | `3.6s` | `3.6s` | The ember duration lifts each ember through its life cycle. |
| `--m-chatroll` | `14s` | `14s` | The chat-roll duration scrolls simulated gate marks. |
| `--m-wave` | `5s` | `5s` | The wave duration loops the moat water. |
| `--text-stage-eyebrow` | `15px` | `15px` | Sets eyebrow lettering in the landing stage; selector uses are in TYPE-FLOOR.md. |
| `--text-shell-eyebrow` | `13px` | `13px` | Sets eyebrow lettering in the desktop shell; selector uses are in TYPE-FLOOR.md. |
| `--text-stage-stamp` | `15px` | `15px` | Sets stamp lettering in the landing stage; selector uses are in TYPE-FLOOR.md. |
| `--text-shell-stamp` | `13px` | `13px` | Sets stamp lettering in the desktop shell; selector uses are in TYPE-FLOOR.md. |
| `--text-stage-stamp-large` | `22px` | `22px` | Sets stamp large lettering in the landing stage; selector uses are in TYPE-FLOOR.md. |
| `--text-shell-stamp-large` | `22px` | `22px` | Sets stamp large lettering in the desktop shell; selector uses are in TYPE-FLOOR.md. |
| `--text-stage-brand` | `19px` | `19px` | Sets brand lettering in the landing stage; selector uses are in TYPE-FLOOR.md. |
| `--text-stage-navigation` | `15px` | `15px` | Sets navigation lettering in the landing stage; selector uses are in TYPE-FLOOR.md. |
| `--text-stage-shortcut-hint` | `15px` | `15px` | Sets shortcut hint lettering in the landing stage; selector uses are in TYPE-FLOOR.md. |
| `--text-stage-shortcut` | `15px` | `15px` | Sets shortcut lettering in the landing stage; selector uses are in TYPE-FLOOR.md. |
| `--text-stage-action` | `15px` | `15px` | Sets action lettering in the landing stage; selector uses are in TYPE-FLOOR.md. |
| `--text-stage-headline` | `132px` | `132px` | Sets headline lettering in the landing stage; selector uses are in TYPE-FLOOR.md. |
| `--text-stage-subtitle` | `31px` | `31px` | Sets subtitle lettering in the landing stage; selector uses are in TYPE-FLOOR.md. |
| `--text-stage-room-number` | `17px` | `17px` | Sets room number lettering in the landing stage; selector uses are in TYPE-FLOOR.md. |
| `--text-stage-broadside-title` | `68px` | `68px` | Sets broadside title lettering in the landing stage; selector uses are in TYPE-FLOOR.md. |
| `--text-stage-broadside-subtitle` | `28px` | `28px` | Sets broadside subtitle lettering in the landing stage; selector uses are in TYPE-FLOOR.md. |
| `--text-stage-lead` | `20px` | `20px` | Sets lead lettering in the landing stage; selector uses are in TYPE-FLOOR.md. |
| `--text-stage-body` | `17px` | `17px` | Sets body lettering in the landing stage; selector uses are in TYPE-FLOOR.md. |
| `--text-stage-step-number` | `15px` | `15px` | Sets step number lettering in the landing stage; selector uses are in TYPE-FLOOR.md. |
| `--text-stage-toy-title` | `20px` | `20px` | Sets toy title lettering in the landing stage; selector uses are in TYPE-FLOOR.md. |
| `--text-stage-input` | `17px` | `17px` | Sets input lettering in the landing stage; selector uses are in TYPE-FLOOR.md. |
| `--text-stage-toy-action` | `17px` | `17px` | Sets toy action lettering in the landing stage; selector uses are in TYPE-FLOOR.md. |
| `--text-stage-toy-result` | `40px` | `40px` | Sets toy result lettering in the landing stage; selector uses are in TYPE-FLOOR.md. |
| `--text-stage-history` | `15px` | `15px` | Sets history lettering in the landing stage; selector uses are in TYPE-FLOOR.md. |
| `--text-stage-footer` | `15px` | `15px` | Sets footer lettering in the landing stage; selector uses are in TYPE-FLOOR.md. |
| `--text-stage-tagline` | `15px` | `15px` | Sets tagline lettering in the landing stage; selector uses are in TYPE-FLOOR.md. |
| `--text-stage-label` | `15px` | `15px` | Sets label lettering in the landing stage; selector uses are in TYPE-FLOOR.md. |
| `--text-stage-detail-title` | `58px` | `58px` | Sets detail title lettering in the landing stage; selector uses are in TYPE-FLOOR.md. |
| `--text-stage-principles-title` | `46px` | `46px` | Sets principles title lettering in the landing stage; selector uses are in TYPE-FLOOR.md. |
| `--text-stage-hex-result` | `30px` | `30px` | Sets hex result lettering in the landing stage; selector uses are in TYPE-FLOOR.md. |
| `--text-shell-brand` | `18px` | `18px` | Sets brand lettering in the desktop shell; selector uses are in TYPE-FLOOR.md. |
| `--text-shell-meter` | `14px` | `14px` | Sets meter lettering in the desktop shell; selector uses are in TYPE-FLOOR.md. |
| `--text-shell-meter-label` | `13px` | `13px` | Sets meter label lettering in the desktop shell; selector uses are in TYPE-FLOOR.md. |
| `--text-shell-action-small` | `13px` | `13px` | Sets action small lettering in the desktop shell; selector uses are in TYPE-FLOOR.md. |
| `--text-shell-shortcut` | `13px` | `13px` | Sets shortcut lettering in the desktop shell; selector uses are in TYPE-FLOOR.md. |
| `--text-shell-strip-word` | `16px` | `16px` | Sets strip word lettering in the desktop shell; selector uses are in TYPE-FLOOR.md. |
| `--text-shell-state` | `14px` | `14px` | Sets state lettering in the desktop shell; selector uses are in TYPE-FLOOR.md. |
| `--text-shell-headline` | `58px` | `58px` | Sets headline lettering in the desktop shell; selector uses are in TYPE-FLOOR.md. |
| `--text-shell-tagline` | `20px` | `20px` | Sets tagline lettering in the desktop shell; selector uses are in TYPE-FLOOR.md. |
| `--text-shell-label` | `13px` | `13px` | Sets label lettering in the desktop shell; selector uses are in TYPE-FLOOR.md. |
| `--text-shell-plaque-name` | `15px` | `15px` | Sets plaque name lettering in the desktop shell; selector uses are in TYPE-FLOOR.md. |
| `--text-shell-plaque-word` | `32px` | `32px` | Sets plaque word lettering in the desktop shell; selector uses are in TYPE-FLOOR.md. |
| `--text-shell-plaque-state` | `17px` | `17px` | Sets plaque state lettering in the desktop shell; selector uses are in TYPE-FLOOR.md. |
| `--text-shell-draft-label` | `13px` | `13px` | Sets draft label lettering in the desktop shell; selector uses are in TYPE-FLOOR.md. |
| `--text-shell-moat-state` | `17px` | `17px` | Sets moat state lettering in the desktop shell; selector uses are in TYPE-FLOOR.md. |
| `--text-shell-navigation` | `14px` | `14px` | Sets navigation lettering in the desktop shell; selector uses are in TYPE-FLOOR.md. |
| `--text-shell-title` | `50px` | `50px` | Sets title lettering in the desktop shell; selector uses are in TYPE-FLOOR.md. |
| `--text-shell-subtitle` | `19px` | `19px` | Sets subtitle lettering in the desktop shell; selector uses are in TYPE-FLOOR.md. |
| `--text-shell-action` | `15px` | `15px` | Sets action lettering in the desktop shell; selector uses are in TYPE-FLOOR.md. |
| `--text-shell-panel-title` | `18px` | `18px` | Sets panel title lettering in the desktop shell; selector uses are in TYPE-FLOOR.md. |
| `--text-shell-aside` | `15px` | `15px` | Sets aside lettering in the desktop shell; selector uses are in TYPE-FLOOR.md. |
| `--text-shell-body` | `15px` | `15px` | Sets body lettering in the desktop shell; selector uses are in TYPE-FLOOR.md. |
| `--text-shell-figure` | `72px` | `72px` | Sets figure lettering in the desktop shell; selector uses are in TYPE-FLOOR.md. |
| `--text-shell-stat-number` | `16px` | `16px` | Sets stat number lettering in the desktop shell; selector uses are in TYPE-FLOOR.md. |
| `--text-shell-stat-title` | `14.5px` | `14.5px` | Sets stat title lettering in the desktop shell; selector uses are in TYPE-FLOOR.md. |
| `--text-shell-stat-label` | `13.5px` | `13.5px` | Sets stat label lettering in the desktop shell; selector uses are in TYPE-FLOOR.md. |
| `--text-shell-legend` | `14px` | `14px` | Sets legend lettering in the desktop shell; selector uses are in TYPE-FLOOR.md. |
| `--text-shell-panel-action` | `14px` | `14px` | Sets panel action lettering in the desktop shell; selector uses are in TYPE-FLOOR.md. |
| `--text-shell-tile-number` | `30px` | `30px` | Sets tile number lettering in the desktop shell; selector uses are in TYPE-FLOOR.md. |
| `--text-shell-verdict` | `14px` | `14px` | Sets verdict lettering in the desktop shell; selector uses are in TYPE-FLOOR.md. |
| `--text-shell-time` | `13px` | `13px` | Sets time lettering in the desktop shell; selector uses are in TYPE-FLOOR.md. |
| `--text-shell-rule` | `15px` | `15px` | Sets rule lettering in the desktop shell; selector uses are in TYPE-FLOOR.md. |
| `--text-shell-monitor-label` | `15px` | `15px` | Sets monitor label lettering in the desktop shell; selector uses are in TYPE-FLOOR.md. |
| `--text-shell-empty` | `16px` | `16px` | Sets empty lettering in the desktop shell; selector uses are in TYPE-FLOOR.md. |
| `--text-shell-panel-title-large` | `22px` | `22px` | Sets panel title large lettering in the desktop shell; selector uses are in TYPE-FLOOR.md. |
| `--text-shell-ticket` | `19px` | `19px` | Sets ticket lettering in the desktop shell; selector uses are in TYPE-FLOOR.md. |
| `--text-shell-reveal-title` | `16px` | `16px` | Sets reveal title lettering in the desktop shell; selector uses are in TYPE-FLOOR.md. |
| `--text-shell-seal` | `17px` | `17px` | Sets seal lettering in the desktop shell; selector uses are in TYPE-FLOOR.md. |
| `--text-shell-hint` | `13px` | `13px` | Sets hint lettering in the desktop shell; selector uses are in TYPE-FLOOR.md. |
| `--text-shell-aside-small` | `14px` | `14px` | Sets aside small lettering in the desktop shell; selector uses are in TYPE-FLOOR.md. |
| `--text-shell-steward-message` | `15.5px` | `15.5px` | Sets steward message lettering in the desktop shell; selector uses are in TYPE-FLOOR.md. |
| `--text-shell-input` | `15.5px` | `15.5px` | Sets input lettering in the desktop shell; selector uses are in TYPE-FLOOR.md. |
| `--text-shell-suggestion` | `14.5px` | `14.5px` | Sets suggestion lettering in the desktop shell; selector uses are in TYPE-FLOOR.md. |
| `--text-shell-figure-caption` | `16px` | `16px` | Sets figure caption lettering in the desktop shell; selector uses are in TYPE-FLOOR.md. |
| `--text-shell-stat-fraction` | `13px` | `13px` | Sets stat fraction lettering in the desktop shell; selector uses are in TYPE-FLOOR.md. |
| `--text-shell-graphic-label` | `18px` | `18px` | Sets graphic label lettering in the desktop shell; selector uses are in TYPE-FLOOR.md. |
| `--text-shell-message-label` | `13.5px` | `13.5px` | Sets message label lettering in the desktop shell; selector uses are in TYPE-FLOOR.md. |
| `--text-shell-body-large` | `19px` | `19px` | Sets body large lettering in the desktop shell; selector uses are in TYPE-FLOOR.md. |
| `--text-shell-rule-number` | `22px` | `22px` | Sets rule number lettering in the desktop shell; selector uses are in TYPE-FLOOR.md. |
| `--text-shell-beacon-number` | `64px` | `64px` | Sets beacon number lettering in the desktop shell; selector uses are in TYPE-FLOOR.md. |
| `--text-shell-beacon-unit` | `24px` | `24px` | Sets beacon unit lettering in the desktop shell; selector uses are in TYPE-FLOOR.md. |
| `--text-shell-scene-caption` | `13px` | `13px` | Sets scene caption lettering in the desktop shell; selector uses are in TYPE-FLOOR.md. |
