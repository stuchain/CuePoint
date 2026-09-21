#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Writing an export and recording how it ended (EXPORT-05).

DEC-083, DEC-084, DEC-085, DEC-086.

Four risks, each with its tests:

**The export writes somewhere it must not.** The source is refused through the
writer's own comparison, and so is anything that is not an ``.xml`` file, a
folder, or a path in a folder that does not exist — the last two because a path
from a save dialog can be neither, and the first because a destination ending in
``.mp3`` would replace somebody's audio file. A refusal records nothing.

**A stopped or failed export leaves something behind.** Cancelled at each phase
and failed at the write, with a previous export already at the destination, the
destination is asserted byte for byte afterwards and the folder for temp files.

**The record says something that did not happen.** A written export has one row,
its playlists and one event; a cancelled or failed one has one row, no playlists
and no event. The row and the event commit together or not at all.

**The row disagrees with the preview.** EXPORT-04's anti-drift property from the
other side: the numbers an export records are the numbers its preview promised.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import List, Tuple

import pytest

from cuepoint.data.rekordbox import iter_collection_tracks, iter_playlist_nodes
from cuepoint.data.rekordbox_export import PHASE_PLAYLISTS, PHASE_TRACKS
from cuepoint.exceptions.cuepoint_exceptions import ValidationError
from cuepoint.models.collection import KIND_COLLECTION, KIND_SMART
from cuepoint.models.file_status import FILE_MISSING, TrackFileStatus
from cuepoint.models.filter_rule import FilterRule, FilterRuleError, RuleSet
from cuepoint.models.library_track import utc_now_iso
from cuepoint.models.rekordbox_export import (
    EXPORT_CANCELLED,
    EXPORT_FAILED,
    EXPORT_WRITTEN,
)
from cuepoint.models.rekordbox_playlist import KIND_PLAYLIST
from cuepoint.persistence.rekordbox_export_repository import RekordboxExportRepository
from cuepoint.services.rekordbox_export_service import (
    DESTINATION_BLANK,
    DESTINATION_FOLDER_MISSING,
    DESTINATION_IS_FOLDER,
    DESTINATION_IS_SOURCE,
    DESTINATION_NOT_XML,
    DESTINATION_REFUSALS,
    EVENT_REKORDBOX_EXPORTED,
    SOURCE_MISSING,
    SOURCE_NEVER_IMPORTED,
    ExportDestinationError,
    ExportSourceError,
)

# The preview's library, source file and fixtures are this file's too (see
# conftest.py): the export is the preview with the write kept, and the two are
# only comparable over the same data.
from .library import SOURCE

pytestmark = pytest.mark.unit

#: A previous export already at the destination, which a stopped or failed
#: export must leave exactly as it was.
EARLIER = b"<an earlier export, which must survive untouched/>"


@pytest.fixture()
def out(tmp_path: Path) -> Path:
    folder = tmp_path / "exports"
    folder.mkdir()
    return folder


@pytest.fixture()
def destination(out: Path) -> Path:
    return out / "CuePoint Export.xml"


@pytest.fixture()
def exports(db) -> RekordboxExportRepository:
    return RekordboxExportRepository(db)


def events(db) -> List[dict]:
    rows = db.connect().execute(
        "SELECT type, summary, detail_json FROM activity_events"
        " WHERE type = ? ORDER BY id",
        (EVENT_REKORDBOX_EXPORTED,),
    )
    return [
        {
            "type": row["type"],
            "summary": row["summary"],
            "detail": json.loads(row["detail_json"] or "{}"),
        }
        for row in rows
    ]


def rows(db, table: str) -> int:
    return int(db.connect().execute(f"SELECT count(*) FROM {table}").fetchone()[0])


def leftovers(folder: Path, keep: str) -> List[str]:
    return sorted(path.name for path in folder.iterdir() if path.name != keep)


def stop_after(asked: int):
    count = [0]

    def should_cancel() -> bool:
        count[0] += 1
        return count[0] >= asked

    return should_cancel


# -------------------------------------------------------------- a full export


