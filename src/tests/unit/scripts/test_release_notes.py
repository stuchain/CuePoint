"""Tests for scripts/release_notes.py (DIST-04, DEC-178).

The release notes are the version's own section of the changelog, so the tests
hold the extraction and the refusals: a missing, empty or Unreleased section
must stop a release rather than publish one with no notes.
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pytest

_REPO_ROOT = Path(__file__).resolve().parents[4]
_SCRIPT = _REPO_ROOT / "scripts" / "release_notes.py"

pytestmark = pytest.mark.unit


def _load():
    spec = importlib.util.spec_from_file_location("release_notes", _SCRIPT)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


rn = _load()

CHANGELOG = """# Changelog

## [Unreleased]

### Added
- Something not released yet

## [1.0.0-test.2] - 2026-10-01

### Fixed
- The second test fix

## [1.0.0-test.1] - 2026-09-20

### Added
- The first test build

   Trailing blank lines follow.


## [0.0.3]

## [0.0.2] - 2025-01-01

- Old
"""


def _write(tmp_path: Path, text: str = CHANGELOG) -> Path:
    path = tmp_path / "CHANGELOG.md"
    path.write_text(text, encoding="utf-8")
    return path


def test_returns_the_section_without_its_heading(tmp_path):
    body = rn.extract_section(
        _write(tmp_path).read_text(encoding="utf-8"), "1.0.0-test.2"
    )
    assert body == "### Fixed\n- The second test fix"


def test_the_section_ends_at_the_next_version_heading_and_is_trimmed(tmp_path):
    body = rn.extract_section(
        _write(tmp_path).read_text(encoding="utf-8"), "1.0.0-test.1"
    )
    assert body.startswith("### Added")
    assert body.endswith("Trailing blank lines follow.")
    assert "0.0.3" not in body


def test_a_missing_section_fails(tmp_path):
    with pytest.raises(rn.ReleaseNotesError, match="9.9.9"):
        rn.extract_section(CHANGELOG, "9.9.9")


def test_an_empty_section_fails():
    with pytest.raises(rn.ReleaseNotesError, match="empty"):
        rn.extract_section(CHANGELOG, "0.0.3")


def test_a_version_is_not_matched_by_prefix():
    with pytest.raises(rn.ReleaseNotesError):
        rn.extract_section(CHANGELOG, "1.0.0-test")


@pytest.mark.parametrize("name", ["Unreleased", "unreleased", "[Unreleased]"])
def test_unreleased_is_refused(name):
    with pytest.raises(rn.ReleaseNotesError, match="Unreleased"):
        rn.extract_section(CHANGELOG, name)


def test_main_prints_the_body(tmp_path, capsys):
    path = _write(tmp_path)
    assert rn.main(["1.0.0-test.2", "--changelog", str(path)]) == 0
    assert capsys.readouterr().out.strip() == "### Fixed\n- The second test fix"


def test_main_exits_1_with_a_message_when_missing(tmp_path, capsys):
    path = _write(tmp_path)
    assert rn.main(["2.0.0", "--changelog", str(path)]) == 1
    captured = capsys.readouterr()
    assert captured.out == ""
    assert "2.0.0" in captured.err


def test_main_exits_1_when_the_changelog_is_absent(tmp_path, capsys):
    assert rn.main(["1.0.0", "--changelog", str(tmp_path / "none.md")]) == 1
    assert "none.md" in capsys.readouterr().err


TRAILER = """## [1.0.0]

### Added
- A thing

---

[1.0.0]: https://example.invalid/compare/v0.9...v1.0.0
[0.9.0]: https://example.invalid/compare/v0.8...v0.9.0
"""


def test_a_trailing_separator_and_link_references_are_dropped():
    assert rn.extract_section(TRAILER, "1.0.0") == "### Added\n- A thing"


def test_a_separator_between_entries_is_kept():
    text = "## [1.0.0]\n\n- a\n\n---\n\n- b\n"
    assert rn.extract_section(text, "1.0.0") == "- a\n\n---\n\n- b"


def test_a_section_of_only_headings_is_empty():
    text = "## [1.0.0]\n\n### Added\n\n### Fixed\n\n---\n\n[1.0.0]: https://x.invalid\n"
    with pytest.raises(rn.ReleaseNotesError, match="empty"):
        rn.extract_section(text, "1.0.0")


def test_a_section_of_only_a_link_reference_is_empty():
    with pytest.raises(rn.ReleaseNotesError, match="empty"):
        rn.extract_section("## [1.0.0]\n\n[1.0.0]: https://x.invalid\n", "1.0.0")
