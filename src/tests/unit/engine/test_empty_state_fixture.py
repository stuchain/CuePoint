#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The empty states, answered by the real engine (ORG-13).

Phase 6's spec asks that every empty state render "from a real engine response
rather than a mocked shape". A renderer test writing its own ``{"nodes": []}``
proves the branch runs; it proves nothing about whether the engine ever sends
that. The two agree until the day they do not, and an empty state is exactly
the code nobody looks at again.

So the responses live in one file, ``emptyLibrary.fixture.json``, and it has two
readers. This test **produces** them: it starts the real engine over a real
database in each of the states a user can reach, and asserts the file still
matches what came back. The renderer's ``libraryEmpty.test.ts`` **consumes**
them, rendering each empty state from the same JSON.

An engine change that reshapes one of these answers fails here first, with the
new payload in the diff. Regenerate with::

    CUEPOINT_WRITE_FIXTURES=1 python -m pytest \
        src/tests/unit/engine/test_empty_state_fixture.py

and read the diff before committing it — that is the review this file exists to
force.

The states, and why each one is here:

* **untouched** — tracks imported, nothing organized yet. Three empty answers
  that reach three different empty states: no Collections, no tags, and no tag
  values to filter by.
* **empty_collection** — a Collection holding nothing.
* **smart_matches_nothing** — a saved rule set that is true of no track. The
  table is empty and the rules are the reason, which is why the page shows them.
* **refused_rule** — a rule the engine will not run, which is an empty table
  that is not an empty answer, and must never read as "no matches".
"""

from __future__ import annotations

import json
import os
from pathlib import Path

import pytest

from cuepoint.models.library_track import LibraryTrack
from tests.unit.engine.test_engine_library_browse import (
    engine,  # noqa: F401 — a pytest fixture, used by name
    get_error,
    get_json,
    library_db,  # noqa: F401 — a pytest fixture, used by name
)
from tests.unit.engine.test_engine_organization_api import post

#: The file both languages read. It lives in the renderer's tree because that
#: is where it is imported from at build time; it is produced here because that
#: is where the truth is.
FIXTURE = (
    Path(__file__).resolve().parents[4]
    / "apps"
    / "desktop-electron"
    / "renderer"
    / "src"
    / "screens"
    / "library"
    / "emptyLibrary.fixture.json"
)

#: Set to rewrite the fixture instead of asserting against it.
WRITE_ENV = "CUEPOINT_WRITE_FIXTURES"

#: Enough tracks that "nothing matched" is a real answer about a real library
#: rather than the trivial one about an empty database.
TRACKS = (
    ("1", "Strobe", "deadmau5", "Progressive House", 128.0),
    ("2", "Rej", "Ame", "Deep House", 122.5),
    ("3", "Opus", "Eric Prydz", "Progressive House", 126.0),
)


@pytest.fixture
def seeded(library_db):  # noqa: F811 — the fixture is used by name
    """Three tracks and nothing else: no Collections, no tags, no ratings."""
    from cuepoint.services.interfaces import ITrackRepository
    from cuepoint.utils.di_container import get_container

    repo = get_container().resolve(ITrackRepository)
    for track_id, title, artist, genre, bpm in TRACKS:
        repo.add(
            LibraryTrack(
                rekordbox_track_id=track_id,
                file_path=f"/music/{track_id}.mp3",
                title=title,
                artist=artist,
                genre=genre,
                bpm=bpm,
            )
        )
    return library_db


def _capture(base: str) -> dict:
    """Walk the four states and return exactly what the engine answered."""
    untouched = {
        "collections": get_json(base, "/api/v1/collections"),
        "tags": get_json(base, "/api/v1/tags"),
        "tag_facet": get_json(base, "/api/v1/library/facets", field="tag"),
    }

    # A Collection with nothing in it. Made through the API rather than the
    # repository, so the browse below is the shape a user's first Collection
    # actually produces.
    status, made = post(
        base,
        "/api/v1/collections/create",
        {"kind": "collection", "name": "Shortlist"},
    )
    assert status == 200, made
    collection_id = made["collection"]["id"]
    empty_collection = {
        "collection": made["collection"],
        "browse": get_json(
            base,
            "/api/v1/library/search",
            mode="browse",
            scope="collection",
            collection_id=collection_id,
            limit=100,
        ),
    }

    # A saved rule set this library cannot answer: a genre that is not in it.
    rules = {
        "match": "all",
        "rules": [{"field": "genre", "operator": "is", "value": "Gabber"}],
    }
    status, saved = post(
        base,
        "/api/v1/collections/smart/save",
        {"name": "Gabber", "rules": rules},
    )
    assert status == 200, saved
    smart_id = saved["collection"]["id"]
    smart = {
        "collection": saved["collection"],
        "browse": get_json(
            base,
            "/api/v1/library/search",
            mode="browse",
            scope="smart",
            collection_id=smart_id,
            limit=100,
        ),
    }

    # A rule the engine refuses. The tag is gone — the case ORG-06 reports and
    # DEC-060 names — which is an empty table that is not an empty answer.
    refused_status, refused = get_error(
        base,
        "/api/v1/library/search",
        mode="browse",
        filters=json.dumps(
            {
                "match": "all",
                "rules": [{"field": "tag", "operator": "has_tag", "value": 9999}],
            }
        ),
        limit=100,
    )

    return {
        "_comment": (
            "Real engine responses, produced by "
            "src/tests/unit/engine/test_empty_state_fixture.py. Do not "
            "hand-edit: regenerate with CUEPOINT_WRITE_FIXTURES=1 and read "
            "the diff."
        ),
        "untouched": untouched,
        "empty_collection": empty_collection,
        "smart_matches_nothing": smart,
        "refused_rule": {"status": refused_status, "payload": refused},
    }


def _volatile(payload: dict) -> dict:
    """Drop the fields that differ between two identical runs.

    A Collection carries the moment it was made. Keeping it would make the
    fixture rewrite itself on every run and turn a real shape change into
    noise nobody reads.
    """
    stripped = json.loads(json.dumps(payload))
    for state in ("empty_collection", "smart_matches_nothing"):
        for field in ("created_at", "updated_at"):
            stripped[state]["collection"].pop(field, None)
    return stripped


@pytest.mark.unit
class TestTheFixtureIsWhatTheEngineSays:
    def test_it_matches_the_checked_in_file(self, seeded, engine):  # noqa: F811
        """The file the renderer renders from is the engine's own answer."""
        captured = _volatile(_capture(engine))
        text = json.dumps(captured, indent=2, sort_keys=True) + "\n"

        if os.environ.get(WRITE_ENV):
            FIXTURE.write_text(text, encoding="utf-8", newline="\n")
            pytest.skip(f"rewrote {FIXTURE.name}")

        assert FIXTURE.is_file(), (
            f"{FIXTURE} is missing; rerun with {WRITE_ENV}=1 to write it"
        )
        stored = json.loads(FIXTURE.read_text(encoding="utf-8"))
        assert stored == captured, (
            "the engine no longer answers what the renderer's empty states are "
            f"tested against; regenerate with {WRITE_ENV}=1 and read the diff"
        )


