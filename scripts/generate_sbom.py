#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Generate Software Bill of Materials (SBOM) for Release

Produces an SPDX 2.3 JSON SBOM containing Python dependencies from
requirements.txt and requirements-build.txt, plus optional build tools.
Design: 02 Release Engineering and Distribution (2.16, 2.52).

Usage:
    python scripts/generate_sbom.py [--output path] [--format spdx|cyclonedx]
"""

import argparse
import hashlib
import json
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path


def get_project_root() -> Path:
    return Path(__file__).resolve().parent.parent


def get_version() -> str:
    """Get version from version.py."""
    root = get_project_root()
    vf = root / "src" / "cuepoint" / "version.py"
    if not vf.exists():
        return "0.0.0"
    content = vf.read_text(encoding="utf-8")
    m = re.search(r'__version__\s*=\s*["\']([^"\']+)["\']', content)
    return m.group(1) if m else "0.0.0"


def parse_requirements_file(path: Path) -> list[tuple[str, str | None]]:
    """Parse requirements file; return list of (name, version_or_none)."""
    if not path.exists():
        return []
    out: list[tuple[str, str | None]] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip().split("#")[0].strip()
        if not line or line.startswith("-"):
            continue
        # Normalize: package==version, package>=version, etc.
        if "==" in line:
            name, ver = line.split("==", 1)
            out.append((name.strip().lower(), ver.strip()))
        elif ">=" in line or "<=" in line or "~=" in line:
            parts = re.split(r"(>=|<=|~=)", line, maxsplit=1)
            if len(parts) >= 2:
                out.append((parts[0].strip().lower(), parts[2].strip() if len(parts) > 2 else None))
            else:
                out.append((line.split("[")[0].strip().lower(), None))
        else:
            name = re.split(r"[\s<>=!]", line)[0].strip().lower()
            if name:
                out.append((name, None))
    return out


def get_installed_versions() -> dict[str, str]:
    """Run pip list --format=json and return {name_lower: version}."""
    try:
        r = subprocess.run(
            [sys.executable, "-m", "pip", "list", "--format=json"],
            capture_output=True,
            text=True,
            timeout=60,
            cwd=get_project_root(),
        )
        if r.returncode != 0:
            return {}
        data = json.loads(r.stdout)
        return {p["name"].lower(): p["version"] for p in data}
    except (json.JSONDecodeError, subprocess.TimeoutExpired, FileNotFoundError):
        return {}


def spdx_id(name: str, version: str | None) -> str:
    """Generate SPDX PackageVerificationCode-like ID (we use package name + version)."""
    v = version or "0.0.0"
    return f"SPDXRef-Package-{name}-{v}".replace(".", "-").replace(" ", "_")


def generate_spdx_sbom(
    requirements: list[Path],
    version: str,
    output_path: Path,
) -> None:
    """Generate SPDX 2.3 minimal JSON SBOM."""
    packages: list[tuple[str, str | None]] = []
    seen: set[str] = set()
    for req_path in requirements:
        for name, ver in parse_requirements_file(req_path):
            if name not in seen:
                seen.add(name)
                packages.append((name, ver))

    installed = get_installed_versions()
    # Resolve versions where possible
    resolved: list[dict] = []
    for name, ver in packages:
        resolved_ver = ver or installed.get(name, "0.0.0")
        spdx_ref = spdx_id(name, resolved_ver)
        resolved.append({
            "name": name,
            "version": resolved_ver,
            "SPDXID": spdx_ref,
        })

    doc = {
        "spdxVersion": "SPDX-2.3",
        "dataLicense": "CC0-1.0",
        "SPDXID": "SPDXRef-DOCUMENT",
        "name": f"CuePoint-{version}-SBOM",
        "documentNamespace": f"https://cuepoint.example.com/spdx/{version}",
        "creationInfo": {
            "created": datetime.now(tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "creators": ["Tool: CuePoint-generate_sbom.py"],
        },
        "packages": [
            {
                "SPDXID": p["SPDXID"],
                "name": p["name"],
                "versionInfo": p["version"],
                "downloadLocation": "NOASSERTION",
                "filesAnalyzed": False,
            }
            for p in resolved
        ],
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(doc, indent=2), encoding="utf-8")
    print(f"Generated SPDX SBOM: {output_path} ({len(resolved)} packages)")


def generate_cyclonedx_sbom(
    requirements: list[Path],
    version: str,
    output_path: Path,
) -> None:
    """Generate CycloneDX 1.4 minimal JSON SBOM."""
    packages: list[tuple[str, str | None]] = []
    seen: set[str] = set()
    for req_path in requirements:
        for name, ver in parse_requirements_file(req_path):
            if name not in seen:
                seen.add(name)
                packages.append((name, ver))

    installed = get_installed_versions()
    components = []
    for name, ver in packages:
        resolved_ver = ver or installed.get(name, "0.0.0")
        components.append({
            "type": "library",
            "name": name,
            "version": resolved_ver,
            "purl": f"pkg:pypi/{name}@{resolved_ver}",
        })

    doc = {
        "bomFormat": "CycloneDX",
        "specVersion": "1.4",
        "version": 1,
        "metadata": {
            "timestamp": datetime.now(tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "tools": [{"vendor": "CuePoint", "name": "generate_sbom.py"}],
            "component": {
                "type": "application",
                "name": "CuePoint",
                "version": version,
            },
        },
        "components": components,
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(doc, indent=2), encoding="utf-8")
    print(f"Generated CycloneDX SBOM: {output_path} ({len(components)} components)")


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate SBOM for release (2.16).")
    parser.add_argument(
        "--output",
        "-o",
        type=Path,
        default=None,
        help="Output path (default: dist/sbom.spdx.json or build/sbom.spdx.json)",
    )
    parser.add_argument(
        "--format",
        choices=["spdx", "cyclonedx"],
        default="spdx",
        help="SBOM format (default: spdx)",
    )
    args = parser.parse_args()

    root = get_project_root()
    reqs = [
        root / "requirements.txt",
        root / "requirements-build.txt",
    ]
    version = get_version()

    if args.output is not None:
        out = args.output
    else:
        if (root / "dist").exists():
            out = root / "dist" / "sbom.spdx.json"
        else:
            out = root / "build" / "sbom.spdx.json"
        if args.format == "cyclonedx":
            out = out.with_name("sbom.cyclonedx.json")

    if args.format == "spdx":
        generate_spdx_sbom(reqs, version, out)
    else:
        generate_cyclonedx_sbom(reqs, version, out)


if __name__ == "__main__":
    main()
