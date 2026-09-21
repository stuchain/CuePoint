#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""What an export would write, before it writes it (EXPORT-04).

DEC-079, DEC-081, DEC-082, DEC-084, DEC-088, DEC-089.

Six risks, and a test for each of them:

**The preview drifts from the export.** DEC-084's whole claim is that a number
in the preview and a number in the result cannot disagree. The defence is
structural — the preview is the patch with the write left out — and the test is
what catches the day somebody adds a case to one side. It runs a real export of
the same plan and compares every count.

**"Unchanged" is not literally true.** A library where nobody has overridden
anything must report zero changed tracks, because the alternative is a preview
that says "50,000 tracks changed" for an export that is a copy with playlists
appended. The comparison is per field, on the value the file already holds, and
a source already carrying the effective value contributes nothing.

**A stale source is silently patched.** DEC-082 reports rather than refuses, so
the report is the only thing standing between a user and a Rekordbox playlist
full of references the file does not contain. The signal, both values, and the
counts either side of the difference are all asserted.

**Zero is claimed where nothing was counted.** DEC-088 is explicit that a library
nobody has file-checked says so rather than reporting no missing files. Three
cases, because "none checked", "checked and none missing" and "checked, some
missing" are three different rows and only two of them are a number.

**A Camelot export puts no Camelot in the file.** The key is the one field
compared as rendered text (DEC-079, DEC-089): parsed, ``Am`` and ``8A`` are the
same key, so a notation compared parsed would silently do nothing. Every
notation is exported and counted here.

**A playlist quietly differs from the Collection on screen.** DEC-058's repeats,
DEC-059's folders, DEC-081's live membership and DEC-082's dropped references all
land in the same place — the entry count — and each is asserted with the
arithmetic that written plus dropped is what the Collection holds.
"""

from __future__ import annotations

import os
from pathlib import Path

import pytest

from cuepoint.data.rekordbox import iter_playlist_nodes
from cuepoint.data.rekordbox_export import (
    CUEPOINT_FOLDER_NAME,
    EXPORT_FIELDS,
    patch_collection_xml,
)
from cuepoint.exceptions.cuepoint_exceptions import ValidationError
from cuepoint.models.collection import KIND_COLLECTION, KIND_SMART
from cuepoint.models.filter_rule import FilterRule, RuleSet, field_spec
from cuepoint.models.file_status import (
    FILE_MISSING,
    FILE_PRESENT,
    TrackFileStatus,
)
from cuepoint.models.rekordbox_playlist import KIND_PLAYLIST
from cuepoint.models.library_track import utc_now_iso
from cuepoint.models.rekordbox_export_values import (
    EXPORT_VALUE_COLUMNS,
    ExportTrackValues,
)
from cuepoint.persistence.track_query import JOINS
from cuepoint.persistence.track_repository import TrackRepository
from cuepoint.services.rekordbox_export_service import (
    DEFAULT_KEY_FORMAT,
    SIGNAL_MODIFIED,
    SIGNAL_SIZE,
    SMART_PAGE_SIZE,
    SOURCE_MISSING,
    SOURCE_NEVER_IMPORTED,
    SOURCE_INVALID,
    SOURCE_REFUSALS,
    SOURCE_UNREADABLE,
    ExportSourceError,
)
from cuepoint.services.tag_write_options import KEY_FORMATS
from cuepoint.services.tag_write_service import key_text

from .library import SOURCE

pytestmark = pytest.mark.unit


def paths_of(preview) -> list:
    return [playlist.path for playlist in preview.playlists]


def entries_of(destination: Path, name: str) -> list:
    """The track refs one written playlist holds, read back through the parser."""
    for node in iter_playlist_nodes(str(destination)):
        if node.name == name and node.kind == KIND_PLAYLIST:
            return list(node.track_refs)
    raise AssertionError(f"no playlist named {name!r} in {destination}")


# --------------------------------------------------------- the source must exist


@pytest.mark.unit
class TestTheSourceMustBeThere:
    def test_a_library_that_was_never_imported_refuses_with_its_own_reason(
        self, service, sources
    ):
        sources.clear()

        with pytest.raises(ExportSourceError) as raised:
            service.preview()

        assert raised.value.reason == SOURCE_NEVER_IMPORTED
        assert raised.value.path is None
        assert "not been imported" in str(raised.value)

    def test_a_source_row_with_no_path_is_the_same_refusal(self, service, sources, db):
        db.connect().execute("UPDATE library_source SET xml_path = ''")

        with pytest.raises(ExportSourceError) as raised:
            service.preview()

        assert raised.value.reason == SOURCE_NEVER_IMPORTED

    def test_an_absent_source_refuses_with_the_path_named(
        self, service, sources, source: Path
    ):
        source.unlink()

        with pytest.raises(ExportSourceError) as raised:
            service.preview()

        assert raised.value.reason == SOURCE_MISSING
        assert raised.value.path == str(source)
        assert str(source) in str(raised.value)

    def test_a_source_that_is_a_folder_is_not_mistaken_for_a_file(
        self, service, sources, source: Path
    ):
        source.unlink()
        source.mkdir()

        with pytest.raises(ExportSourceError) as raised:
            service.preview()

        assert raised.value.reason == SOURCE_MISSING

    def test_an_unreadable_source_refuses_and_says_which_file(
        self, service, sources, source: Path, monkeypatch: pytest.MonkeyPatch
    ):
        """A file present and unopenable — a permission, a lock, a dead share.
        Separate from "missing", because the two need different things done."""
        import builtins

        real = builtins.open

        def refuse(path, *args, **kwargs):
            if str(path) == str(source):
                raise PermissionError(13, "Permission denied")
            return real(path, *args, **kwargs)

        monkeypatch.setattr(builtins, "open", refuse)

        with pytest.raises(ExportSourceError) as raised:
            service.preview()

        assert raised.value.reason == SOURCE_UNREADABLE
        assert raised.value.path == str(source)
        assert "Permission denied" in str(raised.value)

    def test_a_source_that_disappears_between_the_check_and_the_read_refuses(
        self, service, sources, source: Path, monkeypatch: pytest.MonkeyPatch
    ):
        """The window DEC-082's refusal has to survive, not merely the happy path."""
        import cuepoint.services.rekordbox_export_service as module

        plan = service.plan()
        source.unlink()

        with pytest.raises(ExportSourceError) as raised:
            service.preview_of(plan)

        assert raised.value.reason == SOURCE_MISSING
        assert module.SOURCE_MISSING == SOURCE_MISSING

    def test_every_refusal_has_a_reason_in_the_published_list(self):
        assert set(SOURCE_REFUSALS) == {
            SOURCE_NEVER_IMPORTED,
            SOURCE_MISSING,
            SOURCE_UNREADABLE,
            SOURCE_INVALID,
        }
        assert len(set(SOURCE_REFUSALS)) == len(SOURCE_REFUSALS)

    def test_a_refusal_is_a_validation_error_so_existing_handling_applies(
        self, service, sources
    ):
        sources.clear()

        with pytest.raises(ValidationError):
            service.preview()

    def test_an_oversized_source_is_refused_before_it_is_parsed(
        self, service, sources, monkeypatch: pytest.MonkeyPatch
    ):
        import cuepoint.data.rekordbox_export as writer

        def explode(_data: bytes):  # pragma: no cover - must not run
            raise AssertionError("parsed a file it should have refused")

        monkeypatch.setattr(writer.os.path, "getsize", lambda _p: 200 * 1024 * 1024)
        monkeypatch.setattr(writer, "_scan_document", explode)

        with pytest.raises(ExportSourceError, match="too large") as raised:
            service.preview()

        assert raised.value.reason == SOURCE_INVALID

    def test_a_malformed_source_is_refused_by_name(
        self, service, sources, source: Path
    ):
        source.write_bytes(b"<DJ_PLAYLISTS><COLLECTION><TRACK TrackID='1'>")

        with pytest.raises(ExportSourceError, match="not well-formed") as raised:
            service.preview()

        assert raised.value.reason == SOURCE_INVALID
        assert raised.value.path == str(source)

    def test_an_encoding_it_cannot_write_back_is_refused_with_a_reason(
        self, service, sources, source: Path
    ):
        source.write_bytes(b'<?xml version="1.0" encoding="UTF-16"?><DJ_PLAYLISTS/>')

        with pytest.raises(
            ExportSourceError, match="Unsupported XML encoding"
        ) as raised:
            service.preview()

        assert raised.value.reason == SOURCE_INVALID

    def test_an_unusable_source_is_still_a_validation_error(
        self, service, sources, source: Path
    ):
        """Existing handling of a request that cannot be honoured still applies."""
        source.write_bytes(b"<DJ_PLAYLISTS><COLLECTION><TRACK TrackID='1'>")

        with pytest.raises(ValidationError):
            service.preview()


