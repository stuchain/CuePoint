#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""One file's analysis, and any track's waveform state (WAVE-02, DEC-122).

Three questions, each answered from the library database and ``waveforms.db``
together:

- :meth:`WaveformService.analyse` analyses one track's file into a stored
  waveform. It opens only a file the last file check found present at the
  track's current path (fact 6), and writes nothing but the store.
- :meth:`WaveformService.states` answers each track's state without touching a
  file: no ``stat``, no open.
- :meth:`WaveformService.waveforms` answers each track's picture at a width,
  or the state that explains why there is none.

The path
--------
A track's file is :meth:`IFileStatusRepository.current_files`'s answer: the
library's path, exactly as the file check records it, and the check made at
that path. The store is keyed by the same string, so a restored backup or a
fresh import that gives tracks new ids finds every waveform by path.

When a stored row counts
------------------------
A row answers for a file when its path matches and its analysis version is the
decoder's current one. :meth:`analyse` also compares the size and modified time
with a fresh ``stat``: a row that matches, and has nothing left to measure, is
:data:`OUTCOME_CURRENT` and the file is not decoded again, whether the row is
ready or failed.

A ready row has something left to measure when its loudness (WAVE-08) is
missing or of another ``LOUDNESS_VERSION``: a store analysed before loudness
was measured. Such a file is decoded again in full, and its picture written
again, the same, with its loudness. Until then its waveform is drawn, and its
state carries no loudness. A failed row is
retried only when the file changes or the analysis version does, as DEC-076's
refused pictures are. A display never calls ``stat``: it shows what the store
holds for the current version, and the next analysis replaces a changed file's
row.

The ``stat`` is taken before the decode and stored with its result. A file
still being written when it was decoded is a different size by the next run,
which analyses it again.

