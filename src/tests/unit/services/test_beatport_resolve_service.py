#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Resolving accepted matches into Beatport identities (DISCOVER-04, DEC-095).

The service runs over a real database and DISCOVER-01's real ``BeatportApi``,
whose HTTP client is replaced by :class:`FakeBeatport` — a Beatport that
answers ``catalog/tracks/`` from a dictionary and counts every request. So the
batching, the fallback to one request per track and the request counts below
are the ones a real account would see. No test reaches the network.
"""

from __future__ import annotations

import copy
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Set

import pytest

from cuepoint.exceptions.cuepoint_exceptions import BeatportAPIError
from cuepoint.persistence.activity_repository import ActivityRepository
from cuepoint.persistence.beatport_catalog_repository import BeatportCatalogRepository
from cuepoint.persistence.track_repository import TrackRepository
from cuepoint.services.activity_service import ActivityService
from cuepoint.services.beatport_api import BeatportApi
from cuepoint.services.beatport_api_client import (
    BeatportApiClient,
    classify_beatport_error,
)
from cuepoint.services.beatport_resolve_service import (
    EVENT_BEATPORT_RESOLVED,
    MAX_CONSECUTIVE_FAILURES,
    RESOLVE_BATCH_SIZE,
    RESOLVED_TRACK_MAX_AGE,
    BeatportResolveResult,
    BeatportResolveService,
)
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.migration_runner import MigrationRunner
from tests.fixtures.beatport_library import accept, add_tracks, catalog_track

FIXTURES = Path(__file__).resolve().parents[2] / "fixtures" / "beatport_v4"
START = datetime(2026, 9, 23, 12, 0, tzinfo=timezone.utc)
FIRST_ID = 20_000_000


def track_json(beatport_id: int) -> Dict[str, Any]:
    """DISCOVER-01's fixture track, re-numbered, with its artist ids derived."""
    data = json.loads((FIXTURES / "track.json").read_text(encoding="utf-8"))
    data = copy.deepcopy(data)
    data["id"] = beatport_id
    data["name"] = f"Track {beatport_id}"
    data["artists"] = data["artists"][:1]
    data["artists"][0]["id"] = 1_000 + beatport_id % 97
    data["artists"][0]["name"] = f"Artist {beatport_id % 97}"
    return data


class FakeBeatport:
    """``BeatportApiClient.get`` over a catalog held in memory.

    ``catalog/tracks/?id=a,b`` answers the asked ids it holds, as the recording
    showed; ``catalog/tracks/{id}/`` answers one or None (a 404). ``fail`` maps
    a request number, counted from 1, to the status it fails with.
    """

    def __init__(self, ids: Set[int], fail: Optional[Dict[int, int]] = None) -> None:
        self.catalog = {i: track_json(i) for i in ids}
        self.fail = dict(fail or {})
        self.requests: List[str] = []
        self.refuse_batching = False
        self.access_token = "t"

    def require_token(self) -> None:
        if not self.access_token:
            BeatportApiClient("https://x", "").require_token()

    def get(self, path: str, params: Optional[Dict[str, Any]] = None) -> Any:
        self.requests.append(path)
        status = self.fail.get(len(self.requests))
        if status is not None:
            raise BeatportAPIError(f"Beatport answered {status}", status_code=status)
        if path == "/catalog/tracks/":
            if self.refuse_batching:
                raise BeatportAPIError("bad filter", status_code=400)
            asked = [int(i) for i in str((params or {})["id"]).split(",")]
            return {
                "results": [self.catalog[i] for i in asked if i in self.catalog],
                "next": None,
                "count": len(asked),
            }
        tid = int(path.strip("/").split("/")[-1])
        return self.catalog.get(tid)


class Clock:
    def __init__(self) -> None:
        self.now = START

    def __call__(self) -> datetime:
        return self.now


@pytest.fixture
def db(tmp_path):
    service = DatabaseService(db_path=tmp_path / "cuepoint.db")
    MigrationRunner(service).migrate()
    yield service
    service.close_all()


@pytest.fixture
def catalog(db) -> BeatportCatalogRepository:
    return BeatportCatalogRepository(db)


@pytest.fixture
def activity(db) -> ActivityService:
    return ActivityService(ActivityRepository(db), TrackRepository(db))