# ------------------------------------------------------- a changed source (082)


@pytest.mark.unit
class TestAChangedSourceIsReported:
    def test_an_untouched_source_is_not_stale_and_names_no_signal(self, service):
        state = service.preview().source

        assert state.stale is False
        assert state.signals == ()
        assert state.comparable is True
        assert state.recorded_size_bytes == state.actual_size_bytes
        assert state.recorded_modified_at == state.actual_modified_at

    def test_a_source_of_a_different_size_reports_the_size_and_both_values(
        self, service, source: Path, db
    ):
        db.connect().execute("UPDATE library_source SET xml_size_bytes = 1")

        state = service.preview().source

        assert state.stale is True
        assert SIGNAL_SIZE in state.signals
        assert state.recorded_size_bytes == 1
        assert state.actual_size_bytes == len(SOURCE)

    def test_a_source_touched_since_the_import_reports_the_modified_time(
        self, service, db, source: Path
    ):
        db.connect().execute(
            "UPDATE library_source SET xml_modified_at = ?",
            ("2001-01-01T00:00:00+00:00",),
        )

        state = service.preview().source

        assert state.stale is True
        assert state.signals == (SIGNAL_MODIFIED,)
        assert state.recorded_modified_at == "2001-01-01T00:00:00+00:00"
        assert state.actual_modified_at != state.recorded_modified_at

    def test_a_source_that_differs_in_both_names_both(self, service, db):
        db.connect().execute(
            "UPDATE library_source SET xml_modified_at = ?, xml_size_bytes = ?",
            ("2001-01-01T00:00:00+00:00", 1),
        )

        state = service.preview().source

        assert state.signals == (SIGNAL_MODIFIED, SIGNAL_SIZE)

    def test_an_import_that_recorded_no_stat_says_it_cannot_tell(self, service, db):
        """``None`` is not "unchanged", and the difference decides what a user does."""
        db.connect().execute(
            "UPDATE library_source SET xml_modified_at = NULL, xml_size_bytes = NULL"
        )

        state = service.preview().source

        assert state.stale is None
        assert state.comparable is False
        assert state.signals == ()
        assert state.actual_size_bytes == len(SOURCE)

    def test_staleness_is_stat_only_and_reads_no_bytes_to_decide_it(
        self, service, sources, source: Path
    ):
        """DEC-082 chose the cheap comparison: nothing here hashes the file."""
        recorded = sources.get()
        assert recorded is not None
        state = service._source_state(recorded)

        assert state.actual_size_bytes == os.path.getsize(source)
        assert state.stale is False

    def test_a_stale_source_does_not_refuse_the_export(self, service, source: Path):
        """DEC-082's whole point: the difference is stated, and the export runs.

        The edit changes the file's length as well as its contents, because a
        same-length edit inside one filesystem timestamp tick is invisible to a
        ``stat`` — which is the cost DEC-082 accepted for not hashing a file
        that may be hundreds of megabytes."""
        source.write_bytes(SOURCE.replace(b'Tonality="Am"', b'Tonality="Bbm"'))

        preview = service.preview()

        assert preview.source.stale is True
        assert SIGNAL_SIZE in preview.source.signals
        assert preview.track_count == 4
        assert preview.fields_changed == {"key": 1}

    def test_the_reported_state_survives_serialization(self, service):
        payload = service.preview().to_dict()["source"]

        assert payload["stale"] is False
        assert payload["signals"] == []
        assert set(payload) == {
            "path",
            "stale",
            "signals",
            "recorded_modified_at",
            "actual_modified_at",
            "recorded_size_bytes",
            "actual_size_bytes",
        }


# -------------------------------------------------------- what would change (079)


