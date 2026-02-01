#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Validate Changelog for Release Gate

Ensures DOCS/RELEASE/changelog.md has an entry for the current version
or a non-empty [Unreleased] section. Used by CI to block releases when
changelog is missing or incomplete.

Design: 02 Release Engineering and Distribution (2.14, 2.55).
Error taxonomy: R002 Changelog missing.

Usage:
    python scripts/validate_changelog.py [--version X.Y.Z]
    python scripts/validate_changelog.py  # uses version from SRC/cuepoint/version.py
"""

import argparse
import re
import sys
from pathlib import Path


def get_version_from_file() -> str | None:
    """Get version from SRC/cuepoint/version.py."""
    script_dir = Path(__file__).resolve().parent
    project_root = script_dir.parent
    version_file = project_root / "SRC" / "cuepoint" / "version.py"
    if not version_file.exists():
        return None
    content = version_file.read_text(encoding="utf-8")
    match = re.search(r'__version__\s*=\s*["\']([^"\']+)["\']', content)
    if match:
        return match.group(1)
    return None


def extract_base_version(version: str) -> str:
    """Extract base version X.Y.Z (no prerelease suffix)."""
    v = version.strip()
    if "+" in v:
        v = v.split("+")[0]
    if "-" in v:
        v = v.split("-")[0]
    return v


def parse_changelog_sections(path: Path) -> list[tuple[str, bool]]:
    """
    Parse changelog and return list of (section_title, has_content).
    Section titles are ## [X.Y.Z], ## [Unreleased], etc.
    has_content is True if there is at least one ### subsection with content below it.
    """
    if not path.exists():
        return []
    content = path.read_text(encoding="utf-8")
    sections: list[tuple[str, bool]] = []
    # Match ## [version] or ## [Unreleased]
    section_re = re.compile(r"^##\s+\[([^\]]+)\]\s*(?:-\s*[-\d]+)?\s*$", re.MULTILINE)
    pos = 0
    while True:
        m = section_re.search(content, pos)
        if not m:
            break
        title = m.group(1).strip()
        start = m.end()
        next_m = section_re.search(content, start)
        end = next_m.start() if next_m else len(content)
        block = content[start:end]
        # Consider has_content if there's a ### subsection with at least one line after it
        has_subsection = bool(re.search(r"^###\s+\w+", block, re.MULTILINE))
        has_content = has_subsection and bool(re.search(r"^[-*]\s+.+", block, re.MULTILINE))
        sections.append((title, has_content))
        pos = m.end() if next_m else len(content)
        if not next_m:
            break
    return sections


def validate_changelog(
    changelog_path: Path,
    current_version: str,
    require_version_entry: bool = True,
) -> tuple[bool, list[str]]:
    """
    Validate changelog has required entries.

    Args:
        changelog_path: Path to changelog.md.
        current_version: Version string from version.py (e.g. 1.0.1-test21).
        require_version_entry: If True, require a section for current base version
            or non-empty [Unreleased]. If False, only require file exists and has sections.

    Returns:
        (is_valid, list of error messages).
    """
    errors: list[str] = []
    if not changelog_path.exists():
        errors.append(f"Changelog not found: {changelog_path}")
        return False, errors

    sections = parse_changelog_sections(changelog_path)
    if not sections:
        errors.append("Changelog has no version sections (expect ## [Version] or ## [Unreleased])")
        return False, errors

    base_version = extract_base_version(current_version)

    if require_version_entry:
        has_unreleased = any(s[0].lower() == "unreleased" for s in sections)
        unreleased_with_content = any(
            s[0].lower() == "unreleased" and s[1] for s in sections
        )
        # Accept: section for this version (e.g. [1.0.1] or [1.0.1-test21]), or Unreleased with content
        version_section_titles = [s[0] for s in sections]
        has_this_version = any(
            extract_base_version(s) == base_version
            for s in version_section_titles
            if s.lower() != "unreleased"
        )
        try:
            has_this_version = has_this_version or base_version in version_section_titles
        except Exception:
            pass
        # Also allow exact match including prerelease (e.g. 1.0.1-test21)
        if not has_this_version:
            has_this_version = current_version in version_section_titles

        if not has_this_version and not unreleased_with_content:
            if has_unreleased:
                errors.append(
                    "Changelog has [Unreleased] but no entries under it; "
                    "add at least one item under ### Added/Changed/Fixed etc., "
                    f"or add a section for version {base_version}"
                )
            else:
                errors.append(
                    f"Changelog has no section for current version {base_version} "
                    f"(from {current_version}) and no [Unreleased] section with content"
                )
            return False, errors

    return True, []


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Validate changelog for release gate (R002)."
    )
    parser.add_argument(
        "--version",
        type=str,
        help="Version to check (default: from SRC/cuepoint/version.py)",
    )
    parser.add_argument(
        "--changelog",
        type=Path,
        default=None,
        help="Path to changelog (default: DOCS/RELEASE/changelog.md)",
    )
    parser.add_argument(
        "--no-require-version",
        action="store_true",
        help="Only check file exists and has sections; do not require version/Unreleased entry",
    )
    args = parser.parse_args()

    script_dir = Path(__file__).resolve().parent
    project_root = script_dir.parent
    changelog_path = args.changelog or (project_root / "DOCS" / "RELEASE" / "changelog.md")

    version = args.version or get_version_from_file()
    if not version:
        print("ERROR: Could not determine version (use --version or ensure version.py exists)")
        sys.exit(1)

    valid, errors = validate_changelog(
        changelog_path,
        version,
        require_version_entry=not args.no_require_version,
    )
    if not valid:
        print("Changelog validation failed (R002):")
        for e in errors:
            print(f"  {e}")
        sys.exit(1)
    print(f"[OK] Changelog validation passed for version {version}")


if __name__ == "__main__":
    main()
