#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Unit tests for the streaming playlist-tree parser (LIBRARY-03).

Shapes taken from a real 3,880-track export: 234 nodes over five levels, 28
folders, 206 playlists, 13,870 track references, 21 empty playlists, twelve
names reused under different parents, four names containing ``/``, and 19
playlists holding the same track more than once.

The ordering contract — a node is yielded after its parent and after its earlier
siblings — is what lets the repository resolve ``parent_id`` in a single pass, so
it is asserted directly rather than assumed.
"""

from __future__ import annotations

import gc
import tracemalloc
import xml.etree.ElementTree as ET
from pathlib import Path

import pytest

from cuepoint.data import rekordbox
from cuepoint.data.rekordbox import iter_playlist_nodes
from cuepoint.models.rekordbox_playlist import KIND_FOLDER


def write_xml(
    tmp_path: Path, playlists: str, collection: str = "", name="c.xml"
) -> str:
    path = tmp_path / name
    path.write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<DJ_PLAYLISTS Version="1.0.0">\n'
        f'  <COLLECTION Entries="0">{collection}</COLLECTION>\n'
        f"  <PLAYLISTS>{playlists}</PLAYLISTS>\n"
        "</DJ_PLAYLISTS>\n",
        encoding="utf-8",
    )
    return str(path)


def folder(name: str, inner: str = "") -> str:
    return f'<NODE Name="{name}" Type="0" Count="1">{inner}</NODE>'


def playlist(name: str, *keys: str) -> str:
    refs = "".join(f'<TRACK Key="{k}"/>' for k in keys)
    return (
        f'<NODE Name="{name}" Type="1" KeyType="0" Entries="{len(keys)}">{refs}</NODE>'
    )


# The real export's shape in miniature.
REAL_SHAPE = folder(
    "ROOT",
    folder("TEST", playlist("test", "1") + playlist("testt", "2"))
    + folder(
        "LIBRARY 7.0",
        folder(
            "VENUE",
            folder("Dybbuk", playlist("peak", "1", "2") + playlist("closing", "3"))
            + folder("Stoa", playlist("peak", "4") + playlist("closing")),
        ),
    ),
)


@pytest.mark.unit
class TestTreeShape:
    def test_the_root_node_is_included_at_depth_zero(self, tmp_path):
        (root, *_rest) = list(iter_playlist_nodes(write_xml(tmp_path, REAL_SHAPE)))
        assert (root.name, root.kind, root.depth, root.position) == (
            "ROOT",
            KIND_FOLDER,
            0,
            0,
        )
        assert root.parent_path is None
        assert root.rekordbox_path == "ROOT"

    def test_every_node_is_yielded_after_its_parent(self, tmp_path):
        """The contract replace_tree() depends on to resolve parent_id."""
        seen_paths = set()
        for node in iter_playlist_nodes(write_xml(tmp_path, REAL_SHAPE)):
            if node.parent_path is not None:
                assert node.parent_path in seen_paths, (
                    f"{node.rekordbox_path} arrived before its parent"
                )
            seen_paths.add(node.rekordbox_path)

    def test_depth_matches_the_nesting(self, tmp_path):
        by_path = {
            n.rekordbox_path: n
            for n in iter_playlist_nodes(write_xml(tmp_path, REAL_SHAPE))
        }
        assert by_path["ROOT"].depth == 0
        assert by_path["ROOT/TEST"].depth == 1
        assert by_path["ROOT/TEST/test"].depth == 2
        assert by_path["ROOT/LIBRARY 7.0/VENUE/Dybbuk"].depth == 3
        assert by_path["ROOT/LIBRARY 7.0/VENUE/Dybbuk/peak"].depth == 4

    def test_sibling_positions_start_at_zero_and_restart_per_parent(self, tmp_path):
        nodes = list(iter_playlist_nodes(write_xml(tmp_path, REAL_SHAPE)))
        by_parent: dict = {}
        for node in nodes:
            by_parent.setdefault(node.parent_path, []).append(node)
        for children in by_parent.values():
            assert [c.position for c in children] == list(range(len(children)))

    def test_the_same_name_under_different_parents_stays_distinct(self, tmp_path):
        paths = [
            n.rekordbox_path
            for n in iter_playlist_nodes(write_xml(tmp_path, REAL_SHAPE))
            if n.name == "peak"
        ]
        assert sorted(paths) == [
            "ROOT/LIBRARY 7.0/VENUE/Dybbuk/peak",
            "ROOT/LIBRARY 7.0/VENUE/Stoa/peak",
        ]

    def test_counts(self, tmp_path):
        nodes = list(iter_playlist_nodes(write_xml(tmp_path, REAL_SHAPE)))
        assert len([n for n in nodes if n.is_folder]) == 6
        assert len([n for n in nodes if not n.is_folder]) == 6


@pytest.mark.unit
class TestPlaylistContents:
    def test_track_references_keep_their_order(self, tmp_path):
        xml = write_xml(tmp_path, folder("ROOT", playlist("set", "7", "3", "9", "3")))
        (node,) = [n for n in iter_playlist_nodes(xml) if not n.is_folder]
        assert node.track_refs == ["7", "3", "9", "3"]

    def test_the_same_track_may_appear_twice(self, tmp_path):
        """19 playlists in a real export do; one holds a track eight times."""
        xml = write_xml(tmp_path, folder("ROOT", playlist("set", "5", "5", "5")))
        (node,) = [n for n in iter_playlist_nodes(xml) if not n.is_folder]
        assert node.track_refs == ["5", "5", "5"]
        assert node.track_count == 3

    @pytest.mark.parametrize("attribute", ["Key", "TrackID", "ID"])
    def test_reference_attribute_variants(self, tmp_path, attribute):
        xml = write_xml(
            tmp_path,
            folder(
                "ROOT",
                f'<NODE Name="p" Type="1"><TRACK {attribute}="42"/></NODE>',
            ),
        )
        (node,) = [n for n in iter_playlist_nodes(xml) if not n.is_folder]
        assert node.track_refs == ["42"]

    def test_a_reference_with_no_id_is_dropped(self, tmp_path):
        xml = write_xml(
            tmp_path,
            folder(
                "ROOT",
                '<NODE Name="p" Type="1"><TRACK Key=""/><TRACK Key="8"/></NODE>',
            ),
        )
        (node,) = [n for n in iter_playlist_nodes(xml) if not n.is_folder]
        assert node.track_refs == ["8"]

    def test_an_empty_playlist_survives(self, tmp_path):
        """21 of a real export's playlists are empty; they are still playlists."""
        xml = write_xml(tmp_path, folder("ROOT", playlist("staging")))
        (node,) = [n for n in iter_playlist_nodes(xml) if not n.is_folder]
        assert node.track_refs == []
        assert node.track_count == 0

    def test_an_empty_folder_survives(self, tmp_path):
        xml = write_xml(tmp_path, folder("ROOT", '<NODE Name="STELIOS" Type="0"/>'))
        names = [n.name for n in iter_playlist_nodes(xml)]
        assert "STELIOS" in names


