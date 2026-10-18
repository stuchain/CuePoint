"""Tests for scripts/build_key_signs_font.py: the pixel flat and sharp signs."""

from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest

pytest.importorskip("fontTools")
pytest.importorskip("brotli")
from fontTools.ttLib import TTFont  # noqa: E402

_REPO_ROOT = Path(__file__).resolve().parents[4]
_SCRIPT = _REPO_ROOT / "scripts" / "build_key_signs_font.py"
_COMMITTED = _REPO_ROOT / "apps/desktop-electron/renderer/src/assets/fonts"

_spec = importlib.util.spec_from_file_location("build_key_signs_font", _SCRIPT)
assert _spec is not None and _spec.loader is not None
build_key_signs_font = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(build_key_signs_font)


@pytest.mark.parametrize("weight", [400, 700])
def test_both_signs_exist_and_draw(tmp_path: Path, weight: int) -> None:
    path = build_key_signs_font.build(weight, tmp_path)
    font = TTFont(path)
    cmap = font.getBestCmap()
    assert 0x266D in cmap and 0x266F in cmap
    for code in (0x266D, 0x266F):
        glyph = font["glyf"][cmap[code]]
        assert glyph.numberOfContours > 0
        assert font["hmtx"][cmap[code]][0] > 0


def _outlines(path: Path) -> dict[int, tuple[object, ...]]:
    """Each mapped character's glyph outline and advance, independent of how the file is packed."""
    font = TTFont(path)
    cmap = font.getBestCmap()
    out: dict[int, tuple[object, ...]] = {}
    for code, name in cmap.items():
        glyph = font["glyf"][name]
        coordinates, ends, _flags = glyph.getCoordinates(font["glyf"])
        out[code] = (list(coordinates), list(ends), font["hmtx"][name])
    return out


@pytest.mark.parametrize("weight", [400, 700])
def test_output_is_deterministic_and_matches_committed(
    tmp_path: Path, weight: int
) -> None:
    first = build_key_signs_font.build(weight, tmp_path / "a")
    second = build_key_signs_font.build(weight, tmp_path / "b")
    # The same tool twice gives the same bytes ...
    assert first.read_bytes() == second.read_bytes()
    # ... and the committed file draws the same glyphs. Raw bytes would also depend on the
    # fontTools and brotli versions that packed them, which is not what is being guarded.
    committed = _COMMITTED / f"cuepoint-key-signs-{weight}.woff2"
    assert _outlines(committed) == _outlines(first)
