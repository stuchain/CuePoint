#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""CuePoint's organization over HTTP (ORG-08).

Twenty routes and two extended ones. What is worth testing here is not that the
services work — ORG-02 through ORG-07 have four hundred tests for that — but the
three things only this layer can get wrong.

**A refusal arrives as a refusal.** Every service in this phase says no with a
``ValueError`` carrying a message a user can act on. Reaching HTTP as a 500 with
a stack trace would throw that message away and tell the user their app is
broken instead of that their request is. So every route is asked for something
it cannot do, and the status and the message are both asserted.

**The shape is a contract.** Field lists are explicit on purpose, so that adding
a column to a table is never accidentally a public change. These tests spell the
shapes out; a field added without thinking fails here.

**The scope is the same query path.** DEC-023 says browsing is one path with
more parameters. A Smart Collection scope must therefore return exactly what the
same rules return sent as filters — asserted directly, because the way that
stops being true is a second path built "just for saved rules".

Everything runs against a temporary database and a fresh DI container; the
user's real ``~/.cuepoint/cuepoint.db`` is never opened.
"""

from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request

import pytest

from cuepoint.models.library_track import LibraryTrack
from tests.unit.engine.test_engine_library_browse import (
    TOKEN,
    engine,  # noqa: F401 — a pytest fixture, used by name
    get_json,
    library_db,  # noqa: F401 — a pytest fixture, used by name
)

TRACK_COUNT = 8


# --------------------------------------------------------------------- client


def post(base: str, path: str, body=None) -> tuple:
    """POST JSON and return ``(status, payload)``, error or not."""
    data = json.dumps(body if body is not None else {}).encode("utf-8")
    request = urllib.request.Request(
        f"{base}{path}",
        data=data,
        headers={
            "Authorization": f"Bearer {TOKEN}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=10) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        return exc.code, json.loads(exc.read().decode("utf-8"))


def ok(base: str, path: str, body=None) -> dict:
    """POST, insisting it succeeded."""
    status, payload = post(base, path, body)
    assert status in (200, 202), (status, payload)
    return payload


def get_status(base: str, path: str, **params) -> tuple:
    """GET and return ``(status, payload)``, error or not."""
    query = urllib.parse.urlencode({k: v for k, v in params.items() if v is not None})
    url = f"{base}{path}" + (f"?{query}" if query else "")
    request = urllib.request.Request(
        url, headers={"Authorization": f"Bearer {TOKEN}"}, method="GET"
    )
    try:
        with urllib.request.urlopen(request, timeout=10) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        return exc.code, json.loads(exc.read().decode("utf-8"))


# -------------------------------------------------------------------- fixtures


@pytest.fixture
def tracks(library_db):  # noqa: F811 — the fixture is used by name
    """Eight tracks, half of them Techno, through the real repository."""
    from cuepoint.services.interfaces import ITrackRepository
    from cuepoint.utils.di_container import get_container

    repo = get_container().resolve(ITrackRepository)
    repo.add_many(
        [
            LibraryTrack(
                rekordbox_track_id=str(i),
                file_path=f"/music/{i}.mp3",
                title=f"Track {i}",
                artist=f"Artist {i % 2}",
                genre="Techno" if i % 2 else "House",
                rating=i % 6 if i % 3 else None,
            )
            for i in range(1, TRACK_COUNT + 1)
        ]
    )
    return repo


@pytest.fixture
def ids(tracks):
    """Every track id, in library order."""
    from cuepoint.persistence.track_query import BrowseQuery

    return tracks.browse_ids(BrowseQuery(sort="title"))


@pytest.fixture
def warmups(engine, tracks):  # noqa: F811 — the fixture is used by name
    """A Collection at the top of the tree."""
    return ok(
        engine, "/api/v1/collections/create", {"kind": "collection", "name": "Warmups"}
    )["collection"]


@pytest.fixture
def peak(engine, tracks):  # noqa: F811 — the fixture is used by name
    """A tag."""
    return ok(engine, "/api/v1/tags/create", {"name": "Peak time"})["tag"]


TECHNO = {
    "match": "all",
    "rules": [{"field": "genre", "operator": "is", "value": "Techno"}],
}


# ---------------------------------------------------------------------------


@pytest.mark.unit
class TestTheTree:
    def test_an_empty_library_has_an_empty_tree(self, engine, tracks):  # noqa: F811
        assert get_json(engine, "/api/v1/collections") == {
            "collections": [],
            "total": 0,
        }

    def test_a_created_collection_is_in_it(self, engine, warmups):  # noqa: F811
        payload = get_json(engine, "/api/v1/collections")
        assert payload["total"] == 1
        assert payload["collections"][0]["name"] == "Warmups"

    def test_a_node_carries_the_documented_shape(self, engine, warmups):  # noqa: F811
        (node,) = get_json(engine, "/api/v1/collections")["collections"]
        assert set(node) == {
            "id",
            "parent_id",
            "kind",
            "name",
            "position",
            "depth",
            "rules",
            "sort",
            "dir",
            "frozen_from_id",
            "frozen_at",
            "entry_count",
            "track_count",
            "broken",
            "problem",
            "created_at",
            "updated_at",
        }

    def test_counts_come_back_with_the_tree(self, engine, warmups, ids):  # noqa: F811
        ok(
            engine,
            "/api/v1/collections/tracks/add",
            {"collection_id": warmups["id"], "track_ids": ids[:3]},
        )
        (node,) = get_json(engine, "/api/v1/collections")["collections"]
        assert (node["entry_count"], node["track_count"]) == (3, 3)

    def test_entries_and_tracks_differ_when_a_track_is_filed_twice(
        self,
        engine,  # noqa: F811
        warmups,
        ids,
    ):
        """DEC-058's duplicate, visible in the two counts."""
        ok(
            engine,
            "/api/v1/collections/tracks/add",
            {"collection_id": warmups["id"], "track_ids": ids[:2]},
        )
        ok(
            engine,
            "/api/v1/collections/tracks/insert",
            {"collection_id": warmups["id"], "track_id": ids[0], "position": 0},
        )
        (node,) = get_json(engine, "/api/v1/collections")["collections"]
        assert (node["entry_count"], node["track_count"]) == (3, 2)

    def test_a_folder_holds_a_collection(self, engine, tracks):  # noqa: F811
        folder = ok(
            engine, "/api/v1/collections/create", {"kind": "folder", "name": "Sets"}
        )["collection"]
        child = ok(
            engine,
            "/api/v1/collections/create",
            {"kind": "collection", "name": "Peak", "parent_id": folder["id"]},
        )["collection"]
        assert child["parent_id"] == folder["id"]
        assert child["depth"] == 1

    def test_a_smart_collection_cannot_be_created_here(self, engine, tracks):  # noqa: F811
        status, payload = post(
            engine, "/api/v1/collections/create", {"kind": "smart", "name": "Techno"}
        )
        assert status == 400
        assert (
            "smart collection is created by saving its rules"
            in payload["error"]["message"]
        )

    def test_a_missing_name_is_refused(self, engine, tracks):  # noqa: F811
        status, payload = post(engine, "/api/v1/collections/create", {"kind": "folder"})
        assert status == 400
        assert "name" in payload["error"]["message"]

    def test_a_body_that_is_not_an_object_is_refused(self, engine, tracks):  # noqa: F811
        """And says so, rather than complaining about a field it never had.

        A list has no "kind", so the refusal happens either way — the message
        is the whole difference, and "JSON body must be an object" is the one a
        caller can act on.
        """
        status, payload = post(engine, "/api/v1/collections/create", [1, 2, 3])
        assert status == 400
        assert payload["error"]["message"] == "JSON body must be an object"