@pytest.fixture
def clock() -> Clock:
    return Clock()


def own(db, count: int, first: int = FIRST_ID) -> List[int]:
    """``count`` library tracks, each accepted to its own Beatport track."""
    with db.transaction() as conn:
        ids = add_tracks(conn, count)
        for offset, track_id in enumerate(ids):
            accept(conn, track_id, str(first + offset))
    return [first + offset for offset in range(count)]


def service(
    catalog, beatport, activity=None, clock=None, **kwargs
) -> BeatportResolveService:
    reader = beatport if hasattr(beatport, "get_tracks") else BeatportApi(beatport)
    return BeatportResolveService(
        catalog, reader, activity, clock=clock or Clock(), **kwargs
    )


def events(db) -> List[Dict[str, Any]]:
    rows = db.connect().execute(
        "SELECT type, summary, detail_json FROM activity_events ORDER BY id"
    )
    return [
        {
            "type": r["type"],
            "summary": r["summary"],
            "detail": json.loads(r["detail_json"]),
        }
        for r in rows
    ]


def cached(db) -> int:
    return int(
        db.connect().execute("SELECT count(*) FROM beatport_tracks").fetchone()[0]
    )


# ------------------------------------------------------------ the happy path


class TestResolvingAThousandTracks:
    def test_one_catalog_row_each_in_ten_requests(self, db, catalog, activity, clock):
        wanted = own(db, 1000)
        beatport = FakeBeatport(set(wanted))
        result = service(catalog, beatport, activity, clock).resolve()
        assert cached(db) == 1000
        assert len(beatport.requests) == 10
        assert set(beatport.requests) == {"/catalog/tracks/"}
        assert result == BeatportResolveResult(
            owned=1000, to_read=1000, resolved=1000, batches=10
        )
        assert result.outcome == "succeeded"

    def test_each_row_holds_what_beatport_said(self, db, catalog, clock):
        [beatport_id] = own(db, 1)
        service(catalog, FakeBeatport({beatport_id}), clock=clock).resolve()
        track = catalog.get_tracks([beatport_id])[beatport_id]
        assert (track.title, track.label_id, track.key) == (
            f"Track {beatport_id}",
            40211,
            "Ebm",
        )
        assert track.fetched_at == START.isoformat()
        assert [(c.role, c.artist_id) for c in catalog.credits(beatport_id)] == [
            ("artist", 1_000 + beatport_id % 97),
            ("remixer", 301003),
        ]

    def test_the_librarys_identity_is_then_known(self, db, catalog, clock):
        [beatport_id] = own(db, 1)
        assert catalog.library_credits([1]) == {}
        service(catalog, FakeBeatport({beatport_id}), clock=clock).resolve()
        credits = catalog.library_credits([1])[1]
        assert [(c.kind, c.beatport_id) for c in credits] == [
            ("artist", 1_000 + beatport_id % 97),
            ("artist", 301003),
            ("label", 40211),
        ]

    def test_progress_counts_tracks_asked_about(self, db, catalog, clock):
        own(db, 250)
        seen = []
        service(
            catalog, FakeBeatport(set(range(FIRST_ID, FIRST_ID + 250))), clock=clock
        ).resolve(on_progress=lambda done, total: seen.append((done, total)))
        assert seen == [(0, 250), (100, 250), (200, 250), (250, 250)]

    def test_one_activity_event_with_the_counts(self, db, catalog, activity, clock):
        wanted = own(db, 120)
        service(catalog, FakeBeatport(set(wanted[:-3])), activity, clock).resolve()
        [event] = events(db)
        assert event["type"] == EVENT_BEATPORT_RESOLVED
        assert (
            event["summary"]
            == "Resolved 117 of 120 Beatport tracks (3 not on Beatport)"
        )
        assert event["detail"] == {
            "outcome": "succeeded",
            "owned": 120,
            "to_read": 120,
            "up_to_date": 0,
            "resolved": 117,
            "not_found": 3,
            "unreadable": 0,
            "failed": 0,
            "batches": 2,
            "cancelled": False,
            "error_class": None,
            "error": None,
        }

    def test_nothing_owned_asks_nothing_and_says_so(self, db, catalog, activity, clock):
        beatport = FakeBeatport(set())
        result = service(catalog, beatport, activity, clock).resolve()
        assert beatport.requests == []
        assert (result.owned, result.batches, result.outcome) == (0, 0, "succeeded")
        assert events(db)[0]["summary"] == "No accepted matches to resolve on Beatport"


