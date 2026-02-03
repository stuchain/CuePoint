#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Developer environment setup script. Design 10.15, 10.39.

Validates Python version, creates venv if needed, installs dependencies,
and runs a quick sanity check. Target: new contributor can run the app within 30 minutes.

Usage:
    python scripts/dev_setup.py
    python scripts/dev_setup.py --skip-tests   # Skip test run (faster)
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
from pathlib import Path


def get_project_root() -> Path:
    return Path(__file__).resolve().parent.parent


def check_python_version() -> bool:
    """Require Python 3.11+."""
    v = sys.version_info
    if v.major < 3 or (v.major == 3 and v.minor < 11):
        print(f"ERROR: Python 3.11+ required. You have {v.major}.{v.minor}.{v.micro}")
        return False
    print(f"Python {v.major}.{v.minor}.{v.micro} OK")
    return True


def ensure_venv(root: Path) -> bool:
    """Create .venv if it does not exist."""
    venv_dir = root / ".venv"
    if venv_dir.exists():
        print(".venv exists")
        return True
    print("Creating .venv...")
    r = subprocess.run(
        [sys.executable, "-m", "venv", str(venv_dir)],
        cwd=str(root),
        capture_output=True,
        text=True,
    )
    if r.returncode != 0:
        print(f"ERROR: venv creation failed: {r.stderr}")
        return False
    print(".venv created")
    return True


def get_pip_cmd(root: Path) -> list[str]:
    """Return pip command (use venv pip if available)."""
    venv_pip = root / ".venv" / "Scripts" / "pip.exe" if os.name == "nt" else root / ".venv" / "bin" / "pip"
    if venv_pip.exists():
        return [str(venv_pip)]
    return [sys.executable, "-m", "pip"]


def install_deps(root: Path) -> bool:
    """Install requirements.txt and requirements-dev.txt."""
    pip = get_pip_cmd(root)
    print("Installing dependencies...")
    for req in ["requirements.txt", "requirements-dev.txt"]:
        path = root / req
        if not path.exists():
            print(f"WARN: {req} not found, skipping")
            continue
        r = subprocess.run(
            pip + ["install", "-r", str(path)],
            cwd=str(root),
            capture_output=True,
            text=True,
        )
        if r.returncode != 0:
            print(f"ERROR: pip install -r {req} failed: {r.stderr}")
            return False
    print("Dependencies installed")
    return True


def run_tests(root: Path) -> bool:
    """Run unit tests (quick sanity check)."""
    run_tests_script = root / "scripts" / "run_tests.py"
    if not run_tests_script.exists():
        print("WARN: scripts/run_tests.py not found, skipping tests")
        return True
    venv_python = root / ".venv" / "Scripts" / "python.exe" if os.name == "nt" else root / ".venv" / "bin" / "python"
    python_exe = str(venv_python) if venv_python.exists() else sys.executable
    print("Running unit tests (quick sanity check)...")
    r = subprocess.run(
        [python_exe, str(run_tests_script), "--unit", "--no-slow"],
        cwd=str(root),
        capture_output=True,
        text=True,
        timeout=120,
    )
    if r.returncode != 0:
        print(f"WARN: Some tests failed. Output:\n{r.stdout}\n{r.stderr}")
        print("You can fix issues later. Setup continues.")
    else:
        print("Tests passed")
    return True


def main() -> None:
    parser = argparse.ArgumentParser(description="CuePoint developer setup (Design 10.15)")
    parser.add_argument("--skip-tests", action="store_true", help="Skip test run")
    args = parser.parse_args()

    root = get_project_root()
    os.chdir(root)

    print("=== CuePoint Developer Setup ===\n")

    if not check_python_version():
        sys.exit(1)
    if not ensure_venv(root):
        sys.exit(1)
    if not install_deps(root):
        sys.exit(1)
    if not args.skip_tests:
        run_tests(root)

    print("\n=== Setup complete ===")
    print("\nNext steps:")
    print("  1. Activate venv:")
    if os.name == "nt":
        print("     .venv\\Scripts\\activate")
    else:
        print("     source .venv/bin/activate")
    print("  2. Run GUI:  python SRC/gui_app.py")
    print("  3. Run CLI:  python SRC/main.py --help")
    print("  4. Run tests: python scripts/run_tests.py --all")
    print("\nDocs: DOCS/README.md | Contributing: .github/CONTRIBUTING.md")


if __name__ == "__main__":
    main()
