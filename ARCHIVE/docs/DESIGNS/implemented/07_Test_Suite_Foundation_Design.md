# Design: Test Suite Foundation

**Number**: 7  
**Status**: 📝 Planned  
**Priority**: ⚡ P1 - Medium Effort  
**Effort**: 4-5 days  
**Impact**: High

---

## 1. Overview

### 1.1 Problem Statement

No automated tests exist, making it risky to:
- Refactor code
- Add new features
- Fix bugs
- Ensure code quality

### 1.2 Solution Overview

Establish comprehensive test suite foundation:
1. Unit tests for core functions
2. Integration tests for pipeline
3. Test fixtures (mock data)
4. CI/CD integration
5. Coverage reporting

---

## 2. Test Structure

```
SRC/tests/
├── __init__.py
├── conftest.py              # Pytest configuration and fixtures
├── unit/
│   ├── test_text_processing.py
│   ├── test_matcher.py
│   ├── test_query_generator.py
│   ├── test_mix_parser.py
│   └── test_rekordbox.py
├── integration/
│   ├── test_processor.py
│   └── test_full_pipeline.py
├── fixtures/
│   ├── sample_collection.xml
│   ├── sample_beatport_response.html
│   └── sample_beatport_response.json
└── mocks/
    ├── mock_beatport.py
    └── mock_network.py
```

---

## 3. Testing Tools

### 3.1 Dependencies

- `pytest`: Test framework
- `pytest-cov`: Coverage reporting
- `pytest-mock`: Mocking support
- `pytest-asyncio`: Async test support (if needed)

---

## 4. Unit Tests

### 4.1 text_processing.py Tests

**Test Coverage**:
```python
# test_text_processing.py
import pytest
from SRC.text_processing import (
    normalize_text, sanitize_title_for_search,
    _word_tokens, _strip_accents
)

def test_normalize_text():
    """Test text normalization"""
    assert normalize_text("Never Sleep Again") == "never sleep again"
    assert normalize_text("Café") == "cafe"
    assert normalize_text("Tïtlé") == "title"

def test_sanitize_title_for_search():
    """Test title sanitization"""
    assert sanitize_title_for_search("[8-9] Title") == "Title"
    assert sanitize_title_for_search("(Remix) Title") == "Title"
    
def test_word_tokens():
    """Test word tokenization"""
    assert _word_tokens("Never Sleep Again") == ["never", "sleep", "again"]
    
def test_strip_accents():
    """Test accent removal"""
    assert _strip_accents("Café") == "Cafe"
    assert _strip_accents("naïve") == "naive"
```

**Test Cases**:
- Similarity calculations with RapidFuzz
- Unicode handling
- Edge cases (empty strings, special characters)
- Case-insensitive matching

### 4.2 matcher.py Tests

**Test Coverage**:
```python
# test_matcher.py
import pytest
from SRC.matcher import (
    score_candidate, guard_subset_match,
    guard_title_sim_floor, best_beatport_match
)

def test_scoring_logic():
    """Test candidate scoring"""
    rb = RBTrack(track_id="1", title="Never Sleep", artists="Solomun")
    candidate = BeatportCandidate(...)
    
    score = score_candidate(candidate, rb)
    assert score.final_score >= 0
    assert score.title_sim >= 0 and score.title_sim <= 100

def test_guard_subset_match():
    """Test subset match prevention"""
    # "Sun" should not match "Son of Sun"
    assert guard_subset_match("Sun", "Son of Sun") == False
    assert guard_subset_match("Never Sleep", "Never Sleep Again") == True
    
def test_early_exit_logic():
    """Test early exit conditions"""
    # Should exit early if score >= EARLY_EXIT_SCORE
    # Should require minimum queries before exit
```

**Test Cases**:
- Scoring with various input combinations
- Guard function edge cases
- Early exit logic with different configurations
- Bonus/penalty calculations
- Mix type matching

### 4.3 query_generator.py Tests

**Test Coverage**:
```python
# test_query_generator.py
import pytest
from SRC.query_generator import make_search_queries

def test_query_generation():
    """Test query generation correctness"""
    rb = RBTrack(
        track_id="1",
        title="Never Sleep Again (Keinemusik Remix)",
        artists="Solomun"
    )
    queries = make_search_queries(rb)
    
    assert len(queries) > 0
    assert any("Never Sleep Again" in q for q in queries)
    assert any("Solomun" in q for q in queries)

def test_n_gram_extraction():
    """Test N-gram generation"""
    # Test uni-grams, bi-grams, tri-grams
    # Test with TITLE_GRAM_MAX setting
    
def test_remix_query_handling():
    """Test remix-specific queries"""
    # Test remix query variants
    # Test remixer name extraction
```