@pytest.mark.unit
class TestWhatWouldChange:
    def test_a_library_nobody_has_overridden_changes_nothing(self, service):
        preview = service.preview()

        assert preview.changed_track_count == 0
        assert preview.fields_changed == {}
        assert preview.changed_fields == ()
        assert preview.changes_nothing is True

    def test_one_override_is_one_track_and_one_field(self, service, metadata, ids):
        metadata.set_override(ids["1"], "genre", "Minimal")

        preview = service.preview()

        assert preview.changed_track_count == 1
        assert preview.fields_changed == {"genre": 1}
        assert preview.changed_fields == ("genre",)
        assert preview.changes_nothing is False

    def test_a_track_with_no_override_contributes_nothing_beside_one_that_has(
        self, service, metadata, ids
    ):
        metadata.set_override(ids["2"], "label", "Hessle Audio")

        preview = service.preview()

        assert preview.changed_track_count == 1
        assert preview.fields_changed == {"label": 1}

    @pytest.mark.parametrize(
        ("field", "value"),
        (
            ("key", "Cm"),
            ("bpm", 130.5),
            ("genre", "Minimal"),
            ("label", "Perlon"),
            ("year", 2024),
        ),
    )
    def test_each_override_field_is_counted_under_its_own_name(
        self, service, metadata, ids, field, value
    ):
        metadata.set_override(ids["1"], field, value)

        preview = service.preview()

        assert preview.fields_changed == {field: 1}
        assert preview.changed_fields == (field,)

    def test_the_rating_is_the_sixth_field_and_has_its_own_resolver(
        self, service, metadata, ids
    ):
        metadata.set_rating(ids["1"], 5)

        preview = service.preview()

        assert preview.fields_changed == {"rating": 1}

    def test_zero_stars_in_cuepoint_is_a_change_from_a_rated_file(
        self, service, metadata, ids
    ):
        """DEC-034's distinction, carried into the export: 0 is a judgement."""
        metadata.set_rating(ids["1"], 0)

        preview = service.preview()

        assert preview.fields_changed == {"rating": 1}

    def test_an_override_equal_to_the_file_contributes_nothing(
        self, service, metadata, ids
    ):
        """The differs-only rule (DEC-079), from the side that is easy to get wrong."""
        metadata.set_override(ids["1"], "genre", "Techno")

        preview = service.preview()

        assert preview.changed_track_count == 0
        assert preview.fields_changed == {}

    def test_a_bpm_spelled_differently_is_the_same_bpm(self, service, metadata, ids):
        """``128`` and ``128.00`` are one value; neither is rewritten as the other."""
        metadata.set_override(ids["1"], "bpm", 128)

        preview = service.preview()

        assert preview.changed_track_count == 0

    def test_a_rating_the_file_spells_unusually_is_not_rewritten(
        self, service, source: Path
    ):
        """A ``Rating="3"`` some other tool wrote is three stars, not 153."""
        source.write_bytes(SOURCE.replace(b'Rating="102"', b'Rating="2"'))

        preview = service.preview()

        assert preview.changed_track_count == 0

    def test_several_fields_on_one_track_are_one_changed_track(
        self, service, metadata, ids
    ):
        metadata.set_override(ids["1"], "genre", "Minimal")
        metadata.set_override(ids["1"], "label", "Perlon")
        metadata.set_rating(ids["1"], 4)

        preview = service.preview()

        assert preview.changed_track_count == 1
        assert preview.fields_changed == {"genre": 1, "label": 1, "rating": 1}

    def test_one_field_on_several_tracks_is_counted_per_track(
        self, service, metadata, ids
    ):
        metadata.set_override(ids["1"], "genre", "Minimal")
        metadata.set_override(ids["2"], "genre", "Minimal")

        preview = service.preview()

        assert preview.changed_track_count == 2
        assert preview.fields_changed == {"genre": 2}

    def test_a_track_the_file_lacks_changes_nothing_in_it(self, service, metadata, ids):
        metadata.set_override(ids["4"], "genre", "Minimal")

        preview = service.preview()

        assert preview.changed_track_count == 0
        assert preview.absent_track_count == 1

    def test_the_reported_field_names_are_the_writers_own(self, service):
        assert [name for name, _attribute in EXPORT_FIELDS] == [
            "key",
            "bpm",
            "genre",
            "label",
            "year",
            "rating",
        ]

    def test_the_changed_fields_come_back_in_the_writers_order(
        self, service, metadata, ids
    ):
        metadata.set_rating(ids["1"], 5)
        metadata.set_override(ids["1"], "key", "Cm")
        metadata.set_override(ids["1"], "genre", "Minimal")

        assert service.preview().changed_fields == ("key", "genre", "rating")

    def test_the_plan_carries_every_track_not_only_the_overridden_ones(
        self, service, metadata, ids
    ):
        """DEC-079 exports the effective value of every track, which for most is
        the import's own. Sending only the overridden ones would leave a value
        corrected by a hand edit outside an override behind."""
        metadata.set_override(ids["1"], "genre", "Minimal")

        plan = service.plan()

        assert set(plan.updates) == {"1", "2", "3", "4"}


# ------------------------------------------------------- the key notation (089)


@pytest.mark.unit
class TestTheKeyNotation:
    def test_the_default_is_classic_and_is_reported(self, service):
        preview = service.preview()

        assert preview.key_format == DEFAULT_KEY_FORMAT
        assert DEFAULT_KEY_FORMAT in KEY_FORMATS

    @pytest.mark.parametrize("notation", KEY_FORMATS)
    def test_every_notation_the_vocabulary_holds_is_accepted(self, service, notation):
        preview = service.preview([], notation)

        assert preview.key_format == notation

    def test_a_notation_the_vocabulary_does_not_hold_is_refused(self, service):
        with pytest.raises(ValueError, match="key_format"):
            service.preview([], "boring")

    def test_camelot_rewrites_every_key_the_file_spells_classically(self, service):
        """The reason DEC-079 compares the key as text: parsed, ``Am`` is ``8A``."""
        preview = service.preview([], "camelot")

        assert preview.fields_changed == {"key": 3}
        assert preview.changed_track_count == 3

    def test_short_notation_rewrites_them_too(self, service):
        preview = service.preview([], "short")

        assert preview.fields_changed == {"key": 3}

    def test_classic_notation_rewrites_none_of_them(self, service):
        assert service.preview([], "normal").fields_changed == {}

    def test_the_rendered_key_is_the_converters_own(self, service, metadata, ids):
        plan = service.plan([], "camelot")

        for values in plan.updates.values():
            assert values.key is None or values.key[-1] in "AB"
        assert plan.updates["1"].key == key_text("Am", "camelot")[0]

    def test_a_key_the_converter_cannot_read_writes_nothing(self, service, db, ids):
        db.connect().execute(
            "UPDATE tracks SET key = ? WHERE id = ?", ("Open 1m", ids["1"])
        )

        plan = service.plan([], "camelot")

        assert plan.updates["1"].key is None

    def test_a_key_the_converter_cannot_read_is_not_counted_as_a_change(
        self, service, db, ids
    ):
        db.connect().execute(
            "UPDATE tracks SET key = ? WHERE id = ?", ("Open 1m", ids["1"])
        )

        preview = service.preview([], "normal")

        assert preview.fields_changed == {}

    def test_an_overridden_key_is_the_one_rendered(self, service, metadata, ids):
        metadata.set_override(ids["1"], "key", "Cm")

        plan = service.plan([], "camelot")

        assert plan.updates["1"].key == key_text("Cm", "camelot")[0]


