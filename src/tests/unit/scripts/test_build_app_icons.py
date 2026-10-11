"""Tests for scripts/build_app_icons.py (DIST-09).

The committed icon files must be exactly what the approved pixel-mark SVGs give,
and the containers must hold the sizes the platforms need.
"""

from __future__ import annotations

import importlib.util
import re
import shutil
import struct
import sys
import zlib
from pathlib import Path

import pytest

# src/tests/unit/scripts -> 5 levels up
_REPO_ROOT = Path(__file__).resolve().parents[4]
_SCRIPT = _REPO_ROOT / "scripts" / "build_app_icons.py"
_BUILD = _REPO_ROOT / "apps" / "desktop-electron" / "build"
_SOURCE = _BUILD / "icon-source"

_spec = importlib.util.spec_from_file_location("build_app_icons", _SCRIPT)
assert _spec and _spec.loader
icons = importlib.util.module_from_spec(_spec)
sys.modules["build_app_icons"] = icons
_spec.loader.exec_module(icons)


def decode_png(data: bytes):
    """Decode an RGBA 8-bit, filter-0 PNG into (width, height, rows of tuples)."""
    assert data[:8] == b"\x89PNG\r\n\x1a\n"
    pos = 8
    idat = b""
    width = height = 0
    while pos < len(data):
        (length,) = struct.unpack(">I", data[pos : pos + 4])
        kind = data[pos + 4 : pos + 8]
        body = data[pos + 8 : pos + 8 + length]
        if kind == b"IHDR":
            width, height, depth, ctype = struct.unpack(">IIBB", body[:10])
            assert (depth, ctype) == (8, 6)
        elif kind == b"IDAT":
            idat += body
        pos += 12 + length
    raw = zlib.decompress(idat)
    stride = 1 + width * 4
    rows = []
    for y in range(height):
        line = raw[y * stride : (y + 1) * stride]
        assert line[0] == 0
        px = line[1:]
        rows.append([tuple(px[i : i + 4]) for i in range(0, len(px), 4)])
    return width, height, rows


def ico_entries(data: bytes):
    reserved, kind, count = struct.unpack("<HHH", data[:6])
    assert (reserved, kind) == (0, 1)
    out = []
    for i in range(count):
        w, h, _c, _r, _p, _b, size, offset = struct.unpack(
            "<BBBBHHII", data[6 + 16 * i : 22 + 16 * i]
        )
        out.append((w or 256, h or 256, data[offset : offset + size]))
    return out


def icns_entries(data: bytes):
    assert data[:4] == b"icns"
    (total,) = struct.unpack(">I", data[4:8])
    assert total == len(data)
    pos, out = 8, {}
    while pos < total:
        ostype = data[pos : pos + 4].decode("ascii")
        (length,) = struct.unpack(">I", data[pos + 4 : pos + 8])
        out[ostype] = data[pos + 8 : pos + length]
        pos += length
    return out


_RECT = re.compile(
    r'<rect x="(\d+)" y="(\d+)" width="1" height="1" fill="#([0-9a-f]{6})"\s*/>'
)


def svg_grid(n: int):
    """Reference grid parsed independently of build_app_icons.parse_svg."""
    text = (_SOURCE / f"mark-{n}.svg").read_text(encoding="utf-8")
    assert text.count("<rect") == len(_RECT.findall(text))
    grid = [[(0, 0, 0, 0)] * n for _ in range(n)]
    for x, y, hx in _RECT.findall(text):
        grid[int(y)][int(x)] = (
            int(hx[0:2], 16),
            int(hx[2:4], 16),
            int(hx[4:6], 16),
            255,
        )
    return grid


