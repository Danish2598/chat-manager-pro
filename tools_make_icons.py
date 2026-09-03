"""
Generates icons/icon-{16,48,128}.png with no third-party dependencies.

Design: a speech bubble in white on an indigo-to-violet gradient tile, with a
checkmark knocked out of the bubble so the gradient shows through it. Chat plus
selection, in one silhouette that still reads at 16px.

Renders once at 768x768 (divisible by 16, 48 and 128) and box-downsamples for
clean antialiasing without PIL. Re-run after editing.
"""
import math, struct, zlib, os

SS = 768           # supersample canvas
U = SS / 128.0     # design units -> canvas pixels

# Neutral indigo -> violet. Deliberately not any AI vendor's brand colour.
TOP = (0x52, 0x4A, 0xE8)
BOTTOM = (0x86, 0x3C, 0xD8)
WHITE = (0xFF, 0xFF, 0xFF)

canvas = [[(0, 0, 0, 0.0) for _ in range(SS)] for _ in range(SS)]


def gradient_at(py):
    """Vertical gradient colour for a canvas row."""
    t = py / (SS - 1)
    return tuple(round(TOP[i] + (BOTTOM[i] - TOP[i]) * t) for i in range(3))


def blend(px, py, rgb, a):
    if a <= 0:
        return
    r0, g0, b0, a0 = canvas[py][px]
    a1 = a + a0 * (1 - a)
    if a1 == 0:
        return
    canvas[py][px] = (
        (rgb[0] * a + r0 * a0 * (1 - a)) / a1,
        (rgb[1] * a + g0 * a0 * (1 - a)) / a1,
        (rgb[2] * a + b0 * a0 * (1 - a)) / a1,
        a1,
    )


def _cov(d):
    """Antialiased coverage from a signed distance, in design units."""
    return min(1.0, max(0.0, 0.5 - d / 0.7))


def _rr_dist(x, y, x0, y0, x1, y1, rad):
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    hw, hh = (x1 - x0) / 2 - rad, (y1 - y0) / 2 - rad
    dx, dy = abs(x - cx) - hw, abs(y - cy) - hh
    return math.hypot(max(dx, 0), max(dy, 0)) + min(max(dx, dy), 0) - rad


def rounded_rect(x0, y0, x1, y1, rad, colour, alpha=1.0):
    """colour may be an (r,g,b) tuple or a function of the canvas row."""
    for py in range(max(0, int(y0 * U) - 2), min(SS, math.ceil(y1 * U) + 2)):
        rgb = colour(py) if callable(colour) else colour
        for px in range(max(0, int(x0 * U) - 2), min(SS, math.ceil(x1 * U) + 2)):
            d = _rr_dist((px + 0.5) / U, (py + 0.5) / U, x0, y0, x1, y1, rad)
            blend(px, py, rgb, _cov(d) * alpha)


def _seg_dist(x, y, a, b):
    vx, vy = b[0] - a[0], b[1] - a[1]
    wx, wy = x - a[0], y - a[1]
    L = vx * vx + vy * vy
    t = 0 if L == 0 else max(0, min(1, (wx * vx + wy * vy) / L))
    return math.hypot(x - (a[0] + vx * t), y - (a[1] + vy * t))


def thick_line(pts, width, colour):
    half = width / 2
    xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
    for py in range(max(0, int((min(ys) - width) * U)), min(SS, math.ceil((max(ys) + width) * U))):
        rgb = colour(py) if callable(colour) else colour
        for px in range(max(0, int((min(xs) - width) * U)), min(SS, math.ceil((max(xs) + width) * U))):
            ux, uy = (px + 0.5) / U, (py + 0.5) / U
            d = min(_seg_dist(ux, uy, pts[i], pts[i + 1]) for i in range(len(pts) - 1))
            blend(px, py, rgb, _cov(d - half))


def triangle(p0, p1, p2, colour):
    xs = [p[0] for p in (p0, p1, p2)]; ys = [p[1] for p in (p0, p1, p2)]

    def side(px, py, a, b):
        return (b[0] - a[0]) * (py - a[1]) - (b[1] - a[1]) * (px - a[0])

    for py in range(max(0, int(min(ys) * U) - 2), min(SS, math.ceil(max(ys) * U) + 2)):
        rgb = colour(py) if callable(colour) else colour
        for px in range(max(0, int(min(xs) * U) - 2), min(SS, math.ceil(max(xs) * U) + 2)):
            # 3x3 supersample inside the already-supersampled canvas, for a
            # clean diagonal on the tail.
            hits = 0
            for oy in (0.17, 0.5, 0.83):
                for ox in (0.17, 0.5, 0.83):
                    ux, uy = (px + ox) / U, (py + oy) / U
                    d0 = side(ux, uy, p0, p1)
                    d1 = side(ux, uy, p1, p2)
                    d2 = side(ux, uy, p2, p0)
                    if (d0 >= 0 and d1 >= 0 and d2 >= 0) or (d0 <= 0 and d1 <= 0 and d2 <= 0):
                        hits += 1
            if hits:
                blend(px, py, rgb, hits / 9)


# ---- the design -----------------------------------------------------------
rounded_rect(0, 0, 128, 128, 30, gradient_at)              # gradient tile

triangle((40, 84), (40, 108), (63, 86), WHITE)             # bubble tail
rounded_rect(22, 24, 106, 90, 20, WHITE)                   # bubble body

# Checkmark knocked out of the bubble, so the gradient reads through it.
thick_line([(42, 57), (56, 71), (86, 41)], 12, gradient_at)


# ---- downsample + write ---------------------------------------------------
def write_png(path, size):
    f = SS // size
    rows = []
    for oy in range(size):
        row = bytearray([0])
        for ox in range(size):
            r = g = b = a = 0.0
            for sy in range(oy * f, (oy + 1) * f):
                for sx in range(ox * f, (ox + 1) * f):
                    cr, cg, cb, ca = canvas[sy][sx]
                    r += cr * ca; g += cg * ca; b += cb * ca; a += ca
            if a > 0:
                row += bytes((round(r / a), round(g / a), round(b / a), round(a / (f * f) * 255)))
            else:
                row += b"\x00\x00\x00\x00"
        rows.append(bytes(row))
    raw = b"".join(rows)

    def chunk(tag, data):
        return (struct.pack(">I", len(data)) + tag + data
                + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF))

    png = (b"\x89PNG\r\n\x1a\n"
           + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
           + chunk(b"IDAT", zlib.compress(raw, 9))
           + chunk(b"IEND", b""))
    with open(path, "wb") as fh:
        fh.write(png)
    print(f"{path}  {size}x{size}  {len(png)} bytes")


os.makedirs("icons", exist_ok=True)
for s in (16, 48, 128):
    write_png(f"icons/icon-{s}.png", s)