# ------------------------------------------- what the two sides do not share (082)


@pytest.mark.unit
class TestTracksNeitherSideShares:
    def test_a_track_the_file_holds_and_cuepoint_does_not_is_counted(self, service):
        assert service.preview().unknown_track_count == 1

    def test_a_track_cuepoint_holds_and_the_file_does_not_is_counted(self, service):
        assert service.preview().absent_track_count == 1

    def test_the_two_counts_reconcile_the_file_with_the_library(self, service, tracks):
        preview = service.preview()

        library = tracks.count()
        assert preview.track_count - preview.unknown_track_count == (
            library - preview.absent_track_count
        )

    def test_the_track_count_is_the_files_own_because_the_file_is_what_is_written(
        self, service
    ):
        assert service.preview().track_count == 4

    def test_an_element_with_no_identity_at_all_counts_as_unknown(
        self, service, source: Path
    ):
        source.write_bytes(
            SOURCE.replace(
                b'<TRACK TrackID="99" Name="Stranger" Artist="Nobody" Tonality="Dm"/>',
                b'<TRACK Name="Anonymous" Artist="Nobody"/>',
            )
        )

        preview = service.preview()

        assert preview.unknown_track_count == 1
        assert preview.track_count == 4

    def test_the_two_counts_are_not_interchangeable(self, service, db):
        """Told apart with different numbers, because a fixture where they are
        equal is a fixture that cannot see them swapped."""
        db.connect().execute(
            "INSERT INTO tracks (rekordbox_track_id, file_path, normalized_path,"
            " title, artist, created_at, updated_at)"
            " VALUES ('5', '/m/five.mp3', '/m/five.mp3', 'Five', 'E', ?, ?)",
            (utc_now_iso(), utc_now_iso()),
        )

        preview = service.preview()

        assert preview.unknown_track_count == 1
        assert preview.absent_track_count == 2
        assert preview.track_count == 4

    def test_the_track_count_is_the_files_own_not_the_librarys(self, service, db):
        """A library larger than the file does not make the exported file larger."""
        db.connect().execute(
            "INSERT INTO tracks (rekordbox_track_id, file_path, normalized_path,"
            " title, artist, created_at, updated_at)"
            " VALUES ('5', '/m/five.mp3', '/m/five.mp3', 'Five', 'E', ?, ?)",
            (utc_now_iso(), utc_now_iso()),
        )

        plan = service.plan()

        assert len(plan.updates) == 5
        assert service.preview_of(plan).track_count == 4

    def test_a_source_that_holds_one_track_twice_counts_the_track_once(
        self, service, metadata, ids, source: Path
    ):
        """Rekordbox writes each track once; a hand-edited file may not. The
        count a user reads is tracks, so two elements for one id is one changed
        track and two rewritten start tags."""
        source.write_bytes(
            SOURCE.replace(
                b'<TRACK TrackID="3" Name="Three" Artist="C" Tonality="Gm"'
                b' AverageBpm="90.00"/>',
                b'<TRACK TrackID="3" Name="Three" Artist="C" Tonality="Gm"'
                b' AverageBpm="90.00"/>\n'
                b'    <TRACK TrackID="3" Name="Three again" Artist="C"'
                b' Tonality="Gm" AverageBpm="90.00"/>',
            )
        )
        metadata.set_override(ids["3"], "genre", "Minimal")

        plan = service.plan()
        preview = service.preview_of(plan)

        import cuepoint.data.rekordbox_export as writer

        result = writer.plan_collection_xml(plan.source_path, plan.updates)
        assert result.elements_patched == 2
        assert preview.changed_track_count == 1
        assert preview.fields_changed == {"genre": 1}

    def test_a_library_matching_the_file_exactly_shares_everything(
        self, service, db, ids
    ):
        db.connect().execute("DELETE FROM tracks WHERE rekordbox_track_id = '4'")
        db.connect().execute(
            "INSERT INTO tracks (rekordbox_track_id, file_path, normalized_path,"
            " title, artist, created_at, updated_at)"
            " VALUES ('99', '/m/99.mp3', '/m/99.mp3', 'Stranger', 'Nobody', ?, ?)",
            (utc_now_iso(), utc_now_iso()),
        )

        preview = service.preview()

        assert preview.unknown_track_count == 0
        assert preview.absent_track_count == 0


# ------------------------------------------------ missing files, counted (088)


@pytest.mark.unit
class TestMissingFilesAreStatedNotAssumed:
    def test_a_library_nobody_has_checked_says_so_rather_than_saying_zero(
        self, service
    ):
        preview = service.preview()

        assert preview.missing_file_count is None
        assert preview.file_check_known is False

    def test_a_checked_library_with_nothing_missing_reports_zero(
        self, service, files, ids
    ):
        files.record(
            [
                TrackFileStatus(
                    track_id=ids["1"],
                    status=FILE_PRESENT,
                    checked_path="/m/one.mp3",
                    size_bytes=1,
                    checked_at=utc_now_iso(),
                )
            ]
        )

        preview = service.preview()

        assert preview.missing_file_count == 0
        assert preview.file_check_known is True

    def test_a_missing_file_is_counted(self, service, files, ids):
        files.record(
            [
                TrackFileStatus(
                    track_id=ids["1"],
                    status=FILE_MISSING,
                    checked_path="/m/one.mp3",
                    checked_at=utc_now_iso(),
                ),
                TrackFileStatus(
                    track_id=ids["2"],
                    status=FILE_PRESENT,
                    checked_path="/m/two.mp3",
                    size_bytes=1,
                    checked_at=utc_now_iso(),
                ),
            ]
        )

        assert service.preview().missing_file_count == 1

    def test_a_track_whose_file_is_gone_is_still_exported(
        self, service, files, ids, collection_service, tmp_path: Path
    ):
        """DEC-088: "the file is gone" and "the XML has no such track" are
        different facts, and only the second can produce a dangling reference."""
        files.record(
            [
                TrackFileStatus(
                    track_id=ids["1"],
                    status=FILE_MISSING,
                    checked_path="/m/one.mp3",
                    checked_at=utc_now_iso(),
                )
            ]
        )
        node = collection_service.create_collection("Gone")
        collection_service.add_tracks(node.id, [ids["1"]])

        preview = service.preview([int(node.id)])

        assert preview.playlists[0].entry_count == 1
        assert preview.playlists[0].dropped_count == 0
        assert preview.missing_file_count == 1

    def test_none_is_not_zero_in_the_payload_either(self, service):
        payload = service.preview().to_dict()

        assert payload["missing_file_count"] is None
        assert payload["file_check_known"] is False


