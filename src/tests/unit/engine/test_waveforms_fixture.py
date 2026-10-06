#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Waveforms over the wire, answered by the real engine (WAVE-05).

The renderer's waveform code and the desktop contract test read the engine's
own answers rather than shapes a TypeScript test wrote, as Phases 7 to 10 do
(``librarySets.fixture.json``, ``prepare.fixture.json``). So the answers live
in one file, ``waveforms.fixture.json``, with two readers. This test
**produces** it: a real engine on a loopback port, a real library and
``waveforms.db``, and a stand-in decoder, driven through the routes the app's
clicks reach. ``desktopContract.test.ts`` holds the TypeScript of all six
contract files to it, and the layout's tests draw its picture.

An engine change that reshapes one of these answers fails here first, with the
new payload in the diff. Regenerate with::

    CUEPOINT_WRITE_FIXTURES=1 python -m pytest \\
        src/tests/unit/engine/test_waveforms_fixture.py

and read the diff before committing it.

What is in it, and why:

* **batch**: one track in each state a decoder allows (ready, failed, missing,
  unchecked, waiting) and an id that is no track, at width 120.
* **batch_without_decoder**: the waiting track again, now unavailable; every
  other state answers the same without a decoder.
* **batch_with_marks**: the ready track with a hot cue, a memory cue, a loop
  and a grid that changes tempo, as ``marks=1`` sends them.
* **batch_loudness** (WAVE-08): ``data=0``, states and loudness with no
  picture, for a track measured, one too quiet to measure, one silent, one
  whose waveform is stored but whose loudness is still to be measured, and one
  waiting.
* **analysis**, **requested** and **deleted**: the analysis paused, a request
  while paused, and "Delete waveform data" while paused, so nothing runs
  after it.
* **refusals**: a width out of range, and a store that cannot be emptied.

The ready picture is four sections of five seconds, each loud in one band:
low, then mid, then high, then all three, as ``bands.flac`` is.

