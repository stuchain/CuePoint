# Step 6.4: Implement Comprehensive Testing

**Status**: 📝 Planned  
**Priority**: 🚀 P1 - HIGH PRIORITY  
**Estimated Duration**: 5-7 days  
**Dependencies**: Step 6.1 (Project Structure), Step 6.2 (Dependency Injection), Step 6.3 (Separate Business Logic)

---

## Goal

Create a comprehensive test suite with >80% code coverage using pytest and related testing tools. Tests should cover unit tests, integration tests, UI tests, and performance tests.

---

## Success Criteria

- [ ] Test framework (pytest) set up
- [ ] Test structure organized (unit, integration, UI)
- [ ] >80% code coverage achieved
- [ ] Unit tests for all core modules
- [ ] Unit tests for all services
- [ ] Integration tests for service interactions
- [ ] UI tests for user interactions
- [ ] Test fixtures and mocks created
- [ ] Coverage reporting configured
- [ ] Tests run in CI/CD pipeline
- [ ] Testing guidelines documented

---

## Testing Strategy

### Test Pyramid

```
        /\
       /  \      E2E Tests (few)
      /____\
     /      \    Integration Tests (some)
    /________\
   /          \  Unit Tests (many)
  /____________\
```

### Test Categories

1. **Unit Tests** (70% of tests)
   - Test individual functions/classes in isolation
   - Mock external dependencies
   - Fast execution
   - High coverage

2. **Integration Tests** (20% of tests)
   - Test component interactions
   - Test service integrations
   - Test data flow
   - Moderate execution time

3. **UI Tests** (5% of tests)
   - Test user interactions
   - Test widget behavior
   - Test dialog workflows
   - Slower execution

4. **Performance Tests** (5% of tests)
   - Benchmark critical operations
   - Test with large datasets
   - Monitor memory usage

---

## Test Structure

```
src/tests/
├── __init__.py
├── conftest.py              # Pytest configuration and fixtures
├── unit/                    # Unit tests
│   ├── __init__.py
│   ├── core/
│   │   ├── test_matcher.py
│   │   ├── test_parser.py
│   │   ├── test_query_generator.py
│   │   └── test_text_processing.py
│   ├── services/
│   │   ├── test_processor_service.py
│   │   ├── test_beatport_service.py
│   │   ├── test_cache_service.py
│   │   └── test_export_service.py
│   ├── data/
│   │   ├── test_beatport.py
│   │   └── test_cache.py
│   └── utils/
│       ├── test_validators.py
│       └── test_errors.py
├── integration/            # Integration tests
│   ├── __init__.py
│   ├── test_processor_integration.py
│   ├── test_export_integration.py
│   └── test_service_integration.py
├── ui/                      # UI tests
│   ├── __init__.py
│   ├── test_main_window.py
│   ├── test_results_view.py
│   └── test_dialogs.py
├── performance/             # Performance tests
│   ├── __init__.py
│   ├── test_processing_performance.py
│   └── test_cache_performance.py
└── fixtures/                # Test fixtures
    ├── __init__.py
    ├── sample_playlists/
    │   ├── simple_playlist.xml
    │   └── complex_playlist.xml
    └── sample_data/
        ├── beatport_response.json
        └── track_data.json
```

---

## Setup and Configuration

### Dependencies

**requirements-dev.txt:**
```
pytest>=7.0.0
pytest-qt>=4.0.0
pytest-cov>=4.0.0
pytest-mock>=3.10.0
pytest-asyncio>=0.21.0
pytest-timeout>=2.1.0
coverage>=7.0.0
pytest-xdist>=3.0.0  # For parallel test execution
```

### Pytest Configuration

**pytest.ini:**
```ini
[pytest]
testpaths = src/tests
python_files = test_*.py
python_classes = Test*
python_functions = test_*
addopts = 
    -v
    --strict-markers
    --cov=cuepoint
    --cov-report=html
    --cov-report=term-missing
    --cov-report=xml
    --cov-fail-under=80
markers =
    unit: Unit tests
    integration: Integration tests
    ui: UI tests
    performance: Performance tests
    slow: Slow running tests
```

### Test Configuration File

**src/tests/conftest.py:**
```python
"""Pytest configuration and shared fixtures."""

import pytest
from unittest.mock import Mock, MagicMock
from typing import Generator
from cuepoint.utils.di_container import DIContainer, reset_container
from cuepoint.services.interfaces import (
    IProcessorService, IBeatportService, ICacheService,
    IExportService, IConfigService, ILoggingService
)

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
def sample_track():
    """Create a sample track for testing."""
    from cuepoint.models.track import Track
    return Track(
        title="Test Track",
        artist="Test Artist",
        album="Test Album",
        duration=180.0
    )

@pytest.fixture
def sample_beatport_data():
    """Create sample Beatport data for testing."""
    return {
        "title": "Test Track",
        "artist": "Test Artist",
        "bpm": 128.0,
        "key": "A Minor",
        "release_date": "2023-01-01"
    }
```