class TestAFullExport:
    def test_it_writes_the_file_one_row_its_playlists_and_one_event(
        self, service, db, exports, tree, destination: Path
    ):
        ended = service.export(
            [tree["gigs"]], "normal", str(destination), job_id="job-1"
        )

        assert destination.exists()
        assert ended.written and ended.outcome == EXPORT_WRITTEN
        assert rows(db, "rekordbox_exports") == 1
        assert rows(db, "rekordbox_export_playlists") == 2
        assert len(events(db)) == 1
        stored = exports.for_job("job-1")
        assert stored == ended.record
        assert [p.name for p in exports.playlists_for(int(stored.id))] == [
            "Saturday",
            "Summer",
        ]

    def test_the_file_is_a_collection_rekordbox_can_read_back(
        self, service, tree, destination: Path
    ):
        service.export([tree["gigs"]], "normal", str(destination))

        tracks = list(iter_collection_tracks(str(destination)))
        playlists = {
            node.name: node.track_refs
            for node in iter_playlist_nodes(str(destination))
            if node.kind == KIND_PLAYLIST
        }
        assert len(tracks) == 4
        assert playlists == {"Saturday": ["1", "2"], "Summer": ["3"]}

    def test_cue_points_and_the_grid_survive(self, service, tree, destination: Path):
        service.export([tree["gigs"]], "camelot", str(destination))

        written = destination.read_bytes()
        assert (
            b'<TEMPO Inizio="0.025" Bpm="128.00" Metro="4/4" Battito="1"/>' in written
        )
        assert (
            b'<POSITION_MARK Name="Intro" Type="0" Start="0.025" Num="-1"/>' in written
        )

    def test_the_row_records_what_was_written(
        self, service, metadata, ids, tree, destination: Path
    ):
        metadata.set_override(ids["1"], "genre", "Minimal")
        metadata.set_rating(ids["2"], 5)

        record = service.export(
            [tree["gigs"]], "camelot", str(destination), job_id="j"
        ).record

        assert record.outcome == EXPORT_WRITTEN
        assert record.job_id == "j"
        assert record.destination_path == str(destination)
        assert record.source_path.endswith("collection.xml")
        assert record.source_stale is False
        assert record.track_count == 4
        assert record.changed_track_count == 3
        assert record.fields == ("key", "genre", "rating")
        assert record.key_format == "camelot"
        assert record.missing_file_count is None
        assert record.dropped_reference_count == 0
        assert record.error is None
        assert record.finished_at is not None
        assert record.started_at <= record.finished_at

    def test_the_row_carries_the_numbers_the_preview_promised(
        self, service, metadata, ids, tree, destination: Path
    ):
        """EXPORT-04's anti-drift test, from the other side."""
        metadata.set_override(ids["3"], "label", "Perlon")
        promised = service.preview([tree["gigs"], tree["loose"]], "short")

        ended = service.export([tree["gigs"], tree["loose"]], "short", str(destination))

        assert ended.report == promised
        record = ended.record
        assert record.track_count == promised.track_count
        assert record.changed_track_count == promised.changed_track_count
        assert record.fields == promised.changed_fields
        assert record.dropped_reference_count == promised.dropped_reference_count
        assert record.missing_file_count == promised.missing_file_count
        assert [
            (p.collection_id, p.path, p.entry_count, p.dropped_count)
            for p in ended.playlists
        ] == [
            (p.collection_id, p.path, p.entry_count, p.dropped_count)
            for p in promised.playlists
        ]

    def test_a_dropped_reference_is_recorded_on_the_row_and_its_playlist(
        self, service, collection_service, ids, destination: Path
    ):
        node = collection_service.create_collection("Half there")
        collection_service.add_tracks(node.id, [ids["1"], ids["4"]])

        ended = service.export([int(node.id)], "normal", str(destination))

        assert ended.record.dropped_reference_count == 1
        assert ended.playlists[0].entry_count == 1
        assert ended.playlists[0].dropped_count == 1

    def test_a_smart_collections_row_keeps_the_rules_it_was_resolved_from(
        self, service, collection_service, destination: Path
    ):
        smart = collection_service.create_smart(
            "Fast", RuleSet(rules=(FilterRule("bpm", "gte", 124),))
        )

        ended = service.export([int(smart.id)], "normal", str(destination))

        row = ended.playlists[0]
        assert row.kind == KIND_SMART
        assert row.rules_json == collection_service.get(int(smart.id)).rules_json
        assert row.collection_id == int(smart.id)

    def test_a_collections_row_keeps_no_rules(self, service, tree, destination: Path):
        ended = service.export([tree["saturday"]], "normal", str(destination))

        assert ended.playlists[0].kind == KIND_COLLECTION
        assert ended.playlists[0].rules_json is None

    def test_an_export_with_no_playlists_records_none(
        self, service, db, destination: Path
    ):
        ended = service.export([], "normal", str(destination))

        assert ended.written
        assert ended.playlists == ()
        assert rows(db, "rekordbox_export_playlists") == 0
        assert len(events(db)) == 1

    def test_a_library_nobody_changed_is_recorded_as_changing_nothing(
        self, service, destination: Path
    ):
        record = service.export([], "normal", str(destination)).record

        assert record.changed_track_count == 0
        assert record.fields == ()
        assert record.changed_nothing
        assert destination.read_bytes() == SOURCE

    def test_a_stale_source_is_recorded_as_stale(self, service, db, destination: Path):
        db.connect().execute("UPDATE library_source SET xml_size_bytes = 1")

        record = service.export([], "normal", str(destination)).record

        assert record.source_stale is True

    def test_the_missing_file_count_is_what_the_last_check_found(
        self, service, files, ids, destination: Path
    ):
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

        record = service.export([], "normal", str(destination)).record

        assert record.missing_file_count == 1

    def test_an_existing_file_at_the_destination_is_replaced(
        self, service, destination: Path
    ):
        """Overwriting a file someone chose is the OS dialog's confirmation, not a
        second one here (DEC-083)."""
        destination.write_bytes(EARLIER)

        service.export([], "normal", str(destination))

        assert destination.read_bytes() == SOURCE

    def test_a_relative_destination_is_recorded_where_it_actually_went(
        self, service, out: Path, monkeypatch: pytest.MonkeyPatch
    ):
        monkeypatch.chdir(out)

        record = service.export([], "normal", "relative.xml").record

        assert record.destination_path == str(out / "relative.xml")
        assert (out / "relative.xml").exists()

    def test_the_event_says_where_it_went_and_what_it_carried(
        self, service, db, tree, destination: Path
    ):
        ended = service.export(
            [tree["gigs"]], "normal", str(destination), job_id="job-9"
        )

        (event,) = events(db)
        assert event["summary"] == ended.summary_line()
        assert "CuePoint Export.xml" in event["summary"]
        detail = event["detail"]
        assert detail["export_id"] == ended.record.id
        assert detail["job_id"] == "job-9"
        assert detail["destination_path"] == str(destination)
        assert detail["track_count"] == 4
        assert detail["changed_track_count"] == 0
        assert detail["playlist_count"] == 2

    def test_the_summary_counts_in_words(self, service, tree, destination: Path):
        ended = service.export([tree["saturday"]], "normal", str(destination))

        assert ended.summary_line() == (
            "Exported 4 tracks to Rekordbox as CuePoint Export.xml: "
            "0 tracks changed, 1 playlist added"
        )

    def test_progress_arrives_in_two_phases(self, service, tree, destination: Path):
        ticks: List[Tuple[str, int, int]] = []

        service.export(
            [tree["gigs"]],
            "normal",
            str(destination),
            on_progress=lambda *tick: ticks.append(tick),
        )

        assert ticks[0] == (PHASE_TRACKS, 0, 4)
        assert (PHASE_TRACKS, 4, 4) in ticks
        assert ticks[-1] == (PHASE_PLAYLISTS, 2, 2)

    def test_the_answer_carries_the_row_and_the_report(
        self, service, tree, destination: Path
    ):
        payload = service.export([tree["gigs"]], "normal", str(destination)).to_dict()

        assert payload["outcome"] == EXPORT_WRITTEN
        assert payload["export_id"] is not None
        assert payload["playlist_count"] == 2
        assert payload["report"]["track_count"] == 4
        assert payload["error"] is None
        assert payload["summary"].startswith("Exported 4 tracks")

    def test_two_exports_are_two_rows_newest_first(self, service, exports, out: Path):
        first = service.export([], "normal", str(out / "a.xml")).record
        second = service.export([], "camelot", str(out / "b.xml")).record

        assert [record.id for record in exports.recent()] == [second.id, first.id]
        assert exports.latest_written() == second