# ---------------------------------------------------------------- the age


class TestRowsYoungerThanTheAgeAreReused:
    def test_a_second_resolve_reads_nothing(self, db, catalog, activity, clock):
        wanted = own(db, 300)
        beatport = FakeBeatport(set(wanted))
        service(catalog, beatport, activity, clock).resolve()
        clock.now = START + RESOLVED_TRACK_MAX_AGE - timedelta(seconds=1)
        result = service(catalog, beatport, activity, clock).resolve()
        assert len(beatport.requests) == 3
        assert (result.owned, result.to_read, result.up_to_date) == (300, 0, 300)
        assert events(db)[-1]["summary"] == (
            "Beatport identities are up to date: 300 owned tracks already read"
        )

    def test_rows_older_than_the_age_are_read_again(self, db, catalog, clock):
        wanted = own(db, 300)
        beatport = FakeBeatport(set(wanted))
        service(catalog, beatport, clock=clock).resolve()
        clock.now = START + RESOLVED_TRACK_MAX_AGE + timedelta(seconds=1)
        result = service(catalog, beatport, clock=clock).resolve()
        assert (result.to_read, result.resolved, len(beatport.requests)) == (
            300,
            300,
            6,
        )
        assert {t.fetched_at for t in catalog.get_tracks(wanted).values()} == {
            clock.now.isoformat()
        }

    def test_only_the_missing_are_read(self, db, catalog, clock):
        wanted = own(db, 150)
        catalog.upsert_tracks(
            [catalog_track(i) for i in wanted[:120]], START.isoformat()
        )
        beatport = FakeBeatport(set(wanted))
        result = service(catalog, beatport, clock=clock).resolve()
        assert (result.to_read, result.up_to_date, len(beatport.requests)) == (
            30,
            120,
            1,
        )

    def test_a_match_accepted_later_is_read_by_the_next_resolve(
        self, db, catalog, clock
    ):
        wanted = own(db, 5)
        beatport = FakeBeatport(set(wanted) | {99})
        service(catalog, beatport, clock=clock).resolve()
        with db.transaction() as conn:
            [track_id] = add_tracks(conn, 1, start=500)
            accept(conn, track_id, "99")
        result = service(catalog, beatport, clock=clock).resolve()
        assert (result.to_read, result.resolved) == (1, 1)


# ---------------------------------------------------------------- cancel


class TestCancelling:
    def test_it_stops_between_batches_and_keeps_what_it_stored(
        self, db, catalog, activity, clock
    ):
        wanted = own(db, 1000)
        beatport = FakeBeatport(set(wanted))
        asked = []

        def should_cancel() -> bool:
            asked.append(len(beatport.requests))
            return len(beatport.requests) >= 3

        result = service(catalog, beatport, activity, clock).resolve(
            should_cancel=should_cancel
        )
        assert cached(db) == 300
        assert len(beatport.requests) == 3
        assert asked == [0, 1, 2, 3]
        assert (result.cancelled, result.outcome, result.resolved) == (
            True,
            "cancelled",
            300,
        )
        assert (
            events(db)[0]["summary"]
            == "Resolved 300 of 1,000 Beatport tracks; cancelled"
        )

    def test_the_next_resolve_finishes_the_job(self, db, catalog, clock):
        wanted = own(db, 1000)
        beatport = FakeBeatport(set(wanted))
        service(catalog, beatport, clock=clock).resolve(
            should_cancel=lambda: len(beatport.requests) >= 3
        )
        result = service(catalog, beatport, clock=clock).resolve()
        assert (result.to_read, result.up_to_date, cached(db)) == (700, 300, 1000)

    def test_a_cancel_before_the_first_batch_asks_nothing(self, db, catalog, clock):
        own(db, 10)
        beatport = FakeBeatport(set())
        result = service(catalog, beatport, clock=clock).resolve(
            should_cancel=lambda: True
        )
        assert beatport.requests == [] and result.cancelled


# ---------------------------------------------------------------- failures