---

## Unit Tests

### Core Module Tests

**src/tests/unit/core/test_matcher.py:**
```python
"""Unit tests for matcher module."""

import pytest
from cuepoint.core.matcher import best_beatport_match, calculate_score
from cuepoint.models.track import Track

class TestMatcher:
    """Test matcher functions."""
    
    def test_calculate_score_exact_match(self):
        """Test score calculation for exact match."""
        track = Track(title="Test", artist="Artist")
        candidate = {"title": "Test", "artist": "Artist"}
        
        score = calculate_score(track, candidate)
        
        assert score > 0.9  # High score for exact match
    
    def test_calculate_score_partial_match(self):
        """Test score calculation for partial match."""
        track = Track(title="Test Track", artist="Test Artist")
        candidate = {"title": "Test", "artist": "Test Artist"}
        
        score = calculate_score(track, candidate)
        
        assert 0.5 < score < 0.9  # Medium score for partial match
    
    def test_best_beatport_match_finds_match(self, sample_track):
        """Test that best match is found."""
        candidates = [
            {"title": "Test Track", "artist": "Test Artist", "score": 0.9},
            {"title": "Other Track", "artist": "Other Artist", "score": 0.3}
        ]
        
        result = best_beatport_match(sample_track, candidates)
        
        assert result is not None
        assert result["title"] == "Test Track"
    
    def test_best_beatport_match_no_candidates(self, sample_track):
        """Test behavior when no candidates."""
        candidates = []
        
        result = best_beatport_match(sample_track, candidates)
        
        assert result is None
```

### Service Tests

**src/tests/unit/services/test_processor_service.py:**
```python
"""Unit tests for processor service."""

import pytest
from unittest.mock import Mock
from cuepoint.services.processor_service import ProcessorService
from cuepoint.models.track import Track
from cuepoint.models.result import TrackResult

class TestProcessorService:
    """Test processor service."""
    
    def test_process_track_success(
        self,
        mock_beatport_service,
        mock_logging_service,
        sample_track
    ):
        """Test successful track processing."""
        # Setup mocks
        mock_beatport_service.search_tracks.return_value = [
            {"title": "Test Track", "artist": "Test Artist"}
        ]
        
        mock_matcher = Mock()
        mock_matcher.find_best_match.return_value = {
            "title": "Test Track",
            "artist": "Test Artist"
        }
        
        # Create service
        service = ProcessorService(
            beatport_service=mock_beatport_service,
            matcher_service=mock_matcher,
            logging_service=mock_logging_service
        )
        
        # Test
        result = service.process_track(sample_track)
        
        # Verify
        assert isinstance(result, TrackResult)
        assert result.track == sample_track
        mock_beatport_service.search_tracks.assert_called_once()
        mock_matcher.find_best_match.assert_called_once()
    
    def test_process_playlist(self, mock_beatport_service, mock_logging_service):
        """Test playlist processing."""
        # Setup
        tracks = [
            Track(title="Track 1", artist="Artist 1"),
            Track(title="Track 2", artist="Artist 2")
        ]
        
        mock_beatport_service.search_tracks.return_value = []
        mock_matcher = Mock()
        mock_matcher.find_best_match.return_value = None
        
        service = ProcessorService(
            beatport_service=mock_beatport_service,
            matcher_service=mock_matcher,
            logging_service=mock_logging_service
        )
        
        # Test
        results = service.process_playlist(tracks)
        
        # Verify
        assert len(results) == 2
        assert mock_beatport_service.search_tracks.call_count == 2
```

---

## Integration Tests

**src/tests/integration/test_processor_integration.py:**
```python
"""Integration tests for processor."""

import pytest
from cuepoint.services.bootstrap import bootstrap_services
from cuepoint.utils.di_container import get_container
from cuepoint.services.interfaces import IProcessorService
from cuepoint.models.track import Track

@pytest.mark.integration
class TestProcessorIntegration:
    """Integration tests for processor service."""
    
    @pytest.fixture(autouse=True)
    def setup_services(self):
        """Set up services for integration tests."""
        bootstrap_services()
        yield
        # Cleanup if needed
    
    def test_process_track_with_real_services(self, sample_track):
        """Test processing with real services (may hit actual API)."""
        container = get_container()
        processor = container.resolve(IProcessorService)
        
        # This may make real API calls - use with caution
        # Consider using test mode or mocking
        result = processor.process_track(sample_track)
        
        assert result is not None
        assert result.track == sample_track
```

---

## UI Tests

