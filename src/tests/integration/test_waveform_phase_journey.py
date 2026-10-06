#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Phase 11's journey, the engine half, on every build (WAVE-07).

``e2e/waveformJourney.spec.ts`` takes the phase's nine steps through the app;
this takes the engine's part of each through its own routes, against a real
engine over a real library database and a real ``waveforms.db``, so every
build proves them and each step's outcome is read back rather than assumed:

1. A library with real audio files and Rekordbox cues, imported.
2. The file check and then the analysis follow it without a call, until every
   file is analysed.
3. The Library column's batch: every track's picture at width 120, each with
   its loudness (WAVE-08).
4. The Inspector's read: the bar's width, with the hot cue at its time, and
   the loudness its line says.
5. Playing and seeking are the player's, in Electron; the engine's part is a
   track put first in the analysis, which, analysed already, decodes nothing.
6. A pause, kept across a relaunch, and a resume.
7. A file changed on disk and a refresh: the check, then that file analysed
   again, and no other.
8. A Set with planned times: the plan, and the two pictures and loudness
   readings the transition strip reads.
9. "Delete waveform data", and the whole library analysed again.

The decoder is a real ``mpv`` when one is found, as the binary tests find it:
the bundled sidecar, then ``CUEPOINT_MPV_PATH``, then one on the ``PATH``.
Without one, every build still runs the journey, with the decode itself stood
in for: the decoder named to the engine is a file, and decoding it answers a
plausible envelope. Either way each decode is recorded, which is how step 7
knows which files were opened.
"""

from __future__ import annotations

import base64
import importlib.util
import os
import shutil
import sys
import threading
import time
from pathlib import Path
from typing import Callable, Dict, List, Optional

import pytest

from tests.fixtures.job_settling import wait_until_settled
from tests.fixtures.waveform_library import LOUDNESS, envelope
from tests.unit.engine.test_engine_library_refresh import (  # noqa: F401
    APPLY,
    PREVIEW,
    TOKEN,
    diff_store,
    do_import,
    engine,
    library_db,
    request,
    wait_for_job,
)

pytestmark = pytest.mark.integration

_REPO = Path(__file__).resolve().parents[3]
_AUDIO = _REPO / "src" / "tests" / "fixtures" / "audio"

#: The library: file, title. Bands carries the hot cue and a grid.
FILES = (
    ("bands.flac", "Bands"),
    ("tone.flac", "Tone FLAC"),
    ("tone.wav", "Tone WAV"),
    ("tone.aiff", "Tone AIFF"),
)
HOT_CUE_MS = 2_000


def _bundled_mpv() -> Optional[Path]:
    script = _REPO / "scripts" / "fetch_player_sidecar.py"
    spec = importlib.util.spec_from_file_location("fetch_player_sidecar", script)
    assert spec and spec.loader
    fps = importlib.util.module_from_spec(spec)
    sys.modules.setdefault(spec.name, fps)
    spec.loader.exec_module(fps)
    target = fps.load_manifest().targets.get(fps.host_target_key())
    if target is None or not target.supported:
        return None
    path = Path(fps.binary_path_for(target, fps.DEFAULT_DEST))
    return path if path.exists() else None


def _real_mpv() -> Optional[Path]:
    for candidate in (
        _bundled_mpv(),
        os.environ.get("CUEPOINT_MPV_PATH"),
        shutil.which("mpv"),
    ):
        if candidate and Path(candidate).is_file():
            return Path(candidate)
    return None


class Decodes:
    """Every file the engine decoded, in order."""

    def __init__(self, real: bool = False) -> None:
        self.real = real
        self._lock = threading.Lock()
        self._opened: List[str] = []

    def bands_loudness(self) -> dict:
        """What ``bands.flac`` reads (WAVE-08): the pinned decoder's, or the stand-in's."""
        if self.real:
            return {"integrated_lufs": -3.5, "peak_dbfs": -4.3, "reason": None}
        return {
            "integrated_lufs": LOUDNESS.integrated_lufs,
            "peak_dbfs": LOUDNESS.peak_dbfs,
            "reason": LOUDNESS.reason,
        }

    def add(self, source: str) -> None:
        with self._lock:
            self._opened.append(Path(source).name)

    def names(self) -> List[str]:
        with self._lock:
            return list(self._opened)

    def clear(self) -> None:
        with self._lock:
            self._opened.clear()


@pytest.fixture
def decodes(tmp_path, monkeypatch) -> Decodes:
    """The decoder the engine is given: a real one, or a stand-in; each decode recorded."""
    from cuepoint.data import audio_decode
    from cuepoint.services import waveform_service

    real = _real_mpv()
    record = Decodes(real=real is not None)
    if real is not None:
        monkeypatch.setenv(audio_decode.DECODER_PATH_ENV, str(real))
        decode: Callable[..., audio_decode.Envelope] = waveform_service.decode_envelope
    else:
        stand_in = tmp_path / "decoder"
        stand_in.write_bytes(b"")
        monkeypatch.setenv(audio_decode.DECODER_PATH_ENV, str(stand_in))

        def decode(source, decoder, cancel=None):  # noqa: ARG001
            return envelope()

    def recorded(source, decoder, cancel=None):
        record.add(source)
        return decode(source, decoder, cancel=cancel)

    monkeypatch.setattr(waveform_service, "decode_envelope", recorded)
    return record


def write_export(folder: Path, music: Path, edited: bool = False) -> Path:
    tracks = []
    for index, (name, title) in enumerate(FILES, start=1):
        location = "file://localhost/" + (music / name).as_posix().lstrip("/")
        if edited and name == "tone.flac":
            title += ", edited"
        marks = (
            '<TEMPO Inizio="0.000" Bpm="120.00" Metro="4/4" Battito="1"/>'
            f'<POSITION_MARK Name="Second" Type="0" Start="{HOT_CUE_MS / 1000:.3f}"'
            ' Num="0" Red="230" Green="40" Blue="40"/>'
            if name == "bands.flac"
            else ""
        )
        tracks.append(
            f'<TRACK TrackID="{index}" Name="{title}" Artist="Fixture"'
            f' Location="{location}">{marks}</TRACK>'
        )
    keys = "".join(f'<TRACK Key="{index}"/>' for index in range(1, len(FILES) + 1))
    path = folder / ("edited.xml" if edited else "collection.xml")
    path.write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n<DJ_PLAYLISTS Version="1.0.0">'
        '<PRODUCT Name="rekordbox" Version="6.8.5" Company="AlphaTheta"/>'
        f'<COLLECTION Entries="{len(FILES)}">{"".join(tracks)}</COLLECTION>'
        '<PLAYLISTS><NODE Type="0" Name="ROOT" Count="1">'
        f'<NODE Name="Friday" Type="1" KeyType="0" Entries="{len(FILES)}">{keys}</NODE>'
        "</NODE></PLAYLISTS></DJ_PLAYLISTS>\n",
        encoding="utf-8",
    )
    return path


def ok(base: str, path: str, body=None, method: str = "POST") -> dict:
    status, payload = request(base, path, method=method, body=body)
    assert status == 200, (path, status, payload)
    return payload


def analysis(base: str) -> dict:
    return ok(base, "/api/v1/waveforms/analysis", method="GET")


def until(what: str, check: Callable[[], bool], timeout: float = 90.0) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if check():
            return
        time.sleep(0.05)
    raise AssertionError(f"timed out waiting for {what}")


def analysed_all(base: str) -> Callable[[], bool]:
    def check() -> bool:
        now = analysis(base)
        return (
            now["state"] == "idle"
            and now["present"] == len(FILES)
            and now["analysed"] == len(FILES)
            and now["remaining"] == 0
        )

    return check


def settled() -> None:
    from cuepoint.engine import server

    wait_until_settled(server._JOB_STORE, "the journey's jobs")


def pictures(base: str, ids: List[int], width: int, marks: bool = False) -> list:
    query = ",".join(str(i) for i in ids)
    return ok(
        base,
        f"/api/v1/waveforms?track_ids={query}&width={width}&marks={int(marks)}",
        method="GET",
    )["waveforms"]


def relaunch(monkeypatch) -> tuple:
    """A second engine over the same library, with a job store of its own."""
    from cuepoint.engine import server
    from cuepoint.engine.jobs import JobStore
    from cuepoint.engine.server import EngineConfig, start_engine_thread
    from cuepoint.services.bootstrap import bootstrap_services
    from cuepoint.utils.di_container import reset_container
    from tests.unit.engine.test_engine_library_refresh import _free_port

    reset_container()
    bootstrap_services()
    monkeypatch.setattr(
        server,
        "_JOB_STORE",
        JobStore(job_repository_provider=server._resolve_job_repository),
    )
    port = _free_port()
    httpd, thread = start_engine_thread(
        EngineConfig(host="127.0.0.1", port=port, token=TOKEN)
    )
    return f"http://127.0.0.1:{port}", httpd, thread


def test_the_phase_journey(decodes, engine, library_db, tmp_path, monkeypatch):  # noqa: F811
    music = tmp_path / "music"
    music.mkdir()
    for name, _ in FILES:
        # Copies, never links: step 7 rewrites one.
        shutil.copyfile(_AUDIO / name, music / name)

    # --- 1. a library with real audio and cues ------------------------------
    do_import(engine, str(write_export(tmp_path, music)))
    found = ok(engine, "/api/v1/library/search?mode=browse&limit=50", method="GET")[
        "tracks"
    ]
    ids: Dict[str, int] = {row["title"]: row["id"] for row in found}
    assert set(ids) == {title for _, title in FILES}

    # --- 2. the check, then the analysis, without a call --------------------
    until("the analysis to follow the import", analysed_all(engine))
    settled()
    assert sorted(decodes.names()) == sorted(name for name, _ in FILES)

    # --- 3. the Library column: every picture at width 120 ------------------
    batch = pictures(engine, list(ids.values()), 120)
    assert [answer["state"] for answer in batch] == ["ready"] * len(FILES)
    assert all(len(base64.b64decode(a["data"])) == 120 * 4 for a in batch)
    assert all(answer["loudness"] is not None for answer in batch)

    # --- 4. the Inspector: the hot cue at its time --------------------------
    (bands,) = pictures(engine, [ids["Bands"]], 1_200, marks=True)
    assert bands["state"] == "ready" and bands["duration_ms"] > HOT_CUE_MS
    assert len(base64.b64decode(bands["data"])) == 1_200 * 4
    hot = [cue for cue in bands["marks"]["cues"] if cue["hot_cue"] == 0]
    assert [(cue["start_ms"], cue["color"]) for cue in hot] == [(HOT_CUE_MS, "#e62828")]
    assert bands["marks"]["grid"][0]["bpm"] == 120.0
    assert bands["loudness"] == decodes.bands_loudness()

    # --- 5. a track played is put first; analysed already, nothing decoded -
    decodes.clear()
    asked = ok(engine, "/api/v1/waveforms/request", {"track_ids": [ids["Bands"]]})
    assert asked["requested"] == [ids["Bands"]]
    settled()
    assert decodes.names() == []
    assert analysed_all(engine)()

    # --- 6. paused, kept across a relaunch, resumed -------------------------
    paused = ok(engine, "/api/v1/waveforms/analysis/pause", {})
    assert paused["paused"] is True and paused["state"] == "paused"
    base, httpd, thread = relaunch(monkeypatch)
    try:
        after = analysis(base)
        assert (after["state"], after["paused"], after["analysed"]) == (
            "paused",
            True,
            len(FILES),
        )
        resumed = ok(base, "/api/v1/waveforms/analysis/resume", {})
        assert resumed["paused"] is False
        until("the resumed analysis to settle", analysed_all(base))
        settled()

        # --- 7. a file changed, a refresh, that file alone analysed again ---
        decodes.clear()
        shutil.copyfile(_AUDIO / "bands.flac", music / "tone.flac")
        status, preview = request(
            base,
            PREVIEW,
            method="POST",
            body={"xml_path": str(write_export(tmp_path, music, edited=True))},
        )
        assert status == 202, preview
        assert wait_for_job(base, preview["job_id"])["state"] == "succeeded"
        diff = ok(base, f"/api/v1/jobs/{preview['job_id']}/results", method="GET")[
            "result"
        ]
        status, applied = request(
            base, APPLY, method="POST", body={"diff_id": diff["diff_id"]}
        )
        assert status == 202, applied
        assert wait_for_job(base, applied["job_id"])["state"] == "succeeded"
        until("the changed file to be analysed again", lambda: decodes.names() != [])
        until("the analysis after the refresh", analysed_all(base))
        settled()
        assert decodes.names() == ["tone.flac"]
        edited = {
            row["title"]: row["id"]
            for row in ok(
                base, "/api/v1/library/search?mode=browse&limit=50", method="GET"
            )["tracks"]
        }
        assert "Tone FLAC, edited" in edited

        # --- 8. a Set's transition: its times and its two pictures ----------
        playlist = next(
            node
            for node in ok(base, "/api/v1/library/playlists", method="GET")["playlists"]
            if node["name"] == "Friday"
        )
        made = ok(
            base,
            "/api/v1/sets/create-from",
            {"source": {"kind": "playlist", "id": playlist["id"]}, "name": "Friday"},
        )
        set_id = made["set"]["id"]
        plan = ok(base, f"/api/v1/sets/plan?set_id={set_id}", method="GET")
        first, second = plan["entries"][0], plan["entries"][1]
        ok(
            base,
            "/api/v1/sets/entries/times",
            {"entry_id": first["entry_id"], "in_time": "0:01", "out_time": "0:05"},
        )
        ok(
            base,
            "/api/v1/sets/entries/times",
            {"entry_id": second["entry_id"], "in_time": "0:00", "out_time": "0:01"},
        )
        plan = ok(base, f"/api/v1/sets/plan?set_id={set_id}", method="GET")
        timed = [(e["in_seconds"], e["out_seconds"]) for e in plan["entries"][:2]]
        assert timed == [(1, 5), (0, 1)]
        strip = pictures(base, [first["track_id"], second["track_id"]], 160, marks=True)
        assert [answer["state"] for answer in strip] == ["ready", "ready"]
        # Step 7 made the second a copy of bands.flac: the two sit level.
        assert [answer["loudness"] for answer in strip] == [
            decodes.bands_loudness()
        ] * 2

        # --- 9. the data deleted, and the library analysed again ------------
        decodes.clear()
        deleted = ok(base, "/api/v1/waveforms/delete-data", {})
        assert deleted["deleted"]["waveforms"] == len(FILES)
        until(
            "the library to be analysed again",
            lambda: len(decodes.names()) >= len(FILES),
        )
        until("the analysis after the deletion", analysed_all(base))
        settled()
        assert sorted(decodes.names()) == sorted(name for name, _ in FILES)
        assert all(
            a["state"] == "ready" for a in pictures(base, list(edited.values()), 120)
        )
    finally:
        httpd.shutdown()
        thread.join(timeout=2)
