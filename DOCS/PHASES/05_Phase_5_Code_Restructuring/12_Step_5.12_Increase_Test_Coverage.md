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

