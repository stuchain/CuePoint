#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""A Set on the existing Collection routes (PREP-02).

PREP-08 adds the Set's own routes. Until then a Set is reached through the ones
a Collection uses, and this step changes them in exactly two ways: ``create``
accepts ``kind: "set"``, and every answer that describes a node or a delete
names a Set as one. Adding, inserting, moving and removing entries stay the one
path to write an entry, on the wire as in the repository.
"""

from __future__ import annotations

import pytest

from tests.unit.engine.test_engine_library_browse import (
    engine,  # noqa: F401 — a pytest fixture, used by name
    get_json,
    library_db,  # noqa: F401 — a pytest fixture, used by name
)
from tests.unit.engine.test_engine_organization_api import (
    ids,  # noqa: F401 — a pytest fixture, used by name
    ok,
    post,
    tracks,  # noqa: F401 — a pytest fixture, used by name
)


@pytest.fixture
def gig(engine, tracks):  # noqa: F811 — the fixture is used by name
    return ok(engine, "/api/v1/collections/create", {"kind": "set", "name": "Friday"})[
        "collection"
    ]


def plans(set_id: int) -> list:
    """Each entry's chapter position, in the Set's order, from the database."""
    from cuepoint.services.interfaces import ICollectionRepository
    from cuepoint.utils.di_container import get_container

    repo = get_container().resolve(ICollectionRepository)
    chapters = {chapter.id: chapter.position for chapter in repo.chapters(set_id)}
    return [chapters[plan.chapter_id] for plan in repo.entry_plans(set_id)]


@pytest.mark.unit
class TestCreatingASet:
    def test_create_answers_a_set(self, gig):
        assert gig["kind"] == "set"
        assert (gig["name"], gig["entry_count"], gig["track_count"]) == (
            "Friday",
            0,
            0,
        )
        assert gig["rules"] is None and gig["broken"] is False

    def test_the_tree_lists_it_with_its_kind_and_counts(self, engine, gig, ids):  # noqa: F811
        ok(
            engine,
            "/api/v1/collections/tracks/add",
            {"collection_id": gig["id"], "track_ids": ids[:3]},
        )
        tree = get_json(engine, "/api/v1/collections")
        (node,) = [n for n in tree["collections"] if n["id"] == gig["id"]]
        assert (node["kind"], node["entry_count"], node["track_count"]) == ("set", 3, 3)

    def test_it_is_filed_in_a_folder(self, engine, tracks):  # noqa: F811
        folder = ok(
            engine, "/api/v1/collections/create", {"kind": "folder", "name": "Gigs"}
        )["collection"]
        made = ok(
            engine,
            "/api/v1/collections/create",
            {"kind": "SET", "name": "Friday", "parent_id": folder["id"]},
        )["collection"]
        assert (made["kind"], made["parent_id"], made["depth"]) == (
            "set",
            folder["id"],
            1,
        )

    def test_an_unknown_kind_names_every_kind_that_is_allowed(self, engine, tracks):  # noqa: F811
        status, payload = post(
            engine, "/api/v1/collections/create", {"kind": "crate", "name": "X"}
        )
        assert status == 400
        message = payload["error"]["message"]
        assert "'folder', 'collection' or 'set'" in message
        assert "smart collection is created by saving its rules" in message

    def test_nothing_can_be_filed_inside_a_set(self, engine, gig):  # noqa: F811
        status, payload = post(
            engine,
            "/api/v1/collections/create",
            {"kind": "collection", "name": "Inside", "parent_id": gig["id"]},
        )
        assert status == 400
        assert "only a folder" in payload["error"]["message"]


@pytest.mark.unit
class TestFillingASetThroughTheCollectionRoutes:
    def test_every_entry_route_plans_what_it_writes(self, engine, gig, ids):  # noqa: F811
        added = ok(
            engine,
            "/api/v1/collections/tracks/add",
            {"collection_id": gig["id"], "track_ids": [ids[0], ids[1], ids[0]]},
        )
        assert (added["added"], added["skipped"]) == (2, 0)
        entry = ok(
            engine,
            "/api/v1/collections/tracks/insert",
            {"collection_id": gig["id"], "track_id": ids[0], "position": 1},
        )["entry"]
        assert entry["position"] == 1
        ok(
            engine,
            "/api/v1/collections/tracks/reorder",
            {"entry_id": entry["id"], "position": 2},
        )
        page = get_json(engine, "/api/v1/collections/entries", collection_id=gig["id"])
        assert [e["track_id"] for e in page["entries"]] == [ids[0], ids[1], ids[0]]
        assert (page["entry_count"], page["track_count"]) == (3, 2)
        assert plans(gig["id"]) == [0, 0, 0]

        ok(
            engine,
            "/api/v1/collections/tracks/remove",
            {"entry_ids": [page["entries"][0]["id"]]},
        )
        assert plans(gig["id"]) == [0, 0]

    def test_the_inspector_lists_the_set_by_kind(self, engine, gig, ids):  # noqa: F811
        ok(
            engine,
            "/api/v1/collections/tracks/add",
            {"collection_id": gig["id"], "track_ids": [ids[0]]},
        )
        detail = get_json(engine, f"/api/v1/library/tracks/{ids[0]}")
        assert {"id": gig["id"], "name": "Friday", "kind": "set"} in detail[
            "collections"
        ]

    def test_the_library_scopes_to_a_set_as_to_a_collection(self, engine, gig, ids):  # noqa: F811
        ok(
            engine,
            "/api/v1/collections/tracks/add",
            {"collection_id": gig["id"], "track_ids": [ids[2], ids[0]]},
        )
        ok(
            engine,
            "/api/v1/collections/tracks/insert",
            {"collection_id": gig["id"], "track_id": ids[2], "position": 2},
        )
        page = get_json(
            engine,
            "/api/v1/library/search",
            mode="browse",
            scope="collection",
            collection_id=gig["id"],
        )
        # The browse scope lists each track once (fact 3); the running order
        # with its repeat is the Set's entries.
        assert page["total"] == 2
        assert sorted(row["id"] for row in page["tracks"]) == sorted([ids[0], ids[2]])


@pytest.mark.unit
class TestDeletingASet:
    def test_the_preview_and_the_delete_name_the_set(self, engine, gig, ids):  # noqa: F811
        ok(
            engine,
            "/api/v1/collections/tracks/add",
            {"collection_id": gig["id"], "track_ids": ids[:2]},
        )
        expected = {
            "folders": 0,
            "collections": 0,
            "smart_collections": 0,
            "sets": 1,
            "entries": 2,
            "nodes": 1,
        }
        preview = ok(engine, "/api/v1/collections/delete/preview", {"id": gig["id"]})
        assert preview["removes"] == expected
        removed = ok(engine, "/api/v1/collections/delete", {"id": gig["id"]})
        assert removed["removed"] == expected
        assert get_json(engine, "/api/v1/collections")["total"] == 0


@pytest.mark.unit
class TestTheLimitOnTheWire:
    @pytest.fixture
    def small_limit(self, monkeypatch):
        """Three entries, so the test needs eight tracks rather than a thousand."""
        from cuepoint.models import set_plan
        from cuepoint.persistence import collection_repository
        from cuepoint.services import collection_service

        for module in (set_plan, collection_repository, collection_service):
            monkeypatch.setattr(module, "MAX_SET_ENTRIES", 3)

    def test_an_add_past_the_limit_is_a_refusal_with_the_numbers(
        self,
        engine,  # noqa: F811
        gig,
        ids,  # noqa: F811
        small_limit,
    ):
        status, payload = post(
            engine,
            "/api/v1/collections/tracks/add",
            {"collection_id": gig["id"], "track_ids": ids[:4]},
        )
        assert status == 400
        assert payload["error"]["code"] == "INVALID_REQUEST"
        assert payload["error"]["message"] == (
            "'Friday' holds 0 entries, and adding 4 would make 4: a Set holds at most 3"
        )
        assert (
            get_json(engine, "/api/v1/collections")["collections"][0]["entry_count"]
            == 0
        )

    def test_a_batch_past_the_limit_is_refused_before_it_starts(
        self,
        engine,  # noqa: F811
        gig,
        ids,  # noqa: F811
        small_limit,
    ):
        status, payload = post(
            engine,
            "/api/v1/library/batch",
            {
                "selection": {"track_ids": ids[:5]},
                "operation": {"kind": "add_to_collection", "value": gig["id"]},
            },
        )
        assert status == 400
        assert "a Set holds at most 3" in payload["error"]["message"]
        page = get_json(engine, "/api/v1/collections/entries", collection_id=gig["id"])
        assert page["entry_count"] == 0

        applied = ok(
            engine,
            "/api/v1/library/batch",
            {
                "selection": {"track_ids": ids[:3]},
                "operation": {"kind": "add_to_collection", "value": gig["id"]},
            },
        )["applied"]
        assert applied["changed"] == 3
        assert plans(gig["id"]) == [0, 0, 0]
