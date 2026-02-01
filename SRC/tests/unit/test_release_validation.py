"""
Unit tests for Release Engineering and Distribution scripts (Design 02).

Tests validate_changelog, validate_appcast, generate_sbom, generate_build_metadata logic.
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
            valid, errors = validate_changelog(path, "1.0.1", require_version_entry=True)
            assert valid, errors
        finally:
            path.unlink(missing_ok=True)

    def test_extract_base_version(self):
        import validate_changelog as m
        extract_base_version = m.extract_base_version

        assert extract_base_version("1.0.0") == "1.0.0"
        assert extract_base_version("1.0.1-test21") == "1.0.1"
        assert extract_base_version("2.3.4+abc") == "2.3.4"


class TestValidateAppcast:
    """Tests for validate_appcast validation logic."""

    def test_validate_semver(self):
        import validate_appcast as m
        validate_semver = m.validate_semver

        assert validate_semver("1.0.0") is True
        assert validate_semver("2.3.4") is True
        assert validate_semver("1.0.0-beta.1") is True
        assert validate_semver("invalid") is False
        assert validate_semver("1.0") is False

    def test_validate_appcast_missing_file(self):
        import validate_appcast as m
        validate_appcast = m.validate_appcast

        valid, errors = validate_appcast(Path("/nonexistent/appcast.xml"))
        assert valid is False
        assert any("not found" in e for e in errors)

    def test_validate_appcast_valid_xml(self):
        import validate_appcast as m
        validate_appcast = m.validate_appcast

        xml = """<?xml version="1.0"?>
<rss version="2.0" xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle">
  <channel>
    <item>
      <title>Version 1.0.0</title>
      <sparkle:version>10000</sparkle:version>
      <sparkle:shortVersionString>1.0.0</sparkle:shortVersionString>
      <enclosure url="https://example.com/CuePoint-1.0.0.dmg" length="12345" type="application/octet-stream"/>
    </item>
  </channel>
</rss>
"""
        with tempfile.NamedTemporaryFile(mode="w", suffix=".xml", delete=False) as f:
            f.write(xml)
            path = Path(f.name)
        try:
            valid, errors = validate_appcast(path, check_https=True, check_version_format=True)
            assert valid, errors
        finally:
            path.unlink(missing_ok=True)

    def test_validate_appcast_rejects_http_url(self):
        import validate_appcast as m
        validate_appcast = m.validate_appcast

        xml = """<?xml version="1.0"?>
<rss version="2.0" xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle">
  <channel>
    <item>
      <sparkle:version>10000</sparkle:version>
      <sparkle:shortVersionString>1.0.0</sparkle:shortVersionString>
      <enclosure url="http://example.com/app.dmg" length="123" type="application/octet-stream"/>
    </item>
  </channel>
</rss>
"""
        with tempfile.NamedTemporaryFile(mode="w", suffix=".xml", delete=False) as f:
            f.write(xml)
            path = Path(f.name)
        try:
            valid, errors = validate_appcast(path, check_https=True)
            assert valid is False
            assert any("https" in e.lower() for e in errors)
        finally:
            path.unlink(missing_ok=True)


class TestGenerateSbom:
    """Tests for generate_sbom."""

    def test_parse_requirements_file(self):
        import generate_sbom as m
        parse_requirements_file = m.parse_requirements_file

        with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as f:
            f.write("PySide6==6.10.1\nrequests>=2.0\n# comment\n")
            path = Path(f.name)
        try:
            pkgs = parse_requirements_file(path)
            assert any("pyside6" in p[0] for p in pkgs)
            assert any("requests" in p[0] for p in pkgs)
        finally:
            path.unlink(missing_ok=True)

    def test_spdx_id(self):
        import generate_sbom as m
        spdx_id = m.spdx_id

        assert "Package" in spdx_id("foo", "1.0.0")
        assert "foo" in spdx_id("foo", "1.0.0")


class TestGenerateBuildMetadata:
    """Tests for generate_build_metadata."""

    def test_get_version(self):
        import generate_build_metadata as m
        get_version = m.get_version

        v = get_version()
        assert v is not None
        assert len(v) >= 5  # e.g. 1.0.0

    def test_generate_build_metadata_output(self):
        import generate_build_metadata as m
        get_project_root = m.get_project_root

        root = get_project_root()
        assert root is not None
        assert (root / "scripts" / "generate_build_metadata.py").exists()


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