# ------------------------------------------------ the playlists (058, 059, 081)


@pytest.mark.unit
class TestThePlaylistsThatWouldBeWritten:
    def test_choosing_nothing_appends_nothing_and_makes_no_folder(self, service, tree):
        preview = service.preview()

        assert preview.playlists == ()
        assert preview.playlist_folder is None
        assert preview.playlist_folder_renamed is False

    def test_a_collection_exports_at_the_path_it_is_filed_under(self, service, tree):
        preview = service.preview([tree["saturday"]])

        assert paths_of(preview) == [f"{CUEPOINT_FOLDER_NAME}/Gigs/Saturday"]

    def test_a_folder_stands_for_everything_beneath_it_at_any_depth(
        self, service, tree
    ):
        preview = service.preview([tree["gigs"]])

        assert paths_of(preview) == [
            f"{CUEPOINT_FOLDER_NAME}/Gigs/Saturday",
            f"{CUEPOINT_FOLDER_NAME}/Gigs/2026/Summer",
        ]

    def test_a_folder_nobody_chose_is_not_written(self, service, tree):
        preview = service.preview([tree["gigs"]])

        assert not any("Archive" in path for path in paths_of(preview))
        assert not any(path.endswith("/Loose") for path in paths_of(preview))

    def test_a_collection_at_the_top_level_exports_directly_under_the_folder(
        self, service, tree
    ):
        preview = service.preview([tree["loose"]])

        assert paths_of(preview) == [f"{CUEPOINT_FOLDER_NAME}/Loose"]

    def test_the_same_node_named_twice_is_exported_once(self, service, tree):
        preview = service.preview([tree["saturday"], tree["saturday"]])

        assert len(preview.playlists) == 1

    def test_a_node_named_directly_and_through_its_folder_is_exported_once(
        self, service, tree
    ):
        preview = service.preview([tree["gigs"], tree["saturday"]])

        assert len(preview.playlists) == 2

    def test_an_empty_folder_brings_nothing_and_creates_no_node(
        self, service, collection_service
    ):
        empty = collection_service.create_folder("Empty")

        preview = service.preview([int(empty.id)])

        assert preview.playlists == ()
        assert preview.playlist_folder is None

    def test_a_folder_of_folders_with_nothing_in_them_creates_nothing(
        self, service, collection_service
    ):
        outer = collection_service.create_folder("Outer")
        collection_service.create_folder("Inner", outer.id)

        assert service.preview([int(outer.id)]).playlists == ()

    def test_an_empty_collection_exports_as_an_empty_playlist(
        self, service, collection_service
    ):
        """A user who selected it said something (EXPORT-02)."""
        node = collection_service.create_collection("Nothing yet")

        preview = service.preview([int(node.id)])

        assert len(preview.playlists) == 1
        assert preview.playlists[0].entry_count == 0
        assert preview.playlist_folder == CUEPOINT_FOLDER_NAME

    def test_an_id_that_names_no_node_is_refused_rather_than_skipped(self, service):
        with pytest.raises(ValueError, match="No such collection"):
            service.preview([4242])

    def test_each_playlist_is_reported_against_the_node_it_came_from(
        self, service, tree
    ):
        preview = service.preview([tree["gigs"]])

        assert [playlist.collection_id for playlist in preview.playlists] == [
            tree["saturday"],
            tree["summer"],
        ]
        assert {playlist.kind for playlist in preview.playlists} == {KIND_COLLECTION}

    def test_two_collections_of_the_same_name_are_told_apart_by_their_node(
        self, service, collection_service, ids
    ):
        """Why the writer echoes a ``ref`` rather than matching on a name."""
        first = collection_service.create_folder("A")
        second = collection_service.create_folder("B")
        left = collection_service.create_collection("Warmups", first.id)
        right = collection_service.create_collection("Warmups", second.id)
        collection_service.add_tracks(left.id, [ids["1"]])
        collection_service.add_tracks(right.id, [ids["2"], ids["3"]])

        preview = service.preview([int(first.id), int(second.id)])

        reported = {
            playlist.collection_id: playlist.entry_count
            for playlist in preview.playlists
        }
        assert reported == {int(left.id): 1, int(right.id): 2}

    def test_the_entries_are_the_collections_own_order(
        self, service, collection_service, ids, tmp_path: Path
    ):
        node = collection_service.create_collection("Ordered")
        collection_service.add_tracks(node.id, [ids["3"], ids["1"], ids["2"]])
        plan = service.plan([int(node.id)])

        destination = tmp_path / "ordered.xml"
        patch_collection_xml(
            plan.source_path, plan.updates, str(destination), plan.playlists
        )

        assert entries_of(destination, "Ordered") == ["3", "1", "2"]

    def test_a_repeated_track_exports_twice(
        self, service, collections, collection_service, ids, tmp_path: Path
    ):
        """DEC-058: a closing reprise is two entries pointing at one TrackID."""
        node = collection_service.create_collection("Reprise")
        collection_service.add_tracks(node.id, [ids["1"], ids["2"]])
        collections.insert_at(int(node.id), ids["1"], 2)

        preview = service.preview([int(node.id)])
        plan = service.plan([int(node.id)])
        destination = tmp_path / "reprise.xml"
        patch_collection_xml(
            plan.source_path, plan.updates, str(destination), plan.playlists
        )

        assert preview.playlists[0].entry_count == 3
        assert entries_of(destination, "Reprise") == ["1", "2", "1"]

    def test_a_track_the_file_lacks_is_dropped_and_counted(
        self, service, collection_service, ids
    ):
        node = collection_service.create_collection("Half there")
        collection_service.add_tracks(node.id, [ids["1"], ids["4"]])

        preview = service.preview([int(node.id)])

        assert preview.playlists[0].entry_count == 1
        assert preview.playlists[0].dropped_count == 1
        assert preview.playlists[0].requested_count == 2
        assert preview.dropped_reference_count == 1

    def test_a_dropped_reference_is_counted_once_per_appearance(
        self, service, collections, collection_service, ids
    ):
        """DEC-082's amendment: a track filed twice costs the playlist two entries."""
        node = collection_service.create_collection("Twice missing")
        collection_service.add_tracks(node.id, [ids["4"]])
        collections.insert_at(int(node.id), ids["4"], 1)

        preview = service.preview([int(node.id)])

        assert preview.playlists[0].dropped_count == 2
        assert preview.playlists[0].entry_count == 0
        assert preview.playlists[0].requested_count == 2

    def test_drops_across_playlists_are_summed(self, service, collection_service, ids):
        one = collection_service.create_collection("One")
        two = collection_service.create_collection("Two")
        collection_service.add_tracks(one.id, [ids["4"]])
        collection_service.add_tracks(two.id, [ids["1"], ids["4"]])

        preview = service.preview([int(one.id), int(two.id)])

        assert preview.dropped_reference_count == 2

    def test_an_existing_cuepoint_folder_is_renamed_and_the_collision_reported(
        self, service, source: Path, collection_service, ids
    ):
        source.write_bytes(
            SOURCE.replace(
                b'<NODE Type="0" Name="ROOT" Count="0"/>',
                b'<NODE Type="0" Name="ROOT" Count="1">'
                b'<NODE Type="0" Name="CuePoint" Count="0"/>'
                b"</NODE>",
            )
        )
        node = collection_service.create_collection("Mine")
        collection_service.add_tracks(node.id, [ids["1"]])

        preview = service.preview([int(node.id)])

        assert preview.playlist_folder == "CuePoint (2)"
        assert preview.playlist_folder_renamed is True
        assert paths_of(preview) == ["CuePoint (2)/Mine"]

    def test_the_payload_carries_each_playlist_and_its_arithmetic(
        self, service, collection_service, ids
    ):
        node = collection_service.create_collection("Reported")
        collection_service.add_tracks(node.id, [ids["1"], ids["4"]])

        payload = service.preview([int(node.id)]).to_dict()

        assert payload["playlists"] == [
            {
                "collection_id": int(node.id),
                "kind": KIND_COLLECTION,
                "name": "Reported",
                "path": f"{CUEPOINT_FOLDER_NAME}/Reported",
                "entry_count": 1,
                "dropped_count": 1,
                "requested_count": 2,
            }
        ]


