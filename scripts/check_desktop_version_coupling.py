#!/usr/bin/env python3
"""Verify the desktop app and the engine name one version and one release.

- ``package.json``'s ``version`` (what ``app.getVersion()`` answers) is present, is not the ``0.0.0``
  placeholder, and equals ``cuepoint.version.__version__``.
- The renderer's fallback ``DESKTOP_ENGINE_VERSION`` (About dialog) equals ``__version__``.
- The release name Electron main builds (``electron/buildInfo.ts``: ``RELEASE_PREFIX`` plus the
  version main hands it, ``app.getVersion()``) equals the one the engine reports at ``/health``
  (``health_payload()['release']``, from ``version.get_release()``), so one build reports one
  release from every process (REPORT-07, DEC-126).
- Main passes ``app.getVersion()`` to ``currentBuildInfo`` (``electron/main.ts``), so no second copy
  of the version is read from anywhere.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Callable, Mapping, Optional

REPO_ROOT = Path(__file__).resolve().parents[1]
DESKTOP_PKG = REPO_ROOT / "apps" / "desktop-electron" / "package.json"
BUILD_INFO_TS = REPO_ROOT / "apps" / "desktop-electron" / "electron" / "buildInfo.ts"
MAIN_TS = REPO_ROOT / "apps" / "desktop-electron" / "electron" / "main.ts"
ABOUT_DIALOG_TSX = (
    REPO_ROOT
    / "apps"
    / "desktop-electron"
    / "renderer"
    / "src"
    / "components"
    / "AboutDialog.tsx"
)

sys.path.insert(0, str(REPO_ROOT / "src"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from cuepoint import version as engine_version  # noqa: E402
from validate_version import validate_scheme  # noqa: E402

#: The version About and Report a problem show before the engine has answered.
_ABOUT_VERSION_RE = re.compile(r'export const DESKTOP_ENGINE_VERSION\s*=\s*"([^"]*)"')
_PREFIX_RE = re.compile(r'export const RELEASE_PREFIX\s*=\s*"([^"]*)"\s*;')
#: How main builds the release: the prefix and the version its `computeBuildInfo` was given.
_RELEASE_RE = re.compile(r"release:\s*`\$\{RELEASE_PREFIX\}\$\{input\.version\}`")
#: Where main takes that version from: the app's own.
_SOURCE_RE = re.compile(
    r"\bconst\s+build\s*=\s*currentBuildInfo\(\s*app\.isPackaged\s*,\s*app\.getVersion\(\)\s*,?\s*\)"
)


def engine_health() -> Mapping[str, object]:
    """What the engine answers at ``/health``, without starting it."""
    from cuepoint.engine.server import health_payload

    return health_payload()


def main_release(
    build_info_ts: Path, main_ts: Path, version_declared: str
) -> tuple[Optional[str], list[str]]:
    """The release main builds for ``version_declared``, read from ``buildInfo.ts`` and ``main.ts``."""
    errors: list[str] = []
    source = build_info_ts.read_text(encoding="utf-8")
    prefix = _PREFIX_RE.search(source)
    if prefix is None:
        errors.append(f"{build_info_ts.name} does not declare RELEASE_PREFIX")
    if _RELEASE_RE.search(source) is None:
        errors.append(
            f"{build_info_ts.name} does not build the release as RELEASE_PREFIX + the app version"
        )
    if _SOURCE_RE.search(main_ts.read_text(encoding="utf-8")) is None:
        errors.append(
            f"{main_ts.name} does not pass app.getVersion() to currentBuildInfo(app.isPackaged, ...)"
        )
    if prefix is None or errors:
        return None, errors
    return f"{prefix.group(1)}{version_declared}", errors


def check(
    desktop_pkg: Path = DESKTOP_PKG,
    build_info_ts: Path = BUILD_INFO_TS,
    health: Callable[[], Mapping[str, object]] = engine_health,
    version: str = engine_version.__version__,
    about_dialog: Path = ABOUT_DIALOG_TSX,
    main_ts: Path = MAIN_TS,
) -> list[str]:
    """Every way the desktop app and the engine disagree; empty when they agree."""
    pkg = json.loads(desktop_pkg.read_text(encoding="utf-8"))
    declared = pkg.get("version")
    if not declared:
        return ["apps/desktop-electron/package.json missing version"]
    if declared == "0.0.0":
        return [
            "apps/desktop-electron/package.json version is the 0.0.0 placeholder: "
            f"it must equal cuepoint.version.__version__={version!r}"
        ]
    in_scheme, scheme_error = validate_scheme(str(declared))
    if not in_scheme:
        return [f"apps/desktop-electron/package.json version: {scheme_error}"]
    if declared != version:
        return [
            f"version mismatch: package.json version={declared!r}, "
            f"cuepoint.version.__version__={version!r}"
        ]
    errors = []
    shown = _ABOUT_VERSION_RE.search(about_dialog.read_text(encoding="utf-8"))
    if shown is None:
        errors.append(f"{about_dialog.name} does not declare DESKTOP_ENGINE_VERSION")
    elif shown.group(1) != version:
        errors.append(
            f"{about_dialog.name} DESKTOP_ENGINE_VERSION={shown.group(1)!r}, "
            f"cuepoint.version.__version__={version!r}"
        )
    release, release_errors = main_release(build_info_ts, main_ts, declared)
    errors += release_errors
    if release is not None:
        reported = health().get("release")
        if reported != release:
            errors.append(
                f"release mismatch: main builds {release!r}, the engine reports {reported!r} at /health"
            )
    return errors


def main() -> int:
    errors = check()
    if errors:
        for message in errors:
            print(f"FAIL: {message}", file=sys.stderr)
        return 1
    print(
        f"OK: desktop version matches cuepoint {engine_version.__version__}; "
        f"main and the engine both report {engine_version.get_release()}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
