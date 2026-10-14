#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Saved artist and label lists over HTTP (Discover's New dig).

Through a running engine over a real library: the token is required, a request
is read strictly, every refusal is typed, and a list round-trips with its
members in order.
"""

from __future__ import annotations

import json
import re
import socket
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Dict, Optional, Set, Tuple

import pytest

from cuepoint.engine import discover_api as api
from cuepoint.engine import discover_lists_api as lists_api
from cuepoint.engine.jobs import JobStore
from cuepoint.engine.server import EngineConfig, start_engine_thread
from cuepoint.services import database_service as database_service_module
from cuepoint.utils.di_container import get_container, reset_container

pytestmark = pytest.mark.unit

TOKEN = "discover-lists-token"
PREFIX = api.PREFIX + "lists"


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def call(
    base: str,
    method: str,
    path: str,
    body: Any = None,
    token: Optional[str] = TOKEN,
    raw: Optional[bytes] = None,
) -> Tuple[int, Dict[str, Any]]:
    data = (
        raw
        if raw is not None
        else (json.dumps(body).encode() if method == "POST" else None)
    )
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    request = urllib.request.Request(
        base + path, data=data, headers=headers, method=method
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        return exc.code, json.loads(exc.read().decode("utf-8"))


def ok(result: Tuple[int, Dict[str, Any]]) -> Dict[str, Any]:
    assert result[0] == 200, result
    return result[1]


def refused(
    result: Tuple[int, Dict[str, Any]], status: int, code: str, *words: str
) -> None:
    assert result[0] == status, result
    error = result[1]["error"]
    assert error["code"] == code, error
    for word in words:
        assert word in error["message"], error


@pytest.fixture
def engine(tmp_path, monkeypatch):
    from cuepoint.services.bootstrap import bootstrap_services
    from cuepoint.services.interfaces import IDatabaseService, IMigrationRunner

    monkeypatch.setattr(
        database_service_module,
        "default_database_path",
        lambda: tmp_path / "cuepoint.db",
    )
    reset_container()
    bootstrap_services()
    get_container().resolve(IMigrationRunner).migrate()
    from cuepoint.services.interfaces import IJobRepository

    store = JobStore(
        job_repository_provider=lambda: get_container().resolve(IJobRepository)
    )
    port = _free_port()
    server, thread = start_engine_thread(
        EngineConfig(host="127.0.0.1", port=port, token=TOKEN), store=store
    )
    try:
        yield f"http://127.0.0.1:{port}"
    finally:
        server.shutdown()
        thread.join(timeout=2)
        get_container().resolve(IDatabaseService).close_all()
        reset_container()


def create(
    engine: str, kind: str = "artist", name: str = "Warehouse", members=("A", "B")
):
    return ok(
        call(
            engine,
            "POST",
            PREFIX + "/create",
            {"kind": kind, "name": name, "members": list(members)},
        )
    )


class TestTheRoutes:
    def test_they_live_under_discover_and_are_the_ones_listed(self):
        for path in (*lists_api.GET_PATHS, *lists_api.POST_PATHS):
            assert path.startswith(api.PREFIX + "lists"), path
        assert set(lists_api.GET_PATHS) == {PREFIX, PREFIX + "/{id}"}
        assert set(lists_api.POST_PATHS) == {
            PREFIX + "/create",
            PREFIX + "/{id}/update",
            PREFIX + "/{id}/delete",
        }

    @pytest.mark.parametrize("path", [PREFIX, PREFIX + "/1"])
    def test_a_read_needs_the_engine_token(self, engine, path):
        refused(call(engine, "GET", path, token=None), 401, "UNAUTHORIZED")

    @pytest.mark.parametrize(
        "path", [PREFIX + "/create", PREFIX + "/1/update", PREFIX + "/1/delete"]
    )
    def test_an_action_needs_the_engine_token(self, engine, path):
        refused(call(engine, "POST", path, {}, token=None), 401, "UNAUTHORIZED")

    def test_a_read_is_not_an_action(self, engine):
        refused(
            call(engine, "GET", PREFIX + "/create"), 400, "INVALID_REQUEST", "list id"
        )
        refused(call(engine, "POST", PREFIX), 404, "NOT_FOUND")

    def test_the_new_refusal_codes_are_in_the_contract(self):
        assert api.LIST_NOT_FOUND in api.REFUSAL_CODES
        assert api.LIST_NAME_TAKEN in api.REFUSAL_CODES


def _ts_fields(path: Path, interface: str) -> Set[str]:
    text = path.read_text(encoding="utf-8")
    start = text.index(f"export interface {interface} ")
    body = text[start : text.index("\n}", start)]
    return set(re.findall(r"^ {2}([a-z_]+)\??:", body, re.M))


class TestTheTypeScriptCopiesAgree:
    """What the engine sends is what the client and the bridge declare."""

    _APP = Path(__file__).resolve().parents[4] / "apps" / "desktop-electron"
    _FILES = (
        _APP / "electron" / "engineClient.ts",
        _APP / "renderer" / "src" / "api" / "cuepointBridge.types.ts",
    )

    def test_a_list_has_the_declared_fields(self, engine):
        made = create(engine)
        for path in self._FILES:
            assert _ts_fields(path, "DiscoverList") == set(made), path.name
            assert _ts_fields(path, "DiscoverLists") == {"lists"}, path.name
        deleted = ok(call(engine, "POST", f"{PREFIX}/{made['id']}/delete", {}))
        for path in self._FILES:
            assert _ts_fields(path, "DiscoverListDeleted") == set(deleted), path.name

    def test_the_refusal_codes_are_declared_on_both_sides(self):
        for path in self._FILES:
            text = path.read_text(encoding="utf-8")
            for code in (api.LIST_NOT_FOUND, api.LIST_NAME_TAKEN):
                assert f'"{code}"' in text, (path.name, code)


class TestLists:
    def test_a_library_starts_with_none(self, engine):
        assert ok(call(engine, "GET", PREFIX)) == {"lists": []}

    def test_a_created_list_reads_back_with_its_members_in_order(self, engine):
        made = create(engine, members=["Bicep", "Ben UFO", "Bicep"])
        assert set(made) == {
            "id",
            "kind",
            "name",
            "members",
            "created_at",
            "updated_at",
        }
        assert made["members"] == ["Bicep", "Ben UFO"]
        assert ok(call(engine, "GET", f"{PREFIX}/{made['id']}")) == made
        assert ok(call(engine, "GET", PREFIX))["lists"] == [made]

    def test_the_kind_narrows_the_list(self, engine):
        create(engine, "artist", "A list")
        create(engine, "label", "L list")
        names = lambda kind: [  # noqa: E731
            x["name"] for x in ok(call(engine, "GET", f"{PREFIX}?kind={kind}"))["lists"]
        ]
        assert names("artist") == ["A list"]
        assert names("label") == ["L list"]
        refused(
            call(engine, "GET", f"{PREFIX}?kind=track"),
            400,
            "INVALID_REQUEST",
            "artists or labels",
        )

    def test_update_renames_and_replaces_members(self, engine):
        made = create(engine)
        path = f"{PREFIX}/{made['id']}/update"
        changed = ok(call(engine, "POST", path, {"name": "Peak", "members": ["C"]}))
        assert (changed["name"], changed["members"]) == ("Peak", ["C"])
        assert ok(call(engine, "POST", path, {"members": []}))["name"] == "Peak"

    def test_delete_removes_it(self, engine):
        made = create(engine)
        path = f"{PREFIX}/{made['id']}"
        assert ok(call(engine, "POST", path + "/delete", {})) == {
            "id": made["id"],
            "deleted": True,
        }
        refused(call(engine, "GET", path), 404, api.LIST_NOT_FOUND)
        refused(call(engine, "POST", path + "/delete", {}), 404, api.LIST_NOT_FOUND)


class TestRefusals:
    def test_a_taken_name_is_a_conflict_in_its_own_code(self, engine):
        create(engine, name="House")
        refused(
            call(
                engine, "POST", PREFIX + "/create", {"kind": "artist", "name": "house"}
            ),
            409,
            api.LIST_NAME_TAKEN,
            "already has that name",
        )
        other = create(engine, name="Other")
        refused(
            call(engine, "POST", f"{PREFIX}/{other['id']}/update", {"name": "House"}),
            409,
            api.LIST_NAME_TAKEN,
        )

    def test_an_unknown_list_is_not_found(self, engine):
        refused(call(engine, "GET", PREFIX + "/9"), 404, api.LIST_NOT_FOUND, "9")
        refused(
            call(engine, "POST", PREFIX + "/9/update", {"name": "x"}),
            404,
            api.LIST_NOT_FOUND,
        )

    @pytest.mark.parametrize("bad", ["abc", "0", "01", "9" * 30])
    def test_an_id_is_a_plain_positive_whole_number(self, engine, bad):
        refused(
            call(engine, "GET", f"{PREFIX}/{bad}"), 400, "INVALID_REQUEST", "list id"
        )

    @pytest.mark.parametrize(
        ("body", "words"),
        [
            ({"name": "x"}, "kind is required"),
            ({"kind": "artist"}, "name is required"),
            ({"kind": "artist", "name": ""}, "name"),
            ({"kind": "tag", "name": "x"}, "artists or labels"),
            ({"kind": "artist", "name": "x", "members": "A"}, "list of names"),
            ({"kind": "artist", "name": "x", "members": [1]}, "another kind"),
            ({"kind": "artist", "name": "x", "color": "red"}, "'color'"),
        ],
    )
    def test_a_bad_create_is_a_400_naming_the_problem(self, engine, body, words):
        refused(
            call(engine, "POST", PREFIX + "/create", body),
            400,
            "INVALID_REQUEST",
            words,
        )
        assert ok(call(engine, "GET", PREFIX)) == {"lists": []}

    def test_an_update_must_say_something_and_only_known_things(self, engine):
        made = create(engine)
        path = f"{PREFIX}/{made['id']}/update"
        refused(call(engine, "POST", path, {}), 400, "INVALID_REQUEST", "name, members")
        refused(
            call(engine, "POST", path, {"kind": "label"}),
            400,
            "INVALID_REQUEST",
            "'kind'",
        )

    @pytest.mark.parametrize("key", ["name", "members"])
    def test_an_update_refuses_null_rather_than_ignoring_it(self, engine, key):
        made = create(engine)
        refused(
            call(engine, "POST", f"{PREFIX}/{made['id']}/update", {key: None}),
            400,
            "INVALID_REQUEST",
            "cannot be null",
        )

    def test_a_delete_takes_nothing(self, engine):
        made = create(engine)
        refused(
            call(engine, "POST", f"{PREFIX}/{made['id']}/delete", {"force": True}),
            400,
            "INVALID_REQUEST",
            "'force'",
        )

    def test_a_body_must_be_a_json_object(self, engine):
        refused(
            call(engine, "POST", PREFIX + "/create", raw=b"[1]"), 400, "INVALID_REQUEST"
        )
        refused(
            call(engine, "POST", PREFIX + "/create", raw=b"{"), 400, "INVALID_REQUEST"
        )