# --------------------------------------------------- smart collections (061, 081)


@pytest.mark.unit
class TestASmartCollectionExportsItsMembership:
    def test_its_entry_count_equals_what_the_library_browses(
        self, service, collection_service, tracks
    ):
        """The same query the Library table runs, so the screen and the exported
        playlist cannot report different numbers of tracks."""
        smart = collection_service.create_smart(
            "Not fast", RuleSet(rules=(FilterRule("bpm", "lte", 130),))
        )
        query = collection_service.resolve(int(smart.id)).require_query()

        preview = service.preview([int(smart.id)])

        assert preview.playlists[0].entry_count == len(tracks.browse_ids(query))
        assert preview.playlists[0].dropped_count == 0

    def test_a_member_the_file_lacks_is_the_only_reason_the_counts_differ(
        self, service, collection_service, tracks
    ):
        smart = collection_service.create_smart(
            "Fast", RuleSet(rules=(FilterRule("bpm", "gte", 124),))
        )
        query = collection_service.resolve(int(smart.id)).require_query()

        preview = service.preview([int(smart.id)])

        assert preview.playlists[0].requested_count == len(tracks.browse_ids(query))
        assert preview.playlists[0].dropped_count == 1

    def test_it_is_reported_as_smart(self, service, collection_service):
        smart = collection_service.create_smart(
            "Fast", RuleSet(rules=(FilterRule("bpm", "gte", 124),))
        )

        preview = service.preview([int(smart.id)])

        assert preview.playlists[0].kind == KIND_SMART
        assert preview.playlists[0].collection_id == int(smart.id)

    def test_it_exports_in_the_sort_it_was_saved_with(
        self, service, collection_service, tracks, tmp_path: Path
    ):
        smart = collection_service.create_smart(
            "By bpm",
            RuleSet(rules=(FilterRule("bpm", "gte", 90),)),
            sort="bpm",
            direction="desc",
        )
        plan = service.plan([int(smart.id)])
        destination = tmp_path / "smart.xml"
        patch_collection_xml(
            plan.source_path, plan.updates, str(destination), plan.playlists
        )

        assert entries_of(destination, "By bpm") == ["1", "2", "3"]

    def test_a_member_the_file_lacks_is_dropped_and_counted(
        self, service, collection_service
    ):
        smart = collection_service.create_smart(
            "Very fast", RuleSet(rules=(FilterRule("bpm", "gte", 140),))
        )

        preview = service.preview([int(smart.id)])

        assert preview.playlists[0].entry_count == 0
        assert preview.playlists[0].dropped_count == 1

    def test_a_smart_collection_matching_nothing_exports_as_an_empty_playlist(
        self, service, collection_service
    ):
        smart = collection_service.create_smart(
            "Impossible", RuleSet(rules=(FilterRule("bpm", "gte", 400),))
        )

        preview = service.preview([int(smart.id)])

        assert preview.playlists[0].entry_count == 0

    def test_a_smart_collection_whose_rules_cannot_run_refuses_by_name(
        self, service, collection_service, db
    ):
        smart = collection_service.create_smart(
            "Fast", RuleSet(rules=(FilterRule("bpm", "gte", 124),))
        )
        db.connect().execute(
            "UPDATE collections SET rules_json = ? WHERE id = ?",
            ('{"rules": [{"field": "nonsense", "op": "eq", "value": 1}]}', smart.id),
        )

        with pytest.raises(ValueError):
            service.preview([int(smart.id)])

    def test_membership_is_read_in_pages_so_a_large_one_is_not_truncated(
        self, service, collection_service, monkeypatch: pytest.MonkeyPatch, tracks
    ):
        import cuepoint.services.rekordbox_export_service as module

        monkeypatch.setattr(module, "SMART_PAGE_SIZE", 1)
        smart = collection_service.create_smart(
            "Everything fast", RuleSet(rules=(FilterRule("bpm", "gte", 90),))
        )

        preview = service.preview([int(smart.id)])

        assert preview.playlists[0].requested_count == 4
        assert SMART_PAGE_SIZE > 1

    def test_a_folder_holding_a_smart_collection_brings_it_too(
        self, service, collection_service
    ):
        folder = collection_service.create_folder("Saved")
        collection_service.create_smart(
            "Fast", RuleSet(rules=(FilterRule("bpm", "gte", 124),)), folder.id
        )

        preview = service.preview([int(folder.id)])

        assert paths_of(preview) == [f"{CUEPOINT_FOLDER_NAME}/Saved/Fast"]


