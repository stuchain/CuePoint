#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The Clean page's empty states, answered by the real engine (CLEAN-12).

CLEAN-12 asks, as ORG-13 did, for empty states "from real engine responses": a
renderer test that writes its own ``{"groups": []}`` proves a branch runs, not
that the engine ever sends it. So, as ``test_empty_state_fixture.py`` does for
the Library, this test **produces** ``cleanEmpty.fixture.json`` by walking a
real engine over a real database through the states a user reaches, and the
renderer's ``cleanEmpty.test.ts`` **consumes** it.

Regenerate with::

    CUEPOINT_WRITE_FIXTURES=1 python -m pytest \
        src/tests/unit/engine/test_clean_empty_state_fixture.py

and read the diff before committing it.

The states, in the order a library reaches them:

* **untouched** — tracks imported and nothing else: nothing matched yet, files
  never checked, duplicates never looked for.
* **checked** — every file checked and every one there: no missing files.
* **scanned** — duplicates looked for and none found.
* **matched** — every track matched and accepted: nothing needs review.

Beatport is never reached: the matched state stores its attempts through the
repository, as the Clean API tests do.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Dict, List

import pytest

from cuepoint.engine.jobs import JobState
from tests.unit.engine.test_engine_clean_api import (  # noqa: F401 — fixtures
    add_tracks,
    attempt,
    candidate,
    engine,
    finished,
    get,
    library_db,
    no_beatport,
    ok,
    post,
    store,
    track,
)

FIXTURE = (
    Path(__file__).resolve().parents[4]
    / "apps"
    / "desktop-electron"
    / "renderer"
    / "src"
    / "screens"
    / "clean"
    / "cleanEmpty.fixture.json"
)

WRITE_ENV = "CUEPOINT_WRITE_FIXTURES"

#: The rule sets the page's two scoped tables ask with. The renderer holds its
#: own copies; ``cleanEmpty.test.ts`` holds them to these.
NEEDS_REVIEW = {
    "match": "all",
    "rules": [{"field": "match_state", "operator": "is", "value": "needs_review"}],
}
MISSING_FILES = {
    "match": "all",
    "rules": [
        {
            "field": "file_status",
            "operator": "any_of",
            "value": ["missing", "unreadable"],
        }
    ],
}

#: Stands in for a time the engine recorded, so the fixture does not rewrite
#: itself on every run. ``null`` is kept as ``null``: never run is the point.
RECORDED = "<recorded>"


def _browse(base: str, rules: Dict[str, Any]) -> Dict[str, Any]:
    return ok(
        get(
            base,
            "/api/v1/library/search",
            mode="browse",
            filters=json.dumps(rules),
            limit=100,
        )
    )


def _health(base: str) -> Dict[str, Any]:
    return ok(get(base, "/api/v1/clean/health"))


def _capture(base: str, job_store: Any, tmp_path: Path) -> Dict[str, Any]:
    paths: List[Path] = []
    for name in ("strobe", "rej", "opus"):
        path = tmp_path / f"{name}.mp3"
        path.write_bytes(b"not really audio")
        paths.append(path)
    ids = add_tracks(
        track("Strobe", file_path=str(paths[0]), duration_seconds=600),
        track("Rej", file_path=str(paths[1]), duration_seconds=420),
        track("Opus", file_path=str(paths[2]), duration_seconds=540),
    )

    untouched = {
        "health": _health(base),
        "needs_review": _browse(base, NEEDS_REVIEW),
        "missing_files": _browse(base, MISSING_FILES),
        "duplicates": ok(get(base, "/api/v1/clean/duplicates")),
    }

    started = ok(
        post(base, "/api/v1/clean/files/check", {"selection": {"track_ids": ids}}), 202
    )
    assert finished(job_store, started["job_id"]).state == JobState.SUCCEEDED
    checked = {"health": _health(base), "missing_files": _browse(base, MISSING_FILES)}

    scan = ok(post(base, "/api/v1/clean/duplicates/scan", {}), 202)
    assert finished(job_store, scan["job_id"]).state == JobState.SUCCEEDED
    scanned = {
        "health": _health(base),
        "duplicates": ok(get(base, "/api/v1/clean/duplicates")),
    }

    for number, track_id in enumerate(ids, start=1):
        attempt(track_id, candidate(number, score=97.0))
    matched = {"health": _health(base), "needs_review": _browse(base, NEEDS_REVIEW)}

    return {
        "_comment": (
            "Real engine responses, produced by "
            "src/tests/unit/engine/test_clean_empty_state_fixture.py. Do not "
            "hand-edit: regenerate with CUEPOINT_WRITE_FIXTURES=1 and read the diff."
        ),
        "rules": {"needs_review": NEEDS_REVIEW, "missing_files": MISSING_FILES},
        "untouched": untouched,
        "checked": checked,
        "scanned": scanned,
        "matched": matched,
    }


