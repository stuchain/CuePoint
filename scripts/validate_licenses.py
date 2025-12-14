#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Validate license inventory for compliance (Step 8.5).

Fail the build if we have "Unknown" licenses, because those require manual review.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
import re

# Allow running as a standalone script (scripts/ is not a Python package)
_SCRIPT_DIR = Path(__file__).parent
if str(_SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPT_DIR))

from analyze_licenses import collect_licenses  # type: ignore


def main() -> int:
    ap = argparse.ArgumentParser(description="Validate third-party license metadata")
    ap.add_argument(
        "--requirements",
        type=str,
        default=None,
        help="If provided, validate only the direct dependencies listed in this requirements file",
    )
    ap.add_argument(
        "--allow-unknown",
        action="store_true",
        help="Do not fail on unknown licenses (still prints a report)",
    )
    args = ap.parse_args()

    licenses = collect_licenses()

    target_names = None
    if args.requirements:
        req_text = Path(args.requirements).read_text(encoding="utf-8", errors="replace").splitlines()
        names = set()
        for line in req_text:
            s = line.strip()
            if not s or s.startswith("#") or s.startswith("-"):
                continue
            # Extract "name" from "name==1.2.3" / "name>=1.0" / "name"
            m = re.match(r"^([A-Za-z0-9_.-]+)", s)
            if m:
                names.add(m.group(1).lower())
        target_names = names

    unknown = []
    for name, info in licenses.items():
        if target_names is not None and name.lower() not in target_names:
            continue
        if (info.license or "").strip() == "Unknown":
            unknown.append(name)

    if unknown:
        print("Found packages with unknown license metadata:")
        for name in unknown:
            print(f"  - {name} ({licenses[name].version})")
        if not args.allow_unknown:
            print("\nFailing because unknown licenses require review.")
            return 1

    print("License validation OK.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())


