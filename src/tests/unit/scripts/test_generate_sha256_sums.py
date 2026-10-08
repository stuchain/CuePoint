"""generate_sha256_sums.py: per-leg checksum files over the top-level artifacts (DIST-03)."""

from __future__ import annotations

import hashlib
import importlib.util
from pathlib import Path

import pytest

_SCRIPT = Path(__file__).resolve().parents[4] / "scripts" / "generate_sha256_sums.py"
_spec = importlib.util.spec_from_file_location("generate_sha256_sums", _SCRIPT)
gen = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(gen)


def make_release(root: Path) -> Path:
    release = root / "release"
    (release / "mac").mkdir(parents=True)
    (release / "mac" / "CuePoint.app").write_text("unpacked")
    (release / "mac-arm64").mkdir()
    (release / "mac-arm64" / "inner.bin").write_text("unpacked")
    (release / "win-unpacked").mkdir()
    (release / "win-unpacked" / "CuePoint.exe").write_text("unpacked")
    (release / "linux-unpacked").mkdir()
    (release / "linux-unpacked" / "cuepoint").write_text("unpacked")
    (release / "CuePoint-1.0.0-mac-x64.dmg").write_bytes(b"dmg")
    (release / "CuePoint-1.0.0-mac-x64.zip").write_bytes(b"zip")
    (release / "CuePoint-1.0.0-mac-x64.zip.blockmap").write_bytes(b"map")
    (release / "latest-mac.yml").write_text("version: 1.0.0\n")
    (release / "builder-debug.yml").write_text("debug")
    (release / "builder-effective-config.yaml").write_text("config")
    return release


def lines(path: Path) -> dict[str, str]:
    out = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        digest, name = line.split("  ", 1)
        out[name] = digest
    return out


@pytest.mark.unit
class TestLeg:
    def test_leg_names_the_output(self, tmp_path):
        release = make_release(tmp_path)
        assert gen.main([str(release), "--leg", "macos-x64"]) == 0
        assert (release / "SHA256SUMS-macos-x64.txt").is_file()
        assert not (release / "SHA256SUMS.txt").exists()

    def test_unpacked_folders_are_excluded_and_top_level_files_listed(self, tmp_path):
        release = make_release(tmp_path)
        gen.main([str(release), "--leg", "macos-x64"])
        listed = lines(release / "SHA256SUMS-macos-x64.txt")
        assert sorted(listed) == [
            "CuePoint-1.0.0-mac-x64.dmg",
            "CuePoint-1.0.0-mac-x64.zip",
            "CuePoint-1.0.0-mac-x64.zip.blockmap",
            "latest-mac.yml",
        ]
        assert (
            listed["CuePoint-1.0.0-mac-x64.dmg"] == hashlib.sha256(b"dmg").hexdigest()
        )

    def test_the_sums_file_does_not_list_itself_or_other_sums_files(self, tmp_path):
        release = make_release(tmp_path)
        (release / "SHA256SUMS-windows-x64.txt").write_text("old")
        gen.main([str(release), "--leg", "macos-x64"])
        gen.main([str(release), "--leg", "macos-x64"])  # a rerun sees its own output
        listed = lines(release / "SHA256SUMS-macos-x64.txt")
        assert not any(name.startswith("SHA256SUMS") for name in listed)

    def test_leg_and_output_are_mutually_exclusive(self, tmp_path):
        release = make_release(tmp_path)
        with pytest.raises(SystemExit):
            gen.main([str(release), "--leg", "a", "--output", "b.txt"])

    def test_output_still_names_the_file_and_default_is_unchanged(self, tmp_path):
        release = make_release(tmp_path)
        gen.main([str(release), "--output", "mine.txt"])
        assert (release / "mine.txt").is_file()
        gen.main([str(release)])
        assert (release / "SHA256SUMS.txt").is_file()
        assert "SHA256SUMS.txt" not in (release / "SHA256SUMS.txt").read_text()

    def test_missing_directory_exits(self, tmp_path):
        with pytest.raises(SystemExit):
            gen.main([str(tmp_path / "nope"), "--leg", "x"])
