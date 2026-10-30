# Preset Atlas: the owner's picks (2026-10-30, 22:55Z)

Triage page: `atlas.html` (published privately to the owner). The images were generated with Gemini image
generation through the Antigravity CLI. They are sample art, and every surface that shows one
labels it AI-generated sample art. `web/` holds the keyed (transparent) WebP files; the
full-size PNG originals stay local and out of git.

## Direction (owner, 2026-10-30)
1. **On stream demo.** First users must be able to imagine how the chamber assets look on a real
   stream. The app shows a demo screen: an Overlord-themed broadcast with Arch-Lich Malakor in
   the streamer's seat (the facecam), the chamber assets overlaid, and a simulated chat and
   extension panels. The stage in `atlas.html` (`.page`, `.stage`) is the spec.
2. **Art-style presets.** Users do not know what is possible, so the app ships preset assets in
   several art styles beside today's shape presets.

## Kept styles (6)
| id | name | thesis |
|---|---|---|
| heraldic | Heraldic | Carved bronze and ember: the house look of Castle Control. |
| pixel | Arcade | 16-bit sprites for retro and speedrun channels. |
| synthwave | Neon | Glowing tubes and chrome for late-night and music streams. |
| watercolor | Storybook | Soft painted washes for cozy and creative channels. |
| anime | Cel | Bold outlines and flat colour for anime and VTuber channels. |
| glass | Glass | Frosted panels and thin light for clean, modern setups. |

Dropped: clay (Clay), comic (Ink).

## Kept assets per style
For every kept style: `urn` (Lot Chamber draw), `altar` (Beacons hype altar), `votebar`
(Gatehouse vote bar) and `hexmap` (Map Room realm map). That makes 24 files:
`web/preset-<style>-<asset>.webp`.

**Cam frames: redo.** The owner kept only the Neon frame and wrote: "Cam frames are often too
thick, we will need to design thinner subtle approach enhanced with glow or shadows." Round two of
the frames is `web/preset-<style>-frame2.webp` and is still waiting for the owner's pick. Until a
frame is picked, a port draws the cam border as a thin CSS outline in the style's ink, with a glow.

## Stream shots (all kept)
`web/malakor-facecam.webp`, `web/malakor-lair-wide.webp`, `web/malakor-laugh.webp`,
`web/scene-warmap.webp` (gameplay background) and `web/scene-throne.webp` (just-chatting
background).
