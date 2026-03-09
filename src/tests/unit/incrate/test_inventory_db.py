"""Unit tests for incrate inventory_db."""

from pathlib import Path

import pytest

from cuepoint.incrate.inventory_db import (
    get_all_inventory,
    get_connection,
    get_inventory_stats,
    get_library_artists,
    get_library_labels,
    has_artist,
    init_db,
    reset_db,
    upsert,
    upsert_batch,
)
from cuepoint.incrate.models import InventoryRecord


@pytest.fixture
def db_path(tmp_path: Path) -> str:
    """Return a path to a new SQLite file in a temp directory."""
    return str(tmp_path / "inventory.sqlite")


@pytest.fixture
def initialized_db(db_path: str):
    """Create and initialize DB at db_path."""
    init_db(db_path)
    return db_path


class TestInitDb:
    """Test init_db."""

    def test_init_db_creates_tables(self, db_path: str):
        """init_db creates inventory table and indexes."""
        init_db(db_path)
        conn = get_connection(db_path)
        try:
            cur = conn.cursor()
            cur.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='inventory'"
            )
            assert cur.fetchone() is not None
            cur.execute(
                "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_inventory_artist'"
            )
            assert cur.fetchone() is not None
        finally:
            conn.close()


class TestUpsert:
    """Test upsert and upsert_batch."""

    def test_upsert_inserts_new_row(self, initialized_db: str):
        """upsert inserts a new row with all fields."""
        now = "2025-02-26T12:00:00Z"
        record = InventoryRecord(
            track_key="1",
            track_id="1",
            artist="Artist A",
            title="Title One",
            remix_version="",
            label="Label X",
            beatport_track_id=None,
            beatport_url=None,
            created_at=now,
            updated_at=now,
        )
        conn = get_connection(initialized_db)
        try:
            cur = conn.cursor()
            upsert(cur, record)
            conn.commit()
            cur.execute("SELECT track_key, artist, title, label FROM inventory WHERE track_key='1'")
            row = cur.fetchone()
            assert row is not None
            assert row[0] == "1"
            assert row[1] == "Artist A"
            assert row[2] == "Title One"
            assert row[3] == "Label X"
        finally:
            conn.close()

    def test_upsert_updates_existing_by_track_key(self, initialized_db: str):
        """Upserting same track_key updates row and changes updated_at; created_at unchanged."""
        created = "2025-02-26T10:00:00Z"
        updated1 = "2025-02-26T11:00:00Z"
        updated2 = "2025-02-26T12:00:00Z"
        conn = get_connection(initialized_db)
        try:
            cur = conn.cursor()
            upsert(cur, InventoryRecord(
                track_key="1", track_id="1", artist="A", title="T1", remix_version="", label=None,
                beatport_track_id=None, beatport_url=None, created_at=created, updated_at=updated1,
            ))
            conn.commit()
            upsert(cur, InventoryRecord(
                track_key="1", track_id="1", artist="A", title="T1", remix_version="", label="Defected",
                beatport_track_id=None, beatport_url=None, created_at=created, updated_at=updated2,
            ))
            conn.commit()
            cur.execute("SELECT label, created_at, updated_at FROM inventory WHERE track_key='1'")
            row = cur.fetchone()
            assert row is not None
            assert row[0] == "Defected"
            assert row[1] == created
            assert row[2] == updated2
        finally:
            conn.close()


class TestGetLibraryArtists:
    """Test get_library_artists."""

    def test_get_library_artists_returns_distinct(self, initialized_db: str):
        """Returns distinct artists, sorted."""
        now = "2025-02-26T12:00:00Z"
        records = [
            InventoryRecord("1", "1", "Artist B", "T1", "", None, None, None, now, now),
            InventoryRecord("2", "2", "Artist A", "T2", "", None, None, None, now, now),
            InventoryRecord("3", "3", "Artist B", "T3", "", None, None, None, now, now),
        ]
        conn = get_connection(initialized_db)
        try:
            cur = conn.cursor()
            upsert_batch(cur, records)
            conn.commit()
            artists = get_library_artists(cur)
            assert len(artists) == 2
            assert artists == ["Artist A", "Artist B"]
        finally:
            conn.close()


class TestGetLibraryLabels:
    """Test get_library_labels."""

    def test_get_library_labels_excludes_empty(self, initialized_db: str):
        """Returns only non-empty labels."""
        now = "2025-02-26T12:00:00Z"
        records = [
            InventoryRecord("1", "1", "A", "T1", "", "", None, None, now, now),
            InventoryRecord("2", "2", "A", "T2", "", "Defected", None, None, now, now),
        ]
        conn = get_connection(initialized_db)
        try:
            cur = conn.cursor()
            upsert_batch(cur, records)
            conn.commit()
            labels = get_library_labels(cur)
            assert labels == ["Defected"]
        finally:
            conn.close()


