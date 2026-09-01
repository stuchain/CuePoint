#!/usr/bin/env python3
"""Fail if PySide6/Qt is imported from Electron/engine runtime packages."""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCAN_ROOT = ROOT / "src" / "cuepoint"
GUI_APP = ROOT / "src" / "gui_app.py"

# Packages that make up the engine/CLI runtime. AGENTS.md: Qt "must not enter
# core, engine, CLI, or services". PySide6 is not in the default requirements,
# so a Qt import in any of these raises ImportError in the shipped Electron
# engine sidecar.
#
# Deliberately excluded: "utils/" and "update/" still contain Qt imports.
# Those in utils/ are optional/try-guarded with headless fallbacks; update/ is
# the orphaned Qt updater slated for removal (see docs/v1/PHASE1_FOUNDATION.md,
# FOUNDATION-15). Add them here once those are resolved.
CORE_PREFIXES = (
    "core/",
    "data/",
    "services/",
    "incrate/",
    "engine/",
    "cli/",
    "compat/",
    "models/",
)

QT_IMPORT = re.compile(r"^\s*(?:from|import)\s+(?:PySide6|PyQt6|PyQt5)\b")


def main() -> int:
    violations: list[str] = []
    for path in sorted(SCAN_ROOT.rglob("*.py")):
        rel = path.relative_to(SCAN_ROOT).as_posix()
        if not any(rel.startswith(prefix) for prefix in CORE_PREFIXES):
            continue
        for line_no, line in enumerate(
            path.read_text(encoding="utf-8").splitlines(), 1
        ):
            if QT_IMPORT.search(line):
                violations.append(f"{rel}:{line_no}: {line.strip()}")

    if GUI_APP.exists():
        for line_no, line in enumerate(
            GUI_APP.read_text(encoding="utf-8").splitlines(), 1
        ):
            if QT_IMPORT.search(line):
                violations.append(f"gui_app.py:{line_no}: {line.strip()}")

    if violations:
        print("PySide6/Qt imports found in engine/runtime packages:\n")
        print("\n".join(violations))
        return 1

    scanned = ", ".join(p.rstrip("/") for p in CORE_PREFIXES)
    print(f"OK: no Qt imports in {scanned} or gui_app.py")
    return 0


if __name__ == "__main__":
    sys.exit(main())
