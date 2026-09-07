"""Every icon asset, generated from the one wordmark.

    python3 scripts/icon/build.py [variant] [layout]
    python3 scripts/icon/build.py --preview          # contact sheet of every layout

`variant` is a key of VARIANTS below and `layout` a key of mark.LAYOUTS — "a" and "line"
are what the app ships. Re-runnable and deterministic: it overwrites the six files in
OUTPUTS and nothing else. Needs numpy and Pillow, which is why it is a script and not
part of `npm run verify`.
"""

import sys

import numpy as np
from PIL import Image

from mark import render_masks, render_masks_in_circle

# The 1's flag, settled by eye at icon sizes — long enough to never read as an i.
GEOM = dict(flag_dx=112, flag_dy=150)

# How far the ca…al recedes behind the p1t. Low enough that the accent is what survives
# at 48 px, high enough that the whole word is still readable on the home screen.
DIM = 0.38

# Android masks an adaptive icon to at least a 66/108 = 0.61 circle; keep the ink inside
# that, with a margin. A wide word is held by its ends, so it needs more of the circle
# than the near-square p1t block did.
SAFE_CIRCLE = 0.56
# How much of an unmasked square tile (iOS, favicon) the lockup fills along its longer side.
FIT = {"line": 0.92, "small": 0.88, "stack2": 0.82, "stack3": 0.80}


def hex_rgb(h):
    h = h.lstrip("#")
    return np.array([int(h[i : i + 2], 16) for i in (0, 2, 4)], dtype=np.float64)


def solid(size, c):
    return np.broadcast_to(hex_rgb(c), (size, size, 3)).copy()


def diagonal(size, c0, c1):
    x = np.linspace(0, 1, size)[None, :]
    y = np.linspace(0, 1, size)[:, None]
    t = ((x + y) / 2)[..., None]
    return hex_rgb(c0) * (1 - t) + hex_rgb(c1) * t


def radial(size, base, glow, cx=0.34, cy=0.28, radius=0.95):
    """`base` lifted by a soft off-centre glow — keeps the tile from reading as flat void."""
    yy, xx = np.mgrid[0:size, 0:size] / (size - 1)
    d = np.sqrt(((xx - cx) / radius) ** 2 + ((yy - cy) / radius) ** 2)
    t = (np.clip(1 - d, 0, 1) ** 2)[..., None]
    return hex_rgb(base) * (1 - t) + hex_rgb(glow) * t


# ground(size) -> HxWx3, mark(size) -> HxWx3
VARIANTS = {
    "a": {
        "name": "«Вохра на графіті»",
        "ground": lambda n: radial(n, "#000000", "#1A1610"),
        "mark": lambda n: diagonal(n, "#EDC069", "#BE821F"),
        "flat_ground": "#000000",
        "flat_mark": "#D9A441",
    },
    "b": {
        "name": "«Вохрова плита»",
        "ground": lambda n: radial(n, "#C68C2C", "#E6B75E", cx=0.30, cy=0.24),
        "mark": lambda n: solid(n, "#12100C"),
        "flat_ground": "#C68C2C",
        "flat_mark": "#12100C",
    },
    "c": {
        "name": "«Плоска»",
        "ground": lambda n: solid(n, "#000000"),
        "mark": lambda n: solid(n, "#D9A441"),
        "flat_ground": "#000000",
        "flat_mark": "#D9A441",
    },
}


def over(ground, layers):
    """`layers` are (mask, rgb, opacity), painted onto `ground` in order."""
    out = np.array(ground, dtype=np.float64, copy=True)
    for mask, rgb, opacity in layers:
        a = (np.asarray(mask, dtype=np.float64) / 255 * opacity)[..., None]
        out = out * (1 - a) + rgb * a
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), "RGB")


def masks(size, layout, circle=None):
    if circle:
        return render_masks_in_circle(size, circle, layout, **GEOM)
    return render_masks(size, FIT[layout], layout, **GEOM)


