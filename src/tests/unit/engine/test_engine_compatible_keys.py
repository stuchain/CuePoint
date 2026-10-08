#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""What mixes with a key: ``GET /api/v1/library/keys/compatible`` (PAGES-10, DEC-133).

The Camelot wheel lights the keys DEC-096's rule relates to the track's key. The
rule lives in ``core/similarity.py``; this route is the only way the renderer
reads it, so the renderer keeps no copy.
"""

from __future__ import annotations

import json
import socket
import urllib.error
import urllib.parse
import urllib.request

import pytest

from cuepoint.engine.server import EngineConfig, start_engine_thread

TOKEN = "compatible-keys-token"


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def _get(base: str, key: str | None, token: str | None = TOKEN):
    query = "" if key is None else "?" + urllib.parse.urlencode({"key": key})
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    req = urllib.request.Request(
        f"{base}/api/v1/library/keys/compatible{query}", headers=headers
    )
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        return exc.code, json.loads(exc.read().decode("utf-8"))


@pytest.fixture
def engine():
    port = _free_port()
    server, thread = start_engine_thread(
        EngineConfig(host="127.0.0.1", port=port, token=TOKEN)
    )
    try:
        yield f"http://127.0.0.1:{port}"
    finally:
        server.shutdown()
        thread.join(timeout=2)


@pytest.mark.unit
class TestCompatibleKeysRoute:
    def test_it_answers_each_relation_in_the_specs_order(self, engine):
        status, payload = _get(engine, "8A")
        assert status == 200
        assert payload == {
            "key": "8A",
            "wheel": [
                {"code": "8A", "relation": "same"},
                {"code": "9A", "relation": "adjacent"},
                {"code": "7A", "relation": "adjacent"},
                {"code": "8B", "relation": "relative"},
            ],
        }

    def test_a_major_key_relates_to_its_minor(self, engine):
        _, payload = _get(engine, "8B")
        assert [(k["code"], k["relation"]) for k in payload["wheel"]] == [
            ("8B", "same"),
            ("9B", "adjacent"),
            ("7B", "adjacent"),
            ("8A", "relative"),
        ]

    def test_the_wheel_wraps_at_both_ends(self, engine):
        _, high = _get(engine, "12A")
        assert [k["code"] for k in high["wheel"]] == ["12A", "1A", "11A", "12B"]
        _, low = _get(engine, "1B")
        assert [k["code"] for k in low["wheel"]] == ["1B", "2B", "12B", "1A"]

    @pytest.mark.parametrize(
        "spelling",
        ["8A", "8a", " 8A ", "Am", "A Minor", "a minor", "Amin", "A min"],
    )
    def test_every_notation_the_app_parses_names_the_same_key(self, engine, spelling):
        status, payload = _get(engine, spelling)
        assert status == 200
        assert payload["key"] == "8A"
        assert payload["wheel"][0] == {"code": "8A", "relation": "same"}

    def test_a_classic_major_key_answers_in_camelot(self, engine):
        _, payload = _get(engine, "E Minor")
        assert payload["key"] == "9A"
        _, payload = _get(engine, "C Major")
        assert payload["key"] == "8B"

    @pytest.mark.parametrize("bad", ["", "   ", "13A", "0B", "H minor", "loud"])
    def test_an_unparseable_key_is_a_400_with_the_envelope(self, engine, bad):
        status, payload = _get(engine, bad)
        assert status == 400
        assert payload["error"]["code"] == "INVALID_REQUEST"
        assert payload["error"]["message"]

    def test_a_missing_key_is_a_400(self, engine):
        status, payload = _get(engine, None)
        assert status == 400
        assert payload["error"]["code"] == "INVALID_REQUEST"

    def test_it_needs_the_token(self, engine):
        status, payload = _get(engine, "8A", token=None)
        assert status == 401
        assert payload["error"]["code"] == "UNAUTHORIZED"
