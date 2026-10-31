"""jobs-frames3.tsv: round-three cam frames (owner 2026-10-31: Heraldic and Storybook frame2 fit;
Cel and Glass have good width but the scope does not fit; Arcade and Neon are too thick)."""
from gen_jobs import STYLES, TAIL

ROUND3 = ["pixel", "synthwave", "anime", "glass"]
SCOPE = ("the outline runs along the very edge of the image on all four sides, framing one exact 16:9 rectangle, "
         "with the whole inside left completely empty flat black, nothing inside the frame")
VARIANTS = {
    "a": "a minimal webcam frame for a livestream facecam: one single hairline outline only 2 to 3 pixels thick, "
         "a soft even outer glow, no ornaments and no corner pieces",
    "b": "a minimal webcam frame for a livestream facecam: two parallel hairlines only 2 pixels thick with a small gap, "
         "and tiny restrained accents at the four corners no larger than the line spacing",
}
with open("jobs-frames3.tsv", "w", encoding="utf-8", newline="\n") as f:
    for s in ROUND3:
        for v, desc in VARIANTS.items():
            f.write(f"preset-{s}-frame3{v}\t{desc}, {SCOPE}. Wide 16:9 landscape composition. "
                    f"Art style: {STYLES[s]}, kept extremely thin and subtle. {TAIL}\n")
print(len(ROUND3) * len(VARIANTS))
