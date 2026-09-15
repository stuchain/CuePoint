#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Artwork as stored, and as a filter and a facet (CLEAN-09, DEC-076).

The repository first: which files a scan may open, which match counts, and how
each write leaves the other half of a record alone. Then ``artwork`` — what the
table would show — over a library holding every case the rule has to tell apart:

- **The file's picture first**, but only an answer read at the path the track has
  now, and not a picture the guard refused.
- **Then Beatport's image for an accepted match**: the candidate's own, or the
  one looked up later from that candidate's page — never another page's, and
  not one the guard refused.
- **Then "none" for a file read and found empty, else "unknown".**
- **A facet counts what its rule finds**, and "is not" is the exact complement.
"""

from __future__ import annotations

import uuid
from typing import Dict, Optional, Sequence, Set

import pytest

from cuepoint.models.artwork import EMBEDDED_NONE, EMBEDDED_PRESENT, EMBEDDED_UNKNOWN
from cuepoint.models.beatport_candidate import BeatportCandidate
from cuepoint.models.file_status import FILE_MISSING, FILE_PRESENT, TrackFileStatus
from cuepoint.models.filter_rule import (
    ARTWORK_ALIAS,
    ARTWORK_VALUES,
    MATCH_ALIAS,
    MATCH_CANDIDATE_ALIAS,
    FilterRule,
    RuleSet,
    describe_fields,
    field_spec,
)
from cuepoint.models.library_track import LibraryTrack
from cuepoint.models.result import TrackResult
from cuepoint.models.track import Track
from cuepoint.persistence.activity_repository import ActivityRepository
from cuepoint.persistence.artwork_repository import ArtworkRepository, EmbeddedRecord
from cuepoint.persistence.file_status_repository import FileStatusRepository
from cuepoint.persistence.filter_sql import required_joins
from cuepoint.persistence.match_repository import MatchRepository
from cuepoint.persistence.track_query import BrowseQuery
from cuepoint.persistence.track_repository import TrackRepository
from cuepoint.services.activity_service import ActivityService
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.match_state import MatchStateService
from cuepoint.services.migration_runner import MigrationRunner

NOW = "2026-09-15T12:00:00+00:00"
QUESTION = Track(title="A Title", artist="An Artist")
HASH = "a" * 64
OTHER_HASH = "b" * 64


def page_of(beatport_id: str) -> str:
    return f"https://www.beatport.com/track/a-title/{beatport_id}"


def art(name: str) -> str:
    return f"https://geo-media.beatport.com/image_size/{{w}}x{{h}}/{name}.jpg"


@pytest.fixture
def db(tmp_path):
    service = DatabaseService(db_path=tmp_path / "cuepoint.db")
    MigrationRunner(service).migrate()
    yield service
    service.close_all()


@pytest.fixture
def tracks(db) -> TrackRepository:
    return TrackRepository(db)


@pytest.fixture
def artwork(db) -> ArtworkRepository:
    return ArtworkRepository(db)


def add(db, tracks, names: Sequence[str]) -> Dict[str, int]:
    prefix = uuid.uuid4().hex[:6]
    tracks.add_many(
        [
            LibraryTrack(
                rekordbox_track_id=f"{prefix}-{name}",
                title=name,
                artist="A",
                file_path=f"/m/{name}.mp3",
            )
            for name in names
        ]
    )
    return {
        str(row["title"]): int(row["id"])
        for row in db.connect().execute(
            "SELECT id, title FROM tracks WHERE rekordbox_track_id LIKE ?",
            (f"{prefix}-%",),
        )
    }


def checked(
    db, track_id: int, status: str = FILE_PRESENT, path: Optional[str] = None
) -> None:
    current = (
        db.connect()
        .execute("SELECT file_path FROM tracks WHERE id = ?", (track_id,))
        .fetchone()["file_path"]
    )
    with db.transaction():
        FileStatusRepository(db).record(
            [TrackFileStatus(track_id, status, path or current, NOW, None)]
        )


def read(
    db, artwork, track_id: int, embedded: str, digest=None, path=None, refused=None
):
    current = (
        db.connect()
        .execute("SELECT file_path FROM tracks WHERE id = ?", (track_id,))
        .fetchone()["file_path"]
    )
    with db.transaction():
        return artwork.record_embedded(
            [EmbeddedRecord(track_id, embedded, digest, NOW, path or current, refused)]
        )


def matched(
    db, tracks, track_id: int, beatport_id: str, artwork_url, score=97.0
) -> None:
    best = BeatportCandidate(
        url=page_of(beatport_id),
        title="A Title",
        artists="An Artist",
        label=None,
        release_date=None,
        bpm=None,
        key=None,
        genre=None,
        score=score,
        title_sim=90,
        artist_sim=90,
        query_index=1,
        query_text="q",
        candidate_index=1,
        base_score=score,
        bonus_year=0,
        bonus_key=0,
        guard_ok=True,
        reject_reason="",
        elapsed_ms=1,
        is_winner=False,
        release_year=None,
        release_name=None,
        artwork_url=artwork_url,
    )
    result = TrackResult(
        playlist_index=1,
        title="A Title",
        artist="An Artist",
        matched=True,
        best_match=best,
        candidates=[best],
        match_score=score,
    )
    matches = MatchRepository(db)
    states = MatchStateService(
        matches, tracks, ActivityService(ActivityRepository(db), tracks), db
    )
    states.apply_attempt(matches.add_attempt(track_id, "job", result, QUESTION))


# ------------------------------------------------------------------ repository


@pytest.mark.unit
class TestWhichFilesAScanMayOpen:
    def test_only_files_found_present_at_their_current_path(self, db, tracks, artwork):
        ids = add(db, tracks, ["present", "missing", "unchecked", "moved"])
        checked(db, ids["present"])
        checked(db, ids["missing"], FILE_MISSING)
        checked(db, ids["moved"], path="/old/moved.mp3")

        wanted = [
            ids["moved"],
            ids["present"],
            ids["present"],
            ids["missing"],
            ids["unchecked"],
        ]

        assert artwork.present_files(wanted) == [(ids["present"], "/m/present.mp3")]

    def test_file_is_present_tells_unchecked_from_missing(self, db, tracks, artwork):
        ids = add(db, tracks, ["present", "missing", "unchecked", "moved"])
        checked(db, ids["present"])
        checked(db, ids["missing"], FILE_MISSING)
        checked(db, ids["moved"], path="/old/moved.mp3")

        assert artwork.file_is_present(ids["present"]) is True
        assert artwork.file_is_present(ids["missing"]) is False
        assert artwork.file_is_present(ids["unchecked"]) is None
        assert artwork.file_is_present(ids["moved"]) is None

    def test_existing_keeps_order_and_drops_strangers(self, db, tracks, artwork):
        ids = add(db, tracks, ["a", "b"])

        assert artwork.existing([ids["b"], 99_999, ids["a"], ids["b"]]) == [
            ids["b"],
            ids["a"],
        ]
        assert artwork.library_ids() == sorted(ids.values())


@pytest.mark.unit
class TestWhichMatchCounts:
    def test_only_an_accepted_match_has_a_candidate(self, db, tracks, artwork):
        ids = add(db, tracks, ["accepted", "proposed", "never"])
        matched(db, tracks, ids["accepted"], "1", art("one"))
        matched(db, tracks, ids["proposed"], "2", art("two"), score=80.0)

        assert artwork.accepted_candidate(ids["accepted"]) == (page_of("1"), art("one"))
        assert artwork.accepted_candidate(ids["proposed"]) is None
        assert artwork.accepted_candidate(ids["never"]) is None
        assert artwork.accepted_tracks(
            [ids["never"], ids["accepted"], ids["proposed"]]
        ) == [ids["accepted"]]


@pytest.mark.unit
class TestWriting:
    def test_a_track_that_left_the_library_is_skipped(self, db, tracks, artwork):
        ids = add(db, tracks, ["a"])
        with db.transaction():
            written = artwork.record_embedded(
                [
                    EmbeddedRecord(ids["a"], EMBEDDED_NONE, None, NOW, "/m/a.mp3"),
                    EmbeddedRecord(99_999, EMBEDDED_NONE, None, NOW, "/m/x.mp3"),
                ]
            )

        assert written == {ids["a"]}
        assert artwork.get(99_999) is None
        with db.transaction():
            assert artwork.record_embedded([]) == set()

    def test_a_refusal_is_kept_for_the_same_picture_and_cleared_for_another(
        self, db, tracks, artwork
    ):
        track = add(db, tracks, ["a"])["a"]
        read(db, artwork, track, EMBEDDED_PRESENT, HASH)
        with db.transaction():
            assert artwork.refuse_embedded(track, HASH, "corrupt")

        read(db, artwork, track, EMBEDDED_PRESENT, HASH)
        assert artwork.get(track).embedded_refused == "corrupt"

        read(db, artwork, track, EMBEDDED_PRESENT, OTHER_HASH)
        assert artwork.get(track).embedded_refused is None

    def test_unreadable_tags_are_forgotten_once_the_tags_are_read(
        self, db, tracks, artwork
    ):
        track = add(db, tracks, ["a"])["a"]
        read(db, artwork, track, EMBEDDED_UNKNOWN, refused="tags")
        assert artwork.get(track).embedded_refused == "tags"

        read(db, artwork, track, EMBEDDED_NONE)

        assert (artwork.get(track).embedded, artwork.get(track).embedded_refused) == (
            EMBEDDED_NONE,
            None,
        )

    def test_a_refusal_names_the_picture_it_is_for(self, db, tracks, artwork):
        track = add(db, tracks, ["a"])["a"]
        read(db, artwork, track, EMBEDDED_PRESENT, HASH)

        with db.transaction():
            assert artwork.refuse_embedded(track, OTHER_HASH, "format") is False
        assert artwork.get(track).embedded_refused is None

    def test_beatports_half_leaves_the_files_half_alone(self, db, tracks, artwork):
        track = add(db, tracks, ["a"])["a"]
        read(db, artwork, track, EMBEDDED_PRESENT, HASH)
        with db.transaction():
            assert artwork.record_beatport(track, page_of("1"), art("one"), "too_large")

        row = artwork.get(track)
        assert (row.embedded, row.embedded_hash, row.checked_path) == (
            EMBEDDED_PRESENT,
            HASH,
            "/m/a.mp3",
        )
        assert (row.beatport_page, row.beatport_url, row.beatport_refused) == (
            page_of("1"),
            art("one"),
            "too_large",
        )

        read(db, artwork, track, EMBEDDED_NONE)
        assert artwork.get(track).beatport_refused == "too_large"

    def test_beatports_half_needs_its_page_and_a_refusal_needs_its_image(
        self, db, tracks, artwork
    ):
        track = add(db, tracks, ["a"])["a"]
        with pytest.raises(ValueError, match="page"):
            artwork.record_beatport(track, "", art("one"))
        with pytest.raises(ValueError, match="URL"):
            artwork.record_beatport(track, page_of("1"), "", refused="format")
        with db.transaction():
            assert artwork.record_beatport(99_999, page_of("1"), art("one")) is False

    def test_a_deleted_track_takes_its_artwork_with_it(self, db, tracks, artwork):
        track = add(db, tracks, ["a"])["a"]
        read(db, artwork, track, EMBEDDED_NONE)

        with db.transaction() as conn:
            conn.execute("DELETE FROM tracks WHERE id = ?", (track,))

        assert artwork.get(track) is None


# ------------------------------------------------------------------ vocabulary

#: name: what ``artwork`` must answer for it.
EXPECTED = {
    "embedded": "embedded",
    "embedded_and_matched": "embedded",
    "stale": "unknown",
    "stale_but_matched": "beatport",
    "empty": "none",
    "empty_but_matched": "beatport",
    "refused_file": "none",
    "candidate_art": "beatport",
    "looked_up": "beatport",
    "looked_up_for_another_page": "unknown",
    "page_had_none": "unknown",
    "beatport_refused": "unknown",
    "refused_other_image": "beatport",
    "proposed": "unknown",
    "never": "unknown",
}


@pytest.fixture
def library(db, tracks, artwork) -> Dict[str, int]:
    ids = add(db, tracks, list(EXPECTED))
    read(db, artwork, ids["embedded"], EMBEDDED_PRESENT, HASH)
    read(db, artwork, ids["embedded_and_matched"], EMBEDDED_PRESENT, HASH)
    matched(db, tracks, ids["embedded_and_matched"], "10", art("ten"))
    read(db, artwork, ids["stale"], EMBEDDED_PRESENT, HASH, path="/old/stale.mp3")
    read(
        db, artwork, ids["stale_but_matched"], EMBEDDED_PRESENT, HASH, path="/old/x.mp3"
    )
    matched(db, tracks, ids["stale_but_matched"], "11", art("eleven"))
    read(db, artwork, ids["empty"], EMBEDDED_NONE)
    read(db, artwork, ids["empty_but_matched"], EMBEDDED_NONE)
    matched(db, tracks, ids["empty_but_matched"], "12", art("twelve"))
    read(db, artwork, ids["refused_file"], EMBEDDED_PRESENT, HASH)
    with db.transaction():
        artwork.refuse_embedded(ids["refused_file"], HASH, "format")
    matched(db, tracks, ids["candidate_art"], "13", art("thirteen"))
    matched(db, tracks, ids["looked_up"], "14", None)
    matched(db, tracks, ids["looked_up_for_another_page"], "15", None)
    matched(db, tracks, ids["page_had_none"], "16", None)
    matched(db, tracks, ids["beatport_refused"], "17", art("seventeen"))
    matched(db, tracks, ids["refused_other_image"], "18", art("eighteen"))
    matched(db, tracks, ids["proposed"], "19", art("nineteen"), score=80.0)
    with db.transaction():
        artwork.record_beatport(ids["looked_up"], page_of("14"), art("fourteen"))
        artwork.record_beatport(
            ids["looked_up_for_another_page"], page_of("99"), art("x")
        )
        artwork.record_beatport(ids["page_had_none"], page_of("16"), "")
        artwork.record_beatport(
            ids["beatport_refused"], page_of("17"), art("seventeen"), "corrupt"
        )
        artwork.record_beatport(
            ids["refused_other_image"], page_of("18"), art("an-older-one"), "corrupt"
        )
    return ids


def rules(*clauses) -> RuleSet:
    return RuleSet(rules=tuple(FilterRule(*clause) for clause in clauses))


def named(tracks, library, *clauses) -> Set[str]:
    by_id = {track_id: name for name, track_id in library.items()}
    query = BrowseQuery(rules=rules(*clauses))
    found = tracks.browse_ids(query, limit=100)
    assert tracks.browse_count(query) == len(found)
    return {by_id[track_id] for track_id in found}


@pytest.mark.unit
class TestTheArtworkField:
    @pytest.mark.parametrize("value", ARTWORK_VALUES)
    def test_each_answer_finds_exactly_its_tracks(self, tracks, library, value):
        expected = {name for name, answer in EXPECTED.items() if answer == value}

        assert named(tracks, library, ("artwork", "is", value)) == expected

    @pytest.mark.parametrize("value", ARTWORK_VALUES)
    def test_is_not_is_the_exact_complement(self, tracks, library, value):
        found = named(tracks, library, ("artwork", "is", value))

        assert (
            named(tracks, library, ("artwork", "is_not", value))
            == set(EXPECTED) - found
        )

    def test_its_facet_counts_what_its_rules_find(self, tracks, library):
        facet = tracks.facet_values(BrowseQuery(), "artwork")
        counts = {value.value: value.count for value in facet.values}

        assert counts == {
            value: sum(1 for answer in EXPECTED.values() if answer == value)
            for value in ARTWORK_VALUES
        }

    def test_it_composes_with_match_rules_without_multiplying_rows(
        self, tracks, library
    ):
        both = named(
            tracks,
            library,
            ("artwork", "is", "beatport"),
            ("match_state", "is", "accepted"),
        )

        assert both == {
            name for name, answer in EXPECTED.items() if answer == "beatport"
        }

    def test_it_names_its_joins(self):
        assert required_joins(rules(("artwork", "is", "none"))) == {
            ARTWORK_ALIAS,
            MATCH_ALIAS,
            MATCH_CANDIDATE_ALIAS,
        }

    def test_it_crosses_the_wire_as_a_facetable_text_field(self):
        spec = field_spec("artwork")
        described = [field for field in describe_fields() if field["name"] == "artwork"]

        assert spec.facetable
        assert len(described) == 1
        assert described[0]["label"] == "Artwork"

    def test_the_answers_are_the_designed_four(self):
        assert ARTWORK_VALUES == ("embedded", "beatport", "none", "unknown")
