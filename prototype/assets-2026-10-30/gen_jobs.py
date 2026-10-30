"""Builds jobs.tsv (name<TAB>prompt) for the 2026-10-30 asset preset library."""
STYLES = {
    "heraldic": "gothic heraldic style, tarnished bronze and black iron, carved coats of arms, ember-orange glow, illuminated-manuscript detail, painterly realism",
    "pixel": "16-bit pixel art, crisp hard pixels, limited retro console palette, no anti-aliasing, arcade sprite look",
    "synthwave": "neon synthwave style, glowing magenta and cyan neon tubes, chrome edges, retro-futuristic 1980s glow, light bloom",
    "watercolor": "cozy storybook watercolor illustration, soft hand-painted washes, ink linework, warm parchment tones, gentle and friendly",
    "anime": "clean anime cel-shaded illustration, bold confident outlines, flat vivid colours with sharp shadow shapes, energetic",
    "clay": "soft 3D claymation toy render, rounded chunky shapes, matte plasticine texture, pastel colours, studio softbox lighting",
    "comic": "black ink comic-book style, heavy brush lines, halftone dot shading, two spot colours red and yellow, punchy",
    "glass": "minimal modern frosted-glass UI style, translucent blurred glass panels, thin luminous edges, subtle gradients, premium and clean",
}
ASSETS = {
    "urn": "a prize draw urn for a viewer lottery giveaway, with ticket slips peeking out of the lid",
    "frame": "a decorative webcam frame border for a livestream facecam, an ornamental rectangular 16:9 border with the whole inside left completely empty flat black",
    "altar": "a hype meter shaped as an offering altar with a tall vertical gauge that fills with glowing energy, half full",
    "votebar": "a wide horizontal two-option poll bar for a livestream overlay, two empty label plates on each end and a split meter between them, very wide and short",
    "hexmap": "a small fantasy realm map made of hexagon tiles with territories, banners marking conquered regions, seen from above as a stream extension panel",
}
TAIL = "Isolated on a flat pure black background, centered, nothing else in the image, absolutely no text, no letters, no numbers, no logos, no watermark."

MALAKOR = ("a theatrical skull-faced sorcerer-villain, ivory bone skull with fine hairline cracks and a jagged crown of black obsidian horns, "
           "glowing ember-orange eye sockets, expressive jaw, tall high-collared robe in deep crimson and charcoal with tarnished bronze trim, "
           "ornate gauntlets, a staff topped with a floating cracked green crystal, dramatic and slightly comedic villain charisma, photorealistic, "
           "as if a real actor in high-end prosthetic makeup, sitting in a gothic streaming lair, leaning toward a broadcast microphone on a boom arm, "
           "three monitors glowing with chat feeds and a world map covered in red conquest markers, candlelight mixed with RGB rim light, "
           "ring light reflected in the eye sockets, shallow depth of field, 35mm cinematic still, film grain, moody volumetric haze")

jobs = []
for s, sd in STYLES.items():
    for a, ad in ASSETS.items():
        jobs.append((f"preset-{s}-{a}", f"{ad}. Art style: {sd}. {TAIL}"))
jobs.append(("malakor-lair-wide", MALAKOR + ". Wide 16:9 landscape composition. No readable text anywhere."))
jobs.append(("malakor-facecam", MALAKOR + ". Framed like a real streamer's webcam: chest-up, looking straight into the camera lens mid-sentence, one gauntleted hand raised theatrically. No readable text anywhere."))
jobs.append(("malakor-laugh", MALAKOR + ". He throws his head back in a triumphant villain laugh while pointing at the conquest map monitor. Wide 16:9 landscape composition. No readable text anywhere."))
jobs.append(("scene-warmap", "A screenshot of an original dark fantasy grand strategy game: a top-down painted map of a mortal realm with hex regions, rivers and forests, red conquest banners spreading from a black obsidian spire in one corner, fog of war at the edges, cinematic lighting. Wide 16:9 landscape. No user interface, no readable text."))
jobs.append(("scene-throne", "A gothic throne room set used as a livestream background: an obsidian throne, tall candelabras, crimson banners, a huge wall map with red conquest markers, moody volumetric haze, photorealistic. Wide 16:9 landscape. No people, no readable text."))

with open("jobs.tsv", "w", encoding="utf-8", newline="\n") as f:
    for n, p in jobs:
        f.write(f"{n}\t{p}\n")
print(len(jobs))