@pytest.mark.unit
class TestTreeMutation:
    def test_rename(self, engine, warmups):  # noqa: F811
        renamed = ok(
            engine,
            "/api/v1/collections/rename",
            {"id": warmups["id"], "name": "Openers"},
        )["collection"]
        assert renamed["name"] == "Openers"

    def test_rename_refuses_an_empty_name(self, engine, warmups):  # noqa: F811
        status, payload = post(
            engine, "/api/v1/collections/rename", {"id": warmups["id"], "name": "   "}
        )
        assert status == 400
        assert payload["error"]["message"] == (
            "name is required and must be a non-empty string"
        )

    def test_move_into_a_folder(self, engine, warmups):  # noqa: F811
        folder = ok(
            engine, "/api/v1/collections/create", {"kind": "folder", "name": "Sets"}
        )["collection"]
        moved = ok(
            engine,
            "/api/v1/collections/move",
            {"id": warmups["id"], "parent_id": folder["id"]},
        )["collection"]
        assert moved["parent_id"] == folder["id"]

    def test_move_into_a_collection_is_refused(self, engine, warmups):  # noqa: F811
        """Only a folder may be a parent (ORG-04), and the refusal is the
        service's own message rather than a 500."""
        other = ok(
            engine,
            "/api/v1/collections/create",
            {"kind": "collection", "name": "Other"},
        )["collection"]
        status, payload = post(
            engine,
            "/api/v1/collections/move",
            {"id": warmups["id"], "parent_id": other["id"]},
        )
        assert status == 400
        assert "folder" in payload["error"]["message"].lower()

    def test_delete_echoes_what_it_removed(self, engine, warmups, ids):  # noqa: F811
        ok(
            engine,
            "/api/v1/collections/tracks/add",
            {"collection_id": warmups["id"], "track_ids": ids[:4]},
        )
        removed = ok(engine, "/api/v1/collections/delete", {"id": warmups["id"]})[
            "removed"
        ]
        assert removed == {
            "folders": 0,
            "collections": 1,
            "smart_collections": 0,
            "entries": 4,
            "nodes": 1,
        }
        assert get_json(engine, "/api/v1/collections")["total"] == 0

    def test_delete_preview_says_the_same_and_removes_nothing(
        self,
        engine,  # noqa: F811
        warmups,
        ids,
    ):
        ok(
            engine,
            "/api/v1/collections/tracks/add",
            {"collection_id": warmups["id"], "track_ids": ids[:4]},
        )
        preview = ok(
            engine, "/api/v1/collections/delete/preview", {"id": warmups["id"]}
        )
        assert preview["removes"]["entries"] == 4
        assert get_json(engine, "/api/v1/collections")["total"] == 1

    def test_deleting_a_node_that_is_not_there_is_refused_not_crashed(
        self,
        engine,  # noqa: F811
        tracks,
    ):
        status, payload = post(engine, "/api/v1/collections/delete", {"id": 4242})
        assert status == 400
        assert "4242" in payload["error"]["message"]

    def test_an_id_that_is_not_a_number_is_refused(self, engine, tracks):  # noqa: F811
        status, payload = post(
            engine, "/api/v1/collections/delete", {"id": "the first one"}
        )
        assert status == 400
        assert payload["error"]["code"] == "INVALID_REQUEST"

    def test_no_track_is_deleted_with_a_collection(self, engine, warmups, ids):  # noqa: F811
        ok(
            engine,
            "/api/v1/collections/tracks/add",
            {"collection_id": warmups["id"], "track_ids": ids},
        )
        ok(engine, "/api/v1/collections/delete", {"id": warmups["id"]})
        assert get_json(engine, "/api/v1/library/summary")["track_count"] == TRACK_COUNT


