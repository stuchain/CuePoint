#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Run test suites by layer. Design 3.34.

Usage:
    python scripts/run_tests.py              # run unit + integration
    python scripts/run_tests.py --unit       # unit only
    python scripts/run_tests.py --integration
    python scripts/run_tests.py --system     # system/CLI smoke
    python scripts/run_tests.py --all        # unit, integration, system
"""

import argparse
import subprocess
import sys
from pathlib import Path


def get_project_root() -> Path:
    return Path(__file__).resolve().parent.parent


def run_pytest(
    path_or_marker: str,
    *,
    by_path: bool = False,
    extra: list[str] | None = None,
    timeout: int = 300,
) -> int:
    """Run pytest with given path or marker. Returns exit code."""
    root = get_project_root()
    cmd = [
        sys.executable,
        "-m",
        "pytest",
        path_or_marker,
        "-v",
        "--tb=short",
        f"--timeout={timeout}",
    ]
    if by_path:
        # Run all tests under the given path (e.g. src/tests/unit/)
        pass
    else:
        cmd.extend(["-m", path_or_marker])
    if extra:
        cmd.extend(extra)
    return subprocess.run(cmd, cwd=str(root)).returncode


def main() -> None:
    parser = argparse.ArgumentParser(description="Run test suites by layer (3.34).")
    parser.add_argument("--unit", action="store_true", help="Run unit tests only")
    parser.add_argument("--integration", action="store_true", help="Run integration tests only")
    parser.add_argument("--system", action="store_true", help="Run system/CLI smoke tests only")
    parser.add_argument("--all", action="store_true", help="Run unit, then integration, then system")
    parser.add_argument("--coverage", action="store_true", help="Report coverage (with --unit or --all)")
    parser.add_argument("--no-slow", action="store_true", help="Exclude @slow tests")
    args = parser.parse_args()

    if not any([args.unit, args.integration, args.system, args.all]):
        # Default: unit + integration (P0)
        args.unit = True
        args.integration = True

    extra = []
    if args.coverage:
        extra.extend(["--cov=src/cuepoint", "--cov-report=term", "--cov-report=xml"])
    if args.no_slow:
        extra.append("-m")
        extra.append("not slow")

    # Run by path so all tests in each layer run (Design 3.34, 3.35, 3.17)
    paths = {
        "unit": "src/tests/unit/",
        "integration": "src/tests/integration/",
        "regression": "src/tests/regression/",
        "system": "src/tests/system/",
    }
    exit_code = 0
    if args.all:
        for name, path in paths.items():
            print(f"\n--- {name} ---")
            ex = []
            if args.no_slow:
                ex.extend(["-m", "not slow"])
            if args.coverage and name == "unit":
                ex.extend(["--cov=src/cuepoint", "--cov-report=term", "--cov-report=xml"])
            exit_code = run_pytest(path, by_path=True, extra=ex)
            if exit_code != 0:
                break
    else:
        if args.unit:
            exit_code = run_pytest(paths["unit"], by_path=True, extra=extra)
        if exit_code == 0 and args.integration:
            exit_code = run_pytest(paths["integration"], by_path=True, extra=extra)
        if exit_code == 0 and args.system:
            exit_code = run_pytest(paths["system"], by_path=True, extra=extra)

    sys.exit(exit_code)


if __name__ == "__main__":
    main()
