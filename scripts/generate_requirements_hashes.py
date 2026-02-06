#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Generate requirements file with hashes for pip --require-hashes.

Design: 02 Release Engineering (2.8). Use in release builds for deterministic
dependency installation. Copies requirements-build.txt and runs hashin to add
--hash=sha256:... to each line, then you install with:
  pip install -r requirements-build-hashed.txt --require-hashes

Requires: pip install hashin

Usage:
    pip install hashin
    python scripts/generate_requirements_hashes.py [--output path]
"""

import argparse
import shutil
import subprocess
import sys
from pathlib import Path


def get_project_root() -> Path:
    return Path(__file__).resolve().parent.parent


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate hashed requirements for pip --require-hashes (2.8)."
    )
    parser.add_argument(
        "--output",
        "-o",
        type=Path,
        default=None,
        help="Output path (default: requirements-build-hashed.txt)",
    )
    parser.add_argument(
        "--input",
        "-i",
        type=Path,
        default=None,
        help="Input requirements (default: requirements-build.txt)",
    )
    args = parser.parse_args()

    root = get_project_root()
    src = args.input or root / "requirements-build.txt"
    dst = args.output or root / "requirements-build-hashed.txt"

    if not src.exists():
        print(f"Error: Input not found: {src}", file=sys.stderr)
        sys.exit(1)

    shutil.copy(src, dst)
    try:
        subprocess.run(
            [sys.executable, "-m", "hashin", "-r", str(dst), "--update-all"],
            check=True,
            cwd=root,
            timeout=300,
        )
    except FileNotFoundError:
        print(
            "Error: hashin not found. Install with: pip install hashin",
            file=sys.stderr,
        )
        sys.exit(1)
    except subprocess.CalledProcessError as e:
        print(f"Error: hashin failed: {e}", file=sys.stderr)
        sys.exit(1)
    except subprocess.TimeoutExpired:
        print("Error: hashin timed out", file=sys.stderr)
        sys.exit(1)

    print(f"Generated {dst}. Install with: pip install -r {dst} --require-hashes")


if __name__ == "__main__":
    main()