@pytest.mark.unit
class TestMembership:
    def test_add_reports_what_was_already_there(self, engine, warmups, ids):  # noqa: F811
        ok(
            engine,
            "/api/v1/collections/tracks/add",
            {"collection_id": warmups["id"], "track_ids": ids[:2]},
        )
        again = ok(
            engine,
            "/api/v1/collections/tracks/add",
            {"collection_id": warmups["id"], "track_ids": ids[:4]},
        )
        assert (again["added"], again["skipped"]) == (2, 2)
        assert again["added_track_ids"] == ids[2:4]

    def test_entries_come_back_in_order_with_their_ids(
        self,
        engine,  # noqa: F811
        warmups,
        ids,
    ):
        ok(
            engine,
            "/api/v1/collections/tracks/add",
            {"collection_id": warmups["id"], "track_ids": ids[:3]},
        )
        payload = get_json(
            engine, "/api/v1/collections/entries", collection_id=warmups["id"]
        )
        assert [entry["track_id"] for entry in payload["entries"]] == ids[:3]
        assert [entry["position"] for entry in payload["entries"]] == [0, 1, 2]
        assert set(payload["entries"][0]) == {
            "id",
            "collection_id",
            "track_id",
            "position",
            "added_at",
        }

    def test_remove_is_by_entry_id(self, engine, warmups, ids):  # noqa: F811
        ok(
            engine,
            "/api/v1/collections/tracks/add",
            {"collection_id": warmups["id"], "track_ids": ids[:3]},
        )
        entries = get_json(
            engine, "/api/v1/collections/entries", collection_id=warmups["id"]
        )["entries"]
        removed = ok(
            engine,
            "/api/v1/collections/tracks/remove",
            {"entry_ids": [entries[1]["id"]]},
        )
        assert removed["removed"] == 1
        left = get_json(
            engine, "/api/v1/collections/entries", collection_id=warmups["id"]
        )["entries"]
        assert [entry["track_id"] for entry in left] == [ids[0], ids[2]]
        assert [entry["position"] for entry in left] == [0, 1]

    def test_reorder_moves_one_entry(self, engine, warmups, ids):  # noqa: F811
        ok(
            engine,
            "/api/v1/collections/tracks/add",
            {"collection_id": warmups["id"], "track_ids": ids[:3]},
        )
        entries = get_json(
            engine, "/api/v1/collections/entries", collection_id=warmups["id"]
        )["entries"]
        ok(
            engine,
            "/api/v1/collections/tracks/reorder",
            {"entry_id": entries[2]["id"], "position": 0},
        )
        moved = get_json(
            engine, "/api/v1/collections/entries", collection_id=warmups["id"]
        )["entries"]
        assert [entry["track_id"] for entry in moved] == [ids[2], ids[0], ids[1]]

    def test_adding_to_a_folder_is_refused(self, engine, tracks, ids):  # noqa: F811
        folder = ok(
            engine, "/api/v1/collections/create", {"kind": "folder", "name": "Sets"}
        )["collection"]
        status, payload = post(
            engine,
            "/api/v1/collections/tracks/add",
            {"collection_id": folder["id"], "track_ids": ids[:1]},
        )
        assert status == 400
        assert payload["error"]["code"] == "INVALID_REQUEST"

    def test_an_empty_track_list_is_refused(self, engine, warmups):  # noqa: F811
        status, payload = post(
            engine,
            "/api/v1/collections/tracks/add",
            {"collection_id": warmups["id"], "track_ids": []},
        )
        assert status == 400
        assert "non-empty list" in payload["error"]["message"]

    def test_a_track_list_of_words_is_refused(self, engine, warmups):  # noqa: F811
        """Naming the field, not reporting Python's opinion of the value."""
        status, payload = post(
            engine,
            "/api/v1/collections/tracks/add",
            {"collection_id": warmups["id"], "track_ids": ["one", "two"]},
        )
        assert status == 400
        assert payload["error"]["message"] == "track_ids must hold numbers, not 'one'"

    def test_true_is_not_an_id(self, engine, warmups):  # noqa: F811
        """A bool is an int in Python, and "collection true" is not an id."""
        status, payload = post(
            engine,
            "/api/v1/collections/tracks/add",
            {"collection_id": True, "track_ids": [1]},
        )
        assert status == 400
        assert "collection_id" in payload["error"]["message"]


@pytest.mark.unit
class TestSmartCollections:
    def test_saving_rules_makes_a_smart_collection(self, engine, tracks):  # noqa: F811
        node = ok(
            engine,
            "/api/v1/collections/smart/save",
            {"name": "Techno", "rules": TECHNO},
        )["collection"]
        assert node["kind"] == "smart"
        assert node["rules"]["rules"][0]["field"] == "genre"
        assert node["broken"] is False

    def test_an_empty_rule_set_is_refused(self, engine, tracks):  # noqa: F811
        """A filter with no rules is the whole library, which is the Library
        page (ORG-06)."""
        status, payload = post(
            engine,
            "/api/v1/collections/smart/save",
            {"name": "Everything", "rules": {"match": "all", "rules": []}},
        )
        assert status == 400
        assert "at least one rule" in payload["error"]["message"]

    def test_rules_that_are_not_a_rule_set_are_refused(self, engine, tracks):  # noqa: F811
        status, payload = post(
            engine,
            "/api/v1/collections/smart/save",
            {"name": "Nonsense", "rules": "genre is techno"},
        )
        assert status == 400
        assert "rule set" in payload["error"]["message"]

    def test_a_rule_naming_a_missing_tag_is_refused_by_the_clause(
        self,
        engine,  # noqa: F811
        tracks,
    ):
        status, payload = post(
            engine,
            "/api/v1/collections/smart/save",
            {
                "name": "Gone",
                "rules": {
                    "match": "all",
                    "rules": [{"field": "tag", "operator": "has_tag", "value": 999}],
                },
            },
        )
        assert status == 400
        assert "tag" in payload["error"]["message"].lower()

    def test_updating_replaces_the_rules(self, engine, tracks):  # noqa: F811
        node = ok(
            engine,
            "/api/v1/collections/smart/save",
            {"name": "Techno", "rules": TECHNO},
        )["collection"]
        house = {
            "match": "all",
            "rules": [{"field": "genre", "operator": "is", "value": "House"}],
        }
        updated = ok(
            engine,
            "/api/v1/collections/smart/update",
            {"id": node["id"], "rules": house},
        )["collection"]
        assert updated["rules"]["rules"][0]["value"] == "House"

    def test_duplicating_makes_an_independent_copy(self, engine, tracks):  # noqa: F811
        node = ok(
            engine,
            "/api/v1/collections/smart/save",
            {"name": "Techno", "rules": TECHNO},
        )["collection"]
        copy = ok(engine, "/api/v1/collections/smart/duplicate", {"id": node["id"]})[
            "collection"
        ]
        assert copy["id"] != node["id"]
        assert copy["name"] == "Techno copy"
        assert copy["rules"] == node["rules"]

    def test_freezing_stores_todays_answer(self, engine, tracks):  # noqa: F811
        node = ok(
            engine,
            "/api/v1/collections/smart/save",
            {"name": "Techno", "rules": TECHNO},
        )["collection"]
        frozen = ok(engine, "/api/v1/collections/smart/freeze", {"id": node["id"]})
        assert frozen["track_count"] == TRACK_COUNT // 2
        assert frozen["collection"]["kind"] == "collection"
        assert frozen["collection"]["frozen_from_id"] == node["id"]
        assert frozen["source_name"] == "Techno"

    def test_a_broken_smart_collection_is_drawn_as_broken(
        self,
        engine,  # noqa: F811
        tracks,
        peak,
        ids,
    ):
        """The tree still draws it, with the reason (ORG-06, ORG-09)."""
        node = ok(
            engine,
            "/api/v1/collections/smart/save",
            {
                "name": "Peak time",
                "rules": {
                    "match": "all",
                    "rules": [
                        {"field": "tag", "operator": "has_tag", "value": peak["id"]}
                    ],
                },
            },
        )["collection"]
        ok(engine, "/api/v1/tags/delete", {"id": peak["id"]})

        found = {
            row["id"]: row
            for row in get_json(engine, "/api/v1/collections")["collections"]
        }
        assert found[node["id"]]["broken"] is True
        assert "tag" in found[node["id"]]["problem"].lower()

    def test_membership_is_refused_on_a_smart_collection(
        self,
        engine,  # noqa: F811
        tracks,
        ids,
    ):
        """DEC-061: it holds a question, and rows against it would be a second
        answer to it."""
        node = ok(
            engine,
            "/api/v1/collections/smart/save",
            {"name": "Techno", "rules": TECHNO},
        )["collection"]
        status, _ = post(
            engine,
            "/api/v1/collections/tracks/add",
            {"collection_id": node["id"], "track_ids": ids[:1]},
        )
        assert status == 400