**Test Cases**:
- Query generation for various track types
- N-gram extraction limits
- Remix query handling
- Artist extraction from title
- Query ordering and priority

### 4.4 mix_parser.py Tests

**Test Coverage**:
- Remix phrase extraction
- Extended mix detection
- Special variant phrases
- Artist name merging

### 4.5 rekordbox.py Tests

**Test Coverage**:
```python
# test_rekordbox.py
import pytest
from SRC.rekordbox import parse_rekordbox, extract_artists_from_title

def test_xml_parsing():
    """Test XML parsing"""
    tracks, playlists = parse_rekordbox("SRC/tests/fixtures/sample_collection.xml")
    assert len(tracks) > 0
    assert len(playlists) > 0
    
def test_artist_extraction():
    """Test artist extraction from title"""
    result = extract_artists_from_title("Track Name - Artist Name")
    assert result == ("Track Name", "Artist Name")
```

---

## 5. Integration Tests

### 5.1 Full Pipeline Tests

**Test Coverage**:
```python
# test_full_pipeline.py
import pytest
from SRC.processor import run

def test_end_to_end_processing():
    """Test complete processing pipeline"""
    run(
        xml_path="SRC/tests/fixtures/sample_collection.xml",
        playlist_name="Test Playlist",
        out_csv_base="test_output"
    )
    
    # Verify output files created
    assert os.path.exists("output/test_output.csv")
    assert os.path.exists("output/test_output_candidates.csv")
    
def test_csv_output_validation():
    """Validate CSV output structure and data"""
    # Check column names
    # Validate data types
    # Check row counts
    
def test_error_handling():
    """Test error handling paths"""
    # Test with invalid XML
    # Test with non-existent playlist
    # Test with network failures (mocked)
```

### 5.2 Mock Setup

**Location**: `SRC/tests/mocks/mock_beatport.py`

```python
from unittest.mock import Mock, patch

def mock_beatport_search(query: str) -> List[str]:
    """Mock Beatport search responses"""
    # Return predefined track URLs based on query
    responses = {
        "Never Sleep Again Solomun": [
            "https://www.beatport.com/track/never-sleep-again/12345"
        ],
        # ... more mappings ...
    }
    return responses.get(query, [])

@pytest.fixture
def mock_network():
    """Mock network requests"""
    with patch('SRC.beatport_search.SESSION') as mock_session:
        yield mock_session
```

---

## 6. Test Fixtures

### 6.1 Sample XML File

**Location**: `SRC/tests/fixtures/sample_collection.xml`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<DJ_PLAYLISTS>
  <COLLECTION>
    <TRACK TrackID="1" Name="Never Sleep Again" Artist="Solomun"/>
    <TRACK TrackID="2" Name="Planet 9" Artist="Adam Port"/>
    <!-- ... more tracks ... -->
  </COLLECTION>
  <PLAYLISTS>
    <NODE Type="1" Name="Test Playlist">
      <TRACK Key="1"/>
      <TRACK Key="2"/>
    </NODE>
  </PLAYLISTS>
</DJ_PLAYLISTS>
```

### 6.2 Mock Beatport Responses

**HTML Response**: `SRC/tests/fixtures/sample_beatport_response.html`
**JSON Response**: `SRC/tests/fixtures/sample_beatport_response.json`

---

## 7. Pytest Configuration

### 7.1 conftest.py

**Location**: `SRC/tests/conftest.py`

```python
import pytest
import sys
import os

# Add SRC to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'SRC'))

@pytest.fixture
def sample_rb_track():
    """Fixture for sample Rekordbox track"""
    from rekordbox import RBTrack
    return RBTrack(
        track_id="1",
        title="Never Sleep Again (Keinemusik Remix)",
        artists="Solomun"
    )

@pytest.fixture
def sample_beatport_candidate():
    """Fixture for sample Beatport candidate"""
    from beatport import BeatportCandidate
    return BeatportCandidate(...)

