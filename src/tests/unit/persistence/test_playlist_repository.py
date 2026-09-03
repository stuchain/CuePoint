#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Unit tests for the mirrored Rekordbox playlist repository (LIBRARY-03).

The property that matters is that the tree can be rebuilt from the database
exactly as Rekordbox wrote it — the same nodes, in the same order, with the same
membership in the same order. That is asserted by walking ``parent_id`` and
comparing against the input, because a DJ's playlist order is a set list, not a
rendering detail.
"""

from __future__ import annotations

import sqlite3

import pytest

from cuepoint.models.library_track import LibraryTrack
from cuepoint.models.rekordbox_playlist import (
    KIND_FOLDER,
    KIND_PLAYLIST,
    RekordboxPlaylist,
)
from cuepoint.persistence.playlist_repository import PlaylistRepository
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
                title=f"T{i}",
                artist="A",
                file_path=f"/m/{i}.mp3",
            )
            for i in range(1, 11)
        ]
    )
    return repo


@pytest.fixture
def repo(db):
    return PlaylistRepository(db)


def node(name, kind, depth, position, path, parent_path=None, refs=()):
    return RekordboxPlaylist(
        name=name,
        kind=kind,
        depth=depth,
        position=position,
        rekordbox_path=path,
        parent_path=parent_path,
        track_refs=list(refs),
    )


def sample_tree():
    """ROOT / (TEST / test, testt) + (VENUE / Dybbuk / peak, Stoa / peak)."""
    return [
        node("ROOT", KIND_FOLDER, 0, 0, "ROOT"),
        node("TEST", KIND_FOLDER, 1, 0, "ROOT/TEST", "ROOT"),
        node("test", KIND_PLAYLIST, 2, 0, "ROOT/TEST/test", "ROOT/TEST", ["1", "2"]),
        node("testt", KIND_PLAYLIST, 2, 1, "ROOT/TEST/testt", "ROOT/TEST", ["3"]),
        node("VENUE", KIND_FOLDER, 1, 1, "ROOT/VENUE", "ROOT"),
        node("Dybbuk", KIND_FOLDER, 2, 0, "ROOT/VENUE/Dybbuk", "ROOT/VENUE"),
        node(
            "peak",
            KIND_PLAYLIST,
            3,
            0,
            "ROOT/VENUE/Dybbuk/peak",
            "ROOT/VENUE/Dybbuk",
            ["4", "5", "4"],
        ),
        node("Stoa", KIND_FOLDER, 2, 1, "ROOT/VENUE/Stoa", "ROOT/VENUE"),
        node(
            "peak",
            KIND_PLAYLIST,
            3,
            0,
            "ROOT/VENUE/Stoa/peak",
            "ROOT/VENUE/Stoa",
            ["6"],
        ),
    ]


def rebuild(repo: PlaylistRepository, db: DatabaseService):
    """Walk the stored tree by parent_id and return (path, kind, refs) tuples."""
    rekordbox_ids = {
        int(r["id"]): str(r["rekordbox_track_id"])
        for r in db.connect().execute("SELECT id, rekordbox_track_id FROM tracks")
    }
    out = []

    def walk(parent_id, prefix):
        for child in repo.children_of(parent_id):
            path = f"{prefix}/{child.name}" if prefix else child.name
            refs = (
                [rekordbox_ids[t] for t in repo.track_ids_for(child.id)]
                if not child.is_folder
                else []
            )
            out.append((path, child.kind, refs))
            walk(child.id, path)

    walk(None, "")
    return out


@pytest.mark.unit
class TestReplaceTree:
    def test_writes_every_node_and_entry(self, repo, tracks):
        result = repo.replace_tree(sample_tree())

        assert (result.folders, result.playlists) == (5, 4)
        assert result.nodes == 9
        assert result.entries == 7
        assert result.missing_count == 0
        assert repo.count() == 9
        assert repo.count_entries() == 7

    def test_the_tree_rebuilds_exactly(self, repo, tracks, db):
        repo.replace_tree(sample_tree())

        assert rebuild(repo, db) == [
            ("ROOT", KIND_FOLDER, []),
            ("ROOT/TEST", KIND_FOLDER, []),
            ("ROOT/TEST/test", KIND_PLAYLIST, ["1", "2"]),
            ("ROOT/TEST/testt", KIND_PLAYLIST, ["3"]),
            ("ROOT/VENUE", KIND_FOLDER, []),
            ("ROOT/VENUE/Dybbuk", KIND_FOLDER, []),
            ("ROOT/VENUE/Dybbuk/peak", KIND_PLAYLIST, ["4", "5", "4"]),
            ("ROOT/VENUE/Stoa", KIND_FOLDER, []),
            ("ROOT/VENUE/Stoa/peak", KIND_PLAYLIST, ["6"]),
        ]

    def test_parent_ids_form_the_hierarchy(self, repo, tracks):
        repo.replace_tree(sample_tree())

        root = repo.find_by_path("ROOT")
        venue = repo.find_by_path("ROOT/VENUE")
        dybbuk = repo.find_by_path("ROOT/VENUE/Dybbuk")
        peak = repo.find_by_path("ROOT/VENUE/Dybbuk/peak")

        assert root.parent_id is None
        assert venue.parent_id == root.id
        assert dybbuk.parent_id == venue.id
        assert peak.parent_id == dybbuk.id

    def test_the_same_name_under_different_parents_stays_separate(
        self, repo, tracks, db
    ):
        """Twelve names repeat across a real export's tree."""
        repo.replace_tree(sample_tree())

        peaks = [n for n in repo.list_all() if n.name == "peak"]
        assert len(peaks) == 2
        assert {p.parent_id for p in peaks} == {
            repo.find_by_path("ROOT/VENUE/Dybbuk").id,
            repo.find_by_path("ROOT/VENUE/Stoa").id,
        }
        assert [
            [
                r["rekordbox_track_id"]
                for r in db.connect().execute(
                    "SELECT t.rekordbox_track_id FROM rekordbox_playlist_tracks pt "
                    "JOIN tracks t ON t.id = pt.track_id "
                    "WHERE pt.playlist_id = ? ORDER BY pt.position",
                    (p.id,),
                )
            ]
            for p in sorted(peaks, key=lambda n: n.id)
        ] == [["4", "5", "4"], ["6"]]

    def test_membership_order_is_preserved(self, repo, tracks, db):
        repo.replace_tree(
            [
                node("ROOT", KIND_FOLDER, 0, 0, "ROOT"),
                node(
                    "set", KIND_PLAYLIST, 1, 0, "ROOT/set", "ROOT", ["9", "1", "7", "3"]
                ),
            ]
        )
        playlist = repo.find_by_path("ROOT/set")
        rekordbox_ids = {
            int(r["id"]): str(r["rekordbox_track_id"])
            for r in db.connect().execute("SELECT id, rekordbox_track_id FROM tracks")
        }
        assert [rekordbox_ids[t] for t in repo.track_ids_for(playlist.id)] == [
            "9",
            "1",
            "7",
            "3",
        ]

    def test_a_track_may_repeat_within_one_playlist(self, repo, tracks):
        """19 playlists in a real export do; one holds a track eight times."""
        repo.replace_tree(
            [
                node("ROOT", KIND_FOLDER, 0, 0, "ROOT"),
                node(
                    "set", KIND_PLAYLIST, 1, 0, "ROOT/set", "ROOT", ["2", "2", "2", "2"]
                ),
            ]
        )
        playlist = repo.find_by_path("ROOT/set")
        ids = repo.track_ids_for(playlist.id)
        assert len(ids) == 4
        assert len(set(ids)) == 1

    def test_empty_playlists_and_folders_survive(self, repo, tracks):
        repo.replace_tree(
            [
                node("ROOT", KIND_FOLDER, 0, 0, "ROOT"),
                node("staging", KIND_PLAYLIST, 1, 0, "ROOT/staging", "ROOT"),
                node("STELIOS", KIND_FOLDER, 1, 1, "ROOT/STELIOS", "ROOT"),
            ]
        )
        assert repo.count() == 3
        assert repo.find_by_path("ROOT/staging").track_count == 0
        assert repo.children_of(repo.find_by_path("ROOT/STELIOS").id) == []

    def test_track_count_records_what_was_stored(self, repo, tracks):
        repo.replace_tree(
            [
                node("ROOT", KIND_FOLDER, 0, 0, "ROOT"),
                node("set", KIND_PLAYLIST, 1, 0, "ROOT/set", "ROOT", ["1", "2", "3"]),
            ]
        )
        assert repo.find_by_path("ROOT/set").track_count == 3

    def test_replacing_leaves_no_trace_of_the_previous_tree(self, repo, tracks):
        repo.replace_tree(sample_tree())
        repo.replace_tree(
            [
                node("ROOT", KIND_FOLDER, 0, 0, "ROOT"),
                node("only", KIND_PLAYLIST, 1, 0, "ROOT/only", "ROOT", ["1"]),
            ]
        )
        assert repo.count() == 2
        assert repo.count_entries() == 1
        assert repo.find_by_path("ROOT/VENUE") is None

    def test_replacing_with_the_same_tree_is_stable(self, repo, tracks, db):
        repo.replace_tree(sample_tree())
        first = rebuild(repo, db)
        repo.replace_tree(sample_tree())
        assert rebuild(repo, db) == first
        assert repo.count() == 9

    def test_the_nodes_are_stamped_with_their_ids(self, repo, tracks):
        nodes = sample_tree()
        repo.replace_tree(nodes)
        assert all(n.id is not None for n in nodes)
        assert nodes[0].parent_id is None
        assert nodes[1].parent_id == nodes[0].id


