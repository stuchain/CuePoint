"""Tests for DISCOVER-01's recording script (scripts/beatport_v4_spike.py).

The script is run by hand with a real token, so these tests are what stands
between a developer's account data and a committed fixture: sanitizing is
tested field by field, and a whole run is driven offline against a fake
Beatport built from the committed fixtures, so the script is known to work
before anyone points it at the real API.
"""

from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional
from unittest.mock import Mock

import pytest

_REPO_ROOT = Path(__file__).resolve().parents[4]
_SCRIPT = _REPO_ROOT / "scripts" / "beatport_v4_spike.py"
_FIXTURES = _REPO_ROOT / "src" / "tests" / "fixtures" / "beatport_v4"


def _load() -> Any:
    spec = importlib.util.spec_from_file_location("beatport_v4_spike", _SCRIPT)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


spike = _load()


def _fixture(name: str) -> Any:
    return json.loads((_FIXTURES / name).read_text(encoding="utf-8"))


class TestSanitize:
    def test_personal_and_account_fields_are_redacted_at_any_depth(self) -> None:
        body = {
            "id": 1,
            "email": "someone@example.com",
            "owner": {
                "username": "dj",
                "user_id": 44,
                "first_name": "A",
                "last_name": "B",
            },
            "items": [{"account_id": 9, "access_token": "abc", "phone_number": "1"}],
            "customer": {"address": "x"},
        }
        clean = spike.sanitize(body)
        assert clean["id"] == 1
        assert clean["email"] == spike.REDACTED
        assert clean["owner"] == {
            "username": spike.REDACTED,
            "user_id": spike.REDACTED,
            "first_name": spike.REDACTED,
            "last_name": spike.REDACTED,
        }
        assert clean["items"][0] == {
            "account_id": spike.REDACTED,
            "access_token": spike.REDACTED,
            "phone_number": spike.REDACTED,
        }
        assert clean["customer"] == spike.REDACTED
        assert "someone@example.com" not in json.dumps(clean)

    def test_catalog_fields_are_kept(self) -> None:
        track = _fixture("track.json")
        assert spike.sanitize(track) == track

    def test_a_token_in_a_url_is_redacted(self) -> None:
        clean = spike.sanitize(
            {"next": "https://api/x/?page=2&token=secret&per_page=5"}
        )
        assert (
            clean["next"] == f"https://api/x/?page=2&token={spike.REDACTED}&per_page=5"
        )

    def test_a_playlist_loses_its_id_and_name_everywhere(self) -> None:
        body = {
            "id": 98765432,
            "name": "My private list",
            "url": "https://api.beatport.com/v4/my/playlists/98765432/",
            "user": {"id": 5, "username": "dj"},
        }
        clean = spike.sanitize_playlist(body)
        assert clean["id"] == spike.PLAYLIST_PLACEHOLDER_ID
        assert clean["name"] == spike.PLAYLIST_PLACEHOLDER_NAME
        assert "98765432" not in json.dumps(clean)
        assert clean["user"] == spike.REDACTED

    def test_a_short_playlist_id_does_not_rewrite_other_numbers(self) -> None:
        clean = spike.sanitize_playlist({"id": 7, "track_count": 7, "name": "n"})
        assert clean["id"] == spike.PLAYLIST_PLACEHOLDER_ID
        assert clean["track_count"] == 7


class TestVerdicts:
    def test_filter_verdict(self) -> None:
        assert spike.filter_verdict([1, 2], [2, 1]).startswith("applied")
        assert spike.filter_verdict([1, 2], [1]).startswith("partial")
        assert spike.filter_verdict([1, 2], [1, 3]).startswith("ignored")

    def test_window_verdict(self) -> None:
        first, last = "2026-07-01", "2026-09-30"
        assert spike.window_verdict(
            ["2026-08-01", "2026-09-01"], first, last
        ).startswith("applied")
        assert spike.window_verdict(
            ["2026-08-01", "2025-01-01"], first, last
        ).startswith("ignored")
        assert spike.window_verdict([None], first, last).startswith("unknown")


def test_refuses_to_run_without_a_token(
    monkeypatch: pytest.MonkeyPatch, capsys: Any
) -> None:
    monkeypatch.delenv("BEATPORT_ACCESS_TOKEN", raising=False)
    assert spike.main([]) == 2
    assert "BEATPORT_ACCESS_TOKEN" in capsys.readouterr().err


