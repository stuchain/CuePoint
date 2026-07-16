"""Phase 5: Tests for MainWindow inCrate routing."""

from unittest.mock import MagicMock, patch

import pytest

from cuepoint.ui.main_window import MainWindow
from cuepoint.ui.widgets.incrate_page import IncratePage


@pytest.fixture
def main_window(qapp):
    return MainWindow()


def test_on_tool_selected_incrate_shows_incrate_page(main_window, qapp):
    """Selecting incrate shows inCrate page when DI provides services."""
    mock_inventory = MagicMock()
    mock_inventory.get_inventory_stats.return_value = {"total": 0}
    mock_inventory.get_library_artists.return_value = []
    mock_inventory.get_library_labels.return_value = []
    mock_api = MagicMock()
    mock_api.list_genres.return_value = []
    mock_discovery = MagicMock()

    with patch("cuepoint.utils.di_container.get_container") as m_get:
        container = MagicMock()

        def resolve(cls):
            if "InventoryService" in cls.__name__:
                return mock_inventory
            if "BeatportApi" in cls.__name__:
                return mock_api
            if "IncrateDiscoveryService" in cls.__name__:
                return mock_discovery
            raise KeyError(cls)

        container.resolve.side_effect = resolve
        m_get.return_value = container
        main_window.on_tool_selected("incrate")
    qapp.processEvents()
    assert main_window.current_page == "incrate"
    central = main_window.centralWidget()
    assert central is not None
    assert isinstance(central, IncratePage)


def test_back_to_tools_shows_tool_selection(main_window, qapp):
    """Triggering back_to_tools from inCrate shows tool selection page."""
    mock_inventory = MagicMock()
    mock_inventory.get_inventory_stats.return_value = {"total": 0}
    mock_inventory.get_library_artists.return_value = []
    mock_inventory.get_library_labels.return_value = []
    mock_api = MagicMock()
    mock_api.list_genres.return_value = []
    mock_discovery = MagicMock()

    with patch("cuepoint.utils.di_container.get_container") as m_get:
        container = MagicMock()

        def resolve(cls):
            if "InventoryService" in cls.__name__:
                return mock_inventory
            if "BeatportApi" in cls.__name__:
                return mock_api
            if "IncrateDiscoveryService" in cls.__name__:
                return mock_discovery
            raise KeyError(cls)

        container.resolve.side_effect = resolve
        m_get.return_value = container
        main_window.on_tool_selected("incrate")
    qapp.processEvents()
    assert main_window.current_page == "incrate"
    main_window.centralWidget().back_to_tools_requested.emit()
    qapp.processEvents()
    assert main_window.current_page == "tool_selection"
    assert main_window.centralWidget() == main_window.tool_selection_page