What raises
-----------
Nothing a file contains. :meth:`analyse` answers every outcome of WAVE-01's
vocabulary as an :class:`AnalysisOutcome`, and raises only
:class:`WaveformStoreError`, for a store it cannot write. A display read that
finds the store unreadable logs it and answers as if the store were empty: a
track with no picture is the truth as far as anyone can tell, and the analysis
job, which writes, is what reports the store as broken.
"""

from __future__ import annotations

import logging
import os
import stat as stat_module
from pathlib import Path
from typing import Callable, Dict, Iterable, List, Optional, Sequence, TypeVar

from cuepoint.core.waveform import (
    COLUMNS,
    MIN_WIDTH,
    WaveformFormatError,
    decode,
    downsample,
    encode,
    reduce,
)
from cuepoint.data.audio_decode import (
    ANALYSIS_VERSION,
    LOUDNESS_VERSION,
    REASON_DECODER_MISSING,
    REASON_NO_AUDIO,
    DecodeCancelled,
    DecodeFailed,
    DecoderUnavailable,
    Envelope,
    FileGone,
    Loudness,
    decode_envelope,
    decoder_from_env,
)
from cuepoint.models.file_status import FILE_PRESENT, CurrentFile
from cuepoint.models.library_track import utc_now_iso
from cuepoint.models.waveform import (
    OUTCOME_CANCELLED,
    OUTCOME_CURRENT,
    OUTCOME_FAILED,
    OUTCOME_NOT_FOUND,
    OUTCOME_NOT_PRESENT,
    OUTCOME_READY,
    OUTCOME_UNAVAILABLE,
    REASON_NO_PATH,
    STATE_FAILED,
    STATE_MISSING,
    STATE_READY,
    STATE_UNAVAILABLE,
    STATE_UNCHECKED,
    STATE_WAITING,
    STORED_FAILED,
    STORED_READY,
    AnalysisOutcome,
    StoredLoudness,
    StoredWaveform,
    WaveformAnswer,
    WaveformState,
    WaveformSummary,
)
from cuepoint.persistence.id_chunks import unique_ids
from cuepoint.persistence.waveform_store import WaveformStore, WaveformStoreError
from cuepoint.services.interfaces import IFileStatusRepository, IWaveformService

_logger = logging.getLogger(__name__)

_Row = TypeVar("_Row", WaveformSummary, StoredWaveform)

#: Tracks per batch: one library query and one store query each.
STATE_BATCH = 200

#: Why a present file with no path reason was not opened: nobody checked it.
REASON_UNCHECKED = "unchecked"

#: Decodes one file: ``(source, decoder, cancel) -> Envelope``, raising WAVE-01's
#: vocabulary. :func:`decode_envelope` in the engine; a stand-in in tests.
Decode = Callable[[str, Path, Optional[Callable[[], bool]]], Envelope]


def _decode_with_mpv(
    source: str, decoder: Path, cancel: Optional[Callable[[], bool]]
) -> Envelope:
    return decode_envelope(source, decoder, cancel=cancel)


class WaveformService(IWaveformService):
    """Analyses files into the waveform store and answers from it."""

    def __init__(
        self,
        file_status_repository: IFileStatusRepository,
        store: WaveformStore,
        *,
        decoder: Callable[[], Optional[Path]] = decoder_from_env,
        decode_file: Decode = _decode_with_mpv,
        stat: Callable[[str], os.stat_result] = os.stat,
        clock: Callable[[], str] = utc_now_iso,
        analysis_version: int = ANALYSIS_VERSION,
        loudness_version: int = LOUDNESS_VERSION,
    ) -> None:
        """Wire the service.

        Args:
            file_status_repository: The library's paths and file checks.
            store: ``waveforms.db``.
            decoder: The decoder to use now, or ``None``. Asked at each use, so
                an engine given none says so rather than failing each file.
            decode_file: Decodes one file.
            stat: ``os.stat``; a stand-in in tests.
            clock: The time an analysis is stamped with.
            analysis_version: The version rows are stored and read at.
            loudness_version: The version loudness is stored and read at.
        """
        self._files = file_status_repository
        self._store = store
        self._decoder = decoder
        self._decode = decode_file
        self._stat = stat
        self._clock = clock
        self._version = int(analysis_version)
        self._loudness_version = int(loudness_version)

    @property
    def analysis_version(self) -> int:
        """The version this service stores and reads."""
        return self._version

    @property
    def loudness_version(self) -> int:
        """The loudness version this service stores and reads (WAVE-08)."""
        return self._loudness_version

    def decoder_available(self) -> bool:
        """True when there is a decoder to analyse with."""
        return self._decoder() is not None

    # ------------------------------------------------------------ analyse

    def analyse(
        self,
        track_id: int,
        *,
        cancel: Optional[Callable[[], bool]] = None,
        force: bool = False,
    ) -> AnalysisOutcome:
        """Analyse one track's file into the store.

        1. Resolve the track's current path and the check made there. A file
           the check did not find present is not opened.
        2. ``stat`` it. A file missing now is :data:`OUTCOME_NOT_FOUND`, and
           nothing is written.
        3. Unless ``force``, a stored row of this version with the same size
           and modified time, and nothing left to measure, already answers:
           :data:`OUTCOME_CURRENT`.
        4. Decode, reduce, encode, and write the row, ready or failed, with its
           loudness, in one transaction.

        Args:
            track_id: The track.
            cancel: Polled while the decoder runs.
            force: Decode even when a stored row already answers.

        Raises:
            WaveformStoreError: If the store cannot be read or written.
        """
        track_id = int(track_id)
        found = self._files.current_files([track_id])
        if not found:
            return AnalysisOutcome(track_id, OUTCOME_NOT_FOUND)
        current = found[0]
        if not current.path.strip():
            return AnalysisOutcome(track_id, OUTCOME_NOT_PRESENT, REASON_NO_PATH)
        if not current.is_present:
            return AnalysisOutcome(
                track_id,
                OUTCOME_NOT_PRESENT,
                current.reason or current.status or REASON_UNCHECKED,
            )
        decoder = self._decoder()
        if decoder is None:
            return AnalysisOutcome(
                track_id, OUTCOME_UNAVAILABLE, REASON_DECODER_MISSING
            )
        if cancel is not None and cancel():
            return AnalysisOutcome(track_id, OUTCOME_CANCELLED)

        path = current.path
        try:
            info = self._stat(path)
        except (OSError, ValueError):
            return AnalysisOutcome(track_id, OUTCOME_NOT_FOUND)
        if not stat_module.S_ISREG(info.st_mode):
            return AnalysisOutcome(track_id, OUTCOME_NOT_FOUND)
        size, mtime_ns = int(info.st_size), int(info.st_mtime_ns)

        if not force:
            stored = self._store.summaries([path], self._version).get(path)
            if (
                stored is not None
                and stored.counts_for(size, mtime_ns)
                and stored.measured(self._loudness_version)
            ):
                return AnalysisOutcome(track_id, OUTCOME_CURRENT, stored.reason)

        try:
            envelope = self._decode(path, decoder, cancel)
        except FileGone:
            return AnalysisOutcome(track_id, OUTCOME_NOT_FOUND)
        except DecodeCancelled:
            return AnalysisOutcome(track_id, OUTCOME_CANCELLED)
        except DecoderUnavailable:
            # The decoder cannot analyse anything, so no file is blamed.
            return AnalysisOutcome(
                track_id, OUTCOME_UNAVAILABLE, REASON_DECODER_MISSING
            )
        except DecodeFailed as failure:
            self._store.put(self._failed_row(path, size, mtime_ns, failure.reason))
            return AnalysisOutcome(track_id, OUTCOME_FAILED, failure.reason)

        if envelope.frames == 0:
            self._store.put(self._failed_row(path, size, mtime_ns, REASON_NO_AUDIO))
            return AnalysisOutcome(track_id, OUTCOME_FAILED, REASON_NO_AUDIO)
        waveform = reduce(
            [envelope.full, envelope.low, envelope.mid, envelope.high],
            envelope.duration_ms,
        )
        self._store.put(
            StoredWaveform(
                path=path,
                size_bytes=size,
                mtime_ns=mtime_ns,
                analysis_version=self._version,
                state=STORED_READY,
                analysed_at=self._clock(),
                duration_ms=waveform.duration_ms,
                data=encode(waveform),
                loudness=self._reading(envelope.loudness),
            )
        )
        return AnalysisOutcome(
            track_id, OUTCOME_READY, decode_errors=envelope.decode_errors
        )

    def _reading(self, loudness: Loudness) -> StoredLoudness:
        return StoredLoudness(
            loudness_version=self._loudness_version,
            integrated_lufs=loudness.integrated_lufs,
            peak_dbfs=loudness.peak_dbfs,
            reason=loudness.reason,
        )

    def _failed_row(
        self, path: str, size: int, mtime_ns: int, reason: str
    ) -> StoredWaveform:
        return StoredWaveform(
            path=path,
            size_bytes=size,
            mtime_ns=mtime_ns,
            analysis_version=self._version,
            state=STORED_FAILED,
            analysed_at=self._clock(),
            reason=reason,
        )

    # ------------------------------------------------------------- states

    def states(self, track_ids: Iterable[int]) -> List[WaveformState]:
        """Each track's state, in the order given; ids that are not tracks are left out.

        Touches no file. Up to :data:`STATE_BATCH` tracks cost one library
        query and one store query.
        """
        answers: List[WaveformState] = []
        available = self.decoder_available()
        for batch in _batches(track_ids):
            files = self._files.current_files(batch)
            stored = self._read(self._summaries, files)
            answers.extend(
                _state(
                    current,
                    stored.get(current.path),
                    available,
                    self._loudness_version,
                )
                for current in files
            )
        return answers

    def waveforms(self, track_ids: Iterable[int], width: int) -> List[WaveformAnswer]:
        """Each track's picture at ``width`` columns, or its state.

        In the order given; ids that are not tracks are left out. A stored
        picture that does not decode is refused whole: it is logged, its row
        deleted so the next analysis makes it again, and the track answers as
        if it had none.

        Raises:
            ValueError: If ``width`` is not :data:`MIN_WIDTH` to :data:`COLUMNS`.
        """
        if isinstance(width, bool) or not MIN_WIDTH <= int(width) <= COLUMNS:
            raise ValueError(f"width must be {MIN_WIDTH} to {COLUMNS}, not {width!r}")
        width = int(width)
        answers: List[WaveformAnswer] = []
        available = self.decoder_available()
        for batch in _batches(track_ids):
            files = self._files.current_files(batch)
            stored = self._read(self._rows, files)
            for current in files:
                row = stored.get(current.path)
                data: Optional[bytes] = None
                if row is not None and row.is_ready and row.data is not None:
                    data = self._picture(row, width)
                    if data is None:
                        row = None
                state = _state(current, row, available, self._loudness_version)
                answers.append(WaveformAnswer(state, width, data))
        return answers

    def waveform(self, track_id: int, width: int) -> Optional[WaveformAnswer]:
        """One track's picture at ``width``, or ``None`` when it is not a track."""
        found = self.waveforms([track_id], width)
        return found[0] if found else None

    # ------------------------------------------------------------ helpers

    def _read(
        self,
        query: Callable[[List[str]], Dict[str, _Row]],
        files: Sequence[CurrentFile],
    ) -> Dict[str, _Row]:
        paths = [current.path for current in files if current.path]
        if not paths:
            return {}
        try:
            return query(paths)
        except WaveformStoreError as exc:
            _logger.warning("[waveforms] The store could not be read: %s", exc)
            return {}

    def _summaries(self, paths: List[str]) -> Dict[str, WaveformSummary]:
        return self._store.summaries(paths, self._version)

    def _rows(self, paths: List[str]) -> Dict[str, StoredWaveform]:
        return self._store.get_many(paths, self._version)

    def _picture(self, row: StoredWaveform, width: int) -> Optional[bytes]:
        """A stored picture at ``width``, or ``None`` when it does not decode."""
        assert row.data is not None
        try:
            return downsample(decode(row.data).data, width)
        except (WaveformFormatError, ValueError) as exc:
            _logger.warning(
                "[waveforms] A stored waveform was refused and will be analysed"
                " again: %s",
                exc,
            )
            try:
                self._store.delete(row.path)
            except WaveformStoreError:
                pass
            return None


