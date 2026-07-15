#!/usr/bin/env python3
"""Verify Electron desktop package declares the same engine version as cuepoint.version."""

from __future__ import annotations

import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
DESKTOP_PKG = REPO_ROOT / "apps" / "desktop-electron" / "package.json"

sys.path.insert(0, str(REPO_ROOT / "src"))

from cuepoint.version import __version__  # noqa: E402


def main() -> int:
    pkg = json.loads(DESKTOP_PKG.read_text(encoding="utf-8"))
    declared = (pkg.get("cuepoint") or {}).get("engineVersion")
    if not declared:
        print(
            "FAIL: apps/desktop-electron/package.json missing cuepoint.engineVersion",
            file=sys.stderr,
        )
        return 1
    if declared != __version__:
        print(
            f"FAIL: engine version mismatch — package.json cuepoint.engineVersion={declared!r}, "
            f"cuepoint.version.__version__={__version__!r}",
            file=sys.stderr,
        )
        return 1
    print(f"OK: desktop engineVersion matches cuepoint {__version__}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