class TestFailures:
    def test_it_stops_after_the_failure_limit(self, db, catalog, activity, clock):
        wanted = own(db, 1000)
        beatport = FakeBeatport(set(wanted), fail={n: 503 for n in range(1, 11)})
        result = service(catalog, beatport, activity, clock).resolve()
        assert len(beatport.requests) == MAX_CONSECUTIVE_FAILURES
        assert (result.failed, result.resolved, result.error_class) == (
            300,
            0,
            "unavailable",
        )
        assert result.outcome == "failed"
        assert events(db)[0]["summary"] == (
            "Resolved 0 of 1,000 Beatport tracks (300 not read);"
            " stopped because Beatport could not be reached"
        )

    def test_a_success_between_failures_starts_the_count_again(
        self, db, catalog, clock
    ):
        wanted = own(db, 1000)
        fail = {1: 503, 2: 503, 4: 503, 5: 503, 7: 503, 8: 503}
        result = service(
            catalog, FakeBeatport(set(wanted), fail=fail), clock=clock
        ).resolve()
        assert (result.failed, result.resolved, result.error_class) == (600, 400, None)
        assert result.outcome == "succeeded"
        assert cached(db) == 400

    def test_what_was_stored_before_the_limit_is_kept(self, db, catalog, clock):
        wanted = own(db, 1000)
        beatport = FakeBeatport(set(wanted), fail={n: 500 for n in range(3, 11)})
        result = service(catalog, beatport, clock=clock).resolve()
        assert (cached(db), result.resolved, result.failed) == (200, 200, 300)

    @pytest.mark.parametrize(
        "status, error_class, reason",
        [
            (401, "rejected", "Beatport rejected the token"),
            (403, "forbidden", "the token is not allowed to read the catalog"),
            (429, "rate_limited", "Beatport asked CuePoint to slow down"),
        ],
    )
    def test_a_refusal_every_request_would_repeat_stops_it_at_once(
        self, db, catalog, activity, clock, status, error_class, reason
    ):
        wanted = own(db, 1000)
        beatport = FakeBeatport(set(wanted), fail={3: status})
        result = service(catalog, beatport, activity, clock).resolve()
        assert len(beatport.requests) == 3
        assert (cached(db), result.error_class, result.failed) == (
            200,
            error_class,
            100,
        )
        assert events(db)[0]["summary"].endswith(f"; stopped because {reason}")
        assert events(db)[0]["detail"]["error_class"] == error_class

    def test_without_a_token_it_is_refused_before_asking(self, db, catalog, clock):
        own(db, 10)
        api = BeatportApi(BeatportApiClient("https://api.beatport.com/v4", ""))
        resolver = service(catalog, api, clock=clock)
        with pytest.raises(BeatportAPIError) as refused:
            resolver.require_token()
        assert classify_beatport_error(refused.value) == "no_token"

    def test_a_resolve_run_anyway_without_a_token_stops_at_the_first_batch(
        self, db, catalog, clock
    ):
        own(db, 250)
        api = BeatportApi(BeatportApiClient("https://api.beatport.com/v4", ""))
        result = service(catalog, api, clock=clock).resolve()
        assert (result.batches, result.error_class, cached(db)) == (1, "no_token", 0)

    def test_with_a_token_nothing_is_refused(self, catalog, clock):
        service(catalog, FakeBeatport(set()), clock=clock).require_token()

    def test_a_database_error_is_not_a_beatport_failure(
        self, db, catalog, clock, monkeypatch
    ):
        own(db, 10)

        def broken(*args, **kwargs):
            raise RuntimeError("disk full")

        monkeypatch.setattr(catalog, "upsert_tracks", broken)
        with pytest.raises(RuntimeError, match="disk full"):
            service(
                catalog, FakeBeatport(set(range(FIRST_ID, FIRST_ID + 10))), clock=clock
            ).resolve()


# --------------------------------------------------------- what is answered


class _Reader:
    """A catalog reader answering exactly what a test hands it."""

    def __init__(self, answer):
        self.answer = answer

    def require_token(self) -> None:
        pass

    def get_tracks(self, track_ids):
        return list(self.answer)


