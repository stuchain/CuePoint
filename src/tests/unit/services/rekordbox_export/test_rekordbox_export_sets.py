#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""A Set in the Rekordbox export (PREP-07, DEC-109).

A Set is appended exactly as a Collection is: one playlist of its entries in
their running order, a repeat written twice, at its folder path under
CuePoint's folder (DEC-078). Four risks, each with its tests:

**Something of the plan reaches the file.** Chapters, times, notes and
acknowledgements stay in CuePoint. A Set with all of them is written byte for
byte as a Collection holding the same entries, and none of their words appear
anywhere in the file.

**The running order is lost.** The playlist carries every entry in order, a
repeat included, read back through the importer's own reader.

**The record or the preview says something else.** The row says ``set`` and
keeps no rules, and the preview promised the numbers the export wrote.

**A Set's own checks stop an export.** Nothing about a Set can (DEC-017): a Set
whose checks find warnings, unacknowledged, exports as any other does.
"""

from __future__ import annotations

from pathlib import Path
from typing import Dict, List

import pytest

from cuepoint.data.rekordbox import iter_collection_tracks, iter_playlist_nodes
from cuepoint.models.collection import KIND_COLLECTION, KIND_SET
from cuepoint.models.file_status import FILE_MISSING, TrackFileStatus
from cuepoint.models.library_track import utc_now_iso
from cuepoint.models.rekordbox_export import EXPORT_WRITTEN, RekordboxExportPlaylist
from cuepoint.models.rekordbox_playlist import KIND_PLAYLIST
from cuepoint.persistence.rekordbox_export_repository import RekordboxExportRepository
from cuepoint.persistence.set_repository import SetRepository
from cuepoint.services.set_analysis_service import SetAnalysisService
from cuepoint.services.set_service import SetService

from .library import SOURCE

pytestmark = pytest.mark.unit

#: Every word the plan below holds. None of them may reach the file.
PLAN_WORDS = (
    "Warm-up",
    "Peak time",
    "Closing",
    "Keep the first hour low",
    "Ride the break",
    "Slow it down",
    "Reprise the opener",
)


@pytest.fixture()
def out(tmp_path: Path) -> Path:
    folder = tmp_path / "exports"
    folder.mkdir()
    return folder


@pytest.fixture()
def sets(db, collections) -> SetService:
    return SetService(collections, SetRepository(db), db)


@pytest.fixture()
def analysis(db, collections, tracks) -> SetAnalysisService:
    return SetAnalysisService(collections, SetRepository(db), tracks, db)


def planned_set(
    collection_service, collections, sets: SetService, ids: Dict[str, int], **where
) -> int:
    """A Set a DJ has planned: three chapters, times, notes and a reprise.

    Its running order is 1, 2, 3, 1. Track 3, at 90 BPM, is a tempo jump from
    both of its neighbours, so its checks have something to say.
    """
    made = collection_service.create_set("Friday", where.get("parent_id"))
    set_id = int(made.id)
    collection_service.add_tracks(set_id, [ids["1"], ids["2"], ids["3"]])
    collection_service.insert_track(set_id, ids["1"], 3)
    entries = [int(entry.id) for entry in collections.entries(set_id)]

    first = sets.plan(set_id).chapters[0].chapter
    sets.rename_chapter(int(first.id), "Warm-up")
    sets.set_chapter_notes(int(first.id), "Keep the first hour low")
    peak = sets.split_chapter_at(entries[1], "Peak time")
    sets.set_chapter_notes(int(peak.id), "Ride the break")
    sets.split_chapter_at(entries[3], "Closing")
    sets.set_entry_times(entries[0], "0:30", "5:00")
    sets.set_entry_times(entries[1], None, "6:15")
    sets.set_entry_note(entries[2], "Slow it down")
    sets.set_entry_note(entries[3], "Reprise the opener")
    sets.set_notes(set_id, "Keep the first hour low")
    return set_id


def playlists(path: Path) -> Dict[str, List[str]]:
    """Each playlist in the written file, by its path, with its track ids."""
    return {
        node.rekordbox_path: node.track_refs
        for node in iter_playlist_nodes(str(path))
        if node.kind == KIND_PLAYLIST
    }


# ------------------------------------------------------------ what is written


class TestASetIsWrittenAsOnePlaylist:
    def test_its_entries_are_written_in_order_with_the_repeat(
        self, service, collection_service, collections, sets, ids, out: Path
    ):
        set_id = planned_set(collection_service, collections, sets, ids)
        destination = out / "export.xml"

        service.export([set_id], "normal", str(destination))

        assert list(playlists(destination).values()) == [["1", "2", "3", "1"]]

    def test_three_chapters_make_one_playlist_and_no_folder(
        self, service, collection_service, collections, sets, ids, out: Path
    ):
        set_id = planned_set(collection_service, collections, sets, ids)
        destination = out / "export.xml"

        service.export([set_id], "normal", str(destination))

        written = [
            (node.kind, node.name)
            for node in iter_playlist_nodes(str(destination))
            if node.name != "ROOT"
        ]
        assert written == [("folder", "CuePoint"), (KIND_PLAYLIST, "Friday")]

    def test_no_word_of_the_plan_reaches_the_file(
        self, service, collection_service, collections, sets, analysis, ids, out
    ):
        set_id = planned_set(collection_service, collections, sets, ids)
        report = analysis.analyse(set_id)
        jump, _second = [
            (t.from_entry_id, t.to_entry_id)
            for t in report.analysis.transitions
            if any(w.kind == "tempo_jump" for w in t.warnings)
        ]
        analysis.acknowledge(*jump, "tempo_jump")
        destination = out / "export.xml"

        service.export([set_id], "normal", str(destination))

        text = destination.read_text(encoding="utf-8")
        for word in PLAN_WORDS:
            assert word not in text
        # No time is written either: the plan's in and out points would be
        # the only place 30, 300 or 375 seconds could come from.
        playlist = text.split('Name="CuePoint"')[1]
        for seconds in ("30", "300", "375"):
            assert f'"{seconds}"' not in playlist
        assert "tempo_jump" not in text

    def test_it_is_written_byte_for_byte_as_a_collection_of_the_same_entries(
        self, service, collection_service, collections, sets, ids, out: Path
    ):
        """DEC-109: a Set is appended exactly as a Collection is.

        The same folder, name and entries, once as a planned Set and once as a
        Collection, give the same file — so everything EXPORT-02 holds of a
        Collection's export (every byte outside the appended tree identical to
        the source) holds of a Set's.
        """
        folder = collection_service.create_folder("Gigs")
        set_id = planned_set(
            collection_service, collections, sets, ids, parent_id=folder.id
        )
        as_set = out / "as-set.xml"
        service.export([set_id], "normal", str(as_set))

        collection_service.delete(set_id)
        crate = collection_service.create_collection("Friday", folder.id)
        collection_service.add_tracks(crate.id, [ids["1"], ids["2"], ids["3"]])
        collection_service.insert_track(crate.id, ids["1"], 3)
        as_collection = out / "as-collection.xml"
        service.export([int(crate.id)], "normal", str(as_collection))

        assert as_set.read_bytes() == as_collection.read_bytes()

    def test_every_byte_outside_the_appended_tree_is_the_sources(
        self, service, collection_service, collections, sets, ids, out: Path
    ):
        set_id = planned_set(collection_service, collections, sets, ids)
        destination = out / "export.xml"

        service.export([set_id], "normal", str(destination))

        written = destination.read_bytes()
        head, _, _ = SOURCE.partition(b'<NODE Type="0" Name="ROOT"')
        assert written.startswith(head)
        assert written.endswith(b"  </PLAYLISTS>\n</DJ_PLAYLISTS>\n")
        assert len(list(iter_collection_tracks(str(destination)))) == 4

    def test_a_set_in_a_folder_is_written_at_its_path(
        self, service, collection_service, collections, sets, ids, out: Path
    ):
        gigs = collection_service.create_folder("Gigs")
        year = collection_service.create_folder("2026", gigs.id)
        set_id = planned_set(
            collection_service, collections, sets, ids, parent_id=year.id
        )
        destination = out / "export.xml"

        ended = service.export([int(gigs.id)], "normal", str(destination))

        assert ended.playlists[0].path == "CuePoint/Gigs/2026/Friday"
        (path,) = playlists(destination)
        assert path.endswith("CuePoint/Gigs/2026/Friday")
        assert ended.playlists[0].collection_id == set_id

    def test_a_folder_holding_a_set_and_a_collection_writes_both(
        self, service, collection_service, collections, sets, ids, tree, out: Path
    ):
        set_id = planned_set(
            collection_service, collections, sets, ids, parent_id=tree["gigs"]
        )
        destination = out / "export.xml"

        ended = service.export([tree["gigs"]], "normal", str(destination))

        assert [(p.kind, p.path) for p in ended.playlists] == [
            (KIND_COLLECTION, "CuePoint/Gigs/Saturday"),
            (KIND_COLLECTION, "CuePoint/Gigs/2026/Summer"),
            (KIND_SET, "CuePoint/Gigs/Friday"),
        ]
        assert ended.playlists[2].collection_id == set_id

    def test_an_empty_set_is_still_a_playlist(
        self, service, collection_service, out: Path
    ):
        empty = collection_service.create_set("Next week")
        destination = out / "export.xml"

        ended = service.export([int(empty.id)], "normal", str(destination))

        assert [(p.kind, p.entry_count) for p in ended.playlists] == [(KIND_SET, 0)]
        assert list(playlists(destination).values()) == [[]]


# ------------------------------------------------------------ what is recorded


class TestTheRecord:
    def test_the_row_says_set_and_keeps_no_rules(
        self, service, db, collection_service, collections, sets, ids, out: Path
    ):
        set_id = planned_set(collection_service, collections, sets, ids)

        ended = service.export([set_id], "normal", str(out / "export.xml"))

        assert ended.record.outcome == EXPORT_WRITTEN
        (row,) = RekordboxExportRepository(db).playlists_for(int(ended.record.id))
        assert row == RekordboxExportPlaylist(
            id=row.id,
            export_id=int(ended.record.id),
            collection_id=set_id,
            kind=KIND_SET,
            name="Friday",
            path="CuePoint/Friday",
            entry_count=4,
            dropped_count=0,
            rules_json=None,
        )
        stored = (
            db.connect()
            .execute("SELECT kind FROM rekordbox_export_playlists")
            .fetchone()
        )
        assert stored["kind"] == "set"

    def test_the_record_outlives_the_set(
        self, service, db, collection_service, collections, sets, ids, out: Path
    ):
        set_id = planned_set(collection_service, collections, sets, ids)
        ended = service.export([set_id], "normal", str(out / "export.xml"))

        collection_service.delete(set_id)

        (row,) = RekordboxExportRepository(db).playlists_for(int(ended.record.id))
        assert (row.kind, row.name, row.entry_count) == (KIND_SET, "Friday", 4)

    def test_the_preview_and_the_export_agree(
        self, service, collection_service, collections, sets, ids, tree, out: Path
    ):
        """DEC-084's anti-drift test, with a Set among what is chosen."""
        set_id = planned_set(collection_service, collections, sets, ids)
        collection_service.add_tracks(set_id, [ids["4"]])
        chosen = [tree["gigs"], set_id]

        promised = service.preview(chosen, "camelot")
        ended = service.export(chosen, "camelot", str(out / "export.xml"))

        assert ended.report == promised
        assert [p.to_dict() for p in ended.report.playlists] == [
            p.to_dict() for p in promised.playlists
        ]
        (previewed,) = [p for p in promised.playlists if p.kind == KIND_SET]
        assert (previewed.entry_count, previewed.dropped_count) == (4, 1)
        assert ended.record.dropped_reference_count == 1

    def test_the_preview_names_the_set_by_its_kind(
        self, service, collection_service, collections, sets, ids
    ):
        set_id = planned_set(collection_service, collections, sets, ids)

        (playlist,) = service.preview([set_id], "normal").to_dict()["playlists"]

        assert playlist == {
            "collection_id": set_id,
            "kind": "set",
            "name": "Friday",
            "path": "CuePoint/Friday",
            "entry_count": 4,
            "dropped_count": 0,
            "requested_count": 4,
        }


