#!/usr/bin/env python3
"""Fail if PySide6/Qt is imported from Electron/engine runtime packages."""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCAN_ROOT = ROOT / "src" / "cuepoint"

# Packages that must remain Qt-free after Phase 10 compat extraction.
CORE_PREFIXES = (
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
        for line_no, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            if QT_IMPORT.search(line):
                violations.append(f"{rel}:{line_no}: {line.strip()}")

    if violations:
        print("PySide6/Qt imports found in engine/runtime packages:\n")
        print("\n".join(violations))
        return 1

    print("OK: no Qt imports in engine/cli/compat/models")
    return 0


if __name__ == "__main__":
    sys.exit(main())