@pytest.mark.unit
class TestNaming:
    def test_a_name_containing_the_separator(self, tmp_path):
        """Four real playlists are named this way; the node keeps the full name."""
        xml = write_xml(
            tmp_path, folder("ROOT", folder("PAST SETS", playlist("COZMO_11/02", "1")))
        )
        (node,) = [n for n in iter_playlist_nodes(xml) if not n.is_folder]
        assert node.name == "COZMO_11/02"
        assert node.rekordbox_path == "ROOT/PAST SETS/COZMO_11/02"

    def test_surrounding_whitespace_is_trimmed(self, tmp_path):
        xml = write_xml(tmp_path, folder("ROOT", playlist("  peak  ", "1")))
        (node,) = [n for n in iter_playlist_nodes(xml) if not n.is_folder]
        assert node.name == "peak"
        assert node.rekordbox_path == "ROOT/peak"

    def test_a_missing_name_becomes_empty_rather_than_failing(self, tmp_path):
        xml = write_xml(tmp_path, folder("ROOT", '<NODE Type="1"/>'))
        (node,) = [n for n in iter_playlist_nodes(xml) if not n.is_folder]
        assert node.name == ""

    def test_a_missing_type_is_treated_as_a_folder(self, tmp_path):
        xml = write_xml(tmp_path, '<NODE Name="ROOT"/>')
        (node,) = list(iter_playlist_nodes(xml))
        assert node.kind == KIND_FOLDER

    def test_non_ascii_names(self, tmp_path):
        xml = write_xml(tmp_path, folder("ROOT", playlist("Müsik – Träck", "1")))
        (node,) = [n for n in iter_playlist_nodes(xml) if not n.is_folder]
        assert node.name == "Müsik – Träck"


