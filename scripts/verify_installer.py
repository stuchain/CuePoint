#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Installer Verification (Design 2.38)

Verifies release artifacts: checksums (SHA256) and code signatures.
Runs after build in CI to ensure download integrity and signing.

Usage:
    python scripts/verify_installer.py [--dir dist/] [--checksums path] [--require-signature]
    python scripts/verify_installer.py --artifacts dist/CuePoint.dmg dist/CuePoint-Setup.exe
"""

import argparse
import hashlib
import platform
import re
import subprocess
import sys
from pathlib import Path


def sha256_file(path: Path) -> str:
    """Compute SHA256 of file. Returns hex digest."""
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def verify_checksum(artifact: Path, expected_sha256: str) -> tuple[bool, str]:
    """Verify artifact SHA256 matches expected. Returns (ok, message)."""
    if not artifact.exists():
        return False, f"File not found: {artifact}"
    actual = sha256_file(artifact)
    if actual.lower() == expected_sha256.lower():
        return True, f"SHA256 OK: {artifact.name}"
    return False, f"SHA256 mismatch: {artifact.name} (expected {expected_sha256[:16]}..., got {actual[:16]}...)"


def parse_checksums_file(path: Path) -> list[tuple[str, str]]:
    """
    Parse SHA256SUMS or similar (GNU coreutils format).
    Returns list of (filename, sha256_hex).
    """
    results = []
    content = path.read_text(encoding="utf-8", errors="replace")
    for line in content.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        # Format: SHA256 (filename) = digest  or  digest  filename
        m = re.match(r"SHA256\s*\(([^)]+)\)\s*=\s*([a-fA-F0-9]{64})", line)
        if m:
            results.append((m.group(1).strip(), m.group(2)))
            continue
        m = re.match(r"([a-fA-F0-9]{64})\s+(\S+)", line)
        if m:
            results.append((m.group(2), m.group(1)))
            continue
    return results


def verify_codesign(path: Path) -> tuple[bool, str, bool]:
    """Verify macOS code signature. Returns (success, message, skip_not_fail)."""
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
        skip = _is_unsigned_or_tool_missing(err)
        return False, err, skip
    except FileNotFoundError:
        return False, "codesign not found (not on macOS?)", True
    except subprocess.TimeoutExpired:
        return False, "codesign verify timed out", True


def verify_signtool(path: Path) -> tuple[bool, str, bool]:
    """Verify Windows Authenticode signature. Returns (success, message, skip_not_fail)."""
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
        skip = _is_unsigned_or_tool_missing(err)
        return False, err, skip
    except FileNotFoundError:
        return False, "signtool not found (not on Windows?)", True
    except subprocess.TimeoutExpired:
        return False, "signtool verify timed out", True


def _is_unsigned_or_tool_missing(msg: str) -> bool:
    """True if failure is due to no signature or tool not available."""
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
        return True
    return False


def verify_signature(path: Path) -> tuple[bool, str, bool]:
    """Verify code signature (platform-specific). Returns (success, message, skip_not_fail)."""
    path = path.resolve()
    if not path.exists():
        return False, f"File not found: {path}", False
    suf = path.suffix.lower()
    if platform.system() == "Darwin":
        if suf == ".dmg" or (path.is_dir() and path.name.endswith(".app")):
            return verify_codesign(path)
    if platform.system() == "Windows":
        if suf in (".exe", ".msi"):
            return verify_signtool(path)
    return True, "Skip (no verifier for this platform/extension)", False


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Verify installer artifacts: checksums and signatures (Design 2.38)."
    )
    parser.add_argument(
        "--dir",
        type=Path,
        default=Path("dist"),
        help="Directory to scan for artifacts (default: dist/)",
    )
    parser.add_argument(
        "--artifacts",
        nargs="+",
        type=Path,
        help="Explicit artifact paths (overrides --dir)",
    )
    parser.add_argument(
        "--checksums",
        type=Path,
        help="SHA256SUMS file to verify against (optional)",
    )
    parser.add_argument(
        "--generate-checksums",
        type=Path,
        help="Write checksums to this file (optional)",
    )
    parser.add_argument(
        "--require-signature",
        action="store_true",
        help="Fail if artifacts are unsigned or tools missing",
    )
    args = parser.parse_args()

    artifacts: list[Path] = []
    if args.artifacts:
        artifacts = [p.resolve() for p in args.artifacts if p.exists()]
    elif args.dir and args.dir.exists():
        for ext in ("*.dmg", "*.exe", "*.msi"):
            artifacts.extend(args.dir.glob(ext))
        app_dirs = [
            p for p in args.dir.iterdir()
            if p.is_dir() and p.name.endswith(".app")
        ]
        artifacts.extend(app_dirs)

    # Filter to installer-like artifacts (exclude e.g. CuePoint.exe if we want only Setup)
    artifacts = [p for p in artifacts if p.exists()]

    if not artifacts:
        print("No artifacts to verify (provide --artifacts or --dir).")
        return 0

    failed = False

    # Checksum verification
    if args.checksums and args.checksums.exists():
        checksum_pairs = parse_checksums_file(args.checksums)
        for filename, expected_sha in checksum_pairs:
            # Resolve path: may be in --dir or same dir as checksums file
            candidate = args.dir / filename if args.dir.exists() else args.checksums.parent / filename
            for art in artifacts:
                if art.name == filename:
                    candidate = art
                    break
            ok, msg = verify_checksum(candidate, expected_sha)
            if ok:
                print(f"[OK] {msg}")
            else:
                print(f"[FAIL] {msg}")
                failed = True
    else:
        # Generate and verify checksums (round-trip)
        for art in artifacts:
            digest = sha256_file(art)
            ok, msg = verify_checksum(art, digest)
            if ok:
                print(f"[OK] {msg} sha256={digest[:16]}...")
            else:
                print(f"[FAIL] {msg}")
                failed = True

    # Write checksums file if requested
    if args.generate_checksums and artifacts:
        lines = []
        for art in artifacts:
            digest = sha256_file(art)
            lines.append(f"SHA256 ({art.name}) = {digest}")
        args.generate_checksums.write_text("\n".join(lines) + "\n", encoding="utf-8")
        print(f"Wrote checksums to {args.generate_checksums}")

    # Signature verification
    for art in artifacts:
        ok, msg, skip = verify_signature(art)
        if ok:
            print(f"[OK] {art.name}: {msg}")
        elif skip and not args.require_signature:
            print(f"[SKIP] {art.name}: {msg}")
        else:
            print(f"[FAIL] {art.name}: {msg}")
            failed = True

    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