# ------------------------------------------------- the anti-drift property (084)


@pytest.mark.unit
class TestThePreviewCannotDisagreeWithTheExport:
    def test_the_preview_and_a_real_export_report_the_same_result(
        self, service, metadata, ids, tree, tmp_path: Path
    ):
        """DEC-084's promise, asserted rather than designed for and hoped about."""
        metadata.set_override(ids["1"], "genre", "Minimal")
        metadata.set_rating(ids["2"], 5)
        plan = service.plan([tree["gigs"], tree["loose"]], "camelot")

        previewed = service.preview_of(plan)
        written = patch_collection_xml(
            plan.source_path,
            plan.updates,
            str(tmp_path / "export.xml"),
            plan.playlists,
        )

        assert service.report(plan, written) == previewed

    def test_the_two_walks_produce_the_same_counts_field_by_field(
        self, service, metadata, ids, tree, tmp_path: Path
    ):
        import cuepoint.data.rekordbox_export as writer

        metadata.set_override(ids["1"], "label", "Perlon")
        plan = service.plan([tree["gigs"]], "short")

        planned = writer.plan_collection_xml(
            plan.source_path, plan.updates, plan.playlists
        )
        written = patch_collection_xml(
            plan.source_path,
            plan.updates,
            str(tmp_path / "export.xml"),
            plan.playlists,
        )

        assert planned == written

    def test_the_preview_writes_no_file_anywhere(
        self, service, tree, tmp_path: Path, source: Path
    ):
        before = sorted(path.name for path in tmp_path.iterdir())

        service.preview([tree["gigs"]])

        assert sorted(path.name for path in tmp_path.iterdir()) == before

    def test_the_preview_does_not_touch_the_source(self, service, tree, source: Path):
        service.preview([tree["gigs"]])

        assert source.read_bytes() == SOURCE

    def test_two_previews_of_the_same_scope_agree(self, service, tree):
        assert service.preview([tree["gigs"]]) == service.preview([tree["gigs"]])

    def test_the_exported_file_holds_the_playlists_the_preview_promised(
        self, service, tree, tmp_path: Path
    ):
        plan = service.plan([tree["gigs"], tree["loose"]])
        previewed = service.preview_of(plan)
        destination = tmp_path / "export.xml"
        patch_collection_xml(
            plan.source_path, plan.updates, str(destination), plan.playlists
        )

        written = {
            node.name: node.track_count
            for node in iter_playlist_nodes(str(destination))
            if node.kind == KIND_PLAYLIST
        }

        for playlist in previewed.playlists:
            assert written[playlist.name] == playlist.entry_count

    def test_reporting_the_same_plan_twice_gives_the_same_answer(
        self, service, tree, tmp_path: Path
    ):
        plan = service.plan([tree["saturday"]])

        assert service.preview_of(plan) == service.preview_of(plan)


# ------------------------------------------------------- the value layers (079)


@pytest.mark.unit
class TestTheValueLayers:
    def test_the_export_resolves_what_the_browse_vocabulary_resolves(
        self, db, tracks, metadata, ids
    ):
        """One rule, two readers. A second implementation would show a user one
        value in the table and write another into their Rekordbox file."""
        metadata.set_override(ids["1"], "genre", "Minimal")
        metadata.set_override(ids["2"], "bpm", 126.5)
        metadata.set_rating(ids["3"], 4)
        columns = ", ".join(
            f"{field_spec(name).expression} AS {name}"
            for name in ("key", "bpm", "genre", "label", "year", "rating")
        )
        rows = {
            int(row["id"]): dict(row)
            for row in db.connect().execute(
                f"SELECT tracks.id AS id, {columns} FROM tracks{JOINS['meta']}"
            )
        }

        for values in tracks.iter_export_values():
            row = rows[values.track_id]
            assert values.effective_key == row["key"]
            assert values.effective_bpm == row["bpm"]
            assert values.effective_genre == row["genre"]
            assert values.effective_label == row["label"]
            assert values.effective_year == row["year"]
            assert values.effective_stars == row["rating"]

    def test_the_model_calls_the_one_resolver_rather_than_holding_a_second(self):
        """Identity, not text: the two names here are the two in
        ``track_metadata``, so a copy of the rule cannot hide behind them."""
        import cuepoint.models.rekordbox_export_values as module
        from cuepoint.models import track_metadata

        assert module.effective_value is track_metadata.effective_value
        assert module.effective_rating is track_metadata.effective_rating

    def test_the_model_imports_from_no_layer_but_its_own(self):
        """Why the notation is rendered a layer up: every model in the package
        imports from ``cuepoint.models`` and from nowhere else."""
        import re

        import cuepoint.models.rekordbox_export_values as module

        source = Path(module.__file__).read_text(encoding="utf-8")
        imported = re.findall(r"^from (cuepoint[.\w]*) import", source, re.MULTILINE)

        assert imported, "the model imports nothing from cuepoint at all"
        assert {name.split(".")[1] for name in imported} == {"models"}

    def test_an_override_wins_and_the_import_shows_through(self):
        values = ExportTrackValues(
            track_id=1,
            rekordbox_track_id="1",
            key="Am",
            genre="Techno",
            override_genre="Minimal",
        )

        assert values.effective_genre == "Minimal"
        assert values.effective_key == "Am"

    def test_a_cuepoint_rating_of_zero_wins_over_the_imported_one(self):
        values = ExportTrackValues(
            track_id=1, rekordbox_track_id="1", rating=3, cuepoint_rating=0
        )

        assert values.effective_stars == 0

    def test_no_rating_in_either_layer_is_no_rating(self):
        values = ExportTrackValues(track_id=1, rekordbox_track_id="1")

        assert values.effective_stars is None

    @pytest.mark.parametrize("identity", (None, "", "   "))
    def test_a_row_the_export_could_not_key_on_is_refused(self, identity):
        with pytest.raises(ValueError, match="rekordbox_track_id"):
            ExportTrackValues(track_id=1, rekordbox_track_id=identity)

    def test_a_row_with_no_track_id_is_refused(self):
        with pytest.raises(ValueError, match="track_id"):
            ExportTrackValues(track_id=None, rekordbox_track_id="1")

    def test_the_named_columns_are_the_ones_the_query_selects(self, db, tracks):
        row = (
            db.connect()
            .execute(
                "SELECT tracks.id AS id, tracks.rekordbox_track_id AS"
                " rekordbox_track_id, tracks.key AS key, tracks.bpm AS bpm,"
                " tracks.genre AS genre, tracks.label AS label,"
                " tracks.year AS year, tracks.rating AS rating,"
                " track_metadata.key AS override_key,"
                " track_metadata.bpm AS override_bpm,"
                " track_metadata.genre AS override_genre,"
                " track_metadata.label AS override_label,"
                " track_metadata.year AS override_year,"
                " track_metadata.rating AS cuepoint_rating"
                " FROM tracks LEFT JOIN track_metadata"
                " ON track_metadata.track_id = tracks.id LIMIT 1"
            )
            .fetchone()
        )

        assert set(dict(row)) == set(EXPORT_VALUE_COLUMNS)


