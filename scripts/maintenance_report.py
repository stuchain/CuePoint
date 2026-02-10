#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Maintenance Report (Step 15: Long-Term Maintenance and Evolution).

Generates a maintenance status report including:
- Dependency audit status (pip-audit)
- Requirements file checks
- Python and platform info
- Compatibility matrix reference

Usage:
    python scripts/maintenance_report.py
    python main.py --maintenance-report
"""

from __future__ import annotations

import json
import platform
import subprocess
import sys
from pathlib import Path


def _run_pip_audit(requirements_path: Path) -> tuple[bool, str]:
    """Run pip-audit on a requirements file. Returns (success, output)."""
    try:
        result = subprocess.run(
            [sys.executable, "-m", "pip_audit", "-r", str(requirements_path)],
            capture_output=True,
            text=True,
            timeout=90,
        )
        return result.returncode == 0, result.stdout + result.stderr
    except subprocess.TimeoutExpired:
        return False, "pip-audit timed out"
    except FileNotFoundError:
        return False, "pip-audit not installed (pip install pip-audit)"
    except Exception as e:
        return False, str(e)


def _get_python_version() -> str:
    return f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}"


def _get_platform_info() -> dict:
    return {
        "system": platform.system(),
        "release": platform.release(),
        "version": platform.version(),
        "machine": platform.machine(),
    }


def generate_report(
    repo_root: Path | None = None,
    json_output: bool = False,
    skip_audit: bool = False,
) -> dict:
    """Generate maintenance report. Returns dict with all sections."""
    if repo_root is None:
        repo_root = Path(__file__).resolve().parent.parent

    report: dict = {
        "maintenance_report": True,
        "python_version": _get_python_version(),
        "platform": _get_platform_info(),
        "requirements": {},
        "dependency_audit": {},
        "compatibility": {
            "docs": "docs/release/compatibility-matrix.md",
            "maintenance_policy": "docs/release/maintenance-policy.md",
        },
    }

    req_files = [
        ("requirements.txt", "Production"),
        ("requirements-dev.txt", "Development"),
        ("requirements-build.txt", "Build"),
    ]

    audit_ok = True
    for filename, label in req_files:
        path = repo_root / filename
        exists = path.exists()
        report["requirements"][filename] = {"exists": exists, "label": label}

        if exists and not skip_audit:
            ok, output = _run_pip_audit(path)
            report["dependency_audit"][filename] = {
                "passed": ok,
                "output": output.strip()[:500] if output else "",
            }
            if not ok:
                audit_ok = False
        elif exists and skip_audit:
            report["dependency_audit"][filename] = {
                "passed": True,
                "output": "(skipped)",
            }

    report["dependency_audit"]["overall"] = audit_ok

    if json_output:
        return report

    # Human-readable output
    lines = [
        "=== CuePoint Maintenance Report (Step 15) ===",
        "",
        f"Python: {report['python_version']}",
        f"Platform: {report['platform']['system']} {report['platform']['release']}",
        "",
        "Requirements:",
    ]
    for filename, info in report["requirements"].items():
        status = "OK" if info["exists"] else "MISSING"
        lines.append(f"  {filename} ({info['label']}): {status}")

    lines.extend(["", "Dependency Audit (pip-audit):"])
    for filename, info in report["dependency_audit"].items():
        if filename == "overall":
            continue
        status = "PASS" if info["passed"] else "FAIL"
        lines.append(f"  {filename}: {status}")
        if not info["passed"] and info.get("output"):
            lines.append(f"    {info['output'][:200]}")

    lines.extend([
        "",
        f"Overall: {'PASS' if report['dependency_audit']['overall'] else 'FAIL'}",
        "",
        "See docs/release/maintenance-policy.md for maintenance cadence and SLA.",
        "See docs/release/compatibility-matrix.md for OS/Python support.",
    ])

    report["_output"] = "\n".join(lines)
    return report


def main() -> int:
    """Entry point for script execution."""
    import argparse
    import os
    parser = argparse.ArgumentParser(description="Generate maintenance report (Step 15)")
    parser.add_argument("--json", action="store_true", help="Output JSON")
    parser.add_argument("--repo-root", type=Path, default=None, help="Repository root")
    parser.add_argument("--skip-audit", action="store_true", help="Skip pip-audit (faster; CI runs audit separately)")
    args = parser.parse_args()

    skip_audit = args.skip_audit or os.environ.get("CUEPOINT_MAINTENANCE_QUICK") == "1"
    repo_root = args.repo_root or Path(__file__).resolve().parent.parent
    report = generate_report(
        repo_root=repo_root,
        json_output=args.json,
        skip_audit=skip_audit,
    )

    if args.json:
        # Remove internal keys for JSON output
        out = {k: v for k, v in report.items() if not k.startswith("_")}
        print(json.dumps(out, indent=2))
    else:
        print(report["_output"])
        return 0 if report["dependency_audit"]["overall"] else 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
