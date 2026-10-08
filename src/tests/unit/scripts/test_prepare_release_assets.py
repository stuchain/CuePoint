"""Tests for scripts/prepare_release_assets.py (DIST-04)."""

from __future__ import annotations

import hashlib
import importlib.util
import sys
from pathlib import Path

import pytest

_SCRIPT = Path(__file__).resolve().parents[4] / "scripts" / "prepare_release_assets.py"

pytestmark = pytest.mark.unit


def _load():
    spec = importlib.util.spec_from_file_location("prepare_release_assets", _SCRIPT)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


pra = _load()
VERSION = "1.0.0-test.1"


def _populate(directory: Path) -> None:
    for name in pra.expected_files(VERSION):
        (directory / name).write_text(name, encoding="utf-8")


def test_a_complete_set_passes(tmp_path):
    _populate(tmp_path)
    assert pra.main(["check", str(tmp_path), "--version", VERSION]) == 0


@pytest.mark.parametrize(
    "name",
    [
        f"CuePoint-{VERSION}-win-x64-setup.exe",
        f"CuePoint-{VERSION}-mac-x64.zip",
        f"CuePoint-{VERSION}-mac-arm64.dmg.blockmap",
        f"CuePoint-{VERSION}-linux-x86_64.AppImage",
        "latest.yml",
        "latest-linux.yml",
        "latest-mac.yml",
        "SHA256SUMS-macos-x64.txt",
    ],
)
def test_a_missing_file_fails_and_is_named(tmp_path, capsys, name):
    _populate(tmp_path)
    (tmp_path / name).unlink()
    assert pra.main(["check", str(tmp_path), "--version", VERSION]) == 1
    assert name in capsys.readouterr().err


def test_the_expected_set_covers_every_leg():
    names = pra.expected_files(VERSION)
    for leg in ("windows-x64", "linux-x64", "macos-arm64", "macos-x64"):
        assert f"SHA256SUMS-{leg}.txt" in names
    assert sum(n.endswith(".blockmap") for n in names) == 5
    assert not any(n.endswith(".AppImage.blockmap") for n in names)


def test_mac_sums_point_at_the_merged_manifest(tmp_path):
    merged = b"version: 1.0.0\nfiles: both chips\n"
    (tmp_path / "latest-mac.yml").write_bytes(merged)
    (tmp_path / "SHA256SUMS-macos-arm64.txt").write_text(
        "aaa  CuePoint-x-mac-arm64.dmg\nbbb  latest-mac.yml\nccc  CuePoint-x-mac-arm64.zip",
        encoding="utf-8",
    )
    (tmp_path / "SHA256SUMS-macos-x64.txt").write_text(
        "ddd  latest-mac.yml", encoding="utf-8"
    )
    (tmp_path / "SHA256SUMS-linux-x64.txt").write_text("eee  a\n", encoding="utf-8")
    assert pra.main(["mac-sums", str(tmp_path)]) == 0
    digest = hashlib.sha256(merged).hexdigest()
    arm = (tmp_path / "SHA256SUMS-macos-arm64.txt").read_text().splitlines()
    assert arm == [
        "aaa  CuePoint-x-mac-arm64.dmg",
        "ccc  CuePoint-x-mac-arm64.zip",
        f"{digest}  latest-mac.yml",
    ]
    assert (tmp_path / "SHA256SUMS-macos-x64.txt").read_text() == (
        f"{digest}  latest-mac.yml"
    )
    # Other legs are left alone.
    assert (tmp_path / "SHA256SUMS-linux-x64.txt").read_text() == "eee  a\n"


def test_mac_sums_need_the_merged_manifest(tmp_path, capsys):
    (tmp_path / "SHA256SUMS-macos-arm64.txt").write_text("x  y", encoding="utf-8")
    assert pra.main(["mac-sums", str(tmp_path)]) == 1
    assert "merge" in capsys.readouterr().err
