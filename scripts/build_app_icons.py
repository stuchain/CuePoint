#!/usr/bin/env python3

"""Build the app's icon files from the approved pixel-mark SVGs (DIST-09).

Standard library only. The sources are ``mark-N.svg`` (N = 16, 24, 32, 48, 64),
each one ``<rect>`` per opaque pixel. Sizes 16..64 come from their own grid; the
larger sizes are the 64 grid scaled nearest-neighbour by an integer factor.

The macOS icon (``icon.icns``) is a separate variant: macOS 26 draws any app icon
that is not the native rounded-square shape inside a grey rounded "jail", and the
square pixel tile is full-bleed. So the Mac variant is the violet tile reshaped to
the macOS rounded square (transparent margin, no outline or shadow) with the pixel
Camelot wheel inside. Windows and Linux files keep the square tile unchanged.

Outputs (under ``apps/desktop-electron/build``): ``icon.ico``, ``icon.icns``,
``icon.png`` (512) and ``icons/<size>x<size>.png`` for Linux. The bytes are
deterministic, so ``--check`` can compare the committed files with the sources.

    python scripts/build_app_icons.py          # write the files
    python scripts/build_app_icons.py --check  # exit 1 if any is missing/stale
"""

from __future__ import annotations

import argparse
import re
import struct
import sys
import xml.etree.ElementTree as ET
import zlib
from collections.abc import Sequence
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE_DIR = REPO_ROOT / "apps" / "desktop-electron" / "build" / "icon-source"
DEFAULT_OUT_DIR = REPO_ROOT / "apps" / "desktop-electron" / "build"

SOURCE_SIZES = (16, 24, 32, 48, 64)
SCALED_SIZES = (128, 256, 512, 1024)
ICO_SIZES = (16, 24, 32, 48, 64, 128, 256)
LINUX_SIZES = (16, 24, 32, 48, 64, 128, 256, 512)
# OSType -> pixel size
ICNS_TYPES = (
    ("icp4", 16),
    ("icp5", 32),
    ("icp6", 64),
    ("ic07", 128),
    ("ic08", 256),
    ("ic09", 512),
    ("ic10", 1024),
    ("ic11", 32),
    ("ic12", 64),
    ("ic13", 256),
    ("ic14", 512),
)

Pixel = tuple  # (r, g, b, a)
Grid = list[list[Pixel]]

_TRANSPARENT = (0, 0, 0, 0)

MAC_SIZES = (16, 32, 64, 128, 256, 512, 1024)
_TILE = (139, 92, 246)  # #8b5cf6
_BAND_LIGHT = (167, 139, 250)  # #a78bfa
_BAND_DARK = (109, 40, 217)  # #6d28d9
_VIOLET = frozenset({_TILE, _BAND_LIGHT, _BAND_DARK})
_TILE_COLOURS = frozenset({_TILE, _BAND_LIGHT, _BAND_DARK, (0, 0, 0)})
_MAC_RADIUS = 0.2237
_MAC_WHEEL_TARGET = 0.62
_MAC_WHEEL_TOLERANCE = 0.15


def parse_svg(text: str) -> Grid:
    """Parse a mark SVG into an N x N grid of RGBA tuples (rows of pixels).

    Strict: the only child elements are 1x1 ``<rect>``s with an opaque
    ``#rrggbb`` fill, each at a unique in-bounds (x, y).
    """
    root = ET.fromstring(text)
    parts = root.attrib["viewBox"].split()
    size = int(parts[2])
    if int(parts[3]) != size:
        raise ValueError("mark SVG must be square")
    grid: Grid = [[_TRANSPARENT] * size for _ in range(size)]
    seen: set[tuple[int, int]] = set()
    for el in root:
        if el.tag.rsplit("}", 1)[-1] != "rect":
            raise ValueError(f"unexpected element <{el.tag}>")
        if len(el):
            raise ValueError("rect must not have children")
        attrs = el.attrib
        if "opacity" in attrs or "fill-opacity" in attrs:
            raise ValueError("opacity is not allowed; pixels are opaque")
        if attrs.get("width") != "1" or attrs.get("height") != "1":
            raise ValueError("every rect must have width == height == '1'")
        x, y = int(attrs["x"]), int(attrs["y"])
        if not (0 <= x < size and 0 <= y < size):
            raise ValueError(f"rect x={x} y={y} is outside the viewBox")
        if (x, y) in seen:
            raise ValueError(f"duplicate rect at x={x} y={y}")
        seen.add((x, y))
        fill = attrs.get("fill", "")
        if not re.fullmatch(r"#[0-9a-fA-F]{6}", fill):
            raise ValueError(f"bad fill {fill!r} at x={x} y={y}")
        grid[y][x] = (int(fill[1:3], 16), int(fill[3:5], 16), int(fill[5:7], 16), 255)
    return grid


