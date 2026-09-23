"""Regression: creating a Beatport playlist silently read the playlist list instead.

**What the user saw.** inCrate's *Create playlist* always failed with "Your
Beatport token may not have playlist write access", whatever the token.

**Cause.** ``BeatportApi.create_playlist`` posted to ``my/playlists`` without
the trailing slash. Beatport answers that with ``301`` to ``my/playlists/``
(observed against the live API on 2026-09-23), and ``requests`` follows a 301
after a POST by issuing a **GET**, as browsers do. The GET returned the user's
playlists as a paginated list, which has no ``id``, so the create answered None
and the caller blamed the token. Adding a track had the same path bug.

**Why it is easy to reintroduce.** Nothing fails loudly: the redirected request
succeeds with a 200. The fix is two-sided — the paths carry their slash, and
``BeatportApiClient.post`` refuses redirects so a wrong path is an error, not a
quiet GET. This test drives a real ``requests`` session against a local server
that redirects the way Beatport does, because a mocked session would never
perform the POST-to-GET conversion that caused the bug.
"""

from __future__ import annotations

import json
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from typing import Any, Dict, Iterator, List, Tuple

import pytest

from cuepoint.exceptions.cuepoint_exceptions import BeatportAPIError
from cuepoint.services.beatport_api import BeatportApi
from cuepoint.services.beatport_api_client import BeatportApiClient


class _BeatportLike(BaseHTTPRequestHandler):
    """Redirects a path without its slash, as ``api.beatport.com/v4`` does."""

    seen: List[Tuple[str, str, Any]] = []

    def log_message(self, *args: Any) -> None:  # keep the test output quiet
        pass

    def _send(self, status: int, body: Any = None, location: str = "") -> None:
        payload = json.dumps(body).encode() if body is not None else b""
        self.send_response(status)
        if location:
            self.send_header("Location", location)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def _answer(self, method: str) -> None:
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length) if length else b""
        body = json.loads(raw) if raw else None
        type(self).seen.append((method, self.path, body))
        if not self.path.endswith("/"):
            self._send(301, location=self.path + "/")
        elif method == "GET" and self.path == "/v4/my/playlists/":
            self._send(
                200, {"count": 1, "next": None, "results": [{"id": 1, "name": "Old"}]}
            )
        elif method == "POST" and self.path == "/v4/my/playlists/":
            self._send(201, {"id": 5550001, "name": body.get("name") if body else ""})
        elif method == "POST" and self.path == "/v4/my/playlists/5550001/tracks/":
            self._send(201, {"id": 1, "position": 1})
        else:
            self._send(404, {"detail": "Not found."})

    def do_GET(self) -> None:  # noqa: N802 (http.server's naming)
        self._answer("GET")

    def do_POST(self) -> None:  # noqa: N802
        self._answer("POST")


@pytest.fixture
def beatport_like() -> Iterator[Tuple[BeatportApi, List[Tuple[str, str, Any]]]]:
    server = HTTPServer(("127.0.0.1", 0), _BeatportLike)
    _BeatportLike.seen = []
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        base = f"http://127.0.0.1:{server.server_address[1]}/v4"
        client = BeatportApiClient(base, "test-token", timeout=5)
        yield BeatportApi(client, cache_service=None), _BeatportLike.seen
    finally:
        server.shutdown()
        server.server_close()


def test_create_playlist_creates_one(
    beatport_like: Tuple[BeatportApi, List[Any]],
) -> None:
    api, seen = beatport_like
    assert api.create_playlist("Discover") == "5550001"
    assert ("POST", "/v4/my/playlists/", {"name": "Discover"}) in seen
    assert not [s for s in seen if s[0] == "GET"], "the create turned into a GET"


def test_adding_a_track_posts_it(beatport_like: Tuple[BeatportApi, List[Any]]) -> None:
    api, seen = beatport_like
    api.add_track_to_playlist("5550001", 19000001)
    assert seen == [
        ("POST", "/v4/my/playlists/5550001/tracks/", {"track_id": 19000001})
    ]


def test_a_redirected_post_is_an_error_not_a_get(
    beatport_like: Tuple[BeatportApi, List[Any]],
) -> None:
    api, seen = beatport_like
    client: BeatportApiClient = api._client
    with pytest.raises(BeatportAPIError) as caught:
        client.post("my/playlists", json={"name": "Discover"})
    assert caught.value.error_code == "BEATPORT_API_REDIRECT"
    methods: Dict[str, int] = {}
    for method, _, _ in seen:
        methods[method] = methods.get(method, 0) + 1
    assert methods == {"POST": 1}
