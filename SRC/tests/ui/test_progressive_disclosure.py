#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Tests for Progressive Disclosure functionality
"""

import pytest
import os
import tempfile
from pathlib import Path
from unittest.mock import patch, MagicMock
from PySide6.QtWidgets import QApplication
from PySide6.QtCore import Qt

from cuepoint.ui.main_window import MainWindow
from cuepoint.models.playlist import Playlist
from cuepoint.models.track import Track


@pytest.fixture
def main_window(qapp):
    """Create a MainWindow instance for testing"""
    window = MainWindow()
    return window


@pytest.fixture
def sample_xml_file():
    """Create a temporary sample XML file for testing"""
    # Create a more complete valid XML file that matches Rekordbox format
    xml_content = """<?xml version="1.0" encoding="UTF-8"?>
<DJ_PLAYLISTS Version="1.0.0">
    <PRODUCT Name="rekordbox" Version="6.0.0"/>
    <COLLECTION Entries="1">
        <TRACK TrackID="1" Name="Test Track" Artist="Test Artist" Album="Test Album" TotalTime="180000" Location="file://localhost/C:/test.mp3"/>
    </COLLECTION>
    <PLAYLISTS>
        <NODE Name="ROOT" Type="0">
            <NODE Name="Test Playlist" Type="1" Count="1">
                <TRACK Key="1"/>
            </NODE>
        </NODE>
    </PLAYLISTS>
