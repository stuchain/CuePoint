#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Pushing tracks to a Beatport playlist (DISCOVER-06, DEC-099).

Through DISCOVER-01's real ``BeatportApi`` over the in-memory Beatport, which
creates playlists and adds tracks as the recording showed Beatport does
(``POST my/playlists/``, then ``POST my/playlists/{id}/tracks/``). All added,
some failing, cancelled mid-way, 403 on create, owned skipped by default and
included on request, and the event carrying a real URL. Nothing here reaches
the network.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone

import pytest

from cuepoint.services.playlist_name import default_playlist_name
from cuepoint.persistence.activity_repository import ActivityRepository
from cuepoint.persistence.beatport_catalog_repository import BeatportCatalogRepository
from cuepoint.persistence.track_repository import TrackRepository
from cuepoint.services.activity_service import ActivityService
from cuepoint.services.beatport_api import PLAYLIST_WEB_BASE, BeatportApi
from cuepoint.services.beatport_playlist_service import (
    EVENT_ID_LIMIT,
    EVENT_PLAYLIST_PUSHED,
    MAX_PLAYLIST_NAME_LENGTH,
    MAX_PLAYLIST_TRACKS,
    OUTCOME_CANCELLED,
    OUTCOME_FAILED,
    OUTCOME_SUCCEEDED,
    STAGE_ADDING,
    STAGE_CREATING,
    BeatportPlaylistService,
    PlaylistPush,
)
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.migration_runner import MigrationRunner
from tests.fixtures.beatport_library import accept, add_tracks
from tests.fixtures.beatport_world import BeatportWorld

NOW = datetime(2026, 9, 23, 12, 0, tzinfo=timezone.utc)

#: The user's own date at NOW, which a default name is written in.
TODAY = NOW.astimezone().date()
TRACKS = (501, 502, 503, 504, 505)


class Config:
    def __init__(self, **values) -> None:
        self.values = values

    def get(self, key, default=None):
        return self.values.get(key, default)


@pytest.fixture
def db(tmp_path):
    service = DatabaseService(db_path=tmp_path / "cuepoint.db")
    MigrationRunner(service).migrate()
    yield service
    service.close_all()


@pytest.fixture
def world() -> BeatportWorld:
    beatport = BeatportWorld()
    for track_id in TRACKS:
        beatport.add_track(track_id, NOW.date(), (7, "Label"), (70, "Release"))
    return beatport


@pytest.fixture
def activity(db) -> ActivityService:
    return ActivityService(ActivityRepository(db), TrackRepository(db))


def make_service(db, world, activity=None, config=None, **kwargs):
    return BeatportPlaylistService(
        catalog=BeatportCatalogRepository(db),
        beatport=BeatportApi(world),
        activity_service=activity,
        config_service=config,
        clock=lambda: NOW,
        **kwargs,
    )


@pytest.fixture
def service(db, world, activity) -> BeatportPlaylistService:
    return make_service(db, world, activity)


def own(db, *beatport_ids: int) -> None:
    with db.transaction() as conn:
        for track_id, beatport_id in zip(
            add_tracks(conn, len(beatport_ids)), beatport_ids
        ):
            accept(conn, track_id, str(beatport_id))


def fail(world, status: int, *, route=None, tracks=()):
    """Make ``route`` (or adding any of ``tracks``) answer ``status``."""

    def failure(path, params, number):
        if route is not None and path == route:
            return status
        if tracks and path.endswith("/tracks") and params.get("track_id") in tracks:
            return status
        return None

    world.failures.append(failure)


def events(db) -> list:
    return [
        (row[0], json.loads(row[1]))
        for row in db.connect().execute(
            "SELECT summary, detail_json FROM activity_events WHERE type = ?"
            " ORDER BY id",
            (EVENT_PLAYLIST_PUSHED,),
        )
    ]


def only_playlist(world) -> dict:
    (playlist,) = world.playlists.values()
    return playlist


# ------------------------------------------------------------------ planning


