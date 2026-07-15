"""Tests for engine export API (Phase 3 P1)."""

import json
import socket
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path

import pytest

from cuepoint.engine.jobs import JobStore
from cuepoint.engine.server import EngineConfig, start_engine_thread


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def _auth_request(url: str, token: str, *, data: bytes | None = None, method: str = "GET"):
    headers = {"Authorization": f"Bearer {token}"}
    if data is not None:
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    return urllib.request.urlopen(req, timeout=10)


def test_export_job_results_to_csv(tmp_path: Path):
    port = _free_port()
    token = "export-test-token"
    store = JobStore()
    config = EngineConfig(host="127.0.0.1", port=port, token=token)
    server, thread = start_engine_thread(config, store=store)
    base = f"http://127.0.0.1:{port}"
    out_file = tmp_path / "results.json"
    try:
        with _auth_request(
            f"{base}/api/v1/jobs/match",
            token,
            data=json.dumps({"demo": True}).encode("utf-8"),
            method="POST",
        ) as resp:
            created = json.loads(resp.read().decode("utf-8"))
        job_id = created["id"]

        for _ in range(50):
            with _auth_request(f"{base}/api/v1/jobs/{job_id}", token) as resp:
                status = json.loads(resp.read().decode("utf-8"))
            if status["state"] == "succeeded":
                break
            time.sleep(0.05)
        else:
            pytest.fail("Demo job did not succeed in time")

        payload = json.dumps(
            {
                "format": "json",
                "file_path": str(out_file),
                "job_id": job_id,
                "overwrite": True,
            }
        ).encode("utf-8")
        with _auth_request(f"{base}/api/v1/export", token, data=payload, method="POST") as resp:
            assert resp.status == 200
            exported = json.loads(resp.read().decode("utf-8"))
        assert exported["count"] == 5
        assert out_file.exists()
        content = out_file.read_text(encoding="utf-8")
        assert "Demo Track" in content
    finally:
        server.shutdown()
        thread.join(timeout=2)


def test_export_inline_results_requires_non_empty_array():
    port = _free_port()
    token = "export-test-token"
    config = EngineConfig(host="127.0.0.1", port=port, token=token)
    server, thread = start_engine_thread(config)
    try:
        payload = json.dumps({"format": "csv", "file_path": "x.csv", "results": []}).encode("utf-8")
        with pytest.raises(urllib.error.HTTPError) as exc:
            _auth_request(
                f"http://127.0.0.1:{port}/api/v1/export",
                token,
                data=payload,
                method="POST",
            )
        assert exc.value.code == 400
    finally:
        server.shutdown()
        thread.join(timeout=2)
