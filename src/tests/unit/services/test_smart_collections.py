#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Smart Collections: a saved question, evaluated live (ORG-06, DEC-061).

Every test here is about one of four claims, and each one is a bug that is easy
to ship.

**A saved rule set finds exactly what the unsaved one finds.** DEC-043 says the
filter bar and a Smart Collection share one rule model; the way that stops being
true is a second query path built "just for saved rules", which then disagrees
about a null, a collation or a tiebreak. So the promise is asserted end to end —
the same rules, saved and unsaved, down to the order of the ids.

**Nothing is materialized.** A Smart Collection with no membership table has
nothing to invalidate, which is the whole of DEC-061. The failure mode is a
well-meaning cache, so the tests sweep ``collection_tracks`` after every
operation rather than trusting that nobody wrote one.

**Broken is a state, not an empty answer.** A Smart Collection whose rules name
a deleted tag must not read as "matches nothing", which looks exactly like rules
that are too narrow. And it must not read as "matches everything" either: rules
that cannot be parsed come back as an empty rule set unless something refuses
them, and an empty rule set is the whole library. Both directions are tested.

**A freeze is a copy and stops there.** Same tracks, same order, and then the
two never speak again — which is only interesting after the library moves, so
the tests move it.
"""

from __future__ import annotations

import json

import pytest

from cuepoint.models.collection import (
    KIND_COLLECTION,
    KIND_SMART,
    MAX_COLLECTION_NAME_LENGTH,
)
from cuepoint.models.filter_rule import FilterRule, FilterRuleError, RuleSet
from cuepoint.models.library_track import LibraryTrack
from cuepoint.persistence.activity_repository import ActivityRepository
from cuepoint.persistence.collection_repository import CollectionRepository
from cuepoint.persistence.rule_references import BrokenRuleError
from cuepoint.persistence.tag_repository import TagRepository
from cuepoint.persistence.track_query import BrowseQuery, BrowseQueryError
from cuepoint.persistence.track_repository import TrackRepository
from cuepoint.services.activity_service import ActivityService
from cuepoint.services.collection_service import (
    EVENT_COLLECTION_FROZEN,
    CollectionService,
    FreezeResult,
    SmartResolution,
)
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.migration_runner import MigrationRunner
from cuepoint.services.tag_service import TagService

TRACK_COUNT = 12


@pytest.fixture
def db(tmp_path):
    service = DatabaseService(db_path=tmp_path / "cuepoint.db")
    MigrationRunner(service).migrate()
    yield service
    service.close_all()


@pytest.fixture
def tracks(db) -> TrackRepository:
    repo = TrackRepository(db)
    repo.add_many(
        [
            LibraryTrack(
                rekordbox_track_id=str(i),
                file_path=f"/music/{i:02d}.mp3",
                title=f"Track {i:02d}",
                artist=f"Artist {i % 3}",
                genre="House" if i % 2 else "Techno",
                bpm=120.0 + i,
            )
            for i in range(1, TRACK_COUNT + 1)
        ]
    )
    return repo


@pytest.fixture
def ids(db, tracks):
    rows = db.connect().execute("SELECT id FROM tracks ORDER BY id").fetchall()
    return [int(row["id"]) for row in rows]


@pytest.fixture
def activity(db, tracks) -> ActivityService:
    return ActivityService(ActivityRepository(db), tracks)


@pytest.fixture
def tags(db, activity) -> TagService:
    return TagService(TagRepository(db), activity, db)


@pytest.fixture
def service(db, tracks, activity) -> CollectionService:
    return CollectionService(CollectionRepository(db), db, tracks, activity)


@pytest.fixture
def peak(tags, ids):
    """A tag on the first four tracks."""
    tag = tags.create_or_get("Peak time")
    tags.assign(ids[:4], tag.id)
    return tag


@pytest.fixture
def peak_rules(peak) -> RuleSet:
    return RuleSet(rules=(FilterRule("tag", "has_tag", peak.id),))


@pytest.fixture
def smart(service, peak_rules):
    return service.create_smart("Peak time", peak_rules)


def membership_rows(db, collection_id: int) -> int:
    """How many rows ``collection_tracks`` holds for a node."""
    row = (
        db.connect()
        .execute(
            "SELECT count(*) AS n FROM collection_tracks WHERE collection_id = ?",
            (int(collection_id),),
        )
        .fetchone()
    )
    return int(row["n"])


def stored(db, collection_id: int, column: str):
    """Read one column of one node straight from the table."""
    row = (
        db.connect()
        .execute(
            f"SELECT {column} AS value FROM collections WHERE id = ?",
            (int(collection_id),),
        )
        .fetchone()
    )
    return None if row is None else row["value"]


def track_ids_in(service, collection_id: int):
    return [entry.track_id for entry in service.entries(collection_id)]


# ---------------------------------------------------------------------------
# Saving
# ---------------------------------------------------------------------------


class TestSaving:
    def test_a_saved_rule_set_is_a_smart_node(self, service, smart):
        assert (smart.kind, smart.parent_id, smart.name) == (
            KIND_SMART,
            None,
            "Peak time",
        )

    def test_the_rules_are_stored_as_the_validated_rule_set(self, db, smart, peak):
        assert json.loads(stored(db, smart.id, "rules_json")) == {
            "match": "all",
            "rules": [{"field": "tag", "operator": "has_tag", "value": peak.id}],
        }

    def test_saving_stores_no_membership(self, db, smart):
        assert membership_rows(db, smart.id) == 0

    def test_a_value_is_stored_in_the_type_its_field_holds(self, service):
        # A number arrives as text from a query string and as a number from a
        # facet, and both mean the same filter. Storing whichever arrived would
        # put two different rows in the database for one question.
        node = service.create_smart(
            "Fast", RuleSet(rules=(FilterRule("bpm", "gte", "128"),), match="ALL")
        )
        assert json.loads(node.rules_json) == {
            "match": "all",
            "rules": [{"field": "bpm", "operator": "gte", "value": 128.0}],
        }

    def test_the_same_filter_written_two_ways_is_stored_the_same_way(self, service):
        text = service.create_smart(
            "A", RuleSet(rules=(FilterRule("bpm", "gte", "128"),))
        )
        number = service.create_smart(
            "B", RuleSet(rules=(FilterRule("bpm", "gte", 128),))
        )
        assert text.rules_json == number.rules_json

    def test_it_can_live_in_a_folder(self, service, peak_rules):
        folder = service.create_folder("Sets")
        node = service.create_smart("Peak", peak_rules, parent_id=folder.id)
        assert (node.parent_id, node.depth) == (folder.id, 1)

    def test_a_collection_cannot_contain_one(self, service, peak_rules):
        warmups = service.create_collection("Warmups")
        with pytest.raises(ValueError, match="only a folder"):
            service.create_smart("Peak", peak_rules, parent_id=warmups.id)

    def test_an_empty_rule_set_is_refused(self, service):
        # Not pedantry: an empty filter matches every track, so this would save
        # the whole library under a name chosen for a handful of it.
        with pytest.raises(FilterRuleError, match="at least one rule"):
            service.create_smart("Everything", RuleSet())

    def test_a_rule_naming_a_deleted_tag_is_refused_while_it_is_visible(
        self, service, tags, peak, peak_rules
    ):
        tags.delete(peak.id)
        with pytest.raises(BrokenRuleError, match="no longer exists"):
            service.create_smart("Peak", peak_rules)

    def test_a_rule_naming_a_deleted_collection_is_refused(self, service):
        warmups = service.create_collection("Warmups")
        service.delete(warmups.id)
        with pytest.raises(BrokenRuleError, match="no longer exists"):
            service.create_smart(
                "In warmups",
                RuleSet(rules=(FilterRule("collection", "in_collection", warmups.id),)),
            )

    def test_a_rule_may_not_name_a_smart_collection(self, service, smart):
        # DEC-060. The refusal is what makes recursion, cycle detection and a
        # bound on evaluation time unnecessary rather than unwritten.
        with pytest.raises(FilterRuleError, match="Smart Collection"):
            service.create_smart(
                "Nested",
                RuleSet(rules=(FilterRule("collection", "in_collection", smart.id),)),
            )

    def test_a_rule_may_not_name_a_smart_collection_on_update(
        self, service, smart, peak_rules
    ):
        other = service.create_smart("Other", peak_rules)
        with pytest.raises(FilterRuleError, match="Smart Collection"):
            service.update_rules(
                other.id,
                RuleSet(rules=(FilterRule("collection", "in_collection", smart.id),)),
            )

    def test_a_rule_may_name_a_frozen_collection(self, service, smart):
        # A frozen Collection is rows, not a question, so filtering on it is a
        # fact about a track. The refusal above is about kind, not provenance.
        frozen = service.freeze(smart.id)
        node = service.create_smart(
            "In the frozen one",
            RuleSet(
                rules=(FilterRule("collection", "in_collection", frozen.collection.id),)
            ),
        )
        assert node.id is not None

    def test_a_malformed_rule_is_refused_by_name(self, service):
        with pytest.raises(FilterRuleError, match="nonsense"):
            service.create_smart(
                "Bad", RuleSet(rules=(FilterRule("nonsense", "is", "x"),))
            )

    def test_the_saved_sort_is_stored(self, service, peak_rules):
        node = service.create_smart("Peak", peak_rules, sort="bpm", direction="desc")
        assert (node.sort_field, node.sort_dir) == ("bpm", "desc")

    def test_no_sort_stores_no_sort(self, db, smart):
        # Different from saving the default: a Smart Collection with no order of
        # its own opens in whatever order the page is already showing.
        assert (
            stored(db, smart.id, "sort_field"),
            stored(db, smart.id, "sort_dir"),
        ) == (
            None,
            None,
        )

    def test_a_direction_alone_saves_the_default_order(self, service, peak_rules):
        node = service.create_smart("Peak", peak_rules, direction="desc")
        assert (node.sort_field, node.sort_dir) == ("artist", "desc")

    def test_an_unknown_sort_is_refused(self, service, peak_rules):
        with pytest.raises(BrowseQueryError, match="Cannot sort by 'loudness'"):
            service.create_smart("Peak", peak_rules, sort="loudness")

    def test_a_playlist_position_sort_is_refused_with_the_reason(
        self, service, peak_rules
    ):
        # It would otherwise be refused at the first browse instead, with a
        # message about a missing playlist, against something saved days ago.
        with pytest.raises(BrowseQueryError, match="position inside a playlist"):
            service.create_smart("Peak", peak_rules, sort="playlist_position")

    def test_an_unknown_direction_is_refused(self, service, peak_rules):
        with pytest.raises(BrowseQueryError, match="'asc' or 'desc'"):
            service.create_smart("Peak", peak_rules, sort="bpm", direction="sideways")

    def test_the_direction_is_normalized(self, service, peak_rules):
        node = service.create_smart("Peak", peak_rules, sort="bpm", direction="DESC")
        assert node.sort_dir == "desc"

    def test_an_unnamed_smart_collection_is_refused(self, service, peak_rules):
        with pytest.raises(ValueError, match="needs a name"):
            service.create_smart("   ", peak_rules)


# ---------------------------------------------------------------------------
# Updating
# ---------------------------------------------------------------------------


class TestUpdating:
    def test_the_rules_are_replaced(self, service, smart):
        updated = service.update_rules(
            smart.id, RuleSet(rules=(FilterRule("genre", "is", "House"),))
        )
        assert json.loads(updated.rules_json)["rules"] == [
            {"field": "genre", "operator": "is", "value": "House"}
        ]

    def test_updating_writes_no_membership(self, db, service, smart):
        service.update_rules(
            smart.id, RuleSet(rules=(FilterRule("genre", "is", "House"),))
        )
        assert membership_rows(db, smart.id) == 0

    def test_the_sort_is_replaced_too(self, service, smart, peak_rules):
        updated = service.update_rules(
            smart.id, peak_rules, sort="year", direction="desc"
        )
        assert (updated.sort_field, updated.sort_dir) == ("year", "desc")

    def test_omitting_the_sort_clears_it(self, service, peak_rules):
        # Saying nothing about the order means the Smart Collection has none,
        # which is the same thing the create path means by it.
        node = service.create_smart("Peak", peak_rules, sort="bpm")
        cleared = service.update_rules(node.id, peak_rules)
        assert (cleared.sort_field, cleared.sort_dir) == (None, None)

    def test_an_empty_rule_set_is_refused(self, service, smart):
        with pytest.raises(FilterRuleError, match="at least one rule"):
            service.update_rules(smart.id, RuleSet())

    def test_the_old_rules_survive_a_refused_update(self, db, service, smart):
        before = stored(db, smart.id, "rules_json")
        with pytest.raises(FilterRuleError):
            service.update_rules(smart.id, RuleSet())
        assert stored(db, smart.id, "rules_json") == before

    def test_a_collection_has_no_rules_to_update(self, service, peak_rules):
        warmups = service.create_collection("Warmups")
        with pytest.raises(ValueError, match="not a smart collection"):
            service.update_rules(warmups.id, peak_rules)

    def test_a_folder_has_no_rules_to_update(self, service, peak_rules):
        folder = service.create_folder("Sets")
        with pytest.raises(ValueError, match="not a smart collection"):
            service.update_rules(folder.id, peak_rules)

    def test_a_missing_node_is_named(self, service, peak_rules):
        with pytest.raises(ValueError, match="No such collection: 9999"):
            service.update_rules(9999, peak_rules)


# ---------------------------------------------------------------------------
# Resolving — DEC-043's promise, asserted end to end
# ---------------------------------------------------------------------------


class TestResolving:
    def test_the_saved_rules_find_what_the_unsaved_rules_find(
        self, tracks, service, smart, peak_rules
    ):
        unsaved = tracks.browse_ids(BrowseQuery(rules=peak_rules), limit=100)
        saved = tracks.browse_ids(service.resolve(smart.id).require_query(), limit=100)
        assert saved == unsaved and len(saved) == 4

    def test_the_saved_order_is_the_order_it_was_saved_with(
        self, tracks, service, peak_rules
    ):
        node = service.create_smart("Peak", peak_rules, sort="title", direction="desc")
        assert tracks.browse_ids(
            service.resolve(node.id).require_query(), limit=100
        ) == tracks.browse_ids(
            BrowseQuery(rules=peak_rules, sort="title", direction="desc"), limit=100
        )

    def test_without_a_saved_sort_it_resolves_to_the_library_default(
        self, service, smart
    ):
        query = service.resolve(smart.id).require_query()
        assert (query.sort, query.direction) == ("artist", "asc")

    def test_the_resolution_names_the_collection(self, service, smart):
        resolution = service.resolve(smart.id)
        assert (resolution.collection_id, resolution.name) == (smart.id, "Peak time")

    def test_it_is_evaluated_live_rather_than_read_back(
        self, tracks, tags, service, smart, peak, ids
    ):
        before = tracks.browse_ids(service.resolve(smart.id).require_query(), limit=100)
        tags.assign([ids[7]], peak.id)
        after = tracks.browse_ids(service.resolve(smart.id).require_query(), limit=100)
        assert set(after) - set(before) == {ids[7]}

    def test_the_row_is_not_touched_by_the_library_moving(
        self, db, tags, service, smart, peak, ids
    ):
        before = stored(db, smart.id, "updated_at")
        tags.assign([ids[7]], peak.id)
        service.resolve(smart.id)
        assert stored(db, smart.id, "updated_at") == before

    def test_resolving_writes_no_membership(self, db, service, smart):
        service.resolve(smart.id)
        assert membership_rows(db, smart.id) == 0

    def test_a_collection_is_not_a_question(self, service):
        warmups = service.create_collection("Warmups")
        with pytest.raises(ValueError, match="not a smart collection"):
            service.resolve(warmups.id)

    def test_a_missing_node_is_named(self, service):
        with pytest.raises(ValueError, match="No such collection: 9999"):
            service.resolve(9999)


class TestMoreThanOneRule:
    """A rule set is a set, and the mistakes that eat one clause are quiet ones."""

    @pytest.fixture
    def two_rules(self, peak) -> RuleSet:
        return RuleSet(
            rules=(
                FilterRule("tag", "has_tag", peak.id),
                FilterRule("genre", "is", "House"),
            )
        )

    def test_both_clauses_are_stored(self, service, two_rules):
        node = service.create_smart("Peak house", two_rules)
        assert [rule["field"] for rule in json.loads(node.rules_json)["rules"]] == [
            "tag",
            "genre",
        ]

    def test_both_clauses_narrow_the_answer(self, tracks, service, two_rules, peak):
        # Each clause on its own matches more than the pair does, so a saved set
        # that quietly kept one of them would still return tracks — just the
        # wrong ones.
        one = RuleSet(rules=(two_rules.rules[0],))
        other = RuleSet(rules=(two_rules.rules[1],))
        node = service.create_smart("Peak house", two_rules)
        both = tracks.browse_ids(service.resolve(node.id).require_query(), limit=100)
        assert 0 < len(both)
        assert len(both) < len(tracks.browse_ids(BrowseQuery(rules=one), limit=100))
        assert len(both) < len(tracks.browse_ids(BrowseQuery(rules=other), limit=100))

    def test_the_saved_pair_finds_what_the_unsaved_pair_finds(
        self, tracks, service, two_rules
    ):
        node = service.create_smart("Peak house", two_rules)
        assert tracks.browse_ids(
            service.resolve(node.id).require_query(), limit=100
        ) == tracks.browse_ids(BrowseQuery(rules=two_rules), limit=100)

    def test_updating_keeps_every_clause(self, service, smart, two_rules):
        updated = service.update_rules(smart.id, two_rules)
        assert len(json.loads(updated.rules_json)["rules"]) == 2

    def test_duplicating_keeps_every_clause(self, service, two_rules):
        node = service.create_smart("Peak house", two_rules)
        assert service.duplicate(node.id).rules_json == node.rules_json

    def test_freezing_honours_every_clause(self, tracks, service, two_rules):
        node = service.create_smart("Peak house", two_rules)
        expected = tracks.browse_ids(
            service.resolve(node.id).require_query(), limit=100
        )
        frozen = service.freeze(node.id)
        assert track_ids_in(service, frozen.collection.id) == expected

    @pytest.mark.parametrize(
        "rule",
        [
            FilterRule("genre", "is", "House"),
            FilterRule("bpm", "between", [120, 125]),
            FilterRule("favorite", "is", True),
            FilterRule("rating", "gte", 3),
            FilterRule("notes", "contains", "warm"),
            FilterRule("title", "is_empty", None),
        ],
    )
    def test_a_rule_survives_the_column_it_is_stored_in(self, service, rule):
        # Serialization is where a value quietly changes type: a bool written as
        # 1, a list written as a string, a None written as "None".
        node = service.create_smart("Saved", RuleSet(rules=(rule,)))
        restored = service.resolve(node.id).require_query().rules
        assert restored.rules == RuleSet(rules=(rule,)).validated().rules


class TestTheResolutionShape:
    def test_it_is_never_both_an_answer_and_a_reason(self):
        with pytest.raises(ValueError, match="never both"):
            SmartResolution(1, "Peak", query=BrowseQuery(), problem="broken")

    def test_it_is_never_neither(self):
        # The one that matters: a resolution with no query and no reason would
        # be read as "no filters", and no filters is the whole library.
        with pytest.raises(ValueError, match="never neither"):
            SmartResolution(1, "Peak")

    def test_a_working_resolution_hands_over_its_query(self, service, smart):
        resolution = service.resolve(smart.id)
        assert resolution.is_broken is False
        assert resolution.require_query() is resolution.query


# ---------------------------------------------------------------------------
# Broken rules are a reported state
# ---------------------------------------------------------------------------


class TestBroken:
    @pytest.fixture
    def warmups(self, service, ids):
        node = service.create_collection("Warmups")
        service.add_tracks(node.id, ids[:3])
        return node

    @pytest.fixture
    def by_collection(self, service, warmups):
        return service.create_smart(
            "In warmups",
            RuleSet(rules=(FilterRule("collection", "in_collection", warmups.id),)),
        )

    def test_deleting_the_named_collection_breaks_it(
        self, service, warmups, by_collection
    ):
        service.delete(warmups.id)
        assert service.resolve(by_collection.id).is_broken is True

    def test_the_problem_names_the_clause(self, service, warmups, by_collection):
        service.delete(warmups.id)
        problem = service.resolve(by_collection.id).problem
        assert "Collection 'in_collection'" in problem
        assert "no longer exists" in problem

    def test_the_smart_collection_survives_the_delete(
        self, service, warmups, by_collection
    ):
        service.delete(warmups.id)
        assert service.get(by_collection.id) is not None

    def test_deleting_a_named_tag_breaks_it(self, service, tags, smart, peak):
        tags.delete(peak.id)
        assert "no longer exists" in service.resolve(smart.id).problem

    def test_running_a_broken_one_is_refused_with_both_names(
        self, service, warmups, by_collection
    ):
        service.delete(warmups.id)
        with pytest.raises(BrokenRuleError) as caught:
            service.resolve(by_collection.id).require_query()
        assert "In warmups" in str(caught.value)
        assert "in_collection" in str(caught.value)

    def test_the_refusal_is_a_filter_rule_error(self, service, warmups, by_collection):
        # So the handlers that already answer 400 for a bad filter answer this
        # one too, rather than letting it out as a 500.
        service.delete(warmups.id)
        with pytest.raises(FilterRuleError):
            service.resolve(by_collection.id).require_query()

    def test_unreadable_rules_report_rather_than_crash(self, db, service, smart):
        db.connect().execute(
            "UPDATE collections SET rules_json = ? WHERE id = ?",
            ("{not json", smart.id),
        )
        assert "not valid JSON" in service.resolve(smart.id).problem

    def test_rules_that_are_not_an_object_report(self, db, service, smart):
        db.connect().execute(
            "UPDATE collections SET rules_json = ? WHERE id = ?", ("[1, 2]", smart.id)
        )
        resolution = service.resolve(smart.id)
        assert resolution.query is None
        assert "must be an object" in resolution.problem

    def test_rules_stored_as_json_null_report_rather_than_matching_everything(
        self, db, service, smart
    ):
        # ``RuleSet.from_dict(None)`` is an empty rule set by design, because a
        # renderer that has never opened the filter bar is asking for no filters.
        # Read off a Smart Collection's own column it means the opposite.
        db.connect().execute(
            "UPDATE collections SET rules_json = ? WHERE id = ?", ("null", smart.id)
        )
        resolution = service.resolve(smart.id)
        assert resolution.query is None
        assert "whole library" in resolution.problem

    def test_an_empty_stored_rule_set_reports_rather_than_matching_everything(
        self, db, service, smart
    ):
        # The direction nobody looks for. An empty rule set is not "no tracks",
        # it is every track, so a Smart Collection whose rules were lost would
        # silently become the whole library.
        db.connect().execute(
            "UPDATE collections SET rules_json = ? WHERE id = ?",
            ('{"match": "all", "rules": []}', smart.id),
        )
        resolution = service.resolve(smart.id)
        assert resolution.query is None
        assert "whole library" in resolution.problem

    def test_a_rule_on_a_field_that_left_the_vocabulary_reports(
        self, db, service, smart
    ):
        db.connect().execute(
            "UPDATE collections SET rules_json = ? WHERE id = ?",
            (
                '{"match": "all", "rules": [{"field": "loudness", "operator": "is", '
                '"value": 3}]}',
                smart.id,
            ),
        )
        assert "loudness" in service.resolve(smart.id).problem

    def test_a_saved_order_that_cannot_be_run_reports(self, db, service, smart):
        db.connect().execute(
            "UPDATE collections SET sort_field = ? WHERE id = ?",
            ("playlist_position", smart.id),
        )
        assert "needs a playlist" in service.resolve(smart.id).problem

    def test_freezing_a_broken_one_is_refused(self, service, warmups, by_collection):
        # Freezing it would store "no tracks" as though that were the answer.
        service.delete(warmups.id)
        with pytest.raises(BrokenRuleError):
            service.freeze(by_collection.id)

    def test_a_refused_freeze_leaves_no_collection_behind(
        self, service, warmups, by_collection
    ):
        service.delete(warmups.id)
        before = len(service.tree())
        with pytest.raises(BrokenRuleError):
            service.freeze(by_collection.id)
        assert len(service.tree()) == before


# ---------------------------------------------------------------------------
# Duplicating
# ---------------------------------------------------------------------------


class TestDuplicating:
    def test_the_copy_carries_the_same_rules_and_order(self, service, peak_rules):
        node = service.create_smart("Peak", peak_rules, sort="bpm", direction="desc")
        copy = service.duplicate(node.id)
        assert (copy.rules_json, copy.sort_field, copy.sort_dir) == (
            node.rules_json,
            "bpm",
            "desc",
        )

    def test_it_is_a_second_node(self, service, smart):
        copy = service.duplicate(smart.id)
        assert copy.id != smart.id and copy.kind == KIND_SMART

    def test_it_lands_under_the_same_parent(self, service, peak_rules):
        folder = service.create_folder("Sets")
        node = service.create_smart("Peak", peak_rules, parent_id=folder.id)
        assert service.duplicate(node.id).parent_id == folder.id

    def test_the_default_name_says_it_is_a_copy(self, service, smart):
        assert service.duplicate(smart.id).name == "Peak time copy"

    def test_a_name_at_the_limit_still_duplicates(self, service, peak_rules):
        # The suffix would otherwise push the name past the cap and fail with a
        # message about name length, for something the user did not type.
        long_name = "N" * MAX_COLLECTION_NAME_LENGTH
        node = service.create_smart(long_name, peak_rules)
        copy = service.duplicate(node.id)
        assert len(copy.name) <= MAX_COLLECTION_NAME_LENGTH
        assert copy.name.endswith(" copy")

    def test_an_explicit_name_is_used(self, service, smart):
        assert service.duplicate(smart.id, name="Closers").name == "Closers"

    def test_editing_the_copy_leaves_the_original_alone(self, service, smart):
        copy = service.duplicate(smart.id)
        service.update_rules(
            copy.id, RuleSet(rules=(FilterRule("genre", "is", "House"),))
        )
        assert service.get(smart.id).rules_json == smart.rules_json

    def test_editing_the_original_leaves_the_copy_alone(self, service, smart):
        copy = service.duplicate(smart.id)
        service.update_rules(
            smart.id, RuleSet(rules=(FilterRule("genre", "is", "Techno"),))
        )
        assert service.get(copy.id).rules_json == smart.rules_json

    def test_renaming_the_original_leaves_the_copy_alone(self, service, smart):
        copy = service.duplicate(smart.id)
        service.rename(smart.id, "Renamed")
        assert service.get(copy.id).name == "Peak time copy"

    def test_the_copy_holds_no_membership(self, db, service, smart):
        copy = service.duplicate(smart.id)
        assert membership_rows(db, copy.id) == 0

    def test_a_broken_one_can_still_be_copied(self, service, tags, smart, peak):
        # Refusing here would refuse a copy at exactly the moment somebody wants
        # one to repair.
        tags.delete(peak.id)
        copy = service.duplicate(smart.id)
        assert service.resolve(copy.id).is_broken is True

    def test_a_collection_is_not_duplicated_here(self, service, ids):
        warmups = service.create_collection("Warmups")
        service.add_tracks(warmups.id, ids[:2])
        with pytest.raises(ValueError, match="not a smart collection"):
            service.duplicate(warmups.id)

    def test_a_folder_is_not_duplicated_here(self, service):
        folder = service.create_folder("Sets")
        with pytest.raises(ValueError, match="not a smart collection"):
            service.duplicate(folder.id)


# ---------------------------------------------------------------------------
# Freezing
# ---------------------------------------------------------------------------


class TestFreezing:
    def test_it_produces_a_collection(self, service, smart):
        frozen = service.freeze(smart.id).collection
        assert frozen.kind == KIND_COLLECTION and frozen.is_smart is False

    def test_it_lands_beside_its_source(self, service, peak_rules):
        folder = service.create_folder("Sets")
        node = service.create_smart("Peak", peak_rules, parent_id=folder.id)
        assert service.freeze(node.id).collection.parent_id == folder.id

    def test_it_holds_the_same_tracks_in_the_same_order(
        self, tracks, service, peak_rules
    ):
        node = service.create_smart("Peak", peak_rules, sort="title", direction="desc")
        expected = tracks.browse_ids(
            service.resolve(node.id).require_query(), limit=100
        )
        frozen = service.freeze(node.id)
        assert track_ids_in(service, frozen.collection.id) == expected

    def test_it_reports_its_count(self, service, smart):
        result = service.freeze(smart.id)
        assert result.track_count == 4
        assert service.counts(result.collection.id) == (4, 4)

    def test_it_records_where_it_came_from(self, service, smart):
        result = service.freeze(smart.id)
        assert result.collection.frozen_from_id == smart.id
        assert result.collection.frozen_at
        assert result.collection.was_frozen is True

    def test_it_keeps_the_rules_it_came_from(self, service, smart):
        # frozen_from_id is deliberately not a foreign key, so the source can go
        # away; provenance that says "frozen from #7" with no #7 says nothing.
        assert service.freeze(smart.id).collection.rules_json == smart.rules_json

    def test_carrying_rules_does_not_make_it_smart(self, service, smart, ids):
        frozen = service.freeze(smart.id).collection
        with pytest.raises(ValueError, match="not a smart collection"):
            service.resolve(frozen.id)
        # And it is an ordinary Collection, editable by hand.
        assert service.add_tracks(frozen.id, [ids[-1]]).added == 1

    def test_the_default_name_says_it_is_frozen(self, service, smart):
        assert service.freeze(smart.id).collection.name == "Peak time (frozen)"

    def test_an_explicit_name_is_used(self, service, smart):
        assert service.freeze(smart.id, name="Set list").collection.name == "Set list"

    def test_a_name_at_the_limit_still_freezes(self, service, peak_rules):
        node = service.create_smart("N" * MAX_COLLECTION_NAME_LENGTH, peak_rules)
        name = service.freeze(node.id).collection.name
        assert len(name) <= MAX_COLLECTION_NAME_LENGTH and name.endswith(" (frozen)")

    def test_the_result_remembers_its_source_by_name(self, service, smart):
        result = service.freeze(smart.id)
        assert (result.source_id, result.source_name) == (smart.id, "Peak time")
        assert isinstance(result, FreezeResult)

    def test_the_library_moving_moves_the_smart_one_and_not_the_frozen_one(
        self, tracks, tags, service, smart, peak, ids
    ):
        frozen = service.freeze(smart.id)
        tags.assign([ids[9]], peak.id)
        live = tracks.browse_ids(service.resolve(smart.id).require_query(), limit=100)
        assert ids[9] in live
        assert ids[9] not in track_ids_in(service, frozen.collection.id)

    def test_deleting_the_source_leaves_the_frozen_collection(self, service, smart):
        frozen = service.freeze(smart.id)
        service.delete(smart.id)
        kept = service.get(frozen.collection.id)
        assert kept is not None
        assert kept.frozen_from_id == smart.id
        assert service.counts(frozen.collection.id) == (4, 4)

    def test_the_smart_collection_still_holds_nothing_afterwards(
        self, db, service, smart
    ):
        service.freeze(smart.id)
        assert membership_rows(db, smart.id) == 0

    def test_freezing_twice_makes_two_independent_collections(self, service, smart):
        first = service.freeze(smart.id).collection
        second = service.freeze(smart.id).collection
        assert first.id != second.id
        assert track_ids_in(service, first.id) == track_ids_in(service, second.id)

    def test_freezing_a_rule_that_matches_nothing_is_an_empty_collection(self, service):
        node = service.create_smart(
            "Nothing", RuleSet(rules=(FilterRule("genre", "is", "Gabber"),))
        )
        result = service.freeze(node.id)
        assert result.track_count == 0
        assert service.counts(result.collection.id) == (0, 0)

    def test_a_collection_cannot_be_frozen(self, service):
        warmups = service.create_collection("Warmups")
        with pytest.raises(ValueError, match="not a smart collection"):
            service.freeze(warmups.id)

    def test_it_reads_every_page_of_a_large_answer(
        self, monkeypatch, service, smart, tracks
    ):
        # The cap on one ``browse_ids`` request is real, and an unpaged read
        # would freeze the first page of a larger library and call it the
        # answer. Driven with a tiny page rather than a huge library.
        monkeypatch.setattr("cuepoint.services.collection_service.FREEZE_PAGE_SIZE", 2)
        expected = tracks.browse_ids(
            service.resolve(smart.id).require_query(), limit=100
        )
        frozen = service.freeze(smart.id)
        assert track_ids_in(service, frozen.collection.id) == expected

    def test_a_page_sized_answer_still_terminates(self, monkeypatch, service, smart):
        # The off-by-one that hangs: four matches read two at a time ends on a
        # full page, so the loop has to ask once more and get nothing.
        monkeypatch.setattr("cuepoint.services.collection_service.FREEZE_PAGE_SIZE", 4)
        assert service.freeze(smart.id).track_count == 4


class TestFreezingIsOneThing:
    def test_it_records_one_event_with_the_count(self, activity, service, smart):
        service.freeze(smart.id)
        events = activity.recent_events(limit=10, event_type=EVENT_COLLECTION_FROZEN)
        assert len(events) == 1
        assert events[0].detail["tracks"] == 4
        assert events[0].detail["smart_collection_id"] == smart.id

    def test_the_summary_names_both_collections(self, activity, service, smart):
        service.freeze(smart.id, name="Set list")
        summary = activity.recent_events(limit=1)[0].summary
        assert "Peak time" in summary and "Set list" in summary

    def test_one_track_is_not_reported_as_one_tracks(self, activity, service, ids):
        node = service.create_smart(
            "Just one", RuleSet(rules=(FilterRule("title", "is", "Track 01"),))
        )
        service.freeze(node.id)
        assert activity.recent_events(limit=1)[0].summary.endswith("1 track")

    def test_a_freeze_that_cannot_be_recorded_is_not_half_done(
        self, db, service, smart
    ):
        # The event is written inside the freeze's own transaction, so a freeze
        # that is missing from the feed is missing from the tree as well —
        # rather than leaving a Collection nobody can account for.
        before = len(service.tree())

        class Refuses:
            def record_event(self, *args, **kwargs):
                raise RuntimeError("the feed is unavailable")

        unrecordable = CollectionService(
            CollectionRepository(db), db, TrackRepository(db), Refuses()
        )
        with pytest.raises(RuntimeError):
            unrecordable.freeze(smart.id)
        assert len(service.tree()) == before
        assert (
            db.connect()
            .execute("SELECT count(*) AS n FROM collection_tracks")
            .fetchone()["n"]
            == 0
        )


# ---------------------------------------------------------------------------
# Membership stays a question (DEC-061)
# ---------------------------------------------------------------------------


class TestMembershipIsRefused:
    def test_tracks_cannot_be_added(self, service, smart, ids):
        with pytest.raises(ValueError, match="comes from its rules"):
            service.add_tracks(smart.id, ids[:2])

    def test_a_track_cannot_be_inserted(self, service, smart, ids):
        with pytest.raises(ValueError, match="comes from its rules"):
            service.insert_track(smart.id, ids[0], 0)

    def test_no_operation_writes_a_membership_row(
        self, db, tracks, service, smart, peak_rules
    ):
        # The sweep. DEC-061's risk is a well-meaning cache, and the first person
        # to see the same query run twice will want to store the answer.
        service.update_rules(smart.id, peak_rules, sort="bpm")
        service.rename(smart.id, "Renamed")
        copy = service.duplicate(smart.id)
        tracks.browse_ids(service.resolve(smart.id).require_query(), limit=100)
        tracks.browse(service.resolve(copy.id).require_query(), limit=100)
        service.freeze(smart.id)
        row = (
            db.connect()
            .execute(
                "SELECT count(*) AS n FROM collection_tracks"
                " WHERE collection_id IN (?, ?)",
                (smart.id, copy.id),
            )
            .fetchone()
        )
        assert int(row["n"]) == 0


# ---------------------------------------------------------------------------
# The rest of the tree still applies
# ---------------------------------------------------------------------------


class TestItIsStillANode:
    def test_it_can_be_renamed_without_losing_its_rules(self, service, smart):
        renamed = service.rename(smart.id, "Closers")
        assert (renamed.name, renamed.rules_json) == ("Closers", smart.rules_json)

    def test_it_can_be_moved_into_a_folder(self, service, smart):
        folder = service.create_folder("Sets")
        moved = service.move(smart.id, folder.id)
        assert (moved.parent_id, moved.depth) == (folder.id, 1)

    def test_it_cannot_be_a_parent(self, service, smart):
        with pytest.raises(ValueError, match="only a folder"):
            service.create_collection("Inside", parent_id=smart.id)

    def test_deleting_it_removes_no_tracks_and_no_collections(
        self, db, service, smart, ids
    ):
        warmups = service.create_collection("Warmups")
        service.add_tracks(warmups.id, ids[:3])
        service.delete(smart.id)
        assert service.get(warmups.id) is not None
        assert service.counts(warmups.id) == (3, 3)
        assert (
            db.connect().execute("SELECT count(*) AS n FROM tracks").fetchone()["n"]
            == TRACK_COUNT
        )

    def test_the_delete_preview_counts_it_as_a_smart_collection(self, service, smart):
        folder = service.create_folder("Sets")
        service.move(smart.id, folder.id)
        summary = service.delete_preview(folder.id)
        assert (summary.folders, summary.smart_collections, summary.entries) == (
            1,
            1,
            0,
        )

    def test_deleting_a_folder_takes_the_smart_collection_and_no_tracks(
        self, db, service, smart
    ):
        folder = service.create_folder("Sets")
        service.move(smart.id, folder.id)
        service.delete(folder.id)
        assert service.get(smart.id) is None
        assert (
            db.connect().execute("SELECT count(*) AS n FROM tracks").fetchone()["n"]
            == TRACK_COUNT
        )