# ---------------------------------------------------------------- the two reads


@pytest.mark.unit
class TestTheReadsTheExportAdded:
    def test_every_track_is_streamed_once_in_id_order(self, tracks, ids):
        streamed = list(tracks.iter_export_values())

        assert [values.track_id for values in streamed] == sorted(ids.values())
        assert [values.rekordbox_track_id for values in streamed] == [
            "1",
            "2",
            "3",
            "4",
        ]

    def test_a_track_nobody_has_touched_arrives_with_no_overrides(self, tracks):
        values = next(iter(tracks.iter_export_values()))

        assert values.override_key is None
        assert values.override_bpm is None
        assert values.override_genre is None
        assert values.override_label is None
        assert values.override_year is None
        assert values.cuepoint_rating is None

    def test_an_override_arrives_beside_the_imported_value(self, tracks, metadata, ids):
        metadata.set_override(ids["1"], "genre", "Minimal")

        found = {values.track_id: values for values in tracks.iter_export_values()}[
            ids["1"]
        ]

        assert found.genre == "Techno"
        assert found.override_genre == "Minimal"

    @pytest.mark.parametrize("batch", (1, 2, 3, 1000))
    def test_the_batch_size_does_not_change_what_is_read(self, tracks, batch):
        streamed = [
            values.rekordbox_track_id
            for values in tracks.iter_export_values(batch_size=batch)
        ]

        assert streamed == ["1", "2", "3", "4"]

    def test_an_empty_library_streams_nothing(self, db):
        assert list(TrackRepository(db).iter_export_values()) == []

    def test_a_library_nobody_checked_has_no_missing_count(self, files):
        assert files.missing_count() is None

    def test_a_checked_library_counts_what_is_missing(self, files, ids):
        files.record(
            [
                TrackFileStatus(
                    track_id=ids[name],
                    status=FILE_MISSING,
                    checked_path=f"/m/{name}.mp3",
                    checked_at=utc_now_iso(),
                )
                for name in ("1", "2")
            ]
        )

        assert files.missing_count() == 2

    def test_a_checked_library_with_everything_present_counts_zero(self, files, ids):
        files.record(
            [
                TrackFileStatus(
                    track_id=ids["1"],
                    status=FILE_PRESENT,
                    checked_path="/m/one.mp3",
                    size_bytes=1,
                    checked_at=utc_now_iso(),
                )
            ]
        )

        assert files.missing_count() == 0

    def test_a_later_check_replaces_an_earlier_one(self, files, ids):
        files.record(
            [
                TrackFileStatus(
                    track_id=ids["1"],
                    status=FILE_MISSING,
                    checked_path="/m/one.mp3",
                    checked_at=utc_now_iso(),
                )
            ]
        )
        files.record(
            [
                TrackFileStatus(
                    track_id=ids["1"],
                    status=FILE_PRESENT,
                    checked_path="/m/one.mp3",
                    size_bytes=1,
                    checked_at=utc_now_iso(),
                )
            ]
        )

        assert files.missing_count() == 0


# ------------------------------------------------------------------- the plan


@pytest.mark.unit
class TestThePlanIsWhatTheWriteNeeds:
    def test_it_carries_the_source_the_notation_and_the_tree(self, service, tree):
        plan = service.plan([tree["saturday"]], "camelot")

        assert plan.source_path.endswith("collection.xml")
        assert plan.key_format == "camelot"
        assert plan.source.stale is False
        assert len(plan.playlists) == 1

    def test_it_maps_each_written_playlist_back_to_its_node(self, service, tree):
        plan = service.plan([tree["gigs"]])

        assert set(plan.collections) == {
            str(tree["saturday"]),
            str(tree["summer"]),
        }

    def test_it_carries_what_the_last_file_check_found(self, service, files, ids):
        files.record(
            [
                TrackFileStatus(
                    track_id=ids["1"],
                    status=FILE_MISSING,
                    checked_path="/m/one.mp3",
                    checked_at=utc_now_iso(),
                )
            ]
        )

        assert service.plan().missing_file_count == 1

    def test_it_writes_nothing_and_needs_no_destination(self, service, tree, tmp_path):
        before = sorted(path.name for path in tmp_path.iterdir())

        service.plan([tree["gigs"]])

        assert sorted(path.name for path in tmp_path.iterdir()) == before

    def test_a_plan_with_no_playlists_holds_an_empty_tree_not_none(self, service):
        plan = service.plan()

        assert plan.playlists == ()
        assert plan.collections == {}


# ------------------------------------------------------------ nothing is wired


@pytest.mark.unit
class TestWhatReachesIt:
    def test_only_the_job_and_the_routes_name_the_service(self):
        """EXPORT-05's job and EXPORT-06's routes are its callers; EXPORT-07
        reaches it through those routes, never directly. A caller appearing by
        accident is worth failing on rather than reviewing for."""
        import re

        package = Path(__file__).resolve().parents[4] / "cuepoint"
        named = re.compile(r"\bI?RekordboxExportService\b")
        callers = sorted(
            path.relative_to(package).as_posix()
            for path in package.rglob("*.py")
            if named.search(path.read_text(encoding="utf-8"))
        )

        assert callers == [
            "engine/rekordbox_export_api.py",
            "engine/rekordbox_export_jobs.py",
            "services/bootstrap.py",
            "services/interfaces.py",
            "services/rekordbox_export_service.py",
        ]

    def test_the_service_is_registered_under_its_interface(self):
        import inspect

        from cuepoint.services import bootstrap

        source = inspect.getsource(bootstrap)

        assert "IRekordboxExportService, create_rekordbox_export_service" in source

    def test_the_source_state_is_the_only_thing_that_reads_the_file_at_plan_time(
        self, service, sources
    ):
        """A plan opens the source once to prove it can be read, and does not
        parse it: parsing is the preview's cost, and DEC-084 keeps it out of the
        cheap call."""
        plan = service.plan()

        assert plan.source.actual_size_bytes == len(SOURCE)
        assert plan.updates
