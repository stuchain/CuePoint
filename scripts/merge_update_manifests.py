#!/usr/bin/env python3
"""Merge the two Mac update manifests into one ``latest-mac.yml`` (DIST-03, DEC-129).

Each Mac leg of the build writes its own ``latest-mac.yml`` that names only its
chip's zip. The updater reads one manifest and picks the file for the Mac it runs
on, so this writes one that lists both::

    python scripts/merge_update_manifests.py arm64.yml x64.yml -o latest-mac.yml

It refuses, with a message and exit 1, to merge:

* manifests whose ``version`` differs (two builds of different commits);
* a manifest with a ``files[].url`` that does not carry its chip
  (``-mac-arm64.`` or ``-mac-x64.`` in the name), because the updater could not
  tell which Mac the file is for;
* two manifests for the same chip.

The merged ``files`` list is the arm64 list then the x64 list. ``path`` and
``sha512`` at the top level are electron-updater's older single-file fields, read
by updaters that do not look at ``files``; they are taken from the arm64
manifest, since Apple Silicon is the default Mac and an updater that cannot pick
a file gets that one. ``releaseDate`` is the later of the two. Each ``files`` entry is kept whole
(``url``, ``sha512``, ``size``, ``blockMapSize`` and whatever else it carries).
Other top-level keys are dropped: electron-builder 25 writes none for macOS
beyond the five above.
"""

from __future__ import annotations

import argparse
import sys
from collections.abc import Sequence
from pathlib import Path

import yaml

CHIPS = ("arm64", "x64")


class MergeError(Exception):
    """The manifests cannot be merged."""


def _chip_of(url: str) -> str | None:
    found = [c for c in CHIPS if f"-mac-{c}." in url]
    return found[0] if len(found) == 1 else None


def _load(path: Path) -> dict:
    try:
        data = yaml.safe_load(path.read_text(encoding="utf-8"))
    except (OSError, yaml.YAMLError) as err:
        raise MergeError(f"Cannot read {path}: {err}") from err
    if not isinstance(data, dict) or not data.get("version") or not data.get("files"):
        raise MergeError(f"{path} is not an update manifest (needs version and files)")
    return data


def _chip(path: Path, data: dict) -> str:
    chips = set()
    for entry in data["files"]:
        url = str(entry.get("url", ""))
        chip = _chip_of(url)
        if chip is None:
            raise MergeError(
                f"{path}: file name {url!r} does not carry its chip "
                "(-mac-arm64. or -mac-x64.)"
            )
        chips.add(chip)
    if len(chips) != 1:
        raise MergeError(f"{path} mixes chips: {sorted(chips)}")
    return chips.pop()


def merge(first: Path, second: Path) -> dict:
    """Return the merged manifest for two single-chip manifests."""
    by_chip: dict[str, dict] = {}
    for path in (first, second):
        data = _load(path)
        chip = _chip(path, data)
        if chip in by_chip:
            raise MergeError(f"Two manifests for {chip}; need one arm64 and one x64")
        by_chip[chip] = data
    arm64, x64 = by_chip["arm64"], by_chip["x64"]
    if str(arm64["version"]) != str(x64["version"]):
        raise MergeError(
            f"Manifest version differs: {arm64['version']} and {x64['version']}"
        )

    merged = {
        "version": arm64["version"],
        "files": list(arm64["files"]) + list(x64["files"]),
        "path": arm64.get("path", arm64["files"][0]["url"]),
        "sha512": arm64.get("sha512", arm64["files"][0].get("sha512")),
    }
    dates = [str(d["releaseDate"]) for d in (arm64, x64) if d.get("releaseDate")]
    if dates:
        merged["releaseDate"] = max(dates)
    return merged


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Merge the arm64 and x64 latest-mac.yml"
    )
    parser.add_argument("manifests", nargs=2, type=Path, metavar="MANIFEST")
    parser.add_argument("-o", "--output", type=Path, default=Path("latest-mac.yml"))
    args = parser.parse_args(argv)

    try:
        merged = merge(*args.manifests)
    except MergeError as err:
        print(f"Refusing to merge: {err}", file=sys.stderr)
        return 1

    args.output.write_text(
        yaml.safe_dump(merged, sort_keys=False, default_flow_style=False),
        encoding="utf-8",
    )
    print(
        f"Wrote {args.output}: {len(merged['files'])} files, version {merged['version']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
