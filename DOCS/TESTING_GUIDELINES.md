# Testing Guidelines

## Overview

This document outlines the testing strategy, conventions, and best practices for the CuePoint project.

## Test Structure

```
src/tests/
├── unit/              # Unit tests for individual modules
│   ├── core/          # Core logic tests
│   ├── data/          # Data access tests
│   ├── services/      # Service layer tests
│   └── utils/         # Utility tests
├── integration/       # Integration tests
│   ├── test_di_integration.py
│   ├── test_service_integration.py
│   └── test_step52_full_integration.py
├── ui/                # UI tests (pytest-qt)
│   ├── test_main_window.py
│   ├── test_results_view.py
│   └── test_dialogs.py
├── performance/       # Performance tests
│   └── test_processing_performance.py
└── conftest.py        # Shared fixtures
```

## Running Tests

### Basic Commands

```bash
# Run all tests
pytest

# Run with coverage
pytest --cov=cuepoint --cov-report=html

# Run specific test file
pytest tests/unit/services/test_processor_service.py

# Run specific test class
pytest tests/unit/services/test_processor_service.py::TestProcessorService

# Run specific test method
pytest tests/unit/services/test_processor_service.py::TestProcessorService::test_process_track

# Run tests by marker
pytest -m unit
pytest -m integration
pytest -m ui
pytest -m performance
```

### Coverage Requirements

- **Minimum Coverage**: 80% overall
- **Critical Modules**: 90%+ (services, core logic)
- **UI Components**: 70%+ (focus on business logic, not rendering)

### Viewing Coverage Reports

```bash
# Terminal report
pytest --cov=cuepoint --cov-report=term-missing

# HTML report (opens in browser)
pytest --cov=cuepoint --cov-report=html
# Then open: htmlcov/index.html

# XML report (for CI/CD)
pytest --cov=cuepoint --cov-report=xml
```

## Test Categories

### Unit Tests (`@pytest.mark.unit`)

**Purpose**: Test individual functions and classes in isolation.

**Guidelines**:
- Mock all external dependencies (services, I/O, network)
- Test one thing at a time
- Fast execution (< 1 second per test)
- No side effects between tests

**Example**:
```python
@pytest.mark.unit
class TestProcessorService:
    def test_process_track_success(self, mock_beatport_service, mock_cache_service):
        """Test successful track processing."""
        service = ProcessorService(mock_beatport_service, mock_cache_service)
        result = service.process_track(sample_track)
        assert result.matched is True
```

### Integration Tests (`@pytest.mark.integration`)

**Purpose**: Test interactions between multiple components.

**Guidelines**:
- Use real DI container
- May use real services (with caution)
- Test complete workflows
- Can be slower than unit tests

**Example**:
```python
@pytest.mark.integration
class TestServiceIntegration:
    def test_processor_with_beatport_service(self, di_container):
        """Test processor service with real Beatport service."""
        processor = di_container.resolve(IProcessorService)
        result = processor.process_track(sample_track)
        assert result is not None
```

### UI Tests (`@pytest.mark.ui`)

**Purpose**: Test GUI components and user interactions.

**Guidelines**:
- Use `pytest-qt` for Qt testing
- Test business logic, not rendering
- Use `qtbot` for interactions
- Mock external services

**Example**:
```python
@pytest.mark.ui
def test_results_view_filtering(qapp, qtbot):
    """Test results view filtering."""
    view = ResultsView()
    view.set_results(sample_results)
    qtbot.keyClicks(view.search_input, "test")
    assert len(view.filtered_results) > 0
```

### Performance Tests (`@pytest.mark.performance`)

**Purpose**: Ensure performance requirements are met.

**Guidelines**:
- Mark as `@pytest.mark.slow`
- Set performance benchmarks
- Test with realistic data sizes
- Can be skipped in regular test runs

**Example**:
```python
@pytest.mark.performance
@pytest.mark.slow
def test_process_large_playlist_performance():
    """Test processing 1000 tracks completes in < 5 minutes."""
    tracks = [create_track(i) for i in range(1000)]
    start = time.time()
    results = process_playlist(tracks)
    elapsed = time.time() - start
    assert elapsed < 300  # 5 minutes
```

## Test Fixtures

### Common Fixtures (in `conftest.py`)

- `di_container`: Fresh DI container for each test
- `mock_beatport_service`: Mock Beatport service
- `mock_cache_service`: Mock cache service
- `mock_logging_service`: Mock logging service
- `sample_track`: Sample RBTrack object
- `sample_beatport_candidate`: Sample BeatportCandidate
- `sample_track_result`: Sample TrackResult
- `qapp`: QApplication for UI tests

### Using Fixtures

