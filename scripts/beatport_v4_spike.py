#!/usr/bin/env python3
"""Record the Beatport v4 responses Discover is built on (DISCOVER-01's spike).

Calls each endpoint Phase 9 needs once, with a developer's own token, and
writes down what came back: status, top-level keys, the keys of the first
item, pagination fields, any rate-limit headers, and — for the two filters the
code cannot see without a token — whether Beatport actually applied them:

- ``catalog/tracks/?id=a,b`` — does it answer exactly those tracks?
  (``BeatportApi.get_tracks`` checks this at run time either way.)
- ``catalog/tracks/?artist_id=…&publish_date=from:to`` — are the dates inside
  the window? (``BeatportApi.artist_tracks`` filters again either way.)

Every saved body is sanitized first (:func:`sanitize`): no email, user or
account field, no token, and a playlist's id and name replaced. The report and
bodies go to ``output/beatport_v4_spike/`` (ignored by git). With
``--write-fixtures`` the sanitized bodies are also written to
``src/tests/fixtures/beatport_v4/recorded/``, where the parser's agreement
tests pick up every file and hold the parsers to real answers — which is the
point of recording them.

Nothing is written to your Beatport account unless ``--playlist`` is passed;
then one playlist named ``CuePoint spike <date>`` is created and one track
added to it, and you delete it afterwards on the website.

Usage::

    set BEATPORT_ACCESS_TOKEN=...            (PowerShell: $env:BEATPORT_ACCESS_TOKEN=...)
    python scripts/beatport_v4_spike.py
    python scripts/beatport_v4_spike.py --playlist --write-fixtures

The token is read from the environment only, never from the command line, so
it does not land in shell history.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from dataclasses import dataclass, field
from datetime import date, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import requests

REPO = Path(__file__).resolve().parents[1]
FIXTURES = REPO / "src" / "tests" / "fixtures" / "beatport_v4" / "recorded"
DEFAULT_OUT = REPO / "output" / "beatport_v4_spike"
DEFAULT_BASE = "https://api.beatport.com/v4"

#: Keys whose values identify a person or an account, wherever they appear.
SENSITIVE_KEY_RE = re.compile(
    r"(e[-_]?mail|user(name|_id)?$|first_name|last_name|full_name|account|"
    r"token|password|phone|address|birth|postal|zip|^ip$|ip_address|customer|"
    r"subscription|payment|card)",
    re.IGNORECASE,
)
REDACTED = "<redacted>"
#: The id and name a recorded playlist is given in place of the real ones.
PLAYLIST_PLACEHOLDER_ID = 5550001
PLAYLIST_PLACEHOLDER_NAME = "CuePoint Discover 2026-09-23"

_RATE_HEADER_RE = re.compile(r"(rate|limit|retry)", re.IGNORECASE)


def sanitize(value: Any) -> Any:
    """``value`` with every personal or account field redacted, recursively."""
    if isinstance(value, dict):
        clean: Dict[str, Any] = {}
        for key, item in value.items():
            if SENSITIVE_KEY_RE.search(str(key)):
                clean[key] = REDACTED
            else:
                clean[key] = sanitize(item)
        return clean
    if isinstance(value, list):
        return [sanitize(item) for item in value]
    if isinstance(value, str):
        return re.sub(r"([?&](?:token|access_token)=)[^&\s]+", r"\1" + REDACTED, value)
    return value


def sanitize_playlist(value: Any) -> Any:
    """A playlist body, sanitized, with its id and name replaced."""
    clean = sanitize(value)
    if isinstance(clean, dict):
        real_id = clean.get("id")
        if "id" in clean:
            clean["id"] = PLAYLIST_PLACEHOLDER_ID
        if "name" in clean:
            clean["name"] = PLAYLIST_PLACEHOLDER_NAME
        # Only an id long enough not to collide with unrelated numbers.
        if real_id is not None and len(str(real_id)) >= 4:
            text = json.dumps(clean)
            text = text.replace(str(real_id), str(PLAYLIST_PLACEHOLDER_ID))
            clean = json.loads(text)
    return clean


def filter_verdict(asked: List[int], answered: List[int]) -> str:
    """Whether an ``id=a,b`` lookup answered exactly what it was asked."""
    asked_set, answered_set = set(asked), set(answered)
    if answered_set - asked_set:
        return "ignored: answered tracks it was not asked for"
    if answered_set == asked_set:
        return "applied: answered exactly the tracks asked for"
    return "partial: answered some of the tracks asked for"


def window_verdict(dates: List[Optional[str]], first: str, last: str) -> str:
    """Whether a date-filtered listing kept inside its window."""
    known = [d for d in dates if d]
    if not known:
        return "unknown: no dated items"
    outside = [d for d in known if not first <= d <= last]
    if outside:
        return f"ignored: {len(outside)} of {len(known)} dates outside the window"
    return f"applied: all {len(known)} dates inside the window"


@dataclass
class Probe:
    """One recorded call."""

    name: str
    method: str
    path: str
    params: Dict[str, Any] = field(default_factory=dict)
    status: Optional[int] = None
    seconds: float = 0.0
    top_keys: List[str] = field(default_factory=list)
    item_keys: List[str] = field(default_factory=list)
    pagination: Dict[str, Any] = field(default_factory=dict)
    rate_headers: Dict[str, str] = field(default_factory=dict)
    redirect: Optional[str] = None
    verdict: Optional[str] = None
    error: Optional[str] = None


def _describe(body: Any, probe: Probe) -> None:
    if isinstance(body, dict):
        probe.top_keys = sorted(body)
        results = body.get("results")
        if isinstance(results, list):
            probe.pagination = {
                k: (
                    type(body.get(k)).__name__,
                    body.get(k) if k != "next" else bool(body.get(k)),
                )
                for k in ("count", "next", "previous", "page", "per_page")
                if k in body
            }
            if results and isinstance(results[0], dict):
                probe.item_keys = sorted(results[0])
    elif isinstance(body, list) and body and isinstance(body[0], dict):
        probe.item_keys = sorted(body[0])


class Spike:
    """Runs the probes and keeps what they returned."""

    def __init__(self, base: str, token: str, out: Path) -> None:
        self.base = base.rstrip("/")
        self.session = requests.Session()
        self.session.headers.update(
            {"Authorization": f"Bearer {token}", "Accept": "application/json"}
        )
        self.out = out
        self.probes: List[Probe] = []
        self.bodies: Dict[str, Any] = {}

    def call(
        self,
        name: str,
        path: str,
        params: Optional[Dict[str, Any]] = None,
        method: str = "GET",
        json_body: Optional[Dict[str, Any]] = None,
        fixture: Optional[str] = None,
        playlist: bool = False,
    ) -> Tuple[Probe, Any]:
        probe = Probe(name=name, method=method, path=path, params=dict(params or {}))
        started = time.monotonic()
        try:
            resp = self.session.request(
                method,
                f"{self.base}/{path.lstrip('/')}",
                params=params,
                json=json_body,
                timeout=30,
                allow_redirects=False,
            )
        except requests.RequestException as e:
            probe.error = type(e).__name__
            self.probes.append(probe)
            return probe, None
        probe.seconds = round(time.monotonic() - started, 3)
        probe.status = resp.status_code
        probe.rate_headers = {
            k: v for k, v in resp.headers.items() if _RATE_HEADER_RE.search(k)
        }
        if 300 <= resp.status_code < 400:
            probe.redirect = resp.headers.get("Location")
        body: Any = None
        try:
            body = resp.json() if resp.content else None
        except ValueError:
            probe.error = "not JSON"
        _describe(body, probe)
        clean = sanitize_playlist(body) if playlist else sanitize(body)
        if fixture and body is not None:
            self.bodies[fixture] = clean
        self.probes.append(probe)
        return probe, body

    def run(self, make_playlist: bool) -> None:
        today = date.today()
        since = today - timedelta(days=90)
        window = f"{since.isoformat()}:{today.isoformat()}"

        _, charts = self.call(
            "charts (list)",
            "catalog/charts/",
            {"per_page": 5, "publish_date": window},
            fixture="charts_page.json",
        )
        chart_items = charts.get("results", []) if isinstance(charts, dict) else []
        chart_id = chart_items[0]["id"] if chart_items else None
        if chart_id is None:
            print("No chart found; later probes need a track and cannot run.")
            return
        self.call("chart", f"catalog/charts/{chart_id}/", fixture="chart.json")
        _, chart_tracks = self.call(
            "chart tracks",
            f"catalog/charts/{chart_id}/tracks/",
            {"per_page": 10},
            fixture="chart_tracks.json",
        )
        tracks = (
            chart_tracks.get("results", []) if isinstance(chart_tracks, dict) else []
        )
        if len(tracks) < 2:
            print("Chart has fewer than two tracks; batch probe cannot run.")
            return
        first, second = tracks[0], tracks[1]
        track_id, other_id = first["id"], second["id"]
        artist_id = (first.get("artists") or [{}])[0].get("id")
        label = ((first.get("release") or {}).get("label")) or {}
        label_id = label.get("id")

        self.call("track", f"catalog/tracks/{track_id}/", fixture="track.json")
        probe, batch = self.call(
            "tracks by id (batched)",
            "catalog/tracks/",
            {"id": f"{track_id},{other_id}", "per_page": 2},
            fixture="tracks_by_id.json",
        )
        answered = [
            t.get("id") for t in (batch or {}).get("results", []) if isinstance(t, dict)
        ]
        probe.verdict = filter_verdict([track_id, other_id], answered)

        if artist_id:
            self.call("artist", f"catalog/artists/{artist_id}/", fixture="artist.json")
            probe, listing = self.call(
                "artist tracks (dated)",
                "catalog/tracks/",
                {
                    "artist_id": artist_id,
                    "publish_date": window,
                    "order_by": "-publish_date",
                    "per_page": 100,
                },
                fixture="artist_tracks_page1.json",
            )
            items = (
                (listing or {}).get("results", []) if isinstance(listing, dict) else []
            )
            probe.verdict = window_verdict(
                [str(t.get("publish_date") or "")[:10] or None for t in items],
                since.isoformat(),
                today.isoformat(),
            )
            self.call(
                "artist tracks (route)",
                f"catalog/artists/{artist_id}/tracks/",
                {"per_page": 5},
            )
            self.call(
                "charts filtered by artist_id",
                "catalog/charts/",
                {"artist_id": artist_id, "per_page": 5},
            )
        if label_id:
            self.call("label", f"catalog/labels/{label_id}/", fixture="label.json")
            self.call(
                "label tracks (dated)",
                "catalog/tracks/",
                {
                    "label_id": label_id,
                    "publish_date": window,
                    "order_by": "-publish_date",
                    "per_page": 100,
                },
            )
            _, releases = self.call(
                "label releases",
                f"catalog/labels/{label_id}/releases/",
                {"per_page": 5},
                fixture="label_releases.json",
            )
            rel_items = (
                (releases or {}).get("results", [])
                if isinstance(releases, dict)
                else []
            )
            if rel_items:
                self.call(
                    "release tracks",
                    f"catalog/releases/{rel_items[0]['id']}/tracks/",
                    fixture="release_tracks.json",
                )
            if label.get("name"):
                self.call(
                    "label search",
                    "catalog/search/",
                    {"q": label["name"], "type": "labels"},
                )
        self.call("genres", "catalog/genres/", {"per_page": 100})

        if make_playlist:
            probe, created = self.call(
                "playlist create",
                "my/playlists/",
                method="POST",
                json_body={"name": f"CuePoint spike {date.today().isoformat()}"},
                fixture="playlist_created.json",
                playlist=True,
            )
            pid = created.get("id") if isinstance(created, dict) else None
            if pid is not None:
                self.call(
                    "playlist add track",
                    f"my/playlists/{pid}/tracks/",
                    method="POST",
                    json_body={"track_id": track_id},
                    playlist=True,
                )
                print(
                    "A playlist named 'CuePoint spike ...' was created; delete it on beatport.com."
                )

    def write(self, write_fixtures: bool) -> None:
        self.out.mkdir(parents=True, exist_ok=True)
        for name, body in self.bodies.items():
            text = json.dumps(body, indent=2, ensure_ascii=False) + "\n"
            (self.out / name).write_text(text, encoding="utf-8")
            if write_fixtures:
                FIXTURES.mkdir(parents=True, exist_ok=True)
                (FIXTURES / name).write_text(text, encoding="utf-8")
        report = [p.__dict__ for p in self.probes]
        (self.out / "report.json").write_text(
            json.dumps(report, indent=2), encoding="utf-8"
        )
        lines = [
            "| Probe | Status | Redirect | Pagination | Rate headers | Verdict |",
            "|---|---|---|---|---|---|",
        ]
        for p in self.probes:
            lines.append(
                f"| {p.name} (`{p.method} {p.path}`) | {p.status or p.error} | {p.redirect or ''} | "
                f"{json.dumps(p.pagination) if p.pagination else ''} | "
                f"{json.dumps(p.rate_headers) if p.rate_headers else ''} | {p.verdict or ''} |"
            )
        (self.out / "report.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
        print("\n".join(lines))
        print(
            f"\nWrote {len(self.bodies)} sanitized bodies and the report to {self.out}"
        )
        if write_fixtures:
            print(f"Wrote the recordings to {FIXTURES}; now run the parser tests.")


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--base-url", default=DEFAULT_BASE)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument(
        "--playlist", action="store_true", help="create one throwaway playlist"
    )
    parser.add_argument(
        "--write-fixtures", action="store_true", help="replace committed fixtures"
    )
    args = parser.parse_args(argv)
    token = os.environ.get("BEATPORT_ACCESS_TOKEN", "").strip()
    if not token:
        print("Set BEATPORT_ACCESS_TOKEN in the environment first.", file=sys.stderr)
        return 2
    spike = Spike(args.base_url, token, args.out)
    spike.run(make_playlist=args.playlist)
    spike.write(write_fixtures=args.write_fixtures)
    return 0


if __name__ == "__main__":
    sys.exit(main())
