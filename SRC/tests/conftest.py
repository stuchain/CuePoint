"""Pytest configuration and shared fixtures."""

import os
import sys

# Add src directory to Python path before any cuepoint imports
# This ensures pytest can find the cuepoint module
_test_dir = os.path.dirname(os.path.abspath(__file__))
_src_dir = os.path.dirname(_test_dir)
if _src_dir not in sys.path:
    sys.path.insert(0, _src_dir)

from typing import Generator
from unittest.mock import MagicMock, Mock

import pytest

from cuepoint.data.rekordbox import RBTrack
from cuepoint.models.beatport_candidate import BeatportCandidate
from cuepoint.models.compat import track_from_rbtrack
from cuepoint.models.result import TrackResult
from cuepoint.models.track import Track
from cuepoint.services.interfaces import (
    IBeatportService,
    ICacheService,
    IConfigService,
    IExportService,
    ILoggingService,
    IMatcherService,
    IProcessorService,
)
from cuepoint.utils.di_container import DIContainer, reset_container


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
def sample_track() -> Track:
    """Create a sample Track for testing."""
    return Track(
        track_id="12345",
        title="Test Track",
        artist="Test Artist"
    )


@pytest.fixture
def sample_track_with_remix() -> Track:
    """Create a sample track with remix in title."""
    return Track(
        track_id="12346",
        title="Test Track (Remixer Remix)",
        artist="Test Artist"
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
        genre="House",  # Note: new model uses "genre" instead of "genres"
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
        candidates=[],  # New model requires candidates field (list of BeatportCandidate)
        candidates_data=[],  # Dict format for backward compatibility
        queries_data=[],  # Dict format for backward compatibility
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
def sample_playlist() -> list[Track]:
    """Create a sample playlist of tracks."""
    return [
        Track(track_id="1", title="Track 1", artist="Artist 1"),
        Track(track_id="2", title="Track 2", artist="Artist 2"),
        Track(track_id="3", title="Track 3", artist="Artist 3"),
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


# ============================================================================
# File System Fixtures (Step 7.1)
# ============================================================================

import tempfile
from pathlib import Path


@pytest.fixture
def temp_dir() -> Generator[Path, None, None]:
    """Create a temporary directory for test files."""
    with tempfile.TemporaryDirectory() as tmpdir:
        yield Path(tmpdir)


@pytest.fixture
def temp_file(temp_dir: Path) -> Generator[Path, None, None]:
    """Create a temporary file path."""
    file_path = temp_dir / "test_file.txt"
    yield file_path
    if file_path.exists():
        file_path.unlink()


# ============================================================================
# XML Fixtures (Step 7.2)
# ============================================================================

@pytest.fixture
def sample_rekordbox_xml(temp_dir: Path) -> Path:
    """Create a sample Rekordbox XML file."""
    xml_content = """<?xml version="1.0" encoding="UTF-8"?>
<DJ_PLAYLISTS Version="1.0.0">
    <PRODUCT Name="rekordbox" Version="6.7.0"/>
    <COLLECTION>
        <TRACK TrackID="1" Name="Test Track 1" Artist="Test Artist 1" BPM="128.0" Key="Am" Genre="House" Year="2024"/>
        <TRACK TrackID="2" Name="Test Track 2" Artist="Test Artist 2" BPM="130.0" Key="C" Genre="Techno" Year="2023"/>
        <TRACK TrackID="3" Name="Test Track 3" Artist="Test Artist 3" BPM="125.0" Key="Dm" Genre="Deep House" Year="2024"/>
    </COLLECTION>
    <PLAYLISTS>
        <NODE Name="ROOT">
            <NODE Name="Test Playlist">
                <TRACK Key="1"/>
                <TRACK Key="2"/>
                <TRACK Key="3"/>
            </NODE>
        </NODE>
    </PLAYLISTS>
</DJ_PLAYLISTS>"""
    
    xml_path = temp_dir / "rekordbox.xml"
    xml_path.write_text(xml_content, encoding="utf-8")
    return xml_path


# ============================================================================
# Network Mocking Fixtures (Step 7.1)
# ============================================================================

@pytest.fixture
def mock_beatport_response():
    """Mock Beatport API response."""
    return {
        "tracks": [
            {
                "title": "Test Track",
                "artist": "Test Artist",
                "label": "Test Label",
                "bpm": 128.0
            }
        ]
    }


@pytest.fixture
def mock_requests_get(mock_beatport_response):
    """Mock requests.get for network tests."""
    from unittest.mock import patch
    with patch('requests.get') as mock_get:
        mock_response = Mock()
        mock_response.json.return_value = mock_beatport_response
        mock_response.status_code = 200
        mock_response.text = "<html>Mock HTML</html>"
        mock_get.return_value = mock_response
        yield mock_get

