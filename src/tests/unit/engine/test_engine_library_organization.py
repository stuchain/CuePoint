#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""CuePoint's own data over the wire (ORG-05, DEC-043, DEC-057, DEC-060).

ORG-05 changed what three shipped endpoints answer without adding a fourth:
``/library/filter-fields`` now describes six more fields, ``/library/search``
accepts rules about tags, Collections and CuePoint metadata, and
``/library/facets`` answers for a tag. The unit tests below the engine prove the
SQL is right; these prove it survives the boundary — JSON in a query string,
JSON back out, and the right status code when a rule cannot be honoured.

The one that matters most is the refusal. ``BrokenRuleError`` is new, and it
reaches an HTTP handler that catches ``FilterRuleError``. It is a subclass, so
it is caught — but "is a subclass" is a fact about today's class statement, and
a filter a user can build must never come back as a 500 with a stack trace
where a message naming the clause belongs.

Everything runs against a temporary database and a fresh DI container; the
user's real ``~/.cuepoint/cuepoint.db`` is never opened.
"""

from __future__ import annotations

import json

import pytest

from cuepoint.models.collection import Collection
from cuepoint.models.library_track import LibraryTrack
from tests.unit.engine.test_engine_library_browse import (
    engine,  # noqa: F401 — a pytest fixture, used by name
    get_error,
    get_json,
    library_db,  # noqa: F401 — a pytest fixture, used by name
)


def _filters(*rules) -> str:
    """The ``filters`` query parameter: a rule set as JSON (DEC-043)."""
    return json.dumps({"match": "all", "rules": list(rules)})


def rule(field, operator, value=None):
    payload = {"field": field, "operator": operator}
    if value is not None:
        payload["value"] = value
    return payload


@pytest.fixture
def organized(library_db):  # noqa: F811 — the imported fixture
    """Four tracks, two tags, a Collection, and a Smart Collection.

    Built through the real repositories and services, so the rows are the ones
    ORG-02, ORG-03 and ORG-04 would have written.

    ======  ==========  ========  =========  =============  ===========
    track   Rekordbox   CuePoint  effective  tags           collection
    ======  ==========  ========  =========  =============  ===========
    1       5           —         5          peak, vocal    warmups
    2       3           5         5          peak           warmups
    3       1           —         1          —              —
    4       —           —         —          —              —
    ======  ==========  ========  =========  =============  ===========
    """
    from cuepoint.models.filter_rule import FilterRule, RuleSet
    from cuepoint.services.interfaces import (
        ICollectionService,
        IMetadataService,
        ITagService,
        ITrackRepository,
    )
    from cuepoint.utils.di_container import get_container

    container = get_container()
    tracks = container.resolve(ITrackRepository)
    for number, title, rating in (
        ("1", "Strobe", 5),
        ("2", "Ghosts n Stuff", 3),
        ("3", "Rej", 1),
        ("4", "Opus", None),
    ):
        tracks.add(
            LibraryTrack(
                rekordbox_track_id=number,
                file_path=f"/music/{number}.mp3",
                title=title,
                artist="Artist",
                genre="House",
                rating=rating,
            )
        )
    ids = {n: int(tracks.find_by_rekordbox_id(n).id) for n in ("1", "2", "3", "4")}

    metadata = container.resolve(IMetadataService)
    metadata.set_rating(ids["2"], 5)
    metadata.set_favorite(ids["1"], True)
    metadata.set_notes(ids["1"], "Dark and heavy")

    tags = container.resolve(ITagService)
    peak = tags.create_or_get("Peak time").id
    vocal = tags.create_or_get("Vocal").id
    tags.assign([ids["1"], ids["2"]], peak)
    tags.assign([ids["1"]], vocal)

    collections = container.resolve(ICollectionService)
    warmups = collections.create_collection("Warmups")
    collections.add_tracks(warmups.id, [ids["1"], ids["2"]])

    # A Smart Collection, so a rule that names one has something to be refused
    # over. ORG-06 gives these a service of their own; here the row is enough.
    from cuepoint.persistence.collection_repository import CollectionRepository
    from cuepoint.services.interfaces import IDatabaseService

    smart = CollectionRepository(container.resolve(IDatabaseService)).create(
        Collection(
            kind="smart",
            name="Rated five",
            rules_json=json.dumps(
                RuleSet(rules=(FilterRule("rating", "is", 5),)).to_dict()
            ),
        )
    )

    return {
        "ids": ids,
        "tags": {"peak": peak, "vocal": vocal},
        "collection": warmups.id,
        "smart": smart.id,
    }


def titles(payload) -> list:
    return sorted(track["title"] for track in payload["tracks"])


@pytest.mark.unit
class TestTheVocabularyDescribesTheNewFields:
    """What ORG-12 builds its controls from, and nothing it has to guess.

    DEC-043's whole point: the renderer cannot offer a clause the engine would
    refuse, because the list of what is buildable comes from the place that
    does the refusing. A field the engine accepts but does not describe is a
    filter only someone reading the Python could discover.
    """

    def test_every_new_field_is_described(self, engine, organized):  # noqa: F811
        payload = get_json(engine, "/api/v1/library/filter-fields")
        described = {entry["name"] for entry in payload["fields"]}
        for name in (
            "tag",
            "collection",
            "favorite",
            "notes",
            "cuepoint_rating",
            "rating_rekordbox",
        ):
            assert name in described, name

    def test_the_new_types_cross_the_wire(self, engine, organized):  # noqa: F811
        fields = {
            entry["name"]: entry
            for entry in get_json(engine, "/api/v1/library/filter-fields")["fields"]
        }
        assert fields["tag"]["type"] == "tag"
        assert fields["collection"]["type"] == "collection"
        assert fields["favorite"]["type"] == "bool"

    def test_the_new_operators_carry_an_arity(self, engine, organized):  # noqa: F811
        payload = get_json(engine, "/api/v1/library/filter-fields")
        assert payload["operators"]["has_tag"]["arity"] == "single"
        assert payload["operators"]["in_collection"]["arity"] == "single"

    def test_every_operator_a_new_field_allows_is_described(self, engine, organized):  # noqa: F811
        payload = get_json(engine, "/api/v1/library/filter-fields")
        described = payload["operators"]
        for entry in payload["fields"]:
            for operator in entry["operators"]:
                assert operator in described, (entry["name"], operator)

    def test_tag_is_offered_as_a_facet(self, engine, organized):  # noqa: F811
        payload = get_json(engine, "/api/v1/library/filter-fields")
        assert "tag" in payload["facetable"]
        assert "favorite" in payload["facetable"]


@pytest.mark.unit
class TestFilteringOverTheWire:
    def test_a_tag_rule(self, engine, organized):  # noqa: F811
        payload = get_json(
            engine,
            "/api/v1/library/search",
            mode="browse",
            filters=_filters(rule("tag", "has_tag", organized["tags"]["peak"])),
        )
        assert titles(payload) == ["Ghosts n Stuff", "Strobe"]
        assert payload["total"] == 2

    def test_a_tag_id_sent_as_text(self, engine, organized):  # noqa: F811
        # A query string is text, and a renderer that read an id out of a facet
        # value has a string in its hand.
        payload = get_json(
            engine,
            "/api/v1/library/search",
            mode="browse",
            filters=_filters(rule("tag", "has_tag", str(organized["tags"]["vocal"]))),
        )
        assert titles(payload) == ["Strobe"]

    def test_any_of_takes_a_list(self, engine, organized):  # noqa: F811
        payload = get_json(
            engine,
            "/api/v1/library/search",
            mode="browse",
            filters=_filters(
                rule(
                    "tag",
                    "any_of",
                    [organized["tags"]["peak"], organized["tags"]["vocal"]],
                )
            ),
        )
        assert payload["total"] == 2

    def test_untagged(self, engine, organized):  # noqa: F811
        payload = get_json(
            engine,
            "/api/v1/library/search",
            mode="browse",
            filters=_filters(rule("tag", "is_empty")),
        )
        assert titles(payload) == ["Opus", "Rej"]

    def test_a_collection_rule(self, engine, organized):  # noqa: F811
        payload = get_json(
            engine,
            "/api/v1/library/search",
            mode="browse",
            filters=_filters(
                rule("collection", "in_collection", organized["collection"])
            ),
        )
        assert titles(payload) == ["Ghosts n Stuff", "Strobe"]

    def test_a_favorite_rule_takes_a_json_bool(self, engine, organized):  # noqa: F811
        payload = get_json(
            engine,
            "/api/v1/library/search",
            mode="browse",
            filters=_filters(rule("favorite", "is", True)),
        )
        assert titles(payload) == ["Strobe"]

    def test_the_effective_rating_crosses_the_wire(self, engine, organized):  # noqa: F811
        # DEC-057 through the whole stack: track 2 is 3 stars in Rekordbox and
        # 5 in CuePoint, and "rated 5" is what a user would mean by it.
        payload = get_json(
            engine,
            "/api/v1/library/search",
            mode="browse",
            filters=_filters(rule("rating", "is", 5)),
        )
        assert titles(payload) == ["Ghosts n Stuff", "Strobe"]

    def test_either_layer_is_addressable_by_name(self, engine, organized):  # noqa: F811
        imported = get_json(
            engine,
            "/api/v1/library/search",
            mode="browse",
            filters=_filters(rule("rating_rekordbox", "is", 3)),
        )
        assert titles(imported) == ["Ghosts n Stuff"]

        mine = get_json(
            engine,
            "/api/v1/library/search",
            mode="browse",
            filters=_filters(rule("cuepoint_rating", "is", 5)),
        )
        assert titles(mine) == ["Ghosts n Stuff"]

    def test_notes(self, engine, organized):  # noqa: F811
        payload = get_json(
            engine,
            "/api/v1/library/search",
            mode="browse",
            filters=_filters(rule("notes", "contains", "heavy")),
        )
        assert titles(payload) == ["Strobe"]

    def test_they_compose_with_a_text_query_and_an_old_filter(self, engine, organized):  # noqa: F811
        payload = get_json(
            engine,
            "/api/v1/library/search",
            mode="browse",
            q="Strobe",
            filters=_filters(
                rule("tag", "has_tag", organized["tags"]["peak"]),
                rule("genre", "is", "House"),
            ),
        )
        assert titles(payload) == ["Strobe"]
        assert payload["total"] == 1

    def test_the_ids_projection_agrees_with_the_rows(self, engine, organized):  # noqa: F811
        filters = _filters(rule("tag", "has_tag", organized["tags"]["peak"]))
        rows = get_json(
            engine, "/api/v1/library/search", mode="browse", filters=filters
        )
        ids = get_json(
            engine,
            "/api/v1/library/search",
            mode="browse",
            fields="id",
            filters=filters,
        )
        assert ids["track_ids"] == [track["id"] for track in rows["tracks"]]
        assert ids["total"] == rows["total"]


@pytest.mark.unit
class TestARuleThatCannotBeHonoured:
    """A 400 with a message, never a 500 and never an empty table.

    An empty answer is the failure mode DEC-060 exists to avoid: a Smart
    Collection filtering on a deleted Collection that quietly matches nothing
    reads exactly like one whose rules are too narrow.
    """

    def test_a_deleted_tag_is_a_400(self, engine, organized):  # noqa: F811
        status, payload = get_error(
            engine,
            "/api/v1/library/search",
            mode="browse",
            filters=_filters(rule("tag", "has_tag", 9999)),
        )
        assert status == 400
        assert payload["error"]["code"] == "INVALID_REQUEST"

    def test_the_refusal_names_the_clause(self, engine, organized):  # noqa: F811
        # A user with six filters on screen has to be told which one.
        _, payload = get_error(
            engine,
            "/api/v1/library/search",
            mode="browse",
            filters=_filters(rule("tag", "not_has_tag", 9999)),
        )
        message = payload["error"]["message"]
        assert "Tag" in message
        assert "not_has_tag" in message
        assert "no longer exists" in message

    def test_a_deleted_collection_is_a_400(self, engine, organized):  # noqa: F811
        status, payload = get_error(
            engine,
            "/api/v1/library/search",
            mode="browse",
            filters=_filters(rule("collection", "in_collection", 9999)),
        )
        assert status == 400
        assert "no longer exists" in payload["error"]["message"]

    def test_a_smart_collection_is_a_400_naming_it(self, engine, organized):  # noqa: F811
        status, payload = get_error(
            engine,
            "/api/v1/library/search",
            mode="browse",
            filters=_filters(rule("collection", "in_collection", organized["smart"])),
        )
        assert status == 400
        assert "Smart Collection" in payload["error"]["message"]
        assert "Rated five" in payload["error"]["message"]

    def test_an_id_that_is_not_one_is_a_400(self, engine, organized):  # noqa: F811
        status, payload = get_error(
            engine,
            "/api/v1/library/search",
            mode="browse",
            filters=_filters(rule("tag", "has_tag", "Peak time")),
        )
        assert status == 400
        assert "id" in payload["error"]["message"]

    def test_a_yes_no_that_is_neither_is_a_400(self, engine, organized):  # noqa: F811
        status, payload = get_error(
            engine,
            "/api/v1/library/search",
            mode="browse",
            filters=_filters(rule("favorite", "is", "maybe")),
        )
        assert status == 400
        assert "Favorite" in payload["error"]["message"]

    def test_the_ids_projection_refuses_the_same_way(self, engine, organized):  # noqa: F811
        # The same predicate through a different projection; a check only the
        # row query made would let this one through.
        status, _ = get_error(
            engine,
            "/api/v1/library/search",
            mode="browse",
            fields="id",
            filters=_filters(rule("tag", "has_tag", 9999)),
        )
        assert status == 400

    def test_the_facet_endpoint_refuses_the_same_way(self, engine, organized):  # noqa: F811
        status, _ = get_error(
            engine,
            "/api/v1/library/facets",
            field="genre",
            filters=_filters(rule("collection", "in_collection", organized["smart"])),
        )
        assert status == 400

    def test_a_deleted_tag_is_refused_after_it_is_deleted(self, engine, organized):  # noqa: F811
        """The lifecycle, not just a made-up id: it worked, then it did not."""
        from cuepoint.services.interfaces import ITagService
        from cuepoint.utils.di_container import get_container

        filters = _filters(rule("tag", "has_tag", organized["tags"]["vocal"]))
        assert (
            get_json(engine, "/api/v1/library/search", mode="browse", filters=filters)[
                "total"
            ]
            == 1
        )

        get_container().resolve(ITagService).delete(organized["tags"]["vocal"])

        status, payload = get_error(
            engine, "/api/v1/library/search", mode="browse", filters=filters
        )
        assert status == 400
        assert "no longer exists" in payload["error"]["message"]


@pytest.mark.unit
class TestTheTagFacetOverTheWire:
    def test_it_answers_with_ids_and_names(self, engine, organized):  # noqa: F811
        payload = get_json(engine, "/api/v1/library/facets", field="tag")
        named = [v for v in payload["values"] if v["value"] is not None]
        assert [(v["value"], v["label"], v["count"]) for v in named] == [
            (str(organized["tags"]["peak"]), "Peak time", 2),
            (str(organized["tags"]["vocal"]), "Vocal", 1),
        ]

    def test_the_untagged_bucket_is_there(self, engine, organized):  # noqa: F811
        payload = get_json(engine, "/api/v1/library/facets", field="tag")
        assert payload["values"][-1] == {"value": None, "count": 2}
        assert payload["total_values"] == 3

    def test_a_chip_built_from_it_matches_what_it_counted(self, engine, organized):  # noqa: F811
        """The promise a facet makes, asserted across two requests.

        The facet groups and the rule filters — different SQL — so nothing but
        this keeps "Peak time (2)" from showing three tracks.
        """
        facet = get_json(engine, "/api/v1/library/facets", field="tag")
        for value in facet["values"]:
            if value["value"] is None:
                continue
            found = get_json(
                engine,
                "/api/v1/library/search",
                mode="browse",
                filters=_filters(rule("tag", "has_tag", value["value"])),
            )
            assert found["total"] == value["count"], value["label"]

    def test_it_carries_no_range(self, engine, organized):  # noqa: F811
        # A range is a question about a number. A tag is not one.
        assert get_json(engine, "/api/v1/library/facets", field="tag")["range"] is None

    def test_a_favorite_facet_has_two_buckets(self, engine, organized):  # noqa: F811
        payload = get_json(engine, "/api/v1/library/facets", field="favorite")
        assert [(v["value"], v["count"]) for v in payload["values"]] == [
            ("0", 3),
            ("1", 1),
        ]

    def test_a_rating_facet_counts_the_effective_value(self, engine, organized):  # noqa: F811
        payload = get_json(engine, "/api/v1/library/facets", field="rating")
        assert [(v["value"], v["count"]) for v in payload["values"]] == [
            ("5", 2),
            ("1", 1),
            (None, 1),
        ]

    def test_a_plain_facet_value_carries_no_label(self, engine, organized):  # noqa: F811
        # `label` is absent rather than null for a field that is its own label,
        # so an existing consumer sees the object it has always seen.
        payload = get_json(engine, "/api/v1/library/facets", field="genre")
        assert all("label" not in value for value in payload["values"])

    def test_choosing_a_tag_leaves_the_others_choosable(self, engine, organized):  # noqa: F811
        chosen = _filters(rule("tag", "has_tag", organized["tags"]["vocal"]))
        narrowed = get_json(
            engine, "/api/v1/library/facets", field="tag", filters=chosen
        )
        assert narrowed == get_json(engine, "/api/v1/library/facets", field="tag")

    def test_another_filter_still_narrows_it(self, engine, organized):  # noqa: F811
        payload = get_json(
            engine,
            "/api/v1/library/facets",
            field="tag",
            filters=_filters(rule("favorite", "is", True)),
        )
        named = {v["label"]: v["count"] for v in payload["values"] if v["value"]}
        assert named == {"Peak time": 1, "Vocal": 1}
