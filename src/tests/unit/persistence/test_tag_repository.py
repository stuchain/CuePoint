#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The tag store (ORG-03, DEC-015).

Storage-level tests for the flat vocabulary and its assignments. Four things
carry the weight:

**Identity ignores case; display does not.** ``Peak-time`` and ``peak-time``
are one tag, enforced by the unique index, and every lookup here has to compare
the same way the index does — a query with a different collation is a query
that silently stops using it and starts disagreeing with what an insert would
collide with.

**Assignment is idempotent and reports what changed.** Not how many tracks were
asked about: the service writes one history entry per track that actually
changed, and a list padded with tracks that already carried the tag would be a
log of things that did not happen.

**Merge leaves exactly one of everything.** A track carrying both tags must end
up carrying the survivor once, not twice and not zero times — the case that
``UPDATE`` alone gets wrong, which is why it is ``UPDATE OR IGNORE`` plus the
source's cascade.

**Deleting a tag deletes no tracks.** Asserted directly, because it is the
worst thing this file could get wrong.
"""

from __future__ import annotations

import sqlite3

import pytest

from cuepoint.models.library_track import LibraryTrack
from cuepoint.models.tag import Tag
from cuepoint.persistence.tag_repository import _SELECT_WITH_USAGE, TagRepository
from cuepoint.persistence.track_repository import TrackRepository
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.migration_runner import MigrationRunner


@pytest.fixture
def db(tmp_path):
    service = DatabaseService(db_path=tmp_path / "cuepoint.db")
    MigrationRunner(service).migrate()
    yield service
    service.close_all()


@pytest.fixture
def tracks(db):
    repo = TrackRepository(db)
    repo.add_many(
        [
            LibraryTrack(
                rekordbox_track_id=str(i),
                file_path=f"/m/{i}.mp3",
                title=f"T{i}",
                artist="An Artist",
            )
            for i in range(1, 8)
        ]
    )
    return repo


@pytest.fixture
def ids(db, tracks):
    rows = db.connect().execute("SELECT id FROM tracks ORDER BY id").fetchall()
    return [int(row["id"]) for row in rows]


@pytest.fixture
def repo(db, tracks):
    return TagRepository(db)


@pytest.fixture
def peak(repo) -> int:
    return int(repo.create(Tag(name="Peak-time")).id)


@pytest.fixture
def warmup(repo) -> int:
    return int(repo.create(Tag(name="Warmup")).id)


def track_count(db) -> int:
    return int(db.connect().execute("SELECT count(*) AS n FROM tracks").fetchone()["n"])


class TestTheVocabulary:
    def test_a_created_tag_comes_back_with_an_id(self, repo):
        tag = repo.create(Tag(name="Dub"))
        assert tag.id is not None
        assert repo.get(tag.id).name == "Dub"

    def test_the_case_a_user_typed_is_kept(self, repo):
        repo.create(Tag(name="DUB"))
        assert repo.find_by_name("dub").name == "DUB"

    def test_the_same_name_in_another_case_is_refused(self, repo, peak):
        with pytest.raises(sqlite3.IntegrityError):
            repo.create(Tag(name="peak-time"))

    def test_lookup_ignores_case_and_surrounding_space(self, repo, peak):
        assert repo.find_by_name("  PEAK-TIME ").id == peak

    def test_an_unknown_name_is_none(self, repo):
        assert repo.find_by_name("nothing") is None

    def test_an_unknown_id_is_none(self, repo):
        assert repo.get(999_999) is None

    def test_renaming_keeps_the_id_and_the_assignments(self, repo, peak, ids):
        repo.assign(ids[:3], peak)
        renamed = repo.rename(peak, "Peaktime")
        assert renamed.id == peak
        assert renamed.name == "Peaktime"
        assert repo.usage_count(peak) == 3

    def test_renaming_onto_an_existing_name_is_refused(self, repo, peak, warmup):
        with pytest.raises(sqlite3.IntegrityError):
            repo.rename(warmup, "peak-time")

    def test_renaming_a_tag_that_is_not_there_answers_none(self, repo):
        assert repo.rename(999_999, "X") is None

    def test_category_and_colour_are_set_and_cleared(self, repo, peak):
        assert repo.set_category(peak, "Energy").category == "Energy"
        assert repo.set_colour(peak, "danger").colour == "danger"
        assert repo.set_category(peak, None).category is None
        assert repo.set_colour(peak, None).colour is None

    def test_a_colour_outside_the_theme_tokens_is_refused(self, repo, peak):
        with pytest.raises(ValueError, match="must be one of"):
            repo.set_colour(peak, "#ff0000")

    def test_categories_in_use_are_whatever_is_written_on_tags(
        self, repo, peak, warmup
    ):
        # DEC-015: no category table, so the vocabulary is the usage.
        repo.set_category(peak, "Energy")
        repo.set_category(warmup, "Energy")
        third = repo.create(Tag(name="Dark", category="Mood"))
        assert repo.categories_in_use() == ["Energy", "Mood"]
        repo.set_category(third.id, None)
        assert repo.categories_in_use() == ["Energy"]


class TestListingWithCounts:
    def test_every_tag_is_listed_even_with_nothing_on_it(self, repo, peak, warmup):
        listed = repo.list_all()
        assert [usage.tag.name for usage in listed] == ["Peak-time", "Warmup"]
        assert [usage.track_count for usage in listed] == [0, 0]

    def test_counts_match_the_assignments(self, repo, peak, warmup, ids):
        repo.assign(ids[:5], peak)
        repo.assign(ids[:2], warmup)
        counts = {u.tag.name: u.track_count for u in repo.list_all()}
        assert counts == {"Peak-time": 5, "Warmup": 2}

    def test_it_is_ordered_by_name_ignoring_case(self, repo):
        for name in ("zeta", "Alpha", "beta"):
            repo.create(Tag(name=name))
        assert [u.tag.name for u in repo.list_all()] == ["Alpha", "beta", "zeta"]

    def test_the_listing_is_one_query(self, db, repo, peak, warmup, ids):
        # A count query per tag would be forty queries for forty tags every
        # time the manager opens.
        repo.assign(ids, peak)
        connection = db.connect()
        statements = []
        connection.set_trace_callback(statements.append)
        try:
            repo.list_all()
        finally:
            connection.set_trace_callback(None)
        assert len(statements) == 1

    def test_the_counts_are_grouped_before_they_are_joined(self, db, repo, peak, ids):
        """The shape of the query, pinned because only its speed differs.

        Joining and then grouping produces the same forty rows and sorts them
        in a temporary B-tree: 35 ms over 40 tags and 200,000 assignments
        against 14 ms for the grouped form. Nothing about the answer changes,
        so nothing but this would notice a rewrite.
        """
        repo.assign(ids, peak)
        plan = " | ".join(
            str(row["detail"])
            for row in db.connect().execute(f"EXPLAIN QUERY PLAN {_SELECT_WITH_USAGE}")
        )
        assert "COVERING INDEX idx_track_tags_tag" in plan
        assert "TEMP B-TREE FOR ORDER BY" not in plan.upper()


class TestAssignment:
    def test_assigning_reports_the_tracks_that_changed(self, repo, peak, ids):
        assert repo.assign(ids[:3], peak) == ids[:3]

    def test_assigning_again_reports_nothing(self, repo, peak, ids):
        repo.assign(ids[:3], peak)
        assert repo.assign(ids[:3], peak) == []

    def test_a_partial_overlap_reports_only_the_new_ones(self, repo, peak, ids):
        repo.assign(ids[:2], peak)
        assert repo.assign(ids[:4], peak) == ids[2:4]

    def test_unassigning_reports_the_tracks_that_changed(self, repo, peak, ids):
        repo.assign(ids[:3], peak)
        assert repo.unassign(ids[:2], peak) == ids[:2]
        assert repo.usage_count(peak) == 1

    def test_unassigning_what_is_not_there_reports_nothing(self, repo, peak, ids):
        assert repo.unassign(ids[:3], peak) == []

    def test_duplicate_ids_are_handled_once(self, repo, peak, ids):
        assert repo.assign([ids[0], ids[0], ids[0]], peak) == [ids[0]]
        assert repo.usage_count(peak) == 1

    def test_assigning_nothing_does_nothing(self, repo, peak):
        assert repo.assign([], peak) == []
        assert repo.usage_count(peak) == 0

    def test_a_track_can_carry_several_tags(self, repo, peak, warmup, ids):
        repo.assign([ids[0]], peak)
        repo.assign([ids[0]], warmup)
        assert [t.name for t in repo.tags_for_track(ids[0])] == ["Peak-time", "Warmup"]

    def test_a_tag_cannot_be_put_on_a_track_that_is_not_there(self, repo, peak):
        with pytest.raises(sqlite3.IntegrityError):
            repo.assign([999_999], peak)

    def test_tags_for_tracks_leaves_untagged_tracks_absent(self, repo, peak, ids):
        repo.assign([ids[1]], peak)
        found = repo.tags_for_tracks(ids)
        assert list(found) == [ids[1]]

    def test_tags_for_tracks_of_nothing_is_empty(self, repo):
        assert repo.tags_for_tracks([]) == {}

    def test_tags_for_tracks_reads_in_chunks(self, db, repo, peak, ids):
        repo.assign([ids[0]], peak)
        connection = db.connect()
        statements = []
        connection.set_trace_callback(statements.append)
        try:
            found = repo.tags_for_tracks([ids[0]] + list(range(10_000, 11_200)))
        finally:
            connection.set_trace_callback(None)
        assert len([s for s in statements if "FROM track_tags" in s]) > 1
        assert list(found) == [ids[0]]

    def test_tracks_with_tag_can_be_narrowed(self, repo, peak, ids):
        repo.assign(ids[:4], peak)
        assert sorted(repo.tracks_with_tag(peak, ids[:2])) == ids[:2]
        assert sorted(repo.tracks_with_tag(peak)) == ids[:4]


class TestMerge:
    def test_assignments_move_to_the_target(self, repo, peak, warmup, ids):
        repo.assign(ids[:3], warmup)
        repo.merge(warmup, peak)
        assert sorted(repo.tracks_with_tag(peak)) == ids[:3]

    def test_the_source_is_gone(self, repo, peak, warmup, ids):
        repo.assign(ids[:3], warmup)
        repo.merge(warmup, peak)
        assert repo.get(warmup) is None
        assert [u.tag.name for u in repo.list_all()] == ["Peak-time"]

    def test_a_track_carrying_both_ends_up_with_one(self, repo, peak, warmup, ids):
        # The case a plain UPDATE gets wrong: the move collides with the
        # primary key, and the row has to be dropped rather than duplicated.
        repo.assign(ids[:3], peak)
        repo.assign(ids[:3], warmup)
        repo.merge(warmup, peak)

        assert repo.usage_count(peak) == 3
        assert [t.name for t in repo.tags_for_track(ids[0])] == ["Peak-time"]

    def test_a_mixed_merge_leaves_the_union(self, repo, peak, warmup, ids):
        repo.assign(ids[:2], peak)
        repo.assign(ids[1:4], warmup)
        repo.merge(warmup, peak)
        assert sorted(repo.tracks_with_tag(peak)) == ids[:4]

    def test_it_reports_how_many_moved(self, repo, peak, warmup, ids):
        repo.assign(ids[:2], peak)
        repo.assign(ids[1:4], warmup)
        # Two of warmup's three tracks move; the shared one collides.
        assert repo.merge(warmup, peak) == 2

    def test_merging_deletes_no_tracks(self, db, repo, peak, warmup, ids):
        repo.assign(ids, warmup)
        repo.merge(warmup, peak)
        assert track_count(db) == len(ids)


class TestDeleting:
    def test_it_removes_the_tag_and_its_assignments(self, db, repo, peak, ids):
        repo.assign(ids[:3], peak)
        assert repo.delete(peak) is True
        assert repo.get(peak) is None
        assert (
            int(
                db.connect()
                .execute("SELECT count(*) AS n FROM track_tags")
                .fetchone()["n"]
            )
            == 0
        )

    def test_it_deletes_no_tracks(self, db, repo, peak, ids):
        repo.assign(ids, peak)
        repo.delete(peak)
        assert track_count(db) == len(ids)

    def test_deleting_nothing_says_so(self, repo):
        assert repo.delete(999_999) is False

    def test_deleting_a_track_takes_its_assignments(self, db, repo, peak, ids, tracks):
        repo.assign(ids[:2], peak)
        tracks.delete(ids[0])
        assert repo.usage_count(peak) == 1
        assert repo.get(peak) is not None
