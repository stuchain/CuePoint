#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Compliance validation entry point (Step 8.5).

This is intentionally lightweight and geared toward CI gates:
- Verifies pinned build requirements file exists
- Validates license metadata for direct build dependencies
- Ensures Privacy dialog is present (in-app disclosure)
- Ensures PRIVACY_NOTICE.md exists (external disclosure)
"""

from __future__ import annotations

import sys
from pathlib import Path


def main() -> int:
    repo_root = Path(__file__).resolve().parent.parent

    requirements_build = repo_root / "requirements-build.txt"
    if not requirements_build.exists():
        print("ERROR: requirements-build.txt is missing")
        return 1

    privacy_dialog = repo_root / "SRC" / "cuepoint" / "ui" / "dialogs" / "privacy_dialog.py"
    if not privacy_dialog.exists():
        print("ERROR: Privacy dialog is missing (expected in-app privacy disclosure)")
        return 1

    privacy_notice = repo_root / "PRIVACY_NOTICE.md"
    if not privacy_notice.exists():
        print("ERROR: PRIVACY_NOTICE.md is missing (expected external privacy disclosure)")
        return 1

    # Run license validation for direct build dependencies
    validate_script = repo_root / "scripts" / "validate_licenses.py"
    # Allow unknown license metadata for now; CI still produces a report via license-compliance.yml.
    cmd = [
        sys.executable,
        str(validate_script),
        "--requirements",
        str(requirements_build),
        "--allow-unknown",
    ]
    print("Running:", " ".join(cmd))
    import subprocess

    result = subprocess.run(cmd, check=False)
    if result.returncode != 0:
        print("ERROR: License validation failed")
        return result.returncode

    print("Compliance validation OK.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())