# --------------------------------------------------- what the file cannot hold


class TestTracksTheSourceNoLongerHolds:
    def test_they_are_dropped_from_the_playlist_and_counted(
        self, service, collection_service, collections, sets, ids, out: Path
    ):
        """DEC-082, as for a Collection: per appearance, the rest in order."""
        set_id = planned_set(collection_service, collections, sets, ids)
        collection_service.insert_track(set_id, ids["4"], 1)
        collection_service.insert_track(set_id, ids["4"], 5)
        destination = out / "export.xml"

        ended = service.export([set_id], "normal", str(destination))

        (written,) = ended.playlists
        assert (written.entry_count, written.dropped_count) == (4, 2)
        assert written.requested_count == 6
        assert ended.record.dropped_reference_count == 2
        assert list(playlists(destination).values()) == [["1", "2", "3", "1"]]

    def test_a_set_the_file_holds_nothing_of_is_an_empty_playlist(
        self, service, collection_service, ids, out: Path
    ):
        gig = collection_service.create_set("Elsewhere")
        collection_service.add_tracks(gig.id, [ids["4"]])

        ended = service.export([int(gig.id)], "normal", str(out / "export.xml"))

        (written,) = ended.playlists
        assert (written.kind, written.entry_count, written.dropped_count) == (
            KIND_SET,
            0,
            1,
        )


