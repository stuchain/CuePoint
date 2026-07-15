"""Tests for engine tag sync API."""

import json
import socket
import urllib.request
from unittest.mock import patch

from cuepoint.engine.sync_tags_api import run_sync_tags


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def test_run_sync_tags_paths_mode():
    results = [
        {
            "playlist_index": 1,
            "title": "Track One",
            "artist": "Artist",
            "matched": True,
            "beatport_key": "Am",
            "file_path": "C:\\Music\\track.mp3",
        }
    ]
    with patch("cuepoint.engine.sync_tags_api.write_tags_to_paths") as mock_write:
        mock_write.return_value = (1, 0, [], [])
        payload = run_sync_tags(
            {
                "source": "playlist_file",
                "results": results,
                "sync_options": {"key_format": "normal", "comment_text": "ok"},
            }
        )
    assert payload["written"] == 1
    assert payload["failed"] == 0
    mock_write.assert_called_once()
    passed_results = mock_write.call_args[0][0]
    assert len(passed_results) == 1
    assert passed_results[0].file_path.endswith("track.mp3")


def test_run_sync_tags_xml_single(tmp_path):
    xml_path = tmp_path / "collection.xml"
    xml_path.write_text("<root/>", encoding="utf-8")
    with patch("cuepoint.engine.sync_tags_api.get_track_locations") as mock_locations, patch(
        "cuepoint.engine.sync_tags_api.write_key_comment_year_to_playlist_tracks"
    ) as mock_write:
        mock_locations.return_value = {"1": str(tmp_path / "a.mp3")}
        mock_write.return_value = (2, 0, [], [])
        payload = run_sync_tags(
            {
                "source": "collection",
                "mode": "single",
                "xml_path": str(xml_path),
                "playlist_name": "Warm Up",
                "results": [
                    {
                        "playlist_index": 1,
                        "title": "A",
                        "artist": "B",
                        "matched": True,
                        "beatport_key": "Am",
                    }
                ],
            }
        )
    assert payload["written"] == 2
    mock_write.assert_called_once()


def test_run_sync_tags_xml_batch(tmp_path):
    xml_path = tmp_path / "collection.xml"
    xml_path.write_text("<root/>", encoding="utf-8")
    with patch("cuepoint.engine.sync_tags_api.get_track_locations") as mock_locations, patch(
        "cuepoint.engine.sync_tags_api.write_key_comment_year_to_playlist_tracks_batch"
    ) as mock_write:
        mock_locations.return_value = {"1": str(tmp_path / "a.mp3")}
        mock_write.return_value = (3, 1, ["err"], ["skip.wav"])
        payload = run_sync_tags(
            {
                "source": "collection",
                "mode": "batch",
                "xml_path": str(xml_path),
                "batch_results": {
                    "Warm Up": [
                        {
                            "playlist_index": 1,
                            "title": "A",
                            "artist": "B",
                            "matched": True,
                            "beatport_key": "Am",
                        }
                    ]
                },
            }
        )
    assert payload["written"] == 3
    assert payload["failed"] == 1
    assert payload["wav_skipped_count"] == 1


def test_sync_tags_endpoint(tmp_path):
    from cuepoint.engine.server import EngineConfig, start_engine_thread

    port = _free_port()
    token = "sync-test-token"
    config = EngineConfig(host="127.0.0.1", port=port, token=token)
    server, thread = start_engine_thread(config)
    try:
        body = json.dumps(
            {
                "source": "playlist_file",
                "results": [
                    {
                        "playlist_index": 1,
                        "title": "Track",
                        "artist": "Artist",
                        "matched": True,
                        "beatport_key": "Am",
                        "file_path": "C:\\Music\\track.mp3",
                    }
                ],
            }
        ).encode("utf-8")
        req = urllib.request.Request(
            f"http://127.0.0.1:{port}/api/v1/tags/sync",
            data=body,
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        with patch("cuepoint.engine.sync_tags_api.write_tags_to_paths") as mock_write:
            mock_write.return_value = (1, 0, [], [])
            with urllib.request.urlopen(req, timeout=5) as resp:
                payload = json.loads(resp.read().decode("utf-8"))
        assert payload["written"] == 1
    finally:
        server.shutdown()
        thread.join(timeout=2)


def test_run_sync_tags_requires_xml_for_collection():
    try:
        run_sync_tags(
            {
                "source": "collection",
                "results": [
                    {
                        "playlist_index": 1,
                        "title": "A",
                        "artist": "B",
                        "matched": True,
                    }
                ],
            }
        )
    except ValueError as exc:
        assert "xml_path" in str(exc)
    else:
        raise AssertionError("Expected ValueError")