def _volatile(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Replace the times a run records, keeping whether there is one."""
    stripped = json.loads(json.dumps(payload))
    for state in ("untouched", "checked", "scanned", "matched"):
        for run in stripped[state]["health"]["detections"]:
            if run["last_run_at"] is not None:
                run["last_run_at"] = RECORDED
    return stripped


@pytest.fixture
def captured(engine, store, tmp_path):  # noqa: F811
    return _capture(engine, store, tmp_path)


@pytest.mark.unit
class TestTheFixtureIsWhatTheEngineSays:
    def test_it_matches_the_checked_in_file(self, captured):
        stable = _volatile(captured)
        text = json.dumps(stable, indent=2, sort_keys=True) + "\n"

        if os.environ.get(WRITE_ENV):
            FIXTURE.parent.mkdir(parents=True, exist_ok=True)
            FIXTURE.write_text(text, encoding="utf-8", newline="\n")
            pytest.skip(f"rewrote {FIXTURE.name}")

        assert FIXTURE.is_file(), (
            f"{FIXTURE} is missing; rerun with {WRITE_ENV}=1 to write it"
        )
        stored = json.loads(FIXTURE.read_text(encoding="utf-8"))
        assert stored == stable, (
            "the engine no longer answers what the Clean page's empty states are "
            f"tested against; regenerate with {WRITE_ENV}=1 and read the diff"
        )


@pytest.mark.unit
class TestEachStateIsTheOneItClaims:
    """Asserted against a fresh capture, so a broken engine cannot become the fixture."""

    def counts(self, state: Dict[str, Any]) -> Dict[str, int]:
        return {c["id"]: c["count"] for c in state["health"]["counts"]}

    def runs(self, state: Dict[str, Any]) -> Dict[str, Any]:
        return {d["id"]: d["last_run_at"] for d in state["health"]["detections"]}

    def test_untouched_is_nothing_matched_and_nothing_looked_at(self, captured):
        state = captured["untouched"]
        assert self.counts(state)["not_matched"] == state["health"]["track_count"] == 3
        assert state["needs_review"]["total"] == 0
        assert self.runs(state) == {"files": None, "duplicates": None, "artwork": None}
        assert state["missing_files"]["total"] == 0
        assert state["duplicates"]["groups"] == []

    def test_checked_found_every_file(self, captured):
        state = captured["checked"]
        assert self.runs(state)["files"] is not None
        assert self.counts(state)["missing_files"] == 0
        assert state["missing_files"]["total"] == 0

    def test_scanned_found_no_duplicates(self, captured):
        state = captured["scanned"]
        assert self.runs(state)["duplicates"] is not None
        assert state["duplicates"] == {
            "groups": [],
            "total": 0,
            "limit": None,
            "offset": 0,
        }

    def test_matched_left_nothing_to_review(self, captured):
        state = captured["matched"]
        assert self.counts(state)["not_matched"] == 0
        assert self.counts(state)["needs_review"] == 0
        assert state["needs_review"]["total"] == 0

    def test_no_path_reaches_the_fixture(self, captured):
        # The files live in a temporary folder with a user's name in it; an
        # empty state has no rows, and the fixture must not carry one.
        assert "not really audio" not in json.dumps(captured)
        for state in ("untouched", "checked", "scanned", "matched"):
            assert ".mp3" not in json.dumps(captured[state]), state
