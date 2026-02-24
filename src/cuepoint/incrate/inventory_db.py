"""SQLite persistence for inCrate inventory."""

import sqlite3
from pathlib import Path
from typing import Any, Dict, List, Optional

from cuepoint.incrate.models import InventoryRecord

_SCHEMA_PATH = Path(__file__).resolve().parent / "schema.sql"

_UPSERT_SQL = """
INSERT INTO inventory (track_key, track_id, artist, title, remix_version, label, beatport_track_id, beatport_url, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(track_key) DO UPDATE SET
  artist = excluded.artist,
  title = excluded.title,
  remix_version = excluded.remix_version,
  label = COALESCE(NULLIF(TRIM(excluded.label), ''), inventory.label),
  beatport_track_id = COALESCE(excluded.beatport_track_id, inventory.beatport_track_id),
  beatport_url = COALESCE(excluded.beatport_url, inventory.beatport_url),
  updated_at = excluded.updated_at;
"""


def _load_schema() -> str:
    return _SCHEMA_PATH.read_text(encoding="utf-8")


def init_db(db_path: str) -> None:
    """Create inventory tables and indexes if they do not exist."""
    Path(db_path).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)
    try:
        conn.executescript(_load_schema())
    finally:
        conn.close()


def reset_db(db_path: str) -> None:
    """Delete all inventory rows. Use when switching to a different collection.xml."""
    conn = sqlite3.connect(db_path)
    try:
        conn.execute("DELETE FROM inventory")
        conn.commit()
        conn.execute("VACUUM")
    finally:
        conn.close()


def get_connection(db_path: str) -> sqlite3.Connection:
    """Return a connection to the inventory database. Caller must close or use as context manager."""
    return sqlite3.connect(db_path)


def upsert(cursor: sqlite3.Cursor, record: InventoryRecord) -> None:
    """Insert or update one inventory row by track_key."""
    cursor.execute(
        _UPSERT_SQL,
        (
            record.track_key,
            record.track_id,
            record.artist or "",
            record.title or "",
            record.remix_version or "",
            record.label or "",
            record.beatport_track_id,
            record.beatport_url,
            record.created_at,
            record.updated_at,
        ),
    )


def upsert_batch(cursor: sqlite3.Cursor, records: List[InventoryRecord]) -> None:
    """Insert or update multiple inventory rows."""
    for record in records:
        upsert(cursor, record)


def get_library_artists(cursor: sqlite3.Cursor) -> List[str]:
    """Return distinct artist names, excluding empty, sorted."""
    cursor.execute(
        "SELECT DISTINCT artist FROM inventory WHERE TRIM(artist) != '' ORDER BY artist"
    )
    return [row[0] for row in cursor.fetchall()]


def get_library_labels(cursor: sqlite3.Cursor) -> List[str]:
    """Return distinct non-empty labels, sorted."""
    cursor.execute(
        "SELECT DISTINCT label FROM inventory WHERE label IS NOT NULL AND TRIM(label) != '' ORDER BY label"
    )
    return [row[0] for row in cursor.fetchall()]


def has_artist(cursor: sqlite3.Cursor, artist_name: str) -> bool:
    """Return True if any track has the given artist (case-insensitive, trimmed)."""
    n = (artist_name or "").strip().lower()
    if not n:
        return False
    cursor.execute(
        "SELECT 1 FROM inventory WHERE LOWER(TRIM(artist)) = ? LIMIT 1",
        (n,),
    )
    return cursor.fetchone() is not None


def get_inventory_stats(cursor: sqlite3.Cursor) -> Dict[str, int]:
    """Return total track count and count with non-empty label."""
    cursor.execute(
        "SELECT COUNT(*) AS total, "
        "COUNT(CASE WHEN label IS NOT NULL AND TRIM(label) != '' THEN 1 END) AS with_label "
        "FROM inventory"
    )
    row = cursor.fetchone()
    return {"total": row[0] or 0, "with_label": row[1] or 0}


def get_all_inventory(
    cursor: sqlite3.Cursor,
    limit: int = 5000,
    search: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Return inventory rows as list of dicts for UI (id, track_id, artist, title, label, beatport_url, etc.)."""
    if search and (search := (search or "").strip()):
        pattern = f"%{search}%"
        cursor.execute(
            """SELECT id, track_key, track_id, artist, title, remix_version, label,
                      beatport_track_id, beatport_url, created_at, updated_at
               FROM inventory
               WHERE artist LIKE ? OR title LIKE ? OR (label IS NOT NULL AND label LIKE ?)
               ORDER BY id
               LIMIT ?""",
            (pattern, pattern, pattern, limit),
        )
    else:
        cursor.execute(
            """SELECT id, track_key, track_id, artist, title, remix_version, label,
                      beatport_track_id, beatport_url, created_at, updated_at
               FROM inventory
               ORDER BY id
               LIMIT ?""",
            (limit,),
        )
    columns = [
        "id", "track_key", "track_id", "artist", "title", "remix_version",
        "label", "beatport_track_id", "beatport_url", "created_at", "updated_at",
    ]
    return [dict(zip(columns, row)) for row in cursor.fetchall()]
