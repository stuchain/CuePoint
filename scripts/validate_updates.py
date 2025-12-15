#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Validate update artifacts and appcast feeds (Step 8.3).

This script is intentionally conservative and suitable for CI/release gates:
- Verifies appcast XML structure
- Enforces HTTPS URLs for feed enclosures
- Checks that size fields are present and numeric
- Warns (does not fail) if macOS appcast items have no Sparkle signatures

Usage:
  python scripts/validate_updates.py --macos updates/macos/stable/appcast.xml --windows updates/windows/stable/appcast.xml
"""

from __future__ import annotations

import argparse
import sys
import xml.etree.ElementTree as ET
from pathlib import Path
from urllib.parse import urlparse

SPARKLE_NS = "http://www.andymatuschak.org/xml-namespaces/sparkle"


def _is_https(url: str) -> bool:
    try:
        p = urlparse(url)
        return p.scheme == "https" and bool(p.netloc)
    except Exception:
        return False


def validate_appcast_xml(appcast_path: Path, platform: str) -> tuple[bool, list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []

    if not appcast_path.exists():
        return False, [f"{platform}: appcast not found: {appcast_path}"], []

    try:
        tree = ET.parse(appcast_path)
        root = tree.getroot()
    except ET.ParseError as e:
        return False, [f"{platform}: XML parse error: {e}"], []

    if root.tag != "rss":
        errors.append(f"{platform}: invalid root element (expected rss, got {root.tag})")

    channel = root.find("channel")
    if channel is None:
        errors.append(f"{platform}: missing channel element")
        return False, errors, warnings

    items = channel.findall("item")
    if not items:
        errors.append(f"{platform}: no items found")
        return False, errors, warnings

    for idx, item in enumerate(items):
        enclosure = item.find("enclosure")
        if enclosure is None:
            errors.append(f"{platform}: item[{idx}] missing enclosure")
            continue

        url = enclosure.get("url") or ""
        if not url:
            errors.append(f"{platform}: item[{idx}] enclosure missing url")
        elif not _is_https(url):
            errors.append(f"{platform}: item[{idx}] enclosure url must be https: {url}")

        length = enclosure.get("length")
        if length is None:
            errors.append(f"{platform}: item[{idx}] enclosure missing length")
        else:
            try:
                if int(length) <= 0:
                    errors.append(f"{platform}: item[{idx}] enclosure length must be > 0")
            except ValueError:
                errors.append(f"{platform}: item[{idx}] enclosure length not an integer: {length}")

        # macOS: signatures are recommended if using Sparkle verification.
        if platform.lower() == "macos":
            sig = enclosure.get(f"{{{SPARKLE_NS}}}edSignature") or enclosure.get(f"{{{SPARKLE_NS}}}dsaSignature")
            if not sig:
                warnings.append(f"{platform}: item[{idx}] has no sparkle signature attribute (edSignature/dsaSignature)")

    return len(errors) == 0, errors, warnings


def main() -> int:
    ap = argparse.ArgumentParser(description="Validate update appcasts and basic security invariants")
    ap.add_argument("--macos", type=str, default=None, help="Path to macOS appcast.xml")
    ap.add_argument("--windows", type=str, default=None, help="Path to Windows appcast.xml")
    args = ap.parse_args()

    if not args.macos and not args.windows:
        ap.error("Provide at least one of --macos or --windows")

    all_errors: list[str] = []
    all_warnings: list[str] = []

    if args.macos:
        ok, errs, warns = validate_appcast_xml(Path(args.macos), "macos")
        all_errors.extend(errs)
        all_warnings.extend(warns)
        print("✓ macos appcast ok" if ok else "✗ macos appcast failed")

    if args.windows:
        ok, errs, warns = validate_appcast_xml(Path(args.windows), "windows")
        all_errors.extend(errs)
        all_warnings.extend(warns)
        print("✓ windows appcast ok" if ok else "✗ windows appcast failed")

    if all_warnings:
        print("\nWarnings:")
        for w in all_warnings:
            print(f"  - {w}")

    if all_errors:
        print("\nErrors:")
        for e in all_errors:
            print(f"  - {e}")
        return 1

    print("\nUpdate validation OK.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())


