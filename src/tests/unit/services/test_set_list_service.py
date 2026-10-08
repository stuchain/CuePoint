#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""A Set's set list over a real library (PREP-06, DEC-110).

- **What it reads**: the plan's chapters, times and starts; the effective BPM
  and the effective key in the library's notation; title, artist and remixer
  as imported; each file's path and its last check of the current path.
- **Copy**: the text form, exactly what the writer renders.
- **Save**: each form by its extension, written atomically, with one activity
  event carrying the form and the counts.
- **Refusals**: a blank path, another extension, a folder, and a folder that
  does not exist, each with its reason, before anything is read or written.
- A failed write records nothing and leaves nothing, and no audio file is
  opened.
"""

from __future__ import annotations

import csv
import io
import os
from pathlib import Path
from typing import List, Optional

import pytest

from tests.unit.key_support import accept_with_key
from cuepoint.exceptions.cuepoint_exceptions import ValidationError
from cuepoint.data.set_list_file import (
    FILE_MISSING,
    FILE_NOT_CHECKED,
    FILE_PRESENT,
    FORMAT_CSV,
    FORMAT_M3U8,
    FORMAT_TEXT,
    encoded,
    render_text,
)
from cuepoint.models.collection import KIND_COLLECTION, KIND_SET, Collection
from cuepoint.models.file_status import FILE_PRESENT as STORED_PRESENT
from cuepoint.models.file_status import TrackFileStatus
from cuepoint.models.library_track import LibraryTrack
from cuepoint.persistence.activity_repository import ActivityRepository
from cuepoint.persistence.collection_repository import CollectionRepository
from cuepoint.persistence.file_status_repository import FileStatusRepository
from cuepoint.persistence.set_repository import SetRepository
from cuepoint.persistence.track_metadata_repository import TrackMetadataRepository
from cuepoint.persistence.track_repository import TrackRepository
from cuepoint.services.activity_service import ActivityService
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.migration_runner import MigrationRunner
from cuepoint.services.set_list_service import (
    DESTINATION_BLANK,
    DESTINATION_FOLDER_MISSING,
    DESTINATION_IS_FOLDER,
    DESTINATION_NOT_SET_LIST,
    EVENT_SET_LIST_SAVED,
    SetListDestinationError,
    SetListService,
    check_destination,
)
from cuepoint.services.set_service import SetService

pytestmark = pytest.mark.unit

CHECKED = "2026-09-20T09:00:00+00:00"


@pytest.fixture
def db(tmp_path):
    service = DatabaseService(db_path=tmp_path / "cuepoint.db")
    MigrationRunner(service).migrate()
    yield service
    service.close_all()


class Library:
    def __init__(self, db, music: Path) -> None:
        self.db = db
        self.music = music
        self.tracks = TrackRepository(db)
        self.meta = TrackMetadataRepository(db)
        self.files = FileStatusRepository(db)
        self.collections = CollectionRepository(db)
        set_repo = SetRepository(db)
        self.sets = SetService(self.collections, set_repo, db)
        self.activity = ActivityService(ActivityRepository(db), self.tracks)
        self.service = SetListService(
            self.sets, set_repo, self.tracks, self.activity, db
        )
        self.count = 0

    def add(
        self,
        artist: str = "Artist",
        title: str = "Title",
        *,
        remixer: Optional[str] = None,
        bpm: Optional[float] = 124.0,
        key: Optional[str] = "8A",
        length: Optional[int] = 300,
    ) -> int:
        self.count += 1
        path = self.music / f"{self.count}.mp3"
        stored = self.tracks.add(
            LibraryTrack(
                rekordbox_track_id=str(self.count),
                file_path=str(path),
                title=title,
                artist=artist,
                remixer=remixer,
                bpm=bpm,
                key=key,
                duration_seconds=length,
            )
        )
        assert stored.id is not None
        if key:
            # The key is Beatport's, by an accepted match (PAGES-15).
            accept_with_key(self.db, stored.id, key)
        return stored.id

    def check(self, track_id: int, status: str, path: Optional[str] = None) -> None:
        self.files.record(
            [
                TrackFileStatus(
                    track_id,
                    status,
                    path or str(self.music / f"{track_id}.mp3"),
                    CHECKED,
                    size_bytes=1 if status == STORED_PRESENT else None,
                )
            ]
        )

    def make_set(self, tracks: List[int], name: str = "Friday") -> int:
        set_id = int(self.collections.create(Collection(name=name, kind=KIND_SET)).id)
        self.collections.append(set_id, tracks)
        return set_id

    def entries(self, set_id: int) -> List[int]:
        return [int(e.id) for e in self.collections.entries(set_id)]

    def events(self) -> List[tuple]:
        return [
            tuple(r)
            for r in self.db.connect().execute(
                "SELECT type, summary, detail_json FROM activity_events ORDER BY id"
            )
        ]


@pytest.fixture
def lib(db, tmp_path) -> Library:
    music = tmp_path / "music"
    music.mkdir()
    return Library(db, music)


@pytest.fixture
def friday(lib):
    """Warm-up and Peak, a repeat, times, a missing file and an override."""
    rej = lib.add("Âme", "Rej (Original Mix)", bpm=122.5, key="8A")
    dixon = lib.add("Dixon", "Formula", remixer="Kerri Chandler", bpm=124.0, key="9A")
    model = lib.add("Kraftwerk", "Das Model", bpm=None, key=None, length=None)
    lib.check(rej, "present")
    lib.check(dixon, "missing")
    lib.meta.set_override(dixon, "bpm", 125.0)
    set_id = lib.make_set([rej, dixon, rej, model])
    entries = lib.entries(set_id)
    chapter = int(lib.collections.chapters(set_id)[0].id)
    lib.sets.rename_chapter(chapter, "Warm-up")
    lib.sets.split_chapter_at(entries[2], "Peak")
    lib.sets.set_entry_times(entries[0], None, "4:00")
    lib.sets.set_entry_times(entries[1], "0:30", "5:00")
    lib.sets.set_entry_note(entries[3], "lights down")
    return set_id, entries


# ------------------------------------------------------------------- reading


class TestWhatItReads:
    def test_the_set_list(self, lib, friday):
        set_id, entries = friday
        read = lib.service.set_list(set_id)
        assert read.name == "Friday"
        assert [(c.position, c.name) for c in read.chapters] == [
            (0, "Warm-up"),
            (1, "Peak"),
        ]
        assert [r.chapter for r in read.rows] == [0, 0, 1, 1]
        assert [r.starts_at for r in read.rows] == [0, 240, 510, None]
        assert (read.running_seconds, read.untimed) == (510, 2)
        first, second, reprise, last = read.rows
        assert (first.artist, first.title, first.key, first.bpm) == (
            "Âme",
            "Rej (Original Mix)",
            "8A",
            122.5,
        )
        assert second.bpm == 125.0, "the override (DEC-068)"
        assert second.remixer == "Kerri Chandler"
        assert (second.in_seconds, second.out_seconds, second.planned_seconds) == (
            30,
            300,
            270,
        )
        assert [r.file_status for r in read.rows] == [
            FILE_PRESENT,
            FILE_MISSING,
            FILE_PRESENT,
            FILE_NOT_CHECKED,
        ]
        assert reprise.file_path == first.file_path
        assert (last.bpm, last.key, last.length_seconds, last.note) == (
            None,
            None,
            None,
            "lights down",
        )
        assert read.missing_files == 1

    def test_keys_are_written_in_camelot_and_an_unreadable_one_is_none(self, lib):
        set_id = lib.make_set([lib.add(key="8A"), lib.add(key="Am"), lib.add(key="x")])
        assert [r.key for r in lib.service.set_list(set_id).rows] == ["8A", "8A", None]

    def test_a_check_of_a_path_the_track_no_longer_has_is_no_check(self, lib):
        track = lib.add()
        lib.check(track, "missing", path="/elsewhere/old.mp3")
        set_id = lib.make_set([track])
        assert lib.service.set_list(set_id).rows[0].file_status == FILE_NOT_CHECKED

    def test_an_empty_set(self, lib):
        set_id = lib.make_set([])
        read = lib.service.set_list(set_id)
        assert read.rows == () and len(read.chapters) == 1

    def test_only_a_set(self, lib):
        crate = int(
            lib.collections.create(Collection(name="Crate", kind=KIND_COLLECTION)).id
        )
        with pytest.raises(ValueError, match="not a Set"):
            lib.service.set_list(crate)
        with pytest.raises(ValueError, match="No such Set"):
            lib.service.text(999_999)


# ---------------------------------------------------------------------- copy


def test_copy_is_the_text_form(lib, friday):
    set_id, _ = friday
    text = lib.service.text(set_id)
    assert text == render_text(lib.service.set_list(set_id))
    assert text.splitlines()[:5] == [
        "Friday",
        "Running time 8:30 (2 untimed entries not counted)",
        "",
        "Warm-up",
        "01. [0:00]  Âme – Rej (Original Mix)  (out 4:00)",
    ]
    assert lib.events() == [], "copying records nothing"


# ---------------------------------------------------------------------- save


class TestSave:
    @pytest.mark.parametrize(
        ("name", "form"),
        [
            ("friday.txt", FORMAT_TEXT),
            ("friday.csv", FORMAT_CSV),
            ("Friday.M3U8", FORMAT_M3U8),
        ],
    )
    def test_each_form_by_its_extension(self, lib, friday, tmp_path, name, form):
        set_id, _ = friday
        target = tmp_path / name
        saved = lib.service.save(set_id, str(target))
        assert target.read_bytes() == encoded(lib.service.set_list(set_id), form)
        assert saved.to_dict() == {
            "set_id": set_id,
            "path": str(target),
            "format": form,
            "entries": 4,
            "missing_files": 1,
            "untimed": 2,
            "bytes_written": target.stat().st_size,
        }

    def test_one_event_with_the_form_and_the_counts(self, lib, friday, tmp_path):
        import json

        set_id, _ = friday
        target = tmp_path / "friday.csv"
        lib.service.save(set_id, str(target))
        [(kind, summary, detail)] = lib.events()
        assert kind == EVENT_SET_LIST_SAVED
        assert summary == (
            "Saved 'Friday' as a CSV set list — 4 entries, 1 file missing, 2 untimed"
        )
        assert json.loads(detail) == {
            "set_id": set_id,
            "set_name": "Friday",
            "format": "csv",
            "path": str(target),
            "entries": 4,
            "missing_files": 1,
            "untimed": 2,
        }

    def test_a_clean_set_says_only_its_entries(self, lib, tmp_path):
        track = lib.add()
        set_id = lib.make_set([track])
        lib.sets.set_entry_times(lib.entries(set_id)[0], None, "3:00")
        lib.service.save(set_id, str(tmp_path / "s.m3u8"))
        assert lib.events()[0][1] == "Saved 'Friday' as an M3U8 playlist — 1 entry"

    def test_the_m3u8_lists_a_missing_file_and_every_repeat(
        self, lib, friday, tmp_path
    ):
        from cuepoint.data.playlist_file import parse_m3u

        set_id, _ = friday
        target = tmp_path / "friday.m3u8"
        lib.service.save(set_id, str(target))
        read = lib.service.set_list(set_id)
        assert [path for path, _, _ in parse_m3u(str(target))] == [
            row.file_path for row in read.rows
        ]

    def test_the_csv_opens_in_a_spreadsheet(self, lib, friday, tmp_path):
        set_id, _ = friday
        target = tmp_path / "friday.csv"
        lib.service.save(set_id, str(target))
        rows = list(csv.reader(io.StringIO(target.read_text(encoding="utf-8-sig"))))
        assert rows[2][7:9] == ["Formula", "Kerri Chandler"]
        assert rows[2][13] == "missing"

    def test_a_relative_path_is_saved_where_it_points(
        self, lib, friday, tmp_path, monkeypatch
    ):
        set_id, _ = friday
        monkeypatch.chdir(tmp_path)
        saved = lib.service.save(set_id, "friday.txt")
        assert saved.path == str(tmp_path / "friday.txt")
        assert (tmp_path / "friday.txt").exists()


# ----------------------------------------------------------------- refusals


class TestRefusals:
    @pytest.mark.parametrize(
        ("path", "reason"),
        [
            ("", DESTINATION_BLANK),
            ("   ", DESTINATION_BLANK),
            ("friday.m3u", DESTINATION_NOT_SET_LIST),
            ("friday.xml", DESTINATION_NOT_SET_LIST),
            ("friday.mp3", DESTINATION_NOT_SET_LIST),
            ("friday", DESTINATION_NOT_SET_LIST),
            ("gone/friday.txt", DESTINATION_FOLDER_MISSING),
        ],
    )
    def test_each_refusal_writes_nothing(self, lib, friday, tmp_path, path, reason):
        set_id, _ = friday
        before = sorted(p.name for p in tmp_path.iterdir())
        target = str(tmp_path / path) if path.strip() else path
        with pytest.raises(SetListDestinationError) as refused:
            lib.service.save(set_id, target)
        assert refused.value.reason == reason
        # A ValidationError carrying its reason as its code, as the export's
        # destination refusal is, so the engine answers both one way.
        assert isinstance(refused.value, ValidationError)
        assert refused.value.error_code == reason
        assert sorted(p.name for p in tmp_path.iterdir()) == before
        assert lib.events() == []

    def test_a_folder_is_not_a_file(self, lib, friday, tmp_path):
        set_id, _ = friday
        folder = tmp_path / "list.txt"
        folder.mkdir()
        with pytest.raises(SetListDestinationError) as refused:
            lib.service.save(set_id, str(folder))
        assert refused.value.reason == DESTINATION_IS_FOLDER
        assert refused.value.path == str(folder)
        assert lib.events() == []

    def test_the_destination_is_checked_before_the_set_is_read(self, lib, tmp_path):
        with pytest.raises(SetListDestinationError):
            lib.service.save(999_999, str(tmp_path / "x.mp3"))

    def test_a_set_that_is_not_one_writes_nothing(self, lib, tmp_path):
        with pytest.raises(ValueError, match="No such Set"):
            lib.service.save(999_999, str(tmp_path / "x.txt"))
        assert not (tmp_path / "x.txt").exists() and lib.events() == []

    def test_a_failed_write_records_nothing(self, lib, friday, tmp_path, monkeypatch):
        import cuepoint.services.set_list_service as module

        def broken(*args, **kwargs):
            raise OSError("disk full")

        set_id, _ = friday
        monkeypatch.setattr(module, "write_set_list", broken)
        with pytest.raises(OSError, match="disk full"):
            lib.service.save(set_id, str(tmp_path / "friday.txt"))
        assert lib.events() == []

    def test_check_destination_answers_the_absolute_path(self, tmp_path):
        assert check_destination(str(tmp_path / "a.csv")) == str(tmp_path / "a.csv")


# ------------------------------------------------------------ no audio file


def test_no_audio_file_is_opened(lib, tmp_path, monkeypatch):
    """A set list names its files; it never reads one (DEC-110)."""
    import builtins

    tracks = [lib.add(), lib.add()]
    for track in tracks:
        (lib.music / f"{track}.mp3").write_bytes(b"ID3audio")
    set_id = lib.make_set(tracks)
    opened: List[str] = []
    real_open, real_os_open = builtins.open, os.open

    def spy_open(file, *args, **kwargs):
        opened.append(str(file))
        return real_open(file, *args, **kwargs)

    def spy_os_open(path, *args, **kwargs):
        opened.append(str(path))
        return real_os_open(path, *args, **kwargs)

    monkeypatch.setattr(builtins, "open", spy_open)
    monkeypatch.setattr(os, "open", spy_os_open)
    for suffix in (".txt", ".csv", ".m3u8"):
        lib.service.save(set_id, str(tmp_path / f"friday{suffix}"))
    lib.service.text(set_id)
    assert not [path for path in opened if path.endswith(".mp3")], opened


def test_nothing_on_this_path_imports_an_audio_reader():
    root = Path(__file__).resolve().parents[3] / "cuepoint"
    for module in ("data/set_list_file.py", "services/set_list_service.py"):
        text = (root / module).read_text(encoding="utf-8")
        for reader in (
            "mutagen",
            "tag_writer",
            "tag_fields",
            "read_title_artist_from_file",
        ):
            assert reader not in text, f"{module} mentions {reader}"


def test_the_container_builds_the_service(tmp_path, monkeypatch):
    from cuepoint.services import database_service as database_service_module
    from cuepoint.services.bootstrap import bootstrap_services
    from cuepoint.services.interfaces import IDatabaseService, ISetListService
    from cuepoint.utils.di_container import get_container, reset_container

    monkeypatch.setattr(
        database_service_module, "default_database_path", lambda: tmp_path / "c.db"
    )
    reset_container()
    try:
        bootstrap_services()
        service = get_container().resolve(ISetListService)
        assert isinstance(service, SetListService)
        with pytest.raises(ValueError, match="No such Set"):
            service.text(1)
    finally:
        get_container().resolve(IDatabaseService).close_all()
        reset_container()
