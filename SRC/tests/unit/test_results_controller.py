#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Unit tests for ResultsController
"""

import pytest
from cuepoint.ui.controllers.results_controller import ResultsController
from cuepoint.models.result import TrackResult


@pytest.fixture
def sample_results():
    """Create sample TrackResult objects for testing"""
    return [
        TrackResult(
            playlist_index=1,
            title="Test Track 1",
            artist="Artist A",
            matched=True,
            beatport_title="Test Track 1",
            beatport_artists="Artist A",
            beatport_year="2020",
            beatport_bpm="128",
            beatport_key="C Major",
            match_score=95.0,
            confidence="high"
        ),
        TrackResult(
            playlist_index=2,
            title="Test Track 2",
            artist="Artist B",
            matched=True,
            beatport_title="Test Track 2",
            beatport_artists="Artist B",
            beatport_year="2021",
            beatport_bpm="130",
            beatport_key="D Major",
            match_score=80.0,
            confidence="medium"
        ),
        TrackResult(
            playlist_index=3,
            title="Test Track 3",
            artist="Artist C",
            matched=False
        ),
    ]


@pytest.fixture
def controller():
    """Create a ResultsController instance"""
    return ResultsController()


def test_set_results(controller, sample_results):
    """Test setting results"""
    controller.set_results(sample_results)
    assert len(controller.all_results) == 3
    assert len(controller.filtered_results) == 3
    assert controller.all_results == sample_results


def test_apply_filters_search(controller, sample_results):
    """Test search filter"""
    controller.set_results(sample_results)
    filtered = controller.apply_filters(search_text="Track 1")
    assert len(filtered) == 1
    assert filtered[0].title == "Test Track 1"


def test_apply_filters_confidence(controller, sample_results):
    """Test confidence filter"""
    controller.set_results(sample_results)
    filtered = controller.apply_filters(confidence="high")
    assert len(filtered) == 1
    assert filtered[0].confidence == "high"


def test_apply_filters_year(controller, sample_results):
    """Test year filter"""
    controller.set_results(sample_results)
    filtered = controller.apply_filters(year_min=2021, year_max=2021)
    assert len(filtered) == 1
    assert filtered[0].beatport_year == "2021"


def test_apply_filters_bpm(controller, sample_results):
    """Test BPM filter"""
    controller.set_results(sample_results)
    filtered = controller.apply_filters(bpm_min=129, bpm_max=131)
    assert len(filtered) == 1
    assert filtered[0].beatport_bpm == "130"


def test_apply_filters_key(controller, sample_results):
    """Test key filter"""
    controller.set_results(sample_results)
    filtered = controller.apply_filters(key="C Major")
    assert len(filtered) == 1
    assert filtered[0].beatport_key == "C Major"


def test_clear_filters(controller, sample_results):
    """Test clearing filters"""
    controller.set_results(sample_results)
    controller.apply_filters(search_text="Track 1")
    assert len(controller.filtered_results) == 1
    
    controller.clear_filters()
    assert len(controller.filtered_results) == 3


def test_sort_results(controller, sample_results):
    """Test sorting results"""
    controller.set_results(sample_results)
    controller.apply_filters()  # No filters, all results
    
    sorted_results = controller.sort_results("title", ascending=True)
    assert sorted_results[0].title == "Test Track 1"
    assert sorted_results[1].title == "Test Track 2"
    assert sorted_results[2].title == "Test Track 3"
    
    sorted_results = controller.sort_results("title", ascending=False)
    assert sorted_results[0].title == "Test Track 3"


def test_get_summary_statistics(controller, sample_results):
    """Test summary statistics calculation"""
    controller.set_results(sample_results)
    stats = controller.get_summary_statistics()
    
    assert stats["total"] == 3
    assert stats["matched"] == 2
    assert stats["unmatched"] == 1
    assert stats["match_rate"] == pytest.approx(66.67, abs=0.1)
    assert stats["confidence_breakdown"]["high"] == 1
    assert stats["confidence_breakdown"]["medium"] == 1
    assert stats["confidence_breakdown"]["low"] == 0


def test_get_batch_summary_statistics(controller, sample_results):
    """Test batch summary statistics"""
    batch_results = {
        "Playlist 1": sample_results[:2],
        "Playlist 2": sample_results[2:]
    }
    
    stats = controller.get_batch_summary_statistics(batch_results)
    
    assert stats["playlist_count"] == 2
    assert stats["total"] == 3
    assert stats["matched"] == 2


def test_year_in_range(controller, sample_results):
    """Test year range checking"""
    result = sample_results[0]  # Year 2020
    assert controller._year_in_range(result, 2019, 2021) is True
    assert controller._year_in_range(result, 2021, 2022) is False
    assert controller._year_in_range(result, None, 2019) is False


def test_bpm_in_range(controller, sample_results):
    """Test BPM range checking"""
    result = sample_results[0]  # BPM 128
    assert controller._bpm_in_range(result, 127, 129) is True
    assert controller._bpm_in_range(result, 130, 140) is False
    assert controller._bpm_in_range(result, None, 127) is False





