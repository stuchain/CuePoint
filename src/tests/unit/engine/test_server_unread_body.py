"""The engine reads what a client sends before it answers.

The engine answers and closes the connection (HTTP/1.0). A POST that no route
reads (an unknown path, a missing token) used to be answered at once, with its
body still on the way. When the body arrived at the closed socket, the engine's
side reset the connection, and a reset throws away whatever the client had not
read yet: the client saw "connection aborted" instead of the 404 or 401.
``test_retired_incrate.py`` failed that way once in a full run.

The race is made certain here: the headers go first, the body only after the
engine has had time to answer, and then the answer is read.
"""

from __future__ import annotations

import json
import socket
import time
import urllib.error
import urllib.request
from typing import Optional

import pytest

from cuepoint.engine.jobs import JobStore
from cuepoint.engine.server import EngineConfig, start_engine_thread

pytestmark = pytest.mark.unit

TOKEN = "unread-body-token"
BODY = json.dumps({"padding": "x" * 64 * 1024}).encode("utf-8")


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


@pytest.fixture(scope="module")
def port():
    port = _free_port()
    config = EngineConfig(host="127.0.0.1", port=port, token=TOKEN)
    server, thread = start_engine_thread(config, store=JobStore())
    try:
        yield port
    finally:
        server.shutdown()
        thread.join(timeout=2)


def _late_body_post(port: int, path: str, token: Optional[str] = TOKEN) -> bytes:
    """POST with the body sent after a pause; the whole answer, as bytes."""
    head = [
        f"POST {path} HTTP/1.1",
        "Host: 127.0.0.1",
        "Content-Type: application/json",
        f"Content-Length: {len(BODY)}",
    ]
    if token is not None:
        head.append(f"Authorization: Bearer {token}")
    with socket.create_connection(("127.0.0.1", port), timeout=10) as sock:
        sock.sendall(("\r\n".join(head) + "\r\n\r\n").encode("ascii"))
        time.sleep(0.3)  # long enough for an engine that does not wait to answer
        try:
            sock.sendall(BODY)
        except OSError:
            pass  # the engine already closed; the read below says what was lost
        answer = b""
        while True:
            chunk = sock.recv(65536)
            if not chunk:
                return answer
            answer += chunk


def _status(answer: bytes) -> int:
    return int(answer.split(b"\r\n", 1)[0].split()[1])


def _error_code(answer: bytes) -> str:
    return json.loads(answer.split(b"\r\n\r\n", 1)[1])["error"]["code"]


def test_an_unknown_path_answers_404_when_its_body_arrives_late(port):
    answer = _late_body_post(port, "/api/v1/never-was")
    assert _status(answer) == 404
    assert _error_code(answer) == "NOT_FOUND"


def test_a_missing_token_answers_401_when_its_body_arrives_late(port):
    answer = _late_body_post(port, "/api/v1/never-was", token=None)
    assert _status(answer) == 401
    assert _error_code(answer) == "UNAUTHORIZED"


def test_a_route_that_reads_its_body_still_gets_it(port):
    # Read once and kept: a route that reads the body after the engine has
    # drained nothing yet sees the bytes, not an empty body.
    request = urllib.request.Request(
        f"http://127.0.0.1:{port}/api/v1/library/import",
        data=b"{not json",
        headers={
            "Authorization": f"Bearer {TOKEN}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    with pytest.raises(urllib.error.HTTPError) as caught:
        urllib.request.urlopen(request, timeout=10)
    assert caught.value.code == 400
