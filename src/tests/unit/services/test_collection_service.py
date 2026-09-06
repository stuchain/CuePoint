#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The rules of the collection tree (ORG-04, DEC-058, DEC-059).

The repository knows how to write a tree. These tests are about what a *legal*
tree is, and every rule here corresponds to a bug that is easy to ship:

**A node moved into its own subtree disappears.** The pair stays in the database
and vanishes from every walk that starts at the root, so the user loses a folder
and its contents with no error and nothing to click. Tried here at several
depths, including the degenerate "into itself".

**A folder is the only thing that can contain something.** Letting a Collection
appear to hold nodes would draw a tree the data cannot represent.

**Depth is checked for the subtree, not the node.** A two-deep subtree dropped
six levels down puts its leaves past the cap while the node being dragged lands
comfortably inside it — the check that is easy to write against the wrong thing.

**A Smart Collection cannot be handed rows.** DEC-061 makes its membership a
question; storing rows against it would be a second, silently disagreeing
answer.

And one thing that is deliberately *not* here: adding a track to a Collection
writes no track history. It is not a change to the track.
"""

from __future__ import annotations

import pytest

from cuepoint.models.collection import (
    KIND_SMART,
    MAX_COLLECTION_DEPTH,
    Collection,
)
from cuepoint.models.library_track import LibraryTrack
from cuepoint.persistence.activity_repository import ActivityRepository
from cuepoint.persistence.collection_repository import CollectionRepository
from cuepoint.persistence.track_repository import TrackRepository
from cuepoint.services.activity_service import ActivityService
from cuepoint.services.collection_service import CollectionService
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
            for i in range(1, 7)
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
def service(db, repo):
    return CollectionService(repo, db)


@pytest.fixture
def warmups(service) -> int:
    return int(service.create_collection("Warmups").id)


class TestCreating:
    def test_a_collection_lands_at_the_top(self, service):
        node = service.create_collection("Warmups")
        assert (node.parent_id, node.depth, node.position) == (None, 0, 0)

    def test_a_folder_can_hold_a_collection(self, service):
        folder = service.create_folder("Sets")
        inner = service.create_collection("March", parent_id=folder.id)
        assert inner.parent_id == folder.id
        assert inner.depth == 1

    def test_a_collection_cannot_hold_anything(self, service, warmups):
        with pytest.raises(ValueError, match="only a folder can"):
            service.create_collection("Nested", parent_id=warmups)

    def test_a_smart_collection_cannot_hold_anything(self, service, repo):
        smart = repo.create(Collection(name="Recent", kind=KIND_SMART, rules_json="{}"))
        with pytest.raises(ValueError, match="only a folder can"):
            service.create_folder("Nested", parent_id=smart.id)

    def test_a_parent_that_is_not_there_is_refused(self, service):
        with pytest.raises(ValueError, match="No such collection"):
            service.create_collection("Orphan", parent_id=999_999)

    @pytest.mark.parametrize("name", ["", "   ", None])
    def test_a_node_needs_a_name(self, service, name):
        with pytest.raises(ValueError, match="needs a name"):
            service.create_collection(name)

    def test_two_nodes_may_share_a_name(self, service):
        # Told apart by where they are, like two folders called "2024".
        first = service.create_folder("2026")
        second = service.create_folder("2026")
        assert first.id != second.id

    def test_the_depth_cap_is_enforced_on_create(self, service):
        parent = None
        for level in range(MAX_COLLECTION_DEPTH + 1):
            parent = service.create_folder(f"L{level}", parent_id=parent).id
        with pytest.raises(ValueError, match="at most"):
            service.create_collection("too deep", parent_id=parent)


class TestMoving:
    @pytest.fixture
    def tree(self, service):
        """Top > Mid > Deep, all folders, plus a Collection and a sibling.

        The descendants are folders on purpose: a Collection destination is
        refused by the folders-only rule before the cycle check is reached, so
        a cycle test aimed at one would be asserting the wrong refusal.
        """
        top = service.create_folder("Top")
        mid = service.create_folder("Mid", parent_id=top.id)
        deep = service.create_folder("Deep", parent_id=mid.id)
        leaf = service.create_collection("Leaf", parent_id=mid.id)
        other = service.create_folder("Other")
        return {
            "top": top.id,
            "mid": mid.id,
            "deep": deep.id,
            "leaf": leaf.id,
            "other": other.id,
        }

    def test_a_node_cannot_be_moved_into_itself(self, service, tree):
        with pytest.raises(ValueError, match="cannot contain itself"):
            service.move(tree["top"], tree["top"])

    def test_a_node_cannot_be_moved_into_its_own_child(self, service, tree):
        with pytest.raises(ValueError, match="inside itself"):
            service.move(tree["top"], tree["mid"])

    def test_a_node_cannot_be_moved_into_its_own_grandchild(self, service, tree):
        with pytest.raises(ValueError, match="inside itself"):
            service.move(tree["top"], tree["deep"])

    def test_the_folders_only_rule_is_checked_before_the_cycle(self, service, tree):
        """Both refusals are right; the more specific one is more useful.

        Dropping a folder onto a Collection inside it breaks two rules at once.
        "Leaf is a collection" tells the user what to do differently; "cannot be
        moved inside itself" leaves them wondering which part was the problem.
        """
        with pytest.raises(ValueError, match="only a folder can"):
            service.move(tree["top"], tree["leaf"])

    def test_a_refused_move_changes_nothing(self, service, repo, tree):
        before = [(n.id, n.parent_id, n.position, n.depth) for n in repo.tree()]
        with pytest.raises(ValueError):
            service.move(tree["top"], tree["deep"])
        assert [(n.id, n.parent_id, n.position, n.depth) for n in repo.tree()] == before

    def test_a_sibling_can_be_moved_into_a_sibling(self, service, tree):
        moved = service.move(tree["other"], tree["top"])
        assert moved.parent_id == tree["top"]
        assert moved.depth == 1

    def test_moving_into_a_collection_is_refused(self, service, tree):
        with pytest.raises(ValueError, match="only a folder can"):
            service.move(tree["other"], tree["leaf"])

    def test_moving_to_a_parent_that_is_not_there_is_refused(self, service, tree):
        with pytest.raises(ValueError, match="No such collection"):
            service.move(tree["leaf"], 999_999)

    def test_moving_a_node_that_is_not_there_is_refused(self, service, tree):
        with pytest.raises(ValueError, match="No such collection"):
            service.move(999_999, tree["top"])

    def test_a_subtree_that_would_end_up_too_deep_is_refused(self, service):
        # The check that is easy to write against the node instead of the
        # subtree: "Deep" itself would fit, its leaf would not.
        chain = None
        for level in range(MAX_COLLECTION_DEPTH):
            chain = service.create_folder(f"L{level}", parent_id=chain).id

        root = service.create_folder("Deep")
        service.create_collection("Leaf", parent_id=root.id)

        with pytest.raises(ValueError, match="deeper than"):
            service.move(root.id, chain)

    def test_a_subtree_that_fits_is_allowed(self, service):
        chain = None
        for level in range(MAX_COLLECTION_DEPTH - 1):
            chain = service.create_folder(f"L{level}", parent_id=chain).id

        root = service.create_folder("Shallow")
        leaf = service.create_collection("Leaf", parent_id=root.id)

        service.move(root.id, chain)
        assert service.get(leaf.id).depth == MAX_COLLECTION_DEPTH

    def test_reordering_refuses_a_negative_position(self, service, tree):
        with pytest.raises(ValueError, match="cannot be negative"):
            service.reorder(tree["leaf"], -1)


class TestDeleting:
    @pytest.fixture
    def tree(self, service, ids):
        top = service.create_folder("Top")
        mid = service.create_folder("Mid", parent_id=top.id)
        leaf = service.create_collection("Leaf", parent_id=mid.id)
        service.add_tracks(leaf.id, ids[:3])
        return {"top": top.id, "mid": mid.id, "leaf": leaf.id}

    def test_the_preview_says_what_would_go(self, service, tree):
        summary = service.delete_preview(tree["top"])
        assert (summary.folders, summary.collections, summary.entries) == (2, 1, 3)

    def test_the_preview_changes_nothing(self, service, repo, tree):
        service.delete_preview(tree["top"])
        assert repo.count() == 3

    def test_deleting_returns_what_went(self, service, tree):
        summary = service.delete(tree["top"])
        assert summary.nodes == 3
        assert summary.entries == 3

    def test_deleting_removes_the_subtree(self, service, repo, tree):
        service.delete(tree["top"])
        assert repo.count() == 0

    def test_deleting_deletes_no_tracks(self, service, tracks, tree, ids):
        service.delete(tree["top"])
        assert tracks.count() == len(ids)

    def test_deleting_a_node_that_is_not_there_is_refused(self, service):
        with pytest.raises(ValueError, match="No such collection"):
            service.delete(999_999)


class TestMembership:
    def test_adding_reports_what_it_skipped(self, service, warmups, ids):
        service.add_tracks(warmups, ids[:2])
        result = service.add_tracks(warmups, ids[:4])
        assert (result.added, result.skipped) == (2, 2)

    def test_a_deliberate_duplicate_goes_in(self, service, warmups, ids):
        service.add_tracks(warmups, ids[:2])
        service.insert_track(warmups, ids[0], 0)
        assert service.counts(warmups) == (3, 2)

    def test_counts_report_entries_and_distinct_tracks(self, service, warmups, ids):
        service.add_tracks(warmups, ids[:3])
        assert service.counts(warmups) == (3, 3)

    def test_a_folder_cannot_hold_tracks(self, service, ids):
        folder = service.create_folder("Sets")
        with pytest.raises(ValueError, match="is a folder"):
            service.add_tracks(folder.id, ids[:1])

    def test_a_smart_collection_cannot_be_given_tracks(self, service, repo, ids):
        smart = repo.create(Collection(name="Recent", kind=KIND_SMART, rules_json="{}"))
        with pytest.raises(ValueError, match="comes from its rules"):
            service.add_tracks(smart.id, ids[:1])
        with pytest.raises(ValueError, match="comes from its rules"):
            service.insert_track(smart.id, ids[0], 0)

    def test_adding_to_a_node_that_is_not_there_is_refused(self, service, ids):
        with pytest.raises(ValueError, match="No such collection"):
            service.add_tracks(999_999, ids[:1])

    def test_removing_entries_returns_how_many_went(self, service, warmups, ids):
        service.add_tracks(warmups, ids[:3])
        entries = service.entries(warmups)
        assert service.remove_entries([entries[0].id, entries[2].id]) == 2
        assert [e.position for e in service.entries(warmups)] == [0]

    def test_reordering_an_entry_that_is_not_there_is_refused(self, service):
        with pytest.raises(ValueError, match="No such entry"):
            service.reorder_entry(999_999, 0)

    def test_a_negative_position_is_refused(self, service, warmups, ids):
        service.add_tracks(warmups, ids[:2])
        entry = service.entries(warmups)[0]
        with pytest.raises(ValueError, match="cannot be negative"):
            service.reorder_entry(entry.id, -1)
        with pytest.raises(ValueError, match="cannot be negative"):
            service.insert_track(warmups, ids[0], -1)


class TestFilingIsNotAChangeToTheTrack:
    """DEC-008 is about a track's own fields."""

    @pytest.fixture
    def activity(self, db, tracks):
        return ActivityService(ActivityRepository(db), tracks)

    def test_adding_a_track_writes_no_track_history(
        self, service, activity, warmups, ids
    ):
        service.add_tracks(warmups, ids[:3])
        assert activity.track_history(ids[0]) == []

    def test_removing_an_entry_writes_no_track_history(
        self, service, activity, warmups, ids
    ):
        service.add_tracks(warmups, ids[:1])
        service.remove_entries([service.entries(warmups)[0].id])
        assert activity.track_history(ids[0]) == []

    def test_deleting_a_collection_writes_no_track_history(
        self, service, activity, warmups, ids
    ):
        service.add_tracks(warmups, ids[:2])
        service.delete(warmups)
        assert activity.track_history(ids[0]) == []
