#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""A library at any schema version, with rows in every table that exists then.

HARDEN-02. The migration ladder (``tests/integration/test_migration_ladder.py``)
needs a library *as an older build left it*, filled the way a user's is, so that
upgrading it can be checked row by row. The per-migration tests do this for one
step from N-1 by hand; this does it for every version.

How
---
:func:`build_library_at` applies the real migrations up to ``V`` through the
real runner, then inserts :func:`seed_rows` into every table the database has.
The seed is written once, in *head* terms (every column the newest schema has),
and narrowed per table to the columns ``PRAGMA table_info`` reports at ``V``.
So a column added later is simply not written, and a table that does not exist
yet is skipped. A row that an older schema's ``CHECK`` refuses (a ``kind`` it
had not learnt) is adapted by version in :data:`ADAPT`.

The seed is fixed: the same ``seed`` gives the same rows on every machine
(Unicode, NULLs and extremes included), and the foreign keys between its rows
hold at every version, which :func:`build_library_at` checks before it returns.

A new migration that adds a table fails :func:`check_every_table_has_a_seed`
until the table is given rows here; that is the point.
"""

from __future__ import annotations

import json
import random
import sqlite3
import unicodedata
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Sequence, Tuple

from cuepoint.migrations import Migration
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.migration_runner import MigrationRunner, _discovered

Row = Dict[str, Any]

NOW = "2026-10-05T12:00:00+00:00"
EARLIER = "2025-01-31T23:59:59+00:00"

#: Tables the seed does not fill: the runner's own record.
UNSEEDED = frozenset({"schema_version"})

#: Tables the engine's revision counters add; made by the runner at head, not
#: by a migration, and so not part of the ladder's rows.
INFRASTRUCTURE_PREFIXES = ("sqlite_", "revision_counters")

NFD_ARTIST = unicodedata.normalize("NFD", "Beyoncé")
NFD_TITLE = unicodedata.normalize("NFD", "Déjà Vu")


def all_migrations() -> List[Migration]:
    """Every migration of this build, lowest version first."""
    return list(_discovered())


def head_version() -> int:
    return all_migrations()[-1].version


def migrations_through(version: int) -> List[Migration]:
    return [m for m in all_migrations() if m.version <= version]


def migrate_through(service: DatabaseService, version: int) -> None:
    """Apply the real migrations up to and including ``version``."""
    MigrationRunner(service, migrations=migrations_through(version)).migrate()


# --------------------------------------------------------------------- rows


def _tracks(rng: random.Random, count: int) -> List[Row]:
    special: List[Row] = [
        {
            "title": "Καλημέρα Κόσμε (Extended Mix)",
            "artist": "Μάρκος Βαμβακάρης",
            "album": "Ρεμπέτικα",
            "label": "Λύρα",
            "genre": "Ρεμπέτικο",
            "bpm": 124.5,
            "key": "8A",
            "year": 1936,
            "path": "/μουσική/Ρεμπέτικα/καλημέρα.mp3",
        },
        {
            "title": "夜に駆ける",
            "artist": "YOASOBI",
            "remixer": "田中 太郎",
            "album": "THE BOOK",
            "label": "ソニー・ミュージック",
            "genre": "J-Pop",
            "bpm": 130.0,
            "key": "12B",
            "year": 2019,
            "path": "/音楽/ヨアソビ/夜に駆ける.flac",
        },
        {
            "title": NFD_TITLE,
            "artist": NFD_ARTIST,
            "album": "Lemonade",
            "label": "Parkwood",
            "genre": "R&B",
            "bpm": 80.25,
            "key": "3A",
            "year": 2016,
            "path": "/Music/" + NFD_ARTIST + "/" + NFD_TITLE + ".m4a",
        },
        # Everything optional left NULL, and the required text empty.
        {"title": "", "artist": "", "path": ""},
        # Extremes.
        {
            "title": "x" * 2000,
            "artist": "'; DROP TABLE tracks; --",
            "album": "line one\nline two\ttab",
            "label": "🎧 Emoji Records",
            "genre": "",
            "bpm": 999.99,
            "key": "1A",
            "year": 9999,
            "duration": 2**31 - 1,
            "rating": 255,
            "play_count": 2**31 - 1,
            "bitrate": 0,
            "path": "/" + "deep/" * 60 + "file.wav",
        },
        {
            "title": "Zero",
            "artist": "Boundary",
            "bpm": 0.01,
            "year": 1,
            "duration": 0,
            "rating": 0,
            "play_count": 0,
            "path": "C:\\Users\\dj\\Music\\zero.aiff",
        },
    ]
    genres = ["House", "Techno", "Trance", "Drum & Bass", None]
    labels = ["Nightfall Audio", "NIGHTFALL-AUDIO", "Ünderground", None]
    rows: List[Row] = []
    for index in range(count):
        base = dict(special[index]) if index < len(special) else {}
        if index >= len(special):
            base = {
                "title": f"Track {index:03d}",
                "artist": f"Artist {rng.randrange(1, 6)}",
                "remixer": rng.choice([None, "Some Remixer"]),
                "album": rng.choice([None, "Album A", "Album B"]),
                "label": rng.choice(labels),
                "genre": rng.choice(genres),
                "bpm": round(rng.uniform(70, 175), 2),
                "key": rng.choice(["1A", "5B", "9A", None]),
                "year": rng.choice([None, 1999, 2010, 2024]),
                "duration": rng.randrange(60, 900),
                "rating": rng.choice([None, 0, 3, 5]),
                "play_count": rng.choice([None, 0, 12]),
                "path": f"/music/set{index % 3}/track_{index:03d}.mp3",
            }
        path = base.get("path", "")
        row: Row = {
            "id": index + 1,
            "rekordbox_track_id": str(1000 + index),
            "file_path": path,
            "normalized_path": unicodedata.normalize("NFC", path).lower(),
            "title": base.get("title", ""),
            "artist": base.get("artist", ""),
            "remixer": base.get("remixer"),
            "album": base.get("album"),
            "label": base.get("label"),
            "genre": base.get("genre"),
            "key": base.get("key"),
            "bpm": base.get("bpm"),
            "year": base.get("year"),
            "duration_seconds": base.get("duration"),
            "created_at": EARLIER,
            "updated_at": NOW,
            "rating": base.get("rating"),
            "play_count": base.get("play_count"),
            "colour": base.get("colour"),
            "date_added": base.get("date_added", "2024-06-01") if index % 2 else None,
            "comment": base.get("comment"),
            "bitrate": base.get("bitrate", 320 if index % 3 == 0 else None),
            "label_key": None,
        }
        rows.append(row)
    return rows


def _collections() -> List[Row]:
    """Eight folders nested one inside the next, then a Collection at the bottom."""
    rows: List[Row] = []
    for depth in range(8):
        rows.append(
            _collection(depth + 1, depth or None, "folder", f"Ebene {depth}", depth)
        )
    rows[0]["parent_id"] = None
    rows.append(_collection(9, 8, "collection", "Deep ΑΒΓ 日本語", 8))
    smart = _collection(10, None, "smart", "Smart: fast house", 0)
    smart["rules_json"] = json.dumps(
        {"all": [{"field": "bpm", "op": "gte", "value": 120}]}
    )
    smart["sort_field"] = "bpm"
    smart["sort_dir"] = "desc"
    rows.append(smart)
    rows.append(_collection(11, None, "set", "Friday ✨ set", 0))
    rows.append(_collection(12, None, "collection", "Frozen copy", 0))
    rows[-1]["frozen_from_id"] = 10
    rows[-1]["frozen_at"] = NOW
    return rows


def _collection(
    row_id: int, parent: Optional[int], kind: str, name: str, depth: int
) -> Row:
    return {
        "id": row_id,
        "parent_id": parent,
        "kind": kind,
        "name": name,
        "position": row_id,
        "depth": depth,
        "rules_json": None,
        "sort_field": None,
        "sort_dir": None,
        "frozen_from_id": None,
        "frozen_at": None,
        "created_at": EARLIER,
        "updated_at": NOW,
    }


def seed_rows(track_count: int = 12, seed: int = 7) -> Dict[str, List[Row]]:
    """The fixed rows, per table, in head terms, keyed by table name.

    The dict is ordered so a table comes after the tables its rows refer to.
    """
    rng = random.Random(seed)
    tracks = _tracks(rng, max(track_count, 8))
    ids = [t["id"] for t in tracks]
    collections = _collections()

    def rows(*items: Row) -> List[Row]:
        return list(items)

    # Collection 9 (the deepest) holds the first six tracks; Set 11 holds four
    # (rows 7..10 of collection_tracks), each of which is a Set entry.
    collection_tracks: List[Row] = [
        {
            "id": position + 1,
            "collection_id": 9,
            "track_id": ids[position],
            "position": position,
            "added_at": NOW,
        }
        for position in range(6)
    ] + [
        {
            "id": 7 + position,
            "collection_id": 11,
            "track_id": ids[position + 2],
            "position": position,
            "added_at": NOW,
        }
        for position in range(4)
    ]

    return {
        "tracks": tracks,
        "jobs": rows(
            {
                "id": "job-match-1",
                "type": "match",
                "state": "completed",
                "demo": 0,
                "progress_json": json.dumps({"done": 3, "total": 3}),
                "error_json": None,
                "created_at": EARLIER,
                "updated_at": NOW,
            },
            {
                "id": "job-ünï-2",
                "type": "clean",
                "state": "failed",
                "demo": 1,
                "progress_json": None,
                "error_json": json.dumps({"message": "失敗しました"}),
                "created_at": EARLIER,
                "updated_at": NOW,
            },
        ),
        "activity_events": rows(
            *[
                {
                    "id": n,
                    "type": "library.imported",
                    "summary": f"Imported {n * 100} tracks ✔",
                    "detail_json": json.dumps({"n": n, "τίτλος": "ok"})
                    if n % 2
                    else None,
                    "created_at": NOW,
                }
                for n in range(1, 6)
            ]
        ),
        "library_source": rows(
            {
                "id": 1,
                "xml_path": "/Users/δj/rekordbox.xml",
                "xml_modified_at": NOW,
                "xml_size_bytes": 2**40,
                "imported_at": NOW,
                "track_count": len(tracks),
                "playlist_count": 3,
            },
            {
                "id": 2,
                "xml_path": "",
                "xml_modified_at": None,
                "xml_size_bytes": None,
                "imported_at": EARLIER,
                "track_count": 0,
                "playlist_count": 0,
            },
        ),
        "library_reads": rows(
            {
                "id": 1,
                "read_at": EARLIER,
                "kind": "import",
                "tracks": 12,
                "changed": 12,
            },
            {"id": 2, "read_at": NOW, "kind": "refresh", "tracks": 12, "changed": 2},
        ),
        "rekordbox_playlists": rows(
            {
                "id": 1,
                "parent_id": None,
                "name": "ROOT ☃",
                "kind": "folder",
                "depth": 0,
                "position": 0,
                "rekordbox_path": "ROOT ☃",
                "parent_path": None,
                "track_count": 0,
            },
            {
                "id": 2,
                "parent_id": 1,
                "name": "Peak time",
                "kind": "playlist",
                "depth": 1,
                "position": 0,
                "rekordbox_path": "ROOT ☃/Peak time",
                "parent_path": "ROOT ☃",
                "track_count": 3,
            },
        ),
        "rekordbox_playlist_tracks": rows(
            *[{"playlist_id": 2, "track_id": ids[n], "position": n} for n in range(3)]
        ),
        "collections": collections,
        "collection_tracks": collection_tracks,
        "tags": rows(
            {
                "id": 1,
                "name": "banger",
                "category": "mood",
                "colour": "#ff0000",
                "created_at": NOW,
            },
            {
                "id": 2,
                "name": "ένταση",
                "category": None,
                "colour": None,
                "created_at": NOW,
            },
            {
                "id": 3,
                "name": "夜",
                "category": "time",
                "colour": "#000",
                "created_at": EARLIER,
            },
        ),
        "track_tags": rows(
            *[
                {"track_id": ids[n], "tag_id": 1 + n % 3, "created_at": NOW}
                for n in range(6)
            ]
        ),
        "track_metadata": rows(
            {
                "track_id": ids[0],
                "rating": 5,
                "favorite": 1,
                "notes": "Opening track — Ελληνικά ✔",
                "created_at": EARLIER,
                "updated_at": NOW,
                "key": "9A",
                "bpm": 125.0,
                "genre": "Deep House",
                "label": "Override Label",
                "year": 2020,
                "label_key": None,
            },
            {
                "track_id": ids[3],
                "rating": None,
                "favorite": 0,
                "notes": None,
                "created_at": NOW,
                "updated_at": NOW,
                "key": None,
                "bpm": None,
                "genre": None,
                "label": None,
                "year": None,
                "label_key": None,
            },
        ),
        "track_history": rows(
            *[
                {
                    "id": n + 1,
                    "track_id": ids[n],
                    "field": "genre",
                    "old_value_json": json.dumps("House"),
                    "new_value_json": json.dumps("Ρεμπέτικο"),
                    "source": "user",
                    "changed_at": NOW,
                    "batch_id": "batch-1" if n % 2 else None,
                }
                for n in range(4)
            ]
        ),
        "match_jobs": rows(
            {
                "job_id": "job-match-1",
                "resumed_from": None,
                "rematch": 0,
                "selected": 5,
                "excluded": 2,
                "attempt_watermark": 3,
                "created_at": NOW,
                "label": "First pass",
            }
        ),
        "match_job_tracks": rows(
            *[
                {
                    "job_id": "job-match-1",
                    "position": n,
                    "track_id": ids[n],
                    "done": n % 2,
                }
                for n in range(4)
            ]
        ),
        "match_attempts": rows(
            *[
                {
                    "id": n + 1,
                    "track_id": ids[n],
                    "job_id": "job-match-1",
                    "started_at": EARLIER,
                    "finished_at": NOW,
                    "outcome": ("matched", "no_match", "error")[n % 3],
                    "best_candidate_id": None,
                    "score": 91.5 if n % 3 == 0 else None,
                    "error": "timeout" if n % 3 == 2 else None,
                    "queries_json": json.dumps(["Μάρκος Βαμβακάρης"]),
                    "input_json": json.dumps({"title": tracks[n]["title"][:20]}),
                    "matcher_version": "m1",
                }
                for n in range(3)
            ]
        ),
        "match_candidates": rows(
            *[
                {
                    "id": n + 1,
                    "attempt_id": 1,
                    "rank": n,
                    "beatport_track_id": str(9001 + n),
                    "url": f"https://www.beatport.com/track/x/{9001 + n}",
                    "title": "Καλημέρα",
                    "artists": "Μάρκος",
                    "remixers": None,
                    "label": "Λύρα",
                    "genre": "x",
                    "subgenre": None,
                    "key": "8A",
                    "bpm": 124.0,
                    "release_name": "R",
                    "release_date": "1936-01-01",
                    "release_year": 1936,
                    "artwork_url": None,
                    "preview_url": None,
                    "score": 91.5 - n,
                    "base_score": 90.0,
                    "title_sim": 0.9,
                    "artist_sim": 1.0,
                    "bonus_year": 1,
                    "bonus_key": 0,
                    "guard_ok": 1,
                    "reject_reason": None,
                    "query_index": 0,
                    "query_text": "q",
                    "candidate_index": n,
                    "elapsed_ms": 120,
                    "is_winner": 1 if n == 0 else 0,
                }
                for n in range(3)
            ]
        ),
        "track_match": rows(
            {
                "track_id": ids[0],
                "state": "accepted",
                "decided_by": "user",
                "attempt_id": 1,
                "candidate_id": 1,
                "newer_attempt_id": None,
                "decided_at": NOW,
                "candidate_score": 91.5,
            },
            {
                "track_id": ids[1],
                "state": "no_match",
                "decided_by": "auto",
                "attempt_id": 2,
                "candidate_id": None,
                "newer_attempt_id": 3,
                "decided_at": NOW,
                "candidate_score": None,
            },
        ),
        "track_files": rows(
            {
                "track_id": ids[0],
                "status": "present",
                "checked_path": "/a",
                "size_bytes": 2**33,
                "checked_at": NOW,
                "reason": None,
            },
            {
                "track_id": ids[1],
                "status": "missing",
                "checked_path": "/ё",
                "size_bytes": None,
                "checked_at": NOW,
                "reason": "root_unavailable",
            },
            {
                "track_id": ids[2],
                "status": "unreadable",
                "checked_path": "",
                "size_bytes": 0,
                "checked_at": NOW,
                "reason": None,
            },
        ),
        "track_artwork": rows(
            {
                "track_id": ids[0],
                "embedded": "present",
                "embedded_hash": "abc123",
                "beatport_url": "https://geo-media.beatport.com/x.jpg",
                "cache_key": "k1",
                "checked_at": NOW,
                "checked_path": "/a",
                "embedded_refused": None,
                "beatport_refused": "format",
                "beatport_page": "https://www.beatport.com/track/x/1",
            },
            {
                "track_id": ids[1],
                "embedded": "unknown",
                "embedded_hash": None,
                "beatport_url": None,
                "cache_key": None,
                "checked_at": None,
                "checked_path": None,
                "embedded_refused": "corrupt",
                "beatport_refused": None,
                "beatport_page": None,
            },
        ),
        "duplicate_groups": rows(
            {
                "id": 1,
                "signal": "path",
                "group_key": "/a",
                "computed_at": NOW,
                "member_hash": "h1",
            },
            {
                "id": 2,
                "signal": "text",
                "group_key": "καλημέρα|μάρκος",
                "computed_at": NOW,
                "member_hash": "h2",
            },
        ),
        "duplicate_members": rows(
            {"group_id": 1, "track_id": ids[0]},
            {"group_id": 1, "track_id": ids[1]},
            {"group_id": 2, "track_id": ids[2]},
            {"group_id": 2, "track_id": ids[3]},
        ),
        "duplicate_dismissals": rows(
            {
                "signal": "beatport",
                "group_key": "9001",
                "member_hash": "hh",
                "dismissed_at": NOW,
            }
        ),
        "file_writes": rows(
            {
                "id": 1,
                "job_id": "job-ünï-2",
                "track_id": ids[0],
                "file_path": "/μουσική/x.mp3",
                "field": "genre",
                "old_value_json": json.dumps("a"),
                "new_value_json": json.dumps("b"),
                "outcome": "written",
                "reason": None,
                "written_at": NOW,
                "pending": 0,
                "restore_of": None,
            },
            {
                "id": 2,
                "job_id": "job-ünï-2",
                "track_id": ids[0],
                "file_path": "/μουσική/x.mp3",
                "field": "genre",
                "old_value_json": json.dumps("b"),
                "new_value_json": json.dumps("a"),
                "outcome": "restored",
                "reason": "undo",
                "written_at": NOW,
                "pending": 1,
                "restore_of": 1,
            },
        ),
        "rekordbox_exports": rows(
            {
                "id": 1,
                "job_id": "job-ünï-2",
                "started_at": EARLIER,
                "finished_at": NOW,
                "outcome": "written",
                "destination_path": "/out/export.xml",
                "source_path": "/in/rekordbox.xml",
                "source_stale": 0,
                "track_count": 12,
                "changed_track_count": 4,
                "fields_json": json.dumps(["genre", "key"]),
                "key_format": "camelot",
                "missing_file_count": None,
                "dropped_reference_count": 1,
                "error": None,
            }
        ),
        "rekordbox_export_playlists": rows(
            {
                "id": 1,
                "export_id": 1,
                "collection_id": 9,
                "kind": "collection",
                "name": "Deep ΑΒΓ 日本語",
                "path": "ROOT/Deep",
                "entry_count": 6,
                "dropped_count": 0,
                "rules_json": None,
            }
        ),
        "beatport_tracks": rows(
            *[
                {
                    "beatport_track_id": 9001 + n,
                    "title": f"Beatport Τίτλος {n}",
                    "mix_name": "Original Mix" if n else None,
                    "url": f"https://www.beatport.com/track/x/{9001 + n}",
                    "label_id": 55 if n else None,
                    "label_name": "Λύρα" if n else None,
                    "label_key": "λυρα" if n else None,
                    "release_id": 700 + n,
                    "release_name": "R",
                    "release_date": "2025-12-31",
                    "bpm": 128.0,
                    "key": "Gmin",
                    "genre_id": 5,
                    "genre_name": "House",
                    "fetched_at": NOW,
                }
                for n in range(4)
            ]
        ),
        "beatport_track_artists": rows(
            {
                "beatport_track_id": 9001,
                "role": "artist",
                "position": 0,
                "artist_id": 1,
                "name": "Μάρκος",
                "name_key": "μαρκος",
            },
            {
                "beatport_track_id": 9001,
                "role": "remixer",
                "position": 0,
                "artist_id": None,
                "name": "田中",
                "name_key": "田中",
            },
            {
                "beatport_track_id": 9002,
                "role": "artist",
                "position": 0,
                "artist_id": 2,
                "name": NFD_ARTIST,
                "name_key": "beyonce",
            },
        ),
        "beatport_name_lookups": rows(
            {
                "kind": "label",
                "name_key": "λυρα",
                "beatport_id": 55,
                "beatport_name": "Λύρα",
                "looked_up_at": NOW,
            },
            {
                "kind": "artist",
                "name_key": "nobody",
                "beatport_id": None,
                "beatport_name": None,
                "looked_up_at": NOW,
            },
        ),
        "beatport_listings": rows(
            {
                "kind": "label",
                "beatport_id": 55,
                "since": "2025-01-01",
                "fetched_at": NOW,
                "tracks": 40,
            },
            {
                "kind": "artist",
                "beatport_id": 1,
                "since": "2025-01-01",
                "fetched_at": NOW,
                "tracks": 0,
            },
        ),
        "discovery_runs": rows(
            {
                "id": 1,
                "job_id": "job-ünï-2",
                "started_at": EARLIER,
                "finished_at": NOW,
                "outcome": "succeeded",
                "params_json": json.dumps(
                    {
                        "labels": {"picked": ["Λύρα", "ソニー", "Λύρα "]},
                        "artists": {"picked": [NFD_ARTIST]},
                    }
                ),
                "labels_in_scope": 3,
                "labels_resolved": 2,
                "artists_in_scope": 4,
                "charts_read": 1,
                "releases_read": 7,
                "tracks_found": 3,
                "error": None,
                "error_class": None,
            },
            {
                "id": 2,
                "job_id": None,
                "started_at": NOW,
                "finished_at": None,
                "outcome": None,
                "params_json": "{}",
                "labels_in_scope": 0,
                "labels_resolved": 0,
                "artists_in_scope": 0,
                "charts_read": 0,
                "releases_read": 0,
                "tracks_found": 0,
                "error": "boom",
                "error_class": "network",
            },
        ),
        "discovery_run_tracks": rows(
            *[
                {"run_id": 1, "beatport_track_id": 9001 + n, "position": n}
                for n in range(3)
            ]
        ),
        "discovery_run_sources": rows(
            {
                "run_id": 1,
                "beatport_track_id": 9001,
                "source_type": "chart",
                "source_id": 77,
                "group_key": "chart:77",
                "source_name": "Top 10 ✨",
                "source_url": "https://www.beatport.com/chart/77",
                "matched_on": "label",
            },
            {
                "run_id": 1,
                "beatport_track_id": 9002,
                "source_type": "label_release",
                "source_id": 55,
                "group_key": "",
                "source_name": None,
                "source_url": None,
                "matched_on": "label",
            },
        ),
        "discovery_run_groups": rows(
            {
                "run_id": 1,
                "kind": "chart",
                "key": "chart:77",
                "name": "Top 10 ✨",
                "beatport_id": 77,
                "owner_key": None,
                "curator": "Beatport",
                "art_url": None,
                "position": 0,
            }
        ),
        "wantlist": rows(
            {
                "beatport_track_id": 9001,
                "added_at": NOW,
                "note": "buy this — Ελληνικά",
                "bought_at": None,
                "added_from_run_id": 1,
            },
            {
                "beatport_track_id": 9002,
                "added_at": EARLIER,
                "note": None,
                "bought_at": NOW,
                "added_from_run_id": None,
            },
        ),
        "track_credits": rows(
            {
                "track_id": ids[0],
                "role": "artist",
                "position": 0,
                "name": "Μάρκος Βαμβακάρης",
                "name_key": "μαρκος βαμβακαρης",
            },
            {
                "track_id": ids[1],
                "role": "remixer",
                "position": 0,
                "name": "田中 太郎",
                "name_key": "田中太郎",
            },
            {
                "track_id": ids[2],
                "role": "artist",
                "position": 0,
                "name": NFD_ARTIST,
                "name_key": "beyonce",
            },
        ),
        "derived_indexes": rows(
            {"name": "credits", "version": 3, "built_at": NOW},
            {"name": "ünï", "version": 0, "built_at": EARLIER},
        ),
        "set_details": rows(
            {
                "collection_id": 11,
                "kind": "set",
                "notes": "Warm-up → peak",
                "created_at": EARLIER,
                "updated_at": NOW,
            }
        ),
        "set_chapters": rows(
            {
                "id": 1,
                "collection_id": 11,
                "position": 0,
                "name": "Warm-up",
                "notes": None,
                "target_seconds": 1800,
                "bpm_min": 100.0,
                "bpm_max": 120.0,
                "created_at": NOW,
                "updated_at": NOW,
            },
            {
                "id": 2,
                "collection_id": 11,
                "position": 1,
                "name": "",
                "notes": "peak ⚡",
                "target_seconds": None,
                "bpm_min": None,
                "bpm_max": None,
                "created_at": NOW,
                "updated_at": NOW,
            },
        ),
        "set_entries": rows(
            {
                "entry_id": 7,
                "collection_id": 11,
                "chapter_id": 1,
                "in_seconds": 0,
                "out_seconds": 240,
                "note": None,
            },
            {
                "entry_id": 8,
                "collection_id": 11,
                "chapter_id": 1,
                "in_seconds": None,
                "out_seconds": None,
                "note": "drop in",
            },
            {
                "entry_id": 9,
                "collection_id": 11,
                "chapter_id": 2,
                "in_seconds": 30,
                "out_seconds": 31,
                "note": None,
            },
            {
                "entry_id": 10,
                "collection_id": 11,
                "chapter_id": 2,
                "in_seconds": 10,
                "out_seconds": None,
                "note": "ΤΕΛΟΣ",
            },
        ),
        "set_acknowledgements": rows(
            {
                "id": 1,
                "collection_id": 11,
                "from_entry_id": 7,
                "to_entry_id": 8,
                "warning": "bpm_jump",
                "compared_json": json.dumps({"a": 1}),
                "created_at": NOW,
            },
        ),
        "track_cues": rows(
            {
                "track_id": ids[0],
                "position": 0,
                "kind": "cue",
                "hot_cue": 0,
                "start_ms": 0,
                "end_ms": None,
                "name": "Start",
                "color": "#ff00aa",
            },
            {
                "track_id": ids[0],
                "position": 1,
                "kind": "loop",
                "hot_cue": None,
                "start_ms": 1000,
                "end_ms": 9000,
                "name": None,
                "color": None,
            },
            {
                "track_id": ids[1],
                "position": 0,
                "kind": "fade_in",
                "hot_cue": 7,
                "start_ms": 2**31,
                "end_ms": None,
                "name": "夜",
                "color": "#00ff00",
            },
        ),
        "track_beat_grid": rows(
            {
                "track_id": ids[0],
                "position": 0,
                "start_ms": 12,
                "bpm": 124.5,
                "meter": "4/4",
                "beat": 1,
            },
            {
                "track_id": ids[0],
                "position": 1,
                "start_ms": 60000,
                "bpm": 125.0,
                "meter": None,
                "beat": None,
            },
            {
                "track_id": ids[1],
                "position": 0,
                "start_ms": 0,
                "bpm": 130.0,
                "meter": "4/4",
                "beat": 4,
            },
        ),
        "play_counts": rows(
            {"track_id": ids[0], "read_id": 1, "play_count": 3},
            {"track_id": ids[0], "read_id": 2, "play_count": 9},
            {"track_id": ids[1], "read_id": 2, "play_count": 0},
        ),
        "discover_lists": rows(
            {
                "id": 1,
                "kind": "label",
                "name": "Μυστικά labels",
                "name_key": "μυστικα",
                "created_at": EARLIER,
                "updated_at": NOW,
            },
            {
                "id": 2,
                "kind": "artist",
                "name": "Favourite artists",
                "name_key": "favourite",
                "created_at": NOW,
                "updated_at": NOW,
            },
        ),
        "discover_list_members": rows(
            {"list_id": 1, "position": 0, "member": "Λύρα"},
            {"list_id": 1, "position": 1, "member": "ソニー"},
            {"list_id": 2, "position": 0, "member": NFD_ARTIST},
        ),
        "library_meta": rows(
            {"key": "last_opened_by", "value": "0.9.0"},
            {"key": "ladder_marker", "value": None},
        ),
    }


#: Statements a table's rows need run first when it is filled after its parents
#: were (the step-by-step ladder fills a table the step it appears): a Set is
#: stored as a plain Collection below version 25, and becomes one when the
#: tables that hold its chapters and entries exist.
BEFORE_SEED: Dict[str, List[str]] = {
    "set_details": [
        "UPDATE collections SET kind = 'set' WHERE id = 11 AND kind = 'collection'"
    ],
    # m0027 itself writes a first library read; the second one is ours.
    "play_counts": [
        "INSERT OR IGNORE INTO library_reads (id, read_at, kind, tracks, changed)"
        f" VALUES (2, '{NOW}', 'refresh', 12, 2)"
    ],
}


def _collection_kind_at(row: Row, version: int) -> Optional[Row]:
    """A Set is a plain Collection until the schema learns the ``set`` kind (m0025)."""
    if row["kind"] == "set" and version < 25:
        return {**row, "kind": "collection"}
    return row


#: Rows an older schema cannot take as written: ``(row, version) -> row | None``
#: (None drops the row). Keep this to what a ``CHECK`` forces.
ADAPT: Dict[str, Callable[[Row, int], Optional[Row]]] = {
    "collections": _collection_kind_at,
}


# ------------------------------------------------------------------ writing


def table_names(connection: sqlite3.Connection) -> List[str]:
    return [
        r[0]
        for r in connection.execute(
            "SELECT name FROM sqlite_master WHERE type = 'table'"
            " AND name NOT LIKE 'sqlite_%' ORDER BY name"
        )
    ]


def columns_of(connection: sqlite3.Connection, table: str) -> List[str]:
    return [r[1] for r in connection.execute(f'PRAGMA table_info("{table}")')]


def check_every_table_has_a_seed(connection: sqlite3.Connection) -> None:
    """Fail when a table exists that the seed knows nothing about."""
    known = set(seed_rows(8)) | UNSEEDED
    unknown = [
        t
        for t in table_names(connection)
        if t not in known and not t.startswith(INFRASTRUCTURE_PREFIXES)
    ]
    if unknown:
        raise AssertionError(
            f"tables {unknown} have no rows in tests/fixtures/schema_ladder.py: "
            "add them to seed_rows() so the migration ladder carries data in them"
        )


def seed_tables(
    connection: sqlite3.Connection,
    version: int,
    only_empty: bool = False,
    track_count: int = 12,
    seed: int = 7,
    tables: Optional[Sequence[str]] = None,
) -> Dict[str, int]:
    """Insert the seed into the tables this database has, by its own columns.

    Args:
        only_empty: Fill only tables with no rows (the step-by-step ladder calls
            this after each migration for the tables that migration made).
        tables: Restrict to these tables.

    Returns:
        Rows inserted, per table.
    """
    check_every_table_has_a_seed(connection)
    present = set(table_names(connection))
    inserted: Dict[str, int] = {}
    for table, rows in seed_rows(track_count, seed).items():
        if table not in present or (tables is not None and table not in tables):
            continue
        if only_empty and connection.execute(f'SELECT 1 FROM "{table}"').fetchone():
            continue
        for statement in BEFORE_SEED.get(table, []):
            connection.execute(statement)
        have = columns_of(connection, table)
        count = 0
        for row in rows:
            adapt = ADAPT.get(table)
            if adapt is not None:
                row = adapt(row, version)
                if row is None:
                    continue
            data = {k: v for k, v in row.items() if k in have}
            names = ", ".join(f'"{k}"' for k in data)
            marks = ", ".join("?" for _ in data)
            connection.execute(
                f'INSERT INTO "{table}" ({names}) VALUES ({marks})',
                tuple(data.values()),
            )
            count += 1
        inserted[table] = count
    return inserted


def build_library_at(
    version: int,
    seed: int = 7,
    directory: Optional[Path] = None,
    track_count: int = 12,
) -> Path:
    """Make a library file at schema ``version``, with rows in every table.

    Args:
        version: 1 .. head. The real migrations up to it are applied.
        seed: Chooses the generated tracks; the same seed gives the same file.
        directory: Where to write ``cuepoint.db`` (a fresh temp dir by default).

    Returns:
        The database path. The file is closed, in WAL mode, with no open
        connection.
    """
    import tempfile

    folder = Path(directory) if directory is not None else Path(tempfile.mkdtemp())
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / "cuepoint.db"
    service = DatabaseService(db_path=path)
    try:
        migrate_through(service, version)
        with service.transaction() as conn:
            seed_tables(conn, version, track_count=track_count, seed=seed)
        violations = service.connect().execute("PRAGMA foreign_key_check").fetchall()
        if violations:
            raise AssertionError(
                f"the seed breaks a foreign key at version {version}: "
                f"{[tuple(v) for v in violations][:5]}"
            )
    finally:
        service.close_all()
    return path


# ---------------------------------------------------------------- snapshots


def snapshot(connection: sqlite3.Connection) -> Dict[str, Dict[str, Any]]:
    """Every user table: its columns and its rows as column-keyed tuples.

    Rows are sorted by their repr so the comparison does not depend on rowid
    order, which a table rebuild is free to change.
    """
    result: Dict[str, Dict[str, Any]] = {}
    for table in table_names(connection):
        if table in UNSEEDED or table.startswith(INFRASTRUCTURE_PREFIXES):
            continue
        cols = columns_of(connection, table)
        quoted = ", ".join(f'"{c}"' for c in cols)
        rows = [
            dict(zip(cols, r))
            for r in connection.execute(f'SELECT {quoted} FROM "{table}"')
        ]
        result[table] = {"columns": cols, "rows": rows}
    return result


def project(rows: List[Row], columns: Sequence[str]) -> List[Tuple[Any, ...]]:
    return sorted(
        (tuple(r[c] for c in columns) for r in rows),
        key=repr,
    )


# ------------------------------------------------------------------ checks


def _scalar(conn: sqlite3.Connection, sql: str, params: tuple = ()) -> Any:
    row = conn.execute(sql, params).fetchone()
    return None if row is None else row[0]


def assert_sound(conn: sqlite3.Connection, version: int) -> None:
    result = [tuple(r) for r in conn.execute("PRAGMA integrity_check")]
    assert result == [("ok",)], f"integrity_check: {result}"
    violations = [tuple(r) for r in conn.execute("PRAGMA foreign_key_check")]
    assert violations == [], f"foreign_key_check: {violations[:5]}"
    recorded = _scalar(conn, "SELECT max(version) FROM schema_version")
    assert recorded == version, f"version is {recorded}, expected {version}"
    count = _scalar(conn, "SELECT count(*) FROM schema_version")
    assert count == version, "schema_version has a gap or a repeat"


def assert_nothing_lost(
    conn: sqlite3.Connection, before: Dict[str, Dict[str, Any]], label: str
) -> None:
    """Every row of every table that was there is there, with the same values."""
    after = snapshot(conn)
    for table, was in before.items():
        assert table in after, f"{label}: table {table} disappeared"
        have = after[table]
        gone = [c for c in was["columns"] if c not in have["columns"]]
        assert not gone, f"{label}: {table} lost columns {gone}"
        assert len(have["rows"]) >= len(was["rows"]), (
            f"{label}: {table} had {len(was['rows'])} rows, now {len(have['rows'])}"
        )
        columns = was["columns"]
        old = project(was["rows"], columns)
        new = project(have["rows"], columns)
        if len(have["rows"]) == len(was["rows"]):
            assert new == old, f"{label}: {table} rows changed"
        else:
            # A migration may add rows (a backfill); it may not change or drop one.
            missing = [row for row in old if row not in new]
            assert not missing, f"{label}: {table} lost or changed {missing[:2]}"


def snapshot_of(path: Path) -> Dict[str, Dict[str, Any]]:
    connection = sqlite3.connect(str(path))
    try:
        return snapshot(connection)
    finally:
        connection.close()
