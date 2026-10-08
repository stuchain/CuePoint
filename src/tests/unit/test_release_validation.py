"""
Unit tests for Release Engineering and Distribution scripts (Design 02).

Tests validate_changelog, generate_sbom and validate_version logic.
"""

import sys
import tempfile
from pathlib import Path

import pytest  # noqa: F401

# Add project root and scripts to path so we can import script modules
_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent
_SCRIPTS_DIR = _PROJECT_ROOT / "scripts"
if str(_PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(_PROJECT_ROOT))
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))


class TestValidateChangelog:
    """Tests for validate_changelog validation logic."""

    def test_parse_changelog_sections_empty_file(self):
        import validate_changelog as m

        parse_changelog_sections = m.parse_changelog_sections

        with tempfile.NamedTemporaryFile(mode="w", suffix=".md", delete=False) as f:
            f.write("# Changelog\n\nNo sections.\n")
            path = Path(f.name)
        try:
            sections = parse_changelog_sections(path)
            assert sections == []
        finally:
            path.unlink(missing_ok=True)

    def test_parse_changelog_sections_with_unreleased(self):
        import validate_changelog as m

        parse_changelog_sections = m.parse_changelog_sections

        content = """# Changelog

## [Unreleased]

### Added
- New feature

## [1.0.0] - 2024-12-14

### Added
- Initial release
"""
        with tempfile.NamedTemporaryFile(mode="w", suffix=".md", delete=False) as f:
            f.write(content)
            path = Path(f.name)
        try:
            sections = parse_changelog_sections(path)
            assert len(sections) >= 1
            titles = [s[0] for s in sections]
            assert "Unreleased" in titles or "1.0.0" in titles
        finally:
            path.unlink(missing_ok=True)

    def test_validate_changelog_missing_file(self):
        import validate_changelog as m

        validate_changelog = m.validate_changelog

        valid, errors = validate_changelog(Path("/nonexistent/changelog.md"), "1.0.0")
        assert valid is False
        assert any("not found" in e for e in errors)

    def test_validate_changelog_with_unreleased_content(self):
        import validate_changelog as m

        validate_changelog = m.validate_changelog

        content = """# Changelog

## [Unreleased]

### Added
- Item
"""
        with tempfile.NamedTemporaryFile(mode="w", suffix=".md", delete=False) as f:
            f.write(content)
            path = Path(f.name)
        try:
            valid, errors = validate_changelog(
                path, "1.0.1", require_version_entry=True
            )
            assert valid, errors
        finally:
            path.unlink(missing_ok=True)

    def test_a_section_for_another_version_with_the_same_base_does_not_count(
        self, tmp_path
    ):
        """A ``[1.0.0]`` section is not ``1.0.0-test.1``'s (DEC-145, DEC-178)."""
        import validate_changelog as m

        path = tmp_path / "CHANGELOG.md"
        path.write_text(
            "# Changelog\n\n## [Unreleased]\n\n## [1.0.0] - 2024-12-14\n\n### Added\n- Old\n",
            encoding="utf-8",
        )
        valid, errors = m.validate_changelog(path, "1.0.0-test.1")
        assert not valid
        assert errors

    def test_a_section_for_exactly_this_version_counts(self, tmp_path):
        import validate_changelog as m

        path = tmp_path / "CHANGELOG.md"
        path.write_text(
            "# Changelog\n\n## [Unreleased]\n\n## [1.0.0-test.1] - 2026-10-08\n\n### Added\n- New\n",
            encoding="utf-8",
        )
        assert m.validate_changelog(path, "1.0.0-test.1") == (True, [])

    def test_extract_base_version(self):
        import validate_changelog as m

        extract_base_version = m.extract_base_version

        assert extract_base_version("1.0.0") == "1.0.0"
        assert extract_base_version("1.0.1-test21") == "1.0.1"
        assert extract_base_version("2.3.4+abc") == "2.3.4"


class TestGenerateSbom:
    """Tests for generate_sbom."""

    def test_parse_requirements_file(self):
        import generate_sbom as m

        parse_requirements_file = m.parse_requirements_file

        with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as f:
            f.write("Pillow==12.3.0\nrequests>=2.0\n# comment\n")
            path = Path(f.name)
        try:
            pkgs = parse_requirements_file(path)
            assert any("pillow" in p[0] for p in pkgs)
            assert any("requests" in p[0] for p in pkgs)
        finally:
            path.unlink(missing_ok=True)

    def test_spdx_id(self):
        import generate_sbom as m

        spdx_id = m.spdx_id

        assert "Package" in spdx_id("foo", "1.0.0")
        assert "foo" in spdx_id("foo", "1.0.0")


class TestValidateVersion:
    """Smoke tests for validate_version (import and basic logic)."""

    def test_validate_semver(self):
        import validate_version as m

        validate_semver = m.validate_semver

        ok, err = validate_semver("1.0.0")
        assert ok is True, err
        ok, err = validate_semver("0.0.1")
        assert ok is True, err
        ok, err = validate_semver("x.y.z")
        assert ok is False

    def test_extract_base_version(self):
        import validate_version as m

        extract_base_version = m.extract_base_version

        assert extract_base_version("1.0.0") == "1.0.0"
        assert extract_base_version("1.0.1-test") == "1.0.1"