@pytest.mark.unit
class TestUnknownTrackReferences:
    """A playlist referencing a track the library does not hold (spec case)."""

    def test_an_unknown_reference_does_not_fail_the_import(self, repo, tracks):
        result = repo.replace_tree(
            [
                node("ROOT", KIND_FOLDER, 0, 0, "ROOT"),
                node("set", KIND_PLAYLIST, 1, 0, "ROOT/set", "ROOT", ["1", "999", "2"]),
            ]
        )
        assert result.entries == 2
        assert result.missing_track_refs == ("999",)

    def test_the_surviving_entries_keep_their_relative_order(self, repo, tracks, db):
        repo.replace_tree(
            [
                node("ROOT", KIND_FOLDER, 0, 0, "ROOT"),
                node("set", KIND_PLAYLIST, 1, 0, "ROOT/set", "ROOT", ["3", "999", "1"]),
            ]
        )
        playlist = repo.find_by_path("ROOT/set")
        rekordbox_ids = {
            int(r["id"]): str(r["rekordbox_track_id"])
            for r in db.connect().execute("SELECT id, rekordbox_track_id FROM tracks")
        }
        assert [rekordbox_ids[t] for t in repo.track_ids_for(playlist.id)] == ["3", "1"]

    def test_track_count_reflects_what_is_actually_stored(self, repo, tracks):
        """A count the mirror cannot back up with rows would be a lie."""
        repo.replace_tree(
            [
                node("ROOT", KIND_FOLDER, 0, 0, "ROOT"),
                node(
                    "set", KIND_PLAYLIST, 1, 0, "ROOT/set", "ROOT", ["1", "999", "998"]
                ),
            ]
        )
        assert repo.find_by_path("ROOT/set").track_count == 1

    def test_repeated_unknown_references_are_all_reported(self, repo, tracks):
        result = repo.replace_tree(
            [
                node("ROOT", KIND_FOLDER, 0, 0, "ROOT"),
                node(
                    "set",
                    KIND_PLAYLIST,
                    1,
                    0,
                    "ROOT/set",
                    "ROOT",
                    ["999", "999", "998"],
                ),
            ]
        )
        assert result.missing_track_refs == ("999", "999", "998")
        assert result.missing_count == 3

    def test_a_tree_of_only_unknown_references_still_stores_its_nodes(self, repo, db):
        result = repo.replace_tree(
            [
                node("ROOT", KIND_FOLDER, 0, 0, "ROOT"),
                node("set", KIND_PLAYLIST, 1, 0, "ROOT/set", "ROOT", ["1", "2"]),
            ]
        )
        assert result.nodes == 2
        assert result.entries == 0
        assert repo.count() == 2