def _batches(track_ids: Iterable[int]) -> Iterable[List[int]]:
    wanted = unique_ids(track_ids)
    for start in range(0, len(wanted), STATE_BATCH):
        yield wanted[start : start + STATE_BATCH]


def _state(
    current: CurrentFile,
    stored: Optional[WaveformSummary],
    available: bool,
    loudness_version: int,
) -> WaveformState:
    """A track's state from its file, its stored row and the decoder.

    A stored row answers first: a picture made from the file at this path is
    still that file's picture when its drive is unplugged or the decoder is
    gone. Without one, the file check says why there is none, and a present
    file without one is waiting, or unavailable when nothing can analyse it.

    A ready row's loudness answers only at ``loudness_version``; one of another
    version is measured again, and until then the track has none.
    """
    track_id = current.track_id
    if stored is not None:
        if stored.is_ready:
            return WaveformState(
                track_id,
                STATE_READY,
                duration_ms=stored.duration_ms,
                loudness=(
                    stored.loudness if stored.measured(loudness_version) else None
                ),
            )
        return WaveformState(track_id, STATE_FAILED, stored.reason)
    if not current.path.strip():
        return WaveformState(track_id, STATE_MISSING, REASON_NO_PATH)
    if current.status is None:
        return WaveformState(track_id, STATE_UNCHECKED)
    if current.status != FILE_PRESENT:
        return WaveformState(track_id, STATE_MISSING, current.reason or current.status)
    if not available:
        return WaveformState(track_id, STATE_UNAVAILABLE)
    return WaveformState(track_id, STATE_WAITING)


__all__: Sequence[str] = (
    "Decode",
    "REASON_UNCHECKED",
    "STATE_BATCH",
    "WaveformService",
)
