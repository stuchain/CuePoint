"""The playlist list stays fast on a big library (G4 2.2).

50,000 tracks (a tenth of them WAV), 500 playlists of 100 tracks each (50,000
memberships), a match state for nine in ten tracks, a tenth of the tracks with a
value of their own (genre and BPM, both unsaved), half of those already written
once, a quarter with an accepted match, and a twentieth with a key correction
of their own (some of them with the history that says whose it is).

The assertion is a **relationship**, not a wall-clock number, so a slow CI machine
does not fail it: the whole answer must come within a fixed multiple of reading
the memberships once (the reference). The design target of 150 ms is checked only
when ``CUEPOINT_PERF_ABSOLUTE=1``, on a machine that is meant to meet it. The
timing is always printed.

Marked slow and performance.
"""

from __future__ import annotations

import os
import time

import pytest

from cuepoint.persistence.match_status_repository import MatchStatusRepository
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.match_status_service import MatchStatusService
from cuepoint.services.migration_runner import MigrationRunner

TRACKS = 50_000
PLAYLISTS = 500
PER_PLAYLIST = 100
BUDGET_SECONDS = 0.150
#: How many times the reference read the whole answer may cost.
MAX_TIMES_THE_REFERENCE = 40
NOW = "2026-09-15T12:00:00+00:00"
STATES = ("accepted", "needs_review", "rejected", "no_match")


def build(db: DatabaseService) -> None:
    with db.transaction() as conn:
        conn.executemany(
            "INSERT INTO tracks (rekordbox_track_id, title, artist, file_path,"
            " normalized_path, genre, key, bpm, year, created_at, updated_at)"
            " VALUES (?, 'T', 'A', ?, ?, 'House', '8A', 124.0, 2020, ?, ?)",
            [
                (
                    f"rb{i}",
                    f"/m/{i}.{'wav' if i % 10 == 0 else 'mp3'}",
                    f"/m/{i}",
                    NOW,
                    NOW,
                )
                for i in range(TRACKS)
            ],
        )
        ids = [r[0] for r in conn.execute("SELECT id FROM tracks ORDER BY id")]
        conn.execute(
            "INSERT INTO match_attempts (track_id, started_at, finished_at,"
            " outcome, input_json) VALUES (?, 't', 't', 'matched', '{}')",
            (ids[0],),
        )
        attempt = conn.execute("SELECT MAX(id) FROM match_attempts").fetchone()[0]
        conn.executemany(
            "INSERT INTO track_match (track_id, state, decided_by, attempt_id,"
            " newer_attempt_id, decided_at) VALUES (?, ?, 'user', ?, ?, 't')",
            [
                (
                    t,
                    STATES[i % 4],
                    attempt,
                    attempt if i % 50 == 0 else None,
                )
                for i, t in enumerate(ids)
                if i % 10 != 9
            ],
        )
        conn.executemany(
            "INSERT INTO track_metadata (track_id, genre, bpm, created_at,"
            " updated_at) VALUES (?, 'Techno', 126.0, ?, ?)",
            [(t, NOW, NOW) for i, t in enumerate(ids) if i % 10 == 1],
        )
        keyed = [t for i, t in enumerate(ids) if i % 20 == 3]
        conn.executemany(
            "INSERT INTO track_metadata (track_id, key, created_at, updated_at)"
            " VALUES (?, 'Em', ?, ?) ON CONFLICT (track_id) DO UPDATE SET key = 'Em'",
            [(t, NOW, NOW) for t in keyed],
        )
        conn.executemany(
            "INSERT INTO track_history (track_id, field, new_value_json, source,"
            " changed_at) VALUES (?, 'cuepoint_key', '\"Em\"', ?, ?)",
            [(t, "yours" if n % 2 else "beatport", NOW) for n, t in enumerate(keyed)],
        )
        conn.executemany(
            "INSERT INTO file_writes (job_id, track_id, file_path, field,"
            " new_value_json, outcome, written_at, pending)"
            " VALUES ('j', ?, '/m/x.mp3', 'genre', '{\"TCON\": [\"Techno\"]}',"
            " 'written', ?, 0)",
            [(t, NOW) for i, t in enumerate(ids) if i % 20 == 1],
        )
        for p in range(PLAYLISTS):
            playlist = conn.execute(
                "INSERT INTO rekordbox_playlists (parent_id, name, kind, depth,"
                " position, rekordbox_path, track_count)"
                " VALUES (NULL, ?, 'playlist', 0, ?, ?, ?)",
                (f"P{p}", p, f"P{p}", PER_PLAYLIST),
            ).lastrowid
            conn.executemany(
                "INSERT INTO rekordbox_playlist_tracks (playlist_id, track_id,"
                " position) VALUES (?, ?, ?)",
                [
                    (playlist, ids[(p * 97 + k * 251) % TRACKS], k)
                    for k in range(PER_PLAYLIST)
                ],
            )
        job_tracks = ids[:5000]
        conn.executemany(
            "INSERT INTO match_job_tracks (job_id, position, track_id, done)"
            " VALUES ('running', ?, ?, ?)",
            [(i, t, i % 2) for i, t in enumerate(job_tracks)],
        )


@pytest.mark.slow
@pytest.mark.performance
def test_the_playlist_list_costs_a_few_reads_of_the_memberships(tmp_path, capsys):
    db = DatabaseService(db_path=tmp_path / "cuepoint.db")
    MigrationRunner(db).migrate()
    try:
        build(db)
        service = MatchStatusService(MatchStatusRepository(db))
        connection = db.connect()
        reference_sql = (
            "SELECT COUNT(*) FROM (SELECT DISTINCT playlist_id, track_id"
            " FROM rekordbox_playlist_tracks)"
        )

        def timed(call):
            best = float("inf")
            for _ in range(7):
                started = time.perf_counter()
                result = call()
                best = min(best, time.perf_counter() - started)
            return best, result

        timed(lambda: service.playlists("running"))  # warm the page cache
        best, statuses = timed(lambda: service.playlists("running"))
        reference, _ = timed(lambda: connection.execute(reference_sql).fetchone())

        with capsys.disabled():
            print(
                f"\n/clean/playlists at {TRACKS} tracks, {PLAYLISTS} playlists:"
                f" best {best * 1000:.0f} ms; reading the memberships once"
                f" {reference * 1000:.0f} ms ({best / reference:.1f}x)"
            )
        assert len(statuses.playlists) == PLAYLISTS
        assert statuses.whole_library.track_count == TRACKS
        assert statuses.whole_library.unsaved > 0
        assert any(p.running for p in statuses.playlists)
        assert best <= MAX_TIMES_THE_REFERENCE * reference
        if os.environ.get("CUEPOINT_PERF_ABSOLUTE") == "1":
            assert best <= BUDGET_SECONDS
    finally:
        db.close_all()
