#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Unit tests for the Rekordbox import service (LIBRARY-04).

Idempotency is the property the spec calls out as most likely to break subtly
and slowest for a user to notice, so it is asserted from several directions:
counts, row totals, playlist membership, and the source record.

The other theme is what a *failed* import leaves behind. There is no single
transaction spanning the whole thing — ``DatabaseService`` refuses nested
transactions because SQLite has none — so the ordering has to be the guarantee,
and the tests check that the source record is only ever written after everything
else succeeded.
"""

from __future__ import annotations

import xml.etree.ElementTree as ET
from pathlib import Path

import pytest

from cuepoint.exceptions.cuepoint_exceptions import ValidationError
from cuepoint.persistence.activity_repository import ActivityRepository
from cuepoint.persistence.library_source_repository import LibrarySourceRepository
from cuepoint.persistence.playlist_repository import PlaylistRepository
from cuepoint.persistence.track_repository import TrackRepository
from cuepoint.services.activity_service import ActivityService
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.library_import_service import (
    EVENT_LIBRARY_IMPORTED,
    LibraryImportService,
)
from cuepoint.services.migration_runner import MigrationRunner

TRACK_ATTRS = (
    'Genre="House" Album="Album" Label="Label" Tonality="8A" AverageBpm="124.00" '
    'Year="2024" TotalTime="360" BitRate="320" Rating="204" PlayCount="7" '
    'DateAdded="2024-01-01" Comments="c"'
)


def write_export(tmp_path: Path, tracks, playlists="", name="collection.xml") -> str:
    """Write a Rekordbox-shaped export. ``tracks`` is (id, path, title) tuples."""
    entries = "\n".join(
        f'    <TRACK TrackID="{tid}" Name="{title}" Artist="Artist {tid}" '
        f'{TRACK_ATTRS} Location="file://localhost{path}"/>'
        for tid, path, title in tracks
    )
    path = tmp_path / name
    path.write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<DJ_PLAYLISTS Version="1.0.0">\n'
        '  <PRODUCT Name="rekordbox" Version="6.8.6" Company="AlphaTheta"/>\n'
        f'  <COLLECTION Entries="{len(tracks)}">\n{entries}\n  </COLLECTION>\n'
        f"  <PLAYLISTS>{playlists}</PLAYLISTS>\n"
        "</DJ_PLAYLISTS>\n",
        encoding="utf-8",
    )
    return str(path)


SAMPLE_TRACKS = [
    ("1", "/m/one.mp3", "One"),
    ("2", "/m/two.mp3", "Two"),
    ("3", "/m/three.mp3", "Three"),
]

SAMPLE_PLAYLISTS = (
    '<NODE Name="ROOT" Type="0" Count="1">'
    '<NODE Name="Sets" Type="0" Count="2">'
    '<NODE Name="opening" Type="1" Entries="2">'
    '<TRACK Key="2"/><TRACK Key="1"/>'
    "</NODE>"
    '<NODE Name="closing" Type="1" Entries="1"><TRACK Key="3"/></NODE>'
    "</NODE>"
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
def sources(db):
    return LibrarySourceRepository(db)


@pytest.fixture
def activity(db):
    return ActivityService(ActivityRepository(db), TrackRepository(db))


@pytest.fixture
def service(db, tracks, playlists, sources, activity):
    return LibraryImportService(tracks, playlists, sources, db, activity)


@pytest.fixture
def export(tmp_path):
    return write_export(tmp_path, SAMPLE_TRACKS, SAMPLE_PLAYLISTS)


@pytest.mark.unit
class TestFirstImport:
    def test_reports_what_it_imported(self, service, export):
        summary = service.import_rekordbox_xml(export)

        assert summary.tracks_inserted == 3
        assert summary.tracks_updated == 0
        assert summary.relinked_count == 0
        assert summary.track_count == 3
        assert summary.playlists.playlists == 2
        assert summary.playlists.folders == 2
        assert summary.playlists.entries == 3
        assert summary.playlists.missing_count == 0
        assert summary.duration_seconds >= 0

    def test_the_tracks_are_stored_with_their_fields(self, service, tracks, export):
        service.import_rekordbox_xml(export)

        stored = tracks.find_by_rekordbox_id("1")
        assert stored.title == "One"
        assert stored.file_path == "/m/one.mp3"
        assert stored.rating == 4
        assert stored.bpm == 124.0
        assert stored.duration_seconds == 360

    def test_the_playlist_tree_is_stored_in_order(
        self, service, playlists, tracks, export
    ):
        service.import_rekordbox_xml(export)

        opening = playlists.find_by_path("ROOT/Sets/opening")
        assert opening is not None
        stored = [
            tracks.get(t).rekordbox_track_id
            for t in playlists.track_ids_for(opening.id)
        ]
        assert stored == ["2", "1"], "Rekordbox's order, not the collection's"

    def test_the_source_record_matches_the_file(self, service, export):
        summary = service.import_rekordbox_xml(export)

        assert summary.source.xml_path == str(Path(export))
        assert summary.source.track_count == 3
        assert summary.source.playlist_count == 4, "folders included"
        assert summary.source.matches_file_on_disk() is True

    def test_the_source_record_is_readable_afterwards(self, service, export):
        service.import_rekordbox_xml(export)
        assert service.current_source().xml_path == str(Path(export))

    def test_no_source_record_before_any_import(self, service):
        assert service.current_source() is None

    def test_a_wrong_entries_count_does_not_break_progress(self, service, tmp_path):
        """Entries is Rekordbox's claim, not a fact.

        A file that under-declares would otherwise drive the bar past 100%,
        which reads as a bug in a way that finishing early does not.
        """
        path = tmp_path / "under-declared.xml"
        entries = "\n".join(
            f'<TRACK TrackID="{i}" Name="T{i}" Artist="A" '
            f'Location="file://localhost/m/{i}.mp3"/>'
            for i in range(5)
        )
        path.write_text(
            '<?xml version="1.0" encoding="UTF-8"?>\n'
            '<DJ_PLAYLISTS Version="1.0.0">\n'
            f'  <COLLECTION Entries="2">{entries}</COLLECTION>\n'
            "  <PLAYLISTS/>\n</DJ_PLAYLISTS>\n",
            encoding="utf-8",
        )
        ticks = []
        summary = service.import_rekordbox_xml(
            str(path), on_progress=lambda c, t, p: ticks.append((c, t))
        )

        assert summary.track_count == 5
        assert all(done <= total for done, total in ticks), (
            f"progress went past its total: {ticks}"
        )
        assert ticks[-1][1] >= 5

    def test_an_empty_collection_imports_as_an_empty_library(self, service, tmp_path):
        """A new Rekordbox install has no tracks; that is not an error."""
        summary = service.import_rekordbox_xml(write_export(tmp_path, []))
        assert summary.track_count == 0
        assert summary.source.track_count == 0


@pytest.mark.unit
class TestIdempotency:
    """The property the spec names as most likely to break subtly."""

    def test_the_second_import_updates_and_inserts_nothing(self, service, export):
        service.import_rekordbox_xml(export)
        second = service.import_rekordbox_xml(export)

        assert second.tracks_inserted == 0
        assert second.tracks_updated == 3
        assert second.relinked_count == 0

    def test_rows_are_not_duplicated(self, service, tracks, playlists, export):
        service.import_rekordbox_xml(export)
        first_counts = (tracks.count(), playlists.count(), playlists.count_entries())

        service.import_rekordbox_xml(export)
        service.import_rekordbox_xml(export)

        assert (
            tracks.count(),
            playlists.count(),
            playlists.count_entries(),
        ) == first_counts

    def test_track_ids_are_stable_across_imports(self, service, tracks, export):
        service.import_rekordbox_xml(export)
        before = {t.rekordbox_track_id: t.id for t in tracks.list_all()}

        service.import_rekordbox_xml(export)
        after = {t.rekordbox_track_id: t.id for t in tracks.list_all()}

        assert before == after, "a stable id is what tags and ratings hang off"

    def test_playlist_membership_is_the_same_after_a_re_import(
        self, service, playlists, export
    ):
        service.import_rekordbox_xml(export)
        opening = playlists.find_by_path("ROOT/Sets/opening")
        before = playlists.track_ids_for(opening.id)

        service.import_rekordbox_xml(export)
        opening = playlists.find_by_path("ROOT/Sets/opening")

        assert playlists.track_ids_for(opening.id) == before

    def test_the_source_record_is_replaced_not_appended(self, db, service, export):
        service.import_rekordbox_xml(export)
        service.import_rekordbox_xml(export)

        count = (
            db.connect().execute("SELECT count(*) FROM library_source").fetchone()[0]
        )
        assert count == 1

    def test_created_at_survives_a_re_import(self, service, tracks, export):
        service.import_rekordbox_xml(export)
        first_seen = tracks.find_by_rekordbox_id("1").created_at

        service.import_rekordbox_xml(export)

        assert tracks.find_by_rekordbox_id("1").created_at == first_seen


@pytest.mark.unit
class TestChangedExports:
    def test_a_renumbered_track_id_is_reported_as_a_relink(
        self, service, tracks, tmp_path
    ):
        """DEC-002: not an insert and a delete — the row and its data survive."""
        first = write_export(tmp_path, SAMPLE_TRACKS, name="first.xml")
        service.import_rekordbox_xml(first)
        original_id = tracks.find_by_rekordbox_id("1").id

        renumbered = [("900", "/m/one.mp3", "One")] + SAMPLE_TRACKS[1:]
        second = write_export(tmp_path, renumbered, name="second.xml")
        summary = service.import_rekordbox_xml(second)

        assert summary.tracks_inserted == 0
        assert summary.tracks_updated == 3
        assert summary.relinked_count == 1
        assert tracks.count() == 3
        assert tracks.find_by_rekordbox_id("900").id == original_id
        assert tracks.find_by_rekordbox_id("1") is None

        (relink,) = summary.relinked
        assert relink.rekordbox_track_id == "900"
        assert relink.previous_rekordbox_track_id == "1"

    def test_a_full_renumbering_relinks_every_track_it_can(
        self, service, tracks, tmp_path
    ):
        """What a Rekordbox database rebuild looks like: every TrackID changes.

        DEC-002 exists for exactly this. Every track keeps its row, so tags and
        ratings survive, and nothing is inserted.
        """
        service.import_rekordbox_xml(
            write_export(tmp_path, SAMPLE_TRACKS, name="a.xml")
        )
        before = {t.file_path: t.id for t in tracks.list_all()}

        renumbered = [(f"9{tid}", path, title) for tid, path, title in SAMPLE_TRACKS]
        summary = service.import_rekordbox_xml(
            write_export(tmp_path, renumbered, name="b.xml")
        )

        assert (summary.tracks_inserted, summary.relinked_count) == (0, 3)
        assert tracks.count() == 3
        assert {t.file_path: t.id for t in tracks.list_all()} == before

    def test_two_tracks_sharing_a_file_can_only_relink_one(
        self, service, tracks, tmp_path
    ):
        """A real 3,880-track collection has exactly one such pair.

        Rekordbox lets two entries point at one file. When both are renumbered
        the path fallback is ambiguous, so the first claims the row and the
        second is **inserted** rather than overwriting it — losing a track would
        be much worse than gaining an orphan, and the orphan is what LIBRARY-09's
        refresh removes.
        """
        shared = [("1", "/m/same.mp3", "First"), ("2", "/m/same.mp3", "Second")]
        service.import_rekordbox_xml(write_export(tmp_path, shared, name="a.xml"))
        assert tracks.count() == 2

        renumbered = [("91", "/m/same.mp3", "First"), ("92", "/m/same.mp3", "Second")]
        summary = service.import_rekordbox_xml(
            write_export(tmp_path, renumbered, name="b.xml")
        )

        assert (summary.tracks_inserted, summary.relinked_count) == (1, 1)
        assert tracks.count() == 3, "one relinked, one inserted, one orphaned"
        assert {t.rekordbox_track_id for t in tracks.list_all()} == {
            "91",
            "92",
            "1",
        } or {t.rekordbox_track_id for t in tracks.list_all()} == {"91", "92", "2"}

    def test_a_new_track_is_inserted_and_the_rest_updated(
        self, service, tracks, tmp_path
    ):
        service.import_rekordbox_xml(
            write_export(tmp_path, SAMPLE_TRACKS, name="a.xml")
        )
        grown = SAMPLE_TRACKS + [("4", "/m/four.mp3", "Four")]
        summary = service.import_rekordbox_xml(
            write_export(tmp_path, grown, name="b.xml")
        )

        assert (summary.tracks_inserted, summary.tracks_updated) == (1, 3)
        assert tracks.count() == 4

    def test_a_track_removed_from_the_export_still_exists_after_an_import(
        self, service, tracks, tmp_path
    ):
        """Import adds and updates; deletion is the refresh's job (LIBRARY-09).

        Asserted so that the day it changes, it changes on purpose — DEC-003
        deletes removed tracks, but only through a refresh the user confirmed.
        """
        service.import_rekordbox_xml(
            write_export(tmp_path, SAMPLE_TRACKS, name="a.xml")
        )
        smaller = write_export(tmp_path, SAMPLE_TRACKS[:2], name="b.xml")
        service.import_rekordbox_xml(smaller)

        assert tracks.count() == 3
        assert tracks.find_by_rekordbox_id("3") is not None

    def test_the_playlist_mirror_follows_the_new_export(
        self, service, playlists, tmp_path
    ):
        service.import_rekordbox_xml(
            write_export(tmp_path, SAMPLE_TRACKS, SAMPLE_PLAYLISTS, name="a.xml")
        )
        trimmed = (
            '<NODE Name="ROOT" Type="0"><NODE Name="Sets" Type="0">'
            '<NODE Name="opening" Type="1"><TRACK Key="1"/></NODE>'
            "</NODE></NODE>"
        )
        service.import_rekordbox_xml(
            write_export(tmp_path, SAMPLE_TRACKS, trimmed, name="b.xml")
        )

        assert playlists.find_by_path("ROOT/Sets/closing") is None
        assert playlists.count_entries() == 1

    def test_a_playlist_reference_to_an_unknown_track_is_reported_not_fatal(
        self, service, tmp_path
    ):
        stale = (
            '<NODE Name="ROOT" Type="0">'
            '<NODE Name="set" Type="1"><TRACK Key="1"/><TRACK Key="999"/></NODE>'
            "</NODE>"
        )
        summary = service.import_rekordbox_xml(
            write_export(tmp_path, SAMPLE_TRACKS, stale)
        )
        assert summary.playlists.entries == 1
        assert summary.playlists.missing_track_refs == ("999",)


@pytest.mark.unit
class TestRejectedFiles:
    def test_a_file_with_no_collection_fails_clearly(self, service, tmp_path):
        """Not an empty library and a success message."""
        path = tmp_path / "playlists-only.xml"
        path.write_text(
            '<?xml version="1.0" encoding="UTF-8"?>\n'
            '<DJ_PLAYLISTS Version="1.0.0"><PLAYLISTS>'
            '<NODE Name="ROOT" Type="0"/></PLAYLISTS></DJ_PLAYLISTS>\n',
            encoding="utf-8",
        )
        with pytest.raises(ValidationError) as raised:
            service.import_rekordbox_xml(str(path))

        assert raised.value.error_code == "LIBRARY_XML_NO_COLLECTION"
        assert "COLLECTION" in raised.value.message

    def test_a_rejected_file_leaves_the_library_untouched(
        self, service, tracks, playlists, tmp_path, export
    ):
        service.import_rekordbox_xml(export)
        before = (tracks.count(), playlists.count(), service.current_source().xml_path)

        path = tmp_path / "bad.xml"
        path.write_text("<DJ_PLAYLISTS><PLAYLISTS/></DJ_PLAYLISTS>", encoding="utf-8")
        with pytest.raises(ValidationError):
            service.import_rekordbox_xml(str(path))

        assert (
            tracks.count(),
            playlists.count(),
            service.current_source().xml_path,
        ) == before

    def test_a_missing_file_raises_file_not_found(self, service, tmp_path):
        with pytest.raises(FileNotFoundError):
            service.import_rekordbox_xml(str(tmp_path / "gone.xml"))

    def test_malformed_xml_raises_a_parse_error(self, service, tmp_path):
        path = tmp_path / "broken.xml"
        path.write_text(
            '<DJ_PLAYLISTS><COLLECTION><TRACK TrackID="1"', encoding="utf-8"
        )
        with pytest.raises(ET.ParseError):
            service.import_rekordbox_xml(str(path))

    def test_a_rejected_file_leaves_no_source_record(self, service, sources, tmp_path):
        path = tmp_path / "bad.xml"
        path.write_text("<DJ_PLAYLISTS><PLAYLISTS/></DJ_PLAYLISTS>", encoding="utf-8")
        with pytest.raises(ValidationError):
            service.import_rekordbox_xml(str(path))

        assert sources.get() is None

    def test_a_failure_after_the_collection_check_leaves_no_source_record(
        self, service, sources, tmp_path
    ):
        """The reason the source record is written last, not first.

        This file gets past the COLLECTION check — the element opens — and then
        fails while the tracks are being read. A source record written before
        the work would claim an import that never finished, and the library
        would report a file it had not actually read.

        An earlier version of this test used a file rejected *before* any work
        started, and so passed against a service that wrote the record first.
        """
        path = tmp_path / "truncated.xml"
        path.write_text(
            '<?xml version="1.0" encoding="UTF-8"?>\n'
            '<DJ_PLAYLISTS Version="1.0.0">\n'
            '  <COLLECTION Entries="2">\n'
            '    <TRACK TrackID="1" Name="One" Artist="A"/>\n'
            '    <TRACK TrackID="2" Name="Tw',
            encoding="utf-8",
        )
        with pytest.raises(ET.ParseError):
            service.import_rekordbox_xml(str(path))

        assert sources.get() is None

    def test_a_failed_import_does_not_replace_an_earlier_source_record(
        self, service, sources, tmp_path, export
    ):
        """A user who imported yesterday keeps that record when today fails."""
        service.import_rekordbox_xml(export)
        before = sources.get()

        path = tmp_path / "truncated.xml"
        path.write_text(
            '<?xml version="1.0"?><DJ_PLAYLISTS><COLLECTION Entries="1">'
            '<TRACK TrackID="1" Name="One',
            encoding="utf-8",
        )
        with pytest.raises(ET.ParseError):
            service.import_rekordbox_xml(str(path))

        assert sources.get().to_dict() == before.to_dict()


@pytest.mark.unit
class TestActivity:
    def test_an_import_is_recorded(self, service, db, export):
        service.import_rekordbox_xml(export)

        events = ActivityRepository(db).recent_events(limit=10)
        imported = [e for e in events if e.type == EVENT_LIBRARY_IMPORTED]
        assert len(imported) == 1
        assert "3 tracks" in imported[0].summary

    def test_the_event_carries_the_detail_a_user_would_want(self, service, db, export):
        service.import_rekordbox_xml(export)

        (event,) = [
            e
            for e in ActivityRepository(db).recent_events(limit=10)
            if e.type == EVENT_LIBRARY_IMPORTED
        ]
        assert event.detail["inserted"] == 3
        assert event.detail["playlists"] == 2
        assert event.detail["entries"] == 3
        assert event.detail["xml_path"].endswith("collection.xml")

    def test_an_import_without_an_activity_service_still_works(
        self, db, tracks, playlists, sources, export
    ):
        service = LibraryImportService(tracks, playlists, sources, db)
        assert service.import_rekordbox_xml(export).track_count == 3

    def test_a_failing_activity_feed_does_not_fail_the_import(
        self, db, tracks, playlists, sources, export
    ):
        """The feed records what happened; it is not a dependency of it."""

        class Broken:
            def record_event(self, *args, **kwargs):
                raise RuntimeError("feed is down")

        service = LibraryImportService(tracks, playlists, sources, db, Broken())
        assert service.import_rekordbox_xml(export).track_count == 3
        assert tracks.count() == 3


@pytest.mark.unit
class TestSummary:
    def test_the_summary_line_reads_as_a_sentence(self, service, export):
        line = service.import_rekordbox_xml(export).summary_line()
        assert line.startswith("Library imported")
        assert "3 tracks" in line
        assert "3 new" in line

    def test_the_summary_line_mentions_relinks_when_there_are_any(
        self, service, tmp_path
    ):
        service.import_rekordbox_xml(
            write_export(tmp_path, SAMPLE_TRACKS, name="a.xml")
        )
        renumbered = [("900", "/m/one.mp3", "One")] + SAMPLE_TRACKS[1:]
        summary = service.import_rekordbox_xml(
            write_export(tmp_path, renumbered, name="b.xml")
        )
        assert "1 re-linked" in summary.summary_line()

    def test_the_duration_is_measured(self, service, export):
        assert service.import_rekordbox_xml(export).duration_seconds > 0
