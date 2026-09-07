#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""What a CuePoint filter rule means against the database (ORG-05, DEC-057).

Every operator ORG-05 added is driven through the real browse query, over a
fixture built so each one has something to get wrong: tracks with a Rekordbox
rating, a CuePoint rating, both, and neither; tracks with no tags and tracks
with three; and one track filed in the same Collection twice.

Four behaviours are decided here rather than inherited, and each has a test
that fails if it is undone:

**"Rating" is the value the user sees** (DEC-057). A CuePoint rating wins over
an imported one, an imported one answers when there is no CuePoint one, and
"unrated" means neither layer has a value. A rating of zero is still a rating
(DEC-034), in both layers.

**A track filed in a Collection twice matches once.** ORG-04 allows duplicate
entries on purpose; a filter that counted memberships instead of tracks would
show the track twice and disagree with its own count.

**"Not favorited" includes tracks with no CuePoint row at all.** Most of a
library has never been touched, and a filter that hid it would be useless. The
same applies to "has no notes" and "does not have this tag".

**The rules compose.** Membership, CuePoint columns, the text query, the
playlist scope and every Phase 4 filter go into one predicate that ``browse``
and ``browse_count`` share, so the rows and the number above them can never
disagree.

Every test runs against a temporary database; the user's real
``~/.cuepoint/cuepoint.db`` is never opened.
"""

from __future__ import annotations

from typing import List

import pytest

from cuepoint.models.filter_rule import FilterRule, RuleSet
from cuepoint.models.library_track import LibraryTrack
from cuepoint.persistence.activity_repository import ActivityRepository
from cuepoint.persistence.collection_repository import CollectionRepository
from cuepoint.persistence.tag_repository import TagRepository
from cuepoint.persistence.track_metadata_repository import TrackMetadataRepository
from cuepoint.persistence.track_query import BrowseQuery
from cuepoint.persistence.track_repository import TrackRepository
from cuepoint.services.activity_service import ActivityService
from cuepoint.services.collection_service import CollectionService
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.metadata_service import MetadataService
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
    return TrackRepository(db)


@pytest.fixture
def activity(db, tracks) -> ActivityService:
    return ActivityService(ActivityRepository(db), tracks)


@pytest.fixture
def metadata(db, tracks, activity) -> MetadataService:
    return MetadataService(TrackMetadataRepository(db), tracks, activity, db)


@pytest.fixture
def tags(db, activity) -> TagService:
    return TagService(TagRepository(db), activity, db)


@pytest.fixture
def collections(db) -> CollectionService:
    return CollectionService(CollectionRepository(db), db)


def _track(rekordbox_id: str, **kwargs) -> LibraryTrack:
    kwargs.setdefault("title", f"Title {rekordbox_id}")
    kwargs.setdefault("artist", f"Artist {rekordbox_id}")
    return LibraryTrack(
        rekordbox_track_id=rekordbox_id,
        file_path=f"/music/{rekordbox_id}.mp3",
        **kwargs,
    )


@pytest.fixture
def library(tracks, metadata, tags, collections):
    """Six tracks covering every case the new operators can get wrong.

    ======  ==========  ========  =========  ==============  ============
    track   Rekordbox   CuePoint  effective  tags            collections
    ======  ==========  ========  =========  ==============  ============
    1       5           —         5          peak, vocal     warmups
    2       3           5         5          peak            warmups ×2
    3       —           2         2          (none)          —
    4       4           —         4          vocal           —
    5       —           —         —          (none)          closers
    6       0           —         0          peak, vocal,    —
                                             dub
    ======  ==========  ========  =========  ==============  ============

    Track 4 is favorited and has notes; nobody else has either, so "not
    favorited" and "has no notes" have four tracks with no metadata row at all
    to account for.
    """
    tracks.add_many(
        [
            _track("1", genre="House", rating=5),
            _track("2", genre="House", rating=3),
            _track("3", genre="Techno"),
            _track("4", genre="Techno", rating=4),
            _track("5", genre="House"),
            _track("6", genre="Ambient", rating=0),
        ]
    )
    ids = {
        key: int(tracks.find_by_rekordbox_id(key).id)
        for key in ("1", "2", "3", "4", "5", "6")
    }

    metadata.set_rating(ids["2"], 5)
    metadata.set_rating(ids["3"], 2)
    metadata.set_favorite(ids["4"], True)
    metadata.set_notes(ids["4"], "Dark and heavy; 100% peak")

    peak = tags.create_or_get("Peak time").id
    vocal = tags.create_or_get("Vocal").id
    dub = tags.create_or_get("Dub").id
    tags.assign([ids["1"], ids["2"], ids["6"]], peak)
    tags.assign([ids["1"], ids["4"], ids["6"]], vocal)
    tags.assign([ids["6"]], dub)

    warmups = collections.create_collection("Warmups").id
    closers = collections.create_collection("Closers").id
    collections.add_tracks(warmups, [ids["1"], ids["2"]])
    # Filed twice on purpose: ORG-04 allows it, and `in_collection` must still
    # answer once.
    collections.insert_track(warmups, ids["2"], 0)
    collections.add_tracks(closers, [ids["5"]])

    return {
        "ids": ids,
        "tags": {"peak": peak, "vocal": vocal, "dub": dub},
        "collections": {"warmups": warmups, "closers": closers},
    }


def matching(repo: TrackRepository, library, *rules: FilterRule) -> List[str]:
    """The Rekordbox ids a rule set matches, sorted, with the count checked.

    The count is asserted against the rows here rather than in a test of its
    own, so every operator below proves that ``browse`` and ``browse_count``
    agree about it — the failure that makes a table say "showing 4 of 6".
    """
    query = BrowseQuery(rules=RuleSet(rules=rules))
    rows = repo.browse(query, limit=500)
    assert repo.browse_count(query) == len(rows)
    assert [int(row.id) for row in rows] == repo.browse_ids(query, limit=500)
    return sorted(row.rekordbox_track_id for row in rows)


def rule(field, operator, value=None):
    return FilterRule(field=field, operator=operator, value=value)


class TestTheRatingAUserSees:
    def test_a_cuepoint_rating_wins_over_an_imported_one(self, tracks, library):
        # Track 2 is 3 stars in Rekordbox and 5 in CuePoint. Track 1 is 5 with
        # no CuePoint rating at all. Both are five-star tracks to the user.
        assert matching(tracks, library, rule("rating", "is", 5)) == ["1", "2"]

    def test_the_overridden_value_stops_answering(self, tracks, library):
        assert matching(tracks, library, rule("rating", "is", 3)) == []

    def test_an_imported_rating_answers_when_there_is_no_other(self, tracks, library):
        assert matching(tracks, library, rule("rating", "is", 4)) == ["4"]

    def test_a_cuepoint_rating_answers_when_there_is_no_imported_one(
        self, tracks, library
    ):
        assert matching(tracks, library, rule("rating", "is", 2)) == ["3"]

    def test_zero_is_a_rating(self, tracks, library):
        # DEC-034, still true through the coalesce: track 6 is rated zero, not
        # unrated, and COALESCE must not treat that as a missing value.
        assert matching(tracks, library, rule("rating", "is", 0)) == ["6"]

    def test_unrated_means_neither_layer_has_a_value(self, tracks, library):
        assert matching(tracks, library, rule("rating", "is_empty")) == ["5"]

    def test_a_range_reads_the_effective_value(self, tracks, library):
        assert matching(tracks, library, rule("rating", "gte", 4)) == ["1", "2", "4"]

    def test_between_reads_the_effective_value(self, tracks, library):
        assert matching(tracks, library, rule("rating", "between", [2, 4])) == [
            "3",
            "4",
        ]

    def test_any_of_reads_the_effective_value(self, tracks, library):
        assert matching(tracks, library, rule("rating", "any_of", [0, 2])) == [
            "3",
            "6",
        ]


class TestEitherLayerOnItsOwn:
    def test_the_imported_column_is_still_addressable(self, tracks, library):
        assert matching(tracks, library, rule("rating_rekordbox", "is", 3)) == ["2"]

    def test_the_imported_column_ignores_cuepoints(self, tracks, library):
        # Track 3 has a CuePoint rating and no imported one; asking for the
        # imported layer's missing values must say so.
        assert matching(tracks, library, rule("rating_rekordbox", "is_empty")) == [
            "3",
            "5",
        ]

    def test_the_cuepoint_column_is_addressable(self, tracks, library):
        assert matching(tracks, library, rule("cuepoint_rating", "is", 5)) == ["2"]

    def test_the_cuepoint_column_is_empty_for_a_track_with_no_row(
        self, tracks, library
    ):
        # Four of the six have no metadata row at all; the LEFT JOIN has to
        # make that read as "no CuePoint rating" rather than dropping them.
        assert matching(tracks, library, rule("cuepoint_rating", "is_empty")) == [
            "1",
            "4",
            "5",
            "6",
        ]

    def test_the_two_layers_disagree_where_they_should(self, tracks, library):
        assert matching(tracks, library, rule("rating_rekordbox", "gte", 4)) == [
            "1",
            "4",
        ]
        assert matching(tracks, library, rule("rating", "gte", 4)) == ["1", "2", "4"]


class TestFavorite:
    def test_favorited_tracks(self, tracks, library):
        assert matching(tracks, library, rule("favorite", "is", True)) == ["4"]

    def test_not_favorited_includes_everyone_with_no_metadata_row(
        self, tracks, library
    ):
        assert matching(tracks, library, rule("favorite", "is", False)) == [
            "1",
            "2",
            "3",
            "5",
            "6",
        ]

    def test_a_metadata_row_that_is_not_favorited_counts_as_not(
        self, tracks, metadata, library
    ):
        # Track 3 has a metadata row (a rating) with favorite left at its
        # default. It is not favorited, and the default must read as false
        # rather than as unknown.
        assert metadata.get(library["ids"]["3"]).favorite is False
        assert "3" in matching(tracks, library, rule("favorite", "is", False))

    def test_unfavoriting_moves_a_track_between_the_two(
        self, tracks, metadata, library
    ):
        metadata.set_favorite(library["ids"]["4"], False)
        assert matching(tracks, library, rule("favorite", "is", True)) == []


class TestNotes:
    def test_contains(self, tracks, library):
        assert matching(tracks, library, rule("notes", "contains", "heavy")) == ["4"]

    def test_a_wildcard_in_a_note_is_a_character(self, tracks, library):
        # "100%" must find the note that says 100%, not every note.
        assert matching(tracks, library, rule("notes", "contains", "100%")) == ["4"]

    def test_does_not_contain_includes_tracks_with_no_notes(self, tracks, library):
        assert matching(tracks, library, rule("notes", "not_contains", "heavy")) == [
            "1",
            "2",
            "3",
            "5",
            "6",
        ]

    def test_is_empty_covers_both_no_row_and_no_note(self, tracks, metadata, library):
        metadata.set_rating(library["ids"]["1"], 5)  # a row, but still no notes
        assert matching(tracks, library, rule("notes", "is_empty")) == [
            "1",
            "2",
            "3",
            "5",
            "6",
        ]


class TestTags:
    def test_has_tag(self, tracks, library):
        peak = library["tags"]["peak"]
        assert matching(tracks, library, rule("tag", "has_tag", peak)) == [
            "1",
            "2",
            "6",
        ]

    def test_not_has_tag_includes_untagged_tracks(self, tracks, library):
        peak = library["tags"]["peak"]
        assert matching(tracks, library, rule("tag", "not_has_tag", peak)) == [
            "3",
            "4",
            "5",
        ]

    def test_any_of_is_a_union_and_counts_a_track_once(self, tracks, library):
        # The narrowest tag first, on purpose: Dub is only on track 6, and
        # Vocal is on 1, 4 and 6. A compiler that honoured only the first id
        # would answer ["6"] and look perfectly reasonable doing it. Track 6
        # carries both, and appears once.
        vocal, dub = library["tags"]["vocal"], library["tags"]["dub"]
        assert matching(tracks, library, rule("tag", "any_of", [dub, vocal])) == [
            "1",
            "4",
            "6",
        ]

    def test_any_of_does_not_care_what_order_the_ids_are_in(self, tracks, library):
        vocal, dub = library["tags"]["vocal"], library["tags"]["dub"]
        assert matching(
            tracks, library, rule("tag", "any_of", [vocal, dub])
        ) == matching(tracks, library, rule("tag", "any_of", [dub, vocal]))

    def test_every_id_in_a_long_list_is_honoured(self, tracks, tags, library):
        # One real tag at the end of a list of tags nobody uses. Only a rule
        # that reads all of them finds anything.
        unused = [tags.create_or_get(f"Spare {n}").id for n in range(5)]
        assert matching(
            tracks, library, rule("tag", "any_of", unused + [library["tags"]["dub"]])
        ) == ["6"]

    def test_a_yes_no_compares_as_a_number(self, tracks, library):
        # `COALESCE(meta.favorite, 0)` holds 0 or 1. A collation on that
        # comparison would read as though case could matter here; SQLite would
        # ignore it, which makes it a rule the SQL claims and does not have.
        from cuepoint.persistence.filter_sql import compile_rule

        sql, params = compile_rule(rule("favorite", "is", True))
        assert "COLLATE" not in sql
        assert params == (True,)

    def test_untagged(self, tracks, library):
        assert matching(tracks, library, rule("tag", "is_empty")) == ["3", "5"]

    def test_two_tag_rules_are_an_intersection(self, tracks, library):
        # DEC-016 is AND-only, so two tag clauses mean "has both".
        peak, vocal = library["tags"]["peak"], library["tags"]["vocal"]
        assert matching(
            tracks,
            library,
            rule("tag", "has_tag", peak),
            rule("tag", "has_tag", vocal),
        ) == ["1", "6"]

    def test_unassigning_moves_a_track_out(self, tracks, tags, library):
        peak = library["tags"]["peak"]
        tags.unassign([library["ids"]["1"]], peak)
        assert matching(tracks, library, rule("tag", "has_tag", peak)) == ["2", "6"]

    def test_renaming_a_tag_leaves_a_rule_matching(self, tracks, tags, library):
        # The reason a rule carries an id rather than a name.
        peak = library["tags"]["peak"]
        tags.rename(peak, "Prime time")
        assert matching(tracks, library, rule("tag", "has_tag", peak)) == [
            "1",
            "2",
            "6",
        ]


class TestCollectionMembership:
    def test_in_collection(self, tracks, library):
        warmups = library["collections"]["warmups"]
        assert matching(
            tracks, library, rule("collection", "in_collection", warmups)
        ) == [
            "1",
            "2",
        ]

    def test_a_track_filed_twice_matches_once(self, tracks, collections, library):
        # ORG-04 lets a Collection hold a track twice on purpose. A join would
        # have returned track 2 twice; membership is a question about a track.
        warmups = library["collections"]["warmups"]
        assert collections.counts(warmups) == (3, 2)
        rows = tracks.browse(
            BrowseQuery(
                rules=RuleSet(rules=(rule("collection", "in_collection", warmups),))
            ),
            limit=500,
        )
        assert [row.rekordbox_track_id for row in rows].count("2") == 1

    def test_not_in_collection(self, tracks, library):
        warmups = library["collections"]["warmups"]
        assert matching(
            tracks, library, rule("collection", "not_in_collection", warmups)
        ) == ["3", "4", "5", "6"]

    def test_two_collections_are_an_intersection(self, tracks, collections, library):
        warmups, closers = (
            library["collections"]["warmups"],
            library["collections"]["closers"],
        )
        collections.add_tracks(closers, [library["ids"]["1"]])
        assert matching(
            tracks,
            library,
            rule("collection", "in_collection", warmups),
            rule("collection", "in_collection", closers),
        ) == ["1"]

    def _entries_for(self, collections, collection_id, track_id):
        return [
            entry.id
            for entry in collections.entries(collection_id)
            if entry.track_id == track_id
        ]

    def test_removing_every_entry_moves_a_track_out(self, tracks, collections, library):
        warmups = library["collections"]["warmups"]
        collections.remove_entries(
            self._entries_for(collections, warmups, library["ids"]["1"])
        )
        assert matching(
            tracks, library, rule("collection", "in_collection", warmups)
        ) == ["2"]

    def test_removing_one_of_two_entries_keeps_a_track_in(
        self, tracks, collections, library
    ):
        # Track 2 is filed twice. Taking one entry out leaves it a member,
        # which is what makes "matches once" a real question rather than an
        # accident of the fixture.
        warmups = library["collections"]["warmups"]
        entries = self._entries_for(collections, warmups, library["ids"]["2"])
        assert len(entries) == 2
        collections.remove_entries(entries[:1])
        assert matching(
            tracks, library, rule("collection", "in_collection", warmups)
        ) == ["1", "2"]


class TestTheyComposeWithEverythingElse:
    def test_a_tag_a_collection_and_a_rating_in_one_predicate(self, tracks, library):
        assert matching(
            tracks,
            library,
            rule("tag", "has_tag", library["tags"]["peak"]),
            rule("collection", "in_collection", library["collections"]["warmups"]),
            rule("rating", "is", 5),
        ) == ["1", "2"]

    def test_they_compose_with_a_phase_four_filter(self, tracks, library):
        assert matching(
            tracks,
            library,
            rule("genre", "is", "house"),
            rule("tag", "has_tag", library["tags"]["peak"]),
        ) == ["1", "2"]

    def test_they_compose_with_the_text_query(self, tracks, library):
        query = BrowseQuery(
            query="Title 6",
            rules=RuleSet(rules=(rule("tag", "has_tag", library["tags"]["peak"]),)),
        )
        rows = tracks.browse(query, limit=500)
        assert [row.rekordbox_track_id for row in rows] == ["6"]
        assert tracks.browse_count(query) == 1

    def test_a_queue_reads_the_same_rows(self, tracks, library):
        query = BrowseQuery(
            rules=RuleSet(rules=(rule("tag", "is_empty"),)),
        )
        queue = tracks.browse_queue(query, limit=500)
        assert sorted(entry.title for entry in queue) == ["Title 3", "Title 5"]

    def test_an_empty_rule_set_still_changes_nothing(self, tracks, library):
        assert len(tracks.browse(BrowseQuery(), limit=500)) == 6
        assert tracks.browse_count(BrowseQuery()) == 6

    def test_a_value_containing_sql_stays_a_value(self, tracks, library):
        assert (
            matching(
                tracks, library, rule("notes", "contains", "'; DROP TABLE tracks --")
            )
            == []
        )
        assert tracks.count() == 6


class TestTheJoinIsOnlyWrittenWhenItIsNeeded:
    """A filter with no CuePoint clause produces the SQL it produced before.

    Not a micro-optimization: `track_metadata` is joined on its primary key, so
    it is one probe per row — and one probe per row over fifty thousand rows is
    fifty thousand probes that every browse the Library page has run since
    Phase 4 would start paying for nothing.
    """

    def test_a_plain_browse_writes_no_join(self):
        from cuepoint.persistence.track_query import build_select

        sql, _ = build_select(BrowseQuery())
        assert "track_metadata" not in sql

    def test_a_rekordbox_only_filter_writes_no_join(self):
        from cuepoint.persistence.track_query import build_count

        sql, _ = build_count(
            BrowseQuery(rules=RuleSet(rules=(rule("genre", "is", "House"),)))
        )
        assert "track_metadata" not in sql

    def test_a_tag_rule_writes_no_join_either(self):
        # A tag lives in its own link table; it needs nothing from the
        # metadata one.
        from cuepoint.persistence.track_query import build_count

        sql, _ = build_count(
            BrowseQuery(rules=RuleSet(rules=(rule("tag", "has_tag", 1),)))
        )
        assert "track_metadata" not in sql

    @pytest.mark.parametrize(
        "clause",
        [
            ("rating", "is", 5),
            ("cuepoint_rating", "is", 5),
            ("favorite", "is", True),
            ("notes", "contains", "x"),
        ],
    )
    def test_a_cuepoint_rule_writes_it(self, clause):
        from cuepoint.persistence.track_query import build_select

        sql, _ = build_select(BrowseQuery(rules=RuleSet(rules=(rule(*clause),))))
        assert "LEFT JOIN track_metadata AS meta" in sql

    def test_the_join_cannot_multiply_a_row(self, tracks, library):
        # `track_metadata.track_id` is that table's primary key, so at most one
        # row joins. Asserted through the count rather than trusted.
        query = BrowseQuery(rules=RuleSet(rules=(rule("favorite", "is", False),)))
        assert tracks.browse_count(query) == 5
        assert len(tracks.browse(query, limit=500)) == 5


class TestTheyComposeWithAPlaylistScope:
    """The last third of the DoD: scope, text query, and every other filter.

    A scoped browse is the query with the most moving parts — a recursive CTE
    for the folder, a membership test against the playlist tables, the metadata
    join, and now a second membership test against a link table — and the
    ordering can be a subquery over playlist positions on top of all of it. It
    is the one place where the pieces could be assembled in an order that
    parses and answers the wrong question, so it is asserted rather than
    assumed.
    """

    @pytest.fixture
    def scoped(self, db, tracks, library):
        """A folder holding one playlist with tracks 1, 2 and 5 in it.

        Tracks 1 and 2 carry the Peak time tag and are in the Warmups
        Collection; track 5 is untagged and in Closers. So every membership
        rule has something inside the scope *and* something outside it, which
        is what makes "the scope was applied" different from "the rule was".
        """
        from cuepoint.models.rekordbox_playlist import (
            KIND_FOLDER,
            KIND_PLAYLIST,
            RekordboxPlaylist,
        )
        from cuepoint.persistence.playlist_repository import PlaylistRepository

        playlists = PlaylistRepository(db)
        playlists.replace_tree(
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
                    track_refs=["5", "2", "1"],
                ),
            ]
        )
        return {
            "folder": int(playlists.find_by_path("SETS").id),
            "playlist": int(playlists.find_by_path("SETS/warmup").id),
        }

    def scoped_ids(self, tracks, scoped, *rules, sort="artist"):
        query = BrowseQuery(
            playlist_id=scoped["playlist"], sort=sort, rules=RuleSet(rules=rules)
        )
        rows = tracks.browse(query, limit=500)
        assert tracks.browse_count(query) == len(rows)
        return sorted(row.rekordbox_track_id for row in rows)

    def test_the_scope_alone(self, tracks, scoped):
        assert self.scoped_ids(tracks, scoped) == ["1", "2", "5"]

    def test_a_tag_rule_inside_a_playlist(self, tracks, library, scoped):
        # Track 6 also carries this tag and is not in the playlist.
        assert self.scoped_ids(
            tracks, scoped, rule("tag", "has_tag", library["tags"]["peak"])
        ) == ["1", "2"]

    def test_untagged_inside_a_playlist(self, tracks, library, scoped):
        # Track 3 is untagged too, and outside the scope.
        assert self.scoped_ids(tracks, scoped, rule("tag", "is_empty")) == ["5"]

    def test_a_collection_rule_inside_a_playlist(self, tracks, library, scoped):
        assert self.scoped_ids(
            tracks,
            scoped,
            rule("collection", "in_collection", library["collections"]["warmups"]),
        ) == ["1", "2"]

    def test_a_cuepoint_rule_inside_a_playlist(self, tracks, library, scoped):
        # The metadata join and the scope CTE in one statement. Track 3 is
        # rated 2 in CuePoint and is outside the scope.
        assert self.scoped_ids(tracks, scoped, rule("rating", "is", 5)) == ["1", "2"]

    def test_a_folder_scope_reaches_its_playlists(self, tracks, library, scoped):
        query = BrowseQuery(
            playlist_id=scoped["folder"],
            rules=RuleSet(rules=(rule("tag", "has_tag", library["tags"]["peak"]),)),
        )
        rows = tracks.browse(query, limit=500)
        assert sorted(row.rekordbox_track_id for row in rows) == ["1", "2"]
        assert tracks.browse_count(query) == 2

    def test_everything_at_once(self, tracks, library, scoped):
        # A folder scope, a text query, a Phase 4 filter, a CuePoint filter, a
        # tag and a Collection — one predicate, and the count agrees with it.
        query = BrowseQuery(
            query="Title",
            playlist_id=scoped["folder"],
            rules=RuleSet(
                rules=(
                    rule("genre", "is", "House"),
                    rule("rating", "gte", 5),
                    rule("tag", "has_tag", library["tags"]["peak"]),
                    rule(
                        "collection", "in_collection", library["collections"]["warmups"]
                    ),
                )
            ),
        )
        rows = tracks.browse(query, limit=500)
        assert sorted(row.rekordbox_track_id for row in rows) == ["1", "2"]
        assert tracks.browse_count(query) == 2

    def test_the_playlist_ordering_survives_a_membership_rule(
        self, tracks, library, scoped
    ):
        # `playlist_position` orders by a subquery over the scope CTE. It has
        # to still mean "as arranged in Rekordbox" with a link table in the
        # predicate: the playlist lists 5, 2, 1 in that order.
        query = BrowseQuery(
            playlist_id=scoped["playlist"],
            sort="playlist_position",
            rules=RuleSet(rules=(rule("tag", "not_has_tag", library["tags"]["dub"]),)),
        )
        rows = tracks.browse(query, limit=500)
        assert [row.rekordbox_track_id for row in rows] == ["5", "2", "1"]

    def test_a_facet_is_computed_inside_the_scope(self, tracks, library, scoped):
        # Peak time is on tracks 1, 2 and 6; only two of them are in the
        # playlist, and the facet has to say two.
        facet = tracks.facet_values(
            BrowseQuery(playlist_id=scoped["playlist"]), field="tag"
        )
        counts = {value.label: value.count for value in facet.values if value.label}
        assert counts["Peak time"] == 2
        assert facet.values[-1].value is None  # track 5 is untagged

    def test_a_scoped_facet_count_is_what_choosing_it_would_show(
        self, tracks, library, scoped
    ):
        facet = tracks.facet_values(
            BrowseQuery(playlist_id=scoped["playlist"]), field="tag"
        )
        for value in facet.values:
            if value.value is None:
                continue
            assert value.count == tracks.browse_count(
                BrowseQuery(
                    playlist_id=scoped["playlist"],
                    rules=RuleSet(rules=(rule("tag", "has_tag", int(value.value)),)),
                )
            ), value.label
