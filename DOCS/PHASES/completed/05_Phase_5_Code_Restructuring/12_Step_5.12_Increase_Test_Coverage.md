# Step 5.12: Increase Test Coverage to 80%

## Overview

This step focuses on systematically increasing test coverage from the current **11%** to the target **80%** by identifying gaps, prioritizing critical modules, and implementing comprehensive test suites.

## Current State

### Coverage Statistics
- **Overall Coverage**: 11% (1,150 / 10,330 statements)
- **Target Coverage**: 80% (8,264 / 10,330 statements)
- **Gap**: 69% (7,114 statements need coverage)
- **Missing Statements**: 9,180

### Coverage by Category

#### ✅ Well-Covered (>80%)
- `cli/cli_processor.py`: 87%
- `services/bootstrap.py`: 100%
- `services/logging_service.py`: 92%
- `services/matcher_service.py`: 86%
- `ui/gui_interface.py`: 89%
- `models/config_models.py`: 99%

#### ⚠️ Partially Covered (40-80%)
- `models/result.py`: 58%
- `models/track.py`: 60%
- `models/playlist.py`: 51%
- `services/interfaces.py`: 71%
- `services/cache_service.py`: 43%
- `services/config_service.py`: 46%
- `utils/di_container.py`: 56%
- `utils/performance.py`: 55%

#### 🔴 Low Coverage (<40%)
- `core/matcher.py`: 7% (378/405 missing)
- `core/mix_parser.py`: 6% (288/306 missing)
- `core/query_generator.py`: 3% (444/456 missing)
- `core/text_processing.py`: 34% (66/100 missing)
- `data/beatport.py`: 9% (491/540 missing)
- `data/beatport_search.py`: 5% (285/299 missing)
- `data/rekordbox.py`: 14% (71/83 missing)
- `services/processor_service.py`: 16% (109/130 missing)
- `services/export_service.py`: 17% (57/69 missing)
- `services/output_writer.py`: 15% (306/362 missing)
- `services/beatport_service.py`: 29% (27/38 missing)

#### ❌ Zero Coverage
- All UI controllers: 0% (341 statements)
- All UI widgets: 0% (2,500+ statements)
- `ui/main_window.py`: 0% (591 statements)
- `legacy/processor.py`: 0% (767 statements - excluded)
- `models/serialization.py`: 0% (32 statements)
- `utils/error_handler.py`: 0% (32 statements)
- `utils/performance_decorators.py`: 0% (68 statements)

## Goals

1. **Reach 80% Overall Coverage**: From 11% to 80%
2. **Critical Modules >90%**: Services, core logic, data models
3. **UI Components >70%**: Focus on business logic, not rendering
4. **Exclude Legacy Code**: Don't count deprecated modules
5. **Maintainable Tests**: Well-structured, readable, maintainable

## Strategy

### Phase 1: Quick Wins (Target: 20-30% coverage)
**Duration**: 3-5 days  
**Focus**: High-impact, low-effort improvements

1. **Exclude Legacy Code from Coverage**
   - Update `pytest.ini` to exclude `legacy/` directory
   - This alone will improve percentage significantly

2. **Add Tests for Well-Structured Modules**
   - `services/processor_service.py`: Add integration tests
   - `services/export_service.py`: Test all export formats
   - `services/beatport_service.py`: Test cache and search logic
   - `data/rekordbox.py`: Test XML parsing edge cases

3. **Test Error Handling**
   - Add tests for exception paths
   - Test validation logic
   - Test error recovery

### Phase 2: Core Business Logic (Target: 50-60% coverage)
**Duration**: 1-2 weeks  
**Focus**: Critical processing logic

1. **Core Modules**
   - `core/matcher.py`: Test matching algorithms
   - `core/query_generator.py`: Test query generation
   - `core/text_processing.py`: Test normalization functions
   - `core/mix_parser.py`: Test mix flag parsing

2. **Data Layer**
   - `data/beatport.py`: Test HTML parsing
   - `data/beatport_search.py`: Test search functions (mock browser)
   - `data/rekordbox.py`: Test XML parsing

3. **Services**
   - `services/processor_service.py`: Full workflow tests
   - `services/output_writer.py`: All export formats
   - `services/config_service.py`: Configuration loading/saving

### Phase 3: UI Business Logic (Target: 70% coverage)
**Duration**: 1-2 weeks  
**Focus**: UI controllers and business logic (not rendering)

1. **Controllers**
   - `ui/controllers/main_controller.py`: Test worker management
   - `ui/controllers/config_controller.py`: Test config updates
   - `ui/controllers/export_controller.py`: Test export logic
   - `ui/controllers/results_controller.py`: Test filtering/sorting

2. **Widgets (Business Logic Only)**
   - Test data processing methods
   - Test event handlers
   - Skip UI rendering tests (use pytest-qt for integration)

### Phase 4: Edge Cases & Integration (Target: 80% coverage)
**Duration**: 1 week  
**Focus**: Complete coverage

1. **Edge Cases**
   - Empty inputs
   - Invalid inputs
   - Boundary conditions
   - Error recovery

2. **Integration Tests**
   - End-to-end workflows
   - Component interactions
   - Real data scenarios

## Implementation Plan

### Step 1: Update Coverage Configuration
**File**: `pytest.ini`

```ini
[coverage:run]
omit = 
    */legacy/*.py          # Exclude legacy code
    */__pycache__/*
    */tests/*
    */gui_app.py          # Entry points
    */main.py
    */ui/widgets/*.py     # UI rendering (test business logic separately)
```

**Expected Impact**: +5-10% coverage (by excluding legacy)

### Step 2: Core Module Tests
**Priority**: High  
**Files to Create/Expand**:

1. `tests/unit/core/test_matcher.py` (expand)
   - Test `best_beatport_match()` with various inputs
   - Test scoring algorithms
   - Test edge cases (empty candidates, None values)

2. `tests/unit/core/test_query_generator.py` (create)
   - Test `make_search_queries()` with different track types
   - Test query variations
   - Test special characters handling

3. `tests/unit/core/test_text_processing.py` (expand)
   - Test all normalization functions
   - Test edge cases
   - Test special characters

4. `tests/unit/core/test_mix_parser.py` (create)
   - Test mix flag parsing
   - Test parenthetical phrase extraction
   - Test various mix formats

**Expected Impact**: +10-15% coverage

### Step 3: Data Layer Tests
**Priority**: High  
**Files to Create/Expand**:

1. `tests/unit/data/test_beatport.py` (expand)
   - Test `parse_track_page()` with various HTML structures
   - Test `track_urls()` function
   - Test error handling

2. `tests/unit/data/test_beatport_search.py` (create)
   - Test `beatport_search_hybrid()` (mock browser)
   - Test `beatport_search_direct()` (mock browser)
   - Test retry logic
   - Test error handling

3. `tests/unit/data/test_rekordbox.py` (expand)
   - Test XML parsing edge cases
   - Test playlist extraction
   - Test track conversion

**Expected Impact**: +8-12% coverage

### Step 4: Service Layer Tests
**Priority**: High  
**Files to Create/Expand**:

1. `tests/unit/services/test_processor_service.py` (expand)
   - Test `process_playlist_from_xml()` end-to-end
   - Test `process_track()` with various scenarios
   - Test error handling
   - Test progress callbacks

2. `tests/unit/services/test_export_service.py` (create)
   - Test all export formats (CSV, JSON, Excel)
   - Test compression
   - Test error handling

3. `tests/unit/services/test_output_writer.py` (expand)
   - Test all write functions
   - Test edge cases (empty results, special characters)
   - Test file creation

4. `tests/unit/services/test_config_service.py` (expand)
   - Test configuration loading
   - Test configuration saving
   - Test environment variable overrides

**Expected Impact**: +10-15% coverage

### Step 5: UI Controller Tests
**Priority**: Medium  
**Files to Create**:

1. `tests/unit/ui/controllers/test_main_controller.py` (create)
   - Test worker creation
   - Test signal connections
   - Test cancellation
   - Test error handling

2. `tests/unit/ui/controllers/test_config_controller.py` (create)
   - Test config updates
   - Test change notifications
   - Test validation

3. `tests/unit/ui/controllers/test_export_controller.py` (create)
   - Test export logic
   - Test format selection
   - Test error handling

**Expected Impact**: +3-5% coverage

### Step 6: Integration Tests
**Priority**: Medium  
**Files to Create/Expand**:

1. `tests/integration/test_full_workflow.py` (create)
   - Test complete processing workflow
   - Test CLI end-to-end
   - Test GUI end-to-end (with pytest-qt)

2. `tests/integration/test_error_scenarios.py` (create)
   - Test file not found
   - Test network errors
   - Test invalid data

**Expected Impact**: +2-3% coverage

## Testing Best Practices

### 1. Use Fixtures
```python
@pytest.fixture
def sample_track():
    return Track(
        title="Test Track",
        artist="Test Artist",
        # ... other fields
    )
```

### 2. Mock External Dependencies
```python
@patch('cuepoint.services.beatport_service.BeatportService')
def test_processor(mock_service):
    mock_service.search_tracks.return_value = []
    # Test your code
```

### 3. Test Both Success and Failure
```python
def test_process_track_success():
    # Test happy path
    
def test_process_track_invalid_input():
    # Test error handling
```

### 4. Use Parameterized Tests
```python
@pytest.mark.parametrize("input,expected", [
    ("test1", "result1"),
    ("test2", "result2"),
])
def test_multiple_cases(input, expected):
    assert function(input) == expected
```

### 5. Test Edge Cases
- Empty inputs
- None values
- Boundary conditions
- Special characters
- Very long strings

## Coverage Goals by Module

### Critical Modules (Target: 90%+)
- `services/processor_service.py`: 90%+
- `services/export_service.py`: 90%+
- `core/matcher.py`: 85%+
- `core/query_generator.py`: 85%+
- `data/rekordbox.py`: 85%+

### Important Modules (Target: 80%+)
- `services/config_service.py`: 80%+
- `services/beatport_service.py`: 80%+
- `core/text_processing.py`: 80%+
- `models/result.py`: 80%+
- `models/track.py`: 80%+

### UI Components (Target: 70%+)
- `ui/controllers/*.py`: 70%+ (business logic only)
- `ui/widgets/*.py`: 70%+ (business logic only)
- `ui/main_window.py`: 50%+ (critical paths only)

### Excluded from Coverage
- `legacy/*.py`: Excluded (deprecated)
- UI rendering code: Excluded (test business logic separately)
- Entry points (`main.py`, `gui_app.py`): Excluded

