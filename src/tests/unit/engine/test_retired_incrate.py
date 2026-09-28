"""inCrate is gone, and what it left behind is not touched (DISCOVER-12).

DEC-090 retired inCrate's inventory and enrichment, DEC-099 its browser
playlist fallback, and DEC-100 its screen, once Discover did its work over the
library. These tests hold the retirement as CLEAN-14's did for inKey:

- **Its routes answer as an unknown path does.** Removing a route is a breaking
  engine-API change, recorded in the changelog; the token is still asked for
  first.
- **Nothing of the modules behind them is left to import**, and what survived
  answers only at its new address.
- **Its files are user data.** The inventory database and
  ``incrate_past_results.json`` stay where they were; nothing reads them, and
  a running engine leaves them byte for byte as they were.
- **Its config keys still load** (the config-key invariant, DEC-098).
- **The step's own search** — DISCOVER-12's definition of done greps ``src/``
  for three names — is a test, so it stays true.
"""

from __future__ import annotations

import importlib.util
import json
import os
import re
import socket
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

import pytest

from cuepoint.engine.jobs import JobStore
from cuepoint.engine.server import EngineConfig, start_engine_thread
from cuepoint.models.config_models import AppConfig

pytestmark = pytest.mark.unit

TOKEN = "retired-incrate-token"

_SRC = Path(__file__).resolve().parents[3]
_REPO = _SRC.parent
_PACKAGE = _SRC / "cuepoint"

#: Every route inCrate answered, with its method.
RETIRED_ROUTES = (
    ("GET", "/api/v1/incrate/inventory"),
    ("GET", "/api/v1/incrate/inventory?demo=true&limit=10"),
    ("GET", "/api/v1/incrate/discover/options"),
    ("POST", "/api/v1/incrate/import"),
    ("POST", "/api/v1/incrate/reset"),
    ("POST", "/api/v1/incrate/discover"),
    ("POST", "/api/v1/incrate/playlist"),
)

#: The modules that served only inCrate.
RETIRED_MODULES = (
    "cuepoint.engine.incrate" + "_api",  # parts: see the search test below
    "cuepoint.services.inventory_service",
    "cuepoint.services.incrate_discovery_service",
    "cuepoint.incrate.enrichment",
    "cuepoint.incrate.inventory_db",
    "cuepoint.incrate.collection_parser",
    "cuepoint.incrate.discovery",
    "cuepoint.incrate.past_results_storage",
    "cuepoint.incrate.playlist_writer",
    "cuepoint.incrate.beatport_playlist_browser",
    "cuepoint.incrate.models",
)

#: What survived, at its old address and its new one.
MOVED_MODULES = (
    ("cuepoint.incrate.beatport_api_models", "cuepoint.services.beatport_api_models"),
    ("cuepoint.incrate.playlist_name", "cuepoint.services.playlist_name"),
)


# ------------------------------------------------------------------- routes


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


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


def _call(
    base: str, method: str, path: str, *, token: Optional[str] = TOKEN
) -> Tuple[int, Dict[str, Any]]:
    headers = {"Content-Type": "application/json"}
    if token is not None:
        headers["Authorization"] = f"Bearer {token}"
    body = (
        json.dumps({"xml_path": "C:/collection.xml", "name": "x"}).encode()
        if method == "POST"
        else None
    )
    request = urllib.request.Request(
        base + path, data=body, headers=headers, method=method
    )
    try:
        with urllib.request.urlopen(request, timeout=5) as response:
            return response.status, json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        return error.code, json.loads(error.read().decode("utf-8"))


@pytest.mark.parametrize("method, path", RETIRED_ROUTES)
def test_a_retired_route_answers_as_an_unknown_path(base, method, path):
    answer = _call(base, method, path)
    assert answer == (404, {"error": {"code": "NOT_FOUND", "message": "Unknown path"}})
    assert answer == _call(base, method, "/api/v1/never-was")


@pytest.mark.parametrize("method, path", RETIRED_ROUTES)
def test_without_the_token_it_answers_as_an_unknown_path_does(base, method, path):
    # A POST is authorized before it is routed, so a caller without the token
    # is asked who it is rather than told there is no such thing.
    answer = _call(base, method, path, token=None)
    assert answer == _call(base, method, "/api/v1/never-was", token=None)
    if method == "POST":
        assert answer[0] == 401


# ------------------------------------------------------------------ modules


@pytest.mark.parametrize("module", RETIRED_MODULES)
def test_a_retired_module_is_gone(module):
    assert importlib.util.find_spec(module) is None


@pytest.mark.parametrize("old, new", MOVED_MODULES)
def test_what_survived_answers_only_at_its_new_address(old, new):
    assert importlib.util.find_spec(old) is None
    assert importlib.util.find_spec(new) is not None


def test_the_incrate_package_holds_only_the_oauth_helpers():
    # DEC-098 leaves beatport_oauth.py where it is, untouched.
    left = sorted(p.name for p in (_PACKAGE / "incrate").iterdir() if p.is_file())
    assert left == ["__init__.py", "beatport_oauth.py"]


def test_the_inventory_schema_and_the_developer_script_are_gone():
    assert not (_PACKAGE / "incrate" / "schema.sql").exists()
    assert not (_REPO / "scripts" / "create_incrate_playlist.py").exists()
    spec = (_REPO / "build" / "engine-sidecar.spec").read_text(encoding="utf-8")
    assert "schema.sql" not in spec


