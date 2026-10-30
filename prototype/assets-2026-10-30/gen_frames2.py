"""jobs-frames2.tsv: thin cam frames for the six kept styles (owner note 2026-10-30:
'Cam frames are often too thick, we will need to design thinner subtle approach enhanced with glow or shadows')."""
from gen_jobs import STYLES, TAIL

KEPT = ["heraldic", "pixel", "synthwave", "watercolor", "anime", "glass"]
BASE = ("a subtle, minimal webcam frame for a livestream facecam: a very thin rectangular 16:9 outline, only a hairline to a few pixels thick, "
        "enhanced by a soft outer glow and a gentle drop shadow, with small restrained accents only at the four corners, "
        "the whole inside left completely empty flat black, the outline hugging the edges of the image")
with open("jobs-frames2.tsv", "w", encoding="utf-8", newline="\n") as f:
    for s in KEPT:
        f.write(f"preset-{s}-frame2\t{BASE}. Art style: {STYLES[s]}. {TAIL}\n")
print(len(KEPT))