```python
def test_example(mock_beatport_service, sample_track):
    """Test using fixtures."""
    service = ProcessorService(mock_beatport_service, ...)
    result = service.process_track(sample_track)
    assert result is not None
```

## Test Naming Conventions

### Files
- `test_<module_name>.py` for unit tests
- `test_<feature>_integration.py` for integration tests
- `test_<component>_ui.py` for UI tests

### Classes
- `Test<ClassName>` for testing a specific class
- `Test<FeatureName>` for testing a feature

### Methods
- `test_<method_name>_<scenario>` for specific scenarios
- Examples:
  - `test_process_track_success`
  - `test_process_track_cache_hit`
  - `test_process_track_network_error`

## Best Practices

### 1. Arrange-Act-Assert Pattern

```python
def test_example():
    # Arrange
    service = ProcessorService(...)
    track = RBTrack(...)
    
    # Act
    result = service.process_track(track)
    
    # Assert
    assert result.matched is True
    assert result.score > 0.8
```

### 2. Descriptive Test Names

✅ Good:
```python
def test_process_track_returns_high_score_for_exact_match():
    """Test that exact title/artist matches get high scores."""
```

❌ Bad:
```python
def test_process():
    """Test processing."""
```

### 3. One Assertion Per Test (When Possible)

✅ Good:
```python
def test_process_track_sets_matched_flag():
    """Test that matched flag is set correctly."""
    result = service.process_track(track)
    assert result.matched is True
```

❌ Bad:
```python
def test_process_track_everything():
    """Test everything about processing."""
    result = service.process_track(track)
    assert result.matched is True
    assert result.score > 0.8
    assert result.url is not None
    # ... many more assertions
```

### 4. Use Parametrized Tests for Multiple Scenarios

```python
@pytest.mark.parametrize("input,expected", [
    ("Test Track", True),
    ("", False),
    (None, False),
])
def test_validate_title(input, expected):
    """Test title validation."""
    assert validate_title(input) == expected
```

### 5. Mock External Dependencies

```python
@patch('cuepoint.services.beatport_service.requests.get')
def test_fetch_track_data(mock_get):
    """Test fetching track data."""
    mock_get.return_value.json.return_value = {"title": "Test"}
    result = service.fetch_track_data(url)
    assert result["title"] == "Test"
```

### 6. Test Error Handling

```python
def test_process_track_handles_network_error(mock_beatport_service):
    """Test that network errors are handled gracefully."""
    mock_beatport_service.search_tracks.side_effect = ConnectionError()
    result = service.process_track(track)
    assert result.matched is False
    assert result.error is not None
```

### 7. Clean Up Resources

```python
def test_file_operations(tmp_path):
    """Test file operations with temporary directory."""
    test_file = tmp_path / "test.txt"
    test_file.write_text("test")
    # tmp_path is automatically cleaned up
```

## Continuous Integration

### Pre-commit Checks

Before committing, ensure:
1. All tests pass: `pytest`
2. Coverage meets threshold: `pytest --cov=cuepoint --cov-fail-under=80`
3. Code quality checks pass: `black .`, `isort .`, `pylint`

### CI/CD Pipeline

The CI/CD pipeline should:
1. Run all tests
2. Generate coverage report
3. Fail if coverage < 80%
4. Upload coverage to code coverage service

## Debugging Tests

### Running Tests in Debug Mode

```bash
# Run with verbose output
pytest -v

# Run with print statements visible
pytest -s

# Run with pdb debugger on failure
pytest --pdb

# Run with pdb on all tests
pytest --trace
```

### Common Issues

1. **Import Errors**: Ensure `src` is in Python path (handled by `conftest.py`)
2. **Fixture Not Found**: Check fixture is defined in `conftest.py` or test file
3. **Qt Application Errors**: Ensure `qapp` fixture is used for UI tests
4. **Mock Not Working**: Check import path matches actual import

## Test Maintenance

### When to Update Tests

- When adding new features
- When fixing bugs (add regression test)
- When refactoring code
- When changing interfaces

### Test Review Checklist

- [ ] Tests cover happy path
- [ ] Tests cover error cases
- [ ] Tests cover edge cases
- [ ] Tests are fast (< 1s each)
- [ ] Tests are independent (no shared state)
- [ ] Tests have clear names
- [ ] Tests have docstrings
- [ ] Coverage is maintained (> 80%)

## Resources

- [Pytest Documentation](https://docs.pytest.org/)
- [pytest-qt Documentation](https://pytest-qt.readthedocs.io/)
- [Coverage.py Documentation](https://coverage.readthedocs.io/)
- [Python Testing Best Practices](https://docs.python-guide.org/writing/tests/)

