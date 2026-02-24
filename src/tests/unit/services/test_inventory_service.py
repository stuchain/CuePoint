"""Unit tests for InventoryService."""

import os
import tempfile
import xml.etree.ElementTree as ET
from pathlib import Path
from unittest.mock import Mock, patch

import pytest

from cuepoint.services.inventory_service import InventoryService, default_inventory_db_path


def _minimal_collection_xml(tracks):
    """Build DJ_PLAYLISTS XML with only COLLECTION and given TRACKs."""
    root = ET.Element("DJ_PLAYLISTS")
    root.set("Version", "1.0.0")
    collection = ET.SubElement(root, "COLLECTION")
    for tr in tracks:
        t = ET.SubElement(collection, "TRACK")
        t.set("TrackID", tr.get("TrackID", ""))
        t.set("Name", tr.get("Name", ""))
        t.set("Artist", tr.get("Artist", ""))
        if "Label" in tr:
            t.set("Label", tr["Label"])
    return ET.tostring(root, encoding="unicode")


class TestInventoryServiceImport:
    """Test import_from_xml."""

    def test_import_from_xml_upserts_and_returns_count(self, tmp_path: Path):
        """import_from_xml with enrich=False returns imported count and get_library_artists works."""
        xml = _minimal_collection_xml([
            {"TrackID": "1", "Name": "Track One", "Artist": "Artist A"},
        ])
        xml_path = tmp_path / "test.xml"
        xml_path.write_text(xml, encoding="utf-8")
        db_path = str(tmp_path / "inventory.sqlite")
        service = InventoryService(db_path=db_path)
        result = service.import_from_xml(str(xml_path), enrich=False)
        assert result["imported"] >= 1
        assert "errors" in result
        artists = service.get_library_artists()
        assert "Artist A" in artists

    @patch("cuepoint.core.matcher.track_urls", return_value=[])
    def test_import_from_xml_with_enrich_calls_enrichment(self, mock_track_urls: Mock, tmp_path: Path):
        """When enrich=True and beatport_service provided, enrichment runs (inKey path; no URLs -> enriched=0)."""
        xml = _minimal_collection_xml([
            {"TrackID": "1", "Name": "T", "Artist": "A"},
        ])
        xml_path = tmp_path / "test.xml"
        xml_path.write_text(xml, encoding="utf-8")
        db_path = str(tmp_path / "inventory.sqlite")
        mock_bp = Mock()
        service = InventoryService(db_path=db_path, beatport_service=mock_bp)
        result = service.import_from_xml(str(xml_path), enrich=True)
        assert result["imported"] == 1
        assert "enriched" in result


class TestInventoryServiceGetters:
    """Test get_library_artists, get_inventory_stats after import."""

    def test_get_library_artists_after_import(self, tmp_path: Path):
        """After import, get_library_artists returns artists from XML."""
        xml = _minimal_collection_xml([
            {"TrackID": "1", "Name": "T1", "Artist": "Artist One"},
        ])
        xml_path = tmp_path / "test.xml"
        xml_path.write_text(xml, encoding="utf-8")
        service = InventoryService(db_path=str(tmp_path / "inv.sqlite"))
        service.import_from_xml(str(xml_path), enrich=False)
        artists = service.get_library_artists()
        assert "Artist One" in artists

    def test_get_inventory_stats_after_import(self, tmp_path: Path):
        """Import 3 tracks -> get_inventory_stats returns total=3."""
        xml = _minimal_collection_xml([
            {"TrackID": "1", "Name": "T1", "Artist": "A"},
            {"TrackID": "2", "Name": "T2", "Artist": "A"},
            {"TrackID": "3", "Name": "T3", "Artist": "B"},
        ])
        xml_path = tmp_path / "test.xml"
        xml_path.write_text(xml, encoding="utf-8")
        service = InventoryService(db_path=str(tmp_path / "inv.sqlite"))
        service.import_from_xml(str(xml_path), enrich=False)
        stats = service.get_inventory_stats()
        assert stats["total"] == 3

    def test_get_inventory_stats_empty_db(self, tmp_path: Path):
        """Before any import, get_inventory_stats returns total=0, with_label=0."""
        service = InventoryService(db_path=str(tmp_path / "empty.sqlite"))
        stats = service.get_inventory_stats()
        assert stats["total"] == 0
        assert stats["with_label"] == 0


class TestListInventory:
    """Test list_inventory."""

    def test_list_inventory_after_import(self, tmp_path: Path):
        """After import, list_inventory returns rows with artist, title, label."""
        xml = _minimal_collection_xml([
            {"TrackID": "1", "Name": "Track One", "Artist": "Artist A"},
            {"TrackID": "2", "Name": "Track Two", "Artist": "Artist B", "Label": "Defected"},
        ])
        xml_path = tmp_path / "test.xml"
        xml_path.write_text(xml, encoding="utf-8")
        service = InventoryService(db_path=str(tmp_path / "inv.sqlite"))
        service.import_from_xml(str(xml_path), enrich=False)
        rows = service.list_inventory(limit=100)
        assert len(rows) == 2
        artists = {r["artist"] for r in rows}
        assert "Artist A" in artists
        assert "Artist B" in artists
        titles = {r["title"] for r in rows}
        assert "Track One" in titles
        assert "Track Two" in titles

    def test_list_inventory_search_filters(self, tmp_path: Path):
        """list_inventory with search= filters by artist, title, or label."""
        xml = _minimal_collection_xml([
            {"TrackID": "1", "Name": "Alpha Track", "Artist": "DJ One"},
            {"TrackID": "2", "Name": "Beta Track", "Artist": "DJ Two", "Label": "LabelX"},
        ])
        xml_path = tmp_path / "test.xml"
        xml_path.write_text(xml, encoding="utf-8")
        service = InventoryService(db_path=str(tmp_path / "inv.sqlite"))
        service.import_from_xml(str(xml_path), enrich=False)
        rows = service.list_inventory(limit=100, search="Alpha")
        assert len(rows) == 1
        assert rows[0]["title"] == "Alpha Track"
        rows = service.list_inventory(limit=100, search="LabelX")
        assert len(rows) == 1
        assert rows[0]["label"] == "LabelX"


class TestDefaultInventoryDbPath:
    """Test default_inventory_db_path."""

    def test_default_inventory_db_path_returns_path(self):
        """Returns a path ending with CuePoint/incrate/inventory.sqlite."""
        path = default_inventory_db_path()
        assert "CuePoint" in path
        assert "incrate" in path
        assert path.endswith("inventory.sqlite")
