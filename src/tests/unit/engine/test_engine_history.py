"""Tests for engine past-search history API."""

import csv
import json
import socket
import tempfile
import urllib.error
import urllib.request
from pathlib import Path

import pytest

from cuepoint.engine.server import EngineConfig, start_engine_thread
from cuepoint.utils.paths import AppPaths


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def _auth_request(
    url: str, token: str, *, data: bytes | None = None, method: str = "GET"
):
    headers = {"Authorization": f"Bearer {token}"}
    if data is not None:
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    return urllib.request.urlopen(req, timeout=5)


def _write_sample_csv(path: Path) -> None:
    with open(path, "w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=[
                "playlist_index",
                "original_title",
                "original_artists",
                "beatport_title",
                "beatport_artists",
                "beatport_url",
                "match_score",
                "confidence",
            ],
        )
        writer.writeheader()
        writer.writerow(
            {
                "playlist_index": "1",
                "original_title": "Test Track",
                "original_artists": "Test Artist",
                "beatport_title": "Test Track",
                "beatport_artists": "Test Artist",
                "beatport_url": "https://www.beatport.com/track/test/1",
                "match_score": "91.0",
                "confidence": "high",
            }
        )


def test_history_recent_and_load(monkeypatch):
    with tempfile.TemporaryDirectory() as tmp:
        exports = Path(tmp)
        monkeypatch.setattr(AppPaths, "exports_dir", staticmethod(lambda: exports))

        csv_path = exports / "my_playlist.csv"
        _write_sample_csv(csv_path)
        meta_path = exports / "my_playlist.meta.json"
        meta_path.write_text(
            json.dumps({"playlist_name": "My Playlist", "xml_path": "C:/music.xml"}),
            encoding="utf-8",
        )
        (exports / "my_playlist_candidates.csv").write_text("skip", encoding="utf-8")

        port = _free_port()
        token = "history-test-token"
        config = EngineConfig(host="127.0.0.1", port=port, token=token)
        server, thread = start_engine_thread(config)
        base = f"http://127.0.0.1:{port}"
        try:
            with _auth_request(f"{base}/api/v1/history/recent", token) as resp:
                recent = json.loads(resp.read().decode("utf-8"))
            assert recent["count"] == 1
            assert recent["files"][0]["file_name"] == "my_playlist.csv"
            assert recent["files"][0]["playlist_name"] == "My Playlist"

            load_url = f"{base}/api/v1/history/load?path={csv_path.as_posix()}"
            with _auth_request(load_url, token) as resp:
                loaded = json.loads(resp.read().decode("utf-8"))
            assert loaded["row_count"] == 1
            assert loaded["matched_count"] == 1
            assert loaded["results"][0]["title"] == "Test Track"
            assert loaded["meta"]["playlist_name"] == "My Playlist"
            assert loaded["review_count"] == 0
            assert loaded["rerun"]["playlist_name"] == "My Playlist"
            assert loaded["rerun"]["xml_path"] == "C:/music.xml"
        finally:
            server.shutdown()
            thread.join(timeout=2)


def test_history_load_merges_review_candidates(monkeypatch, tmp_path):
    exports = tmp_path
    monkeypatch.setattr(AppPaths, "exports_dir", staticmethod(lambda: exports))

    csv_path = exports / "review-run.csv"
    _write_sample_csv(csv_path)
    candidates_path = exports / "review-run_review_candidates.csv"
    with open(candidates_path, "w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=[
                "playlist_index",
                "candidate_title",
                "final_score",
                "candidate_url",
            ],
        )
        writer.writeheader()
        writer.writerow(
            {
                "playlist_index": "1",
                "candidate_title": "Alt Match",
                "final_score": "75.0",
                "candidate_url": "https://www.beatport.com/track/alt/1",
            }
        )

    from cuepoint.engine.history_api import load_history_csv

    loaded = load_history_csv(str(csv_path))
    assert loaded["results"][0]["candidates"]
    assert loaded["results"][0]["candidates"][0]["candidate_title"] == "Alt Match"


def test_history_load_missing_file_returns_404():
    port = _free_port()
    token = "history-test-token"
    config = EngineConfig(host="127.0.0.1", port=port, token=token)
    server, thread = start_engine_thread(config)
    try:
        with pytest.raises(urllib.error.HTTPError) as exc:
            _auth_request(
                f"http://127.0.0.1:{port}/api/v1/history/load?path=C:/does-not-exist.csv",
                token,
            )
        assert exc.value.code == 404
    finally:
        server.shutdown()
        thread.join(timeout=2)