class TestWhatBeatportAnswers:
    def test_a_track_it_was_not_asked_for_is_ignored(self, db, catalog, clock):
        [wanted] = own(db, 1)
        reader = _Reader([catalog_track(wanted), catalog_track(5)])
        result = service(catalog, reader, clock=clock).resolve()
        assert (result.resolved, result.not_found) == (1, 0)
        assert set(catalog.get_tracks([wanted, 5])) == {wanted}

    def test_a_track_that_cannot_be_stored_is_unreadable(self, db, catalog, clock):
        from dataclasses import replace

        first, second = own(db, 2)
        bad = replace(catalog_track(second), url="http://example.com/")
        result = service(
            catalog, _Reader([catalog_track(first), bad]), clock=clock
        ).resolve()
        assert (result.resolved, result.unreadable, result.not_found) == (1, 1, 0)
        assert result.summary_line() == "Resolved 1 of 2 Beatport tracks (1 unreadable)"

    def test_without_batching_it_is_one_request_per_track_and_still_right(
        self, db, catalog, clock
    ):
        wanted = own(db, 150)
        beatport = FakeBeatport(set(wanted[:-1]))
        beatport.refuse_batching = True
        result = service(catalog, beatport, clock=clock).resolve()
        assert (result.resolved, result.not_found, result.batches) == (149, 1, 2)
        # The refused filter once, then every track on its own.
        assert len(beatport.requests) == 1 + 150


# ------------------------------------------------------------ the activity


class TestTheActivityFeed:
    def test_a_feed_that_fails_does_not_fail_the_resolve(self, db, catalog, clock):
        class Broken:
            def record_event(self, *args, **kwargs):
                raise RuntimeError("feed down")

        [wanted] = own(db, 1)
        result = service(catalog, FakeBeatport({wanted}), Broken(), clock).resolve()
        assert result.resolved == 1

    def test_no_feed_is_allowed(self, db, catalog, clock):
        [wanted] = own(db, 1)
        assert (
            service(catalog, FakeBeatport({wanted}), None, clock).resolve().resolved
            == 1
        )


class TestTheResult:
    @pytest.mark.parametrize(
        "result, line",
        [
            (
                BeatportResolveResult(owned=0, to_read=0),
                "No accepted matches to resolve on Beatport",
            ),
            (
                BeatportResolveResult(owned=1, to_read=0),
                "Beatport identities are up to date: 1 owned track already read",
            ),
            (
                BeatportResolveResult(owned=5, to_read=1, resolved=1),
                "Resolved 1 of 1 Beatport track",
            ),
            (
                BeatportResolveResult(
                    owned=5000,
                    to_read=4000,
                    resolved=3000,
                    not_found=2,
                    failed=998,
                    error_class="unavailable",
                ),
                "Resolved 3,000 of 4,000 Beatport tracks (2 not on Beatport, 998 not"
                " read); stopped because Beatport could not be reached",
            ),
        ],
    )
    def test_its_sentence(self, result, line):
        assert result.summary_line() == line

    def test_the_defaults_are_named(self):
        assert RESOLVE_BATCH_SIZE == 100
        assert RESOLVED_TRACK_MAX_AGE == timedelta(days=30)
        assert MAX_CONSECUTIVE_FAILURES == 3

    @pytest.mark.parametrize(
        "kwargs", [{"batch_size": 0}, {"max_consecutive_failures": 0}]
    )
    def test_nonsense_settings_are_refused(self, catalog, kwargs):
        with pytest.raises(ValueError):
            service(catalog, FakeBeatport(set()), **kwargs)


# ------------------------------------------------------------ the measure


@pytest.mark.slow
class TestTenThousandTracks:
    """DISCOVER-04's acceptance: 10,000 accepted tracks against a mocked API.

    Slow (a few seconds, most of it writing the library); the thousand-track
    tests above hold the same counts on every run.
    """

    def test_are_a_hundred_requests_and_one_row_each(self, db, catalog, clock):
        wanted = own(db, 10_000)
        beatport = FakeBeatport(set(wanted))
        result = service(catalog, beatport, clock=clock).resolve()
        assert len(beatport.requests) == 100
        assert (result.resolved, cached(db)) == (10_000, 10_000)
        again = service(catalog, beatport, clock=clock).resolve()
        assert (again.to_read, len(beatport.requests)) == (0, 100)
