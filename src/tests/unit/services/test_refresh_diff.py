#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Unit tests for the refresh diff (LIBRARY-07).

Two properties carry the risk.

**It writes nothing.** DEC-032 exists because DEC-003's deletions are
irreversible, and a preview that modified the thing it is previewing would be
worse than no preview. Every test here checks the library is untouched.

**It classifies exactly as an import would act.** The preview promises; the
apply does. If the two ever disagreed a user would confirm one thing and get
another — so the tests below do not only check the diff's numbers, they run the
import afterwards and compare.
"""

from __future__ import annotations

import json
import os
import time
from pathlib import Path

import pytest

from cuepoint.exceptions.cuepoint_exceptions import ValidationError
from cuepoint.models.refresh_diff import (
    COMPARED_FIELDS,
    INCIDENTAL_FIELDS,
    Category,
    RefreshDiff,
    TrackChange,
)
from cuepoint.persistence.library_source_repository import LibrarySourceRepository
from cuepoint.persistence.playlist_repository import PlaylistRepository
from cuepoint.persistence.track_repository import TrackRepository
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.library_import_service import (
    ImportCancelled,
    LibraryImportService,
)
from cuepoint.services.migration_runner import MigrationRunner

TRACK_ATTRS = (
    'Genre="House" Album="Album" Label="Label" Tonality="8A" AverageBpm="124.00" '
    'Year="2024" TotalTime="360" BitRate="320" Rating="204" PlayCount="7" '
    'DateAdded="2024-01-01" Comments="c"'
)


def track_xml(track_id, path, title="Track", artist="Artist", **overrides) -> str:
    attrs = TRACK_ATTRS
    for name, value in overrides.items():
        attrs = attrs.replace(f'{name}="', f'{name}="{value}#', 1)
    for name, value in overrides.items():
        attrs = attrs.replace(f'{name}="{value}#', f'{name}="{value}"', 1)
        attrs = (
            attrs.split(f'{name}="{value}"')[0]
            + f'{name}="{value}"'
            + "".join(attrs.split(f'{name}="{value}"')[1:])
        )
    return (
        f'<TRACK TrackID="{track_id}" Name="{title}" Artist="{artist}" {attrs} '
        f'Location="file://localhost{path}"/>'
    )


def write_export(tmp_path: Path, tracks, playlists="", name="collection.xml") -> str:
    """``tracks`` is a list of raw ``<TRACK .../>`` strings."""
    path = tmp_path / name
    path.write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<DJ_PLAYLISTS Version="1.0.0">\n'
        f'  <COLLECTION Entries="{len(tracks)}">\n' + "\n".join(tracks) + "\n"
        "  </COLLECTION>\n"
        f"  <PLAYLISTS>{playlists}</PLAYLISTS>\n"
        "</DJ_PLAYLISTS>\n",
        encoding="utf-8",
    )
    return str(path)


BASE_TRACKS = [
    track_xml("1", "/m/one.mp3", "One", "A"),
    track_xml("2", "/m/two.mp3", "Two", "B"),
    track_xml("3", "/m/three.mp3", "Three", "C"),
]

BASE_PLAYLISTS = (
    '<NODE Name="ROOT" Type="0">'
    '<NODE Name="opening" Type="1" Entries="2"><TRACK Key="1"/><TRACK Key="2"/></NODE>'
    '<NODE Name="closing" Type="1" Entries="1"><TRACK Key="3"/></NODE>'
    "</NODE>"
)


@pytest.fixture
def db(tmp_path):
    service = DatabaseService(db_path=tmp_path / "cuepoint.db")
    MigrationRunner(service).migrate()
    yield service
    service.close_all()


@pytest.fixture
def tracks(db):
    return TrackRepository(db)


@pytest.fixture
def playlists(db):
    return PlaylistRepository(db)


@pytest.fixture
def service(db, tracks, playlists):
    return LibraryImportService(tracks, playlists, LibrarySourceRepository(db), db)


@pytest.fixture
def imported(service, tmp_path):
    """A library imported from the base export."""
    export = write_export(tmp_path, BASE_TRACKS, BASE_PLAYLISTS, name="base.xml")
    service.import_rekordbox_xml(export)
    return export


def library_state(db):
    """Everything a diff must leave exactly as it found it."""
    connection = db.connect()
    return (
        connection.execute("SELECT count(*) FROM tracks").fetchone()[0],
        connection.execute("SELECT count(*) FROM rekordbox_playlists").fetchone()[0],
        connection.execute("SELECT count(*) FROM rekordbox_playlist_tracks").fetchone()[
            0
        ],
        [
            tuple(row)
            for row in connection.execute(
                "SELECT rekordbox_track_id, title, updated_at FROM tracks ORDER BY id"
            )
        ],
    )


@pytest.mark.unit
class TestWritesNothing:
    """DEC-032's whole point: look, do not touch."""

    def test_an_unchanged_diff_leaves_the_library_alone(self, service, db, imported):
        before = library_state(db)
        service.compute_refresh_diff(imported)
        assert library_state(db) == before

    def test_a_diff_with_every_category_leaves_the_library_alone(
        self, service, db, imported, tmp_path
    ):
        edited = write_export(
            tmp_path,
            [
                track_xml("1", "/m/one.mp3", "Renamed", "A"),
                track_xml("99", "/m/two.mp3", "Two", "B"),
                track_xml("4", "/m/four.mp3", "Four", "D"),
            ],
            name="edited.xml",
        )
        before = library_state(db)

        diff = service.compute_refresh_diff(edited)

        assert not diff.is_empty
        assert library_state(db) == before

    def test_updated_at_is_not_touched(self, service, db, imported):
        before = library_state(db)[3]
        service.compute_refresh_diff(imported)
        assert library_state(db)[3] == before


