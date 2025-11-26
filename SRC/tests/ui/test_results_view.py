#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Test script for ResultsView widget

Tests the ResultsView widget with sample data.
"""

import sys
from PySide6.QtWidgets import QApplication, QWidget, QVBoxLayout, QPushButton
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../../..'))
from cuepoint.ui.widgets.results_view import ResultsView
from cuepoint.ui.gui_interface import TrackResult


def create_sample_results():
    """Create sample TrackResult objects for testing"""
    results = []
    
    # Sample matched track with candidates
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
        beatport_year="2024",
        beatport_url="https://www.beatport.com/track/dance-with-me/123456",
        match_score=145.5,
        title_sim=95.0,
        artist_sim=100.0,
        confidence="high",
        candidates=[
            {
                'candidate_title': 'Dance With Me',
                'candidate_artists': 'Shadu',
                'candidate_url': 'https://www.beatport.com/track/dance-with-me/123456',
                'final_score': '145.5',
                'title_sim': '95.0',
                'artist_sim': '100.0',
                'candidate_key_camelot': '8A',
                'candidate_bpm': '128',
                'candidate_year': '2024',
                'candidate_label': 'Test Label'
            },
            {
                'candidate_title': 'Dance With Me (Remix)',
                'candidate_artists': 'Shadu & Friends',
                'candidate_url': 'https://www.beatport.com/track/dance-with-me-remix/123457',
                'final_score': '135.0',
                'title_sim': '90.0',
                'artist_sim': '85.0',
                'candidate_key_camelot': '8B',
                'candidate_bpm': '130',
                'candidate_year': '2024',
                'candidate_label': 'Test Label'
            },
            {
                'candidate_title': 'Dance With Me (Extended Mix)',
                'candidate_artists': 'Shadu',
                'candidate_url': 'https://www.beatport.com/track/dance-with-me-extended/123458',
                'final_score': '125.0',
                'title_sim': '88.0',
                'artist_sim': '95.0',
                'candidate_key_camelot': '8A',
                'candidate_bpm': '128',
                'candidate_year': '2023',
                'candidate_label': 'Test Label'
            }
        ]
    ))
    
    # Sample unmatched track
    results.append(TrackResult(
        playlist_index=2,
        title="Unknown Track",
        artist="Unknown Artist",
        matched=False
    ))
    
    # Sample matched track with medium confidence and candidates
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
        beatport_year="2023",
        beatport_url="https://www.beatport.com/track/another-track/789012",
        match_score=85.0,
        title_sim=80.0,
        artist_sim=90.0,
        confidence="medium",
        candidates=[
            {
                'candidate_title': 'Another Track (Original Mix)',
                'candidate_artists': 'Another Artist',
                'candidate_url': 'https://www.beatport.com/track/another-track/789012',
                'final_score': '85.0',
                'title_sim': '80.0',
                'artist_sim': '90.0',
                'candidate_key_camelot': '5A',
                'candidate_bpm': '130',
                'candidate_year': '2023',
                'candidate_label': 'Test Label 2'
            },
            {
                'candidate_title': 'Another Track',
                'candidate_artists': 'Another Artist',
                'candidate_url': 'https://www.beatport.com/track/another-track-alt/789013',
                'final_score': '75.0',
                'title_sim': '75.0',
                'artist_sim': '85.0',
                'candidate_key_camelot': '5B',
                'candidate_bpm': '132',
                'candidate_year': '2022',
                'candidate_label': 'Test Label 2'
            }
        ]
    ))
    
    # Add a low confidence track
    results.append(TrackResult(
        playlist_index=4,
        title="Low Confidence Track",
        artist="Test Artist",
        matched=True,
        beatport_title="Low Confidence Track (Remix)",
        beatport_artists="Test Artist & Friends",
        beatport_key="12A",
        beatport_key_camelot="12A",
        beatport_bpm="125",
        beatport_year="2022",
        beatport_url="https://www.beatport.com/track/low-confidence/345678",
        match_score=72.0,
        title_sim=70.0,
        artist_sim=74.0,
        confidence="low"
    ))
    
    return results


def test_results_view(qapp):
    """Test ResultsView widget"""
    app = qapp
    
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
    
    # For pytest, just verify the widget was created
    if __name__ == "__main__":
        sys.exit(app.exec())
    # In pytest mode, just verify creation
    assert results_view is not None


if __name__ == "__main__":
    test_results_view()

