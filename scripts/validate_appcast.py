#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Validate Appcast XML for Release Gate

Validates Sparkle appcast XML: required tags (sparkle:version, enclosure),
HTTPS URLs, valid SemVer, and optionally enclosure length vs artifact size.
Design: 02 Release Engineering and Distribution (2.45, 2.84).

Usage:
    python scripts/validate_appcast.py <appcast.xml> [<appcast2.xml> ...]
    python scripts/validate_appcast.py --macos path.xml --windows path.xml
"""

import argparse
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path


SPARKLE_NS = "http://www.andymatuschak.org/xml-namespaces/sparkle"


def validate_semver(version: str) -> bool:
    """Check version is valid SemVer (X.Y.Z with optional prerelease)."""
    base = version.split("-")[0].split("+")[0]
    return bool(re.match(r"^\d+\.\d+\.\d+$", base))


def validate_appcast(
    path: Path,
    *,
    check_https: bool = True,
    check_version_format: bool = True,
    check_enclosure_length: bool = False,
    artifact_path: Path | None = None,
) -> tuple[bool, list[str]]:
    """
    Validate a single appcast XML file.

    Returns:
        (is_valid, list of error messages).
    """
    errors: list[str] = []
    if not path.exists():
        return False, [f"Appcast not found: {path}"]

    try:
        tree = ET.parse(path)
        root = tree.getroot()
    except ET.ParseError as e:
        return False, [f"XML parse error: {e}"]

    if root.tag != "rss":
        errors.append("Root element must be 'rss'")

    # Ensure Sparkle NS is used in parsing
    channel = root.find("channel")
    if channel is None:
        errors.append("Missing 'channel' element")
        return False, errors

    items = channel.findall("item")
    if not items:
        errors.append("No 'item' elements in channel")
        return False, errors

    for item in items:
        # sparkle:version or shortVersionString
        sparkle_version = item.find(f"{{{SPARKLE_NS}}}version")
        short_version = item.find(f"{{{SPARKLE_NS}}}shortVersionString")
        version_elem = short_version if short_version is not None else sparkle_version
        if version_elem is None:
            errors.append("Item missing sparkle:version and sparkle:shortVersionString")
        version_text = (version_elem.text or "").strip() if version_elem is not None else ""
        if version_text and check_version_format and not validate_semver(version_text.strip()):
            errors.append(f"Invalid version format in item: {version_text!r}")

        enclosure = item.find("enclosure")
        if enclosure is None:
            errors.append("Item missing 'enclosure' element")
            continue
        url = enclosure.get("url") or ""
        if not url:
            errors.append("Enclosure missing 'url' attribute")
        elif check_https and not url.strip().lower().startswith("https://"):
            errors.append(f"Enclosure URL must be HTTPS: {url[:80]!r}")
        length_str = enclosure.get("length")
        if not length_str:
            errors.append("Enclosure missing 'length' attribute")
        elif check_enclosure_length and artifact_path and artifact_path.exists():
            try:
                expected = int(length_str)
                actual = artifact_path.stat().st_size
                if expected != actual:
                    errors.append(
                        f"Enclosure length {expected} does not match artifact size {actual}"
                    )
            except ValueError:
                errors.append(f"Enclosure 'length' is not an integer: {length_str!r}")

    return len(errors) == 0, errors


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate appcast XML (2.45, 2.84).")
    parser.add_argument(
        "paths",
        nargs="*",
        type=Path,
        help="Appcast XML file path(s)",
    )
    parser.add_argument(
        "--macos",
        type=Path,
        help="Path to macOS appcast.xml",
    )
    parser.add_argument(
        "--windows",
        type=Path,
        help="Path to Windows appcast.xml",
    )
    parser.add_argument(
        "--no-https",
        action="store_true",
        help="Do not require HTTPS for enclosure URLs",
    )
    parser.add_argument(
        "--no-version-format",
        action="store_true",
        help="Do not validate version SemVer format",
    )
    args = parser.parse_args()

    to_validate: list[Path] = list(args.paths)
    if args.macos:
        to_validate.append(args.macos)
    if args.windows:
        to_validate.append(args.windows)

    if not to_validate:
        # Default paths
        root = Path(__file__).resolve().parent.parent
        for p in [
            root / "updates" / "macos" / "stable" / "appcast.xml",
            root / "updates" / "windows" / "stable" / "appcast.xml",
        ]:
            if p.exists():
                to_validate.append(p)
        if not to_validate:
            print("No appcast paths given and no default files found.")
            sys.exit(1)

    all_errors: list[tuple[Path, list[str]]] = []
    for path in to_validate:
        valid, errors = validate_appcast(
            path,
            check_https=not args.no_https,
            check_version_format=not args.no_version_format,
        )
        if not valid:
            all_errors.append((path, errors))

    if all_errors:
        print("Appcast validation failed:")
        for path, errors in all_errors:
            print(f"  {path}:")
            for e in errors:
                print(f"    - {e}")
        sys.exit(1)
    print(f"[OK] Appcast validation passed for {len(to_validate)} file(s)")


if __name__ == "__main__":
    main()
