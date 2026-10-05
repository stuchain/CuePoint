#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""A track's cues and grid on ``GET /api/v1/library/tracks/{id}`` (WAVE-04).

The track detail gains ``marks``: every cue, the grid summed up, and whether
the library's marks have been read at all. Over HTTP against a running engine
with the fixture collection imported, and held to the TypeScript the client
declares, as Discover's shapes are (``test_discover_contract``): a field the
engine sends and the client never declares is one the Inspector cannot show,
and one it declares that never arrives is ``undefined``.
"""

from __future__ import annotations

import json
import shutil
import socket
import urllib.request
from pathlib import Path

import pytest

from cuepoint.engine.server import EngineConfig, start_engine_thread
from cuepoint.models.track_marks import CUE_KINDS, MARKS_INDEX
from cuepoint.services import database_service as database_service_module
from cuepoint.utils.di_container import get_container, reset_container
from tests.unit.engine.test_discover_contract import _fields, _union

pytestmark = pytest.mark.unit

TOKEN = "track-marks-token"
FIXTURE = Path(__file__).resolve().parents[2] / "fixtures" / "rekordbox" / "marks.xml"


def resolve(name: str):
    from cuepoint.services import interfaces

    return get_container().resolve(getattr(interfaces, name))


@pytest.fixture
def imported(tmp_path, monkeypatch):
    from cuepoint.services.bootstrap import bootstrap_services

    monkeypatch.setattr(
        database_service_module,
        "default_database_path",
        lambda: tmp_path / "cuepoint.db",
    )
    reset_container()
    bootstrap_services()
    source = tmp_path / "collection.xml"
    shutil.copyfile(FIXTURE, source)
    resolve("ILibraryImportService").import_rekordbox_xml(str(source))
    yield {
        str(row[1]): int(row[0])
        for row in resolve("IDatabaseService")
        .connect()
        .execute("SELECT id, rekordbox_track_id FROM tracks")
    }
    resolve("IDatabaseService").close_all()
    reset_container()


@pytest.fixture
def engine(imported):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        port = int(sock.getsockname()[1])
    server, thread = start_engine_thread(
        EngineConfig(host="127.0.0.1", port=port, token=TOKEN)
    )
    try:
        yield f"http://127.0.0.1:{port}"
    finally:
        server.shutdown()
        thread.join(timeout=2)


def detail(base: str, track_id: int) -> dict:
    request = urllib.request.Request(
        f"{base}/api/v1/library/tracks/{track_id}",
        headers={"Authorization": f"Bearer {TOKEN}"},
    )
    with urllib.request.urlopen(request, timeout=5) as response:
        payload: dict = json.loads(response.read().decode("utf-8"))
    return payload


class TestTheTrackDetail:
    def test_it_lists_every_cue_and_sums_up_the_grid(self, engine, imported):
        marks = detail(engine, imported["101"])["marks"]
        assert marks["read"] is True
        assert (marks["hot_cues"], marks["memory_cues"]) == (4, 5)
        assert len(marks["cues"]) == 9
        assert marks["cues"][1] == {
            "kind": "cue",
            "hot_cue": 0,
            "start_ms": 64025,
            "end_ms": None,
            "name": "Drop",
            "color": "#28e214",
        }
        assert marks["beat_grid"] == {
            "markers": 1,
            "bpm": 128.0,
            "min_bpm": 128.0,
            "max_bpm": 128.0,
            "variable": False,
        }

    def test_a_variable_grid_says_so(self, engine, imported):
        grid = detail(engine, imported["102"])["marks"]["beat_grid"]
        assert grid == {
            "markers": 3,
            "bpm": 121.0,
            "min_bpm": 121.0,
            "max_bpm": 124.0,
            "variable": True,
        }

    def test_a_track_without_marks_has_none(self, engine, imported):
        marks = detail(engine, imported["104"])["marks"]
        assert marks == {
            "read": True,
            "hot_cues": 0,
            "memory_cues": 0,
            "cues": [],
            "beat_grid": None,
        }

    def test_before_the_marks_are_read_it_says_so(self, engine, imported):
        with resolve("IDatabaseService").transaction() as conn:
            conn.execute("DELETE FROM track_cues")
            conn.execute("DELETE FROM track_beat_grid")
            conn.execute("DELETE FROM derived_indexes WHERE name = ?", (MARKS_INDEX,))
        assert detail(engine, imported["101"])["marks"]["read"] is False

    def test_the_rest_of_the_detail_is_unchanged(self, engine, imported):
        payload = detail(engine, imported["101"])
        assert set(payload) == {
            "track",
            "playlists",
            "playlist_count",
            "metadata",
            "tags",
            "collections",
            "credits",
            "marks",
        }
        assert payload["track"]["title"] == "Every Mark"


class TestTheContract:
    def test_the_client_declares_the_marks_on_the_detail(self, engine, imported):
        assert "marks" in _fields("LibraryTrackDetail")

    def test_every_shape_carries_exactly_its_declared_fields(self, engine, imported):
        marks = detail(engine, imported["101"])["marks"]
        assert set(marks) == _fields("TrackMarksSummary")
        for cue in marks["cues"]:
            assert set(cue) == _fields("TrackCue")
        assert set(marks["beat_grid"]) == _fields("TrackBeatGridSummary")

    def test_every_kind_is_typed(self):
        assert _union("TrackCueKind") == set(CUE_KINDS)
