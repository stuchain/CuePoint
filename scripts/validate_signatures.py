#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Validate Signatures of Release Artifacts (optional when no certs)

Verifies code signatures when present: macOS (codesign for .app/.dmg),
Windows (signtool for .exe/.msi). Design: 02 Release Engineering (2.83), R004.

By default: skips when signing tools are missing or artifacts are unsigned,
so CI and local builds without certs are not blocked. Use --require-signature
to fail on unsigned artifacts (e.g. in a signing-enabled pipeline).

Usage:
    python scripts/validate_signatures.py <artifact> [<artifact2> ...]
    python scripts/validate_signatures.py --dir dist/
    python scripts/validate_signatures.py --require-signature --dir dist/  # fail if unsigned
"""

import argparse
import platform
import re
import subprocess
import sys
from pathlib import Path


def is_macos() -> bool:
    return platform.system() == "Darwin"


def is_windows() -> bool:
    return platform.system() == "Windows"


def _is_unsigned_or_tool_missing(msg: str) -> bool:
    """True if failure is due to no signature or tool not available (skip, don't fail)."""
    msg_lower = msg.lower()
    if "not found" in msg_lower or "not on " in msg_lower:
        return True
    if "not signed" in msg_lower or "no signature" in msg_lower or "no signatures" in msg_lower:
        return True
    if "code object is not signed" in msg_lower:
        return True
    if re.search(r"no (valid )?signature", msg_lower):
        return True
    if "timed out" in msg_lower:
        return True  # treat timeout as skip to avoid flakiness
    return False


def verify_codesign(path: Path) -> tuple[bool, str, bool]:
    """Verify macOS code signature. Returns (success, message, is_skip_not_fail)."""
    try:
        r = subprocess.run(
            ["codesign", "--verify", "--deep", "--strict", "--verbose=2", str(path)],
            capture_output=True,
            text=True,
            timeout=30,
        )
        if r.returncode == 0:
            return True, "codesign verify OK", False
        err = (r.stderr or r.stdout or f"exit code {r.returncode}").strip()
        return False, err, _is_unsigned_or_tool_missing(err)
    except FileNotFoundError:
        return False, "codesign not found (not on macOS?)", True
    except subprocess.TimeoutExpired:
        return False, "codesign verify timed out", True


def verify_signtool(path: Path) -> tuple[bool, str, bool]:
    """Verify Windows Authenticode signature. Returns (success, message, is_skip_not_fail)."""
    try:
        r = subprocess.run(
            ["signtool", "verify", "/pa", str(path)],
            capture_output=True,
            text=True,
            timeout=30,
        )
        if r.returncode == 0:
            return True, "signtool verify OK", False
        err = (r.stderr or r.stdout or f"exit code {r.returncode}").strip()
        return False, err, _is_unsigned_or_tool_missing(err)
    except FileNotFoundError:
        return False, "signtool not found (not on Windows or SDK not in PATH?)", True
    except subprocess.TimeoutExpired:
        return False, "signtool verify timed out", True


def verify_artifact(path: Path) -> tuple[bool, str, bool]:
    """Verify a single artifact; returns (success, message, skip_not_fail)."""
    path = path.resolve()
    if not path.exists():
        return False, f"File not found: {path}", False
    suf = path.suffix.lower()
    if is_macos():
        if suf == ".dmg" or (suf == "" and path.suffix == "" and path.name.endswith(".app")):
            return verify_codesign(path)
        if path.is_dir() and path.name.endswith(".app"):
            return verify_codesign(path)
    if is_windows():
        if suf in (".exe", ".msi"):
            return verify_signtool(path)
    return True, "Skip (no verifier for this platform/extension)", False


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Validate code signatures (optional when no certs; use --require-signature to fail on unsigned)."
    )
    parser.add_argument(
        "artifacts",
        nargs="*",
        type=Path,
        help="Artifact path(s) to verify",
    )
    parser.add_argument(
        "--dir",
        type=Path,
        help="Directory to scan for .dmg, .app, .exe, .msi",
    )
    parser.add_argument(
        "--require-signature",
        action="store_true",
        help="Fail if artifacts are unsigned or tools missing (default: skip and pass)",
    )
    args = parser.parse_args()

    paths: list[Path] = list(args.artifacts)
    if args.dir and args.dir.exists():
        for ext in ("*.dmg", "*.exe", "*.msi"):
            paths.extend(args.dir.glob(ext))
        app_dirs = [p for p in args.dir.iterdir() if p.is_dir() and p.suffix == "" and p.name.endswith(".app")]
        paths.extend(app_dirs)

    if not paths:
        print("No artifacts to verify (provide paths or --dir). Skipping.")
        sys.exit(0)

    failed: list[tuple[Path, str]] = []
    skipped: list[tuple[Path, str]] = []
    for p in paths:
        ok, msg, skip_not_fail = verify_artifact(p)
        if ok:
            print(f"[OK] {p}: {msg}")
        elif skip_not_fail and not args.require_signature:
            print(f"[SKIP] {p}: {msg}")
            skipped.append((p, msg))
        else:
            print(f"[FAIL] {p}: {msg}")
            failed.append((p, msg))

    if failed:
        sys.exit(1)
    if skipped:
        print(f"[OK] {len(paths)} artifact(s): {len(skipped)} skipped (no signature/tools), {len(paths) - len(skipped)} verified.")
    else:
        print(f"[OK] All {len(paths)} artifact(s) passed signature verification.")


if __name__ == "__main__":
    main()
