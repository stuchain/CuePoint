"""Phase 5: Tests for IncratePage widget."""

from unittest.mock import MagicMock

import pytest

from cuepoint.ui.widgets.incrate_page import IncratePage


@pytest.fixture
def mock_services():
    inv = MagicMock()
    inv.get_inventory_stats.return_value = {"total": 0}
    inv.get_library_artists.return_value = []
    inv.get_library_labels.return_value = []
    api = MagicMock()
    api.list_genres.return_value = []
    discovery = MagicMock()
    config = MagicMock()
    config.get.side_effect = lambda k, d=None: "short" if k == "incrate.playlist_name_format" else (d if d is not None else "")
    return {"inv": inv, "api": api, "discovery": discovery, "config": config}


@pytest.fixture
def incrate_page(qapp, mock_services):
    return IncratePage(
        inventory_service=mock_services["inv"],
        beatport_api=mock_services["api"],
        discovery_service=mock_services["discovery"],
        config_service=mock_services["config"],
    )


def test_import_section_has_browse_and_import(incrate_page):
    """Import section has Browse and Import buttons."""
    assert incrate_page.import_section.browse_btn is not None
    assert incrate_page.import_section.import_btn is not None
    assert incrate_page.import_section.browse_btn.text() == "Browse"
    assert incrate_page.import_section.import_btn.text() == "Import"


def test_discover_disabled_before_import(incrate_page, mock_services):
    """Discover button is disabled when inventory has 0 tracks."""
    mock_services["inv"].get_inventory_stats.return_value = {"total": 0}
    incrate_page._refresh_stats()
    assert incrate_page.discover_section.discover_btn.isEnabled() is False


def test_playlist_name_default(incrate_page):
    """Playlist name edit has a default (short format)."""
    text = incrate_page.playlist_section.name_edit.text()
    placeholder = incrate_page.playlist_section.name_edit.placeholderText()
    assert text or placeholder
    # Short format is like "feb24" or "jan15" - month abbrev + day
    combined = (text or placeholder).lower()
    assert any(m in combined for m in ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"])