## Tools and Commands

### Check Current Coverage
```bash
# Run tests with coverage
pytest --cov=cuepoint --cov-report=html --cov-report=term-missing

# View HTML report
# Open: htmlcov/index.html

# Check specific module
pytest --cov=cuepoint.services.processor_service --cov-report=term-missing
```

### Find Coverage Gaps
```bash
# After running coverage, open htmlcov/index.html
# Click on any file to see red lines (not covered)

# Or use terminal output
pytest --cov=cuepoint --cov-report=term-missing | grep -E "cuepoint.*\s+\d+\s+\d+\s+\d+%"
```

### Run Tests for Specific Module
```bash
# Test specific module
pytest tests/unit/services/test_processor_service.py -v

# Test with coverage for specific module
pytest tests/unit/services/test_processor_service.py --cov=cuepoint.services.processor_service --cov-report=term-missing
```

## Milestones

### Milestone 1: 20% Coverage (Week 1)
- ✅ Exclude legacy code
- ✅ Add core service tests
- ✅ Add error handling tests

### Milestone 2: 40% Coverage (Week 2)
- ✅ Complete core module tests
- ✅ Complete data layer tests
- ✅ Expand service tests

### Milestone 3: 60% Coverage (Week 3)
- ✅ Complete service layer tests
- ✅ Add UI controller tests
- ✅ Add integration tests

### Milestone 4: 80% Coverage (Week 4)
- ✅ Add edge case tests
- ✅ Complete integration tests
- ✅ Fine-tune coverage

## Success Criteria

- ✅ Overall coverage ≥ 80%
- ✅ Critical modules ≥ 90%
- ✅ Important modules ≥ 80%
- ✅ UI business logic ≥ 70%
- ✅ All tests pass
- ✅ Tests are maintainable and well-documented
- ✅ Coverage report shows no critical gaps

## Notes