class TestPlanning:
    def test_every_track_in_the_order_given(self, service):
        plan = service.plan([503, 501, 503, 502], name="Crate")
        assert plan == PlaylistPush(name="Crate", track_ids=(503, 501, 502))
        assert plan.to_dict() == {
            "name": "Crate",
            "requested": 3,
            "to_add": 3,
            "skipped_owned": 0,
            "include_owned": False,
        }

    def test_owned_tracks_are_skipped_by_default(self, db, service):
        own(db, 502, 504)
        plan = service.plan(list(TRACKS), name="Crate")
        assert (plan.track_ids, plan.skipped_owned) == ((501, 503, 505), (502, 504))
        assert plan.requested == 5

    def test_and_included_on_request(self, db, service):
        own(db, 502)
        plan = service.plan(list(TRACKS), name="Crate", include_owned=True)
        assert (plan.track_ids, plan.skipped_owned) == (TRACKS, ())

    def test_a_push_of_only_owned_tracks_is_refused(self, db, service, world):
        own(db, 501, 502)
        with pytest.raises(ValueError, match="Already in your library: all 2 tracks"):
            service.plan([501, 502])
        with pytest.raises(ValueError, match="Already in your library: that track"):
            service.plan([501])
        assert world.requests == []

    @pytest.mark.parametrize("ids", [[], [0], [True], ["501"], None, [2**63]])
    def test_ids_that_are_not_beatport_track_ids(self, service, ids):
        with pytest.raises(ValueError):
            service.plan(ids)

    def test_more_tracks_than_a_push_adds(self, service):
        with pytest.raises(ValueError):
            service.plan(list(range(1, MAX_PLAYLIST_TRACKS + 2)))

    @pytest.mark.parametrize("include", [1, "yes", None])
    def test_include_owned_is_a_boolean(self, service, include):
        with pytest.raises(ValueError):
            service.plan([501], include_owned=include)


class TestTheName:
    def test_the_default_is_inCrates_short_date_in_the_users_day(self, db, world):
        name = make_service(db, world).plan([501]).name
        assert name == default_playlist_name("short", TODAY)
        assert name == f"sep{TODAY.day}"

    def test_the_configured_format(self, db, world):
        config = Config(**{"incrate.playlist_name_format": "iso"})
        name = make_service(db, world, config=config).plan([501]).name
        assert name == TODAY.isoformat()

    @pytest.mark.parametrize("value", ["weekly", None, 5])
    def test_a_format_it_does_not_know_is_the_short_one(self, db, world, value):
        config = Config(**{"incrate.playlist_name_format": value})
        name = make_service(db, world, config=config).plan([501]).name
        assert name.startswith("sep")

    def test_a_broken_config_is_the_short_one(self, db, world):
        class Broken:
            def get(self, key, default=None):
                raise RuntimeError("unreadable")

        assert (
            make_service(db, world, config=Broken()).plan([501]).name.startswith("sep")
        )

    @pytest.mark.parametrize("blank", ["", "   ", None])
    def test_blank_takes_the_default(self, service, blank):
        assert service.plan([501], name=blank).name.startswith("sep")

    def test_whitespace_is_collapsed(self, service):
        assert service.plan([501], name="  Friday\n\tpicks  ").name == "Friday picks"

    def test_the_longest_name(self, service):
        name = "x" * MAX_PLAYLIST_NAME_LENGTH
        assert service.plan([501], name=name).name == name
        with pytest.raises(ValueError):
            service.plan([501], name=name + "x")

    def test_a_name_is_text(self, service):
        with pytest.raises(ValueError):
            service.plan([501], name=5)

    def test_the_default_offered_is_the_default_taken(self, db, world):
        # What a push dialog shows before anyone types (DISCOVER-09's options)
        # is the name a push given none, or blank, goes on to take.
        for config in (None, Config(**{"incrate.playlist_name_format": "iso"})):
            service = make_service(db, world, config=config)
            offered = service.default_name()
            assert service.plan([501]).name == offered
            assert service.plan([501], name="   ").name == offered
        assert make_service(db, world).default_name() == f"sep{TODAY.day}"


# ------------------------------------------------------------------- pushing


