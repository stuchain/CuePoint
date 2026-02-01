#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Generate release notes from merged PRs since last tag.

Design: 02 Release Engineering (2.18). Uses GitHub API to list PRs merged
since the release tag and formats them as markdown. Set GITHUB_TOKEN and
GITHUB_REPOSITORY (or pass --repo). For tag v1.2.3, PRs merged into the
branch that was tagged are included.

Usage:
    export GITHUB_TOKEN=...
    python scripts/generate_release_notes.py --tag v1.2.3 [--output RELEASE_NOTES.md]
    python scripts/generate_release_notes.py --tag v1.2.3 --repo owner/repo
"""

import argparse
import json
import os
import re
import sys
import urllib.request
from pathlib import Path


def get_project_root() -> Path:
    return Path(__file__).resolve().parent.parent


def get_version_from_tag(tag: str) -> str:
    return tag.lstrip("v") if tag.startswith("v") else tag


def fetch_prs_in_tag(repo: str, tag: str, token: str, max_commits: int = 250) -> list[dict]:
    """Fetch PRs whose merge commits are in the given tag. Uses GitHub API."""
    headers = {
        "Accept": "application/vnd.github.v3+json",
        "Authorization": f"Bearer {token}",
    }
    out: list[dict] = []
    try:
        req = urllib.request.Request(
            f"https://api.github.com/repos/{repo}/commits?sha={tag}&per_page=100",
            headers=headers,
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            commits = json.loads(resp.read().decode())
        pr_numbers: set[int] = set()
        for c in commits:
            msg = c.get("commit", {}).get("message", "")
            m = re.search(r"Merge pull request #(\d+)|#(\d+)", msg, re.I)
            if m:
                pr_numbers.add(int(m.group(1) or m.group(2)))
        for num in sorted(pr_numbers, reverse=True):
            pr_url = f"https://api.github.com/repos/{repo}/pulls/{num}"
            req = urllib.request.Request(pr_url, headers=headers)
            try:
                with urllib.request.urlopen(req, timeout=10) as resp:
                    pr = json.loads(resp.read().decode())
                    out.append({"number": num, "title": pr.get("title", ""), "html_url": pr.get("html_url", "")})
            except Exception:
                out.append({"number": num, "title": f"PR #{num}", "html_url": f"https://github.com/{repo}/pull/{num}"})
    except Exception as e:
        print(f"Warning: Could not fetch PRs: {e}", file=sys.stderr)
    return out


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate release notes from merged PRs (2.18).")
    parser.add_argument("--tag", "-t", required=True, help="Release tag (e.g. v1.2.3)")
    parser.add_argument("--repo", "-r", default=os.environ.get("GITHUB_REPOSITORY"), help="Repo owner/name")
    parser.add_argument("--output", "-o", type=Path, default=None, help="Output path (default: stdout)")
    parser.add_argument("--token", default=os.environ.get("GITHUB_TOKEN"), help="GitHub token (default: GITHUB_TOKEN)")
    args = parser.parse_args()

    version = get_version_from_tag(args.tag)
    token = args.token
    repo = args.repo

    lines = [
        f"# Release {args.tag}",
        "",
        f"**Version**: {version}",
        "",
        "## Changes",
        "",
    ]

    if token and repo:
        prs = fetch_prs_in_tag(repo, args.tag, token)
        if prs:
            for pr in prs:
                lines.append(f"- [{pr['title']}]({pr['html_url']}) (#{pr['number']})")
            lines.append("")
        else:
            lines.append("See CHANGELOG for details.")
            lines.append("")
    else:
        lines.append("See CHANGELOG for details.")
        lines.append("")

    lines.extend([
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
    ])

    text = "\n".join(lines)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(text, encoding="utf-8")
        print(f"Written: {args.output}")
    else:
        print(text)


if __name__ == "__main__":
    main()