def scaled_64(size: int):
    g, f = svg_grid(64), size // 64
    return [[g[y // f][x // f] for x in range(size)] for y in range(size)]


def assert_pixels(png: bytes, size: int, expected) -> None:
    w, h, rows = decode_png(png)
    assert (w, h) == (size, size)
    assert rows == [list(r) for r in expected]


def _expected(size: int):
    return svg_grid(size) if size <= 64 else scaled_64(size)


def test_ico_holds_exactly_the_expected_sizes_and_pixels() -> None:
    entries = ico_entries((_BUILD / "icon.ico").read_bytes())
    assert [(w, h) for w, h, _ in entries] == [
        (n, n) for n in (16, 24, 32, 48, 64, 128, 256)
    ]
    for w, _h, png in entries:
        assert_pixels(png, w, _expected(w))


_TILE_RGB = {(139, 92, 246), (167, 139, 250), (109, 40, 217), (0, 0, 0)}
_VIOLET_RGB = {(139, 92, 246), (167, 139, 250), (109, 40, 217)}
_ICNS = {
    "icp4": 16, "icp5": 32, "icp6": 64, "ic07": 128, "ic08": 256, "ic09": 512,
    "ic10": 1024, "ic11": 32, "ic12": 64, "ic13": 256, "ic14": 512,
}  # fmt: skip


def _wheel_box(n: int):
    """Wheel plus its black ring: colour pixels, grown through touching black."""
    g = svg_grid(n)
    todo = [
        (x, y)
        for y in range(n)
        for x in range(n)
        if g[y][x][3] == 255 and g[y][x][:3] not in _TILE_RGB
    ]
    got = set(todo)
    while todo:
        x, y = todo.pop()
        for nx in range(x - 1, x + 2):
            for ny in range(y - 1, y + 2):
                if (
                    0 <= nx < n
                    and 0 <= ny < n
                    and (nx, ny) not in got
                    and g[ny][nx] == (0, 0, 0, 255)
                ):
                    got.add((nx, ny))
                    todo.append((nx, ny))
    xs, ys = [p[0] for p in got], [p[1] for p in got]
    return min(xs), min(ys), max(xs) - min(xs) + 1, max(ys) - min(ys) + 1


def _ref_pick(size: int):
    m = size * 100 // 1024
    b = size - 2 * m
    h = max(1, round(b / 14))
    room, target = b - 2 * h, 0.62 * size
    best = None
    for n in (64, 48, 32, 24, 16):
        w = _wheel_box(n)[2]
        ks = [k for k in range(1, room // w + 1)]
        if not ks:
            continue
        k = min(ks, key=lambda k: abs(k * w - target))
        d = abs(k * w - target)
        if d <= 0.15 * target:
            return n, k
        if best is None or d < best[0]:
            best = (d, n, k)
    return best[1], best[2]


def _ref_mac(size: int):
    m = size * 100 // 1024
    b = size - 2 * m
    h = max(1, round(b / 14))
    r = b * 0.2237
    c = m + b / 2
    out = [[(0, 0, 0, 0)] * size for _ in range(size)]
    for y in range(size):
        rgb = (
            (167, 139, 250)
            if y < m + h
            else ((109, 40, 217) if y >= size - m - h else (139, 92, 246))
        )
        for x in range(size):
            cnt = 0
            for i in range(4):
                for j in range(4):
                    px, py = x + 0.125 + 0.25 * i, y + 0.125 + 0.25 * j
                    if not (m <= px < m + b and m <= py < m + b):
                        continue
                    qx = max(abs(px - c) - (b / 2 - r), 0)
                    qy = max(abs(py - c) - (b / 2 - r), 0)
                    cnt += qx * qx + qy * qy <= r * r
            if cnt:
                out[y][x] = (*rgb, round(255 * cnt / 16))
    n, k = _ref_pick(size)
    x0, y0, w, hh = _wheel_box(n)
    src = svg_grid(n)
    left = (size - k * w) // 2
    for sy in range(hh):
        for sx in range(w):
            p = src[y0 + sy][x0 + sx]
            if p[3] == 255 and p[:3] not in _VIOLET_RGB:
                for dy in range(k):
                    for dx in range(k):
                        out[left + sy * k + dy][left + sx * k + dx] = p
    return out


def test_icns_holds_every_ostype_with_the_mac_icon_pixels() -> None:
    entries = icns_entries((_BUILD / "icon.icns").read_bytes())
    assert set(entries) == set(_ICNS)
    for ostype, size in _ICNS.items():
        assert_pixels(entries[ostype], size, _ref_mac(size))


def test_mac_wheel_picks() -> None:
    picks = {s: _ref_pick(s) for s in (16, 32, 64, 128, 256, 512, 1024)}
    assert picks == {
        16: (16, 1), 32: (32, 1), 64: (48, 1), 128: (48, 2),
        256: (64, 3), 512: (64, 7), 1024: (64, 14),
    }  # fmt: skip
    widths = {n: _wheel_box(n)[2] for n in (16, 24, 32, 48, 64)}
    assert widths == {16: 11, 24: 19, 32: 20, 48: 35, 64: 46}
    for s, (n, k) in picks.items():
        assert icons.pick_wheel(s, widths) == (n, k)


def test_mac_icon_has_transparent_corners_and_opaque_centre() -> None:
    entries = icns_entries((_BUILD / "icon.icns").read_bytes())
    for ostype, size in _ICNS.items():
        _w, _h, rows = decode_png(entries[ostype])
        assert rows[0][0] == (0, 0, 0, 0)
        assert rows[size - 1][size - 1] == (0, 0, 0, 0)
        assert rows[size // 2][size // 2][3] == 255


def test_mac_icon_geometry_at_1024() -> None:
    """Pinned by hand, not by re-running the rule: margin 100, body 824, bands 59."""
    _w, _h, rows = decode_png(icns_entries((_BUILD / "icon.icns").read_bytes())["ic10"])
    # The transparent margin on every side.
    for i in range(100):
        assert rows[512][i][3] == 0 and rows[512][1023 - i][3] == 0
        assert rows[i][512][3] == 0 and rows[1023 - i][512][3] == 0
    # The light band's first and last rows, the dark band's, and the tile between, at the centre column.
    assert rows[100][512] == (167, 139, 250, 255) and rows[158][512] == (
        167,
        139,
        250,
        255,
    )
    assert rows[159][512] == (139, 92, 246, 255)
    assert rows[865][512] == (109, 40, 217, 255) and rows[923][512] == (
        109,
        40,
        217,
        255,
    )
    # The wheel (64 grid x14, 644 px from 190) stays between the bands.
    band_colours = {(167, 139, 250, 255), (109, 40, 217, 255)}
    assert rows[189][512] in band_colours | {(139, 92, 246, 255)}
    for y in (190, 833):
        assert rows[y][512] not in band_colours


def test_icon_png_is_the_scaled_512() -> None:
    assert_pixels((_BUILD / "icon.png").read_bytes(), 512, _expected(512))


def test_linux_icons_have_the_right_pixels() -> None:
    for n in (16, 24, 32, 48, 64, 128, 256, 512):
        png = (_BUILD / "icons" / f"{n}x{n}.png").read_bytes()
        assert_pixels(png, n, _expected(n))


def test_output_is_deterministic() -> None:
    assert icons.build_outputs(_SOURCE) == icons.build_outputs(_SOURCE)


def test_check_passes_on_committed_files() -> None:
    assert icons.main(["--check"]) == 0


def _copy_tree(tmp_path: Path):
    src, out = tmp_path / "icon-source", tmp_path / "build"
    shutil.copytree(_SOURCE, src)
    for rel in icons.build_outputs(_SOURCE):
        (out / rel).parent.mkdir(parents=True, exist_ok=True)
        shutil.copy(_BUILD / rel, out / rel)
    return src, out


def test_check_fails_after_a_source_changes(
    tmp_path: Path, capsys: pytest.CaptureFixture
) -> None:
    src, out = _copy_tree(tmp_path)
    args = ["--check", "--source-dir", str(src), "--out-dir", str(out)]
    assert icons.main(args) == 0
    svg = src / "mark-16.svg"
    text = svg.read_text(encoding="utf-8")
    svg.write_text(
        # The hub's white pixel: a change inside the wheel, which every output draws.
        text.replace('fill="#fafafa"', 'fill="#123456"', 1),
        encoding="utf-8",
    )
    assert icons.main(args) != 0
    assert "icon.ico" in capsys.readouterr().err


def test_check_fails_when_a_file_is_missing(
    tmp_path: Path, capsys: pytest.CaptureFixture
) -> None:
    src, out = _copy_tree(tmp_path)
    (out / "icons" / "16x16.png").unlink()
    assert icons.main(["--check", "--source-dir", str(src), "--out-dir", str(out)]) != 0
    assert "missing: icons/16x16.png" in capsys.readouterr().err


def test_default_run_writes_the_files(tmp_path: Path) -> None:
    out = tmp_path / "out"
    assert icons.main(["--source-dir", str(_SOURCE), "--out-dir", str(out)]) == 0
    assert (out / "icon.ico").read_bytes() == (_BUILD / "icon.ico").read_bytes()


_GOOD = '<rect x="0" y="0" width="1" height="1" fill="#0a0b0c"/>'


def _svg(body: str) -> str:
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2 2">{body}</svg>'


def test_parse_svg_accepts_a_valid_mark() -> None:
    grid = icons.parse_svg(_svg(_GOOD))
    assert grid[0][0] == (10, 11, 12, 255)
    assert grid[1][1] == (0, 0, 0, 0)


@pytest.mark.parametrize(
    "body",
    [
        '<rect x="0" y="0" width="2" height="1" fill="#000000"/>',
        '<rect x="0" y="0" width="1" height="2" fill="#000000"/>',
        '<rect x="0" y="0" fill="#000000"/>',
        _GOOD + _GOOD,
        '<rect x="2" y="0" width="1" height="1" fill="#000000"/>',
        '<rect x="0" y="-1" width="1" height="1" fill="#000000"/>',
        _GOOD + '<circle cx="1" cy="1" r="1"/>',
        '<g><rect x="0" y="0" width="1" height="1" fill="#000000"/></g>',
        '<rect x="0" y="0" width="1" height="1" fill="#000000" opacity="0.5"/>',
        '<rect x="0" y="0" width="1" height="1" fill="#000000" fill-opacity="0.5"/>',
        '<rect x="0" y="0" width="1" height="1" fill="red"/>',
        '<rect x="0" y="0" width="1" height="1" fill="#fff"/>',
        '<rect x="0" y="0" width="1" height="1" fill="#00000080"/>',
        '<rect x="0" y="0" width="1" height="1"/>',
    ],
)
def test_parse_svg_rejects_malformed_marks(body: str) -> None:
    with pytest.raises(ValueError):
        icons.parse_svg(_svg(body))