@pytest.mark.unit
class TestTags:
    def test_the_vocabulary_comes_back_with_counts(self, engine, tracks, ids):  # noqa: F811
        tag = ok(engine, "/api/v1/tags/create", {"name": "Peak time"})["tag"]
        ok(engine, "/api/v1/tags/assign", {"tag_id": tag["id"], "track_ids": ids[:3]})
        payload = get_json(engine, "/api/v1/tags")
        assert payload["tags"][0]["name"] == "Peak time"
        assert payload["tags"][0]["track_count"] == 3
        assert set(payload["tags"][0]) == {
            "id",
            "name",
            "category",
            "colour",
            "track_count",
            "created_at",
        }

    def test_creating_a_tag_that_exists_returns_it(self, engine, tracks):  # noqa: F811
        """Create-or-get, not create-or-fail (ORG-03): tags are made by typing
        them, and a modal about capitalization is a worse answer."""
        first = ok(engine, "/api/v1/tags/create", {"name": "Peak time"})["tag"]
        again = ok(engine, "/api/v1/tags/create", {"name": "peak TIME"})["tag"]
        assert again["id"] == first["id"]

    def test_update_renames(self, engine, peak):  # noqa: F811
        renamed = ok(engine, "/api/v1/tags/update", {"id": peak["id"], "name": "Peak"})[
            "tag"
        ]
        assert renamed["name"] == "Peak"

    def test_update_sets_and_clears_a_category(self, engine, peak):  # noqa: F811
        assert (
            ok(engine, "/api/v1/tags/update", {"id": peak["id"], "category": "Energy"})[
                "tag"
            ]["category"]
            == "Energy"
        )
        assert (
            ok(engine, "/api/v1/tags/update", {"id": peak["id"], "category": None})[
                "tag"
            ]["category"]
            is None
        )

    def test_update_with_nothing_to_do_is_refused(self, engine, peak):  # noqa: F811
        status, payload = post(engine, "/api/v1/tags/update", {"id": peak["id"]})
        assert status == 400
        assert "Nothing to update" in payload["error"]["message"]

    def test_a_colour_outside_the_token_set_is_refused(self, engine, peak):  # noqa: F811
        status, _ = post(
            engine, "/api/v1/tags/update", {"id": peak["id"], "colour": "#ff00ff"}
        )
        assert status == 400

    def test_assign_and_unassign_report_what_changed(self, engine, peak, ids):  # noqa: F811
        first = ok(
            engine, "/api/v1/tags/assign", {"tag_id": peak["id"], "track_ids": ids[:3]}
        )
        assert first["changed"] == 3
        again = ok(
            engine, "/api/v1/tags/assign", {"tag_id": peak["id"], "track_ids": ids[:3]}
        )
        assert again["changed"] == 0
        off = ok(
            engine,
            "/api/v1/tags/unassign",
            {"tag_id": peak["id"], "track_ids": ids[:2]},
        )
        assert off["changed"] == 2

    def test_delete_says_how_many_tracks_lost_it(self, engine, peak, ids):  # noqa: F811
        ok(engine, "/api/v1/tags/assign", {"tag_id": peak["id"], "track_ids": ids[:3]})
        assert ok(engine, "/api/v1/tags/delete", {"id": peak["id"]})["untagged"] == 3
        assert get_json(engine, "/api/v1/tags")["tags"] == []

    def test_merge_moves_the_assignments(self, engine, tracks, ids):  # noqa: F811
        source = ok(engine, "/api/v1/tags/create", {"name": "Peaktime"})["tag"]
        target = ok(engine, "/api/v1/tags/create", {"name": "Peak time"})["tag"]
        ok(
            engine,
            "/api/v1/tags/assign",
            {"tag_id": source["id"], "track_ids": ids[:3]},
        )
        assert (
            ok(
                engine,
                "/api/v1/tags/merge",
                {"source_id": source["id"], "target_id": target["id"]},
            )["moved"]
            == 3
        )
        names = {
            tag["name"]: tag["track_count"]
            for tag in get_json(engine, "/api/v1/tags")["tags"]
        }
        assert names == {"Peak time": 3}

    def test_merging_a_tag_into_itself_is_refused(self, engine, peak):  # noqa: F811
        status, payload = post(
            engine,
            "/api/v1/tags/merge",
            {"source_id": peak["id"], "target_id": peak["id"]},
        )
        assert status == 400
        assert "itself" in payload["error"]["message"]

    def test_a_missing_tag_is_refused_not_crashed(self, engine, tracks, ids):  # noqa: F811
        status, payload = post(
            engine, "/api/v1/tags/assign", {"tag_id": 4242, "track_ids": ids[:1]}
        )
        assert status == 400
        assert "4242" in payload["error"]["message"]