@pytest.mark.unit
class TestUnchanged:
    def test_the_same_file_diffs_to_nothing(self, service, imported):
        """Must be silent, or a user learns to ignore the preview."""
        diff = service.compute_refresh_diff(imported)

        assert diff.is_empty
        assert diff.added.count == 0
        assert diff.changed.count == 0
        assert diff.removed.count == 0
        assert diff.relinked.count == 0
        assert diff.playlists_added.count == 0
        assert diff.playlists_changed.count == 0
        assert diff.playlists_removed.count == 0

    def test_a_bpm_written_differently_is_not_a_change(
        self, service, imported, tmp_path
    ):
        """Rekordbox writes "124.00"; the library stores 124.0.

        Without a tolerance every track in every library would report as
        changed on every refresh, which is the noisiest possible way to be
        wrong.
        """
        same = write_export(
            tmp_path,
            [
                line.replace('AverageBpm="124.00"', 'AverageBpm="124.000"')
                for line in BASE_TRACKS
            ],
            BASE_PLAYLISTS,
            name="bpm.xml",
        )
        assert service.compute_refresh_diff(same).changed.count == 0


@pytest.mark.unit
class TestTrackCategories:
    def test_a_new_track_is_added(self, service, imported, tmp_path):
        export = write_export(
            tmp_path,
            BASE_TRACKS + [track_xml("4", "/m/four.mp3", "Four", "D")],
            BASE_PLAYLISTS,
            name="added.xml",
        )
        diff = service.compute_refresh_diff(export)

        assert diff.added.count == 1
        assert diff.added.items[0].rekordbox_track_id == "4"
        assert diff.added.items[0].title == "Four"
        assert (diff.changed.count, diff.removed.count) == (0, 0)

    def test_a_missing_track_is_removed(self, service, imported, tmp_path):
        export = write_export(tmp_path, BASE_TRACKS[:2], name="removed.xml")
        diff = service.compute_refresh_diff(export)

        assert diff.removed.count == 1
        assert diff.removed.items[0].rekordbox_track_id == "3"
        assert diff.removed.items[0].title == "Three"
        assert diff.added.count == 0

    def test_an_edited_track_is_changed_with_its_fields(
        self, service, imported, tmp_path
    ):
        export = write_export(
            tmp_path,
            [track_xml("1", "/m/one.mp3", "Renamed", "A")] + BASE_TRACKS[1:],
            BASE_PLAYLISTS,
            name="changed.xml",
        )
        diff = service.compute_refresh_diff(export)

        assert diff.changed.count == 1
        change = diff.changed.items[0]
        assert change.rekordbox_track_id == "1"
        assert change.fields == ("title",)
        assert change.is_notable is True
        assert (diff.added.count, diff.removed.count) == (0, 0)

    def test_a_moved_file_is_changed_not_removed(self, service, imported, tmp_path):
        """Same TrackID, different path. The track did not leave Rekordbox."""
        export = write_export(
            tmp_path,
            [track_xml("1", "/m/moved/one.mp3", "One", "A")] + BASE_TRACKS[1:],
            BASE_PLAYLISTS,
            name="moved.xml",
        )
        diff = service.compute_refresh_diff(export)

        assert diff.removed.count == 0
        assert diff.added.count == 0
        assert diff.changed.count == 1
        assert diff.changed.items[0].fields == ("file_path",)

    def test_several_fields_are_all_reported(self, service, imported, tmp_path):
        export = write_export(
            tmp_path,
            [
                track_xml("1", "/m/one.mp3", "Renamed", "Someone Else").replace(
                    'Tonality="8A"', 'Tonality="5A"'
                )
            ]
            + BASE_TRACKS[1:],
            BASE_PLAYLISTS,
            name="multi.xml",
        )
        change = service.compute_refresh_diff(export).changed.items[0]
        assert set(change.fields) == {"title", "artist", "key"}
        # Reported in COMPARED_FIELDS order so two runs read the same way.
        assert list(change.fields) == [
            name for name in COMPARED_FIELDS if name in set(change.fields)
        ]


