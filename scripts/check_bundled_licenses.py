#!/usr/bin/env python3
"""Check that bundled non-Python components carry their licences (PLAYER-01).

`validate_licenses.py` and `generate_licenses.py` read pip metadata, so they see
every Python dependency and nothing else. From PLAYER-01 onward CuePoint also
ships a **binary it did not build** — the mpv player sidecar (DEC-049) — whose
licence obligations no Python tool can see.

This is the gate for that class of component. It asserts, without a network and
without a build:

1. every licence text the player manifest names exists in `third_party/mpv/`
   and is not a stub;
2. a `NOTICE.md` exists there recording provenance and the obligations;
3. the manifest pins a source URL, so the "corresponding source" the licence
   requires can actually be found;
4. if the sidecar happens to be installed, its shipped `licenses/` directory
   matches what the manifest promised.

Point 4 is skipped when nothing is installed, because this must run on a clean
checkout in CI. Points 1-3 are not skippable: they fail the build.

Usage::

    python scripts/check_bundled_licenses.py
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import List, Sequence

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT / "scripts"))

from fetch_player_sidecar import (  # noqa: E402
    DEFAULT_DEST,
    LICENSE_DIR,
    PlayerSidecarError,
    install_dir_for,
    load_manifest,
)

#: A real licence text is thousands of bytes. Anything this small is a
#: placeholder somebody meant to replace.
MIN_LICENSE_BYTES = 500


def check(
    manifest_path: Path | None = None, dest_root: Path = DEFAULT_DEST
) -> List[str]:
    """Return a list of problems; empty means compliant."""
    problems: List[str] = []

    try:
        manifest = load_manifest(manifest_path) if manifest_path else load_manifest()
    except PlayerSidecarError as exc:
        return [f"player manifest unreadable: {exc}"]

    if not manifest.license_spdx:
        problems.append("player manifest does not record a licence (license.spdx)")
    if not manifest.source_url:
        problems.append(
            "player manifest does not record license.source_url; the licence "
            "requires the corresponding source to be identifiable"
        )
    if not manifest.license_files:
        problems.append("player manifest names no licence files")

    for name in manifest.license_files:
        path = LICENSE_DIR / name
        if not path.exists():
            problems.append(f"missing licence text: {path.relative_to(PROJECT_ROOT)}")
        elif path.stat().st_size < MIN_LICENSE_BYTES:
            problems.append(
                f"licence text looks like a stub "
                f"({path.relative_to(PROJECT_ROOT)}, {path.stat().st_size} bytes)"
            )

    notice = LICENSE_DIR / "NOTICE.md"
    if not notice.exists():
        problems.append(
            f"missing {notice.relative_to(PROJECT_ROOT)} recording what is bundled "
            "and under what terms"
        )

    # If a sidecar is installed, what shipped must match what was promised.
    for target in manifest.targets.values():
        if not target.supported:
            continue
        install_dir = install_dir_for(target, dest_root)
        receipt = install_dir / "installed.json"
        if not receipt.exists():
            continue  # not built here; nothing to cross-check
        shipped = install_dir / "licenses"
        for name in manifest.license_files:
            if not (shipped / name).exists():
                problems.append(
                    f"installed sidecar for {target.key} is missing "
                    f"licenses/{name}; re-run the fetch script"
                )
        try:
            recorded = json.loads(receipt.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            problems.append(f"install receipt for {target.key} is unreadable: {exc}")
            continue
        if recorded.get("license_spdx") != manifest.license_spdx:
            problems.append(
                f"installed sidecar for {target.key} records licence "
                f"{recorded.get('license_spdx')!r}, manifest says "
                f"{manifest.license_spdx!r}"
            )

    return problems


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Verify bundled non-Python components carry their licences"
    )
    parser.add_argument("--manifest", type=Path, default=None)
    parser.add_argument("--dest", type=Path, default=DEFAULT_DEST)
    args = parser.parse_args(argv)

    problems = check(args.manifest, args.dest)
    if problems:
        print("Bundled licence check FAILED:", file=sys.stderr)
        for problem in problems:
            print(f"  - {problem}", file=sys.stderr)
        print(
            "\nSee third_party/mpv/NOTICE.md and "
            "docs/ui-overhaul/adr/004-player-backend.md.",
            file=sys.stderr,
        )
        return 1

    manifest = load_manifest(args.manifest) if args.manifest else load_manifest()
    print(
        f"OK bundled component {manifest.component} {manifest.version} "
        f"({manifest.license_spdx}); {len(manifest.license_files)} licence texts present"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