@pytest.mark.unit
class TestScope:
    def test_collection_tracks_are_not_playlist_nodes(self, tmp_path):
        collection = '<TRACK TrackID="1" Name="A" Artist="B"/>' * 5
        xml = write_xml(tmp_path, folder("ROOT", playlist("p", "1")), collection)
        nodes = list(iter_playlist_nodes(xml))
        assert [n.name for n in nodes] == ["ROOT", "p"]

    def test_a_file_with_no_playlists_yields_nothing(self, tmp_path):
        path = tmp_path / "none.xml"
        path.write_text(
            '<?xml version="1.0" encoding="UTF-8"?>\n'
            '<DJ_PLAYLISTS Version="1.0.0"><COLLECTION Entries="0"/></DJ_PLAYLISTS>\n',
            encoding="utf-8",
        )
        assert list(iter_playlist_nodes(str(path))) == []

    def test_an_empty_playlists_element_yields_nothing(self, tmp_path):
        assert list(iter_playlist_nodes(write_xml(tmp_path, ""))) == []

    def test_deep_nesting(self, tmp_path):
        inner = playlist("leaf", "1")
        for level in range(9, 0, -1):
            inner = folder(f"L{level}", inner)
        nodes = list(iter_playlist_nodes(write_xml(tmp_path, folder("ROOT", inner))))
        assert max(n.depth for n in nodes) == 10
        assert nodes[-1].name == "leaf"


@pytest.mark.unit
class TestInputGuards:
    def test_missing_file_raises(self, tmp_path):
        with pytest.raises(FileNotFoundError):
            list(iter_playlist_nodes(str(tmp_path / "nope.xml")))

    def test_oversized_file_is_refused(self, tmp_path, monkeypatch):
        xml = write_xml(tmp_path, REAL_SHAPE)
        monkeypatch.setattr(rekordbox, "MAX_XML_SIZE_BYTES", 10)
        with pytest.raises(ValueError, match="too large"):
            list(iter_playlist_nodes(xml))

    def test_malformed_xml_raises_a_parse_error(self, tmp_path):
        path = tmp_path / "broken.xml"
        path.write_text(
            '<?xml version="1.0"?><DJ_PLAYLISTS><PLAYLISTS><NODE Name="x"',
            encoding="utf-8",
        )
        with pytest.raises(ET.ParseError):
            list(iter_playlist_nodes(str(path)))


