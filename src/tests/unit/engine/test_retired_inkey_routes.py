"""inKey's engine routes are gone (CLEAN-14, DEC-071).

DEC-071 retired the file-based match, past searches, Sync Tags and the results
export together with the screens that used them. Removing a route is a breaking
API change, recorded in the changelog; these tests hold that each one now
answers exactly as an unknown path does, that the token is still asked for
first, and that nothing of the modules behind them is left to import.
"""

from __future__ import annotations

import importlib.util
import json
import re
import socket
import urllib.error
import urllib.request
from pathlib import Path

import pytest

from cuepoint.engine.jobs import JobStore
from cuepoint.engine.server import EngineConfig, start_engine_thread

TOKEN = "retired-routes-token"

#: Every route DEC-071 retired, with the method it answered.
RETIRED_ROUTES = (
    ("POST", "/api/v1/jobs/match"),
    ("POST", "/api/v1/export"),
    ("POST", "/api/v1/tags/sync"),
    ("GET", "/api/v1/history/recent"),
    ("GET", "/api/v1/history/load?path=C%3A%5Cout.csv"),
    ("GET", "/api/v1/xml/playlists?path=C%3A%5Ccollection.xml"),
)

#: The engine modules that served only those routes.
RETIRED_MODULES = (
    "cuepoint.engine.history_api",
    "cuepoint.engine.sync_tags_api",
    "cuepoint.engine.export_api",
    "cuepoint.engine.xml_api",
)

_ENGINE = Path(__file__).resolve().parents[3] / "cuepoint" / "engine"


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


@pytest.fixture(scope="module")
def base():
    port = _free_port()
    config = EngineConfig(host="127.0.0.1", port=port, token=TOKEN)
    server, thread = start_engine_thread(config, store=JobStore())
    try:
        yield f"http://127.0.0.1:{port}"
    finally:
        server.shutdown()
        thread.join(timeout=2)


def _call(base: str, method: str, path: str, *, token: str | None = TOKEN):
    headers = {"Content-Type": "application/json"}
    if token is not None:
        headers["Authorization"] = f"Bearer {token}"
    body = (
        json.dumps({"demo": True, "format": "csv"}).encode()
        if method == "POST"
        else None
    )
    request = urllib.request.Request(
        base + path, data=body, headers=headers, method=method
    )
    with pytest.raises(urllib.error.HTTPError) as caught:
        urllib.request.urlopen(request, timeout=5)
    return caught.value.code, json.loads(caught.value.read().decode("utf-8"))


@pytest.mark.unit
@pytest.mark.parametrize("method, path", RETIRED_ROUTES)
def test_a_retired_route_answers_as_an_unknown_path(base, method, path):
    status, body = _call(base, method, path)
    unknown_status, unknown_body = _call(base, method, "/api/v1/never-was")

    assert status == 404
    assert body == {"error": {"code": "NOT_FOUND", "message": "Unknown path"}}
    assert (status, body) == (unknown_status, unknown_body)


@pytest.mark.unit
@pytest.mark.parametrize("method, path", [r for r in RETIRED_ROUTES if r[0] == "POST"])
def test_a_retired_post_still_asks_for_the_token_first(base, method, path):
    # Every POST is authorized before it is routed; removing a route must not
    # turn "who are you" into "no such thing" for a caller without the token.
    status, body = _call(base, method, path, token=None)
    assert status == 401
    assert body["error"]["code"] == "UNAUTHORIZED"


@pytest.mark.unit
def test_the_job_routes_every_other_job_uses_are_still_there(base):
    status, body = _call(base, "GET", "/api/v1/jobs/nope")
    assert (status, body["error"]["code"]) == (404, "JOB_NOT_FOUND")
    status, body = _call(base, "POST", "/api/v1/jobs/nope/cancel")
    assert (status, body["error"]["code"]) == (404, "JOB_NOT_FOUND")


@pytest.mark.unit
@pytest.mark.parametrize("module", RETIRED_MODULES)
def test_the_module_behind_a_retired_route_is_gone(module):
    assert importlib.util.find_spec(module) is None


def _names(name: str, text: str) -> bool:
    """True when ``text`` names the module ``name`` as a whole identifier.

    Not a substring: ``rekordbox_export_api`` (EXPORT-06) contains the retired
    ``export_api`` and is a different module. Word boundaries still catch every
    way of naming the retired one — ``engine.export_api``, ``import export_api``.
    """
    return re.search(rf"\b{re.escape(name)}\b", text) is not None


@pytest.mark.unit
def test_nothing_in_the_engine_names_a_retired_module():
    names = [module.rsplit(".", 1)[1] for module in RETIRED_MODULES]
    offenders = [
        f"{path.name}: {name}"
        for path in sorted(_ENGINE.glob("*.py"))
        for name in names
        if _names(name, path.read_text(encoding="utf-8"))
    ]
    assert offenders == []


@pytest.mark.unit
def test_the_guard_tells_a_retired_module_from_one_that_contains_its_name():
    assert _names("export_api", "from cuepoint.engine.export_api import handle")
    assert _names("export_api", "import export_api")
    assert not _names(
        "export_api", "from cuepoint.engine.rekordbox_export_api import x"
    )