@pytest.mark.unit
class TestEachStateIsActuallyEmpty:
    """The fixture is only useful if each state is the one it claims to be.

    Asserted against a fresh capture rather than against the file, so a fixture
    regenerated from a broken engine cannot quietly become the new expectation.
    """

    @pytest.fixture
    def captured(self, seeded, engine):  # noqa: F811
        return _capture(engine)

    def test_a_new_library_has_no_collections(self, captured):
        assert captured["untouched"]["collections"]["collections"] == []

    def test_a_new_library_has_no_tags(self, captured):
        assert captured["untouched"]["tags"]["tags"] == []

    def test_a_new_library_offers_no_tag_to_filter_by(self, captured):
        # Not an empty list. An untagged library answers with one row — "no
        # tag, 3 tracks" — so a bar that decided it had nothing to offer by
        # counting rows would count one and offer a chip for nothing. This is
        # the assertion that caught it.
        values = captured["untouched"]["tag_facet"]["values"]
        assert [value["value"] for value in values] == [None]

    def test_an_empty_collection_browses_to_nothing(self, captured):
        browse = captured["empty_collection"]["browse"]
        assert browse["total"] == 0
        assert browse["tracks"] == []

    def test_a_smart_collection_can_match_nothing(self, captured):
        browse = captured["smart_matches_nothing"]["browse"]
        assert browse["total"] == 0
        assert browse["tracks"] == []

    def test_the_rules_it_matched_nothing_with_come_back_with_it(self, captured):
        # What the page shows instead of "no tracks": the question, so the
        # reader can see why the answer is nothing.
        node = captured["smart_matches_nothing"]["collection"]
        assert node["rules"]["rules"][0]["field"] == "genre"

    def test_the_library_it_matched_nothing_in_is_not_empty(
        self,
        seeded,
        engine,  # noqa: F811
    ):
        # The point of both empty states: tracks are there, and the scope is
        # why none of them shows. An empty database would prove nothing.
        whole = get_json(base=engine, path="/api/v1/library/search", mode="browse")
        assert whole["total"] == len(TRACKS)

    def test_a_refused_rule_is_a_refusal_and_not_an_empty_page(self, captured):
        refused = captured["refused_rule"]
        assert refused["status"] == 400
        message = refused["payload"]["error"]["message"]
        # It names the clause. "No tracks match this search" over this would
        # send someone looking for tracks nobody asked for.
        assert "tag" in message.lower()
        assert "tracks" not in refused["payload"]