# -------------------------------------------------------- nothing can stop it


class TestNothingAboutASetStopsAnExport:
    def test_a_set_whose_checks_warn_exports(
        self, service, collection_service, collections, sets, analysis, ids, files, out
    ):
        """DEC-017: warnings inform; the export neither reads nor mentions them."""
        set_id = planned_set(collection_service, collections, sets, ids)
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
        counts = analysis.analyse(set_id).analysis.counts
        assert counts.get("tempo_jump") and counts.get("file_missing")

        destination = out / "export.xml"

        ended = service.export([set_id], "normal", str(destination))

        assert ended.written
        assert list(playlists(destination).values()) == [["1", "2", "3", "1"]]

    def test_the_preview_says_nothing_of_a_sets_checks(
        self, service, collection_service, collections, sets, ids
    ):
        """The same payload a Collection's preview has, and nothing beside it."""
        set_id = planned_set(collection_service, collections, sets, ids)
        crate = collection_service.create_collection("Crate")
        collection_service.add_tracks(crate.id, [ids["1"], ids["2"], ids["3"]])
        collection_service.insert_track(crate.id, ids["1"], 3)

        of_set = service.preview([set_id], "normal").to_dict()
        of_crate = service.preview([int(crate.id)], "normal").to_dict()

        # Only the playlist's own identity differs: which node, of which kind,
        # under which name. Every count and every other key is the Collection's.
        identity = ("collection_id", "kind", "name", "path")
        (set_playlist,) = of_set.pop("playlists")
        (crate_playlist,) = of_crate.pop("playlists")
        assert of_set == of_crate
        assert {k: v for k, v in set_playlist.items() if k not in identity} == {
            k: v for k, v in crate_playlist.items() if k not in identity
        }
        assert sorted(set_playlist) == sorted(crate_playlist)

    def test_validate_accepts_a_set_and_runs_no_rules_for_it(
        self, service, collection_service, collections, sets, ids, out: Path
    ):
        set_id = planned_set(collection_service, collections, sets, ids)

        request = service.validate([set_id], "normal", str(out / "export.xml"))

        assert request.collection_ids == (set_id,)
