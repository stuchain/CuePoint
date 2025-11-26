"""Pytest configuration and shared fixtures."""

import sys
import os

# Add src directory to Python path before any cuepoint imports
# This ensures pytest can find the cuepoint module
_test_dir = os.path.dirname(os.path.abspath(__file__))
_src_dir = os.path.dirname(_test_dir)
if _src_dir not in sys.path:
    sys.path.insert(0, _src_dir)

import pytest
from unittest.mock import Mock, MagicMock
from typing import Generator
from cuepoint.utils.di_container import DIContainer, reset_container
from cuepoint.services.interfaces import (
    IProcessorService, IBeatportService, ICacheService,
    IExportService, IConfigService, ILoggingService, IMatcherService
)
from cuepoint.data.rekordbox import RBTrack
from cuepoint.data.beatport import BeatportCandidate
from cuepoint.ui.gui_interface import TrackResult


@pytest.fixture(scope="function")
def di_container() -> Generator[DIContainer, None, None]:
    """Create a fresh DI container for each test."""
    reset_container()
    from cuepoint.utils.di_container import get_container
    container = get_container()
    yield container
    reset_container()


@pytest.fixture
def mock_beatport_service() -> Mock:
    """Create a mock Beatport service."""
    mock = Mock(spec=IBeatportService)
    mock.search_tracks.return_value = []
    mock.fetch_track_data.return_value = None
    return mock


@pytest.fixture
def mock_cache_service() -> Mock:
    """Create a mock cache service."""
    mock = Mock(spec=ICacheService)
    mock.get.return_value = None
    mock.set.return_value = None
    mock.clear.return_value = None
    return mock


@pytest.fixture
def mock_logging_service() -> Mock:
    """Create a mock logging service."""
    mock = Mock(spec=ILoggingService)
    return mock


@pytest.fixture
def mock_config_service() -> Mock:
    """Create a mock config service."""
    mock = Mock(spec=IConfigService)
    mock.get.return_value = None
    mock.set.return_value = None
    return mock


@pytest.fixture
def mock_matcher_service() -> Mock:
    """Create a mock matcher service."""
    mock = Mock(spec=IMatcherService)
    mock.find_best_match.return_value = (None, [], [], 0)
    return mock


@pytest.fixture
def sample_track() -> RBTrack:
    """Create a sample Rekordbox track for testing."""
    return RBTrack(
        track_id="12345",
        title="Test Track",
        artists="Test Artist"
    )


@pytest.fixture
def sample_track_with_remix() -> RBTrack:
    """Create a sample track with remix in title."""
    return RBTrack(
        track_id="12346",
        title="Test Track (Remixer Remix)",
        artists="Test Artist"
    )


@pytest.fixture
def sample_beatport_candidate() -> BeatportCandidate:
    """Create a sample Beatport candidate for testing."""
    return BeatportCandidate(
        url="https://www.beatport.com/track/test-track/123456",
        title="Test Track",
        artists="Test Artist",
        key="E Major",
        release_year=2023,
        bpm="128",
        label="Test Label",
        genres="House",
        release_name="Test Release",
        release_date="2023-01-01",
        score=95.0,
        title_sim=95,
        artist_sim=100,
        query_index=1,
        query_text="Test Track Test Artist",
        candidate_index=1,
        base_score=90.0,
        bonus_year=2,
        bonus_key=2,
        guard_ok=True,
        reject_reason="",
        elapsed_ms=100,
        is_winner=False
    )


@pytest.fixture
def sample_beatport_data() -> dict:
    """Create sample Beatport data for testing."""
    return {
        "title": "Test Track",
        "artists": "Test Artist",
        "key": "E Major",
        "year": 2023,
        "bpm": "128",
        "label": "Test Label",
        "genres": "House",
        "release_name": "Test Release",
        "release_date": "2023-01-01"
    }


@pytest.fixture
def sample_track_result() -> TrackResult:
    """Create a sample TrackResult for testing."""
    return TrackResult(
        playlist_index=0,
        title="Test Track",
        artist="Test Artist",
        matched=True,
        beatport_url="https://www.beatport.com/track/test-track/123456",
        beatport_title="Test Track",
        beatport_artists="Test Artist",
        beatport_key="E Major",
        beatport_key_camelot="12B",
        beatport_year="2023",
        beatport_bpm="128",
        beatport_label="Test Label",
        beatport_genres="House",
        match_score=95.0,
        title_sim=95.0,
        artist_sim=100.0,
        confidence="high"
    )


@pytest.fixture
def sample_track_result_unmatched() -> TrackResult:
    """Create a sample unmatched TrackResult for testing."""
    return TrackResult(
        playlist_index=0,
        title="Unknown Track",
        artist="Unknown Artist",
        matched=False
    )


@pytest.fixture
def sample_playlist() -> list[RBTrack]:
    """Create a sample playlist of tracks."""
    return [
        RBTrack(track_id="1", title="Track 1", artists="Artist 1"),
        RBTrack(track_id="2", title="Track 2", artists="Artist 2"),
        RBTrack(track_id="3", title="Track 3", artists="Artist 3"),
    ]


@pytest.fixture(scope="session")
def qapp():
    """Create QApplication for UI tests."""
    try:
        from PySide6.QtWidgets import QApplication
        app = QApplication.instance()
        if app is None:
            app = QApplication([])
        yield app
    except ImportError:
        pytest.skip("PySide6 not available for UI tests")