@pytest.mark.unit
class TestStreaming:
    """The collection must not be built in memory to read the playlist tree."""

    @staticmethod
    def _generate(tmp_path: Path, tracks: int, playlists: int, name: str) -> Path:
        path = tmp_path / name
        with path.open("w", encoding="utf-8") as handle:
            handle.write(
                '<?xml version="1.0" encoding="UTF-8"?>\n'
                '<DJ_PLAYLISTS Version="1.0.0">\n'
                f'  <COLLECTION Entries="{tracks}">\n'
            )
            for i in range(tracks):
                handle.write(
                    f'    <TRACK TrackID="{i}" Name="Track {i}" Artist="A {i % 400}" '
                    f'Album="Album {i % 700}" Genre="House" Tonality="8A" '
                    f'AverageBpm="124.00" TotalTime="360" BitRate="320" '
                    f'Location="file://localhost/m/{i}.mp3">\n'
                    f'      <TEMPO Inizio="0.1" Bpm="124.00" Metro="4/4" Battito="1"/>\n'
                    f"    </TRACK>\n"
                )
            handle.write(
                '  </COLLECTION>\n  <PLAYLISTS>\n    <NODE Name="ROOT" Type="0">\n'
            )
            for p in range(playlists):
                refs = "".join(
                    f'<TRACK Key="{(p * 37 + j) % max(tracks, 1)}"/>' for j in range(60)
                )
                handle.write(
                    f'      <NODE Name="p{p}" Type="1" Entries="60">{refs}</NODE>\n'
                )
            handle.write("    </NODE>\n  </PLAYLISTS>\n</DJ_PLAYLISTS>\n")
        return path

    @staticmethod
    def _peak(path: Path) -> tuple:
        gc.collect()
        tracemalloc.start()
        try:
            count = sum(1 for _ in iter_playlist_nodes(str(path)))
            _, peak = tracemalloc.get_traced_memory()
        finally:
            tracemalloc.stop()
        return count, peak

    def test_a_large_collection_does_not_cost_memory(self, tmp_path):
        """The tree is the same size in both; only the collection grows.

        Without clearing COLLECTION's tracks as they go by, reading a playlist
        tree would first build every track element in the document.
        """
        small = self._generate(tmp_path, 500, 20, "small.xml")
        large = self._generate(tmp_path, 20_000, 20, "large.xml")

        small_count, small_peak = self._peak(small)
        large_count, large_peak = self._peak(large)

        assert small_count == large_count == 21
        assert large_peak < small_peak * 3, (
            f"peak grew with collection size: {small_peak} -> {large_peak}; "
            "collection elements are being retained"
        )

    def test_peak_stays_far_below_the_file_size(self, tmp_path):
        large = self._generate(tmp_path, 20_000, 40, "large.xml")
        _, peak = self._peak(large)
        assert peak < large.stat().st_size / 4

    def test_many_playlists_in_one_folder_do_not_accumulate(self, tmp_path):
        """Clearing a finished node is not enough; it must also be detached.

        A cleared element still occupies a slot in its folder's child list, so
        without ``del stack[-1]["element"][:]`` memory grows once per node.
        Measured: 100 nodes cost 530 KiB either way, but 20,000 cost 530 KiB
        with the detach and 2,095 KiB without — which is why the sizes here are
        far apart and the bound is tight. An earlier version of this test used
        400 nodes and a 4x bound, and passed against code with the detach
        removed.
        """
        few = self._generate(tmp_path, 50, 100, "few.xml")
        many = self._generate(tmp_path, 50, 20_000, "many.xml")

        few_count, few_peak = self._peak(few)
        many_count, many_peak = self._peak(many)

        assert (few_count, many_count) == (101, 20_001)
        assert many_peak < few_peak * 1.5, (
            f"peak grew with node count: {few_peak} -> {many_peak}; "
            "finished nodes are not being detached from their folder"
        )

    def test_a_collection_after_the_playlists_is_never_read(self, tmp_path):
        """Parsing stops at </PLAYLISTS>, so what follows costs nothing.

        Rekordbox writes COLLECTION first, but the element order is not
        guaranteed by the format, and stopping is what makes the tree cheap to
        read either way. Asserted by putting a large collection *after* the
        tree: if the parser read on, the peak would follow the file size.
        """
        small = self._generate_playlists_first(tmp_path, 200, "pl-small.xml")
        large = self._generate_playlists_first(tmp_path, 40_000, "pl-large.xml")

        small_count, small_peak = self._peak(small)
        large_count, large_peak = self._peak(large)

        assert small_count == large_count == 6
        assert large.stat().st_size > small.stat().st_size * 20
        assert large_peak < small_peak * 1.5, (
            f"peak followed the trailing collection: {small_peak} -> {large_peak}"
        )

    @staticmethod
    def _generate_playlists_first(tmp_path: Path, tracks: int, name: str) -> Path:
        """An export whose PLAYLISTS element precedes its COLLECTION."""
        path = tmp_path / name
        with path.open("w", encoding="utf-8") as handle:
            handle.write(
                '<?xml version="1.0" encoding="UTF-8"?>\n'
                '<DJ_PLAYLISTS Version="1.0.0">\n'
                '  <PLAYLISTS>\n    <NODE Name="ROOT" Type="0">\n'
            )
            for p in range(5):
                refs = "".join(f'<TRACK Key="{j}"/>' for j in range(10))
                handle.write(
                    f'      <NODE Name="p{p}" Type="1" Entries="10">{refs}</NODE>\n'
                )
            handle.write("    </NODE>\n  </PLAYLISTS>\n")
            handle.write(f'  <COLLECTION Entries="{tracks}">\n')
            for i in range(tracks):
                handle.write(
                    f'    <TRACK TrackID="{i}" Name="Track {i}" Artist="A {i % 400}" '
                    f'Album="Album {i % 700}" Genre="House" Tonality="8A" '
                    f'AverageBpm="124.00" TotalTime="360" BitRate="320" '
                    f'Location="file://localhost/m/{i}.mp3"/>\n'
                )
            handle.write("  </COLLECTION>\n</DJ_PLAYLISTS>\n")
        return path

    def test_the_file_handle_is_closed_when_iteration_finishes(self, tmp_path):
        """Windows refuses to delete an open file, so unlink is the assertion."""
        path = self._generate(tmp_path, 50, 5, "closed.xml")
        assert sum(1 for _ in iter_playlist_nodes(str(path))) == 6
        path.unlink()
        assert not path.exists()

    def test_the_file_handle_is_closed_when_the_caller_stops_early(self, tmp_path):
        path = self._generate(tmp_path, 50, 20, "abandoned.xml")
        iterator = iter_playlist_nodes(str(path))
        assert next(iterator).name == "ROOT"
        iterator.close()
        gc.collect()
        path.unlink()
        assert not path.exists()


