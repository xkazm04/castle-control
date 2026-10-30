"""img/*.png -> web/*.webp. Presets get the flat black background keyed out
(flood fill from the border, plus the centre for frames), scenes and
Malakor shots are just resized. Prints one line per file."""
import sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

SRC, OUT = Path("img"), Path("web")
OUT.mkdir(exist_ok=True)


def key_black(im: Image.Image, centre: bool) -> Image.Image:
    a = np.asarray(im.convert("RGB")).astype(np.int16)
    border = np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]])
    bgc = np.median(border, axis=0)
    mx = np.abs(a - bgc).max(axis=2)  # distance from the sampled background colour
    dark = mx <= 26
    lab, _ = ndimage.label(dark)
    seeds = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]])))
    if centre:
        h, w = lab.shape
        seeds |= set(np.unique(lab[h // 2 - 8:h // 2 + 8, w // 2 - 8:w // 2 + 8]))
    seeds.discard(0)
    bg = np.isin(lab, list(seeds))
    near = ndimage.binary_dilation(bg, iterations=3) & ~bg
    alpha = np.full(mx.shape, 255, np.uint8)
    alpha[bg] = 0
    soft = near & (mx < 80)
    alpha[soft] = np.clip(mx[soft] * 255 // 80, 0, 255).astype(np.uint8)
    rgba = np.dstack([a.astype(np.uint8), alpha])
    out = Image.fromarray(rgba, "RGBA")
    a2 = out.getchannel("A").filter(ImageFilter.GaussianBlur(0.8))
    out.putalpha(a2)
    return out


for p in sorted(SRC.glob("*.png")):
    dst = OUT / (p.stem + ".webp")
    if dst.exists() and dst.stat().st_mtime > p.stat().st_mtime and "--force" not in sys.argv:
        continue
    im = Image.open(p)
    if p.stem.startswith("preset-"):
        im = im.convert("RGB").resize((640, round(640 * im.height / im.width)), Image.LANCZOS)
        im = key_black(im, centre=p.stem.endswith(("-frame", "-frame2")))
        im.save(dst, "WEBP", quality=84, method=6)
    else:
        w = 1600
        im = im.convert("RGB").resize((w, round(w * im.height / im.width)), Image.LANCZOS)
        im.save(dst, "WEBP", quality=82, method=6)
    print(dst.name, dst.stat().st_size, im.size)
