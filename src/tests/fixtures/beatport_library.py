#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""A library with matches, written as rows, for Discover's ownership tests (DISCOVER-04).

Ownership is a view over ``track_match`` and ``match_candidates``, so its tests
need matches in every state and candidates carrying ids and URLs that the
matcher never writes — a blank id, an id that is not one — to prove the view
refuses them. Those rows cannot come through ``MatchRepository``, which only
stores what a real ``TrackResult`` holds; they are written here directly, with
every ``NOT NULL`` column filled and every reference real.

The real write path is covered separately, through ``MatchStateService``.
"""

from __future__ import annotations

from typing import Iterable, Optional, Sequence

NOW = "2026-09-23T12:00:00+00:00"


def add_tracks(conn, count: int, start: int = 1) -> list:
    """``count`` library tracks with ids ``start`` onwards; returns the ids."""
    ids = list(range(start, start + count))
    conn.executemany(
        "INSERT INTO tracks (id, rekordbox_track_id, title, artist, normalized_path,"
        " created_at, updated_at) VALUES (?, ?, ?, 'A', '', ?, ?)",
        [(i, f"rb{i}", f"T{i}", NOW, NOW) for i in ids],
    )
    return ids


def add_candidate(
    conn,
    track_id: int,
    stored_id: Optional[str],
    url: str,
    *,
    rank: int = 0,
    attempt_id: Optional[int] = None,
) -> int:
    """A candidate for ``track_id``, in a new attempt unless one is given."""
    if attempt_id is None:
        attempt_id = int(
            conn.execute(
                "INSERT INTO match_attempts (track_id, started_at, finished_at,"
                " outcome, input_json) VALUES (?, ?, ?, 'matched', '{}')",
                (track_id, NOW, NOW),
            ).lastrowid
        )
    return int(
        conn.execute(
            "INSERT INTO match_candidates (attempt_id, rank, beatport_track_id, url,"
            " score, guard_ok, is_winner) VALUES (?, ?, ?, ?, 90, 1, ?)",
            (attempt_id, rank, stored_id, url, 1 if rank == 0 else 0),
        ).lastrowid
    )


def attempt_of(conn, candidate_id: int) -> int:
    row = conn.execute(
        "SELECT attempt_id FROM match_candidates WHERE id = ?", (candidate_id,)
    ).fetchone()
    return int(row[0])


def set_match(
    conn,
    track_id: int,
    candidate_id: Optional[int],
    state: str = "accepted",
    decided_by: str = "auto",
    attempt_id: Optional[int] = None,
) -> None:
    """Give ``track_id`` a match state resting on ``candidate_id``'s attempt."""
    if attempt_id is None:
        assert candidate_id is not None
        attempt_id = attempt_of(conn, candidate_id)
    conn.execute(
        "INSERT INTO track_match (track_id, state, decided_by, attempt_id,"
        " candidate_id, decided_at) VALUES (?, ?, ?, ?, ?, ?)"
        " ON CONFLICT (track_id) DO UPDATE SET state = excluded.state,"
        " decided_by = excluded.decided_by, attempt_id = excluded.attempt_id,"
        " candidate_id = excluded.candidate_id",
        (track_id, state, decided_by, attempt_id, candidate_id, NOW),
    )


def accept(
    conn,
    track_id: int,
    stored_id: Optional[str],
    url: Optional[str] = None,
    *,
    state: str = "accepted",
    decided_by: str = "auto",
) -> int:
    """A candidate for ``track_id`` and a match resting on it; returns its id."""
    if url is None:
        url = f"https://www.beatport.com/track/t/{stored_id}"
    candidate = add_candidate(conn, track_id, stored_id, url)
    set_match(conn, track_id, candidate, state=state, decided_by=decided_by)
    return candidate


def web_url(beatport_id: int, slug: str = "t") -> str:
    return f"https://www.beatport.com/track/{slug}/{beatport_id}"


def catalog_track(
    beatport_id: int,
    *,
    artists: Sequence[tuple] = (),
    remixers: Sequence[tuple] = (),
    label: Optional[tuple] = None,
    title: Optional[str] = None,
    release_date: Optional[str] = None,
):
    """A DISCOVER-01 ``CatalogTrack``, with ``(id, name)`` credits and label."""
    from cuepoint.services.beatport_api_models import CatalogArtist, CatalogTrack

    def credits(pairs: Iterable[tuple]) -> tuple:
        return tuple(CatalogArtist(id=i, name=n) for i, n in pairs)

    return CatalogTrack(
        id=beatport_id,
        title=title or f"Track {beatport_id}",
        mix_name="Original Mix",
        url=web_url(beatport_id),
        artists=credits(artists),
        remixers=credits(remixers),
        label_id=label[0] if label else None,
        label_name=label[1] if label else None,
        release_id=None,
        release_name=None,
        release_date=release_date,
        bpm=None,
        key=None,
        genre_id=None,
        genre_name=None,
    )