@pytest.mark.unit
class TestTrackMetadata:
    def test_setting_a_rating_answers_with_both_layers(self, engine, ids):  # noqa: F811
        payload = ok(
            engine, f"/api/v1/library/tracks/{ids[0]}/metadata", {"rating": 4}
        )["metadata"]
        assert payload["rating"] == 4
        assert payload["effective_rating"] == 4
        assert payload["rating_source"] == "cuepoint"
        assert set(payload) == {
            "track_id",
            "rating",
            "rekordbox_rating",
            "effective_rating",
            "rating_source",
            "favorite",
            "notes",
            "created_at",
            "updated_at",
        }

    def test_clearing_a_rating_lets_rekordbox_show_through(self, engine, tracks):  # noqa: F811
        """DEC-057's whole point, over the wire."""
        from cuepoint.persistence.track_query import BrowseQuery

        rated = [t for t in tracks.browse(BrowseQuery(), limit=50) if t.rating][0]
        ok(engine, f"/api/v1/library/tracks/{rated.id}/metadata", {"rating": 1})
        cleared = ok(
            engine, f"/api/v1/library/tracks/{rated.id}/metadata", {"rating": None}
        )["metadata"]
        assert cleared["rating"] is None
        assert cleared["effective_rating"] == rated.rating
        assert cleared["rating_source"] == "rekordbox"

    def test_a_rating_of_zero_is_a_rating(self, engine, ids):  # noqa: F811
        payload = ok(
            engine, f"/api/v1/library/tracks/{ids[0]}/metadata", {"rating": 0}
        )["metadata"]
        assert payload["rating"] == 0
        assert payload["rating_source"] == "cuepoint"

    def test_favorite_and_notes(self, engine, ids):  # noqa: F811
        payload = ok(
            engine,
            f"/api/v1/library/tracks/{ids[0]}/metadata",
            {"favorite": True, "notes": "  for the closing set  "},
        )["metadata"]
        assert payload["favorite"] is True
        assert payload["notes"] == "for the closing set"

    def test_a_rating_out_of_range_is_refused(self, engine, ids):  # noqa: F811
        status, payload = post(
            engine, f"/api/v1/library/tracks/{ids[0]}/metadata", {"rating": 9}
        )
        assert status == 400
        assert "Rating" in payload["error"]["message"]

    def test_favorite_will_not_take_the_word_true(self, engine, ids):  # noqa: F811
        status, _ = post(
            engine, f"/api/v1/library/tracks/{ids[0]}/metadata", {"favorite": "true"}
        )
        assert status == 400

    def test_an_empty_body_is_refused(self, engine, ids):  # noqa: F811
        status, payload = post(engine, f"/api/v1/library/tracks/{ids[0]}/metadata", {})
        assert status == 400
        assert "Nothing to set" in payload["error"]["message"]

    def test_a_track_that_is_not_there_is_a_404(self, engine, tracks):  # noqa: F811
        status, payload = post(
            engine, "/api/v1/library/tracks/999999/metadata", {"rating": 3}
        )
        assert status == 404
        assert payload["error"]["code"] == "TRACK_NOT_FOUND"

    def test_a_track_id_that_is_not_a_number_is_a_400(self, engine, tracks):  # noqa: F811
        """The path was wrong, and the message says which part of it."""
        status, payload = post(
            engine, "/api/v1/library/tracks/seven/metadata", {"rating": 3}
        )
        assert status == 400
        assert payload["error"]["message"] == "track id must be a number, not 'seven'"

    def test_nothing_is_written_to_the_imported_row(self, engine, tracks, ids):  # noqa: F811
        """DEC-064 and DEC-057: CuePoint writes its own table, never Rekordbox's."""
        before = get_json(engine, f"/api/v1/library/tracks/{ids[0]}")["track"]["rating"]
        ok(engine, f"/api/v1/library/tracks/{ids[0]}/metadata", {"rating": 5})
        after = get_json(engine, f"/api/v1/library/tracks/{ids[0]}")["track"]
        assert after["rating"] == before
        assert after["effective_rating"] == 5


@pytest.mark.unit
class TestTrackHistory:
    def test_it_lists_what_changed_newest_first(self, engine, ids):  # noqa: F811
        ok(engine, f"/api/v1/library/tracks/{ids[0]}/metadata", {"rating": 2})
        ok(engine, f"/api/v1/library/tracks/{ids[0]}/metadata", {"rating": 5})
        payload = get_json(engine, f"/api/v1/library/tracks/{ids[0]}/history")
        assert [change["new_value"] for change in payload["changes"]] == [5, 2]
        assert set(payload["changes"][0]) == {
            "id",
            "track_id",
            "field",
            "old_value",
            "new_value",
            "source",
            "changed_at",
            "batch_id",
        }

    def test_a_track_nobody_has_edited_has_no_history(self, engine, ids):  # noqa: F811
        assert (
            get_json(engine, f"/api/v1/library/tracks/{ids[0]}/history")["changes"]
            == []
        )

    def test_a_missing_track_is_a_404(self, engine, tracks):  # noqa: F811
        status, payload = get_status(engine, "/api/v1/library/tracks/999999/history")
        assert status == 404
        assert payload["error"]["code"] == "TRACK_NOT_FOUND"

    def test_the_limit_is_clamped_rather_than_trusted(self, engine, ids):  # noqa: F811
        payload = get_json(
            engine, f"/api/v1/library/tracks/{ids[0]}/history", limit=100000
        )
        assert payload["limit"] == 500


@pytest.mark.unit
class TestTheInspectorReads:
    def test_track_detail_carries_metadata_tags_and_collections(
        self,
        engine,  # noqa: F811
        warmups,
        peak,
        ids,
    ):
        ok(engine, "/api/v1/tags/assign", {"tag_id": peak["id"], "track_ids": [ids[0]]})
        ok(
            engine,
            "/api/v1/collections/tracks/add",
            {"collection_id": warmups["id"], "track_ids": [ids[0]]},
        )
        ok(engine, f"/api/v1/library/tracks/{ids[0]}/metadata", {"notes": "a note"})

        payload = get_json(engine, f"/api/v1/library/tracks/{ids[0]}")
        assert payload["metadata"]["notes"] == "a note"
        assert [tag["name"] for tag in payload["tags"]] == ["Peak time"]
        assert [node["name"] for node in payload["collections"]] == ["Warmups"]

    def test_the_row_shape_carries_no_note(self, engine, ids):  # noqa: F811
        """A ten-thousand-character note times a hundred rows is a megabyte a
        window; the one place that shows one reads a single track."""
        ok(engine, f"/api/v1/library/tracks/{ids[0]}/metadata", {"notes": "x" * 100})
        row = get_json(engine, "/api/v1/library/search", mode="browse")["tracks"][0]
        assert "notes" not in row


