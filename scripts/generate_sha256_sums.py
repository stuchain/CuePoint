#!/usr/bin/env python3
"""Generate SHA256SUMS.txt for build artifacts (Phase 9).

``--leg <leg>`` names the file ``SHA256SUMS-<leg>.txt`` so each build leg's sums
need no renaming by hand (DIST-03). Only the files at the top of the artifact
folder are hashed (installers, zips, block maps, update manifests): the unpacked
app folders electron-builder leaves beside them (``win-unpacked/``, ``mac/``,
``mac-arm64/``, ``linux-unpacked/``) are not downloads, and a checksum file
never lists itself or another leg's. electron-builder's own debug files
(``builder-debug.yml``, ``builder-effective-config.yaml``) are not downloads
either.
"""

from __future__ import annotations

import argparse
import hashlib
from collections.abc import Sequence
from pathlib import Path


#: Files electron-builder leaves at the top of the output that are not downloads.
EXCLUDED_NAMES = frozenset({"builder-debug.yml", "builder-effective-config.yaml"})


def sha256_file(path: Path, chunk_size: int = 1024 * 1024) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(chunk_size), b""):
            h.update(chunk)
    return h.hexdigest()


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("artifact_dir", help="Directory containing artifacts")
    names = parser.add_mutually_exclusive_group()
    names.add_argument(
        "--output",
        default="SHA256SUMS.txt",
        help="Output filename (written inside artifact_dir)",
    )
    names.add_argument(
        "--leg",
        help="Build leg; writes SHA256SUMS-<leg>.txt (cannot be combined with --output)",
    )
    args = parser.parse_args(argv)

    root = Path(args.artifact_dir).resolve()
    if not root.exists():
        raise SystemExit(f"Artifact directory does not exist: {root}")

    out_name = f"SHA256SUMS-{args.leg}.txt" if args.leg else args.output
    out_path = root / out_name
    files = [
        p
        for p in root.iterdir()
        if p.is_file()
        and p.name != out_path.name
        and p.name not in EXCLUDED_NAMES
        and not (p.name.startswith("SHA256SUMS") and p.suffix == ".txt")
    ]
    lines: list[str] = []
    for p in sorted(files):
        lines.append(f"{sha256_file(p)}  {p.name}")

    out_path.write_text("\n".join(lines), encoding="utf-8")
    print(f"Wrote {out_path} entries={len(lines)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
