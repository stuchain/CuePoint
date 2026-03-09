"""Unit tests for incrate enrichment (uses inKey flow: make_search_queries + best_beatport_match)."""

from pathlib import Path
from typing import Optional
from unittest.mock import Mock, patch

import pytest

from cuepoint.incrate import enrichment, inventory_db


@pytest.fixture
def db_path(tmp_path: Path) -> str:
    return str(tmp_path / "inventory.sqlite")


@pytest.fixture
def initialized_db(db_path: str) -> str:
    inventory_db.init_db(db_path)
    return db_path


def _insert_row(
    db_path: str,
    row_id: int,
    track_key: str,
    artist: str,
    title: str,
    label: Optional[str] = None,
) -> None:
    now = "2025-02-26T12:00:00Z"
    conn = inventory_db.get_connection(db_path)
    try:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO inventory (track_key, track_id, artist, title, remix_version, label, created_at, updated_at) VALUES (?, ?, ?, ?, '', ?, ?, ?)",
            (track_key, str(row_id), artist, title, label, now, now),
        )
        conn.commit()
    finally:
        conn.close()


# parse_track_page returns (title, artists, key, year, bpm, label, genres, rel_name, rel_date)
def _mock_parse_track_page_defected(url: str):
    return ("Track One", "Artist A", None, None, None, "Defected", None, None, None)


def _mock_parse_track_page_label_two(url: str):
    return ("T2", "B", None, None, None, "LabelTwo", None, None, None)


class TestEnrichLabelsForEmpty:
    """Test enrich_labels_for_empty (inKey matching flow)."""

    @patch(
        "cuepoint.core.matcher.parse_track_page",
        side_effect=_mock_parse_track_page_defected,
    )
    @patch(
        "cuepoint.core.matcher.track_urls",
        return_value=["https://www.beatport.com/track/track-one/12345"],
    )
    def test_enrich_labels_for_empty_updates_row(
        self,
        mock_track_urls: Mock,
        mock_parse: Mock,
        initialized_db: str,
    ):
        """DB has 1 row with NULL label; inKey matcher returns match -> row updated."""
        _insert_row(initialized_db, 1, "1", "Artist A", "Track One", label=None)
        url = "https://www.beatport.com/track/track-one/12345"
        mock_bp = Mock()
        updated = enrichment.enrich_labels_for_empty(
            initialized_db,
            mock_bp,
            delay_seconds=0,
        )
        assert updated == 1
        conn = inventory_db.get_connection(initialized_db)
        try:
            cur = conn.cursor()
            cur.execute("SELECT label, beatport_url FROM inventory WHERE track_key='1'")
            row = cur.fetchone()
            assert row is not None
            assert row[0] == "Defected"
            assert row[1] == url
        finally:
            conn.close()

    def test_enrich_labels_for_empty_skips_row_with_label(
        self,
        initialized_db: str,
    ):
        """DB has 1 row with label set -> no matching calls."""
        _insert_row(initialized_db, 1, "1", "Artist A", "Track One", label="Existing")
        mock_bp = Mock()
        updated = enrichment.enrich_labels_for_empty(
            initialized_db,
            mock_bp,
            delay_seconds=0,
        )
        assert updated == 0

    @patch("cuepoint.core.matcher.parse_track_page")
    @patch("cuepoint.core.matcher.track_urls", return_value=[])
    def test_enrich_labels_for_empty_calls_progress_callback(
        self,
        mock_track_urls: Mock,
        mock_parse: Mock,
        initialized_db: str,
    ):
        """Progress callback invoked with (current, total)."""
        _insert_row(initialized_db, 1, "1", "A", "T1", label=None)
        _insert_row(initialized_db, 2, "2", "B", "T2", label=None)
        mock_bp = Mock()
        progress = Mock()
        enrichment.enrich_labels_for_empty(
            initialized_db,
            mock_bp,
            progress_callback=progress,
            delay_seconds=0,
        )
        assert progress.call_count >= 3
        calls = progress.call_args_list
        assert calls[0][0][0] == 0
        assert calls[0][0][1] == 2
        assert calls[1][0][0] == 1
        assert calls[1][0][1] == 2
        assert calls[2][0][0] == 2
        assert calls[2][0][1] == 2

    @patch(
        "cuepoint.core.matcher.parse_track_page",
        side_effect=_mock_parse_track_page_label_two,
    )
    @patch(
        "cuepoint.core.matcher.track_urls",
        side_effect=[Exception("Rate limit")]
        + [["https://www.beatport.com/track/t2/99999"]] * 50,
    )
    def test_enrich_labels_for_empty_continues_on_beatport_error(
        self,
        mock_track_urls: Mock,
        mock_parse: Mock,
        initialized_db: str,
    ):
        """First row raises (track_urls); second row still processed."""
        _insert_row(initialized_db, 1, "1", "A", "T1", label=None)
        _insert_row(initialized_db, 2, "2", "B", "T2", label=None)
        mock_bp = Mock()
        updated = enrichment.enrich_labels_for_empty(
            initialized_db,
            mock_bp,
            delay_seconds=0,
        )
        assert updated == 1
        conn = inventory_db.get_connection(initialized_db)
        try:
            cur = conn.cursor()
            cur.execute("SELECT label FROM inventory WHERE track_key='2'")
            row = cur.fetchone()
            assert row is not None
            assert row[0] == "LabelTwo"
        finally:
            conn.close()

    def test_enrich_labels_for_empty_uses_processor_when_provided(
        self, initialized_db: str
    ):
        """When processor_service and config_service provided, uses process_track (same as inKey)."""
        from cuepoint.models.result import TrackResult
        from cuepoint.models.beatport_candidate import BeatportCandidate

        _insert_row(initialized_db, 1, "1", "Artist A", "Track One", label=None)
        url = "https://www.beatport.com/track/track-one/12345"
        mock_candidate = BeatportCandidate(
            url=url,
            title="Track One",
            artists="Artist A",
            label="Defected",
            release_date=None,
            bpm=None,
            key=None,
            genre=None,
            score=85.0,
            title_sim=90,
            artist_sim=80,
            query_index=0,
            query_text="Track One Artist A",
            candidate_index=0,
            base_score=80.0,
            bonus_year=0,
            bonus_key=0,
            guard_ok=True,
            reject_reason="",
            elapsed_ms=100,
            is_winner=True,
        )
        mock_result = TrackResult(
            playlist_index=1,
            title="Track One",
            artist="Artist A",
            matched=True,
            best_match=mock_candidate,
            beatport_url=url,
            beatport_title="Track One",
            beatport_artists="Artist A",
            beatport_label="Defected",
            match_score=85.0,
            confidence="medium",
        )
        mock_processor = Mock()
        mock_processor.process_track.return_value = mock_result
        mock_config = Mock()
        mock_config.get.side_effect = lambda k, d=None: (
            1
            if k == "processing.track_workers"
            else (
                8 if k == "performance.max_workers" else (d if d is not None else None)
            )
        )
        updated = enrichment.enrich_labels_for_empty(
            initialized_db,
            beatport_service=Mock(),
            processor_service=mock_processor,
            config_service=mock_config,
            delay_seconds=0,
        )
        assert updated == 1
        mock_processor.process_track.assert_called()
        conn = inventory_db.get_connection(initialized_db)
        try:
            cur = conn.cursor()
            cur.execute("SELECT label, beatport_url FROM inventory WHERE track_key='1'")
            row = cur.fetchone()
            assert row is not None
            assert row[0] == "Defected"
            assert row[1] == url
        finally:
            conn.close()