@pytest.mark.unit
class TestTheScope:
    def test_a_collection_scope_returns_its_tracks(self, engine, warmups, ids):  # noqa: F811
        ok(
            engine,
            "/api/v1/collections/tracks/add",
            {"collection_id": warmups["id"], "track_ids": ids[:3]},
        )
        payload = get_json(
            engine,
            "/api/v1/library/search",
            mode="browse",
            scope="collection",
            collection_id=warmups["id"],
        )
        assert payload["total"] == 3
        assert [track["id"] for track in payload["tracks"]] == ids[:3]

    def test_a_collection_opens_in_its_own_order(self, engine, warmups, ids):  # noqa: F811
        """ORG-09: inside a Collection the default sort is the Collection's
        own order, which is not the library's."""
        arranged = [ids[3], ids[1], ids[0]]
        ok(
            engine,
            "/api/v1/collections/tracks/add",
            {"collection_id": warmups["id"], "track_ids": arranged},
        )
        payload = get_json(
            engine,
            "/api/v1/library/search",
            mode="browse",
            scope="collection",
            collection_id=warmups["id"],
        )
        assert [track["id"] for track in payload["tracks"]] == arranged
        assert payload["sort"] == "collection_position"

    def test_a_named_sort_still_wins(self, engine, warmups, ids):  # noqa: F811
        ok(
            engine,
            "/api/v1/collections/tracks/add",
            {"collection_id": warmups["id"], "track_ids": [ids[3], ids[1], ids[0]]},
        )
        payload = get_json(
            engine,
            "/api/v1/library/search",
            mode="browse",
            scope="collection",
            collection_id=warmups["id"],
            sort="title",
        )
        assert [track["id"] for track in payload["tracks"]] == sorted(
            [ids[0], ids[1], ids[3]]
        )

    def test_a_smart_scope_finds_what_the_same_rules_find(self, engine, tracks):  # noqa: F811
        """DEC-043 over the wire: a saved question and an unsaved filter are one
        query path, so they answer identically or one of them is wrong."""
        node = ok(
            engine,
            "/api/v1/collections/smart/save",
            {"name": "Techno", "rules": TECHNO},
        )["collection"]
        saved = get_json(
            engine,
            "/api/v1/library/search",
            mode="browse",
            scope="smart",
            collection_id=node["id"],
        )
        unsaved = get_json(
            engine, "/api/v1/library/search", mode="browse", filters=json.dumps(TECHNO)
        )
        assert [t["id"] for t in saved["tracks"]] == [
            t["id"] for t in unsaved["tracks"]
        ]
        assert saved["total"] == unsaved["total"] == TRACK_COUNT // 2

    def test_a_smart_scope_opens_in_the_sort_it_was_saved_with(
        self,
        engine,  # noqa: F811
        tracks,
    ):
        node = ok(
            engine,
            "/api/v1/collections/smart/save",
            {"name": "Techno", "rules": TECHNO, "sort": "title", "dir": "desc"},
        )["collection"]
        payload = get_json(
            engine,
            "/api/v1/library/search",
            mode="browse",
            scope="smart",
            collection_id=node["id"],
        )
        assert (payload["sort"], payload["dir"]) == ("title", "desc")

    def test_a_filter_narrows_a_smart_scope_rather_than_replacing_it(
        self,
        engine,  # noqa: F811
        tracks,
    ):
        node = ok(
            engine,
            "/api/v1/collections/smart/save",
            {"name": "Techno", "rules": TECHNO},
        )["collection"]
        narrowed = get_json(
            engine,
            "/api/v1/library/search",
            mode="browse",
            scope="smart",
            collection_id=node["id"],
            filters=json.dumps(
                {
                    "match": "all",
                    "rules": [{"field": "title", "operator": "is", "value": "Track 1"}],
                }
            ),
        )
        assert [t["title"] for t in narrowed["tracks"]] == ["Track 1"]
        assert len(narrowed["filters"]["rules"]) == 2

    def test_a_broken_smart_scope_is_refused_by_the_clause(
        self,
        engine,  # noqa: F811
        tracks,
        peak,
    ):
        node = ok(
            engine,
            "/api/v1/collections/smart/save",
            {
                "name": "Peak time",
                "rules": {
                    "match": "all",
                    "rules": [
                        {"field": "tag", "operator": "has_tag", "value": peak["id"]}
                    ],
                },
            },
        )["collection"]
        ok(engine, "/api/v1/tags/delete", {"id": peak["id"]})
        status, payload = get_status(
            engine,
            "/api/v1/library/search",
            mode="browse",
            scope="smart",
            collection_id=node["id"],
        )
        assert status == 400
        assert payload["error"]["code"] == "INVALID_REQUEST"

    def test_a_scope_without_a_collection_is_refused(self, engine, tracks):  # noqa: F811
        status, payload = get_status(
            engine, "/api/v1/library/search", mode="browse", scope="collection"
        )
        assert status == 400
        assert "collection_id" in payload["error"]["message"]

    def test_a_collection_without_a_scope_is_refused(self, engine, warmups):  # noqa: F811
        status, payload = get_status(
            engine, "/api/v1/library/search", mode="browse", collection_id=warmups["id"]
        )
        assert status == 400
        assert "scope" in payload["error"]["message"]

    def test_an_unknown_scope_is_refused(self, engine, tracks):  # noqa: F811
        status, payload = get_status(
            engine,
            "/api/v1/library/search",
            mode="browse",
            scope="playlist",
            collection_id=1,
        )
        assert status == 400
        assert "scope" in payload["error"]["message"]

    def test_facets_answer_within_the_collection(self, engine, warmups, ids):  # noqa: F811
        """A filter control inside a Collection offers what that Collection
        holds, not what the library does."""
        techno = [
            track["id"]
            for track in get_json(
                engine,
                "/api/v1/library/search",
                mode="browse",
                filters=json.dumps(TECHNO),
            )["tracks"]
        ]
        ok(
            engine,
            "/api/v1/collections/tracks/add",
            {"collection_id": warmups["id"], "track_ids": techno},
        )
        payload = get_json(
            engine,
            "/api/v1/library/facets",
            field="genre",
            scope="collection",
            collection_id=warmups["id"],
        )
        assert [value["value"] for value in payload["values"]] == ["Techno"]

    def test_the_ids_projection_respects_the_scope(self, engine, warmups, ids):  # noqa: F811
        ok(
            engine,
            "/api/v1/collections/tracks/add",
            {"collection_id": warmups["id"], "track_ids": ids[:3]},
        )
        payload = get_json(
            engine,
            "/api/v1/library/search",
            mode="browse",
            fields="id",
            scope="collection",
            collection_id=warmups["id"],
        )
        assert payload["track_ids"] == ids[:3]


@pytest.mark.unit
class TestTodaysCallerIsUntouched:
    def test_a_request_with_none_of_the_new_parameters_is_unchanged(
        self,
        engine,  # noqa: F811
        tracks,
    ):
        """DEC-023's guard, extended rather than replaced.

        The two new keys are additive and null; the tracks, the total and every
        key that existed before answer exactly as they did.
        """
        payload = get_json(engine, "/api/v1/library/search", q="Track")
        assert payload["collection_scope"] is None
        assert payload["collection_id"] is None
        assert payload["mode"] == "search"
        assert payload["sort"] == "artist"
        assert payload["dir"] == "asc"
        assert payload["total"] == TRACK_COUNT

    def test_a_browse_with_no_scope_still_sorts_by_the_library_default(
        self,
        engine,  # noqa: F811
        tracks,
    ):
        payload = get_json(engine, "/api/v1/library/search", mode="browse")
        assert payload["sort"] == "artist"
        assert payload["total"] == TRACK_COUNT


