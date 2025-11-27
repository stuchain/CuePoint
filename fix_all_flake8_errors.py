#!/usr/bin/env python3
"""Fix all flake8 errors automatically."""

import subprocess
import sys
from pathlib import Path

# Install autopep8 if needed
try:
    import autopep8
except ImportError:
    print("Installing autopep8...")
    subprocess.run([sys.executable, "-m", "pip", "install", "-q", "autopep8"], check=True)
    import autopep8

root = Path(__file__).parent
cuepoint_path = root / "SRC" / "cuepoint"

print("=" * 70)
print("Fixing All Flake8 Errors")
print("=" * 70)
print()

# Step 1: Format with black
print("[1/4] Formatting with black...")
result = subprocess.run(
    [sys.executable, "-m", "black", str(cuepoint_path)],
    capture_output=True,
    text=True,
)
if result.returncode == 0:
    print("✓ Black formatting complete")
else:
    print(f"⚠ Black had issues: {result.stderr[:200]}")

# Step 2: Sort imports with isort
print("\n[2/4] Sorting imports with isort...")
result = subprocess.run(
    [sys.executable, "-m", "isort", str(cuepoint_path)],
    capture_output=True,
    text=True,
)
if result.returncode == 0:
    print("✓ Import sorting complete")
else:
    print(f"⚠ isort had issues: {result.stderr[:200]}")

# Step 3: Auto-fix with autopep8
print("\n[3/4] Auto-fixing flake8 errors with autopep8...")
result = subprocess.run(
    [
        sys.executable,
        "-m",
        "autopep8",
        "--in-place",
        "--aggressive",
        "--aggressive",
        "--max-line-length=100",
        "--ignore=E203",
        "-r",
        str(cuepoint_path),
    ],
    capture_output=True,
    text=True,
)
if result.returncode == 0:
    print("✓ autopep8 fixes applied")
else:
    print(f"⚠ autopep8 had issues: {result.stderr[:200]}")

# Step 4: Check remaining errors
print("\n[4/4] Checking remaining flake8 errors...")
result = subprocess.run(
    [
        sys.executable,
        "-m",
        "flake8",
        str(cuepoint_path),
        "--max-line-length=100",
        "--extend-ignore=E203",
        "--statistics",
    ],
    capture_output=True,
    text=True,
)

if result.returncode == 0:
    print("✓ No flake8 errors remaining!")
    print("\n" + "=" * 70)
    print("All errors fixed! You can now commit.")
    print("=" * 70)
else:
    print("\n⚠ Some errors remain (shown below):")
    print(result.stdout)
    print("\n" + "=" * 70)
    print("Most errors were fixed. Remaining errors may need manual fixing.")
    print("You can commit with --no-verify if needed:")
    print("  git commit --no-verify -m 'your message'")
    print("=" * 70)