Values that differ between two identical runs are replaced: a job's id, and a
size on disk, which depends on when SQLite checkpoints.
"""

from __future__ import annotations

import base64
import json
import os
from array import array
from pathlib import Path
from typing import Any, Dict

import pytest

from cuepoint.data.audio_decode import (
    LOUDNESS_SILENT,
    LOUDNESS_TOO_QUIET,
    DecodeFailed,
    Envelope,
    Loudness,
)
from cuepoint.engine.waveforms_api import (
    ANALYSIS_PATH,
    DELETE_DATA_PATH,
    PAUSE_PATH,
    REQUEST_PATH,
    WAVEFORMS_PATH,
)
from cuepoint.models.file_status import FILE_MISSING, TrackFileStatus
from cuepoint.persistence.waveform_store import WaveformStoreError
from tests.fixtures.job_settling import wait_until_settled
from tests.fixtures.waveform_library import envelope
from tests.unit.engine.test_waveforms_api import (  # noqa: F401 — fixtures by name
    engine,
    lib,
    services,
)

pytestmark = pytest.mark.unit

#: The file both languages read, beside the renderer code that draws it.
FIXTURE = (
    Path(__file__).resolve().parents[4]
    / "apps"
    / "desktop-electron"
    / "renderer"
    / "src"
    / "components"
    / "waveform"
    / "waveforms.fixture.json"
)

#: Set to rewrite the fixture instead of asserting against it.
WRITE_ENV = "CUEPOINT_WRITE_FIXTURES"

#: What a job's id becomes in the file.
JOB_ID = "job-id"

#: What a size on disk becomes in the file.
SIZE = 1_048_576

#: The envelope's rate, and each section's length in frames.
RATE = 150
SECTION = 5 * RATE


def sections() -> Envelope:
    """Twenty seconds: low, then mid, then high, then all three, each loud alone."""
    loud, quiet = 0.81, 0.0004
    bands = []
    for band in range(3):
        values = []
        for section in range(4):
            level = loud if section in (band, 3) else quiet
            values.extend([level] * SECTION)
        bands.append(array("f", values))
    full = array("f", (max(values) for values in zip(*bands)))
    return Envelope(RATE, full, *bands, loudness=Loudness(-7.9, -0.2, None))


def stable(value: Any) -> Any:
    """``value`` with what differs between two identical runs replaced."""
    if isinstance(value, dict):
        out: Dict[str, Any] = {}
        for key, item in value.items():
            if key == "job_id" and item is not None:
                out[key] = JOB_ID
            elif key in ("store_bytes", "freed_bytes"):
                out[key] = SIZE
            else:
                out[key] = stable(item)
        return out
    if isinstance(value, list):
        return [stable(item) for item in value]
    return value


def ok(answer):
    status, body = answer
    assert status == 200, body
    return body


def refused(answer) -> Dict[str, Any]:
    status, body = answer
    assert status >= 400, body
    return body["error"]


@pytest.fixture
def answers(lib, engine, services, monkeypatch):  # noqa: F811 — fixtures by name
    for name in ("ready", "failed", "missing", "waiting"):
        lib.add(name)
    lib.add("unchecked", checked=False)
    for name in ("quiet", "silent", "unmeasured"):
        lib.add(name)
    lib.decoder.answers[str(lib.path("ready"))] = sections()
    lib.decoder.answers[str(lib.path("failed"))] = DecodeFailed("undecodable", "stub")
    lib.decoder.answers[str(lib.path("quiet"))] = envelope(
        loudness=Loudness(None, -31.0, LOUDNESS_TOO_QUIET)
    )
    lib.decoder.answers[str(lib.path("silent"))] = envelope(
        level=0.0, loudness=Loudness(None, None, LOUDNESS_SILENT)
    )
    for name in ("ready", "failed", "quiet", "silent", "unmeasured"):
        lib.waveforms.analyse(lib.id(name))
    # A waveform stored before WAVE-08 measured loudness.
    lib.store.connect().execute(
        "DELETE FROM loudness WHERE path = ?", (str(lib.path("unmeasured")),)
    )
    lib.files.record(
        [
            TrackFileStatus(
                lib.id("missing"), FILE_MISSING, str(lib.path("missing")), "now"
            )
        ]
    )
    services.replace_many(
        [
            (
                lib.id("ready"),
                [
                    ("cue", 0, 5_000, None, "Mid", "#28e214"),
                    ("cue", None, 10_000, None, "High", None),
                    ("loop", 1, 15_000, 17_500, "Loop", "#ff8c00"),
                ],
                [(0, 120.0, "4/4", 1), (10_000, 126.0, "4/4", 1)],
            )
        ]
    )
    services.mark_read("2026-10-05T12:00:00+00:00")
    ids = [lib.id(n) for n in ("ready", "failed", "missing", "unchecked", "waiting")]

    def read(track_ids, marks=0):
        query = ",".join(str(i) for i in track_ids)
        return ok(
            engine.call(f"{WAVEFORMS_PATH}?track_ids={query}&width=120&marks={marks}")
        )

    measured = [
        lib.id(n) for n in ("ready", "quiet", "silent", "unmeasured", "waiting")
    ]
    made: Dict[str, Any] = {
        "batch": read([*ids, 999_999]),
        "batch_with_marks": read([lib.id("ready")], marks=1),
        "batch_loudness": ok(
            engine.call(
                f"{WAVEFORMS_PATH}?track_ids={','.join(map(str, measured))}&data=0"
            )
        ),
    }
    lib.decoder_path = None
    made["batch_without_decoder"] = read([lib.id("waiting")])
    lib.decoder_path = Path("/opt/cuepoint/mpv")

    ok(engine.call(PAUSE_PATH, method="POST"))
    made["analysis"] = ok(engine.call(ANALYSIS_PATH))
    made["requested"] = ok(
        engine.call(
            REQUEST_PATH,
            method="POST",
            body=json.dumps({"track_ids": [lib.id("waiting")]}).encode(),
        )
    )
    wait_until_settled(engine.store, "the requested track")
    made["deleted"] = ok(engine.call(DELETE_DATA_PATH, method="POST"))

    def broken():
        raise WaveformStoreError(message="disk full", error_code="X")

    monkeypatch.setattr(lib.store, "clear", broken)
    made["refusals"] = [
        refused(engine.call(f"{WAVEFORMS_PATH}?track_ids=1&width=15")),
        refused(engine.call(DELETE_DATA_PATH, method="POST")),
    ]
    return stable(made)


def test_the_fixture_is_what_the_engine_answers(answers):
    text = json.dumps(answers, indent=2, sort_keys=True) + "\n"
    if os.environ.get(WRITE_ENV):
        FIXTURE.write_text(text, encoding="utf-8", newline="\n")
    assert FIXTURE.exists(), f"run with {WRITE_ENV}=1 to write {FIXTURE.name}"
    assert json.loads(FIXTURE.read_text(encoding="utf-8")) == answers


def test_it_holds_every_state_once_and_the_marks(answers):
    states = [t["state"] for t in answers["batch"]["waveforms"]]
    states += [t["state"] for t in answers["batch_without_decoder"]["waveforms"]]
    assert sorted(states) == sorted(
        ["ready", "failed", "missing", "unchecked", "waiting", "unavailable"]
    )
    assert answers["batch"]["unknown"] == [999_999]
    marks = answers["batch_with_marks"]["waveforms"][0]["marks"]
    assert [cue["kind"] for cue in marks["cues"]] == ["cue", "cue", "loop"]
    assert len(marks["grid"]) == 2


def test_its_ready_picture_is_the_four_sections(answers):
    ready = answers["batch"]["waveforms"][0]
    data = base64.b64decode(ready["data"])
    assert ready["duration_ms"] == 20_000
    assert len(data) == 120 * 4
    columns = [data[i * 4 : i * 4 + 4] for i in range(120)]
    # Full, low, mid, high: each quarter loud in its own band.
    loud = [max(range(1, 4), key=lambda b: column[b]) for column in columns]
    assert set(loud[2:28]) == {1}
    assert set(loud[32:58]) == {2}
    assert set(loud[62:88]) == {3}
    assert all(min(column[1:]) > 200 for column in columns[92:118])


def test_it_holds_each_loudness_without_a_picture(answers):
    batch = answers["batch_loudness"]
    assert batch["width"] is None
    assert all(track["data"] is None for track in batch["waveforms"])
    assert [(t["state"], t["loudness"]) for t in batch["waveforms"]] == [
        ("ready", {"integrated_lufs": -7.9, "peak_dbfs": -0.2, "reason": None}),
        ("ready", {"integrated_lufs": None, "peak_dbfs": -31.0, "reason": "too_quiet"}),
        ("ready", {"integrated_lufs": None, "peak_dbfs": None, "reason": "silent"}),
        ("ready", None),
        ("waiting", None),
    ]
    assert answers["batch"]["waveforms"][0]["loudness"]["integrated_lufs"] == -7.9


def test_its_refusals_are_named(answers):
    codes = [refusal["code"] for refusal in answers["refusals"]]
    assert codes == ["INVALID_REQUEST", "WAVEFORMS_STORE_FAILED"]
