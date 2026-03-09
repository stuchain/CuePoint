"""Integration tests for inCrate inventory: import from XML, query, idempotent re-import, enrichment."""

import os
from pathlib import Path
from unittest.mock import Mock, patch

import pytest

from cuepoint.services.inventory_service import InventoryService


def _fixture_path(name: str) -> Path:
    return Path(__file__).resolve().parent.parent / "fixtures" / "rekordbox" / name


def _user_test_xml_path() -> Path:
    """Optional path to user's test XML (e.g. s:\\Downloads\\2.xml); skip if not set or missing."""
    path = os.environ.get("INCRATE_TEST_XML")
    if path and os.path.exists(path):
        return Path(path)
    win_path = Path(r"s:\Downloads\2.xml")
    if win_path.exists():
        return win_path
    return None


class TestImportRealXml:
    """Import real fixture XML and query."""

    @pytest.mark.integration
    def test_import_real_xml_minimal_then_query(self, tmp_path: Path):
        """Use fixture small.xml; import with enrich=False; artists and stats match."""
        xml_path = _fixture_path("small.xml")
        if not xml_path.exists():
            pytest.skip("Fixture small.xml not found")
        db_path = str(tmp_path / "inventory.sqlite")
        service = InventoryService(db_path=db_path)
        result = service.import_from_xml(str(xml_path), enrich=False)
        assert result["imported"] == 10
        artists = service.get_library_artists()
        assert "Artist 1" in artists
        stats = service.get_inventory_stats()
        assert stats["total"] == 10


class TestImportIdempotent:
    """Re-import same XML is idempotent."""

    @pytest.mark.integration
    def test_import_twice_idempotent(self, tmp_path: Path):
        """Import same XML twice; total unchanged, no duplicate track_key."""
        xml_path = _fixture_path("small.xml")
        if not xml_path.exists():
            pytest.skip("Fixture small.xml not found")
        db_path = str(tmp_path / "inventory.sqlite")
        service = InventoryService(db_path=db_path)
        service.import_from_xml(str(xml_path), enrich=False)
        first_stats = service.get_inventory_stats()
        service.import_from_xml(str(xml_path), enrich=False)
        second_stats = service.get_inventory_stats()
        assert second_stats["total"] == first_stats["total"]
        assert second_stats["total"] == 10


def _mock_parse_track_page_integration(url: str):
    """Return (title, artists, key, year, bpm, label, genres, rel_name, rel_date)."""
    return ("Track 1", "Artist 1", None, None, None, "Test Label", None, None, None)


class TestEnrichmentIntegration:
    """Enrichment uses inKey flow (make_search_queries + best_beatport_match); mock data.beatport."""

    @pytest.mark.integration
    @patch(
        "cuepoint.core.matcher.parse_track_page",
        side_effect=_mock_parse_track_page_integration,
    )
    @patch(
        "cuepoint.core.matcher.track_urls",
        return_value=["https://www.beatport.com/track/track-1/111"],
    )
    def test_enrichment_integration_mock_beatport(
        self, mock_track_urls: Mock, mock_parse: Mock, tmp_path: Path
    ):
        """Real DB; mock track_urls/parse_track_page; after enrich at least one row has label set."""
        xml_path = _fixture_path("small.xml")
        if not xml_path.exists():
            pytest.skip("Fixture small.xml not found")
        db_path = str(tmp_path / "inventory.sqlite")
        mock_bp = Mock()
        service = InventoryService(db_path=db_path, beatport_service=mock_bp)
        service.import_from_xml(str(xml_path), enrich=True)
        from cuepoint.incrate import inventory_db

        conn = inventory_db.get_connection(db_path)
        try:
            cur = conn.cursor()
            cur.execute(
                "SELECT COUNT(*) FROM inventory WHERE label IS NOT NULL AND TRIM(label) != ''"
            )
            with_label = cur.fetchone()[0]
            assert with_label >= 1
        finally:
            conn.close()


class TestImportProgressPhases:
    """Import progress: Parsing -> Importing N tracks -> Enriching 0/N, 1/N, ..."""

    @pytest.mark.integration
    @patch("cuepoint.core.matcher.track_urls", return_value=[])
    def test_import_progress_phases_with_enrich(
        self, mock_track_urls: Mock, tmp_path: Path
    ):
        """Progress callback receives (-1, N) after parse, then (0, total), (1, total), ... during enrich."""
        xml_path = _fixture_path("small.xml")
        if not xml_path.exists():
            pytest.skip("Fixture small.xml not found")
        db_path = str(tmp_path / "inventory.sqlite")
        mock_bp = Mock()
        phases = []

        def progress_cb(current: int, total: int) -> None:
            phases.append((current, total))

        service = InventoryService(db_path=db_path, beatport_service=mock_bp)
        result = service.import_from_xml(
            str(xml_path), enrich=True, progress_callback=progress_cb
        )

        assert result["imported"] == 10
        assert "errors" in result and len(result["errors"]) == 0
        assert any(p[0] == -1 and p[1] == 10 for p in phases), (
            "Expected (-1, 10) for 'Importing N tracks'"
        )
        assert any(p[0] == 0 and p[1] == phases[-1][1] for p in phases), (
            "Expected (0, total) at start of enrich"
        )
        assert len(phases) >= 2, "Expected at least (-1, N) and (0, total) or more"


class TestImportUserXml:
    """Import with optional user-provided XML (e.g. s:\\Downloads\\2.xml)."""

    @pytest.mark.integration
    def test_import_user_xml_if_present(self, tmp_path: Path):
        """If INCRATE_TEST_XML or s:\\Downloads\\2.xml exists, run full import and assert phases."""
        xml_path = _user_test_xml_path()
        if xml_path is None:
            pytest.skip(
                "No user test XML (set INCRATE_TEST_XML or use s:\\Downloads\\2.xml)"
            )
        db_path = str(tmp_path / "inventory.sqlite")
        phases = []

        def progress_cb(current: int, total: int) -> None:
            phases.append((current, total))

        service = InventoryService(db_path=db_path)
        result = service.import_from_xml(
            str(xml_path), enrich=False, progress_callback=progress_cb
        )

        assert result["imported"] >= 1
        assert "errors" in result and len(result["errors"]) == 0
        assert any(p[0] == -1 and p[1] == result["imported"] for p in phases), (
            "Expected (-1, N) phase"
        )
        stats = service.get_inventory_stats()
        assert stats["total"] == result["imported"]