# ------------------------------------------------------ where it may not write


class TestTheDestinationIsChecked:
    def test_the_source_itself_is_refused(self, service, db, source: Path):
        with pytest.raises(ExportDestinationError) as refused:
            service.export([], "normal", str(source))

        assert refused.value.reason == DESTINATION_IS_SOURCE
        assert source.read_bytes() == SOURCE
        assert rows(db, "rekordbox_exports") == 0

    def test_the_source_by_a_relative_path_is_refused(
        self, service, source: Path, monkeypatch: pytest.MonkeyPatch
    ):
        monkeypatch.chdir(source.parent / "..")

        with pytest.raises(ExportDestinationError) as refused:
            service.export([], "normal", os.path.join(source.parent.name, source.name))

        assert refused.value.reason == DESTINATION_IS_SOURCE

    def test_the_source_through_a_dot_dot_is_refused(self, service, source: Path):
        roundabout = source.parent / "elsewhere" / ".." / source.name

        with pytest.raises(ExportDestinationError) as refused:
            service.export([], "normal", str(roundabout))

        assert refused.value.reason == DESTINATION_IS_SOURCE

    @pytest.mark.skipif(sys.platform != "win32", reason="case folds only on Windows")
    def test_the_source_in_another_case_is_refused_on_windows(
        self, service, source: Path
    ):
        shouted = str(source).upper()

        with pytest.raises(ExportDestinationError) as refused:
            service.export([], "normal", shouted)

        assert refused.value.reason == DESTINATION_IS_SOURCE

    def test_the_source_through_a_symlink_is_refused(
        self, service, source: Path, out: Path
    ):
        link = out / "link.xml"
        try:
            link.symlink_to(source)
        except (OSError, NotImplementedError):
            pytest.skip("this system cannot make a symlink without privileges")

        with pytest.raises(ExportDestinationError) as refused:
            service.export([], "normal", str(link))

        assert refused.value.reason == DESTINATION_IS_SOURCE
        assert source.read_bytes() == SOURCE

    @pytest.mark.parametrize("name", ("track.mp3", "library.db", "export", "a.xml.bak"))
    def test_anything_but_an_xml_file_is_refused(self, service, out: Path, name: str):
        """DEC-085 held at the destination: a path ending ``.mp3`` would otherwise
        replace somebody's audio file with a Rekordbox collection."""
        target = out / name
        target.write_bytes(EARLIER)

        with pytest.raises(ExportDestinationError) as refused:
            service.export([], "normal", str(target))

        assert refused.value.reason == DESTINATION_NOT_XML
        assert target.read_bytes() == EARLIER

    def test_the_suffix_is_matched_without_regard_to_case(self, service, out: Path):
        assert service.export([], "normal", str(out / "LOUD.XML")).written

    def test_a_folder_is_refused(self, service, out: Path):
        folder = out / "looks like a file.xml"
        folder.mkdir()

        with pytest.raises(ExportDestinationError) as refused:
            service.export([], "normal", str(folder))

        assert refused.value.reason == DESTINATION_IS_FOLDER

    def test_a_folder_that_does_not_exist_is_refused_and_not_created(
        self, service, out: Path
    ):
        target = out / "nowhere" / "export.xml"

        with pytest.raises(ExportDestinationError) as refused:
            service.export([], "normal", str(target))

        assert refused.value.reason == DESTINATION_FOLDER_MISSING
        assert not (out / "nowhere").exists()

    @pytest.mark.parametrize("blank", ("", "   ", None))
    def test_no_destination_is_refused(self, service, blank):
        with pytest.raises(ExportDestinationError) as refused:
            service.export([], "normal", blank)

        assert refused.value.reason == DESTINATION_BLANK

    def test_a_refusal_names_the_path_and_is_a_validation_error(
        self, service, out: Path
    ):
        target = out / "track.mp3"

        with pytest.raises(ValidationError) as refused:
            service.export([], "normal", str(target))

        assert refused.value.path == str(target)
        assert str(target) in str(refused.value)

    def test_every_refusal_is_in_the_published_list(self):
        assert set(DESTINATION_REFUSALS) == {
            DESTINATION_BLANK,
            DESTINATION_IS_SOURCE,
            DESTINATION_NOT_XML,
            DESTINATION_IS_FOLDER,
            DESTINATION_FOLDER_MISSING,
        }

    def test_a_refusal_records_nothing_and_writes_nothing(self, service, db, out: Path):
        with pytest.raises(ExportDestinationError):
            service.export([], "normal", str(out / "track.mp3"))

        assert rows(db, "rekordbox_exports") == 0
        assert events(db) == []
        assert list(out.iterdir()) == []


