#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Regression: test fixtures that git silently refused to commit.

**What broke.** ``.gitignore`` ignores every ``*.json`` as user output. The
Beatport v4 fixtures DISCOVER-01 wrote are JSON, so its commit carried the
fixtures' README and none of the fixtures. Every test that reads them passed
on the machine that wrote them and would fail on a fresh clone or in CI —
nothing locally could show it, because the files were there.

**Why it is easy to reintroduce.** Any new fixture directory of JSON is ignored
by default, and ``git status`` says nothing about an ignored file. This asks
git itself, for every fixture file, whether it would be committed.
"""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

import pytest

_REPO = Path(__file__).resolve().parents[3]
_FIXTURES = _REPO / "src" / "tests" / "fixtures"

#: Fixtures that are local on purpose: developer captures a test skips without.
LOCAL_ONLY = {
    # scripts/debug_beatport_search_page.py writes it; its test skips if absent.
    "beatport/search_next_data_sample.json",
}


def _git(*args: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["git", *args], cwd=_REPO, capture_output=True, text=True, check=False
    )


@pytest.fixture(scope="module")
def ignored() -> set:
    if shutil.which("git") is None or _git("rev-parse", "--git-dir").returncode:
        pytest.skip("not a git checkout")
    files = [
        path.relative_to(_REPO).as_posix()
        for path in _FIXTURES.rglob("*")
        if path.is_file()
        and "__pycache__" not in path.parts
        and ".ruff_cache" not in path.parts
    ]
    result = _git("check-ignore", "--no-index", *files)
    return {
        line.strip().replace("src/tests/fixtures/", "", 1)
        for line in result.stdout.splitlines()
        if line.strip()
    }


def test_no_fixture_is_ignored_by_git(ignored):
    assert ignored - LOCAL_ONLY == set(), (
        "These fixtures would never be committed; add an exception to "
        ".gitignore beside the others, saying why"
    )


def test_the_beatport_v4_fixtures_in_particular(ignored):
    v4 = {name for name in ignored if name.startswith("beatport_v4/")}
    assert v4 == set()
