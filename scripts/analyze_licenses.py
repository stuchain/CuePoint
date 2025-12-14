#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Analyze installed Python dependencies and their licenses (Step 8.5).

This is best-effort: license metadata is not consistently populated across packages.
We try (in order):
- METADATA/PKG-INFO "License" field
- Trove classifiers ("License :: ...")
- License files included in the distribution (LICENSE/COPYING/etc.)
"""

from __future__ import annotations

import argparse
import json
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from importlib import metadata
from pathlib import Path
from typing import Dict


@dataclass
class PackageLicenseInfo:
    name: str
    version: str
    license: str
    homepage: str = ""
    author: str = ""
    license_text: str = ""


LICENSE_FILENAMES = {
    "LICENSE",
    "LICENSE.txt",
    "LICENSE.md",
    "COPYING",
    "COPYING.txt",
    "COPYING.md",
}


def _extract_license_name(dist: metadata.Distribution) -> str:
    meta = dist.metadata
    license_field = (meta.get("License") or "").strip()
    if license_field and license_field.lower() not in {"unknown", "none"}:
        return license_field

    # Try Trove classifiers
    classifiers = meta.get_all("Classifier") or []
    license_classifiers = [c for c in classifiers if c.startswith("License ::")]
    if license_classifiers:
        # Use the most specific tail
        return license_classifiers[-1].split("::", 1)[-1].strip() or "Unknown"

    return "Unknown"


def _extract_license_text(dist: metadata.Distribution, max_chars: int = 200_000) -> str:
    try:
        files = dist.files or []
        for f in files:
            name = Path(str(f)).name
            if name in LICENSE_FILENAMES:
                p = dist.locate_file(f)
                try:
                    text = Path(p).read_text(encoding="utf-8", errors="replace")
                    return text[:max_chars]
                except Exception:
                    # If we can't read it, keep searching
                    continue
    except Exception:
        pass
    return ""


def collect_licenses() -> Dict[str, PackageLicenseInfo]:
    result: Dict[str, PackageLicenseInfo] = {}
    for dist in metadata.distributions():
        # distribution.name is normalized; prefer metadata Name if present
        pkg_name = (dist.metadata.get("Name") or dist.name or "").strip()
        if not pkg_name:
            continue

        info = PackageLicenseInfo(
            name=pkg_name,
            version=(dist.version or "").strip(),
            license=_extract_license_name(dist),
            homepage=(dist.metadata.get("Home-page") or "").strip(),
            author=(dist.metadata.get("Author") or "").strip(),
            license_text=_extract_license_text(dist),
        )
        result[pkg_name] = info

    return dict(sorted(result.items(), key=lambda kv: kv[0].lower()))


def main() -> int:
    ap = argparse.ArgumentParser(description="Analyze installed dependency licenses")
    ap.add_argument("--output", type=str, default=None, help="Write JSON output to a file")
    args = ap.parse_args()

    licenses = collect_licenses()
    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "packages": {name: asdict(info) for name, info in licenses.items()},
    }

    text = json.dumps(payload, indent=2, ensure_ascii=False, sort_keys=True)
    if args.output:
        Path(args.output).write_text(text, encoding="utf-8")
    else:
        print(text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())


