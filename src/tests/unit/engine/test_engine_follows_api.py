#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Following over HTTP (DEC-317).

The service tests decide what a follow, a feed and a check do. What only this
layer can get wrong is tested here, through a running engine over a real
library and the real job store: each route answers its service's answer, a
request is read strictly (a 400 naming the problem, never a 500), the check is
a job that ends in the right state, and the entity answer says whether its page
can be followed.
"""

# ruff: noqa: F811

from __future__ import annotations

from typing import Any, Dict

import pytest

from cuepoint.engine import discover_api as api
from cuepoint.engine.follow_check_jobs import JOB_TYPE_FOLLOWS_CHECK
from cuepoint.engine.jobs import JobState
from cuepoint.services.follow_service import forget_states
from tests.unit.engine.test_engine_discover_api import (  # noqa: F401
    blocking_job,
    call,
    engine,
    finished,
    get,
    library,
    library_db,
    ok,
    own,
    post,
    refused,
    resolve,
    store,
    use_beatport,
    world,
)
from tests.fixtures.beatport_world import BeatportWorld

pytestmark = pytest.mark.unit

#: Nightfall Audio, the standard world's label: tracks 7 and 8 two days ago and
#: 2 four days ago are new; 9, ninety days ago, is not.
LABEL = 40211


@pytest.fixture(autouse=True)
def _forget_states():
    forget_states()
    yield
    forget_states()


def follow_label(engine: str) -> Dict[str, Any]:
    return ok(
        post(
            engine,
            api.FOLLOWS_ADD_PATH,
            {"kind": "label", "beatport_id": LABEL, "name": "Nightfall Audio"},
        )
    )


def check(engine: str, store: Any, **body: Any) -> Any:
    job = ok(post(engine, api.FOLLOWS_CHECK_START_PATH, body), 202)
    assert job["type"] == JOB_TYPE_FOLLOWS_CHECK
    return finished(store, job["id"])


class TestFollowing:
    def test_it_starts_empty(self, engine, world):
        assert ok(get(engine, api.FOLLOWS_PATH)) == {"follows": [], "new_count": 0}
        feed = ok(get(engine, api.FOLLOWS_FEED_PATH))
        assert feed["rows"] == [] and feed["total"] == 0

    def test_a_follow_is_added_listed_and_removed(self, engine, world):
        added = follow_label(engine)
        assert added["changed"] is True and added["follow"]["beatport_id"] == LABEL
        again = follow_label(engine)
        assert again["changed"] is False
        listed = ok(get(engine, api.FOLLOWS_PATH))["follows"]
        assert [(f["kind"], f["beatport_id"], f["new_count"]) for f in listed] == [
            ("label", LABEL, 0)
        ]
        removed = ok(
            post(
                engine, api.FOLLOWS_REMOVE_PATH, {"kind": "label", "beatport_id": LABEL}
            )
        )
        assert removed == {"changed": True, "followed": False}
        assert ok(get(engine, api.FOLLOWS_PATH))["follows"] == []

    def test_reading_never_asks_beatport(self, engine, world):
        follow_label(engine)
        for path in (
            api.FOLLOWS_PATH,
            api.FOLLOWS_FEED_PATH,
            api.FOLLOWS_SUGGESTIONS_PATH,
        ):
            ok(get(engine, path))
        assert world.requests == []

    def test_a_check_fills_the_cache_the_feed_reads(self, engine, store, world):
        follow_label(engine)
        done = check(engine, store)
        assert done.state is JobState.SUCCEEDED
        assert done.result["checked"] == 1 and done.result["failed"] == []
        feed = ok(get(engine, api.FOLLOWS_FEED_PATH))
        assert sorted(r["beatport_track_id"] for r in feed["rows"]) == [2, 7, 8]
        assert all(r["follows"][0]["beatport_id"] == LABEL for r in feed["rows"])
        assert feed["checked_at"] is not None and feed["states"] == []
        assert ok(get(engine, api.FOLLOWS_PATH))["follows"][0]["new_count"] == 3
        # Nothing for a follow named, nothing for another.
        assert (
            ok(get(engine, api.FOLLOWS_FEED_PATH, kind="label", beatport_id=LABEL))[
                "total"
            ]
            == 3
        )
        assert (
            ok(get(engine, api.FOLLOWS_FEED_PATH, kind="artist", beatport_id=1))[
                "total"
            ]
            == 0
        )

    def test_owned_tracks_are_hidden_unless_asked(self, engine, store, world, library):
        follow_label(engine)
        check(engine, store)
        own(library[0], 7)
        hidden = ok(get(engine, api.FOLLOWS_FEED_PATH))
        assert hidden["hidden_owned"] == 1 and hidden["total"] == 2
        shown = ok(get(engine, api.FOLLOWS_FEED_PATH, owned="all"))
        assert shown["total"] == 3

    def test_marking_seen_empties_the_feed(self, engine, store, world):
        follow_label(engine)
        check(engine, store)
        seen = ok(post(engine, api.FOLLOWS_SEEN_PATH, {}))
        assert seen["changed"] == 1
        assert ok(get(engine, api.FOLLOWS_FEED_PATH))["rows"] == []
        named = ok(
            post(engine, api.FOLLOWS_SEEN_PATH, {"kind": "label", "beatport_id": LABEL})
        )
        assert named["changed"] == 0

    def test_a_check_without_a_token_ends_with_that_state(self, engine, store, library):
        use_beatport(BeatportWorld(access_token=""))
        follow_label(engine)
        done = check(engine, store)
        assert done.state is JobState.FAILED
        assert done.error["code"] == "BEATPORT_NO_TOKEN"
        assert done.result["state"] == "no_token"

    def test_a_refusal_for_one_follow_does_not_fail_the_job(self, engine, store, world):
        follow_label(engine)
        world.failures.append(lambda path, params, n: 403)
        done = check(engine, store)
        assert done.state is JobState.SUCCEEDED
        assert [f["state"] for f in done.result["failed"]] == ["forbidden"]
        feed = ok(get(engine, api.FOLLOWS_FEED_PATH))
        assert [s["state"] for s in feed["states"]] == ["forbidden"]

    def test_refresh_reads_again(self, engine, store, world):
        follow_label(engine)
        check(engine, store)
        first = len(world.requests)
        check(engine, store)
        assert len(world.requests) == first
        check(engine, store, refresh=True)
        assert len(world.requests) > first

    def test_one_check_at_a_time(self, engine, store, world):
        release = blocking_job(store, JOB_TYPE_FOLLOWS_CHECK)
        try:
            refused(post(engine, api.FOLLOWS_CHECK_START_PATH), 409, "DISCOVER_BUSY")
        finally:
            release.set()

    def test_suggestions_come_from_the_library(self, engine, world, library):
        own(library[0], 7)
        found = ok(get(engine, api.FOLLOWS_SUGGESTIONS_PATH))["suggestions"]
        assert isinstance(found, list)
        assert all(
            set(s) == {"kind", "beatport_id", "name", "track_count", "followed"}
            for s in found
        )


class TestTheEntityAnswer:
    def test_an_id_page_says_whether_it_is_followed(self, engine, world):
        page = ok(get(engine, api.ENTITY_PATH, kind="label", ref=f"bp:{LABEL}"))
        assert (page["followable"], page["followed"]) == (True, False)
        follow_label(engine)
        page = ok(get(engine, api.ENTITY_PATH, kind="label", ref=f"bp:{LABEL}"))
        assert (page["followable"], page["followed"]) == (True, True)
        # An artist with that number is another page.
        other = ok(get(engine, api.ENTITY_PATH, kind="artist", ref=f"bp:{LABEL}"))
        assert (other["followable"], other["followed"]) == (True, False)

    def test_a_name_page_cannot_be_followed(self, engine, world, library):
        page = ok(get(engine, api.ENTITY_PATH, kind="artist", ref="name:Kiko"))
        assert (page["followable"], page["followed"]) == (False, False)

    def test_the_existing_fields_are_unchanged(self, engine, world):
        page = ok(get(engine, api.ENTITY_PATH, kind="label", ref=f"bp:{LABEL}"))
        assert {"kind", "ref", "identity", "beatport_id", "library", "rules"} <= set(
            page
        )


class TestRefusals:
    @pytest.mark.parametrize(
        "path, params, words",
        [
            (api.FOLLOWS_PATH, {"limit": 1}, "Unknown parameter 'limit'"),
            (api.FOLLOWS_SUGGESTIONS_PATH, {"limit": 0}, "limit must be from"),
            (api.FOLLOWS_SUGGESTIONS_PATH, {"limit": 101}, "limit must be from"),
            (api.FOLLOWS_SUGGESTIONS_PATH, {"limit": "x"}, "whole number"),
            (api.FOLLOWS_SUGGESTIONS_PATH, {"kind": "artist"}, "Unknown parameter"),
            (api.FOLLOWS_FEED_PATH, {"owned": "some"}, "owned must be one of"),
            (api.FOLLOWS_FEED_PATH, {"limit": 501}, "limit must be from"),
            (api.FOLLOWS_FEED_PATH, {"offset": -1}, "whole number"),
            (api.FOLLOWS_FEED_PATH, {"kind": "label"}, "together"),
            (api.FOLLOWS_FEED_PATH, {"beatport_id": 5}, "together"),
            (
                api.FOLLOWS_FEED_PATH,
                {"kind": "genre", "beatport_id": 5},
                "kind must be",
            ),
            (api.FOLLOWS_FEED_PATH, {"kind": "label", "beatport_id": 0}, "positive"),
            (api.FOLLOWS_FEED_PATH, {"kind": "label", "beatport_id": "x"}, "positive"),
        ],
    )
    def test_a_read_it_cannot_answer_is_a_400(self, engine, path, params, words):
        refused(get(engine, path, **params), 400, "INVALID_REQUEST", words)

    def test_a_parameter_given_twice_is_refused(self, engine):
        refused(
            call(
                engine,
                "GET",
                api.FOLLOWS_FEED_PATH,
                params=[("owned", "all"), ("owned", "hide")],
            ),
            400,
            "INVALID_REQUEST",
            "may be given once",
        )

    @pytest.mark.parametrize(
        "path, body, words",
        [
            (api.FOLLOWS_ADD_PATH, {}, "kind is required"),
            (api.FOLLOWS_ADD_PATH, {"kind": "artist"}, "beatport_id is required"),
            (
                api.FOLLOWS_ADD_PATH,
                {"kind": "artist", "beatport_id": 1},
                "name is required",
            ),
            (
                api.FOLLOWS_ADD_PATH,
                {"kind": "genre", "beatport_id": 1, "name": "x"},
                "kind must be one of",
            ),
            (
                api.FOLLOWS_ADD_PATH,
                {"kind": "artist", "beatport_id": "1", "name": "x"},
                "whole number",
            ),
            (
                api.FOLLOWS_ADD_PATH,
                {"kind": "artist", "beatport_id": True, "name": "x"},
                "whole number",
            ),
            (
                api.FOLLOWS_ADD_PATH,
                {"kind": "artist", "beatport_id": 0, "name": "x"},
                "positive",
            ),
            (
                api.FOLLOWS_ADD_PATH,
                {"kind": "artist", "beatport_id": 1, "name": 5},
                "name must be text",
            ),
            (
                api.FOLLOWS_ADD_PATH,
                {"kind": "artist", "beatport_id": 1, "name": " "},
                "name is required",
            ),
            (
                api.FOLLOWS_ADD_PATH,
                {"kind": "artist", "beatport_id": 1, "name": "x", "seen": "2020-01-01"},
                "Unknown field 'seen'",
            ),
            (api.FOLLOWS_REMOVE_PATH, {"kind": "artist"}, "beatport_id is required"),
            (
                api.FOLLOWS_REMOVE_PATH,
                {"kind": "label", "beatport_id": 1, "name": "x"},
                "Unknown field 'name'",
            ),
            (api.FOLLOWS_SEEN_PATH, {"kind": "artist"}, "beatport_id is required"),
            (api.FOLLOWS_SEEN_PATH, {"beatport_id": 3}, "kind is required"),
            (api.FOLLOWS_SEEN_PATH, {"all": True}, "Unknown field 'all'"),
            (api.FOLLOWS_CHECK_START_PATH, {"refresh": "yes"}, "true or false"),
            (api.FOLLOWS_CHECK_START_PATH, {"now": True}, "Unknown field 'now'"),
        ],
    )
    def test_an_action_it_cannot_take_is_a_400_and_changes_nothing(
        self, engine, store, path, body, words
    ):
        refused(post(engine, path, body), 400, "INVALID_REQUEST", words)
        assert ok(get(engine, api.FOLLOWS_PATH))["follows"] == []
        assert [j for j in store.list_all() if j.type == JOB_TYPE_FOLLOWS_CHECK] == []

    def test_a_body_that_is_not_an_object_is_refused(self, engine):
        refused(
            call(engine, "POST", api.FOLLOWS_ADD_PATH, raw=b"[1]"),
            400,
            "INVALID_REQUEST",
        )

    def test_an_empty_body_is_nothing_asked_for_where_nothing_is_needed(
        self, engine, store, world
    ):
        ok(call(engine, "POST", api.FOLLOWS_SEEN_PATH, raw=b""))
        job = ok(call(engine, "POST", api.FOLLOWS_CHECK_START_PATH, raw=b""), 202)
        assert finished(store, job["id"]).state is JobState.SUCCEEDED