def test_nothing_declares_or_registers_the_retired_services():
    import cuepoint.services.interfaces as interfaces

    for name in ("IInventory" + "Service", "IIncrateDiscoveryService"):
        assert not hasattr(interfaces, name), name


def test_the_legacy_catalog_reads_are_gone():
    # inCrate's guessing parsers and the four reads built on them (DISCOVER-01
    # kept them for inCrate); Discover reads through ``beatport_catalog.py``.
    from cuepoint.services import beatport_api, beatport_api_models
    from cuepoint.services.beatport_api import BeatportApi

    for method in ("list_genres", "list_charts", "get_chart", "get_label_releases"):
        assert not hasattr(BeatportApi, method), method
    for parser in (
        "_parse_chart_summary",
        "_parse_chart_detail",
        "_parse_label_release",
    ):
        assert not hasattr(beatport_api, parser), parser
    for model in ("ChartSummary", "ChartDetail", "LabelRelease", "DiscoveredTrack"):
        assert not hasattr(beatport_api_models, model), model


def _python_sources():
    for path in sorted(_SRC.rglob("*.py")):
        if "__pycache__" not in path.parts:
            yield path


def test_the_steps_own_search_finds_nothing():
    # DISCOVER-12's definition of done: a grep of src/ for inCrate's API
    # module, its inventory service and its label enrichment returns nothing.
    # The names are built from parts so this file is not a match for itself.
    names = (
        "incrate" + "_api",
        "Inventory" + "Service",
        "enrich_labels" + "_for_empty",
    )
    pattern = re.compile("|".join(re.escape(n) for n in names))
    offenders = [
        f"{path.relative_to(_SRC).as_posix()}:{number}"
        for path in sorted(_SRC.rglob("*"))
        if path.is_file()
        and not any(
            part.startswith(".") or part == "__pycache__"
            for part in path.relative_to(_SRC).parts
        )
        and path.suffix in {".py", ".sql", ".json", ".md", ".txt", ".ini", ".yaml"}
        for number, line in enumerate(
            path.read_text(encoding="utf-8", errors="replace").splitlines(), start=1
        )
        if pattern.search(line)
    ]
    assert offenders == []


# ---------------------------------------------------------------- user data


def test_nothing_in_the_product_names_incrates_files():
    # Fact 6: the code that read them is deleted, never the files. Nothing
    # names them any more, so nothing can open, move or delete them.
    names = ("inventory" + ".sqlite", "incrate_past" + "_results")
    offenders = [
        f"{path.relative_to(_SRC).as_posix()}: {name}"
        for path in _python_sources()
        if "tests" not in path.relative_to(_SRC).parts
        for name in names
        if name in path.read_text(encoding="utf-8")
    ]
    assert offenders == []


def test_a_running_engine_leaves_incrates_files_as_they_were(tmp_path, monkeypatch):
    """Acceptance 12: both files are where they were, untouched."""
    roaming, local, home = tmp_path / "Roaming", tmp_path / "Local", tmp_path / "home"
    for env, value in (
        ("APPDATA", roaming),
        ("LOCALAPPDATA", local),
        ("XDG_DATA_HOME", local),
        ("USERPROFILE", home),
        ("HOME", home),
    ):
        monkeypatch.setenv(env, str(value))
    inventory = roaming / "CuePoint" / "incrate" / "inventory.sqlite"
    past = local / "CuePoint" / "incrate_past_results.json"
    for path, content in (
        (inventory, b"SQLite format 3\x00 an old inventory"),
        (past, b'{"runs": [{"run_id": "kept"}]}'),
    ):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)
        os.utime(path, (1_600_000_000, 1_600_000_000))
    before = {p: (p.read_bytes(), p.stat().st_mtime) for p in (inventory, past)}

    port = _free_port()
    server, thread = start_engine_thread(
        EngineConfig(host="127.0.0.1", port=port, token=TOKEN), store=JobStore()
    )
    try:
        url = f"http://127.0.0.1:{port}"
        for method, path in RETIRED_ROUTES:
            _call(url, method, path)
        for path in ("/api/v1/discover/runs", "/api/v1/discover/wantlist"):
            _call(url, "GET", path)
    finally:
        server.shutdown()
        thread.join(timeout=2)

    assert {p: (p.read_bytes(), p.stat().st_mtime) for p in before} == before
    assert sorted(p.name for p in inventory.parent.iterdir()) == ["inventory.sqlite"]


# ------------------------------------------------------------------- config


def test_every_incrate_config_key_still_loads():
    # The section keeps its name (fact 7), and the keys nothing reads any more
    # load as before, so an existing config.yaml is never refused.
    section = {
        "inventory_db_path": "D:/old/inventory.sqlite",
        "enrich_on_first_import": False,
        "enrichment_delay_seconds": 1.5,
        "beatport_api_base_url": "https://api.beatport.com/v4",
        "beatport_access_token": "not-a-real-token",
        "beatport_api_timeout": 12,
        "new_releases_days": 14,
        "discovery_genre_ids": [5, 6],
        "playlist_name_format": "iso",
        "beatport_username": "someone",
        "beatport_password": "not-a-real-password",
    }
    config = AppConfig.from_dict({"incrate": section})
    assert config.to_dict()["incrate"] == section
