#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Every reason Similar Tracks can give, as the renderer receives it (DISCOVER-08).

DEC-096's reasons are data, and the renderer turns them into words. The
specification asks that "a test holds every reason the engine can produce to a
string the UI has". This is the engine's half: the real service, over a real
library built so each reason in ``core.similarity.REASONS`` is given at least
once, writes ``similarReasons.fixture.json`` beside the renderer module that
words them. ``similarReasons.test.ts`` is the other half: it gives every
reason in the file a sentence of its own. A reason added to the rule without
words fails here first (the file no longer covers ``REASONS``) and there next.

To write the file again after a deliberate change::

    CUEPOINT_WRITE_FIXTURES=1 python -m pytest \
        src/tests/unit/services/test_similar_reasons_fixture.py

and read the diff before committing it.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Dict, List

import pytest

from tests.unit.key_support import accept_with_key
from cuepoint.core.similarity import COMPONENTS, REASONS
from cuepoint.models.library_track import LibraryTrack
from cuepoint.persistence.similarity_repository import SimilarityRepository
from cuepoint.persistence.track_credit_repository import TrackCreditRepository
from cuepoint.persistence.track_repository import TrackRepository
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.migration_runner import MigrationRunner
from cuepoint.services.similarity_service import SimilarityService

pytestmark = pytest.mark.unit

REPO_ROOT = Path(__file__).resolve().parents[4]
FIXTURE = (
    REPO_ROOT
    / "apps"
    / "desktop-electron"
    / "renderer"
    / "src"
    / "screens"
    / "discover"
    / "similarReasons.fixture.json"
)
WRITE = os.environ.get("CUEPOINT_WRITE_FIXTURES") == "1"


def produce(tmp_path: Path) -> Dict[str, Any]:
    db = DatabaseService(db_path=tmp_path / "cuepoint.db")
    MigrationRunner(db).migrate()
    try:
        tracks = TrackRepository(db)
        number = 0

        def add(artist: str, **values: Any) -> int:
            nonlocal number
            number += 1
            stored = tracks.add(
                LibraryTrack(
                    rekordbox_track_id=str(number),
                    file_path=f"/music/{number}.mp3",
                    title=f"Track {number}",
                    artist=artist,
                    **values,
                )
            )
            assert stored.id is not None
            if values.get("key"):
                # The key is Beatport's, by an accepted match (PAGES-15).
                accept_with_key(db, stored.id, values["key"])
            return stored.id

        seed = add(
            "Âme, Dixon",
            bpm=124.0,
            key="8A",
            genre="Deep House",
            label="Innervisions",
        )
        # Each candidate gives the reasons the one before it could not.
        add("Âme, Dixon", bpm=124.0, key="8A", genre="deep-house", label="INNERVISIONS")
        add("Kerri Chandler", bpm=126.5, key="9A")
        add("Kerri Chandler", bpm=62.0, key="8B")
        add("Kerri Chandler", bpm=248.0)
        # A track with nothing to offer, for what a seed could not use.
        empty = add("Nobody")
        with db.transaction() as conn:
            conn.execute("DELETE FROM track_credits WHERE track_id = ?", (empty,))

        service = SimilarityService(
            SimilarityRepository(db), TrackCreditRepository(db), tracks
        )
        answer = service.similar(seed)
        reasons: List[Dict[str, Any]] = []
        given = set()
        for kind in REASONS:
            for suggestion in answer.suggestions:
                for reason in suggestion.reasons:
                    if (
                        reason["component"],
                        reason["detail"],
                    ) == kind and kind not in given:
                        given.add(kind)
                        reasons.append(dict(reason))
        return {
            "notation": answer.notation,
            "reasons": reasons,
            "unused": list(service.similar(empty).unused),
        }
    finally:
        db.close_all()


def test_the_fixture_is_what_the_engine_answers(tmp_path):
    produced = produce(tmp_path)
    text = json.dumps(produced, indent=2, ensure_ascii=False, sort_keys=True) + "\n"
    if WRITE:
        FIXTURE.parent.mkdir(parents=True, exist_ok=True)
        FIXTURE.write_text(text, encoding="utf-8", newline="\n")
    assert FIXTURE.read_text(encoding="utf-8") == text, (
        "similarReasons.fixture.json is not what the engine answers now; write it"
        " again with CUEPOINT_WRITE_FIXTURES=1 and read the diff"
    )


def test_the_fixture_covers_every_reason_and_every_component(tmp_path):
    produced = produce(tmp_path)
    given = [(r["component"], r["detail"]) for r in produced["reasons"]]
    assert given == list(REASONS)
    assert produced["unused"] == list(COMPONENTS)


def test_a_shared_artist_reason_can_name_several(tmp_path):
    produced = produce(tmp_path)
    [artist] = [r for r in produced["reasons"] if r["component"] == "artist"]
    assert artist["names"] == ["Âme", "Dixon"]
