"""Tests for engine XML playlist discovery and batch jobs."""

import json
import socket
import urllib.request
from unittest.mock import patch

import pytest

from cuepoint.engine.jobs import JobStore, start_match_job
from cuepoint.engine.server import EngineConfig, start_engine_thread
from cuepoint.engine.xml_api import list_xml_playlists
from cuepoint.compat.gui_types import TrackResult

SAMPLE_XML = """<?xml version="1.0" encoding="UTF-8"?>
<DJ_PLAYLISTS Version="1.0.0">
    <COLLECTION>
        <TRACK TrackID="1" Name="Track One" Artist="Artist One"/>
        <TRACK TrackID="2" Name="Track Two" Artist="Artist Two"/>
    </COLLECTION>
    <PLAYLISTS>
        <NODE Name="ROOT">
            <NODE Name="Warm Up" Type="1">
                <TRACK Key="1"/>
            </NODE>
            <NODE Name="Peak Time" Type="1">
                <TRACK Key="2"/>
            </NODE>
        </NODE>
    </PLAYLISTS>
</DJ_PLAYLISTS>
"""


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def _auth_request(url: str, token: str, *, data: bytes | None = None, method: str = "GET"):
    headers = {"Authorization": f"Bearer {token}"}
    if data is not None:
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    return urllib.request.urlopen(req, timeout=5)


def test_list_xml_playlists(tmp_path):
    xml_path = tmp_path / "collection.xml"
    xml_path.write_text(SAMPLE_XML, encoding="utf-8")

    payload = list_xml_playlists(str(xml_path))
    assert payload["count"] == 2
    paths = {entry["path"] for entry in payload["playlists"]}
    assert any("Warm Up" in path for path in paths)
    assert payload["playlists"][0]["track_count"] >= 1


def test_xml_playlists_endpoint(tmp_path):
    xml_path = tmp_path / "collection.xml"
    xml_path.write_text(SAMPLE_XML, encoding="utf-8")

    port = _free_port()
    token = "xml-test-token"
    config = EngineConfig(host="127.0.0.1", port=port, token=token)
    server, thread = start_engine_thread(config)
    try:
        url = f"http://127.0.0.1:{port}/api/v1/xml/playlists?path={xml_path.as_posix()}"
        with _auth_request(url, token) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
        assert payload["count"] == 2
    finally:
        server.shutdown()
        thread.join(timeout=2)


def test_start_batch_match_job_with_mock_processor(tmp_path):
    xml_path = tmp_path / "collection.xml"
    xml_path.write_text(SAMPLE_XML, encoding="utf-8")
    store = JobStore()

    playlists = list_xml_playlists(str(xml_path))["playlists"]
    assert len(playlists) >= 2
    selected = [playlists[0]["path"], playlists[1]["path"]]

    def fake_process(xml_path_arg, playlist_name, progress_callback=None, controller=None):
        assert xml_path_arg == str(xml_path)
        if progress_callback:
            from cuepoint.compat.gui_types import ProgressInfo

            progress_callback(
                ProgressInfo(
                    completed_tracks=1,
                    total_tracks=1,
                    matched_count=1,
                    unmatched_count=0,
                    status_message=f"Done {playlist_name}",
                    reliability_state="running",
                )
            )
        return [
            TrackResult(
                playlist_index=1,
                title=f"{playlist_name} Track",
                artist="Artist",
                matched=True,
                beatport_title="Match",
            )
        ]

    with patch("cuepoint.utils.di_container.get_container") as mock_container:
        processor = mock_container.return_value.resolve.return_value
        processor.process_playlist_from_xml.side_effect = fake_process

        job = start_match_job(
            store,
            {"xml_path": str(xml_path), "playlist_names": selected},
        )

        import time

        for _ in range(100):
            current = store.get(job.id)
            assert current is not None
            if current.state.value in ("succeeded", "failed", "cancelled"):
                break
            time.sleep(0.02)

    finished = store.get(job.id)
    assert finished is not None
    assert finished.state.value == "succeeded"
    assert set(finished.batch_results.keys()) == set(selected)
    assert len(finished.batch_results[selected[0]]) == 1


def test_batch_job_missing_playlist_fails_fast(tmp_path):
    xml_path = tmp_path / "collection.xml"
    xml_path.write_text(SAMPLE_XML, encoding="utf-8")
    store = JobStore()

    job = start_match_job(
        store,
        {"xml_path": str(xml_path), "playlist_names": ["Does Not Exist"]},
    )

    import time

    for _ in range(50):
        current = store.get(job.id)
        if current and current.state.value in ("succeeded", "failed", "cancelled"):
            break
        time.sleep(0.02)

    finished = store.get(job.id)
    assert finished is not None
    assert finished.state.value == "failed"
    assert finished.error is not None
    assert finished.error["code"] == "PLAYLIST_NOT_FOUND"
