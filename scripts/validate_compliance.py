#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Compliance validation entry point (Step 8.5).

This is intentionally lightweight and geared toward CI gates:
- Verifies pinned build requirements file exists
- Validates license metadata for direct build dependencies
- Ensures the Electron app's Privacy dialog component is present (in-app disclosure)
- Ensures PRIVACY_NOTICE.md exists (external disclosure)
- Holds the disclosures to what the app does (REPORT-08, DEC-128): released builds send error
  reports unless the user turns them off, so neither the notice nor the dialog may say nothing is
  collected, both must name Sentry and the switch, and the two notices must be equal
"""

from __future__ import annotations

import re
import sys
from pathlib import Path


#: Wording that was true before error reporting and is false now.
_STALE_DIALOG_LINES = ("No telemetry or analytics", "No background data collection")
_STALE_NOTICE_PHRASES = (
    "does not include telemetry",
    "does not collect telemetry",
    "no telemetry / analytics",
)
_SWITCH = "Settings → Privacy → Send error reports"


def check_privacy_disclosures(repo_root: Path) -> list[str]:
    """Problems with the privacy dialog and the two privacy notices; empty when they hold."""
    problems: list[str] = []
    dialog_path = (
        repo_root
        / "apps"
        / "desktop-electron"
        / "renderer"
        / "src"
        / "components"
        / "PrivacyDialog.tsx"
    )
    root_notice = repo_root / "PRIVACY_NOTICE.md"
    policy_notice = repo_root / "docs" / "policy" / "privacy-notice.md"

    source = dialog_path.read_text(encoding="utf-8")
    # The disclosure is the PRIVACY_TEXT literal, not the rest of the component.
    literal = re.search(r"const PRIVACY_TEXT = `(.*?)`;", source, re.DOTALL)
    if literal is None:
        return ["PrivacyDialog.tsx has no PRIVACY_TEXT literal (the in-app disclosure)"]
    dialog = literal.group(1)
    for line in _STALE_DIALOG_LINES:
        if line.lower() in dialog.lower():
            problems.append(
                f"PrivacyDialog.tsx still says {line!r}, but released builds send error reports"
            )
    for needed in ("Sentry", "Error reports"):
        if needed not in dialog:
            problems.append(
                f"PrivacyDialog.tsx does not mention {needed!r} (the error-report disclosure)"
            )

    root_text = root_notice.read_text(encoding="utf-8")
    if policy_notice.exists():
        if policy_notice.read_text(encoding="utf-8") != root_text:
            problems.append(
                "PRIVACY_NOTICE.md and docs/policy/privacy-notice.md are not equal"
            )
    else:
        problems.append("docs/policy/privacy-notice.md is missing")
    plain = root_text.replace("*", "").lower()
    for phrase in _STALE_NOTICE_PHRASES:
        if phrase in plain:
            problems.append(
                f"PRIVACY_NOTICE.md says {phrase!r}: v1.0 collects error reports"
            )
    for needed in ("Sentry", "EU region", _SWITCH):
        if needed not in root_text:
            problems.append(f"PRIVACY_NOTICE.md does not mention {needed!r}")
    return problems


def main() -> int:
    repo_root = Path(__file__).resolve().parent.parent

    requirements_build = repo_root / "requirements-build.txt"
    if not requirements_build.exists():
        print("ERROR: requirements-build.txt is missing")
        return 1

    privacy_dialog = (
        repo_root
        / "apps"
        / "desktop-electron"
        / "renderer"
        / "src"
        / "components"
        / "PrivacyDialog.tsx"
    )
    if not privacy_dialog.exists():
        print(
            "ERROR: PrivacyDialog.tsx is missing (expected in-app privacy disclosure in the Electron renderer)"
        )
        return 1

    privacy_notice = repo_root / "PRIVACY_NOTICE.md"
    if not privacy_notice.exists():
        print(
            "ERROR: PRIVACY_NOTICE.md is missing (expected external privacy disclosure)"
        )
        return 1

    problems = check_privacy_disclosures(repo_root)
    for problem in problems:
        print(f"ERROR: {problem}")
    if problems:
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
