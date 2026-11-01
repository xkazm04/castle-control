# Winner type floor audit

Every numeric font size in `cc.css`, `index.html`, and `app.html` is listed, including inline styles, template markup, and SVG text. Shared `cc.css` declarations have separate stage and shell rows; inherited fonts introduce no new size. Source line numbers identify inline declarations, including two sizes on app line 356.

Stage sizes use a 15px floor and 17px for reading copy; shell sizes use 13px and 15px for reading copy. Sizes above the applicable floor stay exact. Principles headings, broadside fine print, toy explanations, chat messages, draft detail, writ descriptions and fairness notes are reading copy. Single-line metadata, state labels and short captions are labels.

112 rows; 33 raised; 79 unchanged; 82 type roles. Every file/selector occurrence is checked against the immutable extraction in `src/winner-reference.ts` by `type-floor.test.ts`; tests do not require the local `.port` snapshots.

| winner selector | winner px | token | port px | raised? |
| --- | ---: | --- | ---: | --- |
| `cc.css (stage) .eyebrow` | 13 | `--text-stage-eyebrow` | 15 | yes |
| `cc.css (shell) .eyebrow` | 13 | `--text-shell-eyebrow` | 13 | no |
| `cc.css (stage) .stamp` | 12.5 | `--text-stage-stamp` | 15 | yes |
| `cc.css (shell) .stamp` | 12.5 | `--text-shell-stamp` | 13 | yes |
| `cc.css (stage) .stamp--big` | 22 | `--text-stage-stamp-large` | 22 | no |
| `cc.css (shell) .stamp--big` | 22 | `--text-shell-stamp-large` | 22 | no |
| `index.html .mark` | 19 | `--text-stage-brand` | 19 | no |
| `index.html .crumbs` | 15 | `--text-stage-navigation` | 15 | no |
| `index.html .keys` | 13 | `--text-stage-shortcut-hint` | 15 | yes |
| `index.html kbd` | 12 | `--text-stage-shortcut` | 15 | yes |
| `index.html .cta` | 15 | `--text-stage-action` | 15 | no |
| `index.html #headline h1` | 132 | `--text-stage-headline` | 132 | no |
| `index.html #headline .sub` | 31 | `--text-stage-subtitle` | 31 | no |
| `index.html .tag` | 17 | `--text-stage-room-number` | 17 | no |
| `index.html #broadside h2` | 68 | `--text-stage-broadside-title` | 68 | no |
| `index.html #broadside .fn` | 28 | `--text-stage-broadside-subtitle` | 28 | no |
| `index.html #broadside .line` | 20 | `--text-stage-lead` | 20 | no |
| `index.html #broadside li` | 16 | `--text-stage-body` | 17 | yes |
| `index.html #broadside li .n` | 14 | `--text-stage-step-number` | 15 | yes |
| `index.html #broadside .btn` | 15 | `--text-stage-action` | 15 | no |
| `index.html #broadside .pager` | 15 | `--text-stage-navigation` | 15 | no |
| `index.html #broadside .body` | 17 | `--text-stage-body` | 17 | no |
| `index.html #broadside .fine` | 15 | `--text-stage-body` | 17 | yes |
| `index.html #broadside .principles div` | 14.5 | `--text-stage-body` | 17 | yes |
| `index.html #broadside .principles b` | 15.5 | `--text-stage-body` | 17 | yes |
| `index.html #toy .tlab b` | 20 | `--text-stage-toy-title` | 20 | no |
| `index.html #toy .tlab small` | 14 | `--text-stage-body` | 17 | yes |
| `index.html #toy input[type=text]` | 17 | `--text-stage-input` | 17 | no |
| `index.html #toy .go` | 17 | `--text-stage-toy-action` | 17 | no |
| `index.html #toy .out .big` | 40 | `--text-stage-toy-result` | 40 | no |
| `index.html #toy .out .proof` | 13 | `--text-stage-body` | 17 | yes |
| `index.html #toy .out .claim` | 15 | `--text-stage-body` | 17 | yes |
| `index.html #toy .hist` | 13 | `--text-stage-history` | 15 | yes |
| `index.html #footer` | 14 | `--text-stage-footer` | 15 | yes |
| `index.html #footer .mid` | 15 | `--text-stage-tagline` | 15 | no |
| `index.html #skip` | 13 | `--text-stage-action` | 15 | yes |
| `index.html .vlabel` | 13 | `--text-stage-label` | 15 | yes |
| `index.html:236 h2 (inline style)` | 58 | `--text-stage-detail-title` | 58 | no |
| `index.html:243 h2 (inline style)` | 46 | `--text-stage-principles-title` | 46 | no |
| `index.html:244 p (inline style)` | 17 | `--text-stage-body` | 17 | no |
| `index.html:267 label for="gifts" (inline style)` | 15 | `--text-stage-label` | 15 | no |
| `index.html:272 div id="houses" (inline style)` | 30 | `--text-stage-hex-result` | 30 | no |
| `app.html #rampart .mark` | 18 | `--text-shell-brand` | 18 | no |
| `app.html #rampart .meter` | 14 | `--text-shell-meter` | 14 | no |
| `app.html #rampart .meter small` | 10.5 | `--text-shell-meter-label` | 13 | yes |
| `app.html #connStamps .stamp,#airStamp .stamp` | 11.5 | `--text-shell-stamp` | 13 | yes |
| `app.html #rampart .rbtn` | 13 | `--text-shell-action-small` | 13 | no |
| `app.html #strip kbd` | 12 | `--text-shell-shortcut` | 13 | yes |
| `app.html #strip b` | 16 | `--text-shell-strip-word` | 16 | no |
| `app.html #strip span.st` | 14 | `--text-shell-state` | 14 | no |
| `app.html #khead h1` | 58 | `--text-shell-headline` | 58 | no |
| `app.html #khead .sub` | 20 | `--text-shell-tagline` | 20 | no |
| `app.html .vlab` | 13 | `--text-shell-label` | 13 | no |
| `app.html .plaque .nm` | 15 | `--text-shell-plaque-name` | 15 | no |
| `app.html .plaque .wd` | 32 | `--text-shell-plaque-word` | 32 | no |
| `app.html .plaque .ln` | 17 | `--text-shell-plaque-state` | 17 | no |
| `app.html .plaque .stamp` | 13 | `--text-shell-stamp` | 13 | no |
| `app.html .plaque .pin` | 13 | `--text-shell-draft-label` | 13 | no |
| `app.html .moatlab` | 17 | `--text-shell-moat-state` | 17 | no |
| `app.html .moatlab small` | 13 | `--text-shell-label` | 13 | no |
| `app.html #rtitle .crumb` | 14 | `--text-shell-navigation` | 14 | no |
| `app.html #rtitle h1` | 50 | `--text-shell-title` | 50 | no |
| `app.html #rtitle .fn` | 19 | `--text-shell-subtitle` | 19 | no |
| `app.html #back` | 15 | `--text-shell-action` | 15 | no |
| `app.html .panel h3` | 18 | `--text-shell-panel-title` | 18 | no |
| `app.html .panel h3 em` | 15 | `--text-shell-aside` | 15 | no |
| `app.html .body15` | 15 | `--text-shell-body` | 15 | no |
| `app.html .num` | 72 | `--text-shell-figure` | 72 | no |
| `app.html .stat .ring` | 16 | `--text-shell-stat-number` | 16 | no |
| `app.html .stat b` | 14.5 | `--text-shell-stat-title` | 14.5 | no |
| `app.html .stat small` | 13.5 | `--text-shell-stat-label` | 13.5 | no |
| `app.html .legend` | 14 | `--text-shell-legend` | 14 | no |
| `app.html .writ b` | 18 | `--text-shell-panel-title` | 18 | no |
| `app.html .writ small` | 14.5 | `--text-shell-body` | 15 | yes |
| `app.html .pbtn` | 14 | `--text-shell-panel-action` | 14 | no |
| `app.html .tile small` | 13 | `--text-shell-label` | 13 | no |
| `app.html .tile b` | 30 | `--text-shell-tile-number` | 30 | no |
| `app.html .lines` | 14.5 | `--text-shell-body` | 15 | yes |
| `app.html .lines em` | 14 | `--text-shell-verdict` | 14 | no |
| `app.html .lines time` | 12.5 | `--text-shell-time` | 13 | yes |
| `app.html .ruleset div` | 15 | `--text-shell-rule` | 15 | no |
| `app.html .monlab` | 15 | `--text-shell-monitor-label` | 15 | no |
| `app.html .mon .empty` | 16 | `--text-shell-empty` | 16 | no |
| `app.html .draftframe b` | 22 | `--text-shell-panel-title-large` | 22 | no |
| `app.html .draftframe small` | 14 | `--text-shell-body` | 15 | yes |
| `app.html .ticket` | 19 | `--text-shell-ticket` | 19 | no |
| `app.html .reveal .title` | 16 | `--text-shell-reveal-title` | 16 | no |
| `app.html #seal` | 17 | `--text-shell-seal` | 17 | no |
| `app.html #seal .lbl small` | 12.5 | `--text-shell-hint` | 13 | yes |
| `app.html .colnote` | 14.5 | `--text-shell-body` | 15 | yes |
| `app.html .fair` | 14 | `--text-shell-body` | 15 | yes |
| `app.html .fair b` | 13 | `--text-shell-label` | 13 | no |
| `app.html #steward .who b` | 18 | `--text-shell-panel-title` | 18 | no |
| `app.html #steward .who small` | 14 | `--text-shell-aside-small` | 14 | no |
| `app.html #say` | 15.5 | `--text-shell-steward-message` | 15.5 | no |
| `app.html #steward input` | 15.5 | `--text-shell-input` | 15.5 | no |
| `app.html .chip` | 14.5 | `--text-shell-suggestion` | 14.5 | no |
| `app.html:180 kbd (inline style)` | 12 | `--text-shell-shortcut` | 13 | yes |
| `app.html:319 div (inline style)` | 16 | `--text-shell-figure-caption` | 16 | no |
| `app.html:322 span (inline style)` | 13 | `--text-shell-stat-fraction` | 13 | no |
| `app.html:326 text (SVG text)` | 18 | `--text-shell-graphic-label` | 18 | no |
| `app.html:340 p (inline style)` | 13.5 | `--text-shell-message-label` | 13.5 | no |
| `app.html:341 p (inline style)` | 19 | `--text-shell-body-large` | 19 | no |
| `app.html:344 p (inline style)` | 14 | `--text-shell-body` | 15 | yes |
| `app.html:351 span (inline style)` | 22 | `--text-shell-rule-number` | 22 | no |
| `app.html:352 p (inline style)` | 14 | `--text-shell-body` | 15 | yes |
| `app.html:355 h3 (inline style)` | 22 | `--text-shell-panel-title-large` | 22 | no |
| `app.html:356 span (inline style)` | 64 | `--text-shell-beacon-number` | 64 | no |
| `app.html:356 small (inline style)` | 24 | `--text-shell-beacon-unit` | 24 | no |
| `app.html:358 span (inline style)` | 14 | `--text-shell-body` | 15 | yes |
| `app.html:366 p (inline style)` | 14 | `--text-shell-body` | 15 | yes |
| `app.html:380 text (SVG text)` | 11 | `--text-shell-scene-caption` | 13 | yes |