class TestAllAdded:
    def test_it_creates_the_playlist_and_adds_every_track_in_order(
        self, service, world
    ):
        result = service.push(service.plan([503, 501, 502], name="Crate"))
        assert only_playlist(world) == {"name": "Crate", "tracks": [503, 501, 502]}
        assert (result.outcome, result.added, result.failed) == (
            OUTCOME_SUCCEEDED,
            3,
            0,
        )
        assert result.not_attempted == 0
        assert [p for p, _ in world.requests] == [
            "my/playlists",
            *["my/playlists/700001/tracks"] * 3,
        ]

    def test_the_url_is_the_real_one(self, service):
        result = service.push(service.plan([501], name="Crate"))
        assert result.playlist_id == "700001"
        assert result.playlist_url == f"{PLAYLIST_WEB_BASE}/700001"
        assert result.playlist_url.startswith("https://www.beatport.com/")
        assert "placeholder" not in result.playlist_url

    def test_one_event_carries_the_url(self, db, service):
        service.push(service.plan([501, 502], name="Crate"))
        ((summary, detail),) = events(db)
        assert summary == "Added 2 of 2 tracks to the Beatport playlist “Crate”"
        assert detail["playlist_url"] == f"{PLAYLIST_WEB_BASE}/700001"
        assert "placeholder" not in json.dumps(detail)
        assert (detail["outcome"], detail["added"]) == (OUTCOME_SUCCEEDED, 2)

    def test_owned_skipped_are_counted(self, db, service):
        own(db, 502)
        result = service.push(service.plan([501, 502, 503], name="Crate"))
        assert (result.requested, result.skipped_owned, result.added) == (3, 1, 2)
        assert events(db)[0][0].endswith("(1 owned skipped)")

    def test_owned_included_on_request_are_pushed(self, db, service, world):
        own(db, 502)
        service.push(service.plan([501, 502], name="Crate", include_owned=True))
        assert only_playlist(world)["tracks"] == [501, 502]

    def test_progress_names_its_two_stages(self, service):
        seen = []
        service.push(
            service.plan([501, 502], name="Crate"),
            on_progress=lambda stage, done, total: seen.append((stage, done, total)),
        )
        assert seen == [
            (STAGE_CREATING, 0, 2),
            (STAGE_ADDING, 0, 2),
            (STAGE_ADDING, 1, 2),
            (STAGE_ADDING, 2, 2),
        ]


class TestSomeFailing:
    def test_a_track_beatport_refuses_is_reported_and_skipped(self, db, service, world):
        world.tracks.pop(502)
        result = service.push(service.plan([501, 502, 503], name="Crate"))
        assert only_playlist(world)["tracks"] == [501, 503]
        assert (result.outcome, result.added, result.failed_track_ids) == (
            OUTCOME_SUCCEEDED,
            2,
            (502,),
        )
        assert events(db)[0][0] == (
            "Added 2 of 3 tracks to the Beatport playlist “Crate” (1 failed)"
        )

    def test_refusals_about_the_track_never_stop_it(self, service, world):
        for track_id in (501, 502, 503, 504):
            world.tracks.pop(track_id)
        result = service.push(service.plan(list(TRACKS), name="Crate"))
        assert (result.added, result.failed, result.not_attempted) == (1, 4, 0)
        assert result.error is None

    def test_three_failures_in_a_row_stop_it(self, service, world):
        fail(world, 503, tracks=(502, 503, 504))
        result = service.push(service.plan(list(TRACKS), name="Crate"))
        assert (result.added, result.failed, result.not_attempted) == (1, 3, 1)
        assert (result.outcome, result.error_class) == (OUTCOME_FAILED, "unavailable")
        assert only_playlist(world)["tracks"] == [501]

    def test_a_success_resets_the_count(self, service, world):
        fail(world, 503, tracks=(501, 502, 504, 505))
        result = service.push(service.plan(list(TRACKS), name="Crate"))
        assert (result.added, result.failed, result.error) == (1, 4, None)

    @pytest.mark.parametrize(
        ("status", "kind"),
        [(401, "rejected"), (403, "forbidden"), (429, "rate_limited")],
    )
    def test_a_refusal_every_track_would_repeat_stops_it_at_once(
        self, db, service, world, status, kind
    ):
        fail(world, status, tracks=(502,))
        result = service.push(service.plan([501, 502, 503], name="Crate"))
        assert (result.added, result.failed, result.not_attempted) == (1, 1, 1)
        assert (result.outcome, result.error_class) == (OUTCOME_FAILED, kind)
        summary, detail = events(db)[0]
        assert "stopped because" in summary
        assert detail["playlist_url"] == f"{PLAYLIST_WEB_BASE}/700001"

    def test_the_result_lists_every_failure_and_the_event_the_first(
        self, db, service, world
    ):
        ids = list(range(1, EVENT_ID_LIMIT + 11))
        for track_id in ids:
            world.add_track(track_id, NOW.date(), (7, "Label"), (70, "Release"))
        world.tracks.pop(ids[0])
        refused = set(ids[: EVENT_ID_LIMIT + 5])
        world.failures.append(
            lambda path, params, n: 404 if params.get("track_id") in refused else None
        )
        result = service.push(service.plan(ids, name="Crate"))
        assert result.failed == EVENT_ID_LIMIT + 5
        assert len(result.to_dict()["failed_track_ids"]) == EVENT_ID_LIMIT + 5
        detail = events(db)[0][1]
        assert detail["failed"] == EVENT_ID_LIMIT + 5
        assert detail["failed_track_ids"] == ids[:EVENT_ID_LIMIT]