def _fake_beatport() -> Any:
    """A ``session.request`` answering the script's calls from the fixtures."""
    track = _fixture("track.json")
    chart_tracks = _fixture("chart_tracks.json")
    by_path: Dict[str, Any] = {
        "catalog/charts/": _fixture("charts_page.json"),
        "catalog/charts/880001/": _fixture("chart.json"),
        "catalog/charts/880001/tracks/": chart_tracks,
        "catalog/tracks/19000010/": chart_tracks["results"][0],
        "catalog/tracks/": _fixture("tracks_by_id.json"),
        "catalog/artists/301001/": _fixture("artist.json"),
        "catalog/artists/301001/tracks/": _fixture("artist_tracks_page1.json"),
        "catalog/labels/40211/": _fixture("label.json"),
        "catalog/labels/40211/releases/": _fixture("label_releases.json"),
        "catalog/releases/4500010/tracks/": _fixture("release_tracks.json"),
        "catalog/search/": {"labels": [{"id": 40211, "name": "Nightfall Audio"}]},
        "catalog/genres/": {"results": [{"id": 5, "name": "House"}], "next": None},
        "my/playlists/": {
            "id": 12345678,
            "name": "CuePoint spike",
            "user": {"email": "me@x"},
        },
        "my/playlists/12345678/tracks/": {"id": 1, "track": track},
    }
    calls: List[Dict[str, Any]] = []

    def request(
        method: str, url: str, params: Optional[Dict[str, Any]] = None, **kwargs: Any
    ) -> Any:
        path = url.split("/v4/", 1)[1]
        calls.append({"method": method, "path": path, "params": params, **kwargs})
        body = by_path.get(path)
        if path == "catalog/tracks/" and params and "artist_id" in params:
            body = _fixture("artist_tracks_page1.json")
        elif path == "catalog/tracks/" and params and "id" in params:
            known = {t["id"]: t for t in chart_tracks["results"]}
            asked = [int(i) for i in str(params["id"]).split(",")]
            found = [known[i] for i in asked if i in known]
            body = {"count": len(found), "next": None, "page": "1/1", "results": found}
        resp = Mock(
            status_code=200 if body is not None else 404,
            headers={"X-RateLimit-Remaining": "99"},
            content=json.dumps(body).encode() if body is not None else b"",
        )
        resp.json = Mock(return_value=body)
        return resp

    return request, calls


def test_a_whole_run_offline(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    recorded = tmp_path / "recorded"
    monkeypatch.setattr(spike, "FIXTURES", recorded)
    run = spike.Spike("https://api.beatport.com/v4", "token", tmp_path / "out")
    request, calls = _fake_beatport()
    run.session.request = request
    run.run(make_playlist=True)
    run.write(write_fixtures=True)

    assert all(call["allow_redirects"] is False for call in calls)
    assert all(call["path"].endswith("/") for call in calls)
    names = {probe.name: probe for probe in run.probes}
    assert names["tracks by id (batched)"].verdict.startswith("applied")
    assert names["artist tracks (dated)"].verdict  # a verdict was reached
    assert names["charts (list)"].rate_headers == {"X-RateLimit-Remaining": "99"}
    assert names["chart tracks"].pagination["next"] == ("NoneType", False)
    assert names["chart tracks"].pagination["page"] == ("str", "1/1")

    report = (tmp_path / "out" / "report.md").read_text(encoding="utf-8")
    assert "tracks by id (batched)" in report
    written = sorted(p.name for p in recorded.glob("*.json"))
    assert "track.json" in written and "playlist_created.json" in written
    created = json.loads(
        (recorded / "playlist_created.json").read_text(encoding="utf-8")
    )
    assert created["id"] == spike.PLAYLIST_PLACEHOLDER_ID
    assert created["user"] == spike.REDACTED
    assert "12345678" not in (recorded / "playlist_created.json").read_text(
        encoding="utf-8"
    )
    token_header = run.session.headers["Authorization"]
    for path in list(recorded.glob("*.json")) + list((tmp_path / "out").glob("*")):
        assert token_header not in path.read_text(encoding="utf-8")


def test_without_the_playlist_flag_nothing_is_posted(tmp_path: Path) -> None:
    run = spike.Spike("https://api.beatport.com/v4", "token", tmp_path / "out")
    request, calls = _fake_beatport()
    run.session.request = request
    run.run(make_playlist=False)
    assert [c for c in calls if c["method"] != "GET"] == []