@pytest.mark.unit
class TestRelinking:
    """DEC-002, and the distinction that would otherwise destroy user data."""

    def test_a_renumbered_track_at_the_same_path_is_relinked(
        self, service, imported, tmp_path
    ):
        export = write_export(
            tmp_path,
            [track_xml("900", "/m/one.mp3", "One", "A")] + BASE_TRACKS[1:],
            BASE_PLAYLISTS,
            name="renumbered.xml",
        )
        diff = service.compute_refresh_diff(export)

        assert diff.relinked.count == 1
        assert diff.removed.count == 0, "reported as a deletion, which is data loss"
        assert diff.added.count == 0, "reported as a new track, losing its history"

        relink = diff.relinked.items[0]
        assert relink.rekordbox_track_id == "900"
        assert relink.previous_rekordbox_track_id == "1"
        assert relink.file_path == "/m/one.mp3"

    def test_every_track_renumbered_relinks_every_track(
        self, service, imported, tmp_path
    ):
        export = write_export(
            tmp_path,
            [
                track_xml("901", "/m/one.mp3", "One", "A"),
                track_xml("902", "/m/two.mp3", "Two", "B"),
                track_xml("903", "/m/three.mp3", "Three", "C"),
            ],
            BASE_PLAYLISTS.replace('Key="1"', 'Key="901"')
            .replace('Key="2"', 'Key="902"')
            .replace('Key="3"', 'Key="903"'),
            name="all-renumbered.xml",
        )
        diff = service.compute_refresh_diff(export)

        assert diff.relinked.count == 3
        assert (diff.added.count, diff.removed.count) == (0, 0)

    def test_a_renumbered_track_that_also_moved_is_removed_and_added(
        self, service, imported, tmp_path
    ):
        """Neither identity matches, so nothing connects the two.

        Asserted so the limit of DEC-002 is visible rather than assumed: a
        Rekordbox rebuild that also reorganizes files loses the link, and the
        preview says so honestly instead of implying the data survives.
        """
        export = write_export(
            tmp_path,
            [track_xml("900", "/m/elsewhere/one.mp3", "One", "A")] + BASE_TRACKS[1:],
            BASE_PLAYLISTS,
            name="renumbered-moved.xml",
        )
        diff = service.compute_refresh_diff(export)

        assert diff.relinked.count == 0
        assert diff.added.count == 1
        assert diff.removed.count == 1

    def test_two_tracks_claiming_one_row_relink_only_one(self, service, tmp_path):
        """The claim rule the bulk upsert follows, applied to the preview."""
        base = write_export(
            tmp_path, [track_xml("1", "/m/same.mp3", "First", "A")], name="one.xml"
        )
        service.import_rekordbox_xml(base)

        export = write_export(
            tmp_path,
            [
                track_xml("91", "/m/same.mp3", "First", "A"),
                track_xml("92", "/m/same.mp3", "Second", "B"),
            ],
            name="two.xml",
        )
        diff = service.compute_refresh_diff(export)

        assert diff.relinked.count == 1
        assert diff.added.count == 1
        assert diff.removed.count == 0


