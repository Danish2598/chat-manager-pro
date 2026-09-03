"""
Generates icons/icon-{16,48,128}.png with no third-party dependencies.

Renders once at 768x768 (divisible by 16, 48 and 128) and box-downsamples,
which gives clean antialiasing without PIL. Re-run after editing the design.
"""
import math, struct, zlib, os

SS = 768          # supersample canvas
U = SS / 128.0    # design units -> canvas pixels

# Neutral blue. Deliberately not any vendor's brand colour.
BG   = (0x3B, 0x6F, 0xD4)
WHITE = (0xFF, 0xFF, 0xFF)

canvas = [[(0, 0, 0, 0.0) for _ in range(SS)] for _ in range(SS)]


def blend(x, y, rgb, a):
    if a <= 0:
        return
    r0, g0, b0, a0 = canvas[y][x]
    a1 = a + a0 * (1 - a)
    if a1 == 0:
        return
    r = (rgb[0] * a + r0 * a0 * (1 - a)) / a1
    g = (rgb[1] * a + g0 * a0 * (1 - a)) / a1
    b = (rgb[2] * a + b0 * a0 * (1 - a)) / a1
    canvas[y][x] = (r, g, b, a1)


def rounded_rect(x0, y0, x1, y1, rad, rgb, alpha=1.0, inset=None):
    """Filled rounded rect in design units. `inset` draws an outline of that width."""
    px0, py0 = int(x0 * U) - 2, int(y0 * U) - 2
    px1, py1 = math.ceil(x1 * U) + 2, math.ceil(y1 * U) + 2
    for py in range(max(0, py0), min(SS, py1)):
        for px in range(max(0, px0), min(SS, px1)):
            # sample at pixel centre, in design units
            ux, uy = (px + 0.5) / U, (py + 0.5) / U
            d = _rr_dist(ux, uy, x0, y0, x1, y1, rad)
            if inset is None:
                cov = _cov(d)
            else:
                cov = min(_cov(d), _cov(-(d + inset)))
            blend(px, py, rgb, cov * alpha)


def _rr_dist(x, y, x0, y0, x1, y1, rad):
    """Signed distance to a rounded rect; negative inside."""
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    hw, hh = (x1 - x0) / 2 - rad, (y1 - y0) / 2 - rad
    dx, dy = abs(x - cx) - hw, abs(y - cy) - hh
    ox, oy = max(dx, 0), max(dy, 0)
    return math.hypot(ox, oy) + min(max(dx, dy), 0) - rad


def _cov(d):
    """Antialiased coverage from a signed distance (design units)."""
    edge = 0.75 / U * U  # ~0.75 design-unit feather
    edge = 0.7
    return min(1.0, max(0.0, 0.5 - d / edge))


def thick_line(pts, width, rgb, alpha=1.0):
    """Polyline with round joins, in design units."""
    half = width / 2
    xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
    px0, py0 = int((min(xs) - width) * U), int((min(ys) - width) * U)
    px1, py1 = math.ceil((max(xs) + width) * U), math.ceil((max(ys) + width) * U)
    for py in range(max(0, py0), min(SS, py1)):
        for px in range(max(0, px0), min(SS, px1)):
            ux, uy = (px + 0.5) / U, (py + 0.5) / U
            d = min(_seg_dist(ux, uy, pts[i], pts[i + 1]) for i in range(len(pts) - 1))
            blend(px, py, rgb, _cov(d - half) * alpha)


def _seg_dist(x, y, a, b):
    ax, ay = a; bx, by = b
    vx, vy = bx - ax, by - ay
    wx, wy = x - ax, y - ay
    L = vx * vx + vy * vy
    t = 0 if L == 0 else max(0, min(1, (wx * vx + wy * vy) / L))
    return math.hypot(x - (ax + vx * t), y - (ay + vy * t))


# ---- the design -----------------------------------------------------------
rounded_rect(0, 0, 128, 128, 28, BG)                       # tile

rows = [(40, True), (64, True), (88, False)]               # y centre, checked
for cy, checked in rows:
    if checked:
        rounded_rect(22, cy - 9, 40, cy + 9, 5, WHITE)
        thick_line([(26.5, cy + 0.5), (29.5, cy + 4.0), (35.5, cy - 4.5)], 3.2, BG)
    else:
        rounded_rect(22, cy - 9, 40, cy + 9, 5, WHITE, alpha=0.75, inset=2.6)
    rounded_rect(48, cy - 4.5, 106, cy + 4.5, 4.5, WHITE, alpha=0.95 if checked else 0.6)


# ---- downsample + write ---------------------------------------------------
def write_png(path, size):
    factor = SS // size
    rows_out = []
    for oy in range(size):
        row = bytearray([0])  # filter type 0
        for ox in range(size):
            r = g = b = a = 0.0
            for sy in range(oy * factor, (oy + 1) * factor):
                for sx in range(ox * factor, (ox + 1) * factor):
                    cr, cg, cb, ca = canvas[sy][sx]
                    r += cr * ca; g += cg * ca; b += cb * ca; a += ca
            n = factor * factor
            if a > 0:
                row += bytes((round(r / a), round(g / a), round(b / a), round(a / n * 255)))
            else:
                row += b"\x00\x00\x00\x00"
        rows_out.append(bytes(row))

    raw = b"".join(rows_out)

    def chunk(tag, data):
        c = struct.pack(">I", len(data)) + tag + data
        return c + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    png = (b"\x89PNG\r\n\x1a\n"
           + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
           + chunk(b"IDAT", zlib.compress(raw, 9))
           + chunk(b"IEND", b""))
    with open(path, "wb") as f:
        f.write(png)
    print(f"{path}  {size}x{size}  {len(png)} bytes")


os.makedirs("icons", exist_ok=True)
for s in (16, 48, 128):
    write_png(f"icons/icon-{s}.png", s)