**src/tests/ui/test_main_window.py:**
```python
"""UI tests for main window."""

import pytest
from PySide6.QtWidgets import QApplication
from unittest.mock import Mock
from cuepoint.ui.main_window import MainWindow
from cuepoint.ui.controllers.main_controller import MainController

@pytest.fixture(scope="session")
def qapp():
    """Create QApplication for UI tests."""
    app = QApplication.instance()
    if app is None:
        app = QApplication([])
    yield app

@pytest.mark.ui
class TestMainWindow:
    """Test main window UI."""
    
    def test_main_window_creation(self, qapp):
        """Test that main window can be created."""
        mock_controller = Mock(spec=MainController)
        window = MainWindow(mock_controller)
        
        assert window is not None
        assert window.controller == mock_controller
    
    def test_open_file_dialog(self, qapp, qtbot):
        """Test open file dialog."""
        mock_controller = Mock(spec=MainController)
        mock_controller.load_playlist.return_value = []
        
        window = MainWindow(mock_controller)
        window.show()
        
        # Simulate button click
        qtbot.mouseClick(window.open_file_button, qtbot.LeftButton)
        
        # Verify controller was called (if file selected)
        # Note: Actual file dialog interaction is complex
```

---

## Performance Tests

**src/tests/performance/test_processing_performance.py:**
```python
"""Performance tests for processing."""

import pytest
import time
from cuepoint.services.processor_service import ProcessorService
from cuepoint.models.track import Track

@pytest.mark.performance
@pytest.mark.slow
class TestProcessingPerformance:
    """Performance tests for processing."""
    
    def test_process_large_playlist_performance(self):
        """Test processing performance with large playlist."""
        # Create large playlist
        tracks = [
            Track(title=f"Track {i}", artist=f"Artist {i}")
            for i in range(100)
        ]
        
        # Mock services for performance test
        # (or use real services if acceptable)
        
        start_time = time.time()
        # Process tracks
        # ...
        end_time = time.time()
        
        duration = end_time - start_time
        
        # Assert performance requirement
        assert duration < 60.0  # Should complete in under 60 seconds
```

---

## Coverage Configuration

### Coverage Settings

**.coveragerc:**
```ini
[run]
source = src/cuepoint
omit = 
    */tests/*
    */__pycache__/*
    */venv/*
    */env/*

[report]
exclude_lines =
    pragma: no cover
    def __repr__
    raise AssertionError
    raise NotImplementedError
    if __name__ == .__main__.:
    if TYPE_CHECKING:
    @abstractmethod
```

---

## Running Tests

### Basic Commands

```bash
# Run all tests
pytest

# Run with coverage
pytest --cov=cuepoint --cov-report=html

# Run specific test category
pytest -m unit
pytest -m integration
pytest -m ui

# Run specific test file
pytest src/tests/unit/core/test_matcher.py

# Run specific test
pytest src/tests/unit/core/test_matcher.py::TestMatcher::test_calculate_score_exact_match

# Run in parallel
pytest -n auto

# Run with verbose output
pytest -v

# Run only failed tests
pytest --lf
```

---

## Implementation Checklist

- [ ] Install pytest and dependencies
- [ ] Create test directory structure
- [ ] Create `conftest.py` with fixtures
- [ ] Configure `pytest.ini`
- [ ] Configure `.coveragerc`
- [ ] Write unit tests for core modules
- [ ] Write unit tests for services
- [ ] Write unit tests for data layer
- [ ] Write unit tests for utils
- [ ] Write integration tests
- [ ] Write UI tests
- [ ] Write performance tests
- [ ] Create test fixtures
- [ ] Achieve >80% code coverage
- [ ] Set up CI/CD test pipeline
- [ ] Document testing guidelines
- [ ] Review and refactor tests

---

## Testing Guidelines

### Best Practices

1. **Test Naming**: Use descriptive names: `test_function_name_scenario`
2. **Arrange-Act-Assert**: Structure tests clearly
3. **One Assertion Per Test**: Focus each test on one thing
4. **Mock External Dependencies**: Don't hit real APIs in unit tests
5. **Test Edge Cases**: Test boundaries, null values, errors
6. **Keep Tests Fast**: Unit tests should run quickly
7. **Test Independence**: Tests should not depend on each other
8. **Use Fixtures**: Share setup code via fixtures

### What to Test

- **Happy Path**: Normal operation
- **Error Cases**: Invalid input, exceptions
- **Edge Cases**: Boundaries, null values, empty collections
- **Business Logic**: Core algorithms and calculations
- **Service Interactions**: How services work together

### What Not to Test

- **Third-party Code**: Don't test library code
- **Trivial Code**: Simple getters/setters
- **UI Rendering**: Focus on behavior, not appearance
- **Implementation Details**: Test public interfaces

---

## Next Steps

After completing this step:
1. Verify >80% coverage achieved
2. Review test quality
3. Set up CI/CD integration
4. Proceed to Step 6.5: Add Type Hints & Documentation