@pytest.mark.unit
class TestOrderingContract:
    def test_a_node_arriving_before_its_parent_is_refused(self, repo, tracks):
        """Loud, because a silently reparented node corrupts the whole tree."""
        with pytest.raises(ValueError, match="parents-first"):
            repo.replace_tree(
                [node("orphan", KIND_PLAYLIST, 1, 0, "ROOT/orphan", "ROOT")]
            )

    def test_a_failed_write_leaves_the_previous_tree_intact(self, repo, tracks, db):
        repo.replace_tree(sample_tree())
        before = rebuild(repo, db)

        with pytest.raises(ValueError):
            repo.replace_tree(
                [
                    node("ROOT", KIND_FOLDER, 0, 0, "ROOT"),
                    node("deep", KIND_PLAYLIST, 3, 0, "ROOT/a/b/deep", "ROOT/a/b"),
                ]
            )

        assert rebuild(repo, db) == before

    def test_a_subtree_that_has_ended_cannot_adopt_a_later_node(self, repo, tracks):
        """Going back up a level must not leave a stale deeper parent behind."""
        repo.replace_tree(
            [
                node("ROOT", KIND_FOLDER, 0, 0, "ROOT"),
                node("A", KIND_FOLDER, 1, 0, "ROOT/A", "ROOT"),
                node("deep", KIND_PLAYLIST, 2, 0, "ROOT/A/deep", "ROOT/A"),
                node("B", KIND_FOLDER, 1, 1, "ROOT/B", "ROOT"),
                node("shallow", KIND_PLAYLIST, 2, 0, "ROOT/B/shallow", "ROOT/B"),
            ]
        )
        assert (
            repo.find_by_path("ROOT/B/shallow").parent_id
            == repo.find_by_path("ROOT/B").id
        )

    def test_a_node_deeper_than_its_predecessor_by_more_than_one_is_refused(
        self, repo, tracks
    ):
        with pytest.raises(ValueError, match="parents-first"):
            repo.replace_tree(
                [
                    node("ROOT", KIND_FOLDER, 0, 0, "ROOT"),
                    node("skipped", KIND_PLAYLIST, 2, 0, "ROOT/x/skipped", "ROOT/x"),
                ]
            )

    def test_a_depth_jump_after_a_closed_subtree_is_refused(self, repo, tracks):
        """The case the stale-parent cleanup exists for.

        Going back up a level ends a subtree, and the ids recorded inside it
        must be forgotten. Without that, this malformed sequence silently
        attaches "orphan" to "deep" — a node from a subtree that already closed —
        instead of failing. The earlier version of this test used a well-formed
        tree, where a stale entry is never consulted, and so passed against code
        with the cleanup removed.
        """
        with pytest.raises(ValueError, match="parents-first"):
            repo.replace_tree(
                [
                    node("ROOT", KIND_FOLDER, 0, 0, "ROOT"),
                    node("A", KIND_FOLDER, 1, 0, "ROOT/A", "ROOT"),
                    node("deep", KIND_FOLDER, 2, 0, "ROOT/A/deep", "ROOT/A"),
                    node("B", KIND_FOLDER, 1, 1, "ROOT/B", "ROOT"),
                    node("orphan", KIND_PLAYLIST, 3, 0, "ROOT/B/?/orphan", "ROOT/B/?"),
                ]
            )