def tile(v, size, layout, circle=None):
    accent, rest = masks(size, layout, circle)
    paint = v["mark"](size)
    return over(v["ground"](size), [(rest, paint, DIM), (accent, paint, 1.0)])


def rgba_mark(size, layout, paint, circle=None):
    """The wordmark alone on transparency. `paint` is a hex string or a size-aware callable."""
    accent, rest = masks(size, layout, circle)
    alpha = np.maximum(np.asarray(accent, dtype=np.float64),
                       np.asarray(rest, dtype=np.float64) * DIM)
    rgb = paint(size) if callable(paint) else np.broadcast_to(hex_rgb(paint), (size, size, 3))
    return Image.fromarray(np.clip(np.dstack([rgb, alpha]), 0, 255).astype(np.uint8), "RGBA")


def ground_image(v, size):
    return Image.fromarray(np.clip(v["ground"](size), 0, 255).astype(np.uint8), "RGB")


# Every asset the app ships, and how it is built. Sizes match what Expo's template used.
OUTPUTS = [
    ("assets/images/icon.png", lambda v, L: tile(v, 1024, L)),
    ("assets/images/favicon.png", lambda v, L: tile(v, 48, L)),
    ("assets/images/android-icon-background.png", lambda v, L: ground_image(v, 512)),
    ("assets/images/android-icon-foreground.png", lambda v, L: rgba_mark(512, L, v["mark"], circle=SAFE_CIRCLE)),
    ("assets/images/android-icon-monochrome.png", lambda v, L: rgba_mark(432, L, "#FFFFFF", circle=SAFE_CIRCLE)),
    ("assets/expo.icon/Assets/cap1tal-mark.png", lambda v, L: rgba_mark(1024, L, v["mark"])),
]


def main(key, layout, root):
    import pathlib

    v = VARIANTS[key]
    for rel, make in OUTPUTS:
        path = pathlib.Path(root) / rel
        make(v, layout).save(path, optimize=True)
        print(f"{rel:52} {path.stat().st_size:>7} B")


def preview(key, root):
    """One sheet per layout: the 1024 tile, the Android circle, and the favicon blown up."""
    import pathlib

    from mark import LAYOUTS

    v = VARIANTS[key]
    cell, pad = 320, 24
    sheet = Image.new("RGB", (cell * 3 + pad * 4, (cell + pad) * len(LAYOUTS) + pad), (26, 26, 26))
    for row, layout in enumerate(LAYOUTS):
        y = pad + row * (cell + pad)
        shots = [
            tile(v, 512, layout).resize((cell, cell), Image.LANCZOS),
            circle_preview(v, layout, cell),
            tile(v, 48, layout).resize((cell, cell), Image.NEAREST),
        ]
        for col, im in enumerate(shots):
            sheet.paste(im, (pad + col * (cell + pad), y))
    out = pathlib.Path(root) / "icon-preview.png"
    sheet.save(out)
    print(out)


def circle_preview(v, layout, size):
    """What Android shows: the adaptive layers, masked to the launcher's circle."""
    im = over(v["ground"](size), []).copy()
    accent, rest = masks(size, layout, SAFE_CIRCLE)
    paint = v["mark"](size)
    im = over(v["ground"](size), [(rest, paint, DIM), (accent, paint, 1.0)])
    a = np.asarray(im, dtype=np.float64)
    yy, xx = np.mgrid[0:size, 0:size] / (size - 1)
    d = np.sqrt((xx - 0.5) ** 2 + (yy - 0.5) ** 2)
    m = np.clip((0.5 - d) * size / 2, 0, 1)[..., None]
    return Image.fromarray(np.clip(a * m + 26 * (1 - m), 0, 255).astype(np.uint8), "RGB")


if __name__ == "__main__":
    import pathlib

    root = pathlib.Path(__file__).resolve().parents[2]
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if "--preview" in sys.argv:
        preview(args[0] if args else "a", root)
    else:
        main(args[0] if args else "a", args[1] if len(args) > 1 else "line", root)
