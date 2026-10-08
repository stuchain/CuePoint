#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""A Set over the wire (PREP-08).

Every route under ``/api/v1/sets/`` through a real engine on a free port, over
a real library: what each answers, and every refusal it can give, with its code
and reason. The services behind the routes are PREP-02 to PREP-06's and have
their own tests; these hold the wire to them, and hold that a refused request
writes nothing.
"""

from __future__ import annotations

import os
from pathlib import Path

import pytest

from cuepoint.engine import sets_api as api
from cuepoint.engine.api_errors import ApiError
from cuepoint.models.library_track import LibraryTrack
from cuepoint.models.rekordbox_playlist import (
    KIND_FOLDER,
    KIND_PLAYLIST,
    RekordboxPlaylist,
)
from cuepoint.models.set_plan import MAX_SET_ENTRIES
from tests.unit.engine.test_engine_library_browse import (
    engine,  # noqa: F401 — a pytest fixture, used by name
    get_json,
    library_db,  # noqa: F401 — a pytest fixture, used by name
)
from tests.unit.engine.test_engine_organization_api import get_status, ok, post
from tests.unit.key_support import accept_with_key

pytestmark = pytest.mark.unit

#: title, artist, bpm, key, seconds
LIBRARY = (
    ("Warm One", "Ada", 122.0, "8A", 300),
    ("Warm Two", "Bea", 124.0, "9A", 320),
    ("Peak One", "Cal", 128.0, "8A", 360),
    ("Peak Two", "Dee", 140.0, "3B", 280),
    ("Close", "Ada", 125.0, "8B", 400),
    ("Spare", "Eve", 124.0, "9A", 310),
)


def resolve(name: str):
    from cuepoint.services import interfaces
    from cuepoint.utils.di_container import get_container

    return get_container().resolve(getattr(interfaces, name))


@pytest.fixture
def ids(library_db):  # noqa: F811 — the fixture is used by name
    """Six tracks and a Rekordbox playlist of three, one of them twice."""
    tracks = resolve("ITrackRepository")
    made = [
        int(
            tracks.add(
                LibraryTrack(
                    rekordbox_track_id=str(i),
                    file_path=f"/music/{i}.mp3",
                    title=title,
                    artist=artist,
                    bpm=bpm,
                    key=key,
                    duration_seconds=seconds,
                )
            ).id
        )
        for i, (title, artist, bpm, key, seconds) in enumerate(LIBRARY, start=1)
    ]
    # The keys are Beatport's (DEC-201): an accepted match carries each one.
    for track_id, row in zip(made, LIBRARY):
        if row[3] is not None:
            accept_with_key(resolve("IDatabaseService"), track_id, row[3])
    resolve("IPlaylistRepository").replace_tree(
        [
            RekordboxPlaylist(
                name="SETS",
                kind=KIND_FOLDER,
                depth=0,
                position=0,
                rekordbox_path="SETS",
            ),
            RekordboxPlaylist(
                name="warmup",
                kind=KIND_PLAYLIST,
                depth=1,
                position=0,
                rekordbox_path="SETS/warmup",
                parent_path="SETS",
                track_refs=["2", "1", "2"],
            ),
        ]
    )
    return made


def playlist_id(engine_url: str) -> int:
    tree = get_json(engine_url, "/api/v1/library/playlists")
    (node,) = [n for n in tree["playlists"] if n["path"] == "SETS/warmup"]
    return int(node["id"])


def get(engine_url: str, path: str, **params):
    return get_status(engine_url, f"/api/v1/sets/{path}", **params)


def read(engine_url: str, path: str, **params) -> dict:
    status, payload = get(engine_url, path, **params)
    assert status == 200, (status, payload)
    return payload


def act(engine_url: str, path: str, body: dict) -> dict:
    return ok(engine_url, f"/api/v1/sets/{path}", body)


def refused(engine_url: str, path: str, body: dict, status: int, code: str) -> dict:
    got, payload = post(engine_url, f"/api/v1/sets/{path}", body)
    assert (got, payload["error"]["code"]) == (status, code), payload
    return payload["error"]


def refused_read(engine_url: str, path: str, status: int, code: str, **params) -> dict:
    got, payload = get(engine_url, path, **params)
    assert (got, payload["error"]["code"]) == (status, code), payload
    return payload["error"]


@pytest.fixture
def friday(engine, ids):  # noqa: F811 — the fixture is used by name
    """ "Friday": tracks 1, 2, 3, 4, then 1 again, in one unnamed chapter."""
    made = act(engine, "create", {"name": "Friday"})["set"]
    ok(
        engine,
        "/api/v1/collections/tracks/add",
        {"collection_id": made["id"], "track_ids": ids[:4]},
    )
    ok(
        engine,
        "/api/v1/collections/tracks/insert",
        {"collection_id": made["id"], "track_id": ids[0], "position": 4},
    )
    return made


def the_plan(engine_url: str, set_id: int) -> dict:
    return read(engine_url, "plan", set_id=set_id)


def entry_ids(engine_url: str, set_id: int) -> list:
    return [e["entry_id"] for e in the_plan(engine_url, set_id)["entries"]]


def split(engine_url: str, set_id: int, at: int, name: str) -> dict:
    """Start a chapter at the entry in place ``at``."""
    return act(
        engine_url,
        "chapters/split",
        {"entry_id": entry_ids(engine_url, set_id)[at], "name": name},
    )["chapter"]


def everything(set_id: int) -> tuple:
    """Every row a Set has, to prove a refusal wrote nothing."""
    collections = resolve("ICollectionRepository")
    return (
        [c.to_dict() for c in collections.chapters(set_id)],
        [p.to_dict() for p in collections.entry_plans(set_id)],
        [e.track_id for e in collections.entries(set_id)],
        collections.set_details(set_id).to_dict(),
        [a.to_dict() for a in collections.acknowledgements(set_id)],
    )


# ---------------------------------------------------------------------------


class TestTheRoutes:
    def test_every_route_is_under_the_sets_prefix(self):
        for path in (*api.GET_PATHS, *api.POST_PATHS):
            assert path.startswith("/api/v1/sets/"), path
        assert len(api.GET_PATHS) == 5 and len(api.POST_PATHS) == 15

    def test_the_specified_routes_and_no_others(self):
        assert {p[len(api.PREFIX) :] for p in api.GET_PATHS} == {
            "plan",
            "entries",
            "analysis",
            "suggestions",
            "set-list/text",
        }
        assert {p[len(api.PREFIX) :] for p in api.POST_PATHS} == {
            "create",
            "create-from",
            "duplicate",
            "notes",
            "chapters/create",
            "chapters/update",
            "chapters/move",
            "chapters/delete",
            "chapters/split",
            "entries/move",
            "entries/times",
            "entries/note",
            "acknowledge",
            "unacknowledge",
            "set-list/save",
        }

    def test_no_route_adds_or_removes_an_entry(self):
        # One path writes an entry, on the wire as in the repository (PREP-02).
        for path in api.POST_PATHS:
            assert not path.endswith(("/add", "/insert", "/remove")), path

    def test_an_unknown_path_is_not_found(self, engine, ids):  # noqa: F811
        assert get(engine, "nothing", set_id=1)[0] == 404
        assert post(engine, "/api/v1/sets/nothing", {})[0] == 404

    def test_a_read_is_not_answered_to_a_post_nor_an_action_to_a_get(
        self,
        engine,  # noqa: F811
        friday,
    ):
        assert post(engine, "/api/v1/sets/plan", {"set_id": friday["id"]})[0] == 404
        assert get(engine, "create", name="X")[0] == 404

    def test_every_route_needs_the_token(self, engine, friday):  # noqa: F811
        import urllib.error
        import urllib.request

        for path in api.GET_PATHS:
            request = urllib.request.Request(f"{engine}{path}?set_id={friday['id']}")
            with pytest.raises(urllib.error.HTTPError) as caught:
                urllib.request.urlopen(request, timeout=5)
            assert caught.value.code == 401, path
        for path in api.POST_PATHS:
            request = urllib.request.Request(
                f"{engine}{path}", data=b"{}", method="POST"
            )
            with pytest.raises(urllib.error.HTTPError) as caught:
                urllib.request.urlopen(request, timeout=5)
            assert caught.value.code == 401, path


class TestWhatAReadMaySay:
    @pytest.mark.parametrize("path", ["plan", "entries", "analysis", "set-list/text"])
    def test_a_set_id_is_required_and_whole(self, engine, friday, path):  # noqa: F811
        assert (
            "set_id is required"
            in refused_read(engine, path, 400, "INVALID_REQUEST")["message"]
        )
        for bad in ("x", "-1", "0", "1.5"):
            refused_read(engine, path, 400, "INVALID_REQUEST", set_id=bad)

    @pytest.mark.parametrize("path", ["plan", "entries", "analysis", "set-list/text"])
    def test_an_unknown_parameter_is_named(self, engine, friday, path):  # noqa: F811
        error = refused_read(
            engine, path, 400, "INVALID_REQUEST", set_id=friday["id"], sort="title"
        )
        assert "Unknown parameter 'sort'" in error["message"]

    def test_a_parameter_given_twice_is_refused(self, engine, friday):  # noqa: F811
        status, payload = get_status(
            engine, f"/api/v1/sets/plan?set_id={friday['id']}&set_id={friday['id']}"
        )
        assert status == 400 and "once" in payload["error"]["message"]

    @pytest.mark.parametrize(
        "path", ["plan", "entries", "analysis", "suggestions", "set-list/text"]
    )
    def test_a_set_that_is_not_there_is_not_found(self, engine, friday, path):  # noqa: F811
        error = refused_read(engine, path, 404, "SET_NOT_FOUND", set_id=99999)
        assert error["reason"] == "set"
        assert "There is no Set 99999" == error["message"]

    @pytest.mark.parametrize("path", ["plan", "entries", "analysis", "set-list/text"])
    def test_a_collection_is_not_a_set(self, engine, friday, path):  # noqa: F811
        crate = ok(
            engine,
            "/api/v1/collections/create",
            {"kind": "collection", "name": "Crate"},
        )["collection"]
        error = refused_read(engine, path, 400, "INVALID_REQUEST", set_id=crate["id"])
        assert "'Crate' is a collection, not a Set" in error["message"]


class TestCreating:
    def test_create_makes_an_empty_set_with_one_unnamed_chapter(self, engine, ids):  # noqa: F811
        made = act(engine, "create", {"name": "Friday"})["set"]
        assert (made["kind"], made["name"], made["entry_count"]) == ("set", "Friday", 0)
        plan = the_plan(engine, made["id"])
        assert [c["name"] for c in plan["chapters"]] == [""]
        assert plan["entries"] == [] and plan["notes"] is None

    def test_create_files_it_in_a_folder(self, engine, ids):  # noqa: F811
        folder = ok(
            engine, "/api/v1/collections/create", {"kind": "folder", "name": "Gigs"}
        )["collection"]
        made = act(engine, "create", {"name": "Friday", "parent_id": folder["id"]})
        assert made["set"]["parent_id"] == folder["id"]

    def test_create_refusals(self, engine, friday):  # noqa: F811
        assert (
            "name is required"
            in refused(engine, "create", {}, 400, "INVALID_REQUEST")["message"]
        )
        refused(engine, "create", {"name": "  "}, 400, "INVALID_REQUEST")
        refused(engine, "create", {"name": 7}, 400, "INVALID_REQUEST")
        error = refused(
            engine, "create", {"name": "X", "kind": "set"}, 400, "INVALID_REQUEST"
        )
        assert "Unknown field 'kind'" in error["message"]
        error = refused(
            engine,
            "create",
            {"name": "Inside", "parent_id": friday["id"]},
            400,
            "INVALID_REQUEST",
        )
        assert "only a folder" in error["message"]
        refused(
            engine, "create", {"name": "X", "parent_id": True}, 400, "INVALID_REQUEST"
        )

    def test_from_a_collection_keeps_its_order_and_repeats(self, engine, ids):  # noqa: F811
        crate = ok(
            engine,
            "/api/v1/collections/create",
            {"kind": "collection", "name": "Crate"},
        )["collection"]
        for track in (ids[2], ids[0], ids[2]):
            ok(
                engine,
                "/api/v1/collections/tracks/insert",
                {"collection_id": crate["id"], "track_id": track, "position": 99},
            )
        made = act(
            engine, "create-from", {"source": {"kind": "collection", "id": crate["id"]}}
        )
        assert made["source"] == {
            "kind": "collection",
            "id": crate["id"],
            "name": "Crate",
        }
        assert made["track_count"] == 3
        assert (made["set"]["name"], made["set"]["entry_count"]) == ("Crate", 3)
        plan = the_plan(engine, made["set"]["id"])
        assert [e["track_id"] for e in plan["entries"]] == [ids[2], ids[0], ids[2]]

    def test_from_a_playlist_in_its_order(self, engine, ids):  # noqa: F811
        made = act(
            engine,
            "create-from",
            {"source": {"kind": "playlist", "id": playlist_id(engine)}, "name": "Warm"},
        )
        assert made["source"]["kind"] == "playlist" and made["set"]["name"] == "Warm"
        plan = the_plan(engine, made["set"]["id"])
        assert [e["track_id"] for e in plan["entries"]] == [ids[1], ids[0], ids[1]]

    def test_from_a_selection_in_the_order_sent(self, engine, ids):  # noqa: F811
        made = act(
            engine,
            "create-from",
            {
                "source": {"kind": "selection", "track_ids": [ids[4], ids[3]]},
                "name": "Picked",
            },
        )
        assert made["source"] == {"kind": "selection", "id": None, "name": None}
        plan = the_plan(engine, made["set"]["id"])
        assert [e["track_id"] for e in plan["entries"]] == [ids[4], ids[3]]

    @pytest.mark.parametrize(
        "source, words",
        [
            (None, "source must be an object"),
            ({"kind": "folder", "id": 1}, "source.kind must be one of"),
            ({"kind": "selection", "track_ids": []}, "non-empty list"),
            ({"kind": "selection", "id": 3, "track_ids": [1]}, "not an id"),
            ({"kind": "collection", "id": 1, "track_ids": [1]}, "not track_ids"),
            ({"kind": "collection"}, "id is required"),
            ({"kind": "playlist", "id": "7"}, "whole number"),
            ({"kind": "collection", "id": 1, "rules": {}}, "Unknown field 'rules'"),
        ],
    )
    def test_a_source_that_is_not_one(self, engine, ids, source, words):  # noqa: F811
        error = refused(
            engine,
            "create-from",
            {"source": source, "name": "N"},
            400,
            "INVALID_REQUEST",
        )
        assert words in error["message"]

    def test_the_services_refusals_arrive_in_its_words(self, engine, friday, ids):  # noqa: F811
        error = refused(
            engine,
            "create-from",
            {"source": {"kind": "selection", "track_ids": [ids[0]]}},
            400,
            "INVALID_REQUEST",
        )
        assert "needs a name" in error["message"]
        error = refused(
            engine,
            "create-from",
            {"source": {"kind": "collection", "id": friday["id"]}},
            400,
            "INVALID_REQUEST",
        )
        assert "duplicate it" in error["message"]

    def test_a_source_past_the_limit_writes_nothing(self, engine, ids):  # noqa: F811
        before = get_json(engine, "/api/v1/collections")["total"]
        error = refused(
            engine,
            "create-from",
            {
                "source": {"kind": "selection", "track_ids": [ids[0]] * 1001},
                "name": "Too long",
            },
            400,
            "INVALID_REQUEST",
        )
        assert "at most 1,000" in error["message"]
        assert get_json(engine, "/api/v1/collections")["total"] == before

    def test_duplicate_copies_the_plan(self, engine, friday):  # noqa: F811
        split(engine, friday["id"], 2, "Peak")
        copy = act(engine, "duplicate", {"set_id": friday["id"]})["set"]
        assert (copy["name"], copy["kind"], copy["entry_count"]) == (
            "Friday copy",
            "set",
            5,
        )
        assert [c["name"] for c in the_plan(engine, copy["id"])["chapters"]] == [
            "",
            "Peak",
        ]
        named = act(engine, "duplicate", {"set_id": friday["id"], "name": "Saturday"})
        assert named["set"]["name"] == "Saturday"

    def test_duplicate_refusals(self, engine, friday):  # noqa: F811
        error = refused(engine, "duplicate", {"set_id": 99999}, 404, "SET_NOT_FOUND")
        assert error["reason"] == "set"
        refused(engine, "duplicate", {}, 400, "INVALID_REQUEST")
        crate = ok(
            engine,
            "/api/v1/collections/create",
            {"kind": "collection", "name": "Crate"},
        )["collection"]
        error = refused(
            engine, "duplicate", {"set_id": crate["id"]}, 400, "INVALID_REQUEST"
        )
        assert "not a set" in error["message"].lower()


class TestReads:
    def test_the_plan(self, engine, friday, ids):  # noqa: F811
        plan = the_plan(engine, friday["id"])
        assert set(plan) == {
            "set_id",
            "name",
            "notes",
            "chapters",
            "entries",
            "running_time",
        }
        assert [e["track_id"] for e in plan["entries"]] == [*ids[:4], ids[0]]
        assert plan["running_time"] == {"seconds": 0, "timed": 0, "untimed": 5}
        (chapter,) = plan["chapters"]
        assert chapter["entry_ids"] == [e["entry_id"] for e in plan["entries"]]

    def test_entries_are_the_running_order_with_the_librarys_own_rows(
        self,
        engine,  # noqa: F811
        friday,
        ids,
    ):
        answer = read(engine, "entries", set_id=friday["id"])
        assert (answer["set_id"], answer["name"], answer["limit"]) == (
            friday["id"],
            "Friday",
            MAX_SET_ENTRIES,
        )
        rows = answer["entries"]
        assert [r["track"]["id"] for r in rows] == [*ids[:4], ids[0]]
        assert [r["position"] for r in rows] == [0, 1, 2, 3, 4]
        # A repeat is two entries, with one track.
        assert rows[0]["entry_id"] != rows[4]["entry_id"]
        browse = get_json(
            engine, "/api/v1/library/search", mode="browse", q="", limit=100
        )["tracks"]
        by_id = {row["id"]: row for row in browse}
        for row in rows:
            assert row["track"] == by_id[row["track"]["id"]]

    def test_entries_carry_the_plan_and_the_effective_values(
        self,
        engine,  # noqa: F811
        friday,
        ids,
    ):
        first = entry_ids(engine, friday["id"])[0]
        act(
            engine,
            "entries/times",
            {"entry_id": first, "in_time": "0:30", "out_time": "4:30"},
        )
        act(engine, "entries/note", {"entry_id": first, "note": "long blend"})
        ok(engine, f"/api/v1/library/tracks/{ids[0]}/overrides", {"bpm": 123.0})
        (row, *_rest) = read(engine, "entries", set_id=friday["id"])["entries"]
        assert (
            row["in_seconds"],
            row["out_seconds"],
            row["planned_seconds"],
            row["starts_at"],
            row["note"],
            row["length_seconds"],
        ) == (30, 270, 240, 0, "long blend", 300)
        assert row["track"]["effective_bpm"] == 123.0 and row["track"]["bpm"] == 122.0
        assert row["track"]["file_status"] == "not_checked"

    def test_entries_carry_the_files_last_check(self, engine, friday, ids):  # noqa: F811
        from cuepoint.models.file_status import FILE_MISSING, TrackFileStatus

        resolve("IFileStatusRepository").record(
            [
                TrackFileStatus(
                    track_id=ids[1],
                    status=FILE_MISSING,
                    checked_path="/music/2.mp3",
                    checked_at="2026-09-29T10:00:00Z",
                )
            ]
        )
        rows = read(engine, "entries", set_id=friday["id"])["entries"]
        assert [r["track"]["file_status"] for r in rows] == [
            "not_checked",
            "missing",
            "not_checked",
            "not_checked",
            "not_checked",
        ]

    def test_an_empty_set(self, engine, ids):  # noqa: F811
        made = act(engine, "create", {"name": "Empty"})["set"]
        assert read(engine, "entries", set_id=made["id"])["entries"] == []

    def test_the_analysis(self, engine, friday):  # noqa: F811
        answer = read(engine, "analysis", set_id=friday["id"])
        assert answer["set_id"] == friday["id"]
        assert answer["counts"]["tempo_jump"] >= 1
        assert answer["notices"] == {"repeat": 2}

    def test_the_set_list_text(self, engine, friday):  # noqa: F811
        answer = read(engine, "set-list/text", set_id=friday["id"])
        assert answer["set_id"] == friday["id"]
        assert answer["text"].startswith("Friday")
        assert "Ada – Warm One" in answer["text"]
        assert answer["text"].count("Warm One") == 2


class TestSuggestions:
    def gap(self, engine_url: str, set_id: int, at: int) -> dict:
        """The entries either side of the gap after place ``at``."""
        entries = entry_ids(engine_url, set_id)
        return {"before_entry_id": entries[at], "after_entry_id": entries[at + 1]}

    def test_a_gap_answers_with_both_sides(self, engine, friday, ids):  # noqa: F811
        answer = read(
            engine,
            "suggestions",
            set_id=friday["id"],
            **self.gap(engine, friday["id"], 0),
        )
        assert answer["sides"] == ["before", "after"]
        suggested = {s["track_id"] for s in answer["suggestions"]}
        assert ids[5] in suggested
        (spare,) = [s for s in answer["suggestions"] if s["track_id"] == ids[5]]
        assert spare["in_set"] == 0 and spare["before"] and spare["after"]

    def test_each_suggestion_carries_the_librarys_own_row(
        self,
        engine,  # noqa: F811
        friday,
        ids,
    ):
        answer = read(
            engine,
            "suggestions",
            set_id=friday["id"],
            **self.gap(engine, friday["id"], 0),
        )
        assert answer["suggestions"]
        browse = get_json(
            engine, "/api/v1/library/search", mode="browse", q="", limit=100
        )["tracks"]
        by_id = {row["id"]: row for row in browse}
        for suggestion in answer["suggestions"]:
            assert suggestion["track"] == by_id[suggestion["track_id"]]

    def test_a_suggestion_whose_track_has_gone_is_left_out(
        self,
        engine,  # noqa: F811
        friday,
        ids,
        monkeypatch,
    ):
        from cuepoint.engine import sets_api

        rows = sets_api._track_rows
        # A refresh deleting the spare track between the scoring and the rows.
        monkeypatch.setattr(
            sets_api,
            "_track_rows",
            lambda track_ids: {k: v for k, v in rows(track_ids).items() if k != ids[5]},
        )
        answer = read(
            engine,
            "suggestions",
            set_id=friday["id"],
            **self.gap(engine, friday["id"], 0),
        )
        assert answer["suggestions"]
        assert ids[5] not in {s["track_id"] for s in answer["suggestions"]}

    def test_after_the_last_entry(self, engine, friday):  # noqa: F811
        last = entry_ids(engine, friday["id"])[-1]
        answer = read(engine, "suggestions", set_id=friday["id"], before_entry_id=last)
        assert answer["sides"] == ["before"] and answer["after_entry_id"] is None

    def test_the_pool_is_the_librarys_own_query(self, engine, friday, ids):  # noqa: F811
        gap = self.gap(engine, friday["id"], 0)
        answer = read(engine, "suggestions", set_id=friday["id"], q="Spare", **gap)
        assert [s["track_id"] for s in answer["suggestions"]] == [ids[5]]
        crate = ok(
            engine, "/api/v1/collections/create", {"kind": "collection", "name": "Pool"}
        )["collection"]
        ok(
            engine,
            "/api/v1/collections/tracks/add",
            {"collection_id": crate["id"], "track_ids": [ids[4]]},
        )
        answer = read(
            engine,
            "suggestions",
            set_id=friday["id"],
            scope="collection",
            collection_id=crate["id"],
            **gap,
        )
        assert {s["track_id"] for s in answer["suggestions"]} <= {ids[4]}

    def test_one_side_only(self, engine, friday):  # noqa: F811
        gap = self.gap(engine, friday["id"], 0)
        answer = read(
            engine, "suggestions", set_id=friday["id"], against="after", **gap
        )
        assert answer["sides"] == ["after"]

    def test_a_stale_gap_is_the_views_cue_to_reload(self, engine, friday):  # noqa: F811
        entries = entry_ids(engine, friday["id"])
        error = refused_read(
            engine,
            "suggestions",
            409,
            "SET_INSERTION_POINT_REFUSED",
            set_id=friday["id"],
            before_entry_id=entries[0],
            after_entry_id=entries[2],
        )
        assert error["reason"] == "stale"

    def test_no_neighbour_and_an_empty_set(self, engine, friday, ids):  # noqa: F811
        error = refused_read(
            engine,
            "suggestions",
            400,
            "SET_INSERTION_POINT_REFUSED",
            set_id=friday["id"],
        )
        assert error["reason"] == "no_neighbour"
        empty = act(engine, "create", {"name": "Empty"})["set"]
        error = refused_read(
            engine,
            "suggestions",
            409,
            "SET_INSERTION_POINT_REFUSED",
            set_id=empty["id"],
        )
        assert error["reason"] == "empty_set"

    @pytest.mark.parametrize(
        "extra, words",
        [
            ({"against": "sideways"}, "against must be one of before, after"),
            ({"limit": "0"}, "limit must be from 1"),
            ({"limit": "x"}, "whole number"),
            ({"filters": "{nope"}, "filters must be a JSON object"),
            ({"scope": "everything"}, "scope may only be"),
            ({"chapter_id": "abc"}, "whole number"),
            ({"sort": "title"}, "Unknown parameter 'sort'"),
        ],
    )
    def test_what_is_refused_as_a_request(self, engine, friday, extra, words):  # noqa: F811
        gap = self.gap(engine, friday["id"], 0)
        error = refused_read(
            engine,
            "suggestions",
            400,
            "INVALID_REQUEST",
            set_id=friday["id"],
            **gap,
            **extra,
        )
        assert words in error["message"]


class TestTheSetsNotes:
    def test_written_and_cleared(self, engine, friday):  # noqa: F811
        details = act(engine, "notes", {"set_id": friday["id"], "notes": "Bring USB"})
        assert details["details"]["notes"] == "Bring USB"
        assert the_plan(engine, friday["id"])["notes"] == "Bring USB"
        act(engine, "notes", {"set_id": friday["id"], "notes": None})
        assert the_plan(engine, friday["id"])["notes"] is None

    def test_refusals(self, engine, friday):  # noqa: F811
        act(engine, "notes", {"set_id": friday["id"], "notes": "Keep"})
        error = refused(
            engine, "notes", {"set_id": friday["id"]}, 400, "INVALID_REQUEST"
        )
        assert "send null to clear it" in error["message"]
        refused(
            engine,
            "notes",
            {"set_id": friday["id"], "notes": 5},
            400,
            "INVALID_REQUEST",
        )
        refused(
            engine,
            "notes",
            {"set_id": friday["id"], "notes": "x" * 20_001},
            400,
            "INVALID_REQUEST",
        )
        refused(engine, "notes", {"set_id": 99999, "notes": "x"}, 404, "SET_NOT_FOUND")
        assert the_plan(engine, friday["id"])["notes"] == "Keep"


class TestChapters:
    def names(self, engine_url: str, set_id: int) -> list:
        return [c["name"] for c in the_plan(engine_url, set_id)["chapters"]]

    def test_create_at_the_end_at_a_place_and_after_a_chapter(self, engine, friday):  # noqa: F811
        end = act(engine, "chapters/create", {"set_id": friday["id"], "name": "Close"})
        assert (
            end["chapter"]["position"] == 1 and end["chapter"]["set_id"] == friday["id"]
        )
        act(
            engine,
            "chapters/create",
            {"set_id": friday["id"], "name": "Top", "position": 0},
        )
        act(
            engine,
            "chapters/create",
            {
                "set_id": friday["id"],
                "name": "Mid",
                "after_chapter_id": end["chapter"]["id"],
            },
        )
        assert self.names(engine, friday["id"]) == ["Top", "", "Close", "Mid"]

    def test_create_refusals(self, engine, friday):  # noqa: F811
        before = everything(friday["id"])
        (chapter,) = the_plan(engine, friday["id"])["chapters"]
        error = refused(
            engine,
            "chapters/create",
            {"set_id": friday["id"], "position": 0, "after_chapter_id": chapter["id"]},
            400,
            "INVALID_REQUEST",
        )
        assert "not both" in error["message"]
        refused(
            engine,
            "chapters/create",
            {"set_id": friday["id"], "position": -1},
            400,
            "INVALID_REQUEST",
        )
        error = refused(
            engine,
            "chapters/create",
            {"set_id": friday["id"], "after_chapter_id": 99999},
            404,
            "SET_NOT_FOUND",
        )
        assert error["reason"] == "chapter"
        refused(engine, "chapters/create", {"set_id": 99999}, 404, "SET_NOT_FOUND")
        assert everything(friday["id"]) == before

    def test_update_writes_the_dialog_in_one_go(self, engine, friday):  # noqa: F811
        (chapter,) = the_plan(engine, friday["id"])["chapters"]
        updated = act(
            engine,
            "chapters/update",
            {
                "chapter_id": chapter["id"],
                "name": "Warm-up",
                "notes": "Slow start",
                "target": "45:00",
                "bpm_min": 120,
                "bpm_max": 126.5,
            },
        )["chapter"]
        assert (
            updated["name"],
            updated["notes"],
            updated["target_seconds"],
            updated["bpm_min"],
            updated["bpm_max"],
        ) == ("Warm-up", "Slow start", 2700, 120.0, 126.5)
        # Only what is sent changes; a blank target clears it.
        again = act(
            engine, "chapters/update", {"chapter_id": chapter["id"], "target": ""}
        )["chapter"]
        assert (again["name"], again["target_seconds"], again["bpm_max"]) == (
            "Warm-up",
            None,
            126.5,
        )
        cleared = act(
            engine,
            "chapters/update",
            {"chapter_id": chapter["id"], "name": None, "bpm_min": None},
        )["chapter"]
        assert (cleared["name"], cleared["bpm_min"]) == ("", None)

    @pytest.mark.parametrize(
        "change, words",
        [
            ({"target": "45"}, ""),
            ({"target": "100:00:00"}, ""),
            ({"target": 2700}, "target must be text"),
            ({"bpm_min": 130, "bpm_max": 120}, "run upwards"),
            ({"bpm_min": "fast"}, "bpm_min must be a number"),
            ({"bpm_max": True}, "bpm_max must be a number"),
            ({"name": "x" * 121}, "at most 120"),
            ({"colour": "red"}, "Unknown field 'colour'"),
            ({}, "Nothing to change"),
        ],
    )
    def test_a_refused_update_changes_nothing(self, engine, friday, change, words):  # noqa: F811
        (chapter,) = the_plan(engine, friday["id"])["chapters"]
        before = everything(friday["id"])
        # A name beside a refused value proves the name is not written either.
        renamed = {"name": "Renamed"} if change else {}
        body = {"chapter_id": chapter["id"], **renamed, **change}
        error = refused(engine, "chapters/update", body, 400, "INVALID_REQUEST")
        assert words in error["message"]
        assert everything(friday["id"]) == before

    def test_update_of_a_chapter_that_is_gone(self, engine, friday):  # noqa: F811
        error = refused(
            engine,
            "chapters/update",
            {"chapter_id": 99999, "name": "X"},
            404,
            "SET_NOT_FOUND",
        )
        assert error["reason"] == "chapter"

    def test_move_takes_its_entries_with_it(self, engine, friday, ids):  # noqa: F811
        peak = split(engine, friday["id"], 2, "Peak")
        moved = act(engine, "chapters/move", {"chapter_id": peak["id"], "position": 0})
        assert moved["chapter"]["position"] == 0
        plan = the_plan(engine, friday["id"])
        assert [e["track_id"] for e in plan["entries"]] == [
            ids[2],
            ids[3],
            ids[0],
            ids[0],
            ids[1],
        ]

    def test_move_refusals(self, engine, friday):  # noqa: F811
        (chapter,) = the_plan(engine, friday["id"])["chapters"]
        refused(
            engine,
            "chapters/move",
            {"chapter_id": chapter["id"]},
            400,
            "INVALID_REQUEST",
        )
        refused(
            engine,
            "chapters/move",
            {"chapter_id": chapter["id"], "position": -1},
            400,
            "INVALID_REQUEST",
        )
        refused(
            engine,
            "chapters/move",
            {"chapter_id": 99999, "position": 0},
            404,
            "SET_NOT_FOUND",
        )

    def test_delete_answers_the_chapter_its_entries_joined(self, engine, friday):  # noqa: F811
        peak = split(engine, friday["id"], 2, "Peak")
        (warm, _) = the_plan(engine, friday["id"])["chapters"]
        answer = act(engine, "chapters/delete", {"chapter_id": peak["id"]})
        assert answer["deleted_chapter_id"] == peak["id"]
        assert answer["joined"]["id"] == warm["id"]
        assert len(the_plan(engine, friday["id"])["chapters"]) == 1

    def test_the_only_chapter_cannot_be_deleted(self, engine, friday):  # noqa: F811
        (chapter,) = the_plan(engine, friday["id"])["chapters"]
        before = everything(friday["id"])
        refused(
            engine,
            "chapters/delete",
            {"chapter_id": chapter["id"]},
            400,
            "INVALID_REQUEST",
        )
        refused(engine, "chapters/delete", {"chapter_id": 99999}, 404, "SET_NOT_FOUND")
        assert everything(friday["id"]) == before

    def test_split(self, engine, friday):  # noqa: F811
        peak = split(engine, friday["id"], 2, "Peak")
        assert (peak["name"], peak["position"]) == ("Peak", 1)
        chapters = the_plan(engine, friday["id"])["chapters"]
        assert [len(c["entry_ids"]) for c in chapters] == [2, 3]

    def test_split_refusals(self, engine, friday, ids):  # noqa: F811
        first = entry_ids(engine, friday["id"])[0]
        error = refused(
            engine, "chapters/split", {"entry_id": first}, 400, "INVALID_REQUEST"
        )
        assert "rename" in error["message"].lower()
        error = refused(
            engine, "chapters/split", {"entry_id": 99999}, 404, "SET_NOT_FOUND"
        )
        assert error["reason"] == "entry"
        crate = ok(
            engine,
            "/api/v1/collections/create",
            {"kind": "collection", "name": "Crate"},
        )["collection"]
        entry = ok(
            engine,
            "/api/v1/collections/tracks/insert",
            {"collection_id": crate["id"], "track_id": ids[0], "position": 0},
        )["entry"]
        error = refused(
            engine, "chapters/split", {"entry_id": entry["id"]}, 404, "SET_NOT_FOUND"
        )
        assert error["reason"] == "entry"


class TestEntries:
    def test_a_move_onto_a_boundary_keeps_its_chapter_unless_one_is_named(
        self,
        engine,  # noqa: F811
        friday,
    ):
        peak = split(engine, friday["id"], 2, "Peak")
        (warm, _) = the_plan(engine, friday["id"])["chapters"]
        last = entry_ids(engine, friday["id"])[4]
        # Place 2 is between the chapters, so either reaches it (PREP-02).
        moved = act(engine, "entries/move", {"entry_id": last, "position": 2})
        assert (moved["entry"]["id"], moved["entry"]["position"]) == (last, 2)
        assert moved["chapter_id"] == peak["id"]
        moved = act(
            engine,
            "entries/move",
            {"entry_id": last, "position": 2, "chapter_id": warm["id"]},
        )
        assert moved["chapter_id"] == warm["id"]
        assert [
            len(c["entry_ids"]) for c in the_plan(engine, friday["id"])["chapters"]
        ] == [
            3,
            2,
        ]

    def test_move_refusals(self, engine, friday):  # noqa: F811
        entries = entry_ids(engine, friday["id"])
        other = act(engine, "create", {"name": "Other"})["set"]
        (theirs,) = the_plan(engine, other["id"])["chapters"]
        before = everything(friday["id"])
        refused(
            engine, "entries/move", {"entry_id": entries[0]}, 400, "INVALID_REQUEST"
        )
        refused(
            engine,
            "entries/move",
            {"entry_id": entries[0], "position": 1, "chapter_id": theirs["id"]},
            400,
            "INVALID_REQUEST",
        )
        refused(
            engine,
            "entries/move",
            {"entry_id": entries[0], "position": 1, "chapter_id": 99999},
            404,
            "SET_NOT_FOUND",
        )
        refused(
            engine,
            "entries/move",
            {"entry_id": 99999, "position": 1},
            404,
            "SET_NOT_FOUND",
        )
        assert everything(friday["id"]) == before

    def test_an_insert_names_its_chapter(self, engine, friday, ids):  # noqa: F811
        peak = split(engine, friday["id"], 2, "Peak")
        (warm, _) = the_plan(engine, friday["id"])["chapters"]

        def chapter_of(entry: dict) -> int:
            plan = the_plan(engine, friday["id"])
            (found,) = [e for e in plan["entries"] if e["entry_id"] == entry["id"]]
            return int(found["chapter_id"])

        plain = ok(
            engine,
            "/api/v1/collections/tracks/insert",
            {"collection_id": friday["id"], "track_id": ids[5], "position": 2},
        )["entry"]
        assert chapter_of(plain) == warm["id"]
        named = ok(
            engine,
            "/api/v1/collections/tracks/insert",
            {
                "collection_id": friday["id"],
                "track_id": ids[5],
                "position": 3,
                "chapter_id": peak["id"],
            },
        )["entry"]
        assert chapter_of(named) == peak["id"]

    def test_times_are_typed_and_written_as_a_pair(self, engine, friday):  # noqa: F811
        first = entry_ids(engine, friday["id"])[0]
        planned = act(
            engine,
            "entries/times",
            {"entry_id": first, "in_time": "1:00", "out_time": "4:30"},
        )["plan"]
        assert (
            planned["entry_id"],
            planned["set_id"],
            planned["in_seconds"],
            planned["out_seconds"],
            planned["planned_seconds"],
        ) == (first, friday["id"], 60, 270, 210)
        cleared = act(
            engine,
            "entries/times",
            {"entry_id": first, "in_time": None, "out_time": ""},
        )["plan"]
        assert (cleared["in_seconds"], cleared["out_seconds"]) == (None, None)
        assert cleared["planned_seconds"] is None

    @pytest.mark.parametrize(
        "body, words",
        [
            ({"in_time": "1:00"}, "out_time is required"),
            ({"out_time": "4:00"}, "in_time is required"),
            ({"in_time": "1:00", "out_time": "4:75"}, ""),
            ({"in_time": "4:00", "out_time": "1:00"}, "come in before it goes out"),
            ({"in_time": None, "out_time": "5:01"}, "5:00 long"),
            ({"in_time": 60, "out_time": "4:00"}, "in_time must be text"),
            ({"in_time": None, "out_time": None, "note": "x"}, "Unknown field 'note'"),
        ],
    )
    def test_refused_times_write_nothing(self, engine, friday, body, words):  # noqa: F811
        first = entry_ids(engine, friday["id"])[0]
        act(
            engine,
            "entries/times",
            {"entry_id": first, "in_time": "0:10", "out_time": "3:00"},
        )
        before = everything(friday["id"])
        error = refused(
            engine, "entries/times", {"entry_id": first, **body}, 400, "INVALID_REQUEST"
        )
        assert words in error["message"]
        assert everything(friday["id"]) == before

    def test_times_of_an_entry_that_is_gone(self, engine, friday):  # noqa: F811
        refused(
            engine,
            "entries/times",
            {"entry_id": 99999, "in_time": None, "out_time": None},
            404,
            "SET_NOT_FOUND",
        )

    def test_a_note(self, engine, friday):  # noqa: F811
        first = entry_ids(engine, friday["id"])[0]
        assert (
            act(engine, "entries/note", {"entry_id": first, "note": "loop it"})["plan"][
                "note"
            ]
            == "loop it"
        )
        assert (
            act(engine, "entries/note", {"entry_id": first, "note": " "})["plan"][
                "note"
            ]
            is None
        )
        refused(engine, "entries/note", {"entry_id": first}, 400, "INVALID_REQUEST")
        refused(
            engine,
            "entries/note",
            {"entry_id": 99999, "note": "x"},
            404,
            "SET_NOT_FOUND",
        )


class TestWarnings:
    def jump(self, engine_url: str, set_id: int) -> dict:
        analysis = read(engine_url, "analysis", set_id=set_id)
        for transition in analysis["transitions"]:
            for warning in transition["warnings"]:
                if warning["kind"] == "tempo_jump":
                    return {
                        "from_entry_id": transition["from_entry_id"],
                        "to_entry_id": transition["to_entry_id"],
                        "warning": "tempo_jump",
                    }
        raise AssertionError("no tempo jump")

    def test_acknowledge_and_withdraw(self, engine, friday):  # noqa: F811
        transition = self.jump(engine, friday["id"])
        before = read(engine, "analysis", set_id=friday["id"])["counts"]["tempo_jump"]
        made = act(engine, "acknowledge", transition)["acknowledgement"]
        assert (made["set_id"], made["warning"]) == (friday["id"], "tempo_jump")
        assert made["from_entry_id"] == transition["from_entry_id"]
        assert isinstance(made["compared"], dict) and "percent" in made["compared"]
        after = read(engine, "analysis", set_id=friday["id"])
        assert after["counts"].get("tempo_jump", 0) == before - 1
        assert after["acknowledged"] == 1
        assert act(engine, "unacknowledge", transition) == {"removed": True}
        assert act(engine, "unacknowledge", transition) == {"removed": False}

    def test_refusals(self, engine, friday):  # noqa: F811
        transition = self.jump(engine, friday["id"])
        refused(
            engine,
            "acknowledge",
            {**transition, "warning": "tempo_unknown"},
            400,
            "INVALID_REQUEST",
        )
        refused(
            engine, "acknowledge", {**transition, "warning": ""}, 400, "INVALID_REQUEST"
        )
        error = refused(
            engine,
            "acknowledge",
            {**transition, "to_entry_id": 99999},
            404,
            "SET_NOT_FOUND",
        )
        assert error["reason"] == "entry"
        refused(
            engine,
            "unacknowledge",
            {**transition, "from_entry_id": 99999},
            404,
            "SET_NOT_FOUND",
        )
        assert read(engine, "analysis", set_id=friday["id"])["acknowledged"] == 0


class TestSavingASetList:
    def test_saved_where_the_dialog_chose(self, engine, friday, tmp_path):  # noqa: F811
        target = tmp_path / "Friday 2026-09-29.txt"
        saved = act(
            engine,
            "set-list/save",
            {"set_id": friday["id"], "destination_path": str(target)},
        )["saved"]
        assert saved == {
            "set_id": friday["id"],
            "path": str(target),
            "format": "text",
            "entries": 5,
            "missing_files": 0,
            "untimed": 5,
            "bytes_written": target.stat().st_size,
        }
        assert target.read_text(encoding="utf-8").startswith("Friday")

    @pytest.mark.parametrize(
        "name, form", [("list.csv", "csv"), ("list.M3U8", "m3u8"), ("list.TXT", "text")]
    )
    def test_each_form_by_its_extension(self, engine, friday, tmp_path, name, form):  # noqa: F811
        saved = act(
            engine,
            "set-list/save",
            {"set_id": friday["id"], "destination_path": str(tmp_path / name)},
        )["saved"]
        assert saved["format"] == form

    def test_each_destination_refusal_with_its_reason(self, engine, friday, tmp_path):  # noqa: F811
        cases = [
            ("", "destination_blank", None),
            (
                str(tmp_path / "list.xml"),
                "destination_not_set_list",
                tmp_path / "list.xml",
            ),
            (
                str(tmp_path / "folder.txt"),
                "destination_is_folder",
                tmp_path / "folder.txt",
            ),
            (
                str(tmp_path / "gone" / "list.txt"),
                "destination_folder_missing",
                tmp_path / "gone" / "list.txt",
            ),
        ]
        (tmp_path / "folder.txt").mkdir()
        for path, reason, echoed in cases:
            error = refused(
                engine,
                "set-list/save",
                {"set_id": friday["id"], "destination_path": path},
                400,
                "SET_LIST_DESTINATION_REFUSED",
            )
            assert error["reason"] == reason
            assert error["path"] == (None if echoed is None else str(echoed))
        written = sorted(
            name for name in os.listdir(tmp_path) if not name.startswith("cuepoint.db")
        )
        assert written == ["folder.txt"]

    def test_a_missing_destination_is_blank(self, engine, friday):  # noqa: F811
        error = refused(
            engine,
            "set-list/save",
            {"set_id": friday["id"]},
            400,
            "SET_LIST_DESTINATION_REFUSED",
        )
        assert error["reason"] == "destination_blank"

    def test_a_file_system_that_will_not_write(
        self,
        engine,  # noqa: F811
        friday,
        tmp_path,
        monkeypatch,
    ):
        from cuepoint.services import set_list_service

        def refuse(*_args, **_kwargs):
            raise PermissionError(13, "Permission denied")

        monkeypatch.setattr(set_list_service, "write_set_list", refuse)
        target = tmp_path / "list.txt"
        error = refused(
            engine,
            "set-list/save",
            {"set_id": friday["id"], "destination_path": str(target)},
            500,
            "SET_LIST_WRITE_FAILED",
        )
        assert error["path"] == str(target)
        assert (
            "Permission denied" in error["message"] and str(target) in error["message"]
        )
        assert not target.exists()

    def test_other_refusals(self, engine, friday, tmp_path):  # noqa: F811
        path = str(tmp_path / "list.txt")
        refused(
            engine,
            "set-list/save",
            {"set_id": 99999, "destination_path": path},
            404,
            "SET_NOT_FOUND",
        )
        refused(
            engine,
            "set-list/save",
            {"set_id": friday["id"], "destination_path": 7},
            400,
            "INVALID_REQUEST",
        )
        assert not Path(path).exists()


class TestTheRefusalMap:
    """``status_for`` on its own, for what a live engine cannot easily cause."""

    def test_a_typed_refusal_keeps_its_reason(self):
        from cuepoint.services.set_list_service import SetListDestinationError
        from cuepoint.services.set_suggestion_service import InsertionPointError

        status, payload = api.status_for(InsertionPointError("stale", "moved"))
        assert status == 409
        assert payload == {
            "error": {
                "code": "SET_INSERTION_POINT_REFUSED",
                "message": "moved",
                "reason": "stale",
            }
        }
        assert api.status_for(InsertionPointError("no_neighbour", "x"))[0] == 400
        assert api.status_for(InsertionPointError("empty_set", "x"))[0] == 409
        status, payload = api.status_for(
            SetListDestinationError("destination_blank", "Choose", None)
        )
        assert (status, payload["error"]["reason"]) == (400, "destination_blank")

    def test_the_rest(self):
        from cuepoint.models.set_plan import SetIntegrityError, SetLimitError

        assert api.status_for(SetLimitError("F", 999, 2))[1]["error"]["code"] == (
            "INVALID_REQUEST"
        )
        assert api.status_for(ValueError("no"))[0] == 400
        assert api.status_for(api.SetsUnavailableError("db"))[0] == 503
        status, payload = api.status_for(SetIntegrityError("bug"))
        assert (status, payload["error"]["code"]) == (500, "SETS_FAILED")
        error = ApiError(404, "SET_NOT_FOUND", "gone", reason="set")
        assert api.status_for(error) == (404, error.payload())

    def test_every_code_it_can_give_is_a_refusal_code(self):
        assert set(api.REFUSAL_CODES) == {
            "INVALID_REQUEST",
            "SET_NOT_FOUND",
            "SET_INSERTION_POINT_REFUSED",
            "SET_LIST_DESTINATION_REFUSED",
            "SET_LIST_WRITE_FAILED",
        }
