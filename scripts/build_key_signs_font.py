#!/usr/bin/env python3
"""Build the flat and sharp signs of the app's pixel font ("CuePoint Digits", key signs).

Pixelify Sans has no U+266D (flat) or U+266F (sharp), so key names such as "A♭ minor" fell back to
another font. This draws both signs from pixel runs on the grid Pixelify Sans uses (a cell is
about 91 units high; its stems are 101 units wide at weight 400 and 127 at 700) and writes one
woff2 per weight. The output is deterministic: fixed timestamps, no random data.

    python scripts/build_key_signs_font.py [--out DIR]

Needs fonttools and brotli (requirements-dev.txt).
"""

from __future__ import annotations

import argparse
from pathlib import Path

from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen

FLAT = 0x266D
SHARP = 0x266F

# Rows run top to bottom; "X" is a filled cell. The flat is as tall as the capitals (7 rows), the
# sharp sits one row up and is 6 rows tall, centred on the capitals.
GLYPHS: dict[int, tuple[str, list[str], int]] = {
    FLAT: (
        "flat",
        [
            "X...",
            "X...",
            "X...",
            "XXX.",
            "X..X",
            "X..X",
            "XXX.",
        ],
        0,
    ),
    SHARP: (
        "sharp",
        [
            ".X.X.",
            "XXXXX",
            ".X.X.",
            ".X.X.",
            "XXXXX",
            ".X.X.",
        ],
        1,
    ),
}

CELL_HEIGHT = 91
# Cell width per weight: the stem width of Pixelify Sans at that weight.
CELL_WIDTH = {400: 101, 700: 127}
# Pixelify Sans' vertical metrics, so the signs sit on the same baseline.
BASELINE = -12
ASCENT = 920
DESCENT = -280
# 2020-01-01T00:00:00Z minus the 1904 epoch fontTools uses: any fixed value keeps the bytes stable.
FIXED_TIMESTAMP = 3660595200


def _runs(row: str) -> list[tuple[int, int]]:
    runs: list[tuple[int, int]] = []
    start: int | None = None
    for i, ch in enumerate(row + "."):
        if ch == "X" and start is None:
            start = i
        elif ch != "X" and start is not None:
            runs.append((start, i))
            start = None
    return runs


def _glyph(rows: list[str], lift: int, cell_w: int, bearing: int):
    pen = TTGlyphPen(None)
    n = len(rows)
    for r, row in enumerate(rows):
        top = BASELINE + (n - r + lift) * CELL_HEIGHT
        bottom = top - CELL_HEIGHT
        for a, b in _runs(row):
            x0, x1 = bearing + a * cell_w, bearing + b * cell_w
            # Clockwise outer contour, the TrueType direction for filled shapes.
            pen.moveTo((x0, bottom))
            pen.lineTo((x0, top))
            pen.lineTo((x1, top))
            pen.lineTo((x1, bottom))
            pen.closePath()
    return pen.glyph()


def build(weight: int, out_dir: Path) -> Path:
    cell_w = CELL_WIDTH[weight]
    bearing = cell_w * 6 // 10
    order = [".notdef"] + [name for name, _, _ in GLYPHS.values()]
    glyphs = {".notdef": TTGlyphPen(None).glyph()}
    metrics = {".notdef": (500, 0)}
    cmap = {}
    for code, (name, rows, lift) in GLYPHS.items():
        cols = max(len(row) for row in rows)
        glyphs[name] = _glyph(rows, lift, cell_w, bearing)
        metrics[name] = (cols * cell_w + 2 * bearing, bearing)
        cmap[code] = name

    fb = FontBuilder(1000, isTTF=True)
    fb.setupGlyphOrder(order)
    fb.setupCharacterMap(cmap)
    fb.setupGlyf(glyphs)
    fb.setupHorizontalMetrics(metrics)
    fb.setupHorizontalHeader(ascent=ASCENT, descent=DESCENT)
    family = "CuePoint Key Signs"
    style = "Bold" if weight == 700 else "Regular"
    fb.setupNameTable(
        {
            "familyName": family,
            "styleName": style,
            "uniqueFontIdentifier": f"{family} {style}",
        }
    )
    fb.setupOS2(
        usWeightClass=weight,
        sTypoAscender=ASCENT,
        sTypoDescender=DESCENT,
        usWinAscent=ASCENT,
        usWinDescent=-DESCENT,
        sCapHeight=700,
        sxHeight=450,
    )
    fb.setupPost()
    fb.font["head"].created = FIXED_TIMESTAMP
    fb.font["head"].modified = FIXED_TIMESTAMP
    fb.font.flavor = "woff2"
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / f"cuepoint-key-signs-{weight}.woff2"
    fb.save(str(path))
    return path


def main() -> int:
    default = (
        Path(__file__).resolve().parent.parent
        / "apps/desktop-electron/renderer/src/assets/fonts"
    )
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=default)
    args = parser.parse_args()
    for weight in CELL_WIDTH:
        print(build(weight, args.out))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
