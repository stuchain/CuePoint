#!/usr/bin/env python3
"""Print a version's release notes: its section of the changelog (DIST-04, DEC-178).

    python scripts/release_notes.py 1.0.0-test.1 > notes.md

The body of the ``## [<version>]`` section of ``docs/release/CHANGELOG.md`` is
printed, without its heading, up to the next ``## `` heading and trimmed. A
trailing ``---`` rule and link reference lines (``[x]: url``) are not part of the
notes, and a section of only ``###`` headings counts as empty. It exits 1, with a
message and nothing on stdout, when the section is missing or empty, so a release
with no notes stops at the gate instead of publishing blank.

``Unreleased`` is refused: it is the section for changes not yet released, never
the notes of a tag. ``--changelog`` names another file (for tests).
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path
from typing import List, Optional

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CHANGELOG = PROJECT_ROOT / "docs" / "release" / "CHANGELOG.md"

_HEADING_RE = re.compile(r"^## \[(?P<name>[^\]]+)\]")
#: A Keep a Changelog link reference such as ``[1.0.0]: https://...``.
_LINK_REF_RE = re.compile(r"^\[[^\]]+\]:\s")


class ReleaseNotesError(RuntimeError):
    """The notes for a version cannot be produced."""


def extract_section(changelog: str, version: str) -> str:
    """The trimmed body of ``version``'s section, or raise ``ReleaseNotesError``."""
    name = version.strip().strip("[]")
    if name.lower() == "unreleased":
        raise ReleaseNotesError(
            "Unreleased is not a release: a tag needs a section named for its version"
        )

    body: List[str] = []
    found = False
    for line in changelog.splitlines():
        if line.startswith("## "):
            if found:
                break
            match = _HEADING_RE.match(line)
            found = bool(match and match.group("name") == name)
            continue
        if found:
            body.append(line)

    if not found:
        raise ReleaseNotesError(f"The changelog has no section '## [{name}]'")
    # The last section of a file is followed by a `---` rule and the link references;
    # neither is part of the notes.
    while body and (not body[-1].strip() or _LINK_REF_RE.match(body[-1])):
        body.pop()
    while body and (not body[-1].strip() or body[-1].strip() == "---"):
        body.pop()
    text = "\n".join(body).strip()
    # Headings alone (`### Added` with nothing under it) are not notes.
    if not any(line.strip() and not line.startswith("#") for line in text.splitlines()):
        text = ""
    if not text:
        raise ReleaseNotesError(f"The changelog section '## [{name}]' is empty")
    return text


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("version", help="the version, as in the changelog heading")
    parser.add_argument("--changelog", type=Path, default=DEFAULT_CHANGELOG)
    args = parser.parse_args(argv)

    try:
        text = args.changelog.read_text(encoding="utf-8")
    except OSError as exc:
        print(
            f"ERROR: cannot read the changelog {args.changelog}: {exc}", file=sys.stderr
        )
        return 1
    try:
        print(extract_section(text, args.version))
    except ReleaseNotesError as exc:
        print(f"ERROR: {exc} ({args.changelog})", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
