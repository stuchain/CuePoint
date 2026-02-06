#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Generate requirements file with hashes for pip --require-hashes.

Design: 02 Release Engineering (2.8). Use in release builds for deterministic
dependency installation. Uses pip-compile to resolve all transitive dependencies
and add --hash=sha256:... for each package, then you install with:
  pip install -r requirements-build-hashed.txt --require-hashes

Requires: pip install pip-tools

Usage:
    pip install pip-tools
    python scripts/generate_requirements_hashes.py [--output path]
"""

import argparse
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

    try:
        subprocess.run(
            [
                sys.executable,
                "-m",
                "piptools",
                "compile",
                str(src),
                "--generate-hashes",
                "--allow-unsafe",
                "--output-file",
                str(dst),
                "--resolver",
                "backtracking",
            ],
            check=True,
            cwd=root,
            timeout=600,
        )
    except FileNotFoundError:
        print(
            "Error: pip-tools not found. Install with: pip install pip-tools",
            file=sys.stderr,
        )
        sys.exit(1)
    except subprocess.CalledProcessError as e:
        print(f"Error: pip-compile failed: {e}", file=sys.stderr)
        sys.exit(1)
    except subprocess.TimeoutExpired:
        print("Error: pip-compile timed out", file=sys.stderr)
        sys.exit(1)

    print(f"Generated {dst}. Install with: pip install -r {dst} --require-hashes")


if __name__ == "__main__":
    main()