@pytest.mark.unit
class TestWhatCountsAsChanged:
    def test_an_incidental_field_alone_is_changed_but_not_notable(
        self, service, imported, tmp_path
    ):
        """Playing a track increments its play count.

        A refresh that announced "3 tracks changed" after a weekend of DJing
        would be true and useless, so the field list carries the distinction and
        the preview decides what to show.
        """
        export = write_export(
            tmp_path,
            [line.replace('PlayCount="7"', 'PlayCount="9"') for line in BASE_TRACKS],
            BASE_PLAYLISTS,
            name="plays.xml",
        )
        diff = service.compute_refresh_diff(export)

        assert diff.changed.count == 3
        assert all(change.fields == ("play_count",) for change in diff.changed.items)
        assert all(not change.is_notable for change in diff.changed.items)
        assert diff.notable_changed_count == 0

    def test_an_incidental_field_beside_a_real_one_is_notable(self):
        change = TrackChange("1", "T", "A", ("play_count", "title"))
        assert change.is_notable is True

    def test_library_bookkeeping_is_never_compared(self):
        for name in (
            "id",
            "created_at",
            "updated_at",
            "normalized_path",
            "rekordbox_track_id",
        ):
            assert name not in COMPARED_FIELDS

    def test_every_incidental_field_is_actually_compared(self):
        """An incidental field that is not compared is a dead exception."""
        for name in INCIDENTAL_FIELDS:
            assert name in COMPARED_FIELDS


@pytest.mark.unit
class TestPlaylists:
    def test_a_new_playlist_is_added(self, service, imported, tmp_path):
        export = write_export(
            tmp_path,
            BASE_TRACKS,
            # Appended before ROOT's own closing tag, not the first one found:
            # replacing "</NODE>" naively nests the new playlist inside
            # "opening" and the diff correctly reports three additions.
            BASE_PLAYLISTS[: -len("</NODE>")]
            + '<NODE Name="new" Type="1" Entries="1"><TRACK Key="1"/></NODE></NODE>',
            name="pl-added.xml",
        )
        diff = service.compute_refresh_diff(export)

        assert diff.playlists_added.count == 1
        assert diff.playlists_added.items[0].rekordbox_path == "ROOT/new"

    def test_a_missing_playlist_is_removed(self, service, imported, tmp_path):
        export = write_export(
            tmp_path,
            BASE_TRACKS,
            '<NODE Name="ROOT" Type="0">'
            '<NODE Name="opening" Type="1" Entries="2">'
            '<TRACK Key="1"/><TRACK Key="2"/></NODE></NODE>',
            name="pl-removed.xml",
        )
        diff = service.compute_refresh_diff(export)

        assert diff.playlists_removed.count == 1
        assert diff.playlists_removed.items[0].rekordbox_path == "ROOT/closing"

    def test_reordered_membership_is_a_change(self, service, imported, tmp_path):
        """A DJ's playlist order is a set list, not a rendering detail."""
        export = write_export(
            tmp_path,
            BASE_TRACKS,
            BASE_PLAYLISTS.replace(
                '<TRACK Key="1"/><TRACK Key="2"/>', '<TRACK Key="2"/><TRACK Key="1"/>'
            ),
            name="pl-order.xml",
        )
        diff = service.compute_refresh_diff(export)

        assert diff.playlists_changed.count == 1
        change = diff.playlists_changed.items[0]
        assert change.rekordbox_path == "ROOT/opening"
        assert change.change == "membership"
        assert (change.track_count, change.previous_track_count) == (2, 2)

    def test_a_folder_that_became_a_playlist_is_a_kind_change(
        self, service, imported, tmp_path
    ):
        export = write_export(
            tmp_path,
            BASE_TRACKS,
            BASE_PLAYLISTS.replace(
                '<NODE Name="closing" Type="1" Entries="1"><TRACK Key="3"/></NODE>',
                '<NODE Name="closing" Type="0"/>',
            ),
            name="pl-kind.xml",
        )
        diff = service.compute_refresh_diff(export)

        assert diff.playlists_changed.count == 1
        assert diff.playlists_changed.items[0].change == "kind"

    def test_renumbering_alone_does_not_change_any_playlist(
        self, service, imported, tmp_path
    ):
        """Membership is compared by library row, not by TrackID.

        Comparing ids reported 185 of a real export's 206 playlists as edited
        after a Rekordbox rebuild in which nothing had been touched.
        """
        export = write_export(
            tmp_path,
            [
                track_xml("901", "/m/one.mp3", "One", "A"),
                track_xml("902", "/m/two.mp3", "Two", "B"),
                track_xml("903", "/m/three.mp3", "Three", "C"),
            ],
            BASE_PLAYLISTS.replace('Key="1"', 'Key="901"')
            .replace('Key="2"', 'Key="902"')
            .replace('Key="3"', 'Key="903"'),
            name="pl-renumbered.xml",
        )
        diff = service.compute_refresh_diff(export)

        assert diff.relinked.count == 3
        assert diff.playlists_changed.count == 0

    def test_a_removed_track_changes_the_playlists_holding_it(
        self, service, imported, tmp_path
    ):
        export = write_export(
            tmp_path,
            BASE_TRACKS[:2],
            BASE_PLAYLISTS.replace(
                '<NODE Name="closing" Type="1" Entries="1"><TRACK Key="3"/></NODE>',
                '<NODE Name="closing" Type="1" Entries="0"/>',
            ),
            name="pl-lost-track.xml",
        )
        diff = service.compute_refresh_diff(export)

        assert diff.removed.count == 1
        assert diff.playlists_changed.count == 1
        change = diff.playlists_changed.items[0]
        assert (change.track_count, change.previous_track_count) == (0, 1)

    def test_a_reference_the_export_does_not_contain_is_ignored(
        self, service, imported, tmp_path
    ):
        """It names nothing, so it would not be stored either way."""
        export = write_export(
            tmp_path,
            BASE_TRACKS,
            BASE_PLAYLISTS.replace(
                '<TRACK Key="3"/>', '<TRACK Key="3"/><TRACK Key="404"/>'
            ),
            name="pl-dangling.xml",
        )
        assert service.compute_refresh_diff(export).playlists_changed.count == 0


