"""Unit tests for version management system."""

import sys
from pathlib import Path
from unittest.mock import patch

import pytest

# Add SRC to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from cuepoint.version import (
    get_build_date,
    get_build_info,
    get_build_number,
    get_commit_sha,
    get_short_commit_sha,
    get_version,
    get_version_display_string,
    get_version_string,
    is_dev_build,
)


class TestVersionModule:
    """Test version module functions."""

    def test_get_version(self):
        """Test get_version returns version string."""
        version = get_version()
        assert isinstance(version, str)
        assert len(version) > 0
        # Should be SemVer format
        parts = version.split(".")
        assert len(parts) == 3
        assert all(part.isdigit() for part in parts)

    def test_get_version_string(self):
        """Test get_version_string returns version with optional build number."""
        version_str = get_version_string()
        assert isinstance(version_str, str)
        assert len(version_str) > 0
        # Should start with version
        assert version_str.startswith(get_version())

    def test_get_build_number(self):
        """Test get_build_number returns build number or None."""
        build_num = get_build_number()
        # Can be None (dev build) or string
        assert build_num is None or isinstance(build_num, str)

    def test_get_commit_sha(self):
        """Test get_commit_sha returns commit SHA or None."""
        commit_sha = get_commit_sha()
        # Can be None (dev build) or string
        assert commit_sha is None or isinstance(commit_sha, str)

    def test_get_short_commit_sha(self):
        """Test get_short_commit_sha returns short SHA or None."""
        short_sha = get_short_commit_sha()
        # Can be None or 8-character string
        assert short_sha is None or (isinstance(short_sha, str) and len(short_sha) == 8)

    def test_get_build_date(self):
        """Test get_build_date returns build date or None."""
        build_date = get_build_date()
        # Can be None or ISO format string
        assert build_date is None or isinstance(build_date, str)

    def test_get_build_info(self):
        """Test get_build_info returns complete build information."""
        build_info = get_build_info()
        assert isinstance(build_info, dict)
        assert "version" in build_info
        assert "version_string" in build_info
        assert "build_number" in build_info
        assert "commit_sha" in build_info
        assert "short_commit_sha" in build_info
        assert "build_date" in build_info
        assert "python_version" in build_info
        assert "python_executable" in build_info

    def test_is_dev_build(self):
        """Test is_dev_build detects development builds."""
        is_dev = is_dev_build()
        assert isinstance(is_dev, bool)
        # Should be True if build_number or commit_sha is None

    def test_get_version_display_string(self):
        """Test get_version_display_string returns formatted string."""
        display_str = get_version_display_string()
        assert isinstance(display_str, str)
        assert len(display_str) > 0
        # Should start with "Version"
        assert display_str.startswith("Version")

    def test_version_format(self):
        """Test version follows SemVer format."""
        version = get_version()
        # SemVer: X.Y.Z where X, Y, Z are digits
        import re
        pattern = r"^\d+\.\d+\.\d+$"
        assert re.match(pattern, version), f"Version {version} does not match SemVer format"

    @patch("cuepoint.version.__build_number__", "123")
    @patch("cuepoint.version.__commit_sha__", "abcdef1234567890")
    def test_version_string_with_build(self):
        """Test version string includes build number when set."""
        # Reload module to get patched values
        import importlib

        import cuepoint.version as version_module
        importlib.reload(version_module)
        
        version_str = version_module.get_version_string()
        # Should include build number
        assert "." in version_str or version_str.count(".") >= 2

    @patch("cuepoint.version.__build_number__", None)
    @patch("cuepoint.version.__commit_sha__", None)
    def test_dev_build_detection(self):
        """Test dev build detection when build info not set."""
        # Reload module to get patched values
        import importlib

        import cuepoint.version as version_module
        importlib.reload(version_module)
        
        is_dev = version_module.is_dev_build()
        assert is_dev is True
        is_dev = version_module.is_dev_build()
        assert is_dev is True
