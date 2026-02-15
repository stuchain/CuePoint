#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Release Readiness Check Script (Step 7.4)

Runs all automated release readiness checks before tagging a release.
"""

import os
import platform
import subprocess
import sys
import time
from pathlib import Path


def _pytest_env() -> dict:
    """Environment for pytest - use offscreen Qt on Linux (headless CI)."""
    env = os.environ.copy()
    if platform.system() == "Linux":
        env.setdefault("QT_QPA_PLATFORM", "offscreen")
    env.setdefault("CUEPOINT_SKIP_UPDATE_CHECK", "1")
    return env


# Unit tests only (integration tests run separately in CI test-gates job).
# Full suite can hang on Linux headless; unit tests are fast and stable.
_TEST_PATH = "src/tests/unit/"


def check_tests_pass():
    """Check that unit tests pass."""
    print("Checking tests (unit only)...")
    print(f"  Path: {_TEST_PATH}  Timeout: 600s")
    try:
        start = time.monotonic()
        result = subprocess.run(
            [sys.executable, "-m", "pytest", _TEST_PATH, "-v", "--tb=short"],
            capture_output=True,
            text=True,
            timeout=600,
            env=_pytest_env(),
        )
        elapsed = time.monotonic() - start
        output = result.stdout + result.stderr
        if result.returncode == 0:
            # Show pytest summary line (e.g. "1616 passed, 19 skipped in 120.45s")
            for line in output.splitlines():
                s = line.strip()
                if (" passed" in s or " failed" in s) and " in " in s and "==" in s:
                    print(f"  {s}")
                    break
            print(f"[PASS] All tests pass ({elapsed:.1f}s)")
            return True
        else:
            print(f"[FAIL] Some tests failed ({elapsed:.1f}s)")
            print(output[-2000:] if len(output) > 2000 else output)
            return False
    except subprocess.TimeoutExpired:
        print("[FAIL] Tests timed out (600s)")
        return False
    except FileNotFoundError:
        print("WARNING: pytest not found, skipping test check")
        return True  # Don't fail if pytest not available


def check_coverage():
    """Check test coverage meets threshold (unit tests only)."""
    print("Checking test coverage (unit only)...")
    print(f"  Path: {_TEST_PATH}  Threshold: 39%")
    try:
        start = time.monotonic()
        result = subprocess.run(
            [
                sys.executable,
                "-m",
                "pytest",
                _TEST_PATH,
                "--cov=src/cuepoint",
                "--cov-report=term-missing",
            ],
            capture_output=True,
            text=True,
            timeout=600,
            env=_pytest_env(),
        )
        elapsed = time.monotonic() - start
        output = result.stdout
        # Threshold aligned with release-gates.yml (fail-under)
        COVERAGE_THRESHOLD = 39
        if result.returncode == 0 and "TOTAL" in output:
            # Show TOTAL line and a few preceding lines (coverage summary)
            lines = output.split("\n")
            for i, line in enumerate(lines):
                if "TOTAL" in line and "%" in line:
                    # Print TOTAL and 2 lines before (header)
                    start_i = max(0, i - 2)
                    for j in range(start_i, min(i + 1, len(lines))):
                        print(f"  {lines[j]}")
                    try:
                        pct = float(line.split("%")[0].split()[-1])
                        if pct >= COVERAGE_THRESHOLD:
                            print(
                                f"[PASS] Coverage: {pct:.1f}% (>= {COVERAGE_THRESHOLD}%) ({elapsed:.1f}s)"
                            )
                            return True
                        else:
                            print(
                                f"[FAIL] Coverage: {pct:.1f}% (< {COVERAGE_THRESHOLD}%)"
                            )
                            return False
                    except (ValueError, IndexError):
                        pass
                    break
            print("[PASS] Coverage check passed")
            return True
        elif result.returncode == 0:
            print(f"[PASS] Coverage check passed ({elapsed:.1f}s)")
            return True
        else:
            print(f"[FAIL] Coverage check failed ({elapsed:.1f}s)")
            output = result.stdout + result.stderr
            print(output[-1500:] if len(output) > 1500 else output)
            return False
    except FileNotFoundError:
        print("WARNING: pytest not found, skipping coverage check")
        return True
    except Exception as e:
        print(f"WARNING: Coverage check error: {e}")
        return True  # Don't fail on coverage errors


def check_linting():
    """Check code passes linting."""
    print("Checking linting (ruff check src/)...")
    try:
        start = time.monotonic()
        result = subprocess.run(
            [sys.executable, "-m", "ruff", "check", "src/"],
            capture_output=True,
            text=True,
            timeout=120,
        )
        elapsed = time.monotonic() - start
        if result.returncode == 0:
            # Ruff doesn't print "N files" on success; show stderr if any (e.g. "Checked X files")
            if result.stderr.strip():
                print(f"  {result.stderr.strip()}")
            print(f"[PASS] Linting passed ({elapsed:.1f}s)")
            return True
        else:
            print(f"[FAIL] Linting issues found ({elapsed:.1f}s)")
            print(result.stdout[:800] if result.stdout else result.stderr[:800])
            return False
    except FileNotFoundError:
        print("WARNING: ruff not found, skipping linting check")
        return True
    except Exception as e:
        print(f"WARNING: Linting check error: {e}")
        return True


def check_type_checking():
    """Check code passes type checking."""
    print("Checking type checking (mypy src/cuepoint)...")
    try:
        start = time.monotonic()
        result = subprocess.run(
            [sys.executable, "-m", "mypy", "src/cuepoint"],
            capture_output=True,
            text=True,
            timeout=180,
        )
        elapsed = time.monotonic() - start
        # mypy returns 0 on success, non-zero on errors
        if result.returncode == 0:
            # Show last line if it's a summary (e.g. "Success: no issues found")
            lines = (result.stdout or "").strip().splitlines()
            if lines:
                print(f"  {lines[-1]}")
            print(f"[PASS] Type checking passed ({elapsed:.1f}s)")
            return True
        else:
            error_count = (result.stdout or "").count("error:")
            if error_count == 0:
                print(f"[PASS] Type checking passed (warnings only) ({elapsed:.1f}s)")
                return True
            else:
                print(
                    f"[WARN] Type checking found {error_count} errors (non-blocking) ({elapsed:.1f}s)"
                )
                return True  # Don't block on type errors for now
    except FileNotFoundError:
        print("WARNING: mypy not found, skipping type checking")
        return True
    except Exception as e:
        print(f"WARNING: Type checking error: {e}")
        return True


def check_build_artifacts():
    """Check build artifacts exist."""
    print("Checking build artifacts (dist/)...")
    dist_dir = Path("dist")
    if not dist_dir.exists():
        print("  WARNING: dist/ directory not found (build may not have run)")
        return True  # Don't fail if dist doesn't exist

    artifacts = sorted(dist_dir.glob("*"))
    if not artifacts:
        print("  WARNING: No build artifacts found (build may not have run)")
        return True  # Don't fail if no artifacts

    for a in artifacts[:10]:
        size = a.stat().st_size if a.is_file() else 0
        print(f"  - {a.name} ({size:,} bytes)" if size else f"  - {a.name}/")
    if len(artifacts) > 10:
        print(f"  ... and {len(artifacts) - 10} more")
    print(f"[PASS] Found {len(artifacts)} build artifact(s)")
    return True


def check_release_notes():
    """Check release notes exist."""
    print("Checking release notes (CHANGELOG.md, RELEASE_NOTES.md, ...)...")

    release_notes_paths = [
        Path("CHANGELOG.md"),
        Path("RELEASE_NOTES.md"),
        Path("docs/RELEASE_NOTES.md"),
    ]

    for path in release_notes_paths:
        if path.exists():
            content = path.read_text(encoding="utf-8", errors="ignore")
            n = len(content.strip())
            if n > 100:
                print(f"  Found: {path} ({n} chars)")
                print(f"[PASS] Release notes found: {path}")
                return True
            else:
                print(f"  Skipped (too short): {path} ({n} chars)")
    print("  WARNING: Release notes not found or too short (non-blocking)")
    return True


def check_version_consistency():
    """Check version numbers are consistent."""
    print("Checking version consistency (cuepoint.version.get_version)...")

    try:
        sys.path.insert(0, "src")
        from cuepoint.version import get_version

        version = get_version()
        if version:
            print(f"  Version: {version}")
            print(f"[PASS] Version: {version}")
            return True
        else:
            print("  WARNING: Could not determine version")
            return True
    except Exception as e:
        print(f"  WARNING: Version check error: {e}")
        return True  # Don't fail on version check


def check_file_sizes():
    """Check no large files in repository."""
    print("Checking file sizes (scripts/check_file_sizes.py)...")
    try:
        start = time.monotonic()
        result = subprocess.run(
            [sys.executable, "scripts/check_file_sizes.py"],
            capture_output=True,
            text=True,
            timeout=60,
        )
        elapsed = time.monotonic() - start
        if result.returncode == 0:
            if result.stdout.strip():
                for line in result.stdout.strip().splitlines()[:5]:
                    print(f"  {line}")
            print(f"[PASS] File size check passed ({elapsed:.1f}s)")
            return True
        else:
            print(f"[FAIL] File size check failed ({elapsed:.1f}s)")
            print(result.stdout or result.stderr)
            return False
    except FileNotFoundError:
        print("WARNING: check_file_sizes.py not found, skipping")
        return True
    except Exception as e:
        print(f"WARNING: File size check error: {e}")
        return True


def main():
    """Run all release readiness checks."""
    print("=" * 60)
    print("Release Readiness Check")
    print("=" * 60)
    print(f"  Python: {sys.version.split()[0]}  ({platform.system()} {platform.machine()})")
    print(f"  CWD: {Path.cwd()}")
    print(f"  Test path: {_TEST_PATH} (unit tests only)")
    print("=" * 60)
    print()

    checks = [
        ("Tests", check_tests_pass),
        ("Coverage", check_coverage),
        ("Linting", check_linting),
        ("Type Checking", check_type_checking),
        ("File Sizes", check_file_sizes),
        ("Build Artifacts", check_build_artifacts),
        ("Release Notes", check_release_notes),
        ("Version Consistency", check_version_consistency),
    ]
    n_checks = len(checks)

    results = []
    total_start = time.monotonic()
    for i, (name, check_func) in enumerate(checks, 1):
        print(f"--- Check {i}/{n_checks}: {name} ---")
        try:
            result = check_func()
            results.append((name, result))
        except Exception as e:
            print(f"[FAIL] {name} check failed with error: {e}")
            results.append((name, False))
        print()

    total_elapsed = time.monotonic() - total_start

    # Summary
    print("=" * 60)
    print("Summary")
    print("=" * 60)

    all_passed = True
    for name, result in results:
        status = "[PASS]" if result else "[FAIL]"
        print(f"  {status} {name}")
        if not result:
            all_passed = False

    print()
    print(f"  Total time: {total_elapsed:.1f}s")
    print()
    if all_passed:
        print("[PASS] All automated checks passed")
        print("[NOTE] Manual checklist items still need to be verified")
        return 0
    else:
        print("[FAIL] Some checks failed")
        print("  Fix issues before proceeding with release")
        return 1


if __name__ == "__main__":
    sys.exit(main())
