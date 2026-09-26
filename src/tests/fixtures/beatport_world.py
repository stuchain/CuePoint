#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""A small Beatport, in memory, for Discover's discovery tests (DISCOVER-05).

``BeatportWorld`` stands in for ``BeatportApiClient``: it answers ``get`` for
every path both discovery implementations ask, from one set of charts, labels
and tracks, in the v4 shapes DISCOVER-01 recorded.

- **The routes DISCOVER-05 reads**: ``catalog/charts/`` (a listing honouring
  ``publish_date`` and ``genre_id``), ``catalog/charts/{id}/tracks/``,
  ``catalog/tracks/?label_id=`` (a dated, newest-first listing), and the
  label search ``search_label_by_name`` makes (``catalog/search``, then
  ``catalog/labels``).
- **The routes inCrate reads**: ``catalog/charts`` without its slash, a chart
  by id, ``catalog/labels/{id}/releases`` and ``catalog/releases/{id}/tracks``.

- **The route an Artist page adds** (DISCOVER-07): ``catalog/tracks/?artist_id=``,
  the same dated listing, of the tracks crediting an artist.
- **The playlist routes DISCOVER-06 writes**: ``post`` to ``my/playlists/``
  creates a playlist, and to ``my/playlists/{id}/tracks/`` adds a track, with
  404 for a playlist or track this world does not have, as a server would.
- **The genre listing a "New run" panel reads** (DISCOVER-09):
  ``catalog/genres/``, paged like every other listing.

So inCrate's ``run_discovery`` and the new service can be run against the same
world and held to the same answer, and every request either makes is counted.
No test reaches the network.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import Any, Callable, Dict, List, Optional, Sequence, Tuple

from cuepoint.exceptions.cuepoint_exceptions import BeatportAPIError

#: A request that should fail: ``(path, params, number)`` to a status, or None.
Failure = Callable[[str, Dict[str, Any], int], Optional[int]]


@dataclass
class Chart:
    id: int
    name: str
    genre_ids: Tuple[int, ...]
    published: date
    track_ids: Tuple[int, ...]
    artist: Optional[Tuple[int, str]] = None
    owner: str = "someone"


@dataclass
class Track:
    id: int
    name: str
    artists: Tuple[Tuple[int, str], ...]
    label: Tuple[int, str]
    release: Tuple[int, str]
    released: date


