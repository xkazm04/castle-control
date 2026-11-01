# Costume rounds: status and how to resume

Read [BRIEF.md](BRIEF.md) for the rules every variant follows.

## Where things stand

- **Round 1** (3 families x 9 pages) is closed. The owner's picks are in
  [round-1/PICKS.md](round-1/PICKS.md). The losing variants were deleted; they remain in
  the triage artifact's published round-1 files only.
- **Fused baseline:** [fused/](fused/) holds the nine winning pages on one design system:
  `tokens.css` (one palette, font set, scale, day/night themes), `shell.css` (one app shell
  and shared primitives), `glass.css` (Stained Glass components: landing, keep, overview,
  demo, lottery) and `folio.css` (Illuminated components: setup, gatehouse, beacons,
  maproom). [fused/FUSION.md](fused/FUSION.md) documents the token map and how a page is
  built. `fused/thumbs/<id>-day|night.webp` are 1440x900 screenshots.
- **Round 2** has not started. `triage.html` is already set to round 2 with the fused set
  as each page's baseline.

## Triage artifact

https://claude.ai/artifact/KFZLEe5Npqzb8rKc51dJEz (private to the owner). Picks are stored in
its database at `rounds/round-<N>/picks/<pageId>` as `{pick: "a"|"b"|"c"|"base"}`; the
page's **Copy picks** button gives a one-line summary.

## Running round 2

1. For each page, three agents' worth of work: **A refine**, **B push**, **C cross**
   (see BRIEF.md, "Later rounds"). Every variant links `../../fused/tokens.css` and
   `../../fused/shell.css` plus its direction sheet, and may add page CSS. Token or shell
   changes a variant needs go in a page-local override so the fused baseline stays intact.
   Write to `round-2/<a|b|c>/<id>.html`, screenshots to `round-2/<a|b|c>/_shots/`.
2. Thumbnails: screenshot each variant at 1440x900 after about 3.5 s, save as
   `round-2/_thumbs/<family>-<id>.webp`, 960 px wide.
3. Publish: add finished ids to `READY` in `triage.html`. The artifact service rejects
   published paths that start with `_`, so publish from a staging copy that renames
   `_assets`, `_baseline` and `_thumbs` and rewrites their references. Republish to the
   same artifact URL, keeping its `db` capability.
4. Read the picks, write `round-2/PICKS.md`, fuse the winners into `fused/`.
