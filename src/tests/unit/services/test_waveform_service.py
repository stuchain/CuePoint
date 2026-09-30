#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""One file's analysis and any track's waveform state (WAVE-02).

Over a real library database and a real ``waveforms.db``, with the decoder
replaced by a stand-in that answers each test's outcome and counts every file
it is handed. So these prove:

- **WAVE-01's vocabulary is stored as stated:** a waveform, each failure
  reason, and the outcomes that write nothing (a file gone now, a cancel, a
  decoder that cannot analyse).
- **Only a file the check found present at the track's current path is
  opened** (fact 6), and a file missing at ``stat`` writes nothing.
- **A stored row counts only for the same path, version, size and modified
  time,** and a failed one is never retried until one of those changes.
- **A state touches no file,** which a filesystem that raises on every look
  proves, and costs one library query and one store query per 200 tracks.
- **Waveforms are found by path,** so a library restored with new track ids
  keeps them.
"""

from __future__ import annotations

import builtins
import logging
import os
import sqlite3
import uuid
from array import array
from pathlib import Path
from typing import Callable, Dict, List, Optional, Sequence

import pytest

from cuepoint.core.waveform import COLUMNS, decode, downsample, encode, reduce
from cuepoint.data.audio_decode import (
    ANALYSIS_VERSION,
    DecodeCancelled,
    DecodeFailed,
    DecoderUnavailable,
    Envelope,
    FileGone,
)
from cuepoint.models.file_status import (
    FILE_MISSING,
    FILE_PRESENT,
    FILE_UNREADABLE,
    REASON_ROOT_UNAVAILABLE,
    TrackFileStatus,
)
from cuepoint.models.library_track import LibraryTrack
from cuepoint.models.waveform import (
    OUTCOME_CANCELLED,
    OUTCOME_CURRENT,
    OUTCOME_FAILED,
    OUTCOME_NOT_FOUND,
    OUTCOME_NOT_PRESENT,
    OUTCOME_READY,
    OUTCOME_UNAVAILABLE,
    STATE_FAILED,
    STATE_MISSING,
    STATE_READY,
    STATE_UNAVAILABLE,
    STATE_UNCHECKED,
    STATE_WAITING,
    STORED_READY,
    StoredWaveform,
)
from cuepoint.persistence.file_status_repository import FileStatusRepository
from cuepoint.persistence.track_repository import TrackRepository
from cuepoint.persistence.waveform_store import WaveformStore, WaveformStoreError
from cuepoint.services import waveform_service as module
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.migration_runner import MigrationRunner
from cuepoint.services.waveform_service import STATE_BATCH, WaveformService

NOW = "2026-09-30T12:00:00+00:00"
DECODER = Path("/opt/cuepoint/mpv")


def envelope(frames: int = 3_000, level: float = 0.25, errors: int = 0) -> Envelope:
    bands = [
        array("f", [level * (1 + (i % 7) / 7) / (b + 1) for i in range(frames)])
        for b in range(4)
    ]
    return Envelope(150, *bands, decode_errors=errors)


class Decoder:
    """Answers each path as told, and records every file it is handed."""

    def __init__(self) -> None:
        self.answers: Dict[str, object] = {}
        self.opened: List[str] = []
        self.decoders: List[Path] = []
        self.default: object = envelope()

    def __call__(
        self, source: str, decoder: Path, cancel: Optional[Callable[[], bool]]
    ) -> Envelope:
        self.opened.append(source)
        self.decoders.append(decoder)
        answer = self.answers.get(source, self.default)
        if isinstance(answer, BaseException):
            raise answer
        if callable(answer):
            return answer(cancel)
        assert isinstance(answer, Envelope)
        return answer


class Logs:
    """Records the module's own logger, whatever another test did to logging.

    Not logs: its handler sits on the root, and another test's logging setup
    (the "cuepoint" logger stops propagating, or a dictConfig disables existing
    loggers) keeps records from reaching it in a full run.
    """

    def __init__(self) -> None:
        self.records: list = []

    def __enter__(self) -> "Logs":
        return self

    def __exit__(self, *exc) -> None:
        return None

    @property
    def text(self) -> str:
        return "\n".join(record.getMessage() for record in self.records)


@pytest.fixture
def logs():
    captured = Logs()
    handler = logging.Handler(logging.DEBUG)
    handler.emit = captured.records.append  # type: ignore[method-assign]
    logger = logging.getLogger(module.__name__)
    saved = (logger.level, logger.disabled)
    logger.addHandler(handler)
    logger.setLevel(logging.DEBUG)
    logger.disabled = False
    yield captured
    logger.removeHandler(handler)
    logger.level, logger.disabled = saved


@pytest.fixture
def db(tmp_path):
    service = DatabaseService(db_path=tmp_path / "cuepoint.db")
    MigrationRunner(service).migrate()
    yield service
    service.close_all()


@pytest.fixture
def tracks(db) -> TrackRepository:
    return TrackRepository(db)


@pytest.fixture
def files(db) -> FileStatusRepository:
    return FileStatusRepository(db)


@pytest.fixture
def store(tmp_path):
    opened = WaveformStore(tmp_path / "waveforms.db")
    yield opened
    opened.close_all()


@pytest.fixture
def decoder() -> Decoder:
    return Decoder()


@pytest.fixture
def make_service(files, store, decoder):
    def make(**overrides) -> WaveformService:
        options = dict(
            decoder=lambda: DECODER,
            decode_file=decoder,
            clock=lambda: NOW,
        )
        options.update(overrides)
        return WaveformService(files, store, **options)

    return make


@pytest.fixture
def service(make_service) -> WaveformService:
    return make_service()


@pytest.fixture
def music(tmp_path) -> Path:
    folder = tmp_path / "music"
    folder.mkdir()
    return folder


def add(tracks, db, paths: Sequence[str]) -> List[int]:
    prefix = uuid.uuid4().hex[:8]
    tracks.add_many(
        [
            LibraryTrack(
                rekordbox_track_id=f"{prefix}-{index}",
                title=f"T{index}",
                artist="A",
                file_path=path,
            )
            for index, path in enumerate(paths)
        ]
    )
    rows = db.connect().execute(
        "SELECT id, rekordbox_track_id FROM tracks WHERE rekordbox_track_id LIKE ?",
        (f"{prefix}-%",),
    )
    by_index = {int(r["rekordbox_track_id"].split("-")[1]): int(r["id"]) for r in rows}
    return [by_index[index] for index in range(len(paths))]


def check(files, track_id: int, path: str, status: str = FILE_PRESENT, reason=None):
    files.record(
        [
            TrackFileStatus(
                track_id,
                status,
                path,
                NOW,
                size_bytes=1 if status == FILE_PRESENT else None,
                reason=reason,
            )
        ]
    )


def audio(music: Path, name: str, content: bytes = b"audio") -> str:
    path = music / name
    path.write_bytes(content)
    return str(path)


def present(tracks, db, files, music, names: Sequence[str]) -> List[int]:
    paths = [audio(music, name) for name in names]
    ids = add(tracks, db, paths)
    for track_id, path in zip(ids, paths):
        check(files, track_id, path)
    return ids


def stored_rows(store: WaveformStore) -> List[sqlite3.Row]:
    return list(store.connect().execute("SELECT * FROM waveforms ORDER BY path"))


@pytest.mark.unit
class TestAnalysingOneFile:
    def test_a_decoded_file_is_stored_ready(
        self, service, store, tracks, db, files, music
    ):
        (track,) = present(tracks, db, files, music, ["a.flac"])
        path = str(music / "a.flac")
        info = os.stat(path)

        outcome = service.analyse(track)

        assert outcome.outcome == OUTCOME_READY
        assert outcome.wrote
        row = store.get(path, ANALYSIS_VERSION)
        assert row is not None and row.state == STORED_READY
        assert row.size_bytes == info.st_size
        assert row.mtime_ns == info.st_mtime_ns
        assert row.analysed_at == NOW
        expected = reduce(
            [envelope().full, envelope().low, envelope().mid, envelope().high], 20_000
        )
        assert row.duration_ms == 20_000
        assert decode(row.data) == expected
        assert decode(row.data).columns == COLUMNS

    def test_the_decoder_named_is_the_one_used(
        self, service, decoder, tracks, db, files, music
    ):
        (track,) = present(tracks, db, files, music, ["a.flac"])

        service.analyse(track)

        assert decoder.decoders == [DECODER]
        assert decoder.opened == [str(music / "a.flac")]

    @pytest.mark.parametrize("reason", ["undecodable", "no_audio", "timeout"])
    def test_each_failure_is_stored_with_its_reason(
        self, service, decoder, store, tracks, db, files, music, reason
    ):
        (track,) = present(tracks, db, files, music, ["a.mp3"])
        path = str(music / "a.mp3")
        decoder.answers[path] = DecodeFailed(reason, "detail")

        outcome = service.analyse(track)

        assert (outcome.outcome, outcome.reason) == (OUTCOME_FAILED, reason)
        row = store.get(path, ANALYSIS_VERSION)
        assert (row.state, row.reason, row.data, row.duration_ms) == (
            "failed",
            reason,
            None,
            None,
        )

    @pytest.mark.parametrize(
        "raised, expected",
        [
            (FileGone("gone"), OUTCOME_NOT_FOUND),
            (DecodeCancelled("x"), OUTCOME_CANCELLED),
            (DecoderUnavailable("dropped filter"), OUTCOME_UNAVAILABLE),
        ],
    )
    def test_outcomes_that_write_nothing(
        self, service, decoder, store, tracks, db, files, music, raised, expected
    ):
        (track,) = present(tracks, db, files, music, ["a.wav"])
        decoder.answers[str(music / "a.wav")] = raised

        outcome = service.analyse(track)

        assert outcome.outcome == expected
        assert not outcome.wrote
        assert store.count() == 0

    def test_a_decoder_that_cannot_analyse_blames_no_file(
        self, service, decoder, tracks, db, files, music
    ):
        (track,) = present(tracks, db, files, music, ["a.wav"])
        decoder.answers[str(music / "a.wav")] = DecoderUnavailable("dropped filter")

        assert service.analyse(track).reason == "decoder_missing"

    def test_no_decoder_opens_nothing(
        self, make_service, decoder, store, tracks, db, files, music
    ):
        (track,) = present(tracks, db, files, music, ["a.wav"])
        service = make_service(decoder=lambda: None)

        outcome = service.analyse(track)

        assert (outcome.outcome, outcome.reason) == (
            OUTCOME_UNAVAILABLE,
            "decoder_missing",
        )
        assert decoder.opened == []
        assert store.count() == 0
        assert not service.decoder_available()

    def test_a_truncated_file_is_a_waveform_carrying_its_errors(
        self, service, decoder, store, tracks, db, files, music
    ):
        (track,) = present(tracks, db, files, music, ["cut.flac"])
        decoder.answers[str(music / "cut.flac")] = envelope(errors=3)

        outcome = service.analyse(track)

        assert (outcome.outcome, outcome.decode_errors) == (OUTCOME_READY, 3)
        assert store.get(str(music / "cut.flac"), ANALYSIS_VERSION).is_ready

    def test_an_empty_envelope_is_no_audio(
        self, service, decoder, store, tracks, db, files, music
    ):
        (track,) = present(tracks, db, files, music, ["a.flac"])
        decoder.answers[str(music / "a.flac")] = Envelope(
            150, array("f"), array("f"), array("f"), array("f")
        )

        outcome = service.analyse(track)

        assert (outcome.outcome, outcome.reason) == (OUTCOME_FAILED, "no_audio")

    def test_a_cancel_before_the_decode_opens_nothing(
        self, service, decoder, store, tracks, db, files, music
    ):
        (track,) = present(tracks, db, files, music, ["a.flac"])

        outcome = service.analyse(track, cancel=lambda: True)

        assert outcome.outcome == OUTCOME_CANCELLED
        assert decoder.opened == []

    def test_the_cancel_reaches_the_decoder(
        self, service, decoder, tracks, db, files, music
    ):
        (track,) = present(tracks, db, files, music, ["a.flac"])
        seen = []

        def decode(cancel):
            seen.append(cancel)
            raise DecodeCancelled("x")

        decoder.answers[str(music / "a.flac")] = decode
        flag = {"now": False}

        def cancel() -> bool:
            answer = flag["now"]
            flag["now"] = True
            return answer

        assert service.analyse(track, cancel=cancel).outcome == OUTCOME_CANCELLED
        assert seen == [cancel]

    def test_an_unwritable_store_raises(
        self, make_service, tracks, db, files, music, tmp_path
    ):
        blocker = tmp_path / "blocker"
        blocker.write_text("x")
        service = make_service()
        service._store = WaveformStore(blocker / "waveforms.db")
        (track,) = present(tracks, db, files, music, ["a.flac"])

        with pytest.raises(WaveformStoreError):
            service.analyse(track)


@pytest.mark.unit
class TestOnlyPresentFilesAreOpened:
    def test_no_such_track(self, service, decoder):
        assert service.analyse(999_999).outcome == OUTCOME_NOT_FOUND
        assert decoder.opened == []

    def test_a_track_with_no_path(self, service, decoder, tracks, db):
        (track,) = add(tracks, db, [""])

        outcome = service.analyse(track)

        assert (outcome.outcome, outcome.reason) == (OUTCOME_NOT_PRESENT, "no_path")
        assert decoder.opened == []

    def test_a_track_never_checked(self, service, decoder, tracks, db, music):
        (track,) = add(tracks, db, [audio(music, "a.flac")])

        outcome = service.analyse(track)

        assert (outcome.outcome, outcome.reason) == (OUTCOME_NOT_PRESENT, "unchecked")
        assert decoder.opened == []

    def test_a_check_of_another_path_is_not_this_paths_check(
        self, service, decoder, tracks, db, files, music
    ):
        (track,) = add(tracks, db, [audio(music, "now.flac")])
        check(files, track, str(music / "before.flac"))

        outcome = service.analyse(track)

        assert (outcome.outcome, outcome.reason) == (OUTCOME_NOT_PRESENT, "unchecked")
        assert decoder.opened == []

    @pytest.mark.parametrize(
        "status, reason, expected",
        [
            (FILE_MISSING, None, "missing"),
            (FILE_MISSING, REASON_ROOT_UNAVAILABLE, "root_unavailable"),
            (FILE_UNREADABLE, None, "unreadable"),
        ],
    )
    def test_a_file_the_check_did_not_find(
        self, service, decoder, tracks, db, files, music, status, reason, expected
    ):
        path = audio(music, "a.flac")
        (track,) = add(tracks, db, [path])
        check(files, track, path, status, reason)

        outcome = service.analyse(track)

        assert (outcome.outcome, outcome.reason) == (OUTCOME_NOT_PRESENT, expected)
        assert decoder.opened == []

    def test_a_file_missing_at_open_writes_nothing(
        self, service, decoder, store, tracks, db, files, music
    ):
        (track,) = present(tracks, db, files, music, ["a.flac"])
        (music / "a.flac").unlink()

        outcome = service.analyse(track)

        assert outcome.outcome == OUTCOME_NOT_FOUND
        assert decoder.opened == []
        assert store.count() == 0

    def test_a_folder_at_the_path_is_not_a_file(
        self, service, decoder, store, tracks, db, files, music
    ):
        folder = music / "folder.flac"
        folder.mkdir()
        (track,) = add(tracks, db, [str(folder)])
        check(files, track, str(folder))

        assert service.analyse(track).outcome == OUTCOME_NOT_FOUND
        assert decoder.opened == []

    def test_a_stat_that_hangs_up_is_not_found(
        self, make_service, decoder, store, tracks, db, files, music
    ):
        (track,) = present(tracks, db, files, music, ["a.flac"])

        def refuse(path):
            raise PermissionError(path)

        outcome = make_service(stat=refuse).analyse(track)

        assert outcome.outcome == OUTCOME_NOT_FOUND
        assert store.count() == 0


@pytest.mark.unit
class TestWhenAStoredRowCounts:
    def test_the_same_file_is_not_decoded_twice(
        self, service, decoder, tracks, db, files, music
    ):
        (track,) = present(tracks, db, files, music, ["a.flac"])
        service.analyse(track)

        outcome = service.analyse(track)

        assert outcome.outcome == OUTCOME_CURRENT
        assert len(decoder.opened) == 1

    def test_a_changed_size_is_analysed_again(
        self, service, decoder, tracks, db, files, music
    ):
        (track,) = present(tracks, db, files, music, ["a.flac"])
        service.analyse(track)
        path = music / "a.flac"
        stamp = os.stat(path).st_mtime_ns
        path.write_bytes(b"longer audio")
        os.utime(path, ns=(stamp, stamp))

        assert service.analyse(track).outcome == OUTCOME_READY
        assert len(decoder.opened) == 2

    def test_a_changed_modified_time_is_analysed_again(
        self, service, decoder, tracks, db, files, music
    ):
        (track,) = present(tracks, db, files, music, ["a.flac"])
        service.analyse(track)
        path = music / "a.flac"
        stamp = os.stat(path).st_mtime_ns + 5_000_000_000
        os.utime(path, ns=(stamp, stamp))

        assert service.analyse(track).outcome == OUTCOME_READY
        assert len(decoder.opened) == 2

    def test_a_failed_file_is_not_retried_until_it_changes(
        self, service, decoder, tracks, db, files, music
    ):
        (track,) = present(tracks, db, files, music, ["bad.mp3"])
        path = music / "bad.mp3"
        decoder.answers[str(path)] = DecodeFailed("undecodable", "x")
        service.analyse(track)

        again = service.analyse(track)
        assert (again.outcome, again.reason) == (OUTCOME_CURRENT, "undecodable")
        assert len(decoder.opened) == 1

        path.write_bytes(b"a repaired download")
        del decoder.answers[str(path)]
        assert service.analyse(track).outcome == OUTCOME_READY
        assert len(decoder.opened) == 2

    def test_a_new_analysis_version_is_a_new_question(
        self, make_service, decoder, store, tracks, db, files, music
    ):
        (track,) = present(tracks, db, files, music, ["a.flac"])
        make_service(analysis_version=1).analyse(track)

        newer = make_service(analysis_version=2)

        assert newer.states([track])[0].state == STATE_WAITING
        assert newer.analyse(track).outcome == OUTCOME_READY
        assert len(decoder.opened) == 2
        assert store.count() == 1
        assert store.get(str(music / "a.flac"), 2) is not None

    def test_force_decodes_a_current_file(
        self, service, decoder, tracks, db, files, music
    ):
        (track,) = present(tracks, db, files, music, ["a.flac"])
        service.analyse(track)

        assert service.analyse(track, force=True).outcome == OUTCOME_READY
        assert len(decoder.opened) == 2


class RefusingFilesystem:
    """Every look at a file raises, so a state that looks is caught."""

    def __init__(self, monkeypatch) -> None:
        self.looks: List[str] = []

        def refuse(name: str):
            def inner(*args, **kwargs):
                self.looks.append(f"{name}{args[:1]}")
                raise AssertionError(f"{name} touched {args[:1]}")

            return inner

        for name in ("stat", "lstat", "open", "scandir", "listdir", "access"):
            monkeypatch.setattr(os, name, refuse(f"os.{name}"))
        monkeypatch.setattr(builtins, "open", refuse("open"))
        monkeypatch.setattr(os.path, "exists", refuse("os.path.exists"))
        monkeypatch.setattr(os.path, "isfile", refuse("os.path.isfile"))


@pytest.mark.unit
class TestStates:
    def test_each_state(self, make_service, decoder, tracks, db, files, music):
        service = make_service()
        ready, failed, waiting = present(
            tracks, db, files, music, ["ready.flac", "failed.mp3", "waiting.wav"]
        )
        decoder.answers[str(music / "failed.mp3")] = DecodeFailed("timeout", "x")
        service.analyse(ready)
        service.analyse(failed)
        missing_path = str(music / "missing.flac")
        missing, unchecked, no_path, root = add(
            tracks,
            db,
            [missing_path, audio(music, "unchecked.flac"), "", "/Volumes/X/a.flac"],
        )
        check(files, missing, missing_path, FILE_MISSING)
        check(files, root, "/Volumes/X/a.flac", FILE_MISSING, REASON_ROOT_UNAVAILABLE)

        states = {
            s.track_id: (s.state, s.reason, s.duration_ms)
            for s in service.states(
                [ready, failed, waiting, missing, unchecked, no_path, root]
            )
        }

        assert states == {
            ready: (STATE_READY, None, 20_000),
            failed: (STATE_FAILED, "timeout", None),
            waiting: (STATE_WAITING, None, None),
            missing: (STATE_MISSING, "missing", None),
            unchecked: (STATE_UNCHECKED, None, None),
            no_path: (STATE_MISSING, "no_path", None),
            root: (STATE_MISSING, "root_unavailable", None),
        }

    def test_unavailable_replaces_waiting_only(
        self, make_service, tracks, db, files, music
    ):
        ready, waiting = present(
            tracks, db, files, music, ["ready.flac", "waiting.flac"]
        )
        make_service().analyse(ready)
        blind = make_service(decoder=lambda: None)

        states = {s.track_id: s.state for s in blind.states([ready, waiting])}

        assert states == {ready: STATE_READY, waiting: STATE_UNAVAILABLE}

    def test_a_stored_picture_answers_for_a_missing_file(
        self, service, tracks, db, files, music
    ):
        (track,) = present(tracks, db, files, music, ["a.flac"])
        service.analyse(track)
        check(files, track, str(music / "a.flac"), FILE_MISSING)

        assert service.states([track])[0].state == STATE_READY

    def test_states_never_open_or_stat_a_file(
        self, make_service, tracks, db, files, music, monkeypatch
    ):
        service = make_service()
        ids = present(tracks, db, files, music, ["a.flac", "b.flac", "c.flac"])
        service.analyse(ids[0])
        # Both databases are open before the filesystem starts refusing.
        service.states(ids)

        refusing = RefusingFilesystem(monkeypatch)
        states = service.states(ids)
        answers = service.waveforms(ids, 120)

        assert refusing.looks == []
        assert [s.state for s in states] == [STATE_READY, STATE_WAITING, STATE_WAITING]
        assert answers[0].data is not None

    def test_order_duplicates_and_strangers(self, service, tracks, db, files, music):
        a, b = present(tracks, db, files, music, ["a.flac", "b.flac"])

        states = service.states([b, 999_999, a, b])

        assert [s.track_id for s in states] == [b, a]

    def test_each_batch_of_200_costs_one_query_of_each_database(
        self, make_service, tracks, db, files, store, music
    ):
        names = [f"{index:04d}.flac" for index in range(450)]
        ids = present(tracks, db, files, music, names)
        calls = {"library": 0, "store": 0, "rows": 0}
        original_files = files.current_files
        original_store = store.summaries
        original_rows = store.get_many

        def counted_files(track_ids):
            calls["library"] += 1
            assert len(list(track_ids)) <= STATE_BATCH
            return original_files(track_ids)

        def counted_store(paths, version):
            calls["store"] += 1
            return original_store(paths, version)

        def counted_rows(paths, version):
            calls["rows"] += 1
            return original_rows(paths, version)

        files.current_files = counted_files
        store.summaries = counted_store
        store.get_many = counted_rows
        service = make_service()

        assert len(service.states(ids)) == 450
        assert calls == {"library": 3, "store": 3, "rows": 0}
        assert len(service.waveforms(ids, 120)) == 450
        assert calls == {"library": 6, "store": 3, "rows": 3}

    def test_a_restored_library_with_new_ids_finds_its_waveforms_by_path(
        self, service, tracks, db, files, music
    ):
        (old,) = present(tracks, db, files, music, ["a.flac"])
        service.analyse(old)
        tracks.delete(old)

        (new,) = add(tracks, db, [str(music / "a.flac")])
        check(files, new, str(music / "a.flac"))

        assert new != old
        assert service.states([new])[0].state == STATE_READY
        assert service.waveform(new, 1_200).data is not None

    def test_an_unreadable_store_answers_as_empty(
        self, service, store, tracks, db, files, music, logs, monkeypatch
    ):
        (track,) = present(tracks, db, files, music, ["a.flac"])
        service.analyse(track)

        def broken(*args, **kwargs):
            raise WaveformStoreError(message="disk", error_code="WAVEFORM_STORE_IO")

        monkeypatch.setattr(store, "summaries", broken)
        monkeypatch.setattr(store, "get_many", broken)
        with logs:
            assert service.states([track])[0].state == STATE_WAITING
            assert service.waveform(track, 120).data is None

        assert "could not be read" in logs.text


@pytest.mark.unit
class TestWaveforms:
    def test_a_ready_track_answers_its_picture_at_the_width(
        self, service, store, tracks, db, files, music
    ):
        (track,) = present(tracks, db, files, music, ["a.flac"])
        service.analyse(track)
        stored = decode(store.get(str(music / "a.flac"), ANALYSIS_VERSION).data)

        for width in (16, 120, 600, 1_200):
            answer = service.waveform(track, width)
            assert answer.width == width
            assert answer.state.state == STATE_READY
            assert answer.data == downsample(stored.data, width)

    def test_a_track_without_one_answers_its_state(
        self, service, tracks, db, files, music
    ):
        (track,) = present(tracks, db, files, music, ["a.flac"])

        answer = service.waveform(track, 120)

        assert (answer.state.state, answer.data) == (STATE_WAITING, None)

    def test_not_a_track(self, service):
        assert service.waveform(999_999, 120) is None

    @pytest.mark.parametrize("width", [0, 15, 1_201, True])
    def test_a_width_out_of_range_is_refused(self, service, width):
        with pytest.raises(ValueError, match="width"):
            service.waveforms([1], width)

    def test_a_stored_picture_that_does_not_decode_is_refused_whole(
        self, service, store, tracks, db, files, music, logs
    ):
        (track,) = present(tracks, db, files, music, ["a.flac"])
        service.analyse(track)
        path = str(music / "a.flac")
        good = store.get(path, ANALYSIS_VERSION)
        blob = bytearray(good.data)
        blob[-3] ^= 0xFF
        store.put(
            StoredWaveform(
                path=path,
                size_bytes=good.size_bytes,
                mtime_ns=good.mtime_ns,
                analysis_version=ANALYSIS_VERSION,
                state=STORED_READY,
                analysed_at=NOW,
                duration_ms=good.duration_ms,
                data=bytes(blob),
            )
        )

        with logs:
            answer = service.waveform(track, 120)

        assert (answer.state.state, answer.data) == (STATE_WAITING, None)
        assert store.get(path, ANALYSIS_VERSION) is None
        assert "refused" in logs.text
        # And the next analysis makes it again.
        assert service.analyse(track).outcome == OUTCOME_READY

    def test_another_format_version_is_refused_and_analysed_again(
        self, service, store, tracks, db, files, music
    ):
        (track,) = present(tracks, db, files, music, ["a.flac"])
        service.analyse(track)
        path = str(music / "a.flac")
        good = store.get(path, ANALYSIS_VERSION)
        blob = bytearray(good.data)
        blob[4] = 99
        store.put(
            StoredWaveform(
                **{**good.summary.__dict__, "analysed_at": NOW},
                data=bytes(blob),
            )
        )

        assert service.waveform(track, 1_200).state.state == STATE_WAITING
        assert service.analyse(track).outcome == OUTCOME_READY


@pytest.mark.unit
class TestTheWiring:
    def test_the_engine_resolves_one_store_beside_the_library(
        self, tmp_path, monkeypatch
    ):
        from cuepoint.services.bootstrap import bootstrap_services
        from cuepoint.services.interfaces import IDatabaseService, IWaveformService
        from cuepoint.utils.di_container import get_container, reset_container

        reset_container()
        bootstrap_services()
        container = get_container()
        try:
            first = container.resolve(WaveformStore)
            second = container.resolve(WaveformStore)
            service = container.resolve(IWaveformService)
            database = container.resolve(IDatabaseService)

            assert first is second
            assert isinstance(service, WaveformService)
            assert first.path == database.db_path.parent / "waveforms.db"
            assert service._store is first
            assert service.states([]) == []
        finally:
            first.close_all()
            reset_container()

    def test_encode_is_what_is_stored(self):
        # The service stores core's encoding, not one of its own.
        waveform = reduce([[0.5] * 1_200] * 4, 1_000)
        assert decode(encode(waveform)) == waveform
