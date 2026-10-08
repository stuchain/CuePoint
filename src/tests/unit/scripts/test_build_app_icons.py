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


def test_icns_holds_every_ostype_with_the_right_pixels() -> None:
    expected = {
        "icp4": 16, "icp5": 32, "icp6": 64, "ic07": 128, "ic08": 256, "ic09": 512,
        "ic10": 1024, "ic11": 32, "ic12": 64, "ic13": 256, "ic14": 512,
    }  # fmt: skip
    entries = icns_entries((_BUILD / "icon.icns").read_bytes())
    assert set(entries) == set(expected)
    for ostype, size in expected.items():
        assert_pixels(entries[ostype], size, _expected(size))


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
        re.sub(r'fill="#[0-9a-f]{6}"', 'fill="#123456"', text, count=1),
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