@pytest.mark.unit
class TestTheDiffMatchesTheImport:
    """The promise and the act, compared directly.

    A preview that classified differently from the apply that follows it would
    have a user confirm one thing and get another.
    """

    SCENARIOS = [
        pytest.param([], id="unchanged"),
        pytest.param([("add", "4")], id="added"),
        pytest.param([("drop", "3")], id="removed"),
        pytest.param([("rename", "1")], id="changed"),
        pytest.param([("renumber", "1")], id="relinked"),
        pytest.param([("move", "1")], id="moved"),
        pytest.param([("drop", "3"), ("add", "4"), ("renumber", "1")], id="mixed"),
    ]

    @staticmethod
    def _edit(edits):
        lines = list(BASE_TRACKS)
        for kind, target in edits:
            if kind == "add":
                lines.append(track_xml("4", "/m/four.mp3", "Four", "D"))
            elif kind == "drop":
                lines = [line for line in lines if f'TrackID="{target}"' not in line]
            elif kind == "rename":
                lines[0] = track_xml("1", "/m/one.mp3", "Renamed", "A")
            elif kind == "renumber":
                lines[0] = track_xml("900", "/m/one.mp3", "One", "A")
            elif kind == "move":
                lines[0] = track_xml("1", "/m/moved.mp3", "One", "A")
        return lines

    @pytest.mark.parametrize("edits", SCENARIOS)
    def test_the_counts_the_diff_promised_are_what_the_import_does(
        self, service, tracks, imported, tmp_path, edits
    ):
        export = write_export(tmp_path, self._edit(edits), name="scenario.xml")
        before = tracks.count()

        diff = service.compute_refresh_diff(export)
        summary = service.import_rekordbox_xml(export)

        assert summary.tracks_inserted == diff.added.count
        assert summary.relinked_count == diff.relinked.count
        # An import never deletes; the rows the diff called removed are still
        # there, which is what LIBRARY-09 will act on.
        assert tracks.count() == before + diff.added.count