def scale_grid(grid: Grid, factor: int) -> Grid:
    """Nearest-neighbour scale by an integer factor."""
    out: Grid = []
    for row in grid:
        wide = [px for px in row for _ in range(factor)]
        out.extend([list(wide) for _ in range(factor)])
    return out


def _is_wheel_colour(px: Pixel) -> bool:
    return px[3] == 255 and px[:3] not in _TILE_COLOURS


def wheel_crop(grid: Grid) -> Grid:
    """The wheel's bounding box, including its own black ring.

    The wheel is every opaque non-tile-colour pixel plus the black pixels
    8-connected to it through black (its ring); the tile's black outline is not
    connected to the wheel, so it stays out.
    """
    size = len(grid)
    seen = {
        (x, y) for y in range(size) for x in range(size) if _is_wheel_colour(grid[y][x])
    }
    stack = list(seen)
    while stack:
        x, y = stack.pop()
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                nx, ny = x + dx, y + dy
                if (
                    0 <= nx < size
                    and 0 <= ny < size
                    and (nx, ny) not in seen
                    and grid[ny][nx] == (0, 0, 0, 255)
                ):
                    seen.add((nx, ny))
                    stack.append((nx, ny))
    x0, x1 = min(x for x, _ in seen), max(x for x, _ in seen)
    y0, y1 = min(y for _, y in seen), max(y for _, y in seen)
    return [row[x0 : x1 + 1] for row in grid[y0 : y1 + 1]]


