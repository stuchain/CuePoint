#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""One file's analysis through a real mpv, into a real store (WAVE-02).

The unit tests prove what the service decides from what a decoder says; these
prove the whole path with a real one: every shipped format analyses into a
stored waveform of its own length, the bands land in their named columns, a
broken file is stored as failed and not retried, and a second analysis of an
unchanged file decodes nothing.

The decoder is found as ``test_audio_decode_binary.py`` finds it: the bundled
sidecar, then ``CUEPOINT_MPV_PATH``, then an ``mpv`` on the ``PATH``. Every test
skips when there is none.
"""

from __future__ import annotations

import importlib.util
import os
import shutil
import sys
from pathlib import Path
from typing import Optional

import mutagen
import pytest

from cuepoint.core.waveform import BANDS, COLUMNS, decode
from cuepoint.data.audio_decode import ANALYSIS_VERSION
from cuepoint.models.file_status import FILE_PRESENT, TrackFileStatus
from cuepoint.models.library_track import LibraryTrack
from cuepoint.models.waveform import (
    OUTCOME_CURRENT,
    OUTCOME_FAILED,
    OUTCOME_READY,
    STATE_FAILED,
    STATE_READY,
)
from cuepoint.persistence.file_status_repository import FileStatusRepository
from cuepoint.persistence.track_repository import TrackRepository
from cuepoint.persistence.waveform_store import WaveformStore
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.migration_runner import MigrationRunner
from cuepoint.services.waveform_service import WaveformService

pytestmark = pytest.mark.integration

_REPO = Path(__file__).resolve().parents[3]
_FIXTURES = _REPO / "src" / "tests" / "fixtures" / "audio"
_SCRIPT = _REPO / "scripts" / "fetch_player_sidecar.py"
FORMAT_FIXTURES = ("tone.wav", "tone.flac", "tone.aiff", "tone.m4a", "tone.mp3")
#: The fixtures that hold a tone; tone.mp3 is silence, as in WAVE-01's tests.
TONAL = {"tone.wav", "tone.flac", "tone.aiff", "tone.m4a"}
NOW = "2026-09-30T12:00:00+00:00"


def _bundled() -> Optional[Path]:
    spec = importlib.util.spec_from_file_location("fetch_player_sidecar", _SCRIPT)
    assert spec and spec.loader
    fps = importlib.util.module_from_spec(spec)
    sys.modules.setdefault(spec.name, fps)
    spec.loader.exec_module(fps)
    target = fps.load_manifest().targets.get(fps.host_target_key())
    if target is None or not target.supported:
        return None
    path = Path(fps.binary_path_for(target, fps.DEFAULT_DEST))
    return path if path.exists() else None


@pytest.fixture(scope="module")
def mpv() -> Path:
    for candidate in (
        _bundled(),
        os.environ.get("CUEPOINT_MPV_PATH"),
        shutil.which("mpv"),
    ):
        if candidate and Path(candidate).is_file():
            return Path(candidate)
    pytest.skip(
        "no mpv: run `python scripts/fetch_player_sidecar.py`, or set CUEPOINT_MPV_PATH"
    )


@pytest.fixture
def library(tmp_path, mpv):
    db = DatabaseService(db_path=tmp_path / "cuepoint.db")
    MigrationRunner(db).migrate()
    store = WaveformStore(tmp_path / "waveforms.db")
    files = FileStatusRepository(db)
    service = WaveformService(files, store, decoder=lambda: mpv)
    yield db, files, store, service
    store.close_all()
    db.close_all()


def add_present(db, files, path: Path) -> int:
    TrackRepository(db).add(
        LibraryTrack(
            rekordbox_track_id=path.name,
            title=path.stem,
            artist="A",
            file_path=str(path),
        )
    )
    track_id = int(
        db.connect()
        .execute("SELECT id FROM tracks WHERE rekordbox_track_id = ?", (path.name,))
        .fetchone()["id"]
    )
    files.record(
        [
            TrackFileStatus(
                track_id, FILE_PRESENT, str(path), NOW, size_bytes=path.stat().st_size
            )
        ]
    )
    return track_id


@pytest.mark.parametrize("name", FORMAT_FIXTURES)
def test_each_shipped_format_analyses_into_a_stored_waveform(library, tmp_path, name):
    db, files, store, service = library
    copy = tmp_path / name
    shutil.copyfile(_FIXTURES / name, copy)
    track = add_present(db, files, copy)

    outcome = service.analyse(track)

    assert outcome.outcome == OUTCOME_READY, outcome
    row = store.get(str(copy), ANALYSIS_VERSION)
    waveform = decode(row.data)
    assert waveform.columns == COLUMNS
    length_ms = float(mutagen.File(copy).info.length) * 1000
    # Within two envelope samples of the container's own length; MP3's
    # encoder delay and padding are the widest of the formats.
    assert abs(waveform.duration_ms - length_ms) <= 2 * 1000 / 150 + 30
    if name in TONAL:
        assert max(waveform.band("full")) > 100
    else:
        # Silence is a waveform too: flat, not a failure.
        assert max(waveform.band("full")) < 10
    state = service.states([track])[0]
    assert (state.state, state.duration_ms) == (STATE_READY, waveform.duration_ms)
    assert len(service.waveform(track, 120).data) == 480


def test_the_bands_land_in_their_named_columns(library, tmp_path):
    # bands.flac: 60 Hz, then 1 kHz, then 6 kHz, one third each.
    db, files, store, service = library
    copy = tmp_path / "bands.flac"
    shutil.copyfile(_FIXTURES / "bands.flac", copy)
    track = add_present(db, files, copy)

    assert service.analyse(track).outcome == OUTCOME_READY

    waveform = decode(store.get(str(copy), ANALYSIS_VERSION).data)
    third = COLUMNS // 3
    margin = 20
    for section, band in enumerate(("low", "mid", "high")):
        columns = range(section * third + margin, (section + 1) * third - margin)
        own = min(waveform.band(band)[c] for c in columns)
        for other in BANDS[1:]:
            if other != band:
                assert max(waveform.band(other)[c] for c in columns) < own / 2, (
                    section,
                    band,
                    other,
                )


def test_an_unchanged_file_is_not_decoded_again(library, tmp_path):
    db, files, store, service = library
    copy = tmp_path / "tone.flac"
    shutil.copyfile(_FIXTURES / "tone.flac", copy)
    track = add_present(db, files, copy)
    service.analyse(track)
    first = store.get(str(copy), ANALYSIS_VERSION)

    assert service.analyse(track).outcome == OUTCOME_CURRENT
    assert store.get(str(copy), ANALYSIS_VERSION) == first


def test_a_broken_file_is_stored_as_failed_and_not_retried(library, tmp_path):
    db, files, store, service = library
    broken = tmp_path / "broken.mp3"
    broken.write_bytes(b"\x00not audio at all" * 4096)
    track = add_present(db, files, broken)

    outcome = service.analyse(track)

    assert outcome.outcome == OUTCOME_FAILED
    assert outcome.reason in ("undecodable", "no_audio")
    assert service.states([track])[0].state == STATE_FAILED
    assert service.analyse(track).outcome == OUTCOME_CURRENT