@pytest.mark.unit
class TestCascades:
    def test_deleting_a_track_removes_its_membership(self, repo, tracks, db):
        """DEC-003 deletes a track that left Rekordbox; its entries are unreachable."""
        repo.replace_tree(sample_tree())
        track = TrackRepository(db).find_by_rekordbox_id("4")

        assert repo.count_entries() == 7
        TrackRepository(db).delete(track.id)
        assert repo.count_entries() == 5

    def test_deleting_a_track_leaves_the_playlist_itself(self, repo, tracks, db):
        repo.replace_tree(sample_tree())
        TrackRepository(db).delete(TrackRepository(db).find_by_rekordbox_id("4").id)
        assert repo.find_by_path("ROOT/VENUE/Dybbuk/peak") is not None

    def test_deleting_a_folder_removes_its_whole_subtree(self, repo, tracks, db):
        repo.replace_tree(sample_tree())
        venue = repo.find_by_path("ROOT/VENUE")

        with db.transaction() as conn:
            conn.execute("DELETE FROM rekordbox_playlists WHERE id = ?", (venue.id,))

        assert repo.find_by_path("ROOT/VENUE/Dybbuk") is None
        assert repo.find_by_path("ROOT/VENUE/Dybbuk/peak") is None
        assert repo.find_by_path("ROOT/TEST/test") is not None

    def test_cascades_depend_on_the_pragma_being_on(self, db):
        """Asserted explicitly: without it every cascade above is a silent no-op."""
        row = db.connect().execute("PRAGMA foreign_keys").fetchone()
        assert row[0] == 1

    def test_clear_removes_everything(self, repo, tracks):
        repo.replace_tree(sample_tree())
        repo.clear()
        assert repo.count() == 0
        assert repo.count_entries() == 0


