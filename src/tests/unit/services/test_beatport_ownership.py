#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""DEC-092's "owned", held to one definition (DISCOVER-04).

The rule lives in SQL, as migration 0023's ``library_beatport_tracks``, and in
Python, as ``accepted_beatport_track_id``. These tests build a library holding
every case and assert that the two give the same answer for every track, then
throw a few thousand generated ids and URLs at both. The real write path is
covered too: a match accepted through ``MatchStateService`` is owned, and one
rejected is not.
"""

from __future__ import annotations

import random
from typing import Dict, List, Optional, Tuple

import pytest

from cuepoint.models.library_track import LibraryTrack
from cuepoint.models.result import TrackResult
from cuepoint.models.track import Track
from cuepoint.persistence.activity_repository import ActivityRepository
from cuepoint.persistence.beatport_catalog_repository import BeatportCatalogRepository
from cuepoint.persistence.match_repository import MatchRepository
from cuepoint.persistence.track_repository import TrackRepository
from cuepoint.services.activity_service import ActivityService
from cuepoint.services.beatport_ownership import (
    MAX_BEATPORT_ID,
    OWNED_VIEW,
    accepted_beatport_track_id,
    beatport_id,
    is_owned,
    owned_beatport_ids_sql,
    url_beatport_id,
)
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.match_state import MatchStateService
from cuepoint.services.migration_runner import MigrationRunner
from tests.fixtures.beatport_library import (
    accept,
    add_candidate,
    add_tracks,
    set_match,
    web_url,
)


@pytest.fixture
def db(tmp_path):
    service = DatabaseService(db_path=tmp_path / "cuepoint.db")
    MigrationRunner(service).migrate()
    yield service
    service.close_all()


@pytest.fixture
def catalog(db) -> BeatportCatalogRepository:
    return BeatportCatalogRepository(db)


def view(db) -> Dict[int, int]:
    """Track id to owned Beatport id, as the view answers."""
    rows = (
        db.connect()
        .execute(f"SELECT track_id, beatport_track_id FROM {OWNED_VIEW}")
        .fetchall()
    )
    answer = {int(r["track_id"]): r["beatport_track_id"] for r in rows}
    assert len(answer) == len(rows), "a track appears once"
    assert all(type(v) is int for v in answer.values()), "the id is an integer"
    return answer


def python(db) -> Dict[int, int]:
    """Track id to owned Beatport id, by the Python rule over the same rows."""
    rows = db.connect().execute(
        "SELECT m.track_id, m.state, c.beatport_track_id, c.url FROM track_match AS m"
        " LEFT JOIN match_candidates AS c ON c.id = m.candidate_id"
    )
    answer = {}
    for row in rows:
        if row["state"] != "accepted":
            continue
        found = accepted_beatport_track_id(row["beatport_track_id"], row["url"])
        if found is not None:
            answer[int(row["track_id"])] = found
    return answer


# ------------------------------------------------------------------ the rule


class TestABeatportId:
    @pytest.mark.parametrize(
        "text, expected",
        [
            ("1", 1),
            ("19000001", 19000001),
            (str(MAX_BEATPORT_ID), MAX_BEATPORT_ID),
            (str(MAX_BEATPORT_ID + 1), None),
            ("99999999999999999999", None),
            ("0", None),
            ("0123", None),
            ("", None),
            (" 123", None),
            ("123 ", None),
            ("+5", None),
            ("-5", None),
            ("12abc", None),
            ("1e3", None),
            ("123.0", None),
            ("١٢٣", None),  # Arabic-Indic digits: isdigit() says yes
            ("１２３", None),  # full-width digits
            ("²", None),
            (None, None),
        ],
    )
    def test_it_is_the_plain_decimal_of_a_positive_64_bit_integer(self, text, expected):
        assert beatport_id(text) == expected

    def test_anything_but_text_is_not_one(self):
        assert beatport_id(123) is None  # type: ignore[arg-type]


class TestTheIdInAUrl:
    @pytest.mark.parametrize(
        "url, expected",
        [
            ("https://www.beatport.com/track/some-slug/19000001", 19000001),
            ("https://www.beatport.com/track/some-slug/19000001/", 19000001),
            ("https://www.beatport.com/track/some-slug/19000001?a=b", 19000001),
            ("https://www.beatport.com/track/some-slug/19000001#x", 19000001),
            ("https://www.beatport.com/track/t/7", 7),
            ("/track/s/42", 42),
            ("https://www.beatport.com/de/track/slug/555", 555),
            # The first /track/ is the one read, as the view reads it.
            ("https://x/track/a/1/track/b/2", 1),
            ("https://x/track/a/b/track/c/2", None),
            ("https://www.beatport.com/track/slug", None),
            ("https://www.beatport.com/track//123", None),
            ("https://www.beatport.com/track/slug/", None),
            ("https://www.beatport.com/track/slug/abc", None),
            ("https://www.beatport.com/track/slug/0", None),
            ("https://www.beatport.com/track/slug/0123", None),
            ("https://www.beatport.com/Track/slug/123", None),
            ("https://www.beatport.com/release/slug/123", None),
            ("https://www.beatport.com/track/slug/99999999999999999999", None),
            ("", None),
            (None, None),
        ],
    )
    def test_it_is_read_after_the_first_track_path(self, url, expected):
        assert url_beatport_id(url) == expected


class TestTheAcceptedCandidatesId:
    def test_the_stored_id_wins(self):
        assert accepted_beatport_track_id("5", web_url(6)) == 5

    def test_the_url_answers_when_nothing_is_stored(self):
        assert accepted_beatport_track_id(None, web_url(6)) == 6

    def test_the_url_answers_when_what_is_stored_is_not_an_id(self):
        assert accepted_beatport_track_id("", web_url(6)) == 6
        assert accepted_beatport_track_id("abc", web_url(6)) == 6

    def test_neither_is_nothing(self):
        assert (
            accepted_beatport_track_id(None, "https://www.beatport.com/track/x") is None
        )


def test_the_fragment_selects_from_the_view():
    assert (
        owned_beatport_ids_sql()
        == "SELECT beatport_track_id FROM library_beatport_tracks"
    )


# ------------------------------------------------ SQL and Python, every case

#: (description, state, decided_by, stored id, url, owned id)
CASES: List[Tuple[str, str, str, Optional[str], str, Optional[int]]] = [
    ("automatic accept", "accepted", "auto", "1001", web_url(1001), 1001),
    ("user accept", "accepted", "user", "1002", web_url(1002), 1002),
    ("rejected", "rejected", "user", "1003", web_url(1003), None),
    ("needs review", "needs_review", "auto", "1004", web_url(1004), None),
    ("no match, with a candidate", "no_match", "auto", "1005", web_url(1005), None),
    ("no id, a URL with one", "accepted", "auto", None, web_url(1006), 1006),
    ("blank id, a URL with one", "accepted", "user", "", web_url(1007), 1007),
    ("an id that is not one", "accepted", "auto", "12abc", web_url(1008), 1008),
    ("a leading zero", "accepted", "auto", "01009", web_url(1009), 1009),
    (
        "no id, a URL with none",
        "accepted",
        "auto",
        None,
        "https://www.beatport.com/track/x",
        None,
    ),
    ("neither", "accepted", "auto", None, "https://example.com/", None),
    ("stored and URL disagree", "accepted", "auto", "1010", web_url(2010), 1010),
    ("an id too large", "accepted", "auto", "99999999999999999999", "https://x/", None),
    ("a URL with a query", "accepted", "auto", None, web_url(1011) + "?q=1", 1011),
]


@pytest.fixture
def every_case(db) -> Dict[int, Optional[int]]:
    """A library holding each case once, plus a track never matched."""
    expected: Dict[int, Optional[int]] = {}
    with db.transaction() as conn:
        ids = add_tracks(conn, len(CASES) + 2)
        for track_id, (_, state, decider, stored, url, owned) in zip(ids, CASES):
            accept(conn, track_id, stored, url, state=state, decided_by=decider)
            expected[track_id] = owned
        # An accepted match whose candidate is not the one the state points at:
        # the state's candidate is what counts, not the attempt's winner.
        track_id = ids[len(CASES)]
        winner = add_candidate(conn, track_id, "3001", web_url(3001))
        chosen = add_candidate(
            conn,
            track_id,
            "3002",
            web_url(3002),
            rank=1,
            attempt_id=_attempt(conn, winner),
        )
        set_match(conn, track_id, chosen, decided_by="user")
        expected[track_id] = 3002
        expected[ids[-1]] = None  # never matched
    return expected


def _attempt(conn, candidate_id: int) -> int:
    return int(
        conn.execute(
            "SELECT attempt_id FROM match_candidates WHERE id = ?", (candidate_id,)
        ).fetchone()[0]
    )


class TestSqlAndPythonAgree:
    def test_on_every_case(self, db, every_case):
        owned = {t: b for t, b in every_case.items() if b is not None}
        assert view(db) == owned
        assert python(db) == owned

    def test_case_by_case(self, db, every_case):
        answer = view(db)
        for (description, *_), track_id in zip(CASES, sorted(every_case)):
            assert answer.get(track_id) == every_case[track_id], description

    def test_on_thousands_of_generated_ids_and_urls(self, db):
        """Every piece either rule could stumble on, combined at random."""
        rng = random.Random(20260923)
        stored_pieces = [
            None,
            "",
            "0",
            "7",
            "19000001",
            "0123",
            " 12",
            "12 ",
            "+3",
            "-3",
            "1e3",
            "12abc",
            "9223372036854775807",
            "9223372036854775808",
            "١٢",
            "４２",
        ]
        url_pieces = [
            "https://www.beatport.com",
            "/track/",
            "/track",
            "/release/",
            "slug",
            "",
            "/",
            "123",
            "0",
            "0042",
            "abc",
            "?x=1",
            "#f",
            "9223372036854775807",
            "92233720368547758070",
            "/Track/",
            "٣",
            "-",
            "//",
        ]
        count = 3000
        with db.transaction() as conn:
            ids = add_tracks(conn, count)
            for track_id in ids:
                stored = rng.choice(stored_pieces)
                url = "".join(rng.choice(url_pieces) for _ in range(rng.randint(0, 6)))
                state = rng.choice(["accepted", "accepted", "accepted", "rejected"])
                accept(conn, track_id, stored, url or "x", state=state)
        answer = view(db)
        assert answer == python(db)
        # The generator reached both branches and the refusals.
        assert len(answer) > 200
        assert len(answer) < count

    def test_an_id_compares_with_the_catalog_by_value(self, db, catalog):
        from tests.fixtures.beatport_library import catalog_track

        with db.transaction() as conn:
            [track_id] = add_tracks(conn, 1)
            accept(conn, track_id, "19000001")
        catalog.upsert_tracks([catalog_track(19000001)], "2026-09-23T00:00:00+00:00")
        row = (
            db.connect()
            .execute(
                "SELECT count(*) FROM beatport_tracks AS b JOIN library_beatport_tracks"
                " AS l ON l.beatport_track_id = b.beatport_track_id"
            )
            .fetchone()
        )
        assert row[0] == 1


# ----------------------------------------------------------------- is_owned


class TestIsOwned:
    def test_it_answers_only_what_is_owned(self, db, catalog, every_case):
        owned = {b for b in every_case.values() if b is not None}
        asked = owned | {1003, 1004, 1005, 2010, 424242}
        assert is_owned(catalog, asked) == owned

    def test_nothing_asked_is_nothing_owned(self, catalog, every_case):
        assert is_owned(catalog, []) == set()

    def test_more_ids_than_a_statement_carries(self, db, catalog):
        with db.transaction() as conn:
            ids = add_tracks(conn, 1200)
            for track_id in ids:
                accept(conn, track_id, str(5_000_000 + track_id))
        asked = [5_000_000 + t for t in range(1, 1200, 2)] + list(range(1, 700))
        assert len(set(asked)) > 500
        assert is_owned(catalog, asked) == {5_000_000 + t for t in range(1, 1200, 2)}

    def test_two_library_copies_of_one_track_own_it_once(self, db, catalog):
        with db.transaction() as conn:
            first, second = add_tracks(conn, 2)
            accept(conn, first, "77")
            accept(conn, second, "77")
        assert view(db) == {first: 77, second: 77}
        assert is_owned(catalog, [77]) == {77}


class TestOwnershipIsComputedWhenRead:
    def test_rejecting_an_accepted_match_disowns_at_once(self, db, catalog):
        with db.transaction() as conn:
            [track_id] = add_tracks(conn, 1)
            candidate = accept(conn, track_id, "88")
        assert is_owned(catalog, [88]) == {88}
        with db.transaction() as conn:
            set_match(conn, track_id, candidate, state="rejected", decided_by="user")
        assert is_owned(catalog, [88]) == set()

    def test_a_new_candidate_moves_ownership_with_it(self, db, catalog):
        with db.transaction() as conn:
            [track_id] = add_tracks(conn, 1)
            accept(conn, track_id, "91")
            accept(conn, track_id, "92", decided_by="user")
        assert is_owned(catalog, [91, 92]) == {92}

    def test_deleting_the_track_disowns(self, db, catalog):
        with db.transaction() as conn:
            [track_id] = add_tracks(conn, 1)
            accept(conn, track_id, "93")
        with db.transaction() as conn:
            conn.execute("DELETE FROM tracks WHERE id = ?", (track_id,))
        assert is_owned(catalog, [93]) == set()


# --------------------------------------------------------- the real write path


QUESTION = Track(title="A Title", artist="An Artist")


def _result(beatport_id: str, score: float) -> TrackResult:
    from tests.unit.services.test_match_state import candidate

    best = candidate(beatport_id, score)
    return TrackResult(
        playlist_index=1,
        title="A Title",
        artist="An Artist",
        matched=True,
        best_match=best,
        candidates=[best, candidate("9009", 40.0)],
        match_score=score,
    )


class TestThroughTheMatchWritePath:
    @pytest.fixture
    def matched(self, db):
        tracks = TrackRepository(db)
        tracks.add_many(
            [
                LibraryTrack(rekordbox_track_id=str(i), title=f"T{i}", artist="A")
                for i in (1, 2, 3)
            ]
        )
        ids = [
            int(r["id"])
            for r in db.connect().execute("SELECT id FROM tracks ORDER BY id")
        ]
        matches = MatchRepository(db)
        states = MatchStateService(
            matches, tracks, ActivityService(ActivityRepository(db), tracks), db
        )
        return ids, matches, states

    def test_an_automatic_accept_is_owned_and_a_weak_one_is_not(
        self, db, catalog, matched
    ):
        ids, matches, states = matched
        states.apply_attempt(
            matches.add_attempt(ids[0], "job", _result("1001", 97.0), QUESTION)
        )
        states.apply_attempt(
            matches.add_attempt(ids[1], "job", _result("1002", 60.0), QUESTION)
        )
        assert view(db) == python(db) == {ids[0]: 1001}
        assert is_owned(catalog, [1001, 1002, 9009]) == {1001}

    def test_a_user_accept_owns_and_a_user_reject_disowns(self, db, catalog, matched):
        ids, matches, states = matched
        attempt = matches.add_attempt(ids[2], "job", _result("1003", 60.0), QUESTION)
        states.apply_attempt(attempt)
        [winner] = [
            c
            for c in matches.candidates_for(attempt.id)
            if c.beatport_track_id == "1003"
        ]
        states.accept(ids[2], winner.id)
        assert is_owned(catalog, [1003]) == {1003}
        states.reject(ids[2])
        assert is_owned(catalog, [1003]) == set()