class TestHasArtist:
    """Test has_artist."""

    def test_has_artist_true(self, initialized_db: str):
        """Returns True when artist exists."""
        now = "2025-02-26T12:00:00Z"
        conn = get_connection(initialized_db)
        try:
            cur = conn.cursor()
            upsert(cur, InventoryRecord("1", "1", "Charlotte de Witte", "T", "", None, None, None, now, now))
            conn.commit()
            assert has_artist(cur, "Charlotte de Witte") is True
        finally:
            conn.close()

    def test_has_artist_false(self, initialized_db: str):
        """Returns False when artist not in DB."""
        conn = get_connection(initialized_db)
        try:
            cur = conn.cursor()
            assert has_artist(cur, "Unknown Artist") is False
        finally:
            conn.close()

    def test_has_artist_case_insensitive(self, initialized_db: str):
        """Match is case-insensitive."""
        now = "2025-02-26T12:00:00Z"
        conn = get_connection(initialized_db)
        try:
            cur = conn.cursor()
            upsert(cur, InventoryRecord("1", "1", "Artist A", "T", "", None, None, None, now, now))
            conn.commit()
            assert has_artist(cur, "artist a") is True
        finally:
            conn.close()


class TestGetInventoryStats:
    """Test get_inventory_stats."""

    def test_get_inventory_stats(self, initialized_db: str):
        """Returns total and with_label counts."""
        now = "2025-02-26T12:00:00Z"
        records = [
            InventoryRecord("1", "1", "A", "T1", "", "L1", None, None, now, now),
            InventoryRecord("2", "2", "A", "T2", "", "L2", None, None, now, now),
            InventoryRecord("3", "3", "A", "T3", "", "L3", None, None, now, now),
            InventoryRecord("4", "4", "A", "T4", "", None, None, None, now, now),
            InventoryRecord("5", "5", "A", "T5", "", "", None, None, now, now),
        ]
        conn = get_connection(initialized_db)
        try:
            cur = conn.cursor()
            upsert_batch(cur, records)
            conn.commit()
            stats = get_inventory_stats(cur)
            assert stats["total"] == 5
            assert stats["with_label"] == 3
        finally:
            conn.close()

    def test_get_inventory_stats_empty_db(self, initialized_db: str):
        """Empty DB returns total=0, with_label=0."""
        conn = get_connection(initialized_db)
        try:
            cur = conn.cursor()
            stats = get_inventory_stats(cur)
            assert stats["total"] == 0
            assert stats["with_label"] == 0
        finally:
            conn.close()


class TestResetDb:
    """Test reset_db."""

    def test_reset_db_clears_all_rows(self, initialized_db: str):
        """reset_db deletes all inventory rows; stats and artists/labels are empty."""
        now = "2025-02-26T12:00:00Z"
        conn = get_connection(initialized_db)
        try:
            cur = conn.cursor()
            upsert_batch(cur, [
                InventoryRecord("1", "1", "Artist A", "T1", "", "Label X", None, None, now, now),
                InventoryRecord("2", "2", "Artist B", "T2", "", "Label Y", None, None, now, now),
            ])
            conn.commit()
        finally:
            conn.close()
        reset_db(initialized_db)
        conn = get_connection(initialized_db)
        try:
            cur = conn.cursor()
            stats = get_inventory_stats(cur)
            assert stats["total"] == 0
            assert stats["with_label"] == 0
            assert get_library_artists(cur) == []
            assert get_library_labels(cur) == []
        finally:
            conn.close()


class TestGetAllInventory:
    """Test get_all_inventory."""

    def test_get_all_inventory_returns_dicts(self, initialized_db: str):
        """Returns list of dicts with expected keys."""
        now = "2025-02-26T12:00:00Z"
        conn = get_connection(initialized_db)
        try:
            cur = conn.cursor()
            upsert(cur, InventoryRecord("1", "1", "A", "T1", "", "L1", None, None, now, now))
            conn.commit()
            rows = get_all_inventory(cur, limit=10)
            assert len(rows) == 1
            assert rows[0]["artist"] == "A"
            assert rows[0]["title"] == "T1"
            assert rows[0]["label"] == "L1"
            assert "id" in rows[0]
            assert "beatport_url" in rows[0]
        finally:
            conn.close()

    def test_get_all_inventory_search_filters(self, initialized_db: str):
        """Search filters by artist, title, or label."""
        now = "2025-02-26T12:00:00Z"
        conn = get_connection(initialized_db)
        try:
            cur = conn.cursor()
            upsert_batch(cur, [
                InventoryRecord("1", "1", "Artist One", "Track Alpha", "", "Label X", None, None, now, now),
                InventoryRecord("2", "2", "Artist Two", "Track Beta", "", "Label Y", None, None, now, now),
            ])
            conn.commit()
            rows = get_all_inventory(cur, limit=10, search="Alpha")
            assert len(rows) == 1
            assert rows[0]["title"] == "Track Alpha"
            rows = get_all_inventory(cur, limit=10, search="Label Y")
            assert len(rows) == 1
            assert rows[0]["label"] == "Label Y"
        finally:
            conn.close()