def pick_wheel(size: int, widths: dict[int, int]) -> tuple[int, int]:
    """Choose (source grid n, integer scale k) for the wheel on a Mac icon."""
    margin = size * 100 // 1024
    body = size - 2 * margin
    band = max(1, round(body / 14))
    room = body - 2 * band
    target = _MAC_WHEEL_TARGET * size
    fitting: list[tuple[float, int, int]] = []
    for n in sorted(widths, reverse=True):
        w = widths[n]
        ks = [k for k in range(1, room // w + 1)]
        if not ks:
            continue
        k = min(ks, key=lambda k: abs(k * w - target))
        diff = abs(k * w - target)
        if diff <= _MAC_WHEEL_TOLERANCE * target:
            return n, k
        fitting.append((diff, n, k))
    if not fitting:
        raise ValueError(f"no mark's wheel fits a {size} px Mac icon")
    _, n, k = min(fitting, key=lambda t: t[0])  # stable: largest n wins ties
    return n, k


def mac_grid(size: int, source_grids: dict[int, Grid]) -> Grid:
    """The macOS icon: violet rounded-square tile with the pixel wheel inside."""
    margin = size * 100 // 1024
    body = size - 2 * margin
    band = max(1, round(body / 14))
    radius = body * _MAC_RADIUS
    centre = margin + body / 2
    inner = body / 2 - radius
    crops = {n: wheel_crop(source_grids[n]) for n in SOURCE_SIZES}
    n, k = pick_wheel(size, {n: len(c[0]) for n, c in crops.items()})

    def inside(x: float, y: float) -> bool:
        dx = max(abs(x - centre) - inner, 0.0)
        dy = max(abs(y - centre) - inner, 0.0)
        return margin <= x < margin + body and (
            margin <= y < margin + body and dx * dx + dy * dy <= radius * radius
        )

    grid: Grid = [[_TRANSPARENT] * size for _ in range(size)]
    for y in range(size):
        if y < margin + band:
            rgb = _BAND_LIGHT
        elif y >= size - margin - band:
            rgb = _BAND_DARK
        else:
            rgb = _TILE
        for x in range(size):
            hits = sum(
                inside(x + 0.125 + 0.25 * a, y + 0.125 + 0.25 * b)
                for a in range(4)
                for b in range(4)
            )
            if hits:
                grid[y][x] = (*rgb, round(255 * hits / 16))
    crop = crops[n]
    if len(crop) != len(crop[0]):
        raise ValueError(f"mark-{n}.svg's wheel is not square")
    left = (size - k * len(crop[0])) // 2
    for cy, row in enumerate(crop):
        for cx, px in enumerate(row):
            if px[3] == 255 and px[:3] not in _VIOLET:
                for dy in range(k):
                    for dx in range(k):
                        grid[left + cy * k + dy][left + cx * k + dx] = px
    return grid


def _chunk(kind: bytes, data: bytes) -> bytes:
    body = kind + data
    return (
        struct.pack(">I", len(data))
        + body
        + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)
    )


def encode_png(grid: Grid) -> bytes:
    """Minimal RGBA 8-bit PNG: filter 0, zlib level 9, IHDR/IDAT/IEND only."""
    height = len(grid)
    width = len(grid[0])
    raw = bytearray()
    for row in grid:
        raw.append(0)
        for r, g, b, a in row:
            raw += bytes((r, g, b, a))
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    return (
        b"\x89PNG\r\n\x1a\n"
        + _chunk(b"IHDR", ihdr)
        + _chunk(b"IDAT", zlib.compress(bytes(raw), 9))
        + _chunk(b"IEND", b"")
    )


def encode_ico(pngs: Sequence[tuple]) -> bytes:
    """ICO with PNG-compressed entries; ``pngs`` is (size, png_bytes) pairs."""
    header = struct.pack("<HHH", 0, 1, len(pngs))
    offset = 6 + 16 * len(pngs)
    entries = b""
    data = b""
    for size, png in pngs:
        dim = 0 if size >= 256 else size
        entries += struct.pack(
            "<BBBBHHII", dim, dim, 0, 0, 1, 32, len(png), offset + len(data)
        )
        data += png
    return header + entries + data


def encode_icns(entries: Sequence[tuple]) -> bytes:
    """ICNS from (ostype, png_bytes) pairs."""
    body = b"".join(
        ostype.encode("ascii") + struct.pack(">I", 8 + len(png)) + png
        for ostype, png in entries
    )
    return b"icns" + struct.pack(">I", 8 + len(body)) + body


def load_grids(source_dir: Path) -> dict[int, Grid]:
    """Grids for every output size."""
    grids: dict[int, Grid] = {}
    for n in SOURCE_SIZES:
        grids[n] = parse_svg((source_dir / f"mark-{n}.svg").read_text(encoding="utf-8"))
        if len(grids[n]) != n:
            raise ValueError(f"mark-{n}.svg is not {n}x{n}")
    for n in SCALED_SIZES:
        grids[n] = scale_grid(grids[64], n // 64)
    return grids


def build_outputs(source_dir: Path = DEFAULT_SOURCE_DIR) -> dict[str, bytes]:
    """Every output file as {path relative to the out dir: bytes}."""
    grids = load_grids(Path(source_dir))
    pngs = {n: encode_png(g) for n, g in grids.items()}
    mac_pngs = {n: encode_png(mac_grid(n, grids)) for n in MAC_SIZES}
    outputs: dict[str, bytes] = {
        "icon.ico": encode_ico([(n, pngs[n]) for n in ICO_SIZES]),
        "icon.icns": encode_icns([(t, mac_pngs[n]) for t, n in ICNS_TYPES]),
        "icon.png": pngs[512],
    }
    for n in LINUX_SIZES:
        outputs[f"icons/{n}x{n}.png"] = pngs[n]
    return outputs


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument(
        "--check", action="store_true", help="verify files; write nothing"
    )
    parser.add_argument("--source-dir", type=Path, default=DEFAULT_SOURCE_DIR)
    parser.add_argument("--out-dir", type=Path, default=DEFAULT_OUT_DIR)
    args = parser.parse_args(argv)

    outputs = build_outputs(args.source_dir)
    if args.check:
        bad = []
        for rel, data in sorted(outputs.items()):
            path = args.out_dir / rel
            if not path.is_file():
                bad.append(f"  missing: {rel}")
            elif path.read_bytes() != data:
                bad.append(f"  differs from the sources: {rel}")
        if bad:
            print("App icons are out of date:\n" + "\n".join(bad), file=sys.stderr)
            print("Run: python scripts/build_app_icons.py", file=sys.stderr)
            return 1
        print(f"App icons match their sources ({len(outputs)} files).")
        return 0

    for rel, data in outputs.items():
        path = args.out_dir / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
    print(f"Wrote {len(outputs)} icon files to {args.out_dir}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
