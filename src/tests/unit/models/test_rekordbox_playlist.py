#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Unit tests for the mirrored Rekordbox playlist node.

The shapes asserted here come from a real 3,880-track export whose tree has 234
nodes: five levels deep, twelve names reused under different parents, four names
containing the path separator, and 21 empty playlists.
"""

from __future__ import annotations

import pytest

from cuepoint.models.rekordbox_playlist import (
    KIND_FOLDER,
    KIND_PLAYLIST,
    PlaylistTreeWriteResult,
    RekordboxPlaylist,
    build_path,
)


def _node(**kwargs) -> RekordboxPlaylist:
    kwargs.setdefault("name", "Playlist")
    kwargs.setdefault("kind", KIND_PLAYLIST)
    kwargs.setdefault("depth", 1)
    kwargs.setdefault("position", 0)
    kwargs.setdefault("rekordbox_path", "ROOT/Playlist")
    return RekordboxPlaylist(**kwargs)


@pytest.mark.unit
class TestValidation:
    def test_kind_must_be_a_known_discriminator(self):
        with pytest.raises(ValueError, match="kind"):
            _node(kind="Folder")

    @pytest.mark.parametrize("kind", [KIND_FOLDER, KIND_PLAYLIST])
    def test_both_kinds_are_accepted(self, kind):
        assert _node(kind=kind).kind == kind

    def test_name_is_trimmed(self):
        """A real export contains "peak " and "electro " with trailing spaces.

        parse_playlist_tree() already trims, so trimming here keeps a path
        meaning the same thing in the CLI and in the library.
        """
        assert _node(name="  peak  ").name == "peak"

    def test_negative_depth_is_rejected(self):
        with pytest.raises(ValueError, match="depth"):
            _node(depth=-1)

    def test_negative_position_is_rejected(self):
        with pytest.raises(ValueError, match="position"):
            _node(position=-1)

    def test_a_folder_cannot_hold_track_references(self):
        """Folders hold nodes; a folder with refs means the parser misread Type."""
        with pytest.raises(ValueError, match="folder"):
            _node(kind=KIND_FOLDER, track_refs=["1"])

    def test_numbers_are_coerced(self):
        node = _node(depth="2", position="3", track_count="7")
        assert (node.depth, node.position, node.track_count) == (2, 3, 7)

    def test_is_folder(self):
        assert _node(kind=KIND_FOLDER).is_folder is True
        assert _node(kind=KIND_PLAYLIST).is_folder is False


@pytest.mark.unit
class TestSerialization:
    def test_to_dict_excludes_track_refs(self):
        """Membership is its own table; a node dict is not a whole playlist.

        Including refs here would make it easy to write one representation and
        read back the other.
        """
        node = _node(track_refs=["1", "2", "3"])
        assert "track_refs" not in node.to_dict()

    def test_round_trips_through_from_row(self):
        node = _node(
            name="afro house (25)",
            kind=KIND_PLAYLIST,
            depth=4,
            position=2,
            rekordbox_path="ROOT/LIBRARY/GENRES/Afro House/afro house (25)",
            parent_path="ROOT/LIBRARY/GENRES/Afro House",
            track_count=180,
            id=17,
            parent_id=9,
        )
        assert RekordboxPlaylist.from_row(node.to_dict()).to_dict() == node.to_dict()

    def test_from_row_leaves_track_refs_empty(self):
        node = RekordboxPlaylist.from_row(
            {
                "kind": KIND_PLAYLIST,
                "name": "P",
                "depth": 1,
                "position": 0,
                "rekordbox_path": "ROOT/P",
            }
        )
        assert node.track_refs == []


@pytest.mark.unit
class TestBuildPath:
    def test_top_level_path_is_the_name(self):
        assert build_path(None, "ROOT") == "ROOT"
        assert build_path("", "ROOT") == "ROOT"

    def test_nested_path(self):
        assert build_path("ROOT/GENRES", "Afro House") == "ROOT/GENRES/Afro House"

    def test_name_is_trimmed_into_the_path(self):
        assert build_path("ROOT", "  peak  ") == "ROOT/peak"

    def test_a_name_containing_the_separator_makes_an_ambiguous_path(self):
        """Documented, not fixed — the CLI's --playlist already works this way.

        "COZMO_11/02" is a real playlist name. The resulting path cannot be
        split back into segments, which is why parent_id rather than the path is
        what holds the tree together.
        """
        path = build_path("ROOT/PREP/PAST SETS", "COZMO_11/02")
        assert path == "ROOT/PREP/PAST SETS/COZMO_11/02"
        assert path.split("/")[-1] == "02", "the last segment is not the name"


@pytest.mark.unit
class TestWriteResult:
    def test_nodes_is_folders_plus_playlists(self):
        result = PlaylistTreeWriteResult(folders=28, playlists=206, entries=13870)
        assert result.nodes == 234

    def test_missing_count_includes_repeats(self):
        result = PlaylistTreeWriteResult(missing_track_refs=("9", "9", "12"))
        assert result.missing_count == 3

    def test_defaults_are_empty(self):
        result = PlaylistTreeWriteResult()
        assert (result.nodes, result.entries, result.missing_count) == (0, 0, 0)
