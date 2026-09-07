#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""What a membership rule names, and whether it may (ORG-05, DEC-060).

A tag rule and a Collection rule carry an id. An id survives a rename, which is
why it is stored — but it can also name a row that is gone, and a filter that
answered "nothing" for a deleted Collection would read exactly like a filter
whose Collection happens to be empty.

Two refusals are tested here, and the difference between them matters:

**A deleted tag or Collection is a broken rule.** ``BrokenRuleError``, which
ORG-06 turns into a visible state on a Smart Collection rather than a silently
empty result.

**A Smart Collection may not be named by a rule at all** (DEC-060). It is a
question, not a list of tracks. A rule filtering on another rule's current
answer would need recursion, cycle detection and a bound on evaluation; one
lookup buys all three. That is a plain ``FilterRuleError``, because the rule is
wrong rather than stale — deleting nothing would fix it.

The third thing tested here is that **every read refuses**. A check one entry
point skips is a check that does not exist: a filter refused in the table but
allowed in a facet would come back as an empty tag list instead of a message.
"""

from __future__ import annotations

import pytest

from cuepoint.models.collection import Collection
from cuepoint.models.filter_rule import FilterRule, FilterRuleError, RuleSet
from cuepoint.models.library_track import LibraryTrack
from cuepoint.persistence.activity_repository import ActivityRepository
from cuepoint.persistence.collection_repository import CollectionRepository
from cuepoint.persistence.rule_references import (
    BrokenRuleError,
    check_rule_references,
    rule_ids,
)
from cuepoint.persistence.tag_repository import TagRepository
from cuepoint.persistence.track_query import BrowseQuery
from cuepoint.persistence.track_repository import TrackRepository
from cuepoint.services.activity_service import ActivityService
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.migration_runner import MigrationRunner
from cuepoint.services.tag_service import TagService


@pytest.fixture
def db(tmp_path):
    service = DatabaseService(db_path=tmp_path / "cuepoint.db")
    MigrationRunner(service).migrate()
    yield service
    service.close_all()


@pytest.fixture
def tracks(db) -> TrackRepository:
    tracks = TrackRepository(db)
    tracks.add_many(
        [
            LibraryTrack(
                rekordbox_track_id=str(n),
                file_path=f"/music/{n}.mp3",
                title=f"Title {n}",
                artist="Artist",
            )
            for n in range(1, 4)
        ]
    )
    return tracks


@pytest.fixture
def tags(db, tracks) -> TagService:
    return TagService(
        TagRepository(db), ActivityService(ActivityRepository(db), tracks), db
    )


@pytest.fixture
def collections(db) -> CollectionRepository:
    return CollectionRepository(db)


@pytest.fixture
def library(db, tags, collections):
    """A tag, a real Collection, and a Smart Collection to be refused."""
    warmups = collections.create(Collection(kind="collection", name="Warmups"))
    smart = collections.create(
        Collection(kind="smart", name="Rated five", rules_json="{}")
    )
    folder = collections.create(Collection(kind="folder", name="Sets"))
    return {
        "tag": tags.create_or_get("Peak time").id,
        "collection": warmups.id,
        "smart": smart.id,
        "folder": folder.id,
        "connection": db.connect(),
    }


def rule(field, operator, value=None):
    return FilterRule(field=field, operator=operator, value=value)


def rules(*clauses):
    return RuleSet(rules=tuple(clauses))


def check(library, *clauses):
    check_rule_references(library["connection"], rules(*clauses))


class TestWhatARuleNames:
    def test_a_rule_names_its_one_id(self):
        assert rule_ids(rule("tag", "has_tag", 7).validated()) == (7,)

    def test_any_of_names_all_of_them_in_order(self):
        assert rule_ids(rule("tag", "any_of", [9, 2, 5]).validated()) == (9, 2, 5)

    def test_untagged_names_nothing(self):
        # "Has no tags" is a question about the absence of rows; there is no
        # id to look up, and looking one up would be a refusal for no reason.
        assert rule_ids(rule("tag", "is_empty").validated()) == ()


class TestARuleThatStillMakesSense:
    def test_an_existing_tag_passes(self, library):
        check(library, rule("tag", "has_tag", library["tag"]))

    def test_an_existing_collection_passes(self, library):
        check(library, rule("collection", "in_collection", library["collection"]))

    def test_a_folder_passes(self, library):
        # A folder holds no tracks, so the rule matches nothing — but it is a
        # real row and an honest question, not a broken rule.
        check(library, rule("collection", "in_collection", library["folder"]))

    def test_untagged_passes_with_no_tags_at_all(self, library):
        check(library, rule("tag", "is_empty"))

    def test_a_rule_set_with_no_membership_in_it_passes(self, library):
        check(library, rule("genre", "is", "House"), rule("rating", "gte", 4))

    def test_an_empty_rule_set_passes(self, library):
        check(library)


class TestADeletedThingBreaksTheRule:
    def test_a_deleted_tag(self, library, tags):
        tags.delete(library["tag"])
        with pytest.raises(BrokenRuleError, match="no longer exists"):
            check(library, rule("tag", "has_tag", library["tag"]))

    def test_a_tag_that_never_existed(self, library):
        with pytest.raises(BrokenRuleError, match="tag 9999"):
            check(library, rule("tag", "has_tag", 9999))

    def test_a_deleted_collection(self, library, collections):
        collections.delete(library["collection"])
        with pytest.raises(BrokenRuleError, match="no longer exists"):
            check(library, rule("collection", "in_collection", library["collection"]))

    def test_a_collection_that_never_existed(self, library):
        with pytest.raises(BrokenRuleError, match="Collection 9999"):
            check(library, rule("collection", "in_collection", 9999))

    def test_one_bad_id_in_a_list_breaks_it(self, library):
        with pytest.raises(BrokenRuleError, match="9999"):
            check(library, rule("tag", "any_of", [library["tag"], 9999]))

    def test_the_message_names_the_clause(self, library):
        # A user can have six filters on screen. "The filter is broken" tells
        # them to check all six.
        with pytest.raises(BrokenRuleError) as raised:
            check(library, rule("tag", "not_has_tag", 9999))
        assert "Tag" in str(raised.value)
        assert "not_has_tag" in str(raised.value)

    def test_it_is_a_filter_rule_error_too(self, library):
        # So every handler that already maps one to "that request does not make
        # sense" keeps working without knowing about the subclass.
        with pytest.raises(FilterRuleError):
            check(library, rule("tag", "has_tag", 9999))

    def test_the_first_broken_clause_is_the_one_reported(self, library):
        # Rules are checked in the order they were written, so a user is told
        # about the first thing that is wrong rather than whichever the
        # database answered first.
        with pytest.raises(BrokenRuleError, match="tag 9999"):
            check(
                library,
                rule("tag", "has_tag", 9999),
                rule("collection", "in_collection", 8888),
            )


class TestASmartCollectionIsNotSomethingToFilterOn:
    def test_it_is_refused(self, library):
        with pytest.raises(FilterRuleError, match="Smart Collection"):
            check(library, rule("collection", "in_collection", library["smart"]))

    def test_negating_it_is_refused_too(self, library):
        with pytest.raises(FilterRuleError, match="Smart Collection"):
            check(library, rule("collection", "not_in_collection", library["smart"]))

    def test_the_message_names_the_collection(self, library):
        with pytest.raises(FilterRuleError) as raised:
            check(library, rule("collection", "in_collection", library["smart"]))
        assert "Rated five" in str(raised.value)
        assert "in_collection" in str(raised.value)

    def test_it_is_not_a_broken_rule(self, library):
        # Broken means "the thing it named is gone", which ORG-06 shows as a
        # state to repair. This rule is simply not a rule; deleting nothing
        # would fix it.
        with pytest.raises(FilterRuleError) as raised:
            check(library, rule("collection", "in_collection", library["smart"]))
        assert not isinstance(raised.value, BrokenRuleError)


class TestManyIdsAtOnce:
    def test_a_rule_naming_more_ids_than_sqlite_takes_parameters(self, library, tags):
        # `tag any_of` takes a list, and a renderer sending six hundred chips
        # must not meet a build's parameter limit as a crash. 500 per statement
        # (`id_chunks`), so 600 is two.
        ids = [tags.create_or_get(f"Tag {n}").id for n in range(600)]
        check(library, rule("tag", "any_of", ids))

    def test_a_bad_id_in_the_second_chunk_is_still_found(self, library, tags):
        ids = [tags.create_or_get(f"Tag {n}").id for n in range(600)]
        with pytest.raises(BrokenRuleError, match="9999"):
            check(library, rule("tag", "any_of", ids + [9999]))


class TestEveryReadRefuses:
    """One skipped check is no check.

    A filter refused by the table but allowed by a facet would come back as an
    empty tag list rather than a message naming the clause — which is precisely
    the "silently matching nothing" failure DEC-060 exists to avoid.
    """

    @pytest.fixture
    def broken(self, library):
        return BrowseQuery(rules=rules(rule("tag", "has_tag", 9999)))

    @pytest.fixture
    def smart(self, library):
        return BrowseQuery(
            rules=rules(rule("collection", "in_collection", library["smart"]))
        )

    @pytest.mark.parametrize(
        "call",
        [
            lambda repo, query: repo.browse(query),
            lambda repo, query: repo.browse_ids(query),
            lambda repo, query: repo.browse_queue(query),
            lambda repo, query: repo.browse_count(query),
            lambda repo, query: repo.facet_values(query, field="genre"),
            lambda repo, query: repo.facet_values(query, field="tag"),
            lambda repo, query: repo.facet_range(query, field="bpm"),
        ],
        ids=[
            "browse",
            "browse_ids",
            "browse_queue",
            "browse_count",
            "facet_values",
            "tag_facet",
            "facet_range",
        ],
    )
    def test_a_deleted_tag_is_refused_everywhere(self, tracks, broken, call):
        with pytest.raises(BrokenRuleError):
            call(tracks, broken)

    @pytest.mark.parametrize(
        "call",
        [
            lambda repo, query: repo.browse(query),
            lambda repo, query: repo.browse_ids(query),
            lambda repo, query: repo.browse_queue(query),
            lambda repo, query: repo.browse_count(query),
            lambda repo, query: repo.facet_values(query, field="genre"),
            lambda repo, query: repo.facet_values(query, field="tag"),
            lambda repo, query: repo.facet_range(query, field="bpm"),
        ],
        ids=[
            "browse",
            "browse_ids",
            "browse_queue",
            "browse_count",
            "facet_values",
            "tag_facet",
            "facet_range",
        ],
    )
    def test_a_smart_collection_is_refused_everywhere(self, tracks, smart, call):
        with pytest.raises(FilterRuleError, match="Smart Collection"):
            call(tracks, smart)

    def test_a_good_rule_is_still_answered_everywhere(self, tracks, library):
        query = BrowseQuery(rules=rules(rule("tag", "has_tag", library["tag"])))
        assert tracks.browse(query) == []
        assert tracks.browse_count(query) == 0
        assert tracks.facet_values(query, field="genre").values == ()

    def test_deleting_a_collection_breaks_a_rule_that_named_it(
        self, tracks, collections, library
    ):
        # ORG-06's promise from the other side: deleting a Collection does not
        # delete the Smart Collection that filtered on it, it breaks it.
        query = BrowseQuery(
            rules=rules(rule("collection", "in_collection", library["collection"]))
        )
        assert tracks.browse_count(query) == 0
        collections.delete(library["collection"])
        with pytest.raises(BrokenRuleError):
            tracks.browse_count(query)


class TestTheSchemaTheNotInShapeDependsOn:
    """``NOT IN`` is only safe while the link tables forbid a null track.

    ``tracks.id NOT IN (SELECT track_id FROM track_tags)`` answers *null* — and
    therefore not true — if the subquery can produce a null, which would return
    no tracks at all with nothing to say why. Migration 0009 declares both
    columns ``NOT NULL``; this is what notices if a later one relaxes that,
    because no behavioural test can catch a null the schema cannot hold.
    """

    @pytest.mark.parametrize("table", ["track_tags", "collection_tracks"])
    def test_the_track_column_cannot_be_null(self, db, table):
        columns = {
            row["name"]: row
            for row in db.connect().execute(f"PRAGMA table_info({table})")
        }
        assert columns["track_id"]["notnull"] == 1
