#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Version Information for CuePoint

This module serves as the single source of truth for version information.
Version follows Semantic Versioning (SemVer): MAJOR.MINOR.PATCH

Build identifiers (build_number, commit_sha, build_date) are ``None`` unless a
build recorded them (REPORT-07): ``scripts/build_engine_sidecar.py`` writes the
commit and date into ``cuepoint_build.json`` inside the sidecar, and this module
reads it when frozen. A source checkout has none, so a build never claims to be
another one.
"""

import json
import sys
from pathlib import Path
from typing import Any, Dict, Optional

# Version follows Semantic Versioning (SemVer): MAJOR.MINOR.PATCH
__version__ = "1.0.0-feb1"

# When running locally (not frozen/packaged), report this version for update testing
__version_local_dev__ = "1.0.0-test1.0"

#: The release name every process reports to Sentry (REPORT-07, DEC-126). Electron main builds the
#: same name from ``package.json``'s ``cuepoint.engineVersion``; ``check_desktop_version_coupling.py``
#: holds the two prefixes and the versions equal.
RELEASE_PREFIX = "cuepoint@"

#: The file the sidecar build writes beside the frozen engine, with the commit and date it was built from.
BUILD_INFO_FILENAME = "cuepoint_build.json"

#: A short commit (Sentry's ``dist``) is this many characters, as git abbreviates by default.
SHORT_COMMIT_LENGTH = 7


def _is_running_locally() -> bool:
    """True when running from source (not a frozen/packaged build)."""
    return not getattr(sys, "frozen", False)


def _read_build_info() -> Dict[str, Any]:
    """What the build recorded, or ``{}``: a source checkout, a missing or unreadable file."""
    bundle = getattr(sys, "_MEIPASS", None)
    if _is_running_locally() or not bundle:
        return {}
    try:
        data = json.loads((Path(bundle) / BUILD_INFO_FILENAME).read_text("utf-8"))
    except (OSError, ValueError):
        return {}
    return data if isinstance(data, dict) else {}


def _text(value: Any) -> Optional[str]:
    return value if isinstance(value, str) and value.strip() else None


_recorded = _read_build_info()

# Build identifiers: None unless the build recorded them.
__build_number__: Optional[str] = _text(_recorded.get("build_number"))
__commit_sha__: Optional[str] = _text(_recorded.get("commit_sha"))
__build_date__: Optional[str] = _text(_recorded.get("build_date"))


def get_release() -> str:
    """The release name reported to Sentry: ``cuepoint@<__version__>``.

    Built from ``__version__``, never ``get_version()``, which answers a different string from source.
    """
    return f"{RELEASE_PREFIX}{__version__}"


def get_version() -> str:
    """Get version string (MAJOR.MINOR.PATCH).

    When running locally (not packaged), returns __version_local_dev__ (e.g. 1.0.0-test1.0)
    so the update checker uses the test track. Packaged builds use __version__.
    """
    if _is_running_locally():
        return __version_local_dev__
    return __version__


def get_version_string() -> str:
    """Get full version string with build number if available.

    Returns:
        Version string, optionally with build number appended.
    """
    version = get_version()
    if __build_number__ and not _is_running_locally():
        version += f".{__build_number__}"
    return version


def get_build_number() -> Optional[str]:
    """Get build number.

    Returns:
        Build number string, or None if not set.
    """
    return __build_number__


def get_commit_sha() -> Optional[str]:
    """Get commit SHA.

    Returns:
        Full commit SHA, or None if not set.
    """
    return __commit_sha__


def get_short_commit_sha() -> Optional[str]:
    """Get short commit SHA (7 characters, Sentry's ``dist``).

    Returns:
        Short commit SHA (first 7 characters), or None if not set.
    """
    if __commit_sha__:
        return __commit_sha__[:SHORT_COMMIT_LENGTH]
    return None


def get_build_date() -> Optional[str]:
    """Get build date.

    Returns:
        Build date in ISO format, or None if not set.
    """
    return __build_date__


def get_build_info() -> Dict[str, Any]:
    """Get complete build information for diagnostics.

    Returns:
        Dictionary containing all version and build information.
    """
    return {
        "version": get_version(),
        "version_string": get_version_string(),
        "build_number": __build_number__,
        "commit_sha": __commit_sha__,
        "short_commit_sha": get_short_commit_sha(),
        "build_date": __build_date__,
        "python_version": sys.version,
        "python_executable": sys.executable,
    }


def is_dev_build() -> bool:
    """Check if this is a development build.

    A development build is one that recorded no commit.

    Returns:
        True if this is a development build, False otherwise.
    """
    return __commit_sha__ is None


def get_version_display_string() -> str:
    """Get formatted version string for display.

    Returns:
        Formatted version string suitable for display in UI.
    """
    version_str = f"Version {get_version()}"
    if __build_number__ and not _is_running_locally():
        version_str += f" (Build {__build_number__})"
    if __commit_sha__:
        version_str += f" - {get_short_commit_sha()}"
    return version_str