@pytest.mark.unit
class TestEveryCategorySerializes:
    """A diff that cannot be sent is a diff nobody sees.

    ``Category.to_dict`` serializes whatever it holds by asking the item, so a
    category whose item type has no ``to_dict`` computes fine and then fails at
    the point of being handed to the API. That is exactly what happened to
    re-links: every test that serialized a diff happened to use one with none in
    it, so a preview of a collection Rekordbox had renumbered — the case DEC-002
    exists for — failed with ``'RelinkedTrack' object has no attribute
    'to_dict'``. LIBRARY-12's end-to-end run is what found it.
    """

    @staticmethod
    def _renumbered(tmp_path):
        """The same three files, every one of them under a new TrackID."""
        return write_export(
            tmp_path,
            [
                track_xml("101", "/m/one.mp3", "One", "A"),
                track_xml("102", "/m/two.mp3", "Two", "B"),
                track_xml("103", "/m/three.mp3", "Three", "C"),
            ],
            BASE_PLAYLISTS,
            name="renumbered.xml",
        )

    def test_a_diff_with_relinks_serializes(self, service, imported, tmp_path):
        diff = service.compute_refresh_diff(self._renumbered(tmp_path))
        assert diff.relinked.count == 3

        payload = diff.to_dict()

        assert payload["tracks"]["relinked"]["count"] == 3
        assert payload["tracks"]["relinked"]["items"][0] == {
            "rekordbox_track_id": "101",
            "previous_rekordbox_track_id": "1",
            "file_path": "/m/one.mp3",
        }

    def test_every_populated_category_survives_json(self, service, imported, tmp_path):
        """All seven at once, through a real serializer rather than a dict check.

        ``json.dumps`` is the honest test: it fails on anything the API could
        not actually send, which ``to_dict`` returning objects would not.
        """
        edited = write_export(
            tmp_path,
            [
                track_xml("101", "/m/one.mp3", "One", "A"),
                track_xml("2", "/m/two.mp3", "Two RENAMED", "B"),
                track_xml("9", "/m/nine.mp3", "Nine", "N"),
            ],
            '<NODE Name="ROOT" Type="0">'
            '<NODE Name="opening" Type="1" Entries="1"><TRACK Key="101"/></NODE>'
            '<NODE Name="new one" Type="1" Entries="1"><TRACK Key="9"/></NODE>'
            "</NODE>",
            name="everything.xml",
        )

        diff = service.compute_refresh_diff(edited)
        populated = [
            name
            for name, category in (
                ("added", diff.added),
                ("changed", diff.changed),
                ("removed", diff.removed),
                ("relinked", diff.relinked),
                ("playlists_added", diff.playlists_added),
                ("playlists_changed", diff.playlists_changed),
                ("playlists_removed", diff.playlists_removed),
            )
            if category.items
        ]
        assert len(populated) == 7, f"only {populated} had examples to serialize"

        json.dumps(diff.to_dict())