class TestTheOtherRefusals:
    def test_an_unknown_notation(self, service, db, destination: Path):
        with pytest.raises(ValueError, match="key_format"):
            service.export([], "boring", str(destination))
        assert rows(db, "rekordbox_exports") == 0

    def test_an_unknown_node(self, service, db, destination: Path):
        with pytest.raises(ValueError, match="No such collection"):
            service.export([4242], "normal", str(destination))
        assert rows(db, "rekordbox_exports") == 0

    def test_a_library_never_imported(self, service, sources, db, destination: Path):
        sources.clear()

        with pytest.raises(ExportSourceError) as refused:
            service.export([], "normal", str(destination))

        assert refused.value.reason == SOURCE_NEVER_IMPORTED
        assert rows(db, "rekordbox_exports") == 0

    def test_a_source_that_has_gone(self, service, source: Path, db, destination: Path):
        source.unlink()

        with pytest.raises(ExportSourceError) as refused:
            service.export([], "normal", str(destination))

        assert refused.value.reason == SOURCE_MISSING
        assert rows(db, "rekordbox_exports") == 0

    def test_a_smart_collection_whose_rules_cannot_run(
        self, service, collection_service, db, destination: Path
    ):
        smart = collection_service.create_smart(
            "Fast", RuleSet(rules=(FilterRule("bpm", "gte", 124),))
        )
        db.connect().execute(
            "UPDATE collections SET rules_json = ? WHERE id = ?",
            ('{"rules": [{"field": "nonsense", "op": "eq", "value": 1}]}', smart.id),
        )

        with pytest.raises(FilterRuleError):
            service.validate([int(smart.id)], "normal", str(destination))
        assert rows(db, "rekordbox_exports") == 0

    def test_a_smart_collection_inside_a_chosen_folder_is_checked_too(
        self, service, collection_service, db, destination: Path
    ):
        folder = collection_service.create_folder("Saved")
        smart = collection_service.create_smart(
            "Fast", RuleSet(rules=(FilterRule("bpm", "gte", 124),)), folder.id
        )
        db.connect().execute(
            "UPDATE collections SET rules_json = 'not json' WHERE id = ?", (smart.id,)
        )

        with pytest.raises(FilterRuleError):
            service.validate([int(folder.id)], "normal", str(destination))

    def test_a_valid_request_comes_back_normalized(
        self, service, tree, destination: Path
    ):
        request = service.validate(
            [tree["saturday"], tree["saturday"], tree["gigs"]],
            "camelot",
            str(destination),
        )

        assert request.collection_ids == (tree["saturday"], tree["gigs"])
        assert request.key_format == "camelot"
        assert request.destination_path == str(destination)
        assert request.source_path.endswith("collection.xml")


