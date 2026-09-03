#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Unit tests for the DEC-035 record of the file a library came from.

Everything here exists so a refresh can answer one question — "is this still the
file I read, and has it changed?" — without asking the user. The interesting
cases are all the ways that question can have no answer.
"""

from __future__ import annotations

import os

import pytest

from cuepoint.models.library_source import (
    LibrarySource,
    describe_file,
    source_for_import,
)


@pytest.fixture
def export(tmp_path):
    path = tmp_path / "collection.xml"
    path.write_text("<DJ_PLAYLISTS/>", encoding="utf-8")
    return path


@pytest.mark.unit
class TestDescribeFile:
    def test_returns_the_modified_time_and_size(self, export):
        described = describe_file(str(export))
        assert described is not None
        modified, size = described
        assert size == export.stat().st_size
        assert modified.endswith("+00:00"), "stored as UTC so it compares across zones"

    def test_a_missing_file_describes_as_none(self, tmp_path):
        assert describe_file(str(tmp_path / "gone.xml")) is None

    def test_a_directory_describes_without_raising(self, tmp_path):
        described = describe_file(str(tmp_path))
        assert described is None or isinstance(described[1], int)


@pytest.mark.unit
class TestSourceForImport:
    def test_captures_the_files_state(self, export):
        source = source_for_import(
            str(export),
            imported_at="2026-09-03T10:00:00+00:00",
            track_count=3880,
            playlist_count=234,
        )
        assert source.xml_size_bytes == export.stat().st_size
        assert source.xml_modified_at is not None
        assert source.track_count == 3880
        assert source.playlist_count == 234
        assert source.imported_at == "2026-09-03T10:00:00+00:00"

    def test_a_file_that_cannot_be_stat_ed_still_produces_a_record(self, tmp_path):
        """A stat failure costs the refresh its shortcut, not the user's import."""
        source = source_for_import(
            str(tmp_path / "gone.xml"),
            imported_at="now",
            track_count=1,
            playlist_count=0,
        )
        assert source.xml_modified_at is None
        assert source.xml_size_bytes is None
        assert source.is_stat_known is False


@pytest.mark.unit
class TestMatchesFileOnDisk:
    def test_an_untouched_file_matches(self, export):
        source = source_for_import(str(export), "now", 0, 0)
        assert source.matches_file_on_disk() is True

    def test_a_changed_file_does_not_match(self, export):
        source = source_for_import(str(export), "now", 0, 0)
        export.write_text(
            "<DJ_PLAYLISTS><COLLECTION/></DJ_PLAYLISTS>", encoding="utf-8"
        )
        assert source.matches_file_on_disk() is False

    def test_a_file_touched_without_changing_size_does_not_match(self, export):
        """Size alone is not enough — an edit can preserve it."""
        source = source_for_import(str(export), "now", 0, 0)
        stat = export.stat()
        os.utime(str(export), (stat.st_atime + 120, stat.st_mtime + 120))
        assert source.matches_file_on_disk() is False

    def test_a_vanished_file_does_not_match(self, export):
        source = source_for_import(str(export), "now", 0, 0)
        export.unlink()
        assert source.matches_file_on_disk() is False

    def test_a_record_with_no_stat_never_matches(self, export):
        """Nothing to compare against means re-read, not "unchanged"."""
        source = LibrarySource(xml_path=str(export), imported_at="now")
        assert source.matches_file_on_disk() is False

    def test_another_path_can_be_compared(self, tmp_path, export):
        """The refresh flow when a user points at a file that has moved."""
        source = source_for_import(str(export), "now", 0, 0)
        moved = tmp_path / "moved.xml"
        export.rename(moved)
        assert source.matches_file_on_disk() is False
        assert source.matches_file_on_disk(str(moved)) is True


@pytest.mark.unit
class TestSerialization:
    def test_round_trips_through_from_row(self, export):
        source = source_for_import(str(export), "2026-09-03T10:00:00+00:00", 12, 3)
        assert LibrarySource.from_row(source.to_dict()).to_dict() == source.to_dict()

    def test_from_row_tolerates_missing_optional_columns(self):
        source = LibrarySource.from_row({"xml_path": "/m/c.xml", "imported_at": "now"})
        assert source.xml_modified_at is None
        assert source.track_count == 0
        assert source.playlist_count == 0
