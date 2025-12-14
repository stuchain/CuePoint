#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Generate THIRD_PARTY_LICENSES.txt (Step 8.5).

By default this script analyzes the currently-installed environment and writes a
single attribution file suitable for bundling into releases.
"""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Any

import sys

# Allow running as a standalone script (scripts/ is not a Python package)
_SCRIPT_DIR = Path(__file__).parent
if str(_SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPT_DIR))

from analyze_licenses import collect_licenses  # type: ignore


def render_license_file(packages: Dict[str, Dict[str, Any]]) -> str:
    lines: list[str] = []
    lines.append("THIRD-PARTY LICENSES")
    lines.append("=" * 80)
    lines.append("")
    lines.append(f"Generated: {datetime.now(timezone.utc).isoformat()}")
    lines.append("")
    lines.append("CuePoint includes the following third-party dependencies:")
    lines.append("")

    for name in sorted(packages.keys(), key=lambda s: s.lower()):
        info = packages[name]
        lines.append(f"Package: {info.get('name', name)}")
        lines.append(f"Version: {info.get('version', 'Unknown')}")
        lines.append(f"License: {info.get('license', 'Unknown')}")
        homepage = info.get("homepage") or ""
        if homepage:
            lines.append(f"Homepage: {homepage}")
        author = info.get("author") or ""
        if author:
            lines.append(f"Author: {author}")
        lines.append("")

        license_text = info.get("license_text") or ""
        if license_text.strip():
            lines.append("License Text:")
            lines.append("-" * 80)
            lines.append(license_text.rstrip())
            lines.append("-" * 80)
        else:
            lines.append("License text not available in installed distribution.")
            lines.append("Please refer to the package homepage/source for full license text.")

        lines.append("")
        lines.append("=" * 80)
        lines.append("")

    return "\n".join(lines)


def main() -> int:
    ap = argparse.ArgumentParser(description="Generate THIRD_PARTY_LICENSES.txt")
    ap.add_argument(
        "--output",
        type=str,
        default="THIRD_PARTY_LICENSES.txt",
        help="Output path (default: THIRD_PARTY_LICENSES.txt)",
    )
    args = ap.parse_args()

    licenses = collect_licenses()
    packages = {name: vars(info) for name, info in licenses.items()}

    out_text = render_license_file(packages)
    Path(args.output).write_text(out_text, encoding="utf-8")
    print(f"Wrote: {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())


