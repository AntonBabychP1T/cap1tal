"""The cap1tal wordmark: geometric letterforms built from circles, rectangles and one wedge.

Design units: y is up, baseline at y = 0, origin at the left edge of the first glyph.
The word is drawn in two layers — the p1t accent and the ca…al that surrounds it — so a
caller can paint the accent bright and let the rest recede. At icon sizes the recessive
letters fall away first, which leaves the original p1t mark as what the eye keeps.
"""

import math

from PIL import Image, ImageDraw

DEFAULTS = dict(
    s=80,        # stroke of the round letters, p, t and l
    s1=92,       # stroke of the 1 — a touch heavier, so the figure holds its own
    xh=300,      # x-height; the round letters are exactly this wide
    desc=196,    # how far the p's stem drops below the baseline
    asc=436,     # ascender of t and l; the 1 matches it
    flag_dx=100, # how far the 1's flag reaches left
    flag_dy=128, # and how far it drops
    flag_t=0,    # 0 = solid wedge; > 0 = vertical thickness of a thin diagonal flag
    cb_l=68,     # crossbar overhang left of the t's stem
    cb_r=78,     # and right — a hair more, so the t does not read as a cross
    c_open=42,   # half-angle of the c's aperture, in degrees; its terminals cut radially
    tangent=True,  # p stem joins the bowl at its widest point, leaving no notch
)

# The white between each adjacent pair, in design units. "p1" and "1t" are the letterfit
# of the original p1t mark and must not move; the rest are set by eye to the same rhythm.
# The t hands the next letter the void under its crossbar, so "ta" is set tight and "ap"
# wide to keep the same air on both flanks of the accent.
GAPS = {"ca": 26, "ap": 62, "p1": 28, "1t": 20, "ta": 26, "al": 52, "pa": 52}
DEFAULT_GAP = 44

# Each layout is a list of lines. A line names its text, the letters that carry the accent,
# the line's size relative to the accent, and `small` — the size of its own non-accent
# letters, which is how the accent is made to tower over the ca…al on a shared baseline.
NONE = slice(0, 0)
LAYOUTS = {
    "line": [dict(text="cap1tal", accent=slice(2, 5))],
    "small": [dict(text="cap1tal", accent=slice(2, 5), small=0.66)],
    "stack2": [dict(text="ca", size=0.70), dict(text="p1tal", accent=slice(0, 3))],
    "stack3": [dict(text="ca", size=0.62), dict(text="p1t", accent=slice(0, 3)),
               dict(text="al", size=0.62)],
}


def glyph(ch, p):
    """(solid, holes, advance width) for one letter, sitting on the baseline at x = 0."""
    s, s1, xh, asc, desc = p["s"], p["s1"], p["xh"], p["asc"], p["desc"]
    r = xh / 2

    if ch == "c":  # the o, with a wedge taken out of its right flank
        th = math.radians(p["c_open"])
        far = 3 * r
        wedge = [(r, r),
                 (r + far * math.cos(th), r + far * math.sin(th)),
                 (r + far * math.cos(-th), r + far * math.sin(-th))]
        return [("circle", (r, r, r))], [("circle", (r, r, r - s)), ("poly", wedge)], 2 * r

    if ch == "a":  # the o with a stem down its right side — the p, mirrored and shortened
        return ([("circle", (r, r, r)), ("rect", (2 * r - s, 0, 2 * r, xh))],
                [("circle", (r, r, r - s))], 2 * r)

    if ch == "p":
        return ([("rect", (0, -desc, s, r if p["tangent"] else xh)), ("circle", (r, r, r))],
                [("circle", (r, r, r - s))], 2 * r)

    if ch == "1":  # origin at the flag's left tip, so the flag's reach is part of the advance
        dx, dy, ft = p["flag_dx"], p["flag_dy"], p["flag_t"]
        flag = ([(dx, asc), (0, asc - dy), (0, asc - dy - ft), (dx, asc - ft)] if ft
                else [(dx, asc), (0, asc - dy), (dx, asc - dy)])
        return [("rect", (dx, 0, dx + s1, asc)), ("poly", flag)], [], dx + s1

    if ch == "t":  # origin at the crossbar's left end
        cl, cr = p["cb_l"], p["cb_r"]
        return ([("rect", (cl, 0, cl + s, asc)), ("rect", (0, xh - s, cl + s + cr, xh))],
                [], cl + s + cr)

    if ch == "l":
        return [("rect", (0, 0, s, asc))], [], s

    raise KeyError(f"no glyph for {ch!r}")


def _placed(items, dx, dy, k=1.0):
    out = []
    for kind, g in items:
        if kind == "rect":
            x0, y0, x1, y1 = g
            out.append(("rect", (dx + x0 * k, dy + y0 * k, dx + x1 * k, dy + y1 * k)))
        elif kind == "circle":
            cx, cy, r = g
            out.append(("circle", (dx + cx * k, dy + cy * k, r * k)))
        else:
            out.append(("poly", [(dx + x * k, dy + y * k) for x, y in g]))
    return out


def _box(items):
    """The bounding box of solid ink. Holes never widen a box, so never pass them here."""
    xs, ys = [], []
    for kind, g in items:
        if kind == "rect":
            xs += [g[0], g[2]]
            ys += [g[1], g[3]]
        elif kind == "circle":
            cx, cy, r = g
            xs += [cx - r, cx + r]
            ys += [cy - r, cy + r]
        else:
            xs += [x for x, _ in g]
            ys += [y for _, y in g]
    return min(xs), min(ys), max(xs), max(ys)


