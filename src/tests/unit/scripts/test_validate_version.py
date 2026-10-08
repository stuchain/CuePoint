"""validate_version holds the version to DEC-145's scheme and a release tag to it (DIST-01)."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

_REPO_ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(_REPO_ROOT / "scripts"))

import validate_version as validator  # noqa: E402


@pytest.mark.unit
class TestScheme:
    @pytest.mark.parametrize("version", ["1.0.0", "0.0.3", "1.0.0-test.1", "1.2.3-test.10"])
    def test_versions_in_the_scheme_pass(self, version):
        assert validator.validate_scheme(version) == (True, None)

    @pytest.mark.parametrize(
        "version",
        [
            "1.0.0-feb1",
            "1.0.0-test1",
            "1.0.0-test.0",
            "1.0.0-test.01",
            "1.0.0-beta.1",
            "1.0.0+build",
            "01.0.0",
            "1.00.0",
            "1.0",
            "v1.0.0",
            "",
            "1.0.0\n",
            "1.0.0-test.1\n",
        ],
    )
    def test_everything_else_is_refused(self, version):
        ok, error = validator.validate_scheme(version)
        assert ok is False
        assert error and repr(version) in error

    def test_validate_semver_applies_the_same_scheme(self):
        assert validator.validate_semver("1.0.0-feb1")[0] is False


@pytest.mark.unit
class TestTag:
    def _version(self, monkeypatch, value):
        monkeypatch.setattr(validator, "get_version_from_file", lambda: value)

    def test_a_tag_naming_the_version_passes(self, monkeypatch):
        self._version(monkeypatch, "1.0.0-test.1")
        assert validator.check_tag("v1.0.0-test.1") == []

    def test_a_tag_naming_another_version_fails(self, monkeypatch):
        self._version(monkeypatch, "1.0.0-test.2")
        (error,) = validator.check_tag("v1.0.0-test.1")
        assert "v1.0.0-test.2" in error

    def test_a_tag_without_v_fails(self, monkeypatch):
        self._version(monkeypatch, "1.0.0-test.1")
        assert validator.check_tag("1.0.0-test.1")

    def test_a_version_outside_the_scheme_fails_even_when_the_tag_matches(self, monkeypatch):
        self._version(monkeypatch, "1.0.0-feb1")
        assert validator.check_tag("v1.0.0-feb1")

    def test_an_unreadable_version_fails(self, monkeypatch):
        self._version(monkeypatch, None)
        assert validator.check_tag("v1.0.0")

    def test_main_with_tag_skips_the_git_tag_comparison(self, monkeypatch, capsys):
        self._version(monkeypatch, "1.0.0-test.1")
        monkeypatch.setattr(
            validator, "get_version_from_git_tag", lambda: pytest.fail("compared git tags")
        )
        assert validator.main(["--tag", "v1.0.0-test.1"]) == 0
        assert "1.0.0-test.1" in capsys.readouterr().out

    def test_main_with_a_wrong_tag_exits_1(self, monkeypatch, capsys):
        self._version(monkeypatch, "1.0.0-test.2")
        assert validator.main(["--tag", "v1.0.0-test.1"]) == 1
        assert "ERROR" in capsys.readouterr().out