# ----------------------------------------------------------------- cancelled


class TestACancelledExport:
    def test_a_cancel_mid_patch_leaves_no_file_no_temp_and_a_cancelled_row(
        self, service, db, exports, tree, destination: Path, out: Path
    ):
        destination.write_bytes(EARLIER)

        ended = service.export(
            [tree["gigs"]],
            "normal",
            str(destination),
            job_id="j",
            should_cancel=stop_after(3),
        )

        assert ended.cancelled and ended.outcome == EXPORT_CANCELLED
        assert destination.read_bytes() == EARLIER
        assert leftovers(out, destination.name) == []
        record = exports.for_job("j")
        assert record.outcome == EXPORT_CANCELLED
        assert record.error is None
        assert rows(db, "rekordbox_export_playlists") == 0
        assert events(db) == []

    def test_a_cancel_on_a_new_destination_leaves_no_file_at_all(
        self, service, tree, destination: Path, out: Path
    ):
        service.export(
            [tree["gigs"]], "normal", str(destination), should_cancel=stop_after(1)
        )

        assert list(out.iterdir()) == []

    def test_a_cancel_between_playlists_is_honoured(
        self, service, tree, destination: Path, out: Path
    ):
        # One before the walk, four tracks, then the first playlist.
        ended = service.export(
            [tree["gigs"]], "normal", str(destination), should_cancel=stop_after(6)
        )

        assert ended.cancelled
        assert list(out.iterdir()) == []

    def test_a_cancel_before_the_replace_is_honoured(
        self, service, tree, destination: Path, out: Path
    ):
        # One before the walk, four tracks, two playlists, then the replace.
        ended = service.export(
            [tree["gigs"]], "normal", str(destination), should_cancel=stop_after(8)
        )

        assert ended.cancelled
        assert list(out.iterdir()) == []

    def test_a_cancelled_row_counts_nothing_written_and_keeps_the_facts(
        self, service, db, files, ids, destination: Path
    ):
        db.connect().execute("UPDATE library_source SET xml_size_bytes = 1")
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

        record = service.export(
            [], "camelot", str(destination), should_cancel=stop_after(1)
        ).record

        assert record.track_count == 0
        assert record.changed_track_count == 0
        assert record.fields == ()
        assert record.source_stale is True
        assert record.missing_file_count == 1
        assert record.key_format == "camelot"
        assert record.destination_path == str(destination)

    def test_a_cancelled_export_says_so(self, service, destination: Path):
        ended = service.export(
            [], "normal", str(destination), should_cancel=lambda: True
        )

        assert "cancelled" in ended.summary_line()
        assert ended.to_dict()["report"] is None
        assert ended.to_dict()["outcome"] == EXPORT_CANCELLED


