#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Generate Build Metadata / Provenance JSON

Emits a build info JSON file (version, commit_sha, build_time, workflow_run_id)
for traceability. Design: 02 Release Engineering and Distribution (2.9, 2.58).

Usage:
    python scripts/generate_build_metadata.py [--output path]
"""

import argparse
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path


def get_project_root() -> Path:
    return Path(__file__).resolve().parent.parent


def get_version() -> str:
    root = get_project_root()
    vf = root / "src" / "cuepoint" / "version.py"
    if not vf.exists():
        return "0.0.0"
    content = vf.read_text(encoding="utf-8")
    m = re.search(r'__version__\s*=\s*["\']([^"\']+)["\']', content)
    return m.group(1) if m else "0.0.0"


def get_commit_sha() -> str | None:
    try:
        r = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            capture_output=True,
            text=True,
            check=True,
            timeout=10,
            cwd=get_project_root(),
        )
        return r.stdout.strip() or None
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired, FileNotFoundError):
        return None


def get_python_version() -> str:
    return f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}"


def get_pyinstaller_version() -> str | None:
    try:
        r = subprocess.run(
            [sys.executable, "-m", "PyInstaller", "--version"],
            capture_output=True,
            text=True,
            timeout=5,
            cwd=get_project_root(),
        )
        if r.returncode == 0 and r.stdout:
            return r.stdout.strip()
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired, FileNotFoundError):
        pass
    return None


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate build metadata JSON (2.9).")
    parser.add_argument(
        "--output",
        "-o",
        type=Path,
        default=None,
        help="Output path (default: build/build_info.json or dist/build_info.json)",
    )
    args = parser.parse_args()

    version = get_version()
    commit_sha = get_commit_sha()
    build_time = datetime.now(tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    workflow_run_id = os.environ.get("GITHUB_RUN_ID") or os.environ.get("BUILD_ID") or ""
    builder = os.environ.get("GITHUB_ACTIONS") and "GitHub Actions" or os.environ.get("BUILD_SYSTEM") or "local"

    data = {
        "version": version,
        "commit_sha": commit_sha,
        "build_time": build_time,
        "workflow_run_id": str(workflow_run_id),
        "builder": builder,
        "python_version": get_python_version(),
    }
    pyinstaller_ver = get_pyinstaller_version()
    if pyinstaller_ver:
        data["pyinstaller_version"] = pyinstaller_ver

    root = get_project_root()
    if args.output is not None:
        out = args.output
    else:
        if (root / "dist").exists():
            out = root / "dist" / "build_info.json"
        else:
            out = root / "build" / "build_info.json"

    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(data, indent=2), encoding="utf-8")
    print(f"Generated build metadata: {out}")
    print(f"  version={version} commit_sha={commit_sha or 'N/A'} workflow_run_id={workflow_run_id or 'N/A'}")


if __name__ == "__main__":
    main()