class TestCreateRefused:
    def test_a_403_is_forbidden_and_says_beatport_will_not_allow_playlists(
        self, db, service, world
    ):
        fail(world, 403, route="my/playlists")
        result = service.push(service.plan([501, 502], name="Crate"))
        assert (result.outcome, result.error_class) == (OUTCOME_FAILED, "forbidden")
        assert "won't allow making playlists" in result.error
        assert (result.playlist_id, result.playlist_url) == (None, None)
        assert (result.added, result.not_attempted) == (0, 2)
        assert world.playlists == {}
        ((summary, detail),) = events(db)
        assert summary.startswith("Could not create the Beatport playlist “Crate”:")
        assert "won't allow making playlists" in summary
        assert detail["playlist_url"] is None

    @pytest.mark.parametrize(
        ("status", "kind"),
        [(401, "rejected"), (429, "rate_limited"), (500, "unavailable")],
    )
    def test_other_refusals_say_what_they_are(self, service, world, status, kind):
        fail(world, status, route="my/playlists")
        result = service.push(service.plan([501], name="Crate"))
        assert (result.error_class, result.added) == (kind, 0)
        assert result.error

    def test_no_id_in_the_answer_fails_it(self, db, world, activity):
        class Nameless(BeatportWorld):
            def post(self, path, json=None):
                if path.strip("/") == "my/playlists":
                    return {"name": "Crate"}
                return super().post(path, json)

        nameless = Nameless(tracks=world.tracks)
        service = make_service(db, nameless, activity)
        result = service.push(service.plan([501], name="Crate"))
        assert (result.outcome, result.error_class) == (OUTCOME_FAILED, None)
        assert result.error == "Beatport did not say which playlist it created"

    def test_no_token_is_refused_before_anything(self, db):
        from cuepoint.exceptions.cuepoint_exceptions import BeatportAPIError

        service = make_service(db, BeatportWorld(access_token=""))
        with pytest.raises(BeatportAPIError):
            service.require_token()


class TestCancelled:
    def test_before_the_playlist_is_created(self, db, service, world):
        result = service.push(
            service.plan([501, 502], name="Crate"), should_cancel=lambda: True
        )
        assert (result.outcome, result.playlist_id, result.not_attempted) == (
            OUTCOME_CANCELLED,
            None,
            2,
        )
        assert world.playlists == {} and world.requests == []
        assert events(db)[0][0] == (
            "Cancelled the Beatport playlist “Crate” before creating it"
        )

    def test_mid_way_keeps_what_was_added(self, db, service, world):
        asked = []

        def should_cancel():
            asked.append(1)
            return len(asked) > 3  # before creating, then before tracks 1 and 2

        result = service.push(
            service.plan(list(TRACKS), name="Crate"), should_cancel=should_cancel
        )
        assert only_playlist(world)["tracks"] == [501, 502]
        assert (result.outcome, result.added, result.not_attempted) == (
            OUTCOME_CANCELLED,
            2,
            3,
        )
        assert result.playlist_url == f"{PLAYLIST_WEB_BASE}/700001"
        assert events(db)[0][0].endswith("; cancelled")


class TestTheFeedIsBestEffort:
    def test_a_push_survives_an_event_it_cannot_write(self, db, world):
        class Failing(ActivityService):
            def record_event(self, *args, **kwargs):
                raise RuntimeError("the feed is full")

        service = make_service(
            db, world, Failing(ActivityRepository(db), TrackRepository(db))
        )
        assert service.push(service.plan([501], name="Crate")).added == 1

    def test_without_an_activity_service(self, db, world):
        service = make_service(db, world)
        assert service.push(service.plan([501], name="Crate")).added == 1


def test_at_least_one_failure_is_needed_to_stop(db, world):
    with pytest.raises(ValueError):
        make_service(db, world, max_consecutive_failures=0)
