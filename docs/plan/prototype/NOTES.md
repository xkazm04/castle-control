# Castle Control: your channel is your keep

## Philosophy
A streamer wants to feel sovereign and safe. The channel is a keep, chat is the crowd at the gate, and the four tools are chambers you command. The brand is printed rather than rendered: the keep is a gig-poster print in three heraldic spot inks plus a key, on the same warm paper as before. Each chamber owns one ink. The Lot Chamber (lottery) is gules, for wax seals and banners. The Gatehouse (moderator) is azure, for the watch and the moat. The Beacons (visuals) are or, for fire. The Map Room (studio) is key. The metaphor carries real mechanics. The chat delay is the moat, AutoMod holds wait at the portcullis, and Shield Mode raises the drawbridge. A sealed draw is a writ, and gifts light beacon fires. The co-pilot is the Steward: it drafts a writ, and nothing changes until you seal it. Every castle word sits beside its plain function.

## How it stays readable at scale
**Landing**
- A fixed-proportion 1600x1000 sheet scales from 1280x800 to 2560x1440.
- At 390x844 it recomposes into a stacked wordmark and four chamber strips.
- The banner bar at the bottom is always visible and links every chamber.

**App**
- The app keeps the winning layout untouched: the rule-separated panels, the density, the type scale and the tabular figures.
- The rampart (masthead) on every page shows:
  - the ON AIR stamp, viewers and uptime;
  - Twitch and OBS registration marks;
  - the Gatehouse chip, which reads "Armed n | Watching n", or "Bridge up" when Shield Mode is on.
- The chambers column shows each chamber's live figure. Keys 1–4 switch chambers and `/` asks the Steward.
- Nested pages (the writ, the drill) keep their breadcrumb and Back.
- Dark stock is kept for four-hour streams.

## The wow moment
- **Intro.** Five plates arrive out of register and snap into it: stone, beacon fire, the Lot Chamber, the Gatehouse, then the map. Once the keep is in register, the drawbridge drops across the moat and control is handed over. The intro takes under three seconds and can be skipped.
- **Hover.** Hovering a chamber ghosts the other plates. The chamber's name then prints in the sky where the wordmark stood, in its own ink, with a ghost slipped out of register.
- **Opening a chamber.** Click a chamber and it opens into its own full-bleed print:
  - the drum and the sealed writ;
  - the gate roll, marked Pass, Hold and Bar, beside the portcullis, the moat gauge and the Herald's chart;
  - the brazier and the kindling curve;
  - the hex map and the test ladder.

  A full feature list sits one level deeper.

## Known limits
- Light paper is the default, on purpose; dark stock is one toggle away and is shared between the landing and the app.
- Data loads from `../data/sample.js` with a local fallback copy; every figure is illustrative and labelled sample data.
- Nothing talks to Twitch or OBS. The Steward answers canned briefs only, and the public round is simulated (the SHA-256 seal and recompute are real).
- At 1280 the visuals and studio pages wrap a column below, so they run tall; the lottery hero kicker can still ellipsise a very long draw name (as before).
- Sample data strings (the "Offering altar" visual, the replay's stream name) are data and stay as written.
- Castle Control is a working name, not a registered trademark.

## What changed in the final round
Each change below names the sentence of the owner's review it answers.

**"The brand I'm not a fan of."** Overprint is gone everywhere; the app's names and voice are Castle Control's.
- **Name and wordmark:** Overprint became Castle Control. In the app's masthead the wordmark is stacked (Castle / Control) with a gold ghost. On the landing it is custom condensed lettering, with six new glyphs drawn for the name (C, S, G, H, M and B).
- **Logo:** the overlapping-frame mark became the keep-bubble, a chat bubble with a battlement top printed in gules and a gate lit in or. It is one shared component, `mark.js`, used by every page.
- **Module names:** Draw, Proof, Ink and Layout became the Lot Chamber, the Gatehouse, the Beacons and the Map Room. Page titles and crumbs now read "Chamber n of 4", and the module ids are unchanged.
- **Status words:** Proofing and On press became Watching (shadow) and Armed. Stet, dele and qy became Pass, Hold and Bar. "Hold the press" became "Raise the drawbridge" (Shield Mode, shown as "Bridge up").
- **Print terms, replaced:**
  - **Gatehouse:** corrections became the gate log; the margins (room governor) became garrison orders; the delay became the moat; the replay simulator became the drill; appeals became petitions.
  - **Lot Chamber:** stubs became lots; lock the forme became seal the roll; the imprint became the seal; pull became cast; the counterfoil became the writ.
  - **Beacons:** coverage became blaze; the dot-gain curve became the kindling curve; test pull became test fire.
  - **Map Room:** galley, page and press became sand table, muster and proclaimed.
- **Co-pilot:** the Editor became the Steward, in a new courteous, brief voice: "Seal it" or "Tear it up", with every page's briefs rewritten.

**"Try to keep typography fonts inside app, color of background, artstyle"**
- **Kept unchanged:** the same font faces, fallbacks, type scale and tabular figures. Also the paper (#F4F0E6) with its grain and the dark-stock toggle; the plate, halftone, registration-mark and crop-mark art style; and every app layout, panel, density setting, nested page and piece of data wiring.
- **Inks retuned within spot-ink logic:** cyan, magenta and yellow became heraldic azure, gules and or, plus the key, so overprints still make third colours.

**"…with higher impact on landing page to redesign"**
- **New hero:** the old poster is replaced by a keep in cross-section: gatehouse, cutaway hall and map room, beacon tower and watch tower, over a moat. The stone is shaded with halftone, and the hall is lit from the drum outward.
- **New intro:** the plates register into the keep, then the drawbridge drops. This is the brand's version of the snap into register. The flames flicker, embers rise and the banners stir, using transform and opacity only, with a calm version for reduced motion.
- **Opened chambers:** all four scenes are redrawn in the brand's world.
- **New brand sheet:** `brand.html` is rewritten with the mark, inks, overprints, type, chambers, status words and voice.

**"…lower on app content inside"**
- **Icons:** the icon drawing is now castle motifs: watch, armed, portcullis, pass, hold, bar, seal, quill, tear, beacon, brazier, tower, scroll, flag.
- **Empty states:** they speak the castle's language, each with a line drawing: "The portcullis is clear", "No lots in the urn yet", "No beacon is lit", "The map table is bare".
- **Accents:** they follow the chamber inks.
- **Small layout fixes:** where a two-word chamber name or a longer word needed it (the heading's ghost layer, the shape selector, the rule table header), and nothing else.

**"As bonus it will be well compatible wit Shadowrunr"** The code is made port-ready.
- **Tokens:** they are declared once in `tokens.css`, and ink literals are replaced with `var(--…)` across the pages and scripts.
- **One component per visual thing:** the mark lives in `mark.js`.
- **Shared helpers:** they sit in one namespace (`CC.*`).
- **Keymaps:** there is one keymap table in the app (`CC.KEYMAP`) and one on the landing.
- **The keep:** it is drawn from one `CASTLE` table, which also drives its halftone.
- **State tables:** small state tables drive the lottery stage buttons, the moderator modes and marks, and the studio test ladder.