</DJ_PLAYLISTS>"""
    
    # Create temporary file
    with tempfile.NamedTemporaryFile(mode='w', suffix='.xml', delete=False, encoding='utf-8') as f:
        f.write(xml_content)
        temp_path = f.name
    
    yield temp_path
    
    # Cleanup
    try:
        os.unlink(temp_path)
    except:
        pass


def test_initial_state_hides_processing_mode(main_window):
    """Test that processing mode is hidden initially"""
    assert hasattr(main_window, 'mode_group')
    assert not main_window.mode_group.isVisible()


def test_initial_state_hides_playlist_selection(main_window):
    """Test that playlist selection is hidden initially"""
    assert hasattr(main_window, 'single_playlist_group')
    assert not main_window.single_playlist_group.isVisible()


def test_initial_state_hides_start_button(main_window):
    """Test that start button is hidden and disabled initially"""
    assert hasattr(main_window, 'start_button_container')
    assert not main_window.start_button_container.isVisible()
    assert not main_window.start_button.isEnabled()


def test_processing_mode_appears_after_xml_selected(main_window, sample_xml_file, qapp):
    """Test that processing mode appears after valid XML file is selected"""
    # Navigate to main interface first (from tool selection page)
    main_window.show_main_interface()
    main_window.show()  # Show window so visibility checks work
    qapp.processEvents()
    
    # Initially hidden
    assert not main_window.mode_group.isVisible()
    
    # Mock validate_file to return True
    original_validate = main_window.file_selector.validate_file
    main_window.file_selector.validate_file = lambda path: True
    
    # Mock load_xml_file to not raise exception
    mock_playlist = Playlist(name="Test Playlist", tracks=[Track(track_id="1", title="Test", artist="Artist")])
    def mock_load_xml_file(xml_path):
        main_window.playlist_selector.playlists = {"Test Playlist": mock_playlist}
        main_window.playlist_selector.combo.clear()
        main_window.playlist_selector.combo.addItem("Test Playlist")
        main_window.playlist_selector.combo.setEnabled(True)
    main_window.playlist_selector.load_xml_file = mock_load_xml_file
    
    # Also mock save_recent_file to not raise exception
    def mock_save_recent_file(file_path):
        pass  # Do nothing
    main_window.save_recent_file = mock_save_recent_file
    
    # Directly call on_file_selected
    main_window.on_file_selected(sample_xml_file)
    qapp.processEvents()
    
    # Processing mode should now be visible
    # Since window is shown, isVisible should work correctly
    assert main_window.mode_group.isVisible(), f"Mode group should be visible after file selection. Current visibility: {main_window.mode_group.isVisible()}"


def test_processing_mode_hides_on_invalid_file(main_window):
    """Test that processing mode hides if invalid file is selected"""
    # Select invalid file
    main_window.file_selector.set_file("invalid_file.txt")
    
    # Processing mode should be hidden
    assert not main_window.mode_group.isVisible()


def test_playlist_selection_appears_after_mode_selected(main_window, sample_xml_file, qapp):
    """Test that playlist selection appears after processing mode is selected"""
    # Navigate to main interface first
    main_window.show_main_interface()
    main_window.show()  # Show window
    qapp.processEvents()
    
    # Mock validate_file
    main_window.file_selector.validate_file = lambda path: True
    
    # Mock load_xml_file
    mock_playlist = Playlist(name="Test Playlist", tracks=[Track(track_id="1", title="Test", artist="Artist")])
    def mock_load_xml_file(xml_path):
        main_window.playlist_selector.playlists = {"Test Playlist": mock_playlist}
        main_window.playlist_selector.combo.clear()
        main_window.playlist_selector.combo.addItem("Test Playlist")
        main_window.playlist_selector.combo.setEnabled(True)
    main_window.playlist_selector.load_xml_file = mock_load_xml_file
    
    # Directly call on_file_selected
    main_window.on_file_selected(sample_xml_file)
    qapp.processEvents()
    
    # Processing mode should be visible
    assert main_window.mode_group.isVisible()
    
    # Playlist selection should still be hidden
    assert not main_window.single_playlist_group.isVisible()
    
    # Select single mode (should trigger on_mode_changed)
    main_window.single_mode_radio.setChecked(True)
    qapp.processEvents()
    
    # Playlist selection should now be visible
    assert main_window.single_playlist_group.isVisible()


def test_start_button_enabled_after_playlist_selected(main_window, sample_xml_file, qapp):
    """Test that start button is enabled after playlist is selected"""
    # Navigate to main interface first
    main_window.show_main_interface()
    main_window.show()  # Show window
    qapp.processEvents()
    
    # Mock validate_file
    main_window.file_selector.validate_file = lambda path: True
    
    # Mock load_xml_file
    mock_playlist = Playlist(name="Test Playlist", tracks=[Track(track_id="1", title="Test", artist="Artist")])
    def mock_load_xml_file(xml_path):
        main_window.playlist_selector.playlists = {"Test Playlist": mock_playlist}
        main_window.playlist_selector.combo.clear()
        main_window.playlist_selector.combo.addItem("Test Playlist")
        main_window.playlist_selector.combo.setEnabled(True)
    main_window.playlist_selector.load_xml_file = mock_load_xml_file
    
    # Directly call on_file_selected
    main_window.on_file_selected(sample_xml_file)
    qapp.processEvents()
    
    # Select single mode
    main_window.single_mode_radio.setChecked(True)
    qapp.processEvents()
    
    # Start button should be visible but disabled
    assert main_window.start_button_container.isVisible()
    assert not main_window.start_button.isEnabled()
    
    # Select a playlist (simulate by calling the handler)
    # First, ensure playlists are loaded
    if hasattr(main_window.playlist_selector, 'playlists') and main_window.playlist_selector.playlists:
        playlist_name = list(main_window.playlist_selector.playlists.keys())[0]
        main_window.on_playlist_selected(playlist_name)
        qapp.processEvents()
        
        # Start button should now be enabled
        assert main_window.start_button.isEnabled()


def test_progressive_disclosure_workflow(main_window, sample_xml_file, qapp):
    """Test the complete progressive disclosure workflow"""
    # Navigate to main interface first
    main_window.show_main_interface()
    main_window.show()  # Show window
    qapp.processEvents()
    
    # Mock validate_file
    main_window.file_selector.validate_file = lambda path: True
    
    # Mock load_xml_file
    mock_playlist = Playlist(name="Test Playlist", tracks=[Track(track_id="1", title="Test", artist="Artist")])
    def mock_load_xml_file(xml_path):
        main_window.playlist_selector.playlists = {"Test Playlist": mock_playlist}
        main_window.playlist_selector.combo.clear()
        main_window.playlist_selector.combo.addItem("Test Playlist")
        main_window.playlist_selector.combo.setEnabled(True)
    main_window.playlist_selector.load_xml_file = mock_load_xml_file
    
    # Step 1: Initial state - everything hidden
    assert not main_window.mode_group.isVisible()
    assert not main_window.single_playlist_group.isVisible()
    assert not main_window.start_button_container.isVisible()
    
    # Step 2: Select XML file - processing mode appears
    main_window.on_file_selected(sample_xml_file)
    qapp.processEvents()
    assert main_window.mode_group.isVisible()
    assert not main_window.single_playlist_group.isVisible()
    assert not main_window.start_button_container.isVisible()
    
    # Step 3: Select processing mode - playlist selection appears
    main_window.single_mode_radio.setChecked(True)
    qapp.processEvents()
    assert main_window.mode_group.isVisible()
    assert main_window.single_playlist_group.isVisible()
    assert main_window.start_button_container.isVisible()
    assert not main_window.start_button.isEnabled()  # Still disabled
    
    # Step 4: Select playlist - start button enabled
    if hasattr(main_window.playlist_selector, 'playlists') and main_window.playlist_selector.playlists:
        playlist_name = list(main_window.playlist_selector.playlists.keys())[0]
        main_window.on_playlist_selected(playlist_name)
        qapp.processEvents()
        assert main_window.start_button.isEnabled()


def test_batch_mode_shows_batch_processor(main_window, sample_xml_file, qapp):
    """Test that batch mode shows batch processor instead of playlist selector"""
    # Navigate to main interface first
    main_window.show_main_interface()
    main_window.show()  # Show window
    qapp.processEvents()
    
    # Mock validate_file
    main_window.file_selector.validate_file = lambda path: True
    
    # Mock load_xml_file
    mock_playlist = Playlist(name="Test Playlist", tracks=[Track(track_id="1", title="Test", artist="Artist")])
    def mock_load_xml_file(xml_path):
        main_window.playlist_selector.playlists = {"Test Playlist": mock_playlist}
        main_window.playlist_selector.combo.clear()
        main_window.playlist_selector.combo.addItem("Test Playlist")
        main_window.playlist_selector.combo.setEnabled(True)
    main_window.playlist_selector.load_xml_file = mock_load_xml_file
    
    # Directly call on_file_selected
    main_window.on_file_selected(sample_xml_file)
    qapp.processEvents()
    
    # Select batch mode
    main_window.batch_mode_radio.setChecked(True)
    qapp.processEvents()
    
    # Batch processor should be visible
    assert main_window.batch_processor.isVisible()
    # Single playlist group should be hidden
    assert not main_window.single_playlist_group.isVisible()


def test_invalid_file_resets_progressive_disclosure(main_window, sample_xml_file, qapp):
    """Test that selecting invalid file resets progressive disclosure"""
    # Navigate to main interface first
    main_window.show_main_interface()
    main_window.show()  # Show window
    qapp.processEvents()
    
    # Mock validate_file for valid file
    main_window.file_selector.validate_file = lambda path: path == sample_xml_file
    
    # Mock load_xml_file for valid file
    mock_playlist = Playlist(name="Test Playlist", tracks=[Track(track_id="1", title="Test", artist="Artist")])
    def mock_load_xml_file(xml_path):
        main_window.playlist_selector.playlists = {"Test Playlist": mock_playlist}
        main_window.playlist_selector.combo.clear()
        main_window.playlist_selector.combo.addItem("Test Playlist")
        main_window.playlist_selector.combo.setEnabled(True)
    main_window.playlist_selector.load_xml_file = mock_load_xml_file
    
    # First select valid file
    main_window.on_file_selected(sample_xml_file)
    qapp.processEvents()
    assert main_window.mode_group.isVisible()
    
    # Select mode
    main_window.single_mode_radio.setChecked(True)
    qapp.processEvents()
    assert main_window.single_playlist_group.isVisible()
    
    # Now select invalid file
    main_window.file_selector.set_file("invalid.txt")
    qapp.processEvents()
    
    # Everything should be hidden again
    assert not main_window.mode_group.isVisible()
    assert not main_window.single_playlist_group.isVisible()
    assert not main_window.start_button_container.isVisible()

