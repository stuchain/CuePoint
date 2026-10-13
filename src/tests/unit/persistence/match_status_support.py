"""Fixtures for the tests of what is not in the files yet, and playlist status.

Plain SQL where the services would take a job or a file: a test of a count
should not need a tag writer or a Beatport.
"""

from __future__ import annotations

import json
import uuid
from typing import Any, Iterable, Optional

from cuepoint.models.library_track import LibraryTrack
from cuepoint.persistence.track_repository import TrackRepository

NOW = "2026-09-15T12:00:00+00:00"


def add_track(db: Any, path: str = "/m/a.mp3", **fields: Any) -> int:
    """Insert one library track and return its id."""
    rekordbox_id = uuid.uuid4().hex
    TrackRepository(db).add_many(
        [
            LibraryTrack(
                rekordbox_track_id=rekordbox_id,
                title="T",
                artist="A",
                file_path=path,
                **fields,
            )
        ]
    )
    return int(
        db.connect()
        .execute("SELECT id FROM tracks WHERE rekordbox_track_id = ?", (rekordbox_id,))
        .fetchone()["id"]
    )


def write_row(
    db: Any,
    track_id: int,
    field: str,
    outcome: str = "written",
    value: Optional[Any] = None,
    *,
    pending: int = 0,
    new_value_json: Optional[str] = None,
    file_path: Optional[str] = None,
    restore_of: Optional[int] = None,
) -> int:
    """Record one ``file_writes`` row, newest last, and return its id.

    ``value`` is put in the slot a writer of ``field`` would use; pass
    ``new_value_json`` to say the JSON outright.
    """
    slot = {"key": "TKEY", "genre": "TCON", "label": "TPUB", "year": "TDRC"}.get(
        field, "TBPM"
    )
    if new_value_json is None and value is not None:
        new_value_json = json.dumps({slot: [str(value)]}, sort_keys=True)
    reason = "x" if outcome in ("skipped", "failed") else None
    with db.transaction(join_existing=True) as conn:
        path = conn.execute(
            "SELECT file_path FROM tracks WHERE id = ?", (track_id,)
        ).fetchone()["file_path"]
        path = file_path or path
        if outcome == "restored" and restore_of is None:
            restore_of = conn.execute(
                "SELECT MAX(id) AS id FROM file_writes WHERE track_id = ?",
                (track_id,),
            ).fetchone()["id"]
        return int(
            conn.execute(
                "INSERT INTO file_writes (job_id, track_id, file_path, field,"
                " old_value_json, new_value_json, outcome, reason, written_at,"
                " pending, restore_of) VALUES ('job', ?, ?, ?, 'null', ?, ?, ?, ?,"
                " ?, ?)",
                (
                    track_id,
                    path,
                    field,
                    new_value_json,
                    outcome,
                    reason,
                    NOW,
                    pending,
                    restore_of,
                ),
            ).lastrowid
            or 0
        )


def set_state(db: Any, track_id: int, state: str, *, disputed: bool = False) -> None:
    """Give a track a match state, optionally disputed by a newer attempt."""
    with db.transaction(join_existing=True) as conn:

        def attempt() -> int:
            return int(
                conn.execute(
                    "INSERT INTO match_attempts (track_id, started_at, finished_at,"
                    " outcome, input_json) VALUES (?, 't', 't', 'matched', '{}')",
                    (track_id,),
                ).lastrowid
                or 0
            )

        first = attempt()
        newer = attempt() if disputed else None
        conn.execute(
            "INSERT OR REPLACE INTO track_match (track_id, state, decided_by,"
            " attempt_id, candidate_id, newer_attempt_id, decided_at)"
            " VALUES (?, ?, 'user', ?, NULL, ?, 't')",
            (track_id, state, first, newer),
        )


def add_playlist(
    db: Any,
    name: str,
    track_ids: Iterable[int] = (),
    *,
    parent: Optional[int] = None,
    kind: str = "playlist",
    position: int = 0,
) -> int:
    """Insert a playlist (or folder) holding ``track_ids``; return its id."""
    with db.transaction(join_existing=True) as conn:
        depth = 0
        if parent is not None:
            depth = (
                int(
                    conn.execute(
                        "SELECT depth FROM rekordbox_playlists WHERE id = ?", (parent,)
                    ).fetchone()["depth"]
                )
                + 1
            )
        playlist_id = int(
            conn.execute(
                "INSERT INTO rekordbox_playlists (parent_id, name, kind, depth,"
                " position, rekordbox_path, track_count) VALUES (?, ?, ?, ?, ?, ?, 0)",
                (parent, name, kind, depth, position, name),
            ).lastrowid
            or 0
        )
        conn.executemany(
            "INSERT INTO rekordbox_playlist_tracks (playlist_id, track_id, position)"
            " VALUES (?, ?, ?)",
            [(playlist_id, t, i) for i, t in enumerate(track_ids)],
        )
        return playlist_id


def add_job_plan(db: Any, job_id: str, done: dict) -> None:
    """Record a match job's plan: ``{track_id: done}``."""
    with db.transaction(join_existing=True) as conn:
        conn.executemany(
            "INSERT INTO match_job_tracks (job_id, position, track_id, done)"
            " VALUES (?, ?, ?, ?)",
            [(job_id, i, t, int(d)) for i, (t, d) in enumerate(done.items())],
        )