@pytest.mark.unit
class TestAnUntouchedFileIsNotRead:
    """LIBRARY-12's fast path, and the narrowness that makes it safe.

    Measured at 50,000 tracks, reading the collection to conclude that nothing
    changed cost as much as importing it — and re-checking an untouched export
    is the common case. DEC-035 recorded the modified time and size for exactly
    this, so the diff is answered from them.

    The shortcut can only ever produce an *empty* diff, so it cannot cause a
    deletion. Everything below is about it not being taken when it should not
    be, because the failure it could cause is the quiet one: telling a user
    nothing changed when something did.
    """

    @staticmethod
    def _watch(monkeypatch):
        """Count how many times the collection is actually parsed."""
        from cuepoint.services import library_import_service as module

        reads = []
        real = module.iter_collection_tracks

        def counting(path, *args, **kwargs):
            reads.append(path)
            return real(path, *args, **kwargs)

        monkeypatch.setattr(module, "iter_collection_tracks", counting)
        return reads

    def test_it_does_not_open_the_file_at_all(self, service, imported, monkeypatch):
        reads = self._watch(monkeypatch)

        diff = service.compute_refresh_diff(imported)

        assert diff.is_empty
        assert diff.contents_compared is False
        assert reads == [], "the export was read to conclude it had not changed"

    def test_it_answers_the_same_with_no_path_given(
        self, service, imported, monkeypatch
    ):
        """The Library page's "Check for changes" sends no path at all."""
        reads = self._watch(monkeypatch)

        diff = service.compute_refresh_diff()

        assert diff.is_empty
        assert reads == []

    def test_it_still_carries_a_reference_summary(self, service, imported):
        """So a caller reading ``diff.references`` never handles it being absent."""
        assert service.compute_refresh_diff(imported).references is not None

    def test_force_reads_the_file_anyway(self, service, imported, monkeypatch):
        """The way out for a file edited in place without its state moving."""
        reads = self._watch(monkeypatch)

        diff = service.compute_refresh_diff(imported, force=True)

        assert diff.is_empty
        assert diff.contents_compared is True
        assert reads == [imported]

    def test_a_changed_file_is_read(self, service, imported, tmp_path, monkeypatch):
        edited = write_export(
            tmp_path, BASE_TRACKS[:2], BASE_PLAYLISTS, name="base.xml"
        )
        os.utime(edited, (time.time() + 5, time.time() + 5))
        reads = self._watch(monkeypatch)

        diff = service.compute_refresh_diff(edited)

        assert diff.contents_compared is True
        assert diff.removed.count == 1
        assert reads == [edited]

    def test_a_different_export_is_read(self, service, imported, tmp_path, monkeypatch):
        """A user considering a different file is asking a real question."""
        other = write_export(
            tmp_path, BASE_TRACKS[:2], BASE_PLAYLISTS, name="other.xml"
        )
        reads = self._watch(monkeypatch)

        diff = service.compute_refresh_diff(other)

        assert diff.contents_compared is True
        assert reads == [other]

    def test_a_file_that_has_gone_is_read_and_reported(
        self, service, imported, monkeypatch
    ):
        """ "I cannot tell" reads the file — which then fails honestly."""
        self._watch(monkeypatch)
        Path(imported).unlink()

        with pytest.raises((FileNotFoundError, ValidationError)):
            service.compute_refresh_diff(imported)

    def test_it_is_not_taken_before_anything_is_imported(self, db, tracks, playlists):
        service = LibraryImportService(
            tracks, playlists, LibrarySourceRepository(db), db
        )
        with pytest.raises(ValidationError) as excinfo:
            service.compute_refresh_diff()

        assert excinfo.value.error_code == "LIBRARY_NOT_IMPORTED"

    def test_it_is_not_taken_when_the_import_recorded_no_state(
        self, service, db, imported, monkeypatch
    ):
        """An import whose stat failed has nothing to compare against."""
        from cuepoint.models import library_source as source_module

        sources = LibrarySourceRepository(db)
        stored = sources.get()
        sources.replace(
            source_module.LibrarySource(
                xml_path=stored.xml_path,
                imported_at=stored.imported_at,
                xml_modified_at=None,
                xml_size_bytes=None,
                track_count=stored.track_count,
                playlist_count=stored.playlist_count,
            )
        )
        reads = self._watch(monkeypatch)

        diff = service.compute_refresh_diff(imported)

        assert diff.contents_compared is True
        assert reads == [imported]

    def test_the_apply_never_takes_the_shortcut(self, service, db, imported, tmp_path):
        """LIBRARY-09 re-reads the file every time, and must keep doing so.

        The shortcut is a preview optimisation. An apply that trusted it would
        write a source record for a file it never opened.
        """
        summary = service.apply_refresh(service.compute_refresh_diff(imported))

        assert summary.tracks_updated == 3
        assert summary.tracks_deleted == 0


