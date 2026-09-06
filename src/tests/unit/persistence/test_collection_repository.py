#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The collection tree and its membership, at the storage layer (ORG-04).

Two things here are worth more than everything else, and both are invisible
until they are wrong.

**Positions stay contiguous.** ``0, 1, 2, …`` with no gaps and no repeats, among
a node's siblings and among a Collection's entries, after *every* mutation.
A gap is not a crash: it is a list that renders in a slightly different order
than the one the user arranged, days later, with nothing to point at. So a
helper asserts it after each operation rather than at the end of a test.

**Nothing here deletes a track.** Deleting a Collection, a folder, a subtree or
an entry removes rows about tracks, never tracks. Asserted directly in every
delete test, because it is the worst thing this module could do.

The duplicate rules from DEC-058 run through both: ``add`` skips what is
already there, ``insert_at`` puts it in anyway, and removing one of two
identical entries leaves the other.
"""

from __future__ import annotations

import sqlite3

import pytest

from cuepoint.models.collection import (
    KIND_COLLECTION,
    KIND_FOLDER,
    KIND_SMART,
    Collection,
)
from cuepoint.models.library_track import LibraryTrack
from cuepoint.persistence.collection_repository import CollectionRepository
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
            for i in range(1, 9)
        ]
    )
    return repo


@pytest.fixture
def ids(db, tracks):
    rows = db.connect().execute("SELECT id FROM tracks ORDER BY id").fetchall()
    return [int(row["id"]) for row in rows]


@pytest.fixture
def repo(db, tracks):
    return CollectionRepository(db)


@pytest.fixture
def warmups(repo) -> int:
    return int(repo.create(Collection(name="Warmups", kind=KIND_COLLECTION)).id)


def make(repo, name, kind=KIND_COLLECTION, parent_id=None, rules=None) -> int:
    return int(
        repo.create(
            Collection(name=name, kind=kind, parent_id=parent_id, rules_json=rules)
        ).id
    )


def sibling_positions(repo, parent_id):
    return [node.position for node in repo.children_of(parent_id)]


def entry_positions(repo, collection_id):
    return [entry.position for entry in repo.entries(collection_id)]


def assert_contiguous(values):
    """No gaps, no repeats, starting at zero."""
    assert values == list(range(len(values))), f"positions are not contiguous: {values}"


def track_count(db) -> int:
    return int(db.connect().execute("SELECT count(*) AS n FROM tracks").fetchone()["n"])


class TestCreating:
    def test_a_node_comes_back_with_an_id_and_a_place(self, repo):
        node = repo.create(Collection(name="Warmups", kind=KIND_COLLECTION))
        assert node.id is not None
        assert (node.position, node.depth) == (0, 0)

    def test_siblings_are_appended_in_order(self, repo):
        for name in ("A", "B", "C"):
            make(repo, name)
        assert [n.name for n in repo.children_of(None)] == ["A", "B", "C"]
        assert_contiguous(sibling_positions(repo, None))

    def test_depth_comes_from_the_parent(self, repo):
        top = make(repo, "Sets", kind=KIND_FOLDER)
        inner = make(repo, "2026", kind=KIND_FOLDER, parent_id=top)
        leaf = make(repo, "March", parent_id=inner)
        assert [repo.get(i).depth for i in (top, inner, leaf)] == [0, 1, 2]

    def test_children_of_different_parents_number_separately(self, repo):
        a = make(repo, "A", kind=KIND_FOLDER)
        b = make(repo, "B", kind=KIND_FOLDER)
        make(repo, "a1", parent_id=a)
        make(repo, "b1", parent_id=b)
        assert sibling_positions(repo, a) == [0]
        assert sibling_positions(repo, b) == [0]

    def test_the_tree_reads_parents_before_children(self, repo):
        top = make(repo, "Sets", kind=KIND_FOLDER)
        make(repo, "March", parent_id=top)
        make(repo, "Other", kind=KIND_FOLDER)
        assert [n.name for n in repo.tree()] == ["Sets", "Other", "March"]

    def test_the_tree_is_one_query(self, db, repo):
        for i in range(5):
            make(repo, f"C{i}")
        connection = db.connect()
        statements = []
        connection.set_trace_callback(statements.append)
        try:
            repo.tree()
        finally:
            connection.set_trace_callback(None)
        assert len(statements) == 1


class TestMovingAndReordering:
    @pytest.fixture
    def flat(self, repo):
        return [make(repo, name) for name in ("A", "B", "C", "D")]

    def test_reordering_to_the_front(self, repo, flat):
        repo.reorder(flat[3], 0)
        assert [n.name for n in repo.children_of(None)] == ["D", "A", "B", "C"]
        assert_contiguous(sibling_positions(repo, None))

    def test_reordering_to_the_back(self, repo, flat):
        repo.reorder(flat[0], 3)
        assert [n.name for n in repo.children_of(None)] == ["B", "C", "D", "A"]
        assert_contiguous(sibling_positions(repo, None))

    def test_reordering_into_the_middle(self, repo, flat):
        repo.reorder(flat[0], 2)
        assert [n.name for n in repo.children_of(None)] == ["B", "C", "A", "D"]
        assert_contiguous(sibling_positions(repo, None))

    def test_reordering_past_the_end_lands_at_the_end(self, repo, flat):
        repo.reorder(flat[0], 99)
        assert [n.name for n in repo.children_of(None)][-1] == "A"
        assert_contiguous(sibling_positions(repo, None))

    def test_a_move_that_keeps_the_parent_is_a_reorder(self, repo, flat):
        # The case that leaves a gap if it goes through the reparenting path:
        # the node gets counted in its own sibling list twice.
        repo.move(flat[3], None, 0)
        assert [n.name for n in repo.children_of(None)] == ["D", "A", "B", "C"]
        assert_contiguous(sibling_positions(repo, None))

    def test_a_position_less_move_to_the_same_parent_changes_nothing(self, repo, flat):
        """What the same-parent branch is actually for.

        Parking a moved node past the end of the sibling list made the
        reparenting path safe for same-parent moves too, so contiguity no
        longer depends on the branch. This does: without it, re-dropping a node
        on the parent it already has appends it to the end of its own siblings.
        """
        repo.move(flat[1], None)
        assert [n.name for n in repo.children_of(None)] == ["A", "B", "C", "D"]
        assert_contiguous(sibling_positions(repo, None))

    def test_moving_between_parents_closes_and_opens(self, repo):
        left = make(repo, "Left", kind=KIND_FOLDER)
        right = make(repo, "Right", kind=KIND_FOLDER)
        a = make(repo, "a", parent_id=left)
        make(repo, "b", parent_id=left)
        make(repo, "x", parent_id=right)

        repo.move(a, right, 0)

        assert [n.name for n in repo.children_of(left)] == ["b"]
        assert [n.name for n in repo.children_of(right)] == ["a", "x"]
        assert_contiguous(sibling_positions(repo, left))
        assert_contiguous(sibling_positions(repo, right))

    def test_moving_to_the_top_level(self, repo):
        folder = make(repo, "Folder", kind=KIND_FOLDER)
        child = make(repo, "child", parent_id=folder)
        repo.move(child, None)
        assert repo.get(child).parent_id is None
        assert repo.get(child).depth == 0
        assert_contiguous(sibling_positions(repo, None))

    def test_a_moved_subtree_takes_its_depths_with_it(self, repo):
        top = make(repo, "Top", kind=KIND_FOLDER)
        mid = make(repo, "Mid", kind=KIND_FOLDER, parent_id=top)
        leaf = make(repo, "Leaf", parent_id=mid)
        other = make(repo, "Other", kind=KIND_FOLDER)

        repo.move(mid, other)

        assert repo.get(mid).depth == 1
        assert repo.get(leaf).depth == 2

    def test_moving_back_up_shrinks_the_depths_again(self, repo):
        top = make(repo, "Top", kind=KIND_FOLDER)
        mid = make(repo, "Mid", kind=KIND_FOLDER, parent_id=top)
        leaf = make(repo, "Leaf", parent_id=mid)

        repo.move(mid, None)

        assert repo.get(mid).depth == 0
        assert repo.get(leaf).depth == 1

    def test_moving_a_node_that_is_not_there_answers_none(self, repo):
        assert repo.move(999_999, None) is None
        assert repo.reorder(999_999, 0) is None


class TestSubtreeReads:
    @pytest.fixture
    def tree(self, repo, ids):
        top = make(repo, "Top", kind=KIND_FOLDER)
        mid = make(repo, "Mid", kind=KIND_FOLDER, parent_id=top)
        leaf = make(repo, "Leaf", parent_id=mid)
        smart = make(repo, "Smart", kind=KIND_SMART, parent_id=top, rules="{}")
        repo.add(leaf, ids[:3])
        return {"top": top, "mid": mid, "leaf": leaf, "smart": smart}

    def test_subtree_ids_include_the_node_itself(self, repo, tree):
        assert set(repo.subtree_ids(tree["top"])) == set(tree.values())

    def test_a_leaf_is_its_own_subtree(self, repo, tree):
        assert repo.subtree_ids(tree["leaf"]) == [tree["leaf"]]

    def test_the_summary_counts_every_kind(self, repo, tree):
        summary = repo.subtree_summary(tree["top"])
        assert (summary.folders, summary.collections, summary.smart_collections) == (
            2,
            1,
            1,
        )
        assert summary.entries == 3
        assert summary.nodes == 4

    def test_the_summary_of_a_leaf_is_just_the_leaf(self, repo, tree):
        summary = repo.subtree_summary(tree["leaf"])
        assert (summary.folders, summary.collections, summary.entries) == (0, 1, 3)

    def test_max_depth_sees_the_deepest_descendant(self, repo, tree):
        assert repo.max_depth_in_subtree(tree["top"]) == 2
        assert repo.max_depth_in_subtree(tree["leaf"]) == 2


class TestDeleting:
    def test_deleting_a_folder_takes_its_subtree(self, repo, ids):
        top = make(repo, "Top", kind=KIND_FOLDER)
        mid = make(repo, "Mid", kind=KIND_FOLDER, parent_id=top)
        leaf = make(repo, "Leaf", parent_id=mid)
        repo.add(leaf, ids[:2])

        assert repo.delete(top) is True
        assert repo.count() == 0

    def test_deleting_deletes_no_tracks(self, db, repo, ids):
        collection = make(repo, "Warmups")
        repo.add(collection, ids)
        repo.delete(collection)
        assert track_count(db) == len(ids)

    def test_siblings_close_up_behind_a_deleted_node(self, repo):
        nodes = [make(repo, name) for name in ("A", "B", "C")]
        repo.delete(nodes[0])
        assert [n.name for n in repo.children_of(None)] == ["B", "C"]
        assert_contiguous(sibling_positions(repo, None))

    def test_deleting_nothing_says_so(self, repo):
        assert repo.delete(999_999) is False


class TestMembership:
    def test_added_tracks_keep_the_order_they_were_given(self, repo, warmups, ids):
        wanted = [ids[3], ids[0], ids[2]]
        repo.add(warmups, wanted)
        assert repo.track_ids(warmups) == wanted
        assert_contiguous(entry_positions(repo, warmups))

    def test_adding_skips_what_is_already_there_and_says_so(self, repo, warmups, ids):
        repo.add(warmups, ids[:2])
        result = repo.add(warmups, ids[:4])
        assert result.added == 2
        assert result.skipped == 2
        assert result.skipped_track_ids == tuple(ids[:2])
        assert repo.entry_count(warmups) == 4

    def test_adding_nothing_does_nothing(self, repo, warmups):
        assert repo.add(warmups, []).added == 0
        assert repo.entry_count(warmups) == 0

    def test_duplicate_ids_in_one_add_are_added_once(self, repo, warmups, ids):
        result = repo.add(warmups, [ids[0], ids[0], ids[1]])
        assert result.added == 2

    def test_insert_at_makes_a_deliberate_duplicate(self, repo, warmups, ids):
        repo.add(warmups, ids[:3])
        entry = repo.insert_at(warmups, ids[0], 1)

        assert entry.position == 1
        assert repo.track_ids(warmups) == [ids[0], ids[0], ids[1], ids[2]]
        assert repo.entry_count(warmups) == 4
        assert repo.track_count(warmups) == 3
        assert_contiguous(entry_positions(repo, warmups))

    def test_removing_one_of_two_identical_entries_leaves_the_other(
        self, repo, warmups, ids
    ):
        repo.add(warmups, [ids[0]])
        second = repo.insert_at(warmups, ids[0], 1)

        assert repo.remove_entries([second.id]) == 1
        assert repo.track_ids(warmups) == [ids[0]]

    def test_insert_at_the_end_appends(self, repo, warmups, ids):
        repo.add(warmups, ids[:2])
        entry = repo.insert_at(warmups, ids[5], 99)
        assert entry.position == 2
        assert_contiguous(entry_positions(repo, warmups))

    def test_removing_entries_closes_every_gap(self, repo, warmups, ids):
        repo.add(warmups, ids[:6])
        entries = repo.entries(warmups)
        repo.remove_entries([entries[1].id, entries[3].id, entries[4].id])

        assert repo.track_ids(warmups) == [ids[0], ids[2], ids[5]]
        assert_contiguous(entry_positions(repo, warmups))

    def test_removing_nothing_removes_nothing(self, repo, warmups, ids):
        repo.add(warmups, ids[:2])
        assert repo.remove_entries([]) == 0
        assert repo.entry_count(warmups) == 2

    def test_removing_across_two_collections_renumbers_both(self, repo, ids):
        first = make(repo, "One")
        second = make(repo, "Two")
        repo.add(first, ids[:3])
        repo.add(second, ids[:3])

        removed = [repo.entries(first)[0].id, repo.entries(second)[1].id]
        repo.remove_entries(removed)

        assert_contiguous(entry_positions(repo, first))
        assert_contiguous(entry_positions(repo, second))

    def test_clearing_removes_every_entry_and_no_tracks(self, db, repo, warmups, ids):
        repo.add(warmups, ids)
        assert repo.clear(warmups) == len(ids)
        assert repo.entry_count(warmups) == 0
        assert track_count(db) == len(ids)

    def test_entries_page(self, repo, warmups, ids):
        repo.add(warmups, ids[:6])
        window = repo.entries(warmups, offset=2, limit=2)
        assert [e.track_id for e in window] == ids[2:4]

    def test_counts_differ_when_a_track_repeats(self, repo, warmups, ids):
        repo.add(warmups, ids[:3])
        repo.insert_at(warmups, ids[0], 0)
        assert repo.entry_count(warmups) == 4
        assert repo.track_count(warmups) == 3

    def test_an_entry_cannot_point_at_a_track_that_is_not_there(self, repo, warmups):
        with pytest.raises(sqlite3.IntegrityError):
            repo.add(warmups, [999_999])


class TestReorderingEntries:
    @pytest.fixture
    def filled(self, repo, warmups, ids):
        repo.add(warmups, ids[:5])
        return warmups

    def test_moving_the_first_entry_to_last(self, repo, filled, ids):
        first = repo.entries(filled)[0]
        repo.reorder_entry(first.id, 4)
        assert repo.track_ids(filled) == [ids[1], ids[2], ids[3], ids[4], ids[0]]
        assert_contiguous(entry_positions(repo, filled))

    def test_moving_the_last_entry_to_first(self, repo, filled, ids):
        last = repo.entries(filled)[-1]
        repo.reorder_entry(last.id, 0)
        assert repo.track_ids(filled) == [ids[4], ids[0], ids[1], ids[2], ids[3]]
        assert_contiguous(entry_positions(repo, filled))

    def test_moving_into_the_middle_both_ways(self, repo, filled, ids):
        entries = repo.entries(filled)
        repo.reorder_entry(entries[0].id, 3)
        assert repo.track_ids(filled) == [ids[1], ids[2], ids[3], ids[0], ids[4]]
        assert_contiguous(entry_positions(repo, filled))

        entries = repo.entries(filled)
        repo.reorder_entry(entries[3].id, 1)
        assert repo.track_ids(filled) == [ids[1], ids[0], ids[2], ids[3], ids[4]]
        assert_contiguous(entry_positions(repo, filled))

    def test_moving_to_where_it_already_is_changes_nothing(self, repo, filled, ids):
        before = repo.track_ids(filled)
        entries = repo.entries(filled)
        repo.reorder_entry(entries[2].id, 2)
        assert repo.track_ids(filled) == before

    def test_moving_past_the_end_lands_at_the_end(self, repo, filled, ids):
        first = repo.entries(filled)[0]
        repo.reorder_entry(first.id, 99)
        assert repo.track_ids(filled)[-1] == ids[0]
        assert_contiguous(entry_positions(repo, filled))

    def test_a_reorder_touches_only_the_range_it_crosses(self, db, repo, filled):
        # The reason ORG-01 declined a unique index on (collection_id,
        # position): the shift is arithmetic over the affected rows, not a
        # rewrite of the whole list.
        connection = db.connect()
        statements = []
        connection.set_trace_callback(statements.append)
        try:
            repo.reorder_entry(repo.entries(filled)[0].id, 2)
        finally:
            connection.set_trace_callback(None)
        updates = [s for s in statements if s.strip().upper().startswith("UPDATE")]
        assert len(updates) == 2  # one shift, one placement

    def test_reordering_an_entry_that_is_not_there_answers_none(self, repo):
        assert repo.reorder_entry(999_999, 0) is None


class TestReverseLookups:
    def test_a_track_lists_the_collections_holding_it(self, repo, ids):
        first = make(repo, "One")
        second = make(repo, "Two")
        repo.add(first, [ids[0]])
        repo.add(second, [ids[0], ids[1]])
        assert repo.collection_ids_for_track(ids[0]) == sorted([first, second])

    def test_a_track_held_twice_lists_its_collection_once(self, repo, warmups, ids):
        repo.add(warmups, [ids[0]])
        repo.insert_at(warmups, ids[0], 0)
        assert repo.collection_ids_for_track(ids[0]) == [warmups]

    def test_references_for_counts_each_collection_once(self, repo, ids):
        first = make(repo, "One")
        second = make(repo, "Two")
        repo.add(first, ids[:3])
        repo.add(second, [ids[0]])

        collections, tracks = repo.references_for(ids[:3])
        assert collections == sorted([first, second])
        assert tracks == sorted(ids[:3])

    def test_one_collection_holding_several_doomed_tracks_counts_once(
        self, repo, warmups, ids
    ):
        # The arithmetic DEC-011's sentence depends on: how many Collections a
        # user would find changed, not how many entries would go.
        repo.add(warmups, ids[:3])
        collections, tracks = repo.references_for(ids[:3])
        assert collections == [warmups]
        assert tracks == sorted(ids[:3])

    def test_references_for_ignores_tracks_nothing_holds(self, repo, warmups, ids):
        repo.add(warmups, [ids[0]])
        collections, tracks = repo.references_for(ids)
        assert collections == [warmups]
        assert tracks == [ids[0]]

    def test_references_for_nothing_is_empty(self, repo):
        assert repo.references_for([]) == ([], [])

    def test_deleting_a_track_takes_its_entries(self, repo, tracks, warmups, ids):
        repo.add(warmups, ids[:3])
        tracks.delete(ids[0])
        assert repo.entry_count(warmups) == 2
        assert repo.track_ids(warmups) == ids[1:3]


class TestWhatACascadeLeavesBehind:
    """A refresh deletes tracks in SQL, and this module never sees it.

    DEC-003 removes a track that has left Rekordbox, and ``m0009``'s cascade
    takes its Collection entries with it — inside SQLite, with no Python
    involved and therefore no renumbering. So the contiguity this repository
    guarantees is about *its own* operations: after a cascade a Collection can
    hold entries at 0 and 2.

    That is harmless and is asserted here rather than left to be discovered:
    order is read with ``ORDER BY position``, so a gap changes nothing a user
    sees, and the next mutation closes it. Renumbering from the cascade would
    mean the refresh had to know about Collections, which is a coupling not
    worth buying with anything.
    """

    def test_the_order_survives_a_cascade(self, repo, tracks, warmups, ids):
        repo.add(warmups, ids[:4])
        tracks.delete(ids[1])
        assert repo.track_ids(warmups) == [ids[0], ids[2], ids[3]]

    def test_a_gap_can_exist_after_a_cascade(self, repo, tracks, warmups, ids):
        repo.add(warmups, ids[:4])
        tracks.delete(ids[1])
        assert [e.position for e in repo.entries(warmups)] == [0, 2, 3]

    def test_the_next_removal_closes_it(self, repo, tracks, warmups, ids):
        repo.add(warmups, ids[:4])
        tracks.delete(ids[1])
        repo.remove_entries([repo.entries(warmups)[-1].id])
        assert_contiguous(entry_positions(repo, warmups))

    def test_inserting_after_a_gap_still_lands_where_asked(
        self, repo, tracks, warmups, ids
    ):
        repo.add(warmups, ids[:4])
        tracks.delete(ids[1])
        repo.insert_at(warmups, ids[5], 1)
        assert repo.track_ids(warmups) == [ids[0], ids[5], ids[2], ids[3]]
