#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""A real library and a real ``waveforms.db``, with a stand-in decoder (WAVE-03).

The analysis job's tests need what the engine has: a migrated library database
whose tracks point at files on disk, the file check's rows for them, a waveform
store, and the services over both. Only the decoder is replaced, by
:class:`StubDecoder`, which answers each file as a test says and records every
file it is handed, in order. Files are real, so ``stat`` is real: a test changes
a file's size by writing to it.
"""

from __future__ import annotations

import threading
from array import array
from pathlib import Path
from typing import Callable, Dict, List, Optional

from cuepoint.data.audio_decode import Envelope, Loudness
from cuepoint.models.file_status import FILE_PRESENT, TrackFileStatus
from cuepoint.models.library_track import LibraryTrack
from cuepoint.persistence.activity_repository import ActivityRepository
from cuepoint.persistence.file_status_repository import FileStatusRepository
from cuepoint.persistence.track_repository import TrackRepository
from cuepoint.persistence.waveform_store import WaveformStore
from cuepoint.persistence.waveform_work_repository import WaveformWorkRepository
from cuepoint.services.activity_service import ActivityService
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.migration_runner import MigrationRunner
from cuepoint.services.waveform_analysis_service import (
    EVENT_WAVEFORMS_ANALYSED,
    WaveformAnalysisService,
)
from cuepoint.services.waveform_service import WaveformService

NOW = "2026-10-03T12:00:00+00:00"
DECODER = Path("/opt/cuepoint/mpv")


#: What the stand-in measures every file at, unless told otherwise (WAVE-08):
#: a loud club master.
LOUDNESS = Loudness(-8.4, -0.3, None)


def envelope(
    frames: int = 3_000, level: float = 0.25, loudness: Loudness = LOUDNESS
) -> Envelope:
    """A plausible four-band envelope, 20 seconds at 150 Hz, with its loudness."""
    bands = [
        array("f", [level * (1 + (i % 7) / 7) / (band + 1) for i in range(frames)])
        for band in range(4)
    ]
    return Envelope(150, *bands, loudness=loudness)


class StubDecoder:
    """Answers each path as told, and records every file it is handed.

    An answer is an :class:`Envelope`, an exception to raise, or a callable
    given the path and returning either: a callable is how a test does
    something *while* a file is being decoded.
    """

    def __init__(self) -> None:
        self.answers: Dict[str, object] = {}
        self.opened: List[str] = []
        self.default: object = envelope()
        self._lock = threading.Lock()

    def __call__(
        self, source: str, decoder: Path, cancel: Optional[Callable[[], bool]]
    ) -> Envelope:
        with self._lock:
            self.opened.append(source)
        answer = self.answers.get(source, self.default)
        if callable(answer) and not isinstance(answer, Envelope):
            answer = answer(source)
        if isinstance(answer, BaseException):
            raise answer
        assert isinstance(answer, Envelope)
        return answer

    def names(self) -> List[str]:
        """The files opened, by name, in order."""
        with self._lock:
            return [Path(path).name for path in self.opened]


class WaveformLibrary:
    """A library on disk, its store, and the analysis services over them."""

    def __init__(self, root: Path, *, real_decoder: Optional[Path] = None) -> None:
        """Make the library under ``root``.

        Args:
            real_decoder: A real ``mpv`` to analyse with, for the binary tests.
                Without one, :class:`StubDecoder` answers every file.
        """
        self.root = root
        self.music = root / "music"
        self.music.mkdir(parents=True, exist_ok=True)
        self.db = DatabaseService(db_path=root / "cuepoint.db")
        MigrationRunner(self.db).migrate()
        self.store = WaveformStore(root / "waveforms.db")
        self.files = FileStatusRepository(self.db)
        self.tracks = TrackRepository(self.db)
        self.decoder = StubDecoder()
        self.decoder_path: Optional[Path] = real_decoder or DECODER
        if real_decoder is not None:
            self.waveforms = WaveformService(
                self.files, self.store, decoder=lambda: self.decoder_path
            )
        else:
            self.waveforms = WaveformService(
                self.files,
                self.store,
                decoder=lambda: self.decoder_path,
                decode_file=self.decoder,
            )
        self.work = WaveformWorkRepository(self.db)
        self.activity = ActivityRepository(self.db)
        self.analysis = WaveformAnalysisService(
            self.work,
            self.store,
            self.waveforms,
            ActivityService(self.activity, self.tracks),
        )
        self._ids: Dict[str, int] = {}

    def close(self) -> None:
        self.store.close_all()
        self.db.close_all()

    # ----------------------------------------------------------- tracks

    def path(self, name: str) -> Path:
        return self.music / name

    def add(
        self,
        name: str,
        *,
        added: Optional[str] = None,
        checked: bool = True,
        content: bytes = b"audio",
        path: Optional[Path] = None,
    ) -> int:
        """A track whose file exists, checked present unless ``checked`` is False."""
        file = path if path is not None else self.path(name)
        if not file.exists():
            file.write_bytes(content)
        self.tracks.add(
            LibraryTrack(
                rekordbox_track_id=name,
                title=name,
                artist="A",
                file_path=str(file),
                date_added=added,
            )
        )
        track_id = int(
            self.db.connect()
            .execute("SELECT id FROM tracks WHERE rekordbox_track_id = ?", (name,))
            .fetchone()["id"]
        )
        self._ids[name] = track_id
        if checked:
            self.check(name)
        return track_id

    def id(self, name: str) -> int:
        return self._ids[name]

    def file_of(self, name: str) -> Path:
        row = (
            self.db.connect()
            .execute("SELECT file_path FROM tracks WHERE id = ?", (self.id(name),))
            .fetchone()
        )
        return Path(row["file_path"])

    def check(self, *names: str) -> None:
        """Record each file present, at its size now, as a file check would."""
        statuses = []
        for name in names:
            file = self.file_of(name)
            statuses.append(
                TrackFileStatus(
                    self.id(name),
                    FILE_PRESENT,
                    str(file),
                    NOW,
                    size_bytes=file.stat().st_size,
                )
            )
        self.files.record(statuses)

    def remove(self, name: str) -> None:
        """Delete a track from the library, leaving its file and any waveform."""
        connection = self.db.connect()
        connection.execute("DELETE FROM tracks WHERE id = ?", (self.id(name),))
        connection.commit()

    def collection(self, kind: str, label: str, *names: str) -> None:
        connection = self.db.connect()
        cursor = connection.execute(
            "INSERT INTO collections (parent_id, kind, name, position, depth,"
            " created_at, updated_at) VALUES (NULL, ?, ?, 0, 0, ?, ?)",
            (kind, label, NOW, NOW),
        )
        for position, name in enumerate(names):
            connection.execute(
                "INSERT INTO collection_tracks (collection_id, track_id, position,"
                " added_at) VALUES (?, ?, ?, ?)",
                (int(cursor.lastrowid), self.id(name), position, NOW),
            )
        connection.commit()

    # ------------------------------------------------------------ reads

    def stored(self) -> Dict[str, str]:
        """Each stored file's name and state, at the current version."""
        return {
            Path(path).name: row.state
            for path, row in self.store.current_files(
                self.waveforms.analysis_version
            ).items()
        }

    def events(self) -> list:
        return self.activity.recent_events(
            limit=50, event_type=EVENT_WAVEFORMS_ANALYSED
        )


__all__ = ("DECODER", "NOW", "StubDecoder", "WaveformLibrary", "envelope")