@pytest.mark.unit
class TestSourceAndErrors:
    def test_it_defaults_to_the_imported_file(self, service, imported):
        """DEC-035: a refresh re-reads that file without asking."""
        diff = service.compute_refresh_diff()
        assert diff.xml_path == str(Path(imported))
        assert diff.is_empty

    def test_no_library_and_no_path_is_a_clear_error(self, service):
        with pytest.raises(ValidationError) as raised:
            service.compute_refresh_diff()
        assert raised.value.error_code == "LIBRARY_NOT_IMPORTED"

    def test_a_file_with_no_collection_is_refused(self, service, imported, tmp_path):
        path = tmp_path / "bad.xml"
        path.write_text("<DJ_PLAYLISTS><PLAYLISTS/></DJ_PLAYLISTS>", encoding="utf-8")
        with pytest.raises(ValidationError) as raised:
            service.compute_refresh_diff(str(path))
        assert raised.value.error_code == "LIBRARY_XML_NO_COLLECTION"

    def test_a_missing_file_raises(self, service, imported, tmp_path):
        with pytest.raises(FileNotFoundError):
            service.compute_refresh_diff(str(tmp_path / "gone.xml"))

    def test_cancellation_stops_it(self, service, imported):
        # `force`, because cancellation is about the read and LIBRARY-12's fast
        # path answers an untouched file without one. There is nothing to stop
        # when nothing is being done.
        with pytest.raises(ImportCancelled):
            service.compute_refresh_diff(
                imported, should_cancel=lambda: True, force=True
            )

    def test_cancelling_leaves_the_library_alone(self, service, db, imported):
        before = library_state(db)
        with pytest.raises(ImportCancelled):
            service.compute_refresh_diff(
                imported, should_cancel=lambda: True, force=True
            )
        assert library_state(db) == before

    def test_an_untouched_file_has_nothing_to_cancel(self, service, imported):
        """The fast path returns before a cancel could apply, and that is right.

        A caller that asked to stop something instantaneous gets the answer
        rather than an exception about work that never started.
        """
        diff = service.compute_refresh_diff(imported, should_cancel=lambda: True)

        assert diff.is_empty
        assert diff.contents_compared is False


@pytest.mark.unit
class TestReportingShape:
    def test_counts_stay_exact_when_detail_is_capped(self, service, tracks, tmp_path):
        """A preview needs the number, and enough examples to be believable."""
        many = [track_xml(str(i), f"/m/{i}.mp3", f"T{i}", "A") for i in range(50)]
        service.import_rekordbox_xml(write_export(tmp_path, many, name="many.xml"))

        renamed = [
            track_xml(str(i), f"/m/{i}.mp3", f"Renamed {i}", "A") for i in range(50)
        ]
        diff = service.compute_refresh_diff(
            write_export(tmp_path, renamed, name="many-renamed.xml"), detail_limit=5
        )

        assert diff.changed.count == 50
        assert len(diff.changed.items) == 5
        assert diff.changed.truncated is True

    def test_a_complete_sample_is_not_truncated(self, service, imported, tmp_path):
        export = write_export(tmp_path, BASE_TRACKS[:2], name="two.xml")
        diff = service.compute_refresh_diff(export)
        assert diff.removed.truncated is False

    def test_the_serialized_shape(self, service, imported, tmp_path):
        export = write_export(
            tmp_path, [track_xml("1", "/m/one.mp3", "Renamed", "A")], name="s.xml"
        )
        payload = service.compute_refresh_diff(export).to_dict()

        assert set(payload) == {
            "xml_path",
            "is_empty",
            "duration_seconds",
            "contents_compared",
            "tracks",
            "playlists",
            "references",
        }
        assert set(payload["tracks"]) == {
            "added",
            "changed",
            "removed",
            "relinked",
            "notable_changed_count",
        }
        assert set(payload["playlists"]) == {"added", "changed", "removed"}
        assert set(payload["tracks"]["changed"]) == {"count", "items", "truncated"}
        assert payload["tracks"]["changed"]["items"][0]["fields"] == ["title"]
        assert payload["tracks"]["changed"]["items"][0]["notable"] is True

    def test_an_empty_diff_says_so(self, service, imported):
        assert service.compute_refresh_diff(imported).to_dict()["is_empty"] is True


@pytest.mark.unit
class TestCategory:
    def test_it_counts_everything_and_keeps_a_sample(self):
        category = Category(limit=2)
        for index in range(5):
            category.add(index)
        assert category.count == 5
        assert category.items == [0, 1]
        assert category.truncated is True

    def test_an_untruncated_category(self):
        category = Category(limit=10)
        category.add(1)
        assert (category.count, category.truncated) == (1, False)

    def test_an_empty_diff_is_empty(self):
        assert RefreshDiff(xml_path="/m/c.xml").is_empty is True