# -------------------------------------------------------------------- failed


class TestAFailedExport:
    def test_a_malformed_source_is_recorded_as_failed_with_the_reason(
        self, service, db, source: Path, destination: Path
    ):
        source.write_bytes(b"<DJ_PLAYLISTS><COLLECTION><TRACK TrackID='1'>")

        ended = service.export([], "normal", str(destination), job_id="j")

        assert ended.failed and ended.outcome == EXPORT_FAILED
        assert "not well-formed" in ended.record.error
        assert not destination.exists()
        assert events(db) == []
        assert rows(db, "rekordbox_export_playlists") == 0

    def test_a_failure_mid_write_leaves_the_destination_untouched(
        self,
        service,
        db,
        tree,
        destination: Path,
        out: Path,
        monkeypatch: pytest.MonkeyPatch,
    ):
        destination.write_bytes(EARLIER)

        def refuse(self, target):
            raise OSError(28, "No space left on device")

        monkeypatch.setattr(Path, "replace", refuse)

        ended = service.export([tree["gigs"]], "normal", str(destination))

        assert ended.failed
        assert "No space left on device" in ended.record.error
        assert destination.read_bytes() == EARLIER
        assert leftovers(out, destination.name) == []
        assert events(db) == []

    def test_a_failure_without_words_still_says_what_it_was(
        self, service, destination: Path, monkeypatch: pytest.MonkeyPatch
    ):
        import cuepoint.services.rekordbox_export_service as module

        def silent(*_args, **_kwargs):
            raise RuntimeError()

        monkeypatch.setattr(module, "patch_collection_xml", silent)

        ended = service.export([], "normal", str(destination))

        assert ended.record.error == "RuntimeError"

    def test_a_failed_row_keeps_the_source_state(
        self, service, db, source: Path, destination: Path
    ):
        db.connect().execute("UPDATE library_source SET xml_size_bytes = 1")
        source.write_bytes(b"<broken")

        record = service.export([], "normal", str(destination)).record

        assert record.outcome == EXPORT_FAILED
        assert record.source_stale is True
        assert record.track_count == 0

    def test_a_failed_export_says_why(self, service, source: Path, destination: Path):
        source.write_bytes(b"<broken")

        ended = service.export([], "normal", str(destination))

        assert ended.summary_line().startswith(
            "Rekordbox export to CuePoint Export.xml failed:"
        )
        assert ended.to_dict()["error"] == ended.record.error


# ------------------------------------------------------- the record is one unit


class TestTheRecordIsOneUnit:
    def test_an_event_that_cannot_be_recorded_takes_the_row_with_it(
        self, service, db, tree, destination: Path, monkeypatch: pytest.MonkeyPatch
    ):
        """All or nothing: a row with no event, or playlists with no row, would
        each be a record that disagrees with the rest of the record."""

        def refuse(*_args, **_kwargs):
            raise RuntimeError("the activity feed is unavailable")

        monkeypatch.setattr(service._activity, "record_event", refuse)

        with pytest.raises(RuntimeError, match="activity feed"):
            service.export([tree["gigs"]], "normal", str(destination))

        assert rows(db, "rekordbox_exports") == 0
        assert rows(db, "rekordbox_export_playlists") == 0
        # The file is the user's and stays: only CuePoint's note of it is lost.
        assert destination.exists()

    def test_nothing_is_recorded_per_track(
        self, service, db, metadata, ids, destination: Path
    ):
        """DEC-086: no track carries export state."""
        metadata.set_override(ids["1"], "genre", "Minimal")
        before = (
            db.connect()
            .execute("SELECT * FROM track_metadata ORDER BY track_id")
            .fetchall()
        )

        service.export([], "normal", str(destination))

        after = (
            db.connect()
            .execute("SELECT * FROM track_metadata ORDER BY track_id")
            .fetchall()
        )
        assert [tuple(row) for row in after] == [tuple(row) for row in before]