def _line(spec, p):
    """One line of the word: [(is_accent, solid, holes)] plus its advance width.

    Letters outside the accent are set at `small`, on the same baseline — so the accent
    towers over them the way small caps sit beside full ones.
    """
    text = spec["text"]
    accent_at = set(range(*spec.get("accent", NONE).indices(len(text))))
    size = spec.get("size", 1.0)
    sizes = [size if i in accent_at else size * spec.get("small", 1.0) for i in range(len(text))]

    out, pen = [], 0.0
    for i, ch in enumerate(text):
        solid, holes, adv = glyph(ch, p)
        out.append((i in accent_at, _placed(solid, pen, 0, sizes[i]), _placed(holes, pen, 0, sizes[i])))
        pen += adv * sizes[i]
        if i + 1 < len(text):  # the fit between two letters follows whichever of them is smaller
            pen += GAPS.get(ch + text[i + 1], DEFAULT_GAP) * min(sizes[i], sizes[i + 1])
    return out, pen


def word(layout="line", leading=0.34, **over):
    """The whole lockup: [(is_accent, solid, holes)] in design units, and its ink box."""
    p = {**DEFAULTS, **over}
    spec = LAYOUTS[layout]
    lead = p["xh"] * leading

    lines, top = [], 0.0
    for line in spec:
        placed, width = _line(line, p)
        ink = _box([it for _, solid, _ in placed for it in solid])
        baseline = top - ink[3]           # hang each line's ink top off the running top edge
        lines.append((placed, width, baseline))
        top = baseline + ink[1] - lead

    block = max(width for _, width, _ in lines)
    groups = []
    for placed, width, baseline in lines:
        dx = (block - width) / 2
        for accent, solid, holes in placed:
            groups.append((accent, _placed(solid, dx, baseline), _placed(holes, dx, baseline)))
    return groups, _box([it for _, solid, _ in groups for it in solid])


def _paint(draw, px, items, fill):
    for kind, g in items:
        if kind == "rect":
            x0, y0, x1, y1 = g
            draw.rectangle([px(x0, y1), px(x1, y0)], fill=fill)
        elif kind == "circle":
            cx, cy, r = g
            draw.ellipse([px(cx - r, cy + r), px(cx + r, cy - r)], fill=fill)
        else:
            draw.polygon([px(x, y) for x, y in g], fill=fill)


def render_masks(size, fit, layout="line", supersample=4, nudge=(0.0, 0.0), **over):
    """(accent, rest) — two white-on-black masks of the word, sharing one transform.

    `fit` is the fraction of the canvas the lockup fills along its longer side — a wide
    line is held by its width, a stack by its height; `nudge` shifts both masks by
    fractions of the canvas, for optical centring.
    """
    groups, box = word(layout, **over)
    ss = size * supersample
    bw, bh = box[2] - box[0], box[3] - box[1]
    scale = (ss * fit) / max(bw, bh)
    ox = (ss - bw * scale) / 2 - box[0] * scale
    oy = (ss - bh * scale) / 2 + box[3] * scale

    def px(x, y):
        return (ox + x * scale, oy - y * scale)

    imgs = {True: Image.new("L", (ss, ss), 0), False: Image.new("L", (ss, ss), 0)}
    draws = {k: ImageDraw.Draw(v) for k, v in imgs.items()}
    for accent, solid, holes in groups:      # per glyph, so one letter's counter never eats the next
        _paint(draws[accent], px, solid, 255)
        _paint(draws[accent], px, holes, 0)

    ink = _union(imgs[True].getbbox(), imgs[False].getbbox())
    if ink:  # re-centre on what was actually drawn, then apply the optical nudge
        dx = (ss - (ink[0] + ink[2])) / 2 + nudge[0] * ss
        dy = (ss - (ink[1] + ink[3])) / 2 + nudge[1] * ss
        imgs = {k: v.transform(v.size, Image.AFFINE, (1, 0, -dx, 0, 1, -dy), Image.BILINEAR)
                for k, v in imgs.items()}
    return imgs[True].resize((size, size), Image.LANCZOS), imgs[False].resize((size, size), Image.LANCZOS)


def _union(a, b):
    if a is None or b is None:
        return a or b
    return min(a[0], b[0]), min(a[1], b[1]), max(a[2], b[2]), max(a[3], b[3])


def render_masks_in_circle(size, circle_frac, layout="line", supersample=4, **over):
    """The word scaled so its ink fits inside a centred circle of `circle_frac` diameter.

    Android masks an adaptive icon down to a circle; sizing by the bounding box would
    push the lockup's ends outside it, so measure the ink's true reach instead.
    """
    import numpy as np

    probe = 0.5
    a, b = render_masks(size, probe, layout, supersample=supersample, **over)
    both = np.maximum(np.asarray(a, dtype=np.float64), np.asarray(b, dtype=np.float64))
    ys, xs = np.nonzero(both > 8)
    c = (size - 1) / 2
    reach = np.sqrt((xs - c) ** 2 + (ys - c) ** 2).max()
    return render_masks(size, probe * (circle_frac * size / 2) / reach, layout,
                        supersample=supersample, **over)