@pytest.mark.unit
class TestTheBatchRoute:
    def test_a_small_selection_applies_inline(self, engine, ids):  # noqa: F811
        status, payload = post(
            engine,
            "/api/v1/library/batch",
            {
                "selection": {"track_ids": ids[:4]},
                "operation": {"kind": "set_rating", "value": 3},
            },
        )
        assert status == 200
        assert payload["applied"]["changed"] == 4
        assert payload["applied"]["operation"] == "set_rating"

    def test_a_query_selection_applies_to_what_it_names(self, engine, peak):  # noqa: F811
        payload = ok(
            engine,
            "/api/v1/library/batch",
            {
                "selection": {"query": {"filters": TECHNO}},
                "operation": {"kind": "add_tag", "value": peak["id"]},
            },
        )
        assert payload["applied"]["changed"] == TRACK_COUNT // 2

    def test_a_collection_scoped_selection(self, engine, warmups, ids):  # noqa: F811
        ok(
            engine,
            "/api/v1/collections/tracks/add",
            {"collection_id": warmups["id"], "track_ids": ids[:3]},
        )
        payload = ok(
            engine,
            "/api/v1/library/batch",
            {
                "selection": {
                    "query": {"scope": "collection", "collection_id": warmups["id"]}
                },
                "operation": {"kind": "set_favorite", "value": True},
            },
        )
        assert payload["applied"]["total"] == 3

    def test_a_query_selection_can_take_tracks_back_out(self, engine, ids):  # noqa: F811
        """Select all, then deselect two: the count and the effect must agree.

        A query with no exclusions applied to every track would be the batch
        doing more than the toolbar promised, and there is no way for a user to
        find that out except by looking at what it did.
        """
        payload = ok(
            engine,
            "/api/v1/library/batch",
            {
                "selection": {"query": {}, "exclude_track_ids": ids[:2]},
                "operation": {"kind": "set_rating", "value": 2},
            },
        )
        assert payload["applied"]["total"] == TRACK_COUNT - 2

        detail = ok(engine, f"/api/v1/library/tracks/{ids[0]}/metadata", {"notes": "x"})
        assert detail["metadata"]["rating"] is None

    def test_an_empty_exclusion_list_is_not_an_error(self, engine, ids):  # noqa: F811
        payload = ok(
            engine,
            "/api/v1/library/batch",
            {
                "selection": {"query": {}, "exclude_track_ids": []},
                "operation": {"kind": "set_favorite", "value": True},
            },
        )
        assert payload["applied"]["total"] == TRACK_COUNT

    def test_an_exclusion_that_is_not_a_list_of_ids_is_refused(self, engine):  # noqa: F811
        status, payload = post(
            engine,
            "/api/v1/library/batch",
            {
                "selection": {"query": {}, "exclude_track_ids": "everything"},
                "operation": {"kind": "set_favorite", "value": True},
            },
        )
        assert status == 400
        assert "exclude_track_ids" in payload["error"]["message"]

    def test_excluding_everything_is_refused_by_name(self, engine, ids):  # noqa: F811
        status, payload = post(
            engine,
            "/api/v1/library/batch",
            {
                "selection": {"query": {}, "exclude_track_ids": list(ids)},
                "operation": {"kind": "set_favorite", "value": True},
            },
        )
        assert status == 400
        assert "names no tracks" in payload["error"]["message"]

    def test_a_large_selection_starts_a_job(self, engine, ids, monkeypatch):  # noqa: F811
        from cuepoint.engine import batch_jobs

        monkeypatch.setattr(batch_jobs, "BATCH_JOB_THRESHOLD", 2)
        status, payload = post(
            engine,
            "/api/v1/library/batch",
            {
                "selection": {"track_ids": ids},
                "operation": {"kind": "set_rating", "value": 1},
            },
        )
        assert status == 202
        assert payload["job_id"] == payload["id"]
        assert payload["state"] in ("queued", "running", "succeeded")

    def test_an_unknown_operation_is_refused(self, engine, ids):  # noqa: F811
        status, payload = post(
            engine,
            "/api/v1/library/batch",
            {
                "selection": {"track_ids": ids[:1]},
                "operation": {"kind": "delete_everything"},
            },
        )
        assert status == 400
        assert "Unknown batch operation" in payload["error"]["message"]

    def test_a_selection_of_nothing_is_refused(self, engine, tracks):  # noqa: F811
        status, payload = post(
            engine,
            "/api/v1/library/batch",
            {
                "selection": {"query": {"q": "nothing matches this"}},
                "operation": {"kind": "set_rating", "value": 1},
            },
        )
        assert status == 400
        assert "no tracks" in payload["error"]["message"]

    def test_a_body_with_no_selection_is_refused(self, engine, tracks):  # noqa: F811
        status, payload = post(
            engine, "/api/v1/library/batch", {"operation": {"kind": "set_rating"}}
        )
        assert status == 400
        assert payload["error"]["message"] == (
            "selection must be an object with track_ids or a query"
        )

    def test_a_body_with_no_operation_is_refused(self, engine, ids):  # noqa: F811
        status, payload = post(
            engine, "/api/v1/library/batch", {"selection": {"track_ids": ids[:1]}}
        )
        assert status == 400
        assert "operation" in payload["error"]["message"]

    def test_the_history_it_writes_is_readable_over_the_wire(self, engine, ids):  # noqa: F811
        """DEC-063's batch id, end to end: the rows are written and the
        History tab can read them."""
        payload = ok(
            engine,
            "/api/v1/library/batch",
            {
                "selection": {"track_ids": ids[:3]},
                "operation": {"kind": "set_rating", "value": 4},
            },
        )
        batch_id = payload["applied"]["batch_id"]
        history = get_json(engine, f"/api/v1/library/tracks/{ids[0]}/history")
        assert history["changes"][0]["batch_id"] == batch_id