@pytest.mark.unit
class TestExistingParserIsUntouched:
    """DEC-036: parse_playlist_tree keeps serving the matching pipeline."""

    def test_both_parsers_agree_on_the_playlist_paths(self, tmp_path):
        collection = (
            '<TRACK TrackID="1" Name="A" Artist="X"/>'
            '<TRACK TrackID="2" Name="B" Artist="Y"/>'
            '<TRACK TrackID="3" Name="C" Artist="Z"/>'
            '<TRACK TrackID="4" Name="D" Artist="W"/>'
        )
        xml = write_xml(tmp_path, REAL_SHAPE, collection)

        _roots, by_path = rekordbox.parse_playlist_tree(xml)
        streamed = {
            n.rekordbox_path for n in iter_playlist_nodes(xml) if not n.is_folder
        }
        assert streamed == set(by_path)

    def test_the_streaming_parser_keeps_entries_the_old_one_drops(self, tmp_path):
        """parse_playlist_tree skips collection tracks with no title.

        A playlist entry pointing at one silently vanishes from that playlist
        there. LIBRARY-02 imports untitled tracks, so the mirror must keep the
        reference.
        """
        collection = (
            '<TRACK TrackID="1" Name="" Artist="X" Location="file://localhost/m/1.mp3"/>'
            '<TRACK TrackID="2" Name="B" Artist="Y" Location="file://localhost/m/2.mp3"/>'
        )
        xml = write_xml(tmp_path, folder("ROOT", playlist("set", "1", "2")), collection)

        _roots, by_path = rekordbox.parse_playlist_tree(xml)
        (streamed,) = [n for n in iter_playlist_nodes(xml) if not n.is_folder]

        assert len(by_path["ROOT/set"].tracks) == 1, "old parser drops the untitled one"
        assert streamed.track_refs == ["1", "2"]
