#!/usr/bin/env python3
"""Generate SHA256SUMS.txt for build artifacts (Phase 9)."""

from __future__ import annotations

import argparse
import hashlib
from pathlib import Path


def sha256_file(path: Path, chunk_size: int = 1024 * 1024) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(chunk_size), b""):
            h.update(chunk)
    return h.hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("artifact_dir", help="Directory containing artifacts")
    parser.add_argument(
        "--output",
        default="SHA256SUMS.txt",
        help="Output filename (written inside artifact_dir)",
    )
    args = parser.parse_args()

    root = Path(args.artifact_dir).resolve()
    if not root.exists():
        raise SystemExit(f"Artifact directory does not exist: {root}")

    out_path = root / args.output
    files = [
        p
        for p in root.rglob("*")
        if p.is_file() and p.name != out_path.name
    ]
    lines: list[str] = []
    for p in sorted(files):
        rel = str(p.relative_to(root)).replace("\\", "/")
        lines.append(f"{sha256_file(p)}  {rel}")

    out_path.write_text("\n".join(lines), encoding="utf-8")
    print(f"Wrote {out_path} entries={len(lines)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