@pytest.mark.unit
class TestTheEnvelope:
    def test_an_unknown_organization_path_is_a_404(self, engine, tracks):  # noqa: F811
        status, payload = post(engine, "/api/v1/collections/explode", {})
        assert status == 404
        assert payload["error"]["code"] == "NOT_FOUND"

    def test_every_route_needs_the_token(self, engine, tracks):  # noqa: F811
        request = urllib.request.Request(f"{engine}/api/v1/collections", method="GET")
        try:
            urllib.request.urlopen(request, timeout=5)
            raise AssertionError("an unauthorized read was allowed")
        except urllib.error.HTTPError as exc:
            assert exc.code == 401
            assert json.loads(exc.read())["error"]["code"] == "UNAUTHORIZED"

    def test_a_write_needs_the_token_too(self, engine, tracks):  # noqa: F811
        request = urllib.request.Request(
            f"{engine}/api/v1/collections/create",
            data=b"{}",
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            urllib.request.urlopen(request, timeout=5)
            raise AssertionError("an unauthorized write was allowed")
        except urllib.error.HTTPError as exc:
            assert exc.code == 401

    def test_every_error_uses_the_one_envelope(self, engine, tracks):  # noqa: F811
        """The shape is a public contract, and there is one of it."""
        for status, payload in [
            post(engine, "/api/v1/collections/create", {}),
            post(engine, "/api/v1/tags/delete", {"id": 4242}),
            post(engine, "/api/v1/library/tracks/999999/metadata", {"rating": 1}),
            get_status(engine, "/api/v1/library/tracks/999999/history"),
        ]:
            assert status >= 400
            assert set(payload) == {"error"}
            assert {"code", "message"} <= set(payload["error"])


@pytest.mark.unit
class TestTheRowCarriesCuePointsLayer:
    """DEC-057 in the table, not only in the Inspector.

    The window reads CuePoint's layer in one query and puts three fields on
    every row. The failure that matters is the quiet one: a window that reads
    nothing looks exactly like a library nobody has rated.
    """

    def test_a_rating_set_here_shows_in_the_window(self, engine, ids):  # noqa: F811
        ok(engine, f"/api/v1/library/tracks/{ids[0]}/metadata", {"rating": 5})
        rows = {
            row["id"]: row
            for row in get_json(engine, "/api/v1/library/search", mode="browse")[
                "tracks"
            ]
        }
        assert rows[ids[0]]["effective_rating"] == 5
        assert rows[ids[0]]["rating_source"] == "cuepoint"

    def test_an_untouched_row_shows_rekordbox_and_says_so(self, engine, tracks):  # noqa: F811
        rows = get_json(engine, "/api/v1/library/search", mode="browse")["tracks"]
        rated = [row for row in rows if row["rating"] is not None]
        assert rated, "the fixture has to have an imported rating to prove this"
        for row in rated:
            assert row["effective_rating"] == row["rating"]
            assert row["rating_source"] == "rekordbox"

    def test_a_favorite_shows_in_the_window(self, engine, ids):  # noqa: F811
        ok(engine, f"/api/v1/library/tracks/{ids[0]}/metadata", {"favorite": True})
        rows = {
            row["id"]: row
            for row in get_json(engine, "/api/v1/library/search", mode="browse")[
                "tracks"
            ]
        }
        assert rows[ids[0]]["favorite"] is True
        assert all(
            row["favorite"] is False for row in rows.values() if row["id"] != ids[0]
        )

    def test_a_search_carries_them_too(self, engine, ids):  # noqa: F811
        """The same serializer for both modes, so the two cannot disagree."""
        ok(engine, f"/api/v1/library/tracks/{ids[0]}/metadata", {"rating": 2})
        found = get_json(engine, "/api/v1/library/search", q="Track")["tracks"]
        row = next(track for track in found if track["id"] == ids[0])
        assert (row["effective_rating"], row["rating_source"]) == (2, "cuepoint")


@pytest.mark.unit
class TestScopesDoNotLeak:
    def test_a_collection_scope_is_about_that_collection(
        self,
        engine,  # noqa: F811
        warmups,
        ids,
    ):
        """Two Collections, and a scope that names one of them.

        The way this breaks is a predicate that asks whether a track is in
        *any* Collection, which is invisible until a user makes their second
        one.
        """
        other = ok(
            engine,
            "/api/v1/collections/create",
            {"kind": "collection", "name": "Closers"},
        )["collection"]
        ok(
            engine,
            "/api/v1/collections/tracks/add",
            {"collection_id": warmups["id"], "track_ids": ids[:2]},
        )
        ok(
            engine,
            "/api/v1/collections/tracks/add",
            {"collection_id": other["id"], "track_ids": ids[2:5]},
        )
        payload = get_json(
            engine,
            "/api/v1/library/search",
            mode="browse",
            scope="collection",
            collection_id=warmups["id"],
        )
        assert [track["id"] for track in payload["tracks"]] == ids[:2]
        assert payload["total"] == 2


@pytest.mark.unit
class TestTheDispatchTable:
    """The two halves of routing have to agree.

    ``handles_post`` decides whether the server hands a path over, and
    ``handle_post`` decides what to do with it. A path in one and not the other
    is either a route nobody can reach or a 500 — so the pair is asserted
    directly, which is also the only way to reach the refusal for a path the
    server would never have routed here.
    """

    def test_every_declared_path_is_handled(self):
        from cuepoint.engine import organization_api as api

        for path in api.GET_PATHS:
            assert api.handles_get(path), path
        for path in api.POST_PATHS:
            assert api.handles_post(path), path

    def test_an_unknown_read_is_refused_as_a_404(self):
        from cuepoint.engine import organization_api as api
        from cuepoint.engine.api_errors import ApiError

        with pytest.raises(ApiError) as refused:
            api.handle_get("/api/v1/collections/nonsense", {})
        assert refused.value.status == 404

    def test_an_unknown_write_is_refused_as_a_404(self):
        from cuepoint.engine import organization_api as api
        from cuepoint.engine.api_errors import ApiError

        with pytest.raises(ApiError) as refused:
            api.handle_post("/api/v1/collections/nonsense", b"{}", job_store=None)
        assert refused.value.status == 404

    def test_a_database_that_cannot_be_reached_is_a_503(
        self,
        engine,  # noqa: F811
        tracks,
        monkeypatch,
    ):
        """Not the caller's fault and not their fix.

        "No tags" and "the database is unreachable" are different situations
        with different answers, and a 400 would tell the user to correct a
        request that was fine.
        """
        from cuepoint.engine import organization_api as api

        def unavailable():
            raise api.OrganizationUnavailableError("the database is locked")

        monkeypatch.setattr(api, "resolve_tag_service", unavailable)
        status, payload = get_status(engine, "/api/v1/tags")
        assert status == 503
        assert payload["error"]["code"] == "LIBRARY_UNAVAILABLE"