@pytest.mark.unit
class TestReads:
    def test_children_of_none_returns_the_roots(self, repo, tracks):
        repo.replace_tree(sample_tree())
        assert [n.name for n in repo.children_of(None)] == ["ROOT"]

    def test_children_are_returned_in_sibling_order_not_by_name(self, repo, tracks):
        """Names chosen so the two orders disagree.

        An earlier version used siblings whose alphabetical order happened to
        match their position, and passed against a repository that sorted by
        name — which would silently reorder a DJ's set list in Phase 4.
        """
        repo.replace_tree(
            [
                node("ROOT", KIND_FOLDER, 0, 0, "ROOT"),
                node("zeta", KIND_PLAYLIST, 1, 0, "ROOT/zeta", "ROOT"),
                node("alpha", KIND_PLAYLIST, 1, 1, "ROOT/alpha", "ROOT"),
                node("mid", KIND_PLAYLIST, 1, 2, "ROOT/mid", "ROOT"),
            ]
        )
        root = repo.find_by_path("ROOT")
        assert [n.name for n in repo.children_of(root.id)] == ["zeta", "alpha", "mid"]

    def test_list_all_is_in_sibling_order_not_by_name(self, repo, tracks):
        repo.replace_tree(
            [
                node("ROOT", KIND_FOLDER, 0, 0, "ROOT"),
                node("zeta", KIND_PLAYLIST, 1, 0, "ROOT/zeta", "ROOT"),
                node("alpha", KIND_PLAYLIST, 1, 1, "ROOT/alpha", "ROOT"),
            ]
        )
        assert [n.name for n in repo.list_all()] == ["ROOT", "zeta", "alpha"]

    def test_list_all_returns_parents_before_children(self, repo, tracks):
        repo.replace_tree(sample_tree())
        seen = set()
        for node_row in repo.list_all():
            if node_row.parent_id is not None:
                assert node_row.parent_id in seen
            seen.add(node_row.id)

    def test_get_returns_a_node_by_id(self, repo, tracks):
        repo.replace_tree(sample_tree())
        stored = repo.find_by_path("ROOT/TEST")
        assert repo.get(stored.id).name == "TEST"

    def test_get_returns_none_for_an_unknown_id(self, repo):
        assert repo.get(999) is None

    def test_find_by_path_returns_none_for_blank_and_unknown(self, repo, tracks):
        repo.replace_tree(sample_tree())
        assert repo.find_by_path("") is None
        assert repo.find_by_path("ROOT/nope") is None

    def test_find_by_path_is_deterministic_when_a_path_repeats(self, repo, tracks):
        """A name containing "/" can make two nodes share a path string.

        "COZMO_11/02" under "PAST SETS" and a folder "COZMO_11" holding "02"
        both render as the same path, so the lowest id wins rather than
        whichever row SQLite happens to return.
        """
        repo.replace_tree(
            [
                node("ROOT", KIND_FOLDER, 0, 0, "ROOT"),
                node("A/B", KIND_PLAYLIST, 1, 0, "ROOT/A/B", "ROOT", ["1"]),
                node("A", KIND_FOLDER, 1, 1, "ROOT/A", "ROOT"),
                node("B", KIND_PLAYLIST, 2, 0, "ROOT/A/B", "ROOT/A", ["2"]),
            ]
        )
        first = repo.find_by_path("ROOT/A/B")
        assert first is not None
        assert first.name == "A/B"
        assert repo.count() == 4, "both nodes are stored despite the shared path"

    def test_playlist_ids_for_track(self, repo, tracks):
        repo.replace_tree(sample_tree())
        track = TrackRepository(repo._db).find_by_rekordbox_id("4")
        assert repo.playlist_ids_for_track(track.id) == [
            repo.find_by_path("ROOT/VENUE/Dybbuk/peak").id
        ]

    def test_playlist_ids_for_track_deduplicates_repeats(self, repo, tracks, db):
        repo.replace_tree(
            [
                node("ROOT", KIND_FOLDER, 0, 0, "ROOT"),
                node("set", KIND_PLAYLIST, 1, 0, "ROOT/set", "ROOT", ["2", "2"]),
            ]
        )
        track = TrackRepository(db).find_by_rekordbox_id("2")
        assert len(repo.playlist_ids_for_track(track.id)) == 1

    def test_track_ids_for_an_empty_playlist(self, repo, tracks):
        repo.replace_tree(
            [
                node("ROOT", KIND_FOLDER, 0, 0, "ROOT"),
                node("staging", KIND_PLAYLIST, 1, 0, "ROOT/staging", "ROOT"),
            ]
        )
        assert repo.track_ids_for(repo.find_by_path("ROOT/staging").id) == []

    def test_counts_on_an_empty_mirror(self, repo):
        assert repo.count() == 0
        assert repo.count_entries() == 0
        assert repo.list_all() == []
        assert repo.children_of(None) == []


