#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Comprehensive unit tests for advanced filtering features.

Tests all filter types, combinations, edge cases, and performance.
"""

import unittest
from unittest.mock import Mock
from PySide6.QtWidgets import QApplication
from PySide6.QtTest import QTest
from PySide6.QtCore import Qt
import sys
import time

if not QApplication.instance():
    app = QApplication(sys.argv)

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../../..'))
from cuepoint.ui.widgets.results_view import ResultsView
from cuepoint.ui.widgets.history_view import HistoryView
from cuepoint.models.result import TrackResult


class MockTrackResult:
    """Mock TrackResult for testing"""
    def __init__(self, **kwargs):
        for key, value in kwargs.items():
            setattr(self, key, value)


class TestAdvancedFiltering(unittest.TestCase):
    """Comprehensive tests for advanced filtering functionality"""
    
    def setUp(self):
        """Set up test fixtures"""
        self.view = ResultsView()
        
        # Create comprehensive test data
        test_results = [
            MockTrackResult(
                playlist_index=1,
                title="Track 2020",
                artist="Artist A",
                matched=True,
                beatport_title="Track 2020",
                beatport_artists="Artist A",
                match_score=95.0,
                confidence="high",
                beatport_key="C Major",
                beatport_key_camelot=None,
                beatport_bpm="128",
                beatport_year="2020"
            ),
            MockTrackResult(
                playlist_index=2,
                title="Track 2023",
                artist="Artist B",
                matched=True,
                beatport_title="Track 2023",
                beatport_artists="Artist B",
                match_score=88.0,
                confidence="medium",
                beatport_key="A Minor",
                beatport_key_camelot=None,
                beatport_bpm="130",
                beatport_year="2023"
            ),
            MockTrackResult(
                playlist_index=3,
                title="Track 2015",
                artist="Artist C",
                matched=True,
                beatport_title="Track 2015",
                beatport_artists="Artist C",
                match_score=92.0,
                confidence="high",
                beatport_key="G Major",
                beatport_key_camelot=None,
                beatport_bpm="125",
                beatport_year="2015"
            ),
            MockTrackResult(
                playlist_index=4,
                title="Unmatched Track",
                artist="Artist D",
                matched=False,
                beatport_title=None,
                beatport_artists=None,
                match_score=None,
                confidence=None,
                beatport_key=None,
                beatport_key_camelot=None,
                beatport_bpm=None,
                beatport_year=None
            ),
        ]
        # Use set_results to properly initialize the controller
        self.view.set_results(test_results, "Test Playlist")
    
    def tearDown(self):
        """Clean up test fixtures"""
        self.view.close()
    
    def test_year_range_filter_min_only(self):
        """Test year range filter with minimum year only"""
        self.view.year_min.setValue(2020)
        self.view.year_max.setValue(2100)  # Default max
        # apply_filters calls _filter_results which updates filtered_results
        self.view._filter_results()
        
        filtered = self.view.filtered_results
        # Should include tracks from 2020, 2023 (but not 2015, and not unmatched/no year)
        years = [int(r.beatport_year) for r in filtered if r.matched and r.beatport_year]
        self.assertTrue(all(year >= 2020 for year in years))
        self.assertIn(2020, years)
        self.assertIn(2023, years)
        self.assertNotIn(2015, years)
    
    def test_year_range_filter_max_only(self):
        """Test year range filter with maximum year only"""
        self.view.year_min.setValue(1900)  # Default min
        self.view.year_max.setValue(2020)
        self.view._filter_results()
        
        filtered = self.view.filtered_results
        years = [int(r.beatport_year) for r in filtered if r.matched and r.beatport_year]
        self.assertTrue(all(year <= 2020 for year in years))
        self.assertIn(2020, years)
        self.assertIn(2015, years)
        self.assertNotIn(2023, years)
    
    def test_year_range_filter_both(self):
        """Test year range filter with both min and max"""
        self.view.year_min.setValue(2018)
        self.view.year_max.setValue(2022)
        self.view._filter_results()
        
        filtered = self.view.filtered_results
        years = [int(r.beatport_year) for r in filtered if r.matched and r.beatport_year]
        self.assertTrue(all(2018 <= year <= 2022 for year in years))
        self.assertIn(2020, years)
        self.assertNotIn(2015, years)
        self.assertNotIn(2023, years)
    
    def test_bpm_range_filter_min_only(self):
        """Test BPM range filter with minimum BPM only"""
        self.view.bpm_min.setValue(130)
        self.view.bpm_max.setValue(200)  # Default max
        self.view._filter_results()
        
        filtered = self.view.filtered_results
        bpms = [float(r.beatport_bpm) for r in filtered if r.matched and r.beatport_bpm]
        self.assertTrue(all(bpm >= 130 for bpm in bpms))
        self.assertIn(130.0, bpms)
        self.assertNotIn(125.0, bpms)
        self.assertNotIn(128.0, bpms)
    
    def test_bpm_range_filter_max_only(self):
        """Test BPM range filter with maximum BPM only"""
        self.view.bpm_min.setValue(60)  # Default min
        self.view.bpm_max.setValue(130)
        self.view._filter_results()
        
        filtered = self.view.filtered_results
        bpms = [float(r.beatport_bpm) for r in filtered if r.matched and r.beatport_bpm]
        self.assertTrue(all(bpm <= 130 for bpm in bpms))
        self.assertIn(125.0, bpms)
        self.assertIn(128.0, bpms)
        self.assertIn(130.0, bpms)
    
    def test_key_filter_specific_key(self):
        """Test key filter with specific key"""
        self.view.key_filter.setCurrentText("C Major")
        self.view._filter_results()
        
        filtered = self.view.filtered_results
        keys = [r.beatport_key for r in filtered if r.matched and r.beatport_key]
        self.assertTrue(all(key == "C Major" for key in keys))
        self.assertEqual(len(keys), 1)
    
    def test_filter_combinations_year_and_bpm(self):
        """Test combining year and BPM filters"""
        self.view.year_min.setValue(2020)
        self.view.year_max.setValue(2023)
        self.view.bpm_min.setValue(128)
        self.view.bpm_max.setValue(135)
        self.view._filter_results()
        
        filtered = self.view.filtered_results
        for result in filtered:
            if result.matched and result.beatport_year and result.beatport_bpm:
                self.assertGreaterEqual(int(result.beatport_year), 2020)
                self.assertLessEqual(int(result.beatport_year), 2023)
                self.assertGreaterEqual(float(result.beatport_bpm), 128)
                self.assertLessEqual(float(result.beatport_bpm), 135)
    
    def test_clear_filters(self):
        """Test clear filters functionality"""
        # Set some filters
        self.view.year_min.setValue(2020)
        self.view.bpm_min.setValue(130)
        self.view.key_filter.setCurrentText("C Major")
        self.view.search_box.setText("test")
        
        # Clear filters
        self.view.clear_filters()
        
        # Verify all filters reset
        self.assertEqual(self.view.year_min.value(), 1900)
        self.assertEqual(self.view.year_max.value(), 2100)
        self.assertEqual(self.view.bpm_min.value(), 60)
        self.assertEqual(self.view.bpm_max.value(), 200)
        self.assertEqual(self.view.key_filter.currentText(), "All")
        self.assertEqual(self.view.search_box.text(), "")
        self.assertEqual(self.view.confidence_filter.currentText(), "All")
        
        # clear_filters() calls _filter_results() internally, so filtered_results should be updated
        # Verify all results shown
        self.assertEqual(len(self.view.filtered_results), len(self.view.results))


class TestHistoryViewFiltering(unittest.TestCase):
    """Comprehensive tests for advanced filtering in HistoryView (Past Searches tab)"""
    
    def setUp(self):
        """Set up test fixtures"""
        self.view = HistoryView()
        
        # Create comprehensive test data as CSV rows (dictionaries)
        self.view.csv_rows = [
            {
                'playlist_index': '1',
                'original_title': 'Track 2020',
                'original_artists': 'Artist A',
                'beatport_title': 'Track 2020',
                'beatport_artists': 'Artist A',
                'beatport_url': 'https://beatport.com/track/1',
                'match_score': '95.0',
                'confidence': 'high',
                'beatport_key': 'C Major',
                'beatport_bpm': '128',
                'beatport_year': '2020'
            },
            {
                'playlist_index': '2',
                'original_title': 'Track 2023',
                'original_artists': 'Artist B',
                'beatport_title': 'Track 2023',
                'beatport_artists': 'Artist B',
                'beatport_url': 'https://beatport.com/track/2',
                'match_score': '88.0',
                'confidence': 'medium',
                'beatport_key': 'A Minor',
                'beatport_bpm': '130',
                'beatport_year': '2023'
            },
            {
                'playlist_index': '3',
                'original_title': 'Track 2015',
                'original_artists': 'Artist C',
                'beatport_title': 'Track 2015',
                'beatport_artists': 'Artist C',
                'beatport_url': 'https://beatport.com/track/3',
                'match_score': '92.0',
                'confidence': 'high',
                'beatport_key': 'G Major',
                'beatport_bpm': '125',
                'beatport_year': '2015'
            },
            {
                'playlist_index': '4',
                'original_title': 'Unmatched Track',
                'original_artists': 'Artist D',
                'beatport_title': '',
                'beatport_artists': '',
                'beatport_url': '',
                'match_score': '0.0',
                'confidence': '',
                'beatport_key': '',
                'beatport_bpm': '',
                'beatport_year': ''
            },
        ]
        self.view.filtered_rows = self.view.csv_rows.copy()
    
    def tearDown(self):
        """Clean up test fixtures"""
        self.view.close()
    
    def test_year_range_filter_min_only(self):
        """Test year range filter with minimum year only in HistoryView"""
        self.view.year_min.setValue(2020)
        self.view.year_max.setValue(2100)  # Default max
        self.view.apply_filters()
        
        filtered = self.view.filtered_rows
        # Should include tracks from 2020, 2023 (but not 2015, and not unmatched/no year)
        years = [int(r['beatport_year']) for r in filtered if r.get('beatport_year', '').strip()]
        self.assertTrue(all(year >= 2020 for year in years))
        self.assertIn(2020, years)
        self.assertIn(2023, years)
        self.assertNotIn(2015, years)
    
    def test_year_range_filter_max_only(self):
        """Test year range filter with maximum year only in HistoryView"""
        self.view.year_min.setValue(1900)  # Default min
        self.view.year_max.setValue(2020)
        self.view.apply_filters()
        
        filtered = self.view.filtered_rows
        years = [int(r['beatport_year']) for r in filtered if r.get('beatport_year', '').strip()]
        self.assertTrue(all(year <= 2020 for year in years))
        self.assertIn(2020, years)
        self.assertIn(2015, years)
        self.assertNotIn(2023, years)
    
    def test_year_range_filter_both(self):
        """Test year range filter with both min and max in HistoryView"""
        self.view.year_min.setValue(2018)
        self.view.year_max.setValue(2022)
        self.view.apply_filters()
        
        filtered = self.view.filtered_rows
        years = [int(r['beatport_year']) for r in filtered if r.get('beatport_year', '').strip()]
        self.assertTrue(all(2018 <= year <= 2022 for year in years))
        self.assertIn(2020, years)
        self.assertNotIn(2015, years)
        self.assertNotIn(2023, years)
    
    def test_bpm_range_filter_min_only(self):
        """Test BPM range filter with minimum BPM only in HistoryView"""
        self.view.bpm_min.setValue(130)
        self.view.bpm_max.setValue(200)  # Default max
        self.view.apply_filters()
        
        filtered = self.view.filtered_rows
        bpms = [float(r['beatport_bpm']) for r in filtered if r.get('beatport_bpm', '').strip()]
        self.assertTrue(all(bpm >= 130 for bpm in bpms))
        self.assertIn(130.0, bpms)
        self.assertNotIn(125.0, bpms)
        self.assertNotIn(128.0, bpms)
    
    def test_bpm_range_filter_max_only(self):
        """Test BPM range filter with maximum BPM only in HistoryView"""
        self.view.bpm_min.setValue(60)  # Default min
        self.view.bpm_max.setValue(130)
        self.view.apply_filters()
        
        filtered = self.view.filtered_rows
        bpms = [float(r['beatport_bpm']) for r in filtered if r.get('beatport_bpm', '').strip()]
        self.assertTrue(all(bpm <= 130 for bpm in bpms))
        self.assertIn(125.0, bpms)
        self.assertIn(128.0, bpms)
        self.assertIn(130.0, bpms)
    
    def test_key_filter_specific_key(self):
        """Test key filter with specific key in HistoryView"""
        self.view.key_filter.setCurrentText("C Major")
        self.view.apply_filters()
        
        filtered = self.view.filtered_rows
        keys = [r['beatport_key'] for r in filtered if r.get('beatport_key', '').strip()]
        self.assertTrue(all(key == "C Major" for key in keys))
        self.assertEqual(len(keys), 1)
    
    def test_filter_combinations_year_and_bpm(self):
        """Test combining year and BPM filters in HistoryView"""
        self.view.year_min.setValue(2020)
        self.view.year_max.setValue(2023)
        self.view.bpm_min.setValue(128)
        self.view.bpm_max.setValue(135)
        self.view.apply_filters()
        
        filtered = self.view.filtered_rows
        for row in filtered:
            if row.get('beatport_year', '').strip() and row.get('beatport_bpm', '').strip():
                self.assertGreaterEqual(int(row['beatport_year']), 2020)
                self.assertLessEqual(int(row['beatport_year']), 2023)
                self.assertGreaterEqual(float(row['beatport_bpm']), 128)
                self.assertLessEqual(float(row['beatport_bpm']), 135)
    
    def test_search_filter(self):
        """Test search filter in HistoryView"""
        self.view.search_box.setText("2020")
        self.view.apply_filters()
        
        filtered = self.view.filtered_rows
        # Should only show tracks with "2020" in title, artist, or beatport fields
        for row in filtered:
            search_text = "2020"
            matches = (
                search_text in (row.get('original_title', '') or '').lower() or
                search_text in (row.get('original_artists', '') or '').lower() or
                search_text in (row.get('beatport_title', '') or '').lower() or
                search_text in (row.get('beatport_artists', '') or '').lower()
            )
            self.assertTrue(matches)
    
    def test_confidence_filter(self):
        """Test confidence filter in HistoryView"""
        self.view.confidence_filter.setCurrentText("High")
        self.view.apply_filters()
        
        filtered = self.view.filtered_rows
        # Should only show high confidence matches
        for row in filtered:
            if row.get('confidence', '').strip():
                self.assertEqual(row['confidence'].lower(), 'high')
    
    def test_clear_filters(self):
        """Test clear filters functionality in HistoryView"""
        # Set some filters
        self.view.year_min.setValue(2020)
        self.view.bpm_min.setValue(130)
        self.view.key_filter.setCurrentText("C Major")
        self.view.search_box.setText("test")
        
        # Clear filters
        self.view.clear_filters()
        
        # Verify all filters reset
        self.assertEqual(self.view.year_min.value(), 1900)
        self.assertEqual(self.view.year_max.value(), 2100)
        self.assertEqual(self.view.bpm_min.value(), 60)
        self.assertEqual(self.view.bpm_max.value(), 200)
        self.assertEqual(self.view.key_filter.currentText(), "All")
        self.assertEqual(self.view.search_box.text(), "")
        self.assertEqual(self.view.confidence_filter.currentText(), "All")
        
        # Verify all results shown
        self.assertEqual(len(self.view.filtered_rows), len(self.view.csv_rows))
    
    def test_filter_with_empty_data(self):
        """Test filtering handles empty/missing data gracefully"""
        # Add row with missing year and BPM
        self.view.csv_rows.append({
            'playlist_index': '5',
            'original_title': 'Track No Data',
            'original_artists': 'Artist E',
            'beatport_title': 'Track No Data',
            'beatport_artists': 'Artist E',
            'beatport_url': 'https://beatport.com/track/5',
            'match_score': '90.0',
            'confidence': 'high',
            'beatport_key': '',
            'beatport_bpm': '',
            'beatport_year': ''
        })
        
        # Filter by year - should exclude row with no year
        self.view.year_min.setValue(2020)
        self.view.apply_filters()
        
        filtered = self.view.filtered_rows
        # Should not include the row with no year data
        years = [r.get('beatport_year', '').strip() for r in filtered]
        self.assertNotIn('', years)  # No empty years in filtered results


if __name__ == '__main__':
    unittest.main()

