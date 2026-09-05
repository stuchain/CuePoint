"""Tests for the bundled-component licence gate (scripts/check_bundled_licenses.py).

CuePoint is Apache-2.0 and now ships a GPL binary it did not build (DEC-049).
The existing licence tooling reads pip metadata and cannot see that, so this
gate exists — and like the Qt-boundary guard, it is tested in both directions:
it passes against the real tree, and it actually fails when something is
missing, so a green result means something.
"""

from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
from pathlib import Path

import pytest

# src/tests/unit/scripts -> 5 levels up
_REPO_ROOT = Path(__file__).resolve().parents[4]
_SCRIPT = _REPO_ROOT / "scripts" / "check_bundled_licenses.py"


def _load(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


cbl = _load("check_bundled_licenses", _SCRIPT)

pytestmark = pytest.mark.unit


def _manifest(tmp_path: Path, **license_overrides) -> Path:
    license_block = {
        "spdx": "GPL-2.0-or-later",
        "files": ["LICENSE.GPL"],
        "source_url": "https://github.com/mpv-player/mpv/tree/abc123",
    }
    license_block.update(license_overrides)
    data = {
        "component": "mpv",
        "repo": "mpv-player/mpv",
        "tag": "git-release",
        "version": "v0.41.0-dev-gabc123",
        "commit": "abc123",
        "license": license_block,
        "targets": {
            "win32-x64": {
                "platform_dir": "win",
                "asset": "mpv.zip",
                "url": "https://example.invalid/mpv.zip",
                "sha256": "0" * 64,
                "archive": "zip",
                "install": ["mpv.exe"],
                "binary": "mpv.exe",
            }
        },
    }
    path = tmp_path / "manifest.json"
    path.write_text(json.dumps(data), encoding="utf-8")
    return path


class TestAgainstTheRealTree:
    def test_the_repository_passes(self):
        assert cbl.check() == []

    def test_the_script_exits_zero(self):
        result = subprocess.run(
            [sys.executable, str(_SCRIPT)],
            capture_output=True,
            text=True,
            cwd=str(_REPO_ROOT),
        )
        assert result.returncode == 0, result.stderr

    def test_the_real_licence_texts_are_substantial(self):
        """Guards against a placeholder being committed in their place."""
        for name in cbl.load_manifest().license_files:
            assert (cbl.LICENSE_DIR / name).stat().st_size > cbl.MIN_LICENSE_BYTES

    def test_a_notice_file_exists(self):
        assert (cbl.LICENSE_DIR / "NOTICE.md").exists()


class TestItCanFail:
    def test_a_missing_licence_text_is_caught(self, tmp_path):
        manifest = _manifest(tmp_path, files=["LICENSE.NOPE"])
        problems = cbl.check(manifest, tmp_path / "dest")
        assert any("missing licence text" in p for p in problems)

    def test_a_manifest_without_a_source_url_is_caught(self, tmp_path):
        """The licence requires the corresponding source to be identifiable."""
        manifest = _manifest(tmp_path, source_url="")
        problems = cbl.check(manifest, tmp_path / "dest")
        assert any("source_url" in p for p in problems)

    def test_a_manifest_naming_no_licences_is_caught(self, tmp_path):
        manifest = _manifest(tmp_path, files=[])
        problems = cbl.check(manifest, tmp_path / "dest")
        assert any("names no licence files" in p for p in problems)

    def test_an_unreadable_manifest_is_reported_not_raised(self, tmp_path):
        bad = tmp_path / "broken.json"
        bad.write_text("{not json", encoding="utf-8")
        problems = cbl.check(bad, tmp_path / "dest")
        assert problems and "unreadable" in problems[0]

    def test_the_script_exits_nonzero_when_it_fails(self, tmp_path):
        manifest = _manifest(tmp_path, files=["LICENSE.NOPE"])
        result = subprocess.run(
            [sys.executable, str(_SCRIPT), "--manifest", str(manifest)],
            capture_output=True,
            text=True,
            cwd=str(_REPO_ROOT),
        )
        assert result.returncode == 1
        assert "FAILED" in result.stderr


class TestInstalledSidecarCrossCheck:
    def test_an_install_missing_its_licences_is_caught(self, tmp_path):
        """A receipt without the licence directory beside it means a package
        would ship the binary and not its terms."""
        manifest = _manifest(tmp_path)
        install_dir = tmp_path / "dest" / "win"
        install_dir.mkdir(parents=True)
        (install_dir / "installed.json").write_text(
            json.dumps({"license_spdx": "GPL-2.0-or-later", "files": []}),
            encoding="utf-8",
        )

        problems = cbl.check(manifest, tmp_path / "dest")

        assert any("missing licenses/LICENSE.GPL" in p for p in problems)

    def test_a_licence_mismatch_between_receipt_and_manifest_is_caught(self, tmp_path):
        manifest = _manifest(tmp_path)
        install_dir = tmp_path / "dest" / "win"
        (install_dir / "licenses").mkdir(parents=True)
        (install_dir / "licenses" / "LICENSE.GPL").write_text("x", encoding="utf-8")
        (install_dir / "installed.json").write_text(
            json.dumps({"license_spdx": "MIT", "files": []}), encoding="utf-8"
        )

        problems = cbl.check(manifest, tmp_path / "dest")

        assert any("records licence 'MIT'" in p for p in problems)

    def test_no_install_is_not_a_failure(self, tmp_path):
        """Must pass on a clean checkout, which is how CI runs it."""
        manifest = _manifest(tmp_path)
        assert cbl.check(manifest, tmp_path / "never-built") == []