@pytest.mark.unit
class TestSchemaConstraints:
    def test_an_unknown_kind_is_rejected_by_the_database(self, db):
        with pytest.raises(sqlite3.IntegrityError):
            with db.transaction() as conn:
                conn.execute(
                    "INSERT INTO rekordbox_playlists "
                    "(name, kind, depth, position, rekordbox_path) "
                    "VALUES ('x', 'Folder', 0, 0, 'x')"
                )

    def test_two_entries_cannot_share_a_position_in_one_playlist(
        self, repo, tracks, db
    ):
        """Position carries the identity of an entry, so it must be unique."""
        repo.replace_tree(
            [
                node("ROOT", KIND_FOLDER, 0, 0, "ROOT"),
                node("set", KIND_PLAYLIST, 1, 0, "ROOT/set", "ROOT", ["1"]),
            ]
        )
        playlist = repo.find_by_path("ROOT/set")
        with pytest.raises(sqlite3.IntegrityError):
            with db.transaction() as conn:
                conn.execute(
                    "INSERT INTO rekordbox_playlist_tracks "
                    "(playlist_id, track_id, position) VALUES (?, ?, 0)",
                    (playlist.id, 1),
                )

    def test_an_entry_cannot_name_a_track_that_does_not_exist(self, repo, tracks, db):
        repo.replace_tree(
            [
                node("ROOT", KIND_FOLDER, 0, 0, "ROOT"),
                node("set", KIND_PLAYLIST, 1, 0, "ROOT/set", "ROOT", ["1"]),
            ]
        )
        playlist = repo.find_by_path("ROOT/set")
        with pytest.raises(sqlite3.IntegrityError):
            with db.transaction() as conn:
                conn.execute(
                    "INSERT INTO rekordbox_playlist_tracks "
                    "(playlist_id, track_id, position) VALUES (?, 424242, 99)",
                    (playlist.id,),
                )