- **Focus on Quality**: Better to have fewer, well-written tests than many shallow tests
- **Test Behavior**: Test what the code does, not how it does it
- **Mock External Dependencies**: Don't test third-party libraries
- **UI Testing**: Focus on business logic, use pytest-qt for integration
- **Legacy Code**: Exclude from coverage (it's deprecated)
- **Incremental Approach**: Increase coverage gradually, verify after each phase

## Estimated Duration

**Total**: 3-4 weeks
- Phase 1 (Quick Wins): 3-5 days
- Phase 2 (Core Logic): 1-2 weeks
- Phase 3 (UI Logic): 1-2 weeks
- Phase 4 (Edge Cases): 1 week

## Dependencies

- Step 5.4: Comprehensive Testing (foundation)
- Step 5.11: CLI Migration (complete)
- All previous steps (code structure in place)

## Next Steps After Completion

- Maintain 80%+ coverage going forward
- Add coverage checks to CI/CD
- Review and update tests as code evolves
- Consider increasing target to 85-90% for critical modules

---

## Detailed Implementation Substeps

This section provides **analytical, line-by-line test implementation requirements** for each module. Each substep includes:
- **Exact functions/methods to test**
- **Specific test cases needed**
- **Mock strategies**
- **Expected coverage improvement**
- **Lines to cover**

---

## Phase 1: Quick Wins - Detailed Substeps

### Substep 1.1: Exclude Legacy Code from Coverage
**File**: `pytest.ini` or `.coveragerc`  
**Priority**: Critical  
**Effort**: 5 minutes  
**Expected Impact**: +5-10% overall coverage

**Implementation**:
```ini
[coverage:run]
omit = 
    */legacy/*.py
    */__pycache__/*
    */tests/*
    */gui_app.py
    */main.py
    */ui/widgets/*.py
    */utils/performance_decorators.py  # Decorators are hard to test
```

**Verification**:
```bash
pytest --cov=cuepoint --cov-report=term-missing
# Check that legacy/ directory is not in coverage report
```

---

### Substep 1.2: Add Integration Tests for Services
**Priority**: High  
**Effort**: 2-3 days  
**Expected Impact**: +8-12% overall coverage

#### 1.2.1: `services/processor_service.py` Integration Tests
**Current Coverage**: ~16%  
**Target Coverage**: 80%+  
**File**: `tests/integration/test_processor_service_integration.py`

**Functions to Test**:
1. `process_track()` - Main track processing
   - **Test Cases Needed**:
     - ✅ Track with valid artist and title
     - ✅ Track with empty artist (extract from title)
     - ✅ Track with remix in title
     - ✅ Track with custom settings
     - ✅ Track that returns no matches
     - ✅ Track with network error (mock BeatportService)
     - ✅ Track with parsing error (mock parse_track_page)
     - ✅ Track with progress callback verification
   
   **Mock Strategy**:
   ```python
   @patch('cuepoint.services.processor_service.BeatportService')
   @patch('cuepoint.services.processor_service.MatcherService')
   def test_process_track_with_match(mock_matcher, mock_beatport):
       # Mock BeatportService.search_tracks() to return candidates
       # Mock MatcherService.find_best_match() to return result
       # Verify TrackResult is created correctly
   ```

2. `process_playlist_from_xml()` - Playlist processing
   - **Test Cases Needed**:
     - ✅ Valid XML file with multiple tracks
     - ✅ XML file with empty playlist
     - ✅ XML file not found (FileNotFoundError)
     - ✅ Malformed XML (ET.ParseError)
     - ✅ Progress callback called for each track
     - ✅ Cancellation mid-processing
   
   **Mock Strategy**:
   ```python
   @patch('cuepoint.data.rekordbox.parse_rekordbox')
   @patch('cuepoint.services.processor_service.ProcessorService.process_track')
   def test_process_playlist_from_xml(mock_process_track, mock_parse):
       # Mock parse_rekordbox to return playlists
       # Mock process_track for each track
       # Verify all tracks processed
   ```

3. `process_playlist()` - Direct playlist processing
   - **Test Cases Needed**:
     - ✅ Playlist with multiple tracks
     - ✅ Empty playlist
     - ✅ Playlist with None tracks
     - ✅ Progress callback verification

**Lines to Cover** (from coverage report):
- Lines 50-80: Track processing logic
- Lines 90-120: Playlist processing logic
- Lines 130-150: Error handling
- Lines 160-180: Progress callbacks

**Expected Coverage Improvement**: 16% → 80% (+64%)

---

#### 1.2.2: `services/export_service.py` Integration Tests
**Current Coverage**: ~17%  
**Target Coverage**: 80%+  
**File**: `tests/integration/test_export_service_integration.py`

**Functions to Test**:
1. `write_csv_files()` - CSV export
   - **Test Cases Needed**:
     - ✅ Export with valid TrackResult list
     - ✅ Export with empty results list
     - ✅ Export with custom delimiter
     - ✅ Export with special characters in data
     - ✅ Export with None values in results
     - ✅ File write permission error
     - ✅ Invalid output directory
     - ✅ Verify CSV file created and contains correct data
   
   **Implementation Details**:
   ```python
   def test_write_csv_files_success(tmp_path):
       results = [TrackResult(...), TrackResult(...)]
       output_dir = tmp_path / "output"
       output_dir.mkdir()
       
       write_csv_files(results, "test", str(output_dir))
       
       # Verify files created
       assert (output_dir / "test_main.csv").exists()
       assert (output_dir / "test_candidates.csv").exists()
       
       # Verify CSV content
       with open(output_dir / "test_main.csv") as f:
           content = f.read()
           assert "Track Title" in content
   ```

2. `write_json_file()` - JSON export
   - **Test Cases Needed**:
     - ✅ Export with valid results
     - ✅ Export with empty results
     - ✅ Export with nested structures
     - ✅ JSON serialization error handling
     - ✅ File write error handling

3. `write_excel_file()` - Excel export
   - **Test Cases Needed**:
     - ✅ Export with valid results
     - ✅ Export with multiple sheets
     - ✅ Export with formatting
     - ✅ Excel library import error (if openpyxl not available)

**Lines to Cover**:
- Lines 30-60: CSV writing logic
- Lines 70-100: JSON writing logic
- Lines 110-140: Excel writing logic
- Lines 150-180: Error handling

**Expected Coverage Improvement**: 17% → 80% (+63%)

---

#### 1.2.3: `services/config_service.py` Integration Tests
**Current Coverage**: ~46%  
**Target Coverage**: 80%+  
**File**: `tests/integration/test_config_service_integration.py`

**Functions to Test**:
1. `load_config()` - Configuration loading
   - **Test Cases Needed**:
     - ✅ Load from valid YAML file
     - ✅ Load from file with missing keys (use defaults)
     - ✅ Load from file with invalid YAML
     - ✅ Load from non-existent file (use defaults)
     - ✅ Environment variable overrides
     - ✅ Multiple config sources (file + env vars)

2. `get()` - Get configuration value
   - **Test Cases Needed**:
     - ✅ Get existing key
     - ✅ Get non-existent key (return default)
     - ✅ Get nested key (e.g., "search.max_results")
     - ✅ Type conversion (string to int, etc.)

3. `set()` - Set configuration value
   - **Test Cases Needed**:
     - ✅ Set existing key
     - ✅ Set new key
     - ✅ Set nested key
     - ✅ Trigger change callbacks
     - ✅ Validate value before setting

4. `validate()` - Configuration validation
   - **Test Cases Needed**:
     - ✅ Valid configuration
     - ✅ Invalid value types
     - ✅ Out-of-range values
     - ✅ Missing required keys

**Lines to Cover**:
- Lines 40-70: Config loading logic
- Lines 80-110: Config getter logic
- Lines 120-150: Config setter logic
- Lines 160-190: Validation logic

**Expected Coverage Improvement**: 46% → 80% (+34%)

---

#### 1.2.4: `services/cache_service.py` Integration Tests
**Current Coverage**: ~43%  
**Target Coverage**: 80%+  
**File**: `tests/integration/test_cache_service_integration.py`

**Functions to Test**:
1. `get()` - Retrieve cached value
   - **Test Cases Needed**:
     - ✅ Get existing cached value
     - ✅ Get non-existent key (return None)
     - ✅ Get expired entry (return None)
     - ✅ Get entry just before expiration

2. `set()` - Cache a value
   - **Test Cases Needed**:
     - ✅ Set value with TTL
     - ✅ Set value without TTL (use default)
     - ✅ Overwrite existing key
     - ✅ Set with very short TTL (test expiration)

3. `clear()` - Clear cache
   - **Test Cases Needed**:
     - ✅ Clear all entries
     - ✅ Clear empty cache
     - ✅ Verify entries removed after clear

4. `_cleanup_expired()` - Internal cleanup
   - **Test Cases Needed**:
     - ✅ Remove expired entries
     - ✅ Keep non-expired entries
     - ✅ Handle concurrent access

**Lines to Cover**:
- Lines 30-50: Get logic
- Lines 60-90: Set logic with TTL
- Lines 100-120: Clear logic
- Lines 130-150: Expiration cleanup

**Expected Coverage Improvement**: 43% → 80% (+37%)

---

## Phase 2: Core Business Logic - Detailed Substeps

### Substep 2.1: Core Module Tests - `core/matcher.py`
**Current Coverage**: ~79% (from recent work)  
**Target Coverage**: 85%+  
**File**: `tests/unit/core/test_matcher.py` (expand)

**Functions to Test** (identify remaining uncovered lines):

1. `best_beatport_match()` - Main matching function
   - **Already Covered**: Basic matching, early exit, title-only mode
   - **Still Need**:
     - ✅ Edge case: Query with only stopwords
     - ✅ Edge case: Query with special characters only
     - ✅ Edge case: Very long query (>200 chars)
     - ✅ Edge case: Query with Unicode emojis
     - ✅ Multiple candidates with identical scores
     - ✅ Candidate with None values in fields
     - ✅ Query with mixed case and special formatting

2. `_norm_key()` - Key normalization
   - **Already Covered**: Basic normalization, variations
   - **Still Need**:
     - ✅ Key with extra whitespace
     - ✅ Key with Unicode symbols (♯, ♭)
     - ✅ Invalid key formats
     - ✅ Empty string after normalization

3. `_key_bonus()` - Key matching bonus
   - **Already Covered**: Exact match, near keys
   - **Still Need**:
     - ✅ Key with different case
     - ✅ Key with accidentals (C# vs Db)
     - ✅ None key values
     - ✅ Invalid key formats

4. `_year_bonus()` - Year matching bonus
   - **Already Covered**: Exact match, one-year diff
   - **Still Need**:
     - ✅ None year values
     - ✅ Year 0 or negative
     - ✅ Future years (>current year)
     - ✅ Very old years (<1900)

5. `_confidence_label()` - Confidence classification
   - **Already Covered**: Boundary values
   - **Still Need**:
     - ✅ Exact boundary scores (70.0, 85.0, 95.0)
     - ✅ Negative scores
     - ✅ Scores > 100

**Lines to Cover** (from coverage report - identify missing):
- Run: `pytest --cov=cuepoint.core.matcher --cov-report=term-missing`
- Identify specific line numbers not covered
- Write targeted tests for those lines

**Expected Coverage Improvement**: 79% → 85% (+6%)

---

### Substep 2.2: Core Module Tests - `core/query_generator.py`
**Current Coverage**: ~84% (from recent work)  
**Target Coverage**: 85%+  
**File**: `tests/unit/core/test_query_generator.py` (expand)

**Functions to Test** (identify remaining uncovered lines):

1. `make_search_queries()` - Query generation
   - **Already Covered**: Basic generation, empty artists, remix variants
   - **Still Need**:
     - ✅ Query with very long title (>100 chars)
     - ✅ Query with only special characters
     - ✅ Query with mixed languages (English + other)
     - ✅ Query with numbers in title
     - ✅ Query with artist names containing "feat."
     - ✅ Query generation with custom k_min/k_max values

2. `_ordered_unique()` - Remove duplicates preserving order
   - **Already Covered**: Basic functionality
   - **Still Need**:
     - ✅ Empty list
     - ✅ Single element
     - ✅ All duplicates
     - ✅ Mixed types (if applicable)

3. `_subset_join()` - Join subsets
   - **Already Covered**: Basic functionality
   - **Still Need**:
     - ✅ Empty list
     - ✅ Single element list
     - ✅ k_min > list length
     - ✅ k_max = 0

4. `_artist_tokens()` - Extract artist tokens
   - **Already Covered**: Basic extraction
   - **Still Need**:
     - ✅ Artist with special characters
     - ✅ Artist with "feat." or "ft."
     - ✅ Empty artist string
     - ✅ Artist with only spaces

5. `_title_prefixes()` - Generate title prefixes
   - **Already Covered**: Basic prefixes
   - **Still Need**:
     - ✅ Very short title (< k_min)
     - ✅ Title with only stopwords
     - ✅ Title with special characters at start

**Lines to Cover**:
- Run coverage report to identify specific missing lines
- Focus on edge cases and error paths

**Expected Coverage Improvement**: 84% → 85% (+1%)

---

### Substep 2.3: Core Module Tests - `core/mix_parser.py`
**Current Coverage**: ~71%  
**Target Coverage**: 80%+  
**File**: `tests/unit/core/test_mix_parser.py` (expand)

**Functions to Test** (identify remaining uncovered lines):

1. `parse_mix_flags()` - Main mix parsing
   - **Already Covered**: Basic mix types, remixer extraction
   - **Still Need**:
     - ✅ Title with multiple remix indicators
     - ✅ Title with conflicting mix types
     - ✅ Title with remixer in brackets and parentheses
     - ✅ Title with "Original Mix" and remix indicator
     - ✅ Title with Unicode characters in remixer name
     - ✅ Very long remixer names
     - ✅ Remixer names with special characters

2. `_extract_remixer_names_from_title()` - Remixer extraction
   - **Already Covered**: Basic extraction
   - **Still Need**:
     - ✅ Multiple remixers in different formats
     - ✅ Remixer with "feat." in name
     - ✅ Remixer extraction from nested parentheses
     - ✅ Remixer with special characters
     - ✅ Empty parentheses

3. `_merge_name_lists()` - Merge artist/remixer lists
   - **Already Covered**: Basic merging
   - **Still Need**:
     - ✅ Empty lists
     - ✅ Lists with all duplicates
     - ✅ Lists with partial overlaps
     - ✅ Case-insensitive duplicates

4. `_split_display_names()` - Split comma/ampersand separated names
   - **Already Covered**: Basic splitting
   - **Still Need**:
     - ✅ Names with "&" and "," mixed
     - ✅ Names with extra whitespace
     - ✅ Empty string
     - ✅ Single name

5. `_mix_ok_for_early_exit()` - Early exit check
   - **Already Covered**: Basic checks
   - **Still Need**:
     - ✅ All mix flags False
     - ✅ Multiple flags True
     - ✅ Edge case combinations

**Lines to Cover**:
- Identify missing lines from coverage report
- Focus on conditional branches and edge cases

**Expected Coverage Improvement**: 71% → 80% (+9%)

---

### Substep 2.4: Core Module Tests - `core/text_processing.py`
**Current Coverage**: ~91% (from recent work)  
**Target Coverage**: 91%+ (maintain)  
**File**: `tests/unit/core/test_text_processing.py` (expand if needed)

**Functions to Test** (if any remaining gaps):

1. All normalization functions
   - Verify edge cases are covered
   - Test Unicode handling
   - Test very long strings

**Expected Coverage Improvement**: Maintain 91%+

---

## Phase 2: Data Layer - Detailed Substeps

### Substep 2.5: Data Layer Tests - `data/beatport.py`
**Current Coverage**: ~86% (from recent work)  
**Target Coverage**: 86%+ (maintain, target 90%)  
**File**: `tests/integration/test_beatport_data_integration.py` (expand)

**Functions to Test** (identify remaining uncovered lines):

1. `request_html()` - HTTP fetching
   - **Already Covered**: Success, retry, empty body, cache detection
   - **Still Need** (if any lines missing):
     - ✅ Check coverage report for specific missing lines
     - ✅ Test any remaining exception paths
     - ✅ Test edge cases in header handling

2. `parse_track_page()` - Track page parsing
   - **Already Covered**: JSON-LD, Next.js, HTML fallback
   - **Still Need** (if any lines missing):
     - ✅ Check coverage report for specific missing lines
     - ✅ Test edge cases in date parsing
     - ✅ Test edge cases in genre extraction

3. `track_urls()` - Unified search
   - **Already Covered**: Direct search, DuckDuckGo, browser fallback
   - **Still Need** (if any lines missing):
     - ✅ Check coverage report for specific missing lines
     - ✅ Test remaining branches in search strategy selection
     - ✅ Test edge cases in result merging

4. `ddg_track_urls()` - DuckDuckGo search
   - **Current Coverage**: Low (lines 834-1001 mostly uncovered)
   - **Test Cases Needed**:
     - ✅ Basic DuckDuckGo search with results
     - ✅ Search with no results
     - ✅ Search with exception (network error)
     - ✅ Fallback search when few results
     - ✅ Broader searches when primary search fails
     - ✅ URL construction from query parts
     - ✅ Page parsing for track links
     - ✅ Multiple search strategies (quoted, unquoted, site: prefix)
     - ✅ Remix query detection and max_results increase
     - ✅ Exact quoted remix queries
     - ✅ Early break for non-remix queries with many results
   
   **Mock Strategy**:
   ```python
   @patch('cuepoint.data.beatport.DDGS')
   @patch('cuepoint.data.beatport.request_html')
   def test_ddg_track_urls_fallback_page_parsing(mock_request, mock_ddgs_class):
       # Mock DDGS returning page URLs (not track URLs)
       # Mock request_html returning HTML with track links
       # Verify track links extracted from pages
   ```

**Lines to Cover** (from coverage report):
- Lines 834-1001: `ddg_track_urls()` function (large function, needs comprehensive testing)
- Any remaining lines in other functions

**Expected Coverage Improvement**: 86% → 90% (+4%)

---

### Substep 2.6: Data Layer Tests - `data/beatport_search.py`
**Current Coverage**: ~82% (from recent work)  
**Target Coverage**: 82%+ (maintain, target 85%)  
**File**: `tests/integration/test_beatport_search_integration.py` (expand)

**Functions to Test** (identify remaining uncovered lines):

1. `beatport_search_browser()` - Browser automation
   - **Current Coverage**: Low (lines 413-529 mostly uncovered)
   - **Test Cases Needed**:
     - ✅ Playwright success path
     - ✅ Playwright ImportError (fallback to Selenium)
     - ✅ Playwright exception (fallback to Selenium)
     - ✅ Selenium success path
     - ✅ Selenium ImportError (return empty)
     - ✅ Selenium exception handling
     - ✅ Browser timeout scenarios
     - ✅ Browser with no results
     - ✅ Browser with many results (max_results limit)
   
   **Mock Strategy**:
   ```python
   @patch('playwright.sync_api.sync_playwright')
   def test_beatport_search_browser_playwright_success(mock_playwright):
       # Mock Playwright browser automation
       # Mock page.goto(), page.query_selector_all()
       # Verify track URLs extracted
   ```

2. `_extract_track_ids_from_next_data()` - Data extraction
   - **Already Covered**: React Query, nested structures
   - **Still Need** (if any lines missing):
     - ✅ Check coverage report for specific missing lines
     - ✅ Test edge cases in recursive traversal
     - ✅ Test max_results limit enforcement

**Lines to Cover**:
- Lines 413-529: `beatport_search_browser()` function
- Any remaining lines in other functions

**Expected Coverage Improvement**: 82% → 85% (+3%)

---

### Substep 2.7: Data Layer Tests - `data/rekordbox.py`
**Current Coverage**: ~88% (from recent work)  
**Target Coverage**: 88%+ (maintain)  
**File**: `tests/integration/test_rekordbox_data_integration.py` (expand if needed)

**Functions to Test** (if any remaining gaps):
- Check coverage report for specific missing lines
- Focus on edge cases in XML parsing

**Expected Coverage Improvement**: Maintain 88%+

---

## Phase 3: Service Layer - Detailed Substeps

### Substep 3.1: Service Tests - `services/output_writer.py`
**Current Coverage**: ~15%  
**Target Coverage**: 80%+  
**File**: `tests/unit/services/test_output_writer.py` (expand significantly)

**Functions to Test**:

1. `write_csv()` - CSV writing
   - **Test Cases Needed**:
     - ✅ Write with valid TrackResult list
     - ✅ Write with empty list
     - ✅ Write with None values in results
     - ✅ Write with special characters
     - ✅ Write with custom delimiter
     - ✅ File write error handling
     - ✅ Verify CSV format correctness
     - ✅ Verify all columns present

2. `write_json()` - JSON writing
   - **Test Cases Needed**:
     - ✅ Write with valid results
     - ✅ Write with empty results
     - ✅ Write with nested structures
     - ✅ JSON serialization error
     - ✅ File write error
     - ✅ Verify JSON format validity

3. `write_excel()` - Excel writing
   - **Test Cases Needed**:
     - ✅ Write with valid results
     - ✅ Write with multiple sheets
     - ✅ Write with formatting
     - ✅ Excel library not available (ImportError)
     - ✅ File write error
     - ✅ Verify Excel file structure

4. `_prepare_csv_row()` - CSV row preparation
   - **Test Cases Needed**:
     - ✅ Normal row preparation
     - ✅ Row with None values
     - ✅ Row with special characters
     - ✅ Row with very long strings

5. `_prepare_json_data()` - JSON data preparation
   - **Test Cases Needed**:
     - ✅ Normal data preparation
     - ✅ Data with None values
     - ✅ Data with nested structures
     - ✅ Data serialization edge cases

**Lines to Cover** (from coverage report):
- Lines 50-150: CSV writing functions
- Lines 160-250: JSON writing functions
- Lines 260-350: Excel writing functions
- Lines 360-362: Helper functions

**Expected Coverage Improvement**: 15% → 80% (+65%)

---

### Substep 3.2: Service Tests - `services/beatport_service.py`
**Current Coverage**: ~29%  
**Target Coverage**: 80%+  
**File**: `tests/unit/services/test_beatport_service.py` (expand)

**Functions to Test**:

1. `search_tracks()` - Track search
   - **Test Cases Needed**:
     - ✅ Search with valid query
     - ✅ Search with empty query
     - ✅ Search with cached result
     - ✅ Search with cache miss
     - ✅ Search with network error
     - ✅ Search with parsing error
     - ✅ Search with max_results limit
     - ✅ Verify cache is used
     - ✅ Verify cache is updated

2. `get_track_details()` - Track details retrieval
   - **Test Cases Needed**:
     - ✅ Get details for valid URL
     - ✅ Get details with cached result
     - ✅ Get details with cache miss
     - ✅ Get details with invalid URL
     - ✅ Get details with network error
     - ✅ Get details with parsing error

**Lines to Cover**:
- Lines 20-38: All service methods

**Expected Coverage Improvement**: 29% → 80% (+51%)

---

## Phase 4: UI Components - Detailed Substeps

### Substep 4.1: UI Controller Tests - `ui/controllers/main_controller.py`
**Current Coverage**: 0%  
**Target Coverage**: 70%+  
**File**: `tests/unit/ui/controllers/test_main_controller.py` (create)

**Functions to Test**:

1. `process_playlist()` - Playlist processing
   - **Test Cases Needed**:
     - ✅ Process valid playlist
     - ✅ Process empty playlist
     - ✅ Process with cancellation
     - ✅ Process with error
     - ✅ Verify signals emitted
     - ✅ Verify progress updates

2. `cancel_processing()` - Cancellation
   - **Test Cases Needed**:
     - ✅ Cancel active processing
     - ✅ Cancel when not processing
     - ✅ Verify worker stopped
     - ✅ Verify signals emitted

3. Worker management
   - **Test Cases Needed**:
     - ✅ Create worker
     - ✅ Worker completion
     - ✅ Worker error handling
     - ✅ Worker cleanup

**Mock Strategy**:
```python
from unittest.mock import Mock, patch
from PySide6.QtCore import QObject

def test_main_controller_process_playlist(qtbot):
    controller = MainController(...)
    mock_worker = Mock()
    
    with patch('cuepoint.ui.controllers.main_controller.ProcessingWorker', return_value=mock_worker):
        controller.process_playlist("playlist.xml")
        
    # Verify worker created and started
    assert mock_worker.start.called
```

**Lines to Cover**:
- All controller methods (focus on business logic, not UI rendering)

**Expected Coverage Improvement**: 0% → 70% (+70%)

---

### Substep 4.2: UI Controller Tests - Other Controllers
**Current Coverage**: 0%  
**Target Coverage**: 70%+  
**Files**: Create test files for each controller

**Controllers to Test**:
1. `ui/controllers/config_controller.py`
2. `ui/controllers/export_controller.py`
3. `ui/controllers/results_controller.py`

**Test Strategy**: Focus on business logic, mock UI dependencies

**Expected Coverage Improvement**: 0% → 70% per controller

---

## Phase 5: Edge Cases & Integration - Detailed Substeps

### Substep 5.1: Edge Case Tests
**Priority**: Medium  
**Effort**: 3-5 days  
**Expected Impact**: +2-5% coverage

**Edge Cases to Test**:

1. **Empty Inputs**:
   - ✅ Empty strings
   - ✅ Empty lists
   - ✅ None values
   - ✅ Empty dictionaries

2. **Invalid Inputs**:
   - ✅ Wrong types
   - ✅ Out-of-range values
   - ✅ Malformed data
   - ✅ Corrupted files

3. **Boundary Conditions**:
   - ✅ Maximum values
   - ✅ Minimum values
   - ✅ Zero values
   - ✅ Negative values (where applicable)

4. **Special Characters**:
   - ✅ Unicode characters
   - ✅ Emojis
   - ✅ Control characters
   - ✅ SQL injection attempts (for safety)

5. **Error Recovery**:
   - ✅ Retry logic
   - ✅ Fallback mechanisms
   - ✅ Graceful degradation

---

### Substep 5.2: Integration Tests
**Priority**: Medium  
**Effort**: 5-7 days  
**Expected Impact**: +3-5% coverage

**Integration Tests to Create**:

1. **End-to-End Workflow**:
   - ✅ Complete processing pipeline
   - ✅ XML → Processing → Matching → Export
   - ✅ Verify all components work together

2. **Component Interactions**:
   - ✅ Service-to-service communication
   - ✅ Controller-to-service communication
   - ✅ Data flow through system

3. **Real Data Scenarios**:
   - ✅ Process real Rekordbox XML (sample)
   - ✅ Match against real Beatport data (mocked)
   - ✅ Export in all formats

---

## Test Implementation Checklist

For each module, use this checklist:

- [ ] **Identify uncovered lines**: Run `pytest --cov=MODULE --cov-report=term-missing`
- [ ] **List all functions**: Use `grep "^def " MODULE.py`
- [ ] **Create test file**: `tests/unit/MODULE/test_MODULE.py` or `tests/integration/test_MODULE_integration.py`
- [ ] **Write test for each function**: At least one success and one failure case
- [ ] **Test edge cases**: Empty inputs, None values, boundary conditions
- [ ] **Mock external dependencies**: Network calls, file I/O, browser automation
- [ ] **Verify coverage improvement**: Run coverage again, verify target reached
- [ ] **Document test strategy**: Add comments explaining mock strategy

---

## Coverage Verification Commands

```bash
# Check overall coverage
cd SRC
pytest --cov=cuepoint --cov-report=term-missing

# Check specific module
pytest --cov=cuepoint.MODULE --cov-report=term-missing

# Generate HTML report
pytest --cov=cuepoint --cov-report=html
# Open: htmlcov/index.html

# Find modules below 80%
pytest --cov=cuepoint --cov-report=term-missing | grep -E "cuepoint.*\s+\d+\s+\d+\s+\d+%" | awk '$NF < 80'
```

---

## Expected Final Coverage by Module

| Module | Current | Target | Gap | Priority |
|--------|---------|--------|-----|----------|
| `core/matcher.py` | 79% | 85% | +6% | High |
| `core/query_generator.py` | 84% | 85% | +1% | High |
| `core/mix_parser.py` | 71% | 80% | +9% | High |
| `core/text_processing.py` | 91% | 91% | 0% | Maintain |
| `data/beatport.py` | 86% | 90% | +4% | High |
| `data/beatport_search.py` | 82% | 85% | +3% | High |
| `data/rekordbox.py` | 88% | 88% | 0% | Maintain |
| `services/processor_service.py` | 16% | 80% | +64% | Critical |
| `services/export_service.py` | 17% | 80% | +63% | Critical |
| `services/config_service.py` | 46% | 80% | +34% | High |
| `services/cache_service.py` | 43% | 80% | +37% | High |
| `services/output_writer.py` | 15% | 80% | +65% | High |
| `services/beatport_service.py` | 29% | 80% | +51% | High |
| `ui/controllers/*.py` | 0% | 70% | +70% | Medium |

---

## Implementation Order

1. **Week 1**: Substeps 1.1, 1.2 (Quick Wins) → Target: 20-30%
2. **Week 2**: Substeps 2.1-2.7 (Core & Data) → Target: 50-60%
3. **Week 3**: Substeps 3.1-3.2, 4.1-4.2 (Services & UI) → Target: 70%
4. **Week 4**: Substeps 5.1-5.2 (Edge Cases & Integration) → Target: 80%

---

## Detailed Test Implementation Requirements

### Module: `services/output_writer.py`
**Current Coverage**: 15%  
**Target Coverage**: 80%  
**File**: `tests/unit/services/test_output_writer.py`

#### Function: `write_csv(results, filename, output_dir, delimiter=',')`
**Lines to Cover**: 50-150 (approximate, verify with coverage report)

**Test Cases Required**:

1. **Basic CSV Writing**:
   ```python
   def test_write_csv_basic(tmp_path):
       """Test writing CSV with valid TrackResult list."""
       results = [
           TrackResult(
               track=Track(title="Test Track", artists="Test Artist"),
               best_match=BeatportCandidate(...),
               # ... other fields
           )
       ]
       output_dir = tmp_path / "output"
       output_dir.mkdir()
       
       write_csv(results, "test", str(output_dir))
       
       # Verify files created
       main_file = output_dir / "test_main.csv"
       candidates_file = output_dir / "test_candidates.csv"
       
       assert main_file.exists()
       assert candidates_file.exists()
       
       # Verify CSV content
       with open(main_file) as f:
           lines = f.readlines()
           assert len(lines) > 1  # Header + data
           assert "Track Title" in lines[0] or "title" in lines[0].lower()
   ```

2. **CSV with Empty Results**:
   ```python
   def test_write_csv_empty_results(tmp_path):
       """Test writing CSV with empty results list."""
       output_dir = tmp_path / "output"
       output_dir.mkdir()
       
       write_csv([], "test", str(output_dir))
       
       # Should still create files (with headers only)
       main_file = output_dir / "test_main.csv"
       assert main_file.exists()
       
       with open(main_file) as f:
           content = f.read()
           # Should have header but no data rows
           lines = content.strip().split('\n')
           assert len(lines) == 1  # Only header
   ```

3. **CSV with None Values**:
   ```python
   def test_write_csv_none_values(tmp_path):
       """Test writing CSV when TrackResult has None values."""
       results = [
           TrackResult(
               track=Track(title="Test", artists="Artist"),
               best_match=None,  # None match
               # ... other fields with some None
           )
       ]
       output_dir = tmp_path / "output"
       output_dir.mkdir()
       
       write_csv(results, "test", str(output_dir))
       
       # Should handle None values gracefully (empty string or "N/A")
       main_file = output_dir / "test_main.csv"
       with open(main_file) as f:
           content = f.read()
           # Verify None values are handled (not cause errors)
           assert "Test" in content
   ```

4. **CSV with Special Characters**:
   ```python
   def test_write_csv_special_characters(tmp_path):
       """Test writing CSV with special characters in data."""
       results = [
           TrackResult(
               track=Track(
                   title="Test, Track \"with\" quotes",
                   artists="Artist & Co."
               ),
               # ... other fields
           )
       ]
       output_dir = tmp_path / "output"
       output_dir.mkdir()
       
       write_csv(results, "test", str(output_dir))
       
       # CSV should properly escape special characters
       main_file = output_dir / "test_main.csv"
       with open(main_file) as f:
           content = f.read()
           # Verify special characters are handled (quoted or escaped)
           assert "Test" in content
   ```

5. **CSV with Custom Delimiter**:
   ```python
   def test_write_csv_custom_delimiter(tmp_path):
       """Test writing CSV with custom delimiter."""
       results = [TrackResult(...)]
       output_dir = tmp_path / "output"
       output_dir.mkdir()
       
       write_csv(results, "test", str(output_dir), delimiter=';')
       
       main_file = output_dir / "test_main.csv"
       with open(main_file) as f:
           first_line = f.readline()
           # Verify semicolon delimiter used
           assert ';' in first_line
           assert ',' not in first_line or first_line.count(',') < first_line.count(';')
   ```

6. **CSV File Write Error**:
   ```python
   @patch('builtins.open', side_effect=PermissionError("Permission denied"))
   def test_write_csv_permission_error(mock_open, tmp_path):
       """Test CSV writing with file permission error."""
       results = [TrackResult(...)]
       output_dir = tmp_path / "output"
       output_dir.mkdir()
       
       # Should handle error gracefully (log and continue or raise)
       with pytest.raises(PermissionError):
           write_csv(results, "test", str(output_dir))
   ```

7. **CSV Invalid Output Directory**:
   ```python
   def test_write_csv_invalid_directory():
       """Test CSV writing with invalid output directory."""
       results = [TrackResult(...)]
       
       # Should handle invalid directory (FileNotFoundError or create it)
       with pytest.raises((FileNotFoundError, OSError)):
           write_csv(results, "test", "/nonexistent/path")
   ```

**Lines to Verify Coverage**:
- Run: `pytest --cov=cuepoint.services.output_writer --cov-report=term-missing`
- Identify specific line numbers in `write_csv()` function
- Ensure all branches covered (if/else, try/except)

---

#### Function: `write_json(results, filename, output_dir)`
**Lines to Cover**: 160-250 (approximate)

**Test Cases Required**:

1. **Basic JSON Writing**:
   ```python
   def test_write_json_basic(tmp_path):
       """Test writing JSON with valid results."""
       results = [TrackResult(...)]
       output_dir = tmp_path / "output"
       output_dir.mkdir()
       
       write_json(results, "test", str(output_dir))
       
       json_file = output_dir / "test.json"
       assert json_file.exists()
       
       # Verify JSON is valid
       import json
       with open(json_file) as f:
           data = json.load(f)
           assert isinstance(data, (list, dict))
           assert len(data) > 0
   ```

2. **JSON with Empty Results**:
   ```python
   def test_write_json_empty_results(tmp_path):
       """Test writing JSON with empty results."""
       output_dir = tmp_path / "output"
       output_dir.mkdir()
       
       write_json([], "test", str(output_dir))
       
       json_file = output_dir / "test.json"
       assert json_file.exists()
       
       import json
       with open(json_file) as f:
           data = json.load(f)
           # Should be empty list or empty dict
           assert data == [] or data == {}
   ```

3. **JSON Serialization Error**:
   ```python
   @patch('json.dump', side_effect=TypeError("Not JSON serializable"))
   def test_write_json_serialization_error(mock_dump, tmp_path):
       """Test JSON writing with serialization error."""
       results = [TrackResult(...)]
       output_dir = tmp_path / "output"
       output_dir.mkdir()
       
       # Should handle serialization error
       with pytest.raises(TypeError):
           write_json(results, "test", str(output_dir))
   ```

4. **JSON File Write Error**:
   ```python
   @patch('builtins.open', side_effect=IOError("Disk full"))
   def test_write_json_io_error(mock_open, tmp_path):
       """Test JSON writing with IO error."""
       results = [TrackResult(...)]
       output_dir = tmp_path / "output"
       output_dir.mkdir()
       
       with pytest.raises(IOError):
           write_json(results, "test", str(output_dir))
   ```

---

#### Function: `write_excel(results, filename, output_dir)`
**Lines to Cover**: 260-350 (approximate)

**Test Cases Required**:

1. **Basic Excel Writing**:
   ```python
   def test_write_excel_basic(tmp_path):
       """Test writing Excel with valid results."""
       results = [TrackResult(...)]
       output_dir = tmp_path / "output"
       output_dir.mkdir()
       
       write_excel(results, "test", str(output_dir))
       
       excel_file = output_dir / "test.xlsx"
       assert excel_file.exists()
       
       # Verify Excel file can be opened
       try:
           import openpyxl
           wb = openpyxl.load_workbook(excel_file)
           assert len(wb.sheetnames) > 0
       except ImportError:
           pytest.skip("openpyxl not available")
   ```

2. **Excel Library Not Available**:
   ```python
   @patch('builtins.__import__', side_effect=ImportError("No module named 'openpyxl'"))
   def test_write_excel_import_error(mock_import):
       """Test Excel writing when openpyxl not available."""
       results = [TrackResult(...)]
       
       # Should handle ImportError gracefully
       with pytest.raises(ImportError):
           write_excel(results, "test", "/tmp")
   ```

3. **Excel with Multiple Sheets**:
   ```python
   def test_write_excel_multiple_sheets(tmp_path):
       """Test Excel writing creates multiple sheets if needed."""
       results = [TrackResult(...)]
       output_dir = tmp_path / "output"
       output_dir.mkdir()
       
       write_excel(results, "test", str(output_dir))
       
       excel_file = output_dir / "test.xlsx"
       try:
           import openpyxl
           wb = openpyxl.load_workbook(excel_file)
           # Verify expected sheets exist
           assert "Main" in wb.sheetnames or "Results" in wb.sheetnames
       except ImportError:
           pytest.skip("openpyxl not available")
   ```

---

### Module: `ui/controllers/main_controller.py`
**Current Coverage**: 0%  
**Target Coverage**: 70%  
**File**: `tests/unit/ui/controllers/test_main_controller.py` (create)

#### Class: `MainController`
**Lines to Cover**: All methods (focus on business logic)

**Methods to Test**:

1. **`__init__(services, parent=None)`** - Initialization
   - **Test Cases**:
     - ✅ Initialize with valid services
     - ✅ Initialize with None parent
     - ✅ Verify signals created
     - ✅ Verify worker is None initially

2. **`process_playlist(xml_path, settings=None)`** - Start processing
   - **Test Cases**:
     - ✅ Process valid XML file
     - ✅ Process with custom settings
     - ✅ Process when already processing (should cancel first)
     - ✅ Verify worker created
     - ✅ Verify worker started
     - ✅ Verify signals connected
     - ✅ Process with invalid XML path (FileNotFoundError)

3. **`cancel_processing()`** - Cancel active processing
   - **Test Cases**:
     - ✅ Cancel when processing active
     - ✅ Cancel when not processing (should be safe)
     - ✅ Verify worker stopped
     - ✅ Verify signals disconnected
     - ✅ Verify worker set to None

4. **`_on_worker_finished()`** - Worker completion handler
   - **Test Cases**:
     - ✅ Handle successful completion
     - ✅ Handle completion with results
     - ✅ Handle completion with errors
     - ✅ Verify signals emitted
     - ✅ Verify worker cleaned up

5. **`_on_worker_error(error)`** - Worker error handler
   - **Test Cases**:
     - ✅ Handle various error types
     - ✅ Verify error signal emitted
     - ✅ Verify worker cleaned up

6. **`_on_progress_update(current, total, message)`** - Progress handler
   - **Test Cases**:
     - ✅ Handle progress updates
     - ✅ Verify progress signal emitted
     - ✅ Handle edge cases (current > total, negative values)

**Mock Strategy**:
```python
from unittest.mock import Mock, patch, MagicMock
from PySide6.QtCore import QObject, Signal
import pytest
from pytestqt.qtbot import QtBot

@pytest.fixture
def mock_services():
    """Create mock services for MainController."""
    services = Mock()
    services.processor = Mock()
    services.config = Mock()
    services.logging = Mock()
    return services

def test_main_controller_process_playlist(qtbot, mock_services):
    """Test MainController.process_playlist()."""
    from cuepoint.ui.controllers.main_controller import MainController
    
    controller = MainController(mock_services)
    
    # Mock worker
    mock_worker = MagicMock()
    mock_worker.start = Mock()
    mock_worker.finished = Signal()
    mock_worker.error = Signal(object)
    mock_worker.progress = Signal(int, int, str)
    
    with patch('cuepoint.ui.controllers.main_controller.ProcessingWorker', return_value=mock_worker):
        controller.process_playlist("test.xml")
        
        # Verify worker created
        assert controller._worker is not None
        # Verify worker started
        mock_worker.start.assert_called_once()
```

**Lines to Cover**:
- All method implementations
- Signal connections
- Error handling paths
- Worker lifecycle management

---

### Module: `ui/controllers/config_controller.py`
**Current Coverage**: 0%  
**Target Coverage**: 70%  
**File**: `tests/unit/ui/controllers/test_config_controller.py` (create)

**Methods to Test**:

1. **`update_setting(key, value)`** - Update configuration
   - **Test Cases**:
     - ✅ Update existing setting
     - ✅ Update nested setting (e.g., "search.max_results")
     - ✅ Update with invalid value (should validate)
     - ✅ Verify config service called
     - ✅ Verify change signal emitted

2. **`load_config()`** - Load configuration
   - **Test Cases**:
     - ✅ Load from file
     - ✅ Load with defaults
     - ✅ Handle file not found
     - ✅ Handle invalid YAML

3. **`save_config()`** - Save configuration
   - **Test Cases**:
     - ✅ Save to file
     - ✅ Handle write error
     - ✅ Verify file created/updated

---

### Module: `ui/controllers/export_controller.py`
**Current Coverage**: 0%  
**Target Coverage**: 70%  
**File**: `tests/unit/ui/controllers/test_export_controller.py` (create)

**Methods to Test**:

1. **`export_results(results, format, output_path)`** - Export results
   - **Test Cases**:
     - ✅ Export to CSV
     - ✅ Export to JSON
     - ✅ Export to Excel
     - ✅ Export with invalid format (should error)
     - ✅ Export with invalid path (should error)
     - ✅ Verify export service called

2. **`get_export_formats()`** - Get available formats
   - **Test Cases**:
     - ✅ Return list of formats
     - ✅ Verify formats are valid

---

### Module: `ui/controllers/results_controller.py`
**Current Coverage**: 0%  
**Target Coverage**: 70%  
**File**: `tests/unit/ui/controllers/test_results_controller.py` (create)

**Methods to Test**:

1. **`filter_results(criteria)`** - Filter results
   - **Test Cases**:
     - ✅ Filter by artist
     - ✅ Filter by title
     - ✅ Filter by match status
     - ✅ Filter with empty criteria
     - ✅ Filter with no matches

2. **`sort_results(key, reverse=False)`** - Sort results
   - **Test Cases**:
     - ✅ Sort by title
     - ✅ Sort by artist
     - ✅ Sort by score
     - ✅ Sort ascending
     - ✅ Sort descending
     - ✅ Sort with invalid key

3. **`get_selected_results()`** - Get selected results
   - **Test Cases**:
     - ✅ Get single selection
     - ✅ Get multiple selections
     - ✅ Get no selection (empty list)

---

## Test Implementation Template

For each function/method, use this template:

```python
"""Test [Function Name] in [Module Name]."""

import pytest
from unittest.mock import Mock, patch, MagicMock

from cuepoint.[module] import [function]


class Test[FunctionName]:
    """Test cases for [function name]."""
    
    def test_[function]_success(self):
        """Test [function] with valid inputs."""
        # Arrange
        # ... setup test data
        
        # Act
        result = [function](...)
        
        # Assert
        assert result == expected
        
    def test_[function]_empty_input(self):
        """Test [function] with empty input."""
        # ... test empty case
        
    def test_[function]_invalid_input(self):
        """Test [function] with invalid input."""
        # ... test error handling
        
    def test_[function]_edge_case(self):
        """Test [function] with edge case."""
        # ... test boundary condition
```

---

## Coverage Gap Analysis Workflow

For each module:

1. **Run Coverage Report**:
   ```bash
   pytest --cov=cuepoint.[module] --cov-report=term-missing
   ```

2. **Identify Missing Lines**:
   - Look for line numbers in output
   - Open HTML report: `htmlcov/index.html`
   - Click on module file
   - Red lines = not covered

3. **Analyze Missing Lines**:
   - Are they in error handling? → Add error test
   - Are they in conditional branches? → Add test for that branch
   - Are they in edge cases? → Add edge case test
   - Are they in helper functions? → Test helper directly

4. **Write Targeted Tests**:
   - One test per missing branch/condition
   - Use mocks to trigger specific paths
   - Verify expected behavior

5. **Verify Coverage Improvement**:
   ```bash
   pytest --cov=cuepoint.[module] --cov-report=term-missing
   # Check if target coverage reached
   ```

---

## Mock Patterns by Dependency Type

### Network Calls
```python
@patch('requests.get')
def test_network_call(mock_get):
    mock_response = Mock()
    mock_response.status_code = 200
    mock_response.json.return_value = {...}
    mock_get.return_value = mock_response
    # ... test code
```

### File I/O
```python
def test_file_operations(tmp_path):
    test_file = tmp_path / "test.txt"
    # ... test with temporary file
```

### Browser Automation
```python
@patch('playwright.sync_api.sync_playwright')
def test_browser_automation(mock_playwright):
    mock_browser = Mock()
    mock_page = Mock()
    mock_page.query_selector_all.return_value = [...]
    mock_browser.new_page.return_value = mock_page
    mock_playwright.return_value.__enter__.return_value = Mock(chromium=Mock(launch=Mock(return_value=mock_browser)))
    # ... test code
```

### Service Dependencies
```python
@patch('cuepoint.services.other_service.OtherService')
def test_service_dependency(mock_service):
    mock_service.method.return_value = expected_value
    # ... test code
```

### Qt Signals/Events
```python
from pytestqt.qtbot import QtBot

def test_qt_signal(qtbot):
    widget = MyWidget()
    qtbot.addWidget(widget)
    
    with qtbot.waitSignal(widget.signal, timeout=1000):
        widget.trigger_signal()
```

---

## Additional Detailed Substeps

### Substep 3.3: Service Tests - `services/output_writer.py` (Continued)

#### Function: `write_main_csv(results, filename, output_dir, delimiter, include_metadata)`
**Lines to Cover**: 124-246 (approximate)

**Test Cases Required**:

1. **Basic Main CSV Writing**:
   ```python
   def test_write_main_csv_basic(tmp_path):
       """Test writing main CSV with valid results."""
       results = [
           TrackResult(
               track=Track(title="Test", artists="Artist"),
               best_match=BeatportCandidate(...),
               # ... populate all fields
           )
       ]
       output_dir = tmp_path / "output"
       output_dir.mkdir()
       
       file_path = write_main_csv(
           results, "test.csv", str(output_dir), delimiter=",", include_metadata=True
       )
       
       assert file_path is not None
       assert os.path.exists(file_path)
       
       # Verify CSV structure
       with open(file_path, 'r', encoding='utf-8') as f:
           reader = csv.DictReader(f)
           rows = list(reader)
           assert len(rows) == len(results)
           # Verify key columns present
           assert 'title' in reader.fieldnames or 'Title' in reader.fieldnames
   ```

2. **Main CSV Without Metadata**:
   ```python
   def test_write_main_csv_no_metadata(tmp_path):
       """Test writing main CSV without metadata columns."""
       results = [TrackResult(...)]
       output_dir = tmp_path / "output"
       output_dir.mkdir()
       
       file_path = write_main_csv(
           results, "test.csv", str(output_dir), delimiter=",", include_metadata=False
       )
       
       with open(file_path, 'r', encoding='utf-8') as f:
           reader = csv.DictReader(f)
           # Verify metadata columns not present
           assert 'query_index' not in reader.fieldnames
           assert 'elapsed_ms' not in reader.fieldnames
   ```

3. **Main CSV with Custom Delimiter**:
   ```python
   def test_write_main_csv_tab_delimiter(tmp_path):
       """Test writing main CSV with tab delimiter."""
       results = [TrackResult(...)]
       output_dir = tmp_path / "output"
       output_dir.mkdir()
       
       file_path = write_main_csv(
           results, "test.tsv", str(output_dir), delimiter="\t", include_metadata=True
       )
       
       with open(file_path, 'r', encoding='utf-8') as f:
           first_line = f.readline()
           # Verify tab delimiter used
           assert '\t' in first_line
   ```

4. **Main CSV with None Values**:
   ```python
   def test_write_main_csv_none_values(tmp_path):
       """Test writing main CSV when TrackResult has None values."""
       results = [
           TrackResult(
               track=Track(title="Test", artists="Artist"),
               best_match=None,  # No match found
               # ... other fields with some None
           )
       ]
       output_dir = tmp_path / "output"
       output_dir.mkdir()
       
       file_path = write_main_csv(
           results, "test.csv", str(output_dir), delimiter=",", include_metadata=True
       )
       
       # Should handle None values (write empty string or "N/A")
       with open(file_path, 'r', encoding='utf-8') as f:
           content = f.read()
           # Verify file written successfully despite None values
           assert len(content) > 0
   ```

#### Function: `write_candidates_csv(results, filename, output_dir, delimiter)`
**Lines to Cover**: 247-291 (approximate)

**Test Cases Required**:

1. **Candidates CSV with Multiple Candidates**:
   ```python
   def test_write_candidates_csv_multiple(tmp_path):
       """Test writing candidates CSV when tracks have multiple candidates."""
       results = [
           TrackResult(
               track=Track(...),
               best_match=BeatportCandidate(...),
               candidates=[
                   BeatportCandidate(...),
                   BeatportCandidate(...),
                   BeatportCandidate(...),
               ]
           )
       ]
       output_dir = tmp_path / "output"
       output_dir.mkdir()
       
       file_path = write_candidates_csv(
           results, "test.csv", str(output_dir), delimiter=","
       )
       
       assert file_path is not None
       with open(file_path, 'r', encoding='utf-8') as f:
           reader = csv.DictReader(f)
           rows = list(reader)
           # Should have one row per candidate
           assert len(rows) == sum(len(r.candidates) for r in results)
   ```

2. **Candidates CSV with No Candidates**:
   ```python
   def test_write_candidates_csv_no_candidates(tmp_path):
       """Test writing candidates CSV when tracks have no candidates."""
       results = [
           TrackResult(
               track=Track(...),
               best_match=None,
               candidates=[]
           )
       ]
       output_dir = tmp_path / "output"
       output_dir.mkdir()
       
       file_path = write_candidates_csv(
           results, "test.csv", str(output_dir), delimiter=","
       )
       
       # Should create file with headers only (or return None)
       if file_path:
           with open(file_path, 'r', encoding='utf-8') as f:
               lines = f.readlines()
               # Should have at least header
               assert len(lines) >= 1
   ```

#### Function: `write_queries_csv(results, filename, output_dir, delimiter)`
**Lines to Cover**: 292-336 (approximate)

**Test Cases Required**:

1. **Queries CSV Writing**:
   ```python
   def test_write_queries_csv(tmp_path):
       """Test writing queries CSV."""
       results = [
           TrackResult(
               track=Track(...),
               queries_used=["query1", "query2", "query3"]
           )
       ]
       output_dir = tmp_path / "output"
       output_dir.mkdir()
       
       file_path = write_queries_csv(
           results, "test.csv", str(output_dir), delimiter=","
       )
       
       assert file_path is not None
       with open(file_path, 'r', encoding='utf-8') as f:
           reader = csv.DictReader(f)
           rows = list(reader)
           # Should have one row per query
           total_queries = sum(len(r.queries_used) for r in results)
           assert len(rows) == total_queries
   ```

#### Function: `write_review_csv(results, filename, output_dir, delimiter)`
**Lines to Cover**: 337-415 (approximate)

**Test Cases Required**:

1. **Review CSV Writing**:
   ```python
   def test_write_review_csv(tmp_path):
       """Test writing review CSV for tracks needing review."""
       results = [
           TrackResult(
               track=Track(...),
               best_match=None,  # No match - needs review
               # ... other fields
           )
       ]
       output_dir = tmp_path / "output"
       output_dir.mkdir()
       
       file_path = write_review_csv(
           results, "test.csv", str(output_dir), delimiter=","
       )
       
       # Should only include tracks needing review
       if file_path:
           with open(file_path, 'r', encoding='utf-8') as f:
               reader = csv.DictReader(f)
               rows = list(reader)
               # Verify only unmatched tracks included
               assert all(row.get('match_status') != 'matched' for row in rows)
   ```

#### Function: `write_json_file(results, filename, output_dir)`
**Lines to Cover**: 511-701 (approximate)

**Test Cases Required**:

1. **JSON File Writing with Full Structure**:
   ```python
   def test_write_json_file_full_structure(tmp_path):
       """Test writing JSON with complete TrackResult structure."""
       results = [
           TrackResult(
               track=Track(...),
               best_match=BeatportCandidate(...),
               candidates=[...],
               queries_used=[...],
               # ... all fields populated
           )
       ]
       output_dir = tmp_path / "output"
       output_dir.mkdir()
       
       file_path = write_json_file(results, "test.json", str(output_dir))
       
       assert file_path is not None
       import json
       with open(file_path, 'r', encoding='utf-8') as f:
           data = json.load(f)
           # Verify structure
           assert isinstance(data, (list, dict))
           if isinstance(data, list):
               assert len(data) == len(results)
               assert 'track' in data[0] or 'title' in data[0]
   ```

2. **JSON File with Nested Structures**:
   ```python
   def test_write_json_file_nested(tmp_path):
       """Test JSON writing preserves nested structures."""
       results = [TrackResult(...)]
       output_dir = tmp_path / "output"
       output_dir.mkdir()
       
       file_path = write_json_file(results, "test.json", str(output_dir))
       
       import json
       with open(file_path, 'r', encoding='utf-8') as f:
           data = json.load(f)
           # Verify nested structures (track, candidates, etc.) are preserved
           # This depends on JSON serialization implementation
   ```

#### Function: `write_excel_file(results, file_path, playlist_name)`
**Lines to Cover**: 702-822 (approximate)

**Test Cases Required**:

1. **Excel File Writing**:
   ```python
   def test_write_excel_file_basic(tmp_path):
       """Test writing Excel file with valid results."""
       results = [TrackResult(...)]
       excel_path = tmp_path / "test.xlsx"
       
       file_path = write_excel_file(results, str(excel_path), "Test Playlist")
       
       assert file_path is not None
       assert os.path.exists(file_path)
       
       try:
           import openpyxl
           wb = openpyxl.load_workbook(file_path)
           # Verify sheets created
           assert len(wb.sheetnames) > 0
           # Verify data in sheets
           ws = wb.active
           assert ws.max_row > 1  # Header + data
       except ImportError:
           pytest.skip("openpyxl not available")
   ```

2. **Excel File with Formatting**:
   ```python
   def test_write_excel_file_formatting(tmp_path):
       """Test Excel file includes formatting."""
       results = [TrackResult(...)]
       excel_path = tmp_path / "test.xlsx"
       
       file_path = write_excel_file(results, str(excel_path), "Test Playlist")
       
       try:
           import openpyxl
           wb = openpyxl.load_workbook(file_path)
           ws = wb.active
           # Verify formatting applied (headers bold, etc.)
           header_font = ws['A1'].font
           assert header_font.bold is True
       except ImportError:
           pytest.skip("openpyxl not available")
   ```

3. **Excel File with Multiple Sheets**:
   ```python
   def test_write_excel_file_multiple_sheets(tmp_path):
       """Test Excel file creates multiple sheets if needed."""
       results = [TrackResult(...)]
       excel_path = tmp_path / "test.xlsx"
       
       file_path = write_excel_file(results, str(excel_path), "Test Playlist")
       
       try:
           import openpyxl
           wb = openpyxl.load_workbook(file_path)
           # Verify expected sheets exist
           expected_sheets = ["Main", "Candidates", "Queries"]
           for sheet_name in expected_sheets:
               if sheet_name in wb.sheetnames:
                   ws = wb[sheet_name]
                   assert ws.max_row >= 1  # At least header
       except ImportError:
           pytest.skip("openpyxl not available")
   ```

---

### Substep 4.3: UI Controller Tests - `ui/controllers/main_controller.py` (Detailed)

#### Class: `ProcessingWorker(QThread)`
**Lines to Cover**: 33-161 (approximate)

**Methods to Test**:

1. **`__init__(xml_path, playlist_name, settings, auto_research, parent)`**:
   ```python
   def test_processing_worker_init(qtbot):
       """Test ProcessingWorker initialization."""
       from cuepoint.ui.controllers.main_controller import ProcessingWorker
       
       worker = ProcessingWorker(
           xml_path="test.xml",
           playlist_name="Test Playlist",
           settings={"max_candidates": 10},
           auto_research=True
       )
       
       assert worker.xml_path == "test.xml"
       assert worker.playlist_name == "Test Playlist"
       assert worker.settings == {"max_candidates": 10}
       assert worker.auto_research is True
       assert worker.controller is not None
   ```

2. **`run()`** - Main worker execution:
   ```python
   @patch('cuepoint.ui.controllers.main_controller.get_container')
   @patch('cuepoint.services.processor_service.ProcessorService.process_playlist_from_xml')
   def test_processing_worker_run_success(qtbot, mock_process, mock_container):
       """Test ProcessingWorker.run() with successful processing."""
       from cuepoint.ui.controllers.main_controller import ProcessingWorker
       
       # Mock processor service
       mock_processor = Mock()
       mock_processor.process_playlist_from_xml.return_value = [TrackResult(...)]
       mock_container.return_value.get.return_value = mock_processor
       
       worker = ProcessingWorker("test.xml", "Test Playlist")
       
       # Connect signals
       results_received = []
       def on_complete(results):
           results_received.extend(results)
       worker.processing_complete.connect(on_complete)
       
       # Start worker
       worker.start()
       qtbot.waitUntil(lambda: worker.isFinished(), timeout=5000)
       
       # Verify processing called
       mock_processor.process_playlist_from_xml.assert_called_once()
       # Verify signal emitted
       assert len(results_received) > 0
   ```

3. **`run()` with Error**:
   ```python
   @patch('cuepoint.ui.controllers.main_controller.get_container')
   def test_processing_worker_run_error(qtbot, mock_container):
       """Test ProcessingWorker.run() with processing error."""
       from cuepoint.ui.controllers.main_controller import ProcessingWorker
       
       # Mock processor to raise error
       mock_processor = Mock()
       mock_processor.process_playlist_from_xml.side_effect = Exception("Processing error")
       mock_container.return_value.get.return_value = mock_processor
       
       worker = ProcessingWorker("test.xml", "Test Playlist")
       
       # Connect error signal
       error_received = []
       def on_error(error):
           error_received.append(error)
       worker.error_occurred.connect(on_error)
       
       worker.start()
       qtbot.waitUntil(lambda: worker.isFinished(), timeout=5000)
       
       # Verify error signal emitted
       assert len(error_received) > 0
   ```

4. **Progress Updates**:
   ```python
   @patch('cuepoint.ui.controllers.main_controller.get_container')
   def test_processing_worker_progress_updates(qtbot, mock_container):
       """Test ProcessingWorker emits progress updates."""
       from cuepoint.ui.controllers.main_controller import ProcessingWorker
       
       # Mock processor with progress callback
       mock_processor = Mock()
       def process_with_progress(*args, **kwargs):
           callback = kwargs.get('progress_callback')
           if callback:
               callback(1, 10, "Processing track 1")
               callback(5, 10, "Processing track 5")
           return [TrackResult(...)]
       mock_processor.process_playlist_from_xml.side_effect = process_with_progress
       mock_container.return_value.get.return_value = mock_processor
       
       worker = ProcessingWorker("test.xml", "Test Playlist")
       
       # Connect progress signal
       progress_updates = []
       def on_progress(progress_info):
           progress_updates.append(progress_info)
       worker.progress_updated.connect(on_progress)
       
       worker.start()
       qtbot.waitUntil(lambda: worker.isFinished(), timeout=5000)
       
       # Verify progress signals emitted
       assert len(progress_updates) > 0
   ```

#### Class: `GUIController(QObject)`
**Lines to Cover**: 162-420 (approximate)

**Methods to Test**:

1. **`__init__(services, parent=None)`**:
   ```python
   def test_gui_controller_init(qtbot, mock_services):
       """Test GUIController initialization."""
       from cuepoint.ui.controllers.main_controller import GUIController
       
       controller = GUIController(mock_services)
       
       assert controller._services == mock_services
       assert controller._worker is None
       # Verify signals created
       assert hasattr(controller, 'processing_started')
       assert hasattr(controller, 'processing_complete')
   ```

2. **`process_playlist(xml_path, playlist_name, settings, auto_research)`**:
   ```python
   @patch('cuepoint.ui.controllers.main_controller.ProcessingWorker')
   def test_gui_controller_process_playlist(qtbot, mock_worker_class, mock_services):
       """Test GUIController.process_playlist()."""
       from cuepoint.ui.controllers.main_controller import GUIController
       
       mock_worker = Mock()
       mock_worker.start = Mock()
       mock_worker.finished = Signal()
       mock_worker.error_occurred = Signal(object)
       mock_worker.processing_complete = Signal(list)
       mock_worker.progress_updated = Signal(object)
       mock_worker_class.return_value = mock_worker
       
       controller = GUIController(mock_services)
       
       # Connect signals to verify
       started_called = []
       def on_started():
           started_called.append(True)
       controller.processing_started.connect(on_started)
       
       controller.process_playlist("test.xml", "Test Playlist")
       
       # Verify worker created
       assert controller._worker is not None
       # Verify worker started
       mock_worker.start.assert_called_once()
       # Verify signal emitted
       assert len(started_called) > 0
   ```

3. **`process_playlist()` with Already Processing**:
   ```python
   @patch('cuepoint.ui.controllers.main_controller.ProcessingWorker')
   def test_gui_controller_process_playlist_already_processing(qtbot, mock_worker_class, mock_services):
       """Test GUIController.process_playlist() cancels existing processing."""
       from cuepoint.ui.controllers.main_controller import GUIController
       
       mock_worker1 = Mock()
       mock_worker1.isRunning.return_value = True
       mock_worker1.terminate = Mock()
       mock_worker1.wait = Mock()
       
       mock_worker2 = Mock()
       mock_worker2.start = Mock()
       mock_worker_class.side_effect = [mock_worker1, mock_worker2]
       
       controller = GUIController(mock_services)
       controller._worker = mock_worker1
       
       controller.process_playlist("test.xml", "Test Playlist")
       
       # Verify first worker terminated
       mock_worker1.terminate.assert_called_once()
       # Verify new worker created
       assert controller._worker == mock_worker2
   ```

4. **`cancel_processing()`**:
   ```python
   def test_gui_controller_cancel_processing(qtbot, mock_services):
       """Test GUIController.cancel_processing()."""
       from cuepoint.ui.controllers.main_controller import GUIController
       
       mock_worker = Mock()
       mock_worker.isRunning.return_value = True
       mock_worker.terminate = Mock()
       mock_worker.wait = Mock()
       
       controller = GUIController(mock_services)
       controller._worker = mock_worker
       
       controller.cancel_processing()
       
       # Verify worker terminated
       mock_worker.terminate.assert_called_once()
       # Verify worker cleaned up
       assert controller._worker is None
   ```

5. **`cancel_processing()` when Not Processing**:
   ```python
   def test_gui_controller_cancel_processing_not_running(qtbot, mock_services):
       """Test GUIController.cancel_processing() when not processing."""
       from cuepoint.ui.controllers.main_controller import GUIController
       
       controller = GUIController(mock_services)
       controller._worker = None
       
       # Should not raise error
       controller.cancel_processing()
       
       # Verify worker still None
       assert controller._worker is None
   ```

6. **`_on_worker_finished()`** - Worker completion handler:
   ```python
   def test_gui_controller_on_worker_finished(qtbot, mock_services):
       """Test GUIController._on_worker_finished()."""
       from cuepoint.ui.controllers.main_controller import GUIController
       
       mock_worker = Mock()
       mock_worker.results = [TrackResult(...)]
       
       controller = GUIController(mock_services)
       controller._worker = mock_worker
       
       # Connect signal to verify
       results_received = []
       def on_complete(results):
           results_received.extend(results)
       controller.processing_complete.connect(on_complete)
       
       controller._on_worker_finished()
       
       # Verify signal emitted
       assert len(results_received) > 0
       # Verify worker cleaned up
       assert controller._worker is None
   ```

7. **`_on_worker_error(error)`** - Worker error handler:
   ```python
   def test_gui_controller_on_worker_error(qtbot, mock_services):
       """Test GUIController._on_worker_error()."""
       from cuepoint.ui.controllers.main_controller import GUIController
       from cuepoint.ui.gui_interface import ProcessingError, ErrorType
       
       error = ProcessingError(
           error_type=ErrorType.PROCESSING_ERROR,
           message="Test error",
           details="Error details"
       )
       
       controller = GUIController(mock_services)
       controller._worker = Mock()
       
       # Connect signal to verify
       errors_received = []
       def on_error(err):
           errors_received.append(err)
       controller.error_occurred.connect(on_error)
       
       controller._on_worker_error(error)
       
       # Verify error signal emitted
       assert len(errors_received) > 0
       assert errors_received[0].message == "Test error"
       # Verify worker cleaned up
       assert controller._worker is None
   ```

8. **`_on_progress_update(progress_info)`** - Progress handler:
   ```python
   def test_gui_controller_on_progress_update(qtbot, mock_services):
       """Test GUIController._on_progress_update()."""
       from cuepoint.ui.controllers.main_controller import GUIController
       from cuepoint.ui.gui_interface import ProgressInfo
       
       progress_info = ProgressInfo(
           current=5,
           total=10,
           message="Processing track 5"
       )
       
       controller = GUIController(mock_services)
       
       # Connect signal to verify
       progress_received = []
       def on_progress(info):
           progress_received.append(info)
       controller.progress_updated.connect(on_progress)
       
       controller._on_progress_update(progress_info)
       
       # Verify progress signal emitted
       assert len(progress_received) > 0
       assert progress_received[0].current == 5
       assert progress_received[0].total == 10
   ```

---

## Line-by-Line Coverage Requirements

For each module, follow this process:

### Step 1: Generate Coverage Report
```bash
cd SRC
pytest --cov=cuepoint.[module] --cov-report=term-missing > coverage_[module].txt
```

### Step 2: Identify Missing Lines
Open `coverage_[module].txt` and look for lines like:
```
cuepoint/[module].py    540    134    75%   143, 145, 157, 172, 246, 444, ...
```

The numbers after the percentage are the **uncovered line numbers**.

### Step 3: Analyze Each Missing Line

For each uncovered line number:

1. **Read the source code** at that line:
   ```python
   # Line 143 in beatport.py
   if resp is None:
       return True
   ```

2. **Determine what test is needed**:
   - Line 143: `if resp is None:` → Need test where `resp` is `None`

3. **Write the test**:
   ```python
   def test_request_html_resp_none(mock_get):
       mock_get.return_value = None
       result = request_html("https://...")
       assert result is None  # Should trigger line 143
   ```

4. **Verify coverage**:
   ```bash
   pytest --cov=cuepoint.[module] --cov-report=term-missing
   # Check if line 143 is now covered
   ```

### Step 4: Group Related Lines

If multiple lines are in the same function/branch:
- Write one comprehensive test that covers all related lines
- Example: Lines 143-157 are all in `_is_empty_body()` → Write comprehensive test for that function

---

## Priority Matrix

| Module | Current % | Target % | Lines Missing | Priority | Effort | Impact |
|--------|-----------|----------|---------------|----------|--------|--------|
| `services/processor_service.py` | 16% | 80% | ~109 | 🔴 Critical | High | Very High |
| `services/export_service.py` | 17% | 80% | ~57 | 🔴 Critical | Medium | High |
| `services/output_writer.py` | 15% | 80% | ~306 | 🔴 Critical | High | Very High |
| `services/beatport_service.py` | 29% | 80% | ~27 | 🟡 High | Low | Medium |
| `services/config_service.py` | 46% | 80% | ~34 | 🟡 High | Low | Medium |
| `services/cache_service.py` | 43% | 80% | ~37 | 🟡 High | Low | Medium |
| `core/matcher.py` | 79% | 85% | ~6% | 🟡 High | Low | Low |
| `core/query_generator.py` | 84% | 85% | ~1% | 🟢 Medium | Very Low | Low |
| `core/mix_parser.py` | 71% | 80% | ~9% | 🟡 High | Low | Medium |
| `data/beatport.py` | 86% | 90% | ~4% | 🟢 Medium | Low | Low |
| `data/beatport_search.py` | 82% | 85% | ~3% | 🟢 Medium | Low | Low |
| `ui/controllers/*.py` | 0% | 70% | ~341 | 🟡 Medium | Medium | Medium |

**Priority Legend**:
- 🔴 Critical: Must complete for 80% target
- 🟡 High: Important for quality
- 🟢 Medium: Nice to have

---

## Test Implementation Checklist Template

For each function/method, create a checklist:

```markdown
### Function: `function_name()`
- [ ] **Basic Success Case**: Test with valid inputs
- [ ] **Empty Input**: Test with empty list/string/None
- [ ] **Invalid Input**: Test with wrong type/format
- [ ] **Edge Case 1**: [Specific edge case]
- [ ] **Edge Case 2**: [Specific edge case]
- [ ] **Error Handling**: Test exception paths
- [ ] **Boundary Conditions**: Test min/max values
- [ ] **Special Characters**: Test Unicode/special chars
- [ ] **Mock Dependencies**: Verify external calls mocked correctly
- [ ] **Return Value Verification**: Verify correct return type/value
- [ ] **Side Effects**: Verify any side effects (file creation, etc.)
```

---

## Success Metrics

- ✅ Overall coverage ≥ 80%
- ✅ Critical modules (services, core) ≥ 85%
- ✅ Data layer ≥ 85%
- ✅ UI business logic ≥ 70%
- ✅ All tests pass
- ✅ No critical gaps in coverage report
- ✅ All error paths tested
- ✅ All edge cases covered
- ✅ All conditional branches covered
- ✅ All exception handlers tested

