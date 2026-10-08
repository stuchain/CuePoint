#!/usr/bin/env python3
"""Get the gathered release files ready to attach (DIST-04).

Two steps of ``release.yml``'s publish job, kept here so they can be tested::

    python scripts/prepare_release_assets.py mac-sums upload/
    python scripts/prepare_release_assets.py check upload/ --version 1.0.0-test.1

``mac-sums``: each Mac leg hashed its own ``latest-mac.yml``, but the file that is
published is the merged one. In each ``SHA256SUMS-macos-*.txt`` the line for
``latest-mac.yml`` is replaced by the merged file's hash, so ``sha256sum -c`` on
the release passes.

``check``: every file a release must hold is there, or it exits 1 naming what is
missing, before the draft release is created.
"""

from __future__ import annotations

import argparse
import hashlib
import sys
from pathlib import Path
from typing import List, Optional

MERGED_MANIFEST = "latest-mac.yml"
LEGS = ("windows-x64", "linux-x64", "macos-arm64", "macos-x64")


def expected_files(version: str) -> List[str]:
    """The names a release holds, from the installer names in package.json's build."""
    stem = f"CuePoint-{version}"
    installers = [
        f"{stem}-win-x64-setup.exe",
        f"{stem}-linux-x86_64.AppImage",
    ]
    for chip in ("arm64", "x64"):
        installers += [f"{stem}-mac-{chip}.dmg", f"{stem}-mac-{chip}.zip"]
    names = list(installers)
    # The AppImage carries its block map inside it (app-builder's embedded block map), so it has
    # no separate .blockmap file; the Windows installer, the DMGs and the zips do.
    names += [
        f"{name}.blockmap" for name in installers if not name.endswith(".AppImage")
    ]
    names += ["latest.yml", "latest-linux.yml", MERGED_MANIFEST]
    names += [f"SHA256SUMS-{leg}.txt" for leg in LEGS]
    return names


def missing_files(directory: Path, version: str) -> List[str]:
    return [n for n in expected_files(version) if not (directory / n).is_file()]


def fix_mac_sums(directory: Path) -> List[Path]:
    """Point each Mac checksum file at the merged manifest. Returns the files changed."""
    merged = directory / MERGED_MANIFEST
    if not merged.is_file():
        raise FileNotFoundError(f"{merged} does not exist; merge the manifests first")
    digest = hashlib.sha256(merged.read_bytes()).hexdigest()
    changed: List[Path] = []
    for path in sorted(directory.glob("SHA256SUMS-macos-*.txt")):
        lines = [
            line
            for line in path.read_text(encoding="utf-8").splitlines()
            if line.strip() and not line.rstrip().endswith(f"  {MERGED_MANIFEST}")
        ]
        lines.append(f"{digest}  {MERGED_MANIFEST}")
        path.write_text("\n".join(lines), encoding="utf-8")
        changed.append(path)
    if not changed:
        raise FileNotFoundError(f"no SHA256SUMS-macos-*.txt in {directory}")
    return changed


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = parser.add_subparsers(dest="command", required=True)
    sums = sub.add_parser(
        "mac-sums", help="use the merged manifest in the Mac checksums"
    )
    sums.add_argument("directory", type=Path)
    check = sub.add_parser("check", help="every expected file is present")
    check.add_argument("directory", type=Path)
    check.add_argument("--version", required=True)
    args = parser.parse_args(argv)

    if args.command == "mac-sums":
        try:
            for path in fix_mac_sums(args.directory):
                print(f"updated {path}")
        except FileNotFoundError as exc:
            print(f"ERROR: {exc}", file=sys.stderr)
            return 1
        return 0

    missing = missing_files(args.directory, args.version)
    if missing:
        print("ERROR: the release is missing:", file=sys.stderr)
        for name in missing:
            print(f"  {name}", file=sys.stderr)
        return 1
    print(f"all {len(expected_files(args.version))} release files are present")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