@dataclass
class BeatportWorld:
    """What Beatport holds, and every request made of it."""

    charts: List[Chart] = field(default_factory=list)
    tracks: Dict[int, Track] = field(default_factory=dict)
    failures: List[Failure] = field(default_factory=list)
    requests: List[Tuple[str, Dict[str, Any]]] = field(default_factory=list)
    access_token: str = "token"
    #: Playlists created, by id: ``{"name": …, "tracks": [ids in order]}``.
    playlists: Dict[int, Dict[str, Any]] = field(default_factory=dict)
    #: ``catalog/genres/``, in Beatport's order: ``(id, name, slug)``.
    genres: List[Tuple[int, str, str]] = field(
        default_factory=lambda: [
            (5, "House", "house"),
            (6, "Techno (Peak Time / Driving)", "techno-peak-time-driving"),
            (12, "Deep House", "deep-house"),
        ]
    )

    # ------------------------------------------------------------- building

    def add_track(
        self,
        track_id: int,
        released: date,
        label: Tuple[int, str],
        release: Tuple[int, str],
        artists: Sequence[Tuple[int, str]] = ((1, "Someone"),),
    ) -> None:
        self.tracks[track_id] = Track(
            track_id, f"Track {track_id}", tuple(artists), label, release, released
        )

    def add_chart(self, chart: Chart) -> None:
        self.charts.append(chart)

    # ------------------------------------------------------------ answering

    def require_token(self) -> None:
        if not self.access_token:
            raise BeatportAPIError(
                "no token", status_code=0, error_code="BEATPORT_API_NO_TOKEN"
            )

    def paths(self, prefix: str) -> List[str]:
        """The paths asked, normalized, that start with ``prefix``."""
        return [p for p, _ in self.requests if p.startswith(prefix)]

    def _ask(self, route: str, params: Dict[str, Any]) -> None:
        self.requests.append((route, params))
        for failure in self.failures:
            status = failure(route, params, len(self.requests))
            if status is not None:
                raise BeatportAPIError(
                    f"Beatport answered {status}", status_code=status
                )

    def post(self, path: str, json: Optional[Dict[str, Any]] = None) -> Any:
        body = dict(json or {})
        route = path.strip("/")
        self._ask(route, body)
        parts = route.split("/")
        if route == "my/playlists":
            playlist_id = 700_001 + len(self.playlists)
            self.playlists[playlist_id] = {"name": body["name"], "tracks": []}
            return {"id": playlist_id, "name": body["name"], "track_count": 0}
        if parts[:2] == ["my", "playlists"] and parts[3:] == ["tracks"]:
            playlist = self.playlists.get(int(parts[2]))
            track_id = int(body["track_id"])
            if playlist is None or track_id not in self.tracks:
                raise BeatportAPIError("Beatport answered 404", status_code=404)
            playlist["tracks"].append(track_id)
            return {"id": track_id}
        raise BeatportAPIError("Beatport answered 404", status_code=404)

    def get(self, path: str, params: Optional[Dict[str, Any]] = None) -> Any:
        params = dict(params or {})
        route = path.strip("/")
        self._ask(route, params)
        parts = route.split("/")
        if parts[:2] == ["catalog", "charts"]:
            if len(parts) == 2:
                return self._chart_listing(params)
            chart = self._chart(int(parts[2]))
            if chart is None:
                return None
            if len(parts) == 3:
                return self._chart_json(chart)
            return self._page(
                [self._track_json(self.tracks[t]) for t in chart.track_ids], params
            )
        if route == "catalog/tracks":
            if "id" in params:
                asked = [int(i) for i in str(params["id"]).split(",")]
                return self._page(
                    [
                        self._track_json(self.tracks[i])
                        for i in asked
                        if i in self.tracks
                    ],
                    params,
                )
            return self._filtered_tracks(params)
        if parts[:2] == ["catalog", "tracks"] and len(parts) == 3:
            track = self.tracks.get(int(parts[2]))
            return self._track_json(track) if track is not None else None
        if route == "catalog/genres":
            return self._page(
                [{"id": i, "name": n, "slug": s} for i, n, s in self.genres], params
            )
        if route == "catalog/search":
            query = str(params.get("q") or params.get("query") or "").lower()
            return {
                "labels": [label for label in self._labels() if _named(label, query)]
            }
        if route == "catalog/labels":
            query = str(params.get("q") or "").lower()
            return self._page(
                [label for label in self._labels() if _named(label, query)], params
            )
        if parts[:2] == ["catalog", "labels"] and parts[-1] == "releases":
            return self._releases(int(parts[2]), params)
        if parts[:2] == ["catalog", "releases"] and parts[-1] == "tracks":
            release_id = int(parts[2])
            return self._page(
                [
                    self._track_json(t)
                    for t in self._by_date(self.tracks.values())
                    if t.release[0] == release_id
                ],
                params,
            )
        return None

    # ------------------------------------------------------------- shapes

    def _chart(self, chart_id: int) -> Optional[Chart]:
        return next((c for c in self.charts if c.id == chart_id), None)

    @staticmethod
    def _chart_json(chart: Chart) -> Dict[str, Any]:
        return {
            "id": chart.id,
            "name": chart.name,
            "slug": f"chart-{chart.id}",
            "publish_date": f"{chart.published.isoformat()}T10:00:00-06:00",
            "genres": [{"id": g, "name": f"Genre {g}"} for g in chart.genre_ids],
            "artist": (
                {"id": chart.artist[0], "name": chart.artist[1], "slug": "a"}
                if chart.artist
                else None
            ),
            "person": {"id": 9_000_000 + chart.id, "owner_name": chart.owner},
            "track_count": len(chart.track_ids),
        }

    @staticmethod
    def _track_json(track: Track) -> Dict[str, Any]:
        return {
            "id": track.id,
            "name": track.name,
            "mix_name": "Original Mix",
            "slug": f"track-{track.id}",
            "artists": [{"id": i, "name": n} for i, n in track.artists],
            "remixers": [],
            "bpm": 124,
            "genre": {"id": 5, "name": "House"},
            "release": {
                "id": track.release[0],
                "name": track.release[1],
                "slug": "release",
                "label": {"id": track.label[0], "name": track.label[1]},
            },
            "new_release_date": track.released.isoformat(),
            "publish_date": track.released.isoformat(),
        }

    def _labels(self) -> List[Dict[str, Any]]:
        seen: Dict[int, str] = {}
        for track in self.tracks.values():
            seen.setdefault(track.label[0], track.label[1])
        return [
            {"id": i, "name": n, "slug": n.lower().replace(" ", "-")}
            for i, n in sorted(seen.items())
        ]

    @staticmethod
    def _window(params: Dict[str, Any], key: str = "publish_date") -> Tuple[str, str]:
        if key in params:
            first, last = str(params[key]).split(":")
            return first, last
        return str(params.get("from", "0000-00-00")), str(
            params.get("to", "9999-99-99")
        )

    @staticmethod
    def _by_date(tracks: Any) -> List[Track]:
        return sorted(tracks, key=lambda t: t.released, reverse=True)

    @staticmethod
    def _page(items: List[Any], params: Dict[str, Any]) -> Dict[str, Any]:
        per_page = int(params.get("per_page") or 10)
        page = int(params.get("page") or 1)
        window = items[(page - 1) * per_page : page * per_page]
        more = page * per_page < len(items)
        return {
            "count": len(items),
            "next": "https://api.beatport.com/v4/next" if more else None,
            "page": f"{page}/{max(1, -(-len(items) // per_page))}",
            "per_page": per_page,
            "results": window,
        }

    def _chart_listing(self, params: Dict[str, Any]) -> Dict[str, Any]:
        first, last = self._window(params)
        genre = params.get("genre_id")
        charts = [
            c
            for c in self.charts
            if first <= c.published.isoformat() <= last
            and (genre is None or int(genre) in c.genre_ids)
        ]
        return self._page([self._chart_json(c) for c in charts], params)

    def _filtered_tracks(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """``catalog/tracks/`` filtered to a label or an artist, newest first."""
        first, last = self._window(params)
        if "artist_id" in params:
            artist_id = int(params["artist_id"])

            def wanted(track: Track) -> bool:
                return any(i == artist_id for i, _ in track.artists)

        else:
            label_id = int(params["label_id"])

            def wanted(track: Track) -> bool:
                return track.label[0] == label_id

        tracks = [
            t
            for t in self._by_date(self.tracks.values())
            if wanted(t) and first <= t.released.isoformat() <= last
        ]
        return self._page([self._track_json(t) for t in tracks], params)

    def _releases(self, label_id: int, params: Dict[str, Any]) -> Dict[str, Any]:
        first, last = self._window(params)
        releases: Dict[int, Tuple[str, date, List[int]]] = {}
        for track in self._by_date(self.tracks.values()):
            if track.label[0] != label_id:
                continue
            if not first <= track.released.isoformat() <= last:
                continue
            name, released, ids = releases.setdefault(
                track.release[0], (track.release[1], track.released, [])
            )
            ids.append(track.id)
        return self._page(
            [
                {
                    "id": rid,
                    "name": name,
                    "slug": "release",
                    "track_count": len(ids),
                    "tracks": [
                        f"https://api.beatport.com/v4/catalog/tracks/{t}/" for t in ids
                    ],
                }
                for rid, (name, _, ids) in releases.items()
            ],
            {**params, "per_page": 100},
        )


def _named(label: Dict[str, Any], query: str) -> bool:
    return query in (label["name"].lower(), label["slug"])
