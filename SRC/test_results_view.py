#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Test script for ResultsView widget

Tests the ResultsView widget with sample data.
"""

import sys
from PySide6.QtWidgets import QApplication, QWidget, QVBoxLayout, QPushButton
from gui.results_view import ResultsView
from gui_interface import TrackResult


def create_sample_results():
    """Create sample TrackResult objects for testing"""
    results = []
    
    # Sample matched track
    results.append(TrackResult(
        playlist_index=1,
        title="Dance With Me",
        artist="Shadu",
        matched=True,
        beatport_title="Dance With Me",
        beatport_artists="Shadu",
        beatport_key="8A",
        beatport_key_camelot="8A",
        beatport_bpm="128",
        beatport_url="https://www.beatport.com/track/dance-with-me/123456",
        match_score=145.5,
        title_sim=95.0,
        artist_sim=100.0,
        confidence="high"
    ))
    
    # Sample unmatched track
    results.append(TrackResult(
        playlist_index=2,
        title="Unknown Track",
        artist="Unknown Artist",
        matched=False
    ))
    
    # Sample matched track with medium confidence
    results.append(TrackResult(
        playlist_index=3,
        title="Another Track",
        artist="Another Artist",
        matched=True,
        beatport_title="Another Track (Original Mix)",
        beatport_artists="Another Artist",
        beatport_key="5A",
        beatport_key_camelot="5A",
        beatport_bpm="130",
        beatport_url="https://www.beatport.com/track/another-track/789012",
        match_score=85.0,
        title_sim=80.0,
        artist_sim=90.0,
        confidence="medium"
    ))
    
    return results


def test_results_view():
    """Test ResultsView widget"""
    app = QApplication(sys.argv)
    
    window = QWidget()
    window.setWindowTitle("ResultsView Test")
    window.setGeometry(100, 100, 1000, 700)
    
    layout = QVBoxLayout(window)
    
    # Create results view
    results_view = ResultsView()
    layout.addWidget(results_view)
    
    # Test buttons
    button_layout = QVBoxLayout()
    
    load_btn = QPushButton("Load Sample Results")
    load_btn.clicked.connect(lambda: results_view.set_results(create_sample_results(), "Test Playlist"))
    button_layout.addWidget(load_btn)
    
    clear_btn = QPushButton("Clear Results")
    clear_btn.clicked.connect(results_view.clear)
    button_layout.addWidget(clear_btn)
    
    layout.addLayout(button_layout)
    
    # Load sample data initially
    results_view.set_results(create_sample_results(), "Test Playlist")
    
    window.show()
    sys.exit(app.exec())


if __name__ == "__main__":
    test_results_view()

