#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Generate release notes from the changelog.

Design: 02 Release Engineering (2.18). The hand-written changelog is the source
of release notes: its section for the release is lifted into RELEASE_NOTES.md,
which becomes the GitHub Release body and, through the appcast <description>,
the text shown in the in-app update dialog.

This replaces an earlier implementation that derived notes from merged pull
requests. This repository commits directly to branches rather than merging PRs,
so that scan found nothing and every release fell back to a placeholder.

Section resolution, in order:
  1. a section matching the full version (e.g. [1.2.3-feb1])
  2. [Unreleased], when it has content
  3. a section matching the base version (e.g. [1.2.3])

[Unreleased] is preferred over the base version because release tags carry
labelled suffixes (1.0.0-feb1), whose base version can collide with a section
published long ago. Cut [Unreleased] into a dated section before tagging a
stable release and the exact match wins.

Exits non-zero when no usable section is found, so a release fails before
publishing empty notes rather than after.

Usage:
    python scripts/generate_release_notes.py --tag v1.2.3 [--output RELEASE_NOTES.md]
    python scripts/generate_release_notes.py --tag v1.2.3 --section Unreleased
"""

import argparse
import os
import re
import sys
from pathlib import Path

from validate_changelog import extract_base_version

# Mirrors the section heading pattern in validate_changelog.py: ## [X.Y.Z] - date
# or ## [Unreleased].
SECTION_RE = re.compile(r"^##\s+\[([^\]]+)\]\s*(?:-\s*[-\d]+)?\s*$", re.MULTILINE)


def get_project_root() -> Path:
    return Path(__file__).resolve().parent.parent


def get_version_from_tag(tag: str) -> str:
    return tag.lstrip("v") if tag.startswith("v") else tag


def extract_sections(path: Path) -> dict[str, str]:
    """Map each changelog section title to its body text."""
    if not path.exists():
        return {}
    content = path.read_text(encoding="utf-8")
    matches = list(SECTION_RE.finditer(content))
    sections: dict[str, str] = {}
    for i, m in enumerate(matches):
        end = matches[i + 1].start() if i + 1 < len(matches) else len(content)
        title = m.group(1).strip()
        # First heading wins, so a duplicated version title keeps the newest entry.
        sections.setdefault(title, content[m.end() : end].strip())
    return sections


def has_content(body: str) -> bool:
    """True when the body has a ### subsection with at least one bullet under it."""
    return bool(re.search(r"^###\s+\w+", body, re.MULTILINE)) and bool(
        re.search(r"^[-*]\s+.+", body, re.MULTILINE)
    )


def resolve_section(sections: dict[str, str], version: str) -> tuple[str, str] | None:
    """Pick the changelog section for this version. See module docstring for order."""
    candidates = [version]
    unreleased = next((t for t in sections if t.lower() == "unreleased"), None)
    if unreleased:
        candidates.append(unreleased)
    base = extract_base_version(version)
    if base != version:
        candidates.append(base)

    for title in candidates:
        body = sections.get(title)
        if body and has_content(body):
            return title, body
    return None


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate release notes from the changelog (2.18)."
    )
    # Changelog prose carries non-ASCII; a Windows console defaults to cp1252.
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")
    parser.add_argument("--tag", "-t", required=True, help="Release tag (e.g. v1.2.3)")
    parser.add_argument(
        "--output", "-o", type=Path, default=None, help="Output path (default: stdout)"
    )
    parser.add_argument(
        "--changelog",
        type=Path,
        default=None,
        help="Changelog path (default: docs/release/CHANGELOG.md)",
    )
    parser.add_argument(
        "--section",
        default=None,
        help="Use this changelog section verbatim instead of resolving one from the tag",
    )
    # Accepted for backward compatibility with existing callers; no longer used.
    parser.add_argument(
        "--repo",
        "-r",
        default=os.environ.get("GITHUB_REPOSITORY"),
        help=argparse.SUPPRESS,
    )
    parser.add_argument(
        "--token", default=os.environ.get("GITHUB_TOKEN"), help=argparse.SUPPRESS
    )
    args = parser.parse_args()

    version = get_version_from_tag(args.tag)
    changelog = (
        args.changelog or get_project_root() / "docs" / "release" / "CHANGELOG.md"
    )

    if not changelog.exists():
        print(f"ERROR: Changelog not found: {changelog}", file=sys.stderr)
        sys.exit(1)

    sections = extract_sections(changelog)
    if not sections:
        print(f"ERROR: No changelog sections parsed from {changelog}", file=sys.stderr)
        sys.exit(1)

    if args.section:
        body = sections.get(args.section)
        if body is None:
            available = ", ".join(sorted(sections)) or "none"
            print(
                f"ERROR: Section [{args.section}] not found in {changelog}. Available: {available}",
                file=sys.stderr,
            )
            sys.exit(1)
        title = args.section
    else:
        resolved = resolve_section(sections, version)
        if resolved is None:
            available = ", ".join(sorted(sections)) or "none"
            print(
                f"ERROR: No changelog section with content for {version} in {changelog}.\n"
                f"       Looked for [{version}], [Unreleased], then "
                f"[{extract_base_version(version)}]. Available: {available}\n"
                "       Write the changelog entry before tagging, or pass --section.",
                file=sys.stderr,
            )
            sys.exit(1)
        title, body = resolved

    if title.lower() == "unreleased":
        print(
            f"Note: using the [Unreleased] section for {args.tag}. Cut it into a dated "
            f"[{version}] section as part of a stable release.",
            file=sys.stderr,
        )

    lines = [
        f"# Release {args.tag}",
        "",
        f"**Version**: {version}",
        "",
        "## Changes",
        "",
        body,
        "",
        "## Installation",
        "",
        "### macOS",
        "1. Download the DMG file",
        "2. Open the DMG and drag CuePoint.app to Applications",
        "",
        "### Windows",
        "1. Download the installer",
        "2. Run the installer and follow the prompts",
        "",
    ]

    text = "\n".join(lines)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(text, encoding="utf-8")
        print(f"Written: {args.output} (changelog section [{title}])")
    else:
        print(text)


if __name__ == "__main__":
    main()