@pytest.fixture(autouse=True)
def reset_settings():
    """Reset settings before each test"""
    from config import SETTINGS
    original = SETTINGS.copy()
    yield
    SETTINGS.clear()
    SETTINGS.update(original)
```

### 7.2 pytest.ini

```ini
[pytest]
testpaths = SRC/tests
python_files = test_*.py
python_classes = Test*
python_functions = test_*
addopts = 
    --verbose
    --cov=SRC
    --cov-report=html
    --cov-report=term-missing
    --cov-fail-under=70
```

---

## 8. CI/CD Integration

### 8.1 GitHub Actions

**Location**: `.github/workflows/tests.yml`

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-python@v2
        with:
          python-version: '3.8'
      - name: Install dependencies
        run: |
          pip install -r requirements.txt
          pip install pytest pytest-cov pytest-mock
      - name: Run tests
        run: pytest SRC/tests/ --cov=SRC --cov-report=xml
      - name: Upload coverage
        uses: codecov/codecov-action@v2
```

---

## 9. Coverage Goals

### 9.1 Target Coverage

- **Overall**: 70% minimum
- **Core modules**: 80%+ (matcher.py, query_generator.py, text_processing.py)
- **Integration**: Critical paths 100%

### 9.2 Coverage Reports

```bash
# Generate coverage report
pytest --cov=SRC --cov-report=html

# View in browser
open htmlcov/index.html
```

---

## 10. Test Data Management

### 10.1 Fixture Organization

- **Sample data**: Minimal, representative examples
- **Edge cases**: Boundary conditions, error cases
- **Real data**: Anonymized real examples (if needed)

### 10.2 Mock Strategy

- **Network requests**: Always mocked in unit tests
- **File I/O**: Use temporary files/fixtures
- **External APIs**: Mock responses

---

## 11. Running Tests

### 11.1 Basic Commands

```bash
# Run all tests
pytest

# Run specific test file
pytest SRC/tests/unit/test_matcher.py

# Run specific test
pytest SRC/tests/unit/test_matcher.py::test_scoring_logic

# Run with coverage
pytest --cov=SRC

# Run with verbose output
pytest -v

# Run with print statements visible
pytest -s
```

### 11.2 Test Execution Modes

```bash
# Fast tests (unit tests only)
pytest SRC/tests/unit/

# Full test suite (including integration)
pytest SRC/tests/

# Skip slow integration tests
pytest -m "not slow"
```

---

## 12. Best Practices

### 12.1 Test Organization

- **One test file per module**: Mirror source structure
- **Test naming**: `test_function_name` or `test_class_name_method`
- **Group related tests**: Use classes for organization

### 12.2 Test Writing

- **Arrange-Act-Assert**: Clear test structure
- **Descriptive names**: Test names should describe what they test
- **Isolated tests**: Tests should not depend on each other
- **Fast tests**: Unit tests should run quickly

### 12.3 Mocking Guidelines

- **Mock external dependencies**: Network, file system, external APIs
- **Use fixtures**: For reusable test data
- **Don't over-mock**: Test real behavior when possible

---

## 13. Continuous Improvement

### 13.1 Test Maintenance

- **Update tests when code changes**: Keep tests in sync
- **Review coverage regularly**: Ensure coverage stays high
- **Refactor tests**: Keep tests clean and maintainable

### 13.2 Expanding Test Suite

- **Add tests for bugs**: When fixing bugs, add regression tests
- **Add tests for new features**: Test new functionality
- **Edge case coverage**: Test boundary conditions

---

## 14. Dependencies

### 14.1 Required

```txt
pytest>=7.0.0
pytest-cov>=4.0.0
pytest-mock>=3.10.0
```

### 14.2 Optional

```txt
pytest-asyncio>=0.21.0  # For async tests (if needed)
pytest-xdist>=3.0.0     # For parallel test execution
```

---

## 15. Benefits

### 15.1 Code Quality

- **Prevent regressions**: Catch bugs before deployment
- **Enable refactoring**: Safe code changes with test coverage
- **Documentation**: Tests serve as usage examples

### 15.2 Development Speed

- **Confidence**: Make changes with assurance
- **Debugging**: Tests help identify issues quickly
- **CI/CD**: Automated testing in deployment pipeline

---

**Document Version**: 1.0  
**Last Updated**: 2025-11-03  
**Author**: CuePoint Development Team

