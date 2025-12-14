#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Non-interactive test to verify MainWindow structure
"""

import pytest

from cuepoint.ui.main_window import MainWindow


@pytest.mark.ui
def test_main_window_structure(qapp):
    """Test MainWindow structure without showing window."""
    window = MainWindow()

    # Window properties
    assert window.windowTitle() == "CuePoint - Beatport Metadata Enricher"
    assert window.minimumSize().width() == 800
    assert window.minimumSize().height() == 600

    # Menu bar
    menubar = window.menuBar()
    assert menubar is not None
    menus = [a.text() for a in menubar.actions()]
    for expected in ["&File", "&Edit", "&View", "&Help"]:
        assert any(expected in m for m in menus), f"Menu '{expected}' not found"

    # Status bar
    statusbar = window.statusBar()
    assert statusbar is not None
    # Status bar message is allowed to evolve; just ensure it's set.
    assert statusbar.currentMessage()

    # Central widget
    central = window.centralWidget()
    assert central is not None
    layout = central.layout()
    assert layout is not None

    # Core group boxes (smoke checks only; titles are part of the UI contract)
    assert hasattr(window, "file_box")
    assert window.file_box.title() == "Collection"
    assert hasattr(window, "mode_box")
    assert window.mode_box.title() == "Mode"
    assert hasattr(window, "playlist_box")
    assert window.playlist_box.title() == "Playlist"

    # Progress and results groups
    assert hasattr(window, "progress_group")
    assert hasattr(window, "results_group")
    assert not window.progress_group.isVisible()
    assert not window.results_group.isVisible()

    # Drag & drop
    assert window.acceptDrops()




