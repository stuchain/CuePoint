# Test Coverage Improvement Plan

## Current Status
- **Overall Coverage**: 51.07%
- **Target**: 80%
- **Gap**: ~29% (2,400+ statements)

## Priority Areas for Coverage Improvement

### 🔴 High Priority (Biggest Impact)

#### 1. `processor.py` - 1% Coverage (757/767 statements missed)
**Impact**: Largest single file gap
**Strategy**: 
- This is legacy code being replaced by `processor_service.py`
- **Recommendation**: Exclude from coverage or mark as deprecated
- If testing needed, focus on critical paths only

#### 2. `beatport_search.py` - 8% Coverage (275/299 statements missed)
**Impact**: Core functionality for Beatport search
**Strategy**:
- Test main entry points: `beatport_search_hybrid()`, `beatport_search_direct()`
- Mock browser automation (Playwright/Selenium)
- Test error handling and retry logic
- Test query generation and URL extraction

**Test File**: `src/tests/unit/data/test_beatport_search.py` (needs creation)

#### 3. `main_controller.py` - 39% Coverage (65/106 statements missed)
**Impact**: Core GUI controller logic
**Strategy**:
- Test worker creation and management
- Test signal connections
- Test cancellation logic
- Test error handling

**Test File**: `src/tests/unit/ui/controllers/test_main_controller.py` (needs expansion)

#### 4. `beatport.py` - 55% Coverage (234/517 statements missed)
**Impact**: Core Beatport data parsing
**Strategy**:
- Test `parse_track_page()` with various HTML structures
- Test `ddg_track_urls()` with mocked DuckDuckGo responses
- Test `track_urls()` function
- Test error handling and edge cases

**Test File**: `src/tests/unit/data/test_beatport.py` (needs expansion)

### 🟡 Medium Priority

#### 5. `output_writer.py` - 65% Coverage (128/362 statements missed)
**Strategy**:
- Test all export formats (CSV, JSON, Excel)
- Test compression options
- Test error handling
- Test edge cases (empty results, special characters)

**Test File**: `src/tests/unit/services/test_output_writer.py` (needs expansion)

#### 6. `main_window.py` - 45% Coverage (324/590 statements missed)
**Strategy**:
- Focus on business logic, not UI rendering
- Test menu actions
- Test dialog handling
- Test state management

**Test File**: `src/tests/ui/test_main_window.py` (needs expansion)

#### 7. `results_view.py` - 44% Coverage (490/881 statements missed)
**Strategy**:
- Test filtering logic (already partially covered)
- Test export functionality
- Test candidate selection
- Test batch mode handling

**Test File**: `src/tests/ui/test_results_view.py` (needs expansion)

### 🟢 Lower Priority (UI Code)

#### 8. UI Widgets (13-62% coverage)
**Strategy**:
- Focus on business logic, not rendering
- Test data handling
- Test user interactions (with mocks)
- Accept lower coverage for pure UI code

## Implementation Strategy

### Phase 1: Quick Wins (Target: +10% coverage)

1. **Exclude Legacy Code**
   ```ini
   [coverage:run]
   omit = 
       */processor.py
       */legacy/*
   ```

2. **Add Tests for Core Functions**
   - `beatport_search.py` main functions
   - `main_controller.py` core methods
   - `beatport.py` parsing functions

3. **Expand Existing Tests**
   - Add more edge cases to existing test files
   - Add error handling tests

### Phase 2: Systematic Coverage (Target: +15% coverage)

1. **Create Missing Test Files**
   - `test_beatport_search.py`
   - Expand `test_main_controller.py`
   - Expand `test_beatport.py`

2. **Add Integration Tests**
   - Test service interactions
   - Test end-to-end workflows

### Phase 3: Polish (Target: +4% coverage)

1. **UI Test Improvements**
   - Test business logic in UI components
   - Mock UI interactions

2. **Edge Case Coverage**
   - Error conditions
   - Boundary values
   - Invalid inputs

## Specific Test Files to Create/Expand

### New Test Files Needed

1. **`src/tests/unit/data/test_beatport_search.py`**
   ```python
   - test_beatport_search_hybrid()
   - test_beatport_search_direct()
   - test_beatport_search_via_api()
   - test_beatport_search_browser()
   - test_error_handling()
   - test_retry_logic()
   ```

2. **`src/tests/unit/ui/controllers/test_main_controller_expanded.py`**
   ```python
   - test_worker_creation()
   - test_signal_connections()
   - test_cancellation()
   - test_error_handling()
   - test_progress_updates()
   ```

### Files to Expand

1. **`src/tests/unit/data/test_beatport.py`**
   - Add tests for `ddg_track_urls()`
   - Add tests for `track_urls()`
   - Add tests for various HTML parsing scenarios
   - Add tests for error conditions

2. **`src/tests/unit/services/test_output_writer.py`**
   - Add tests for JSON export
   - Add tests for compression
   - Add tests for edge cases
   - Add tests for error handling

3. **`src/tests/ui/test_results_view.py`**
   - Add tests for batch mode
   - Add tests for candidate selection
   - Add tests for export from UI

## Coverage Exclusion Strategy

### Recommended Exclusions

```ini
[coverage:run]
omit = 
    # Legacy code being replaced
    */processor.py
    
    # UI rendering code (test business logic only)
    */ui/widgets/*.py
    
    # Exception classes (just definitions)
    */exceptions/*.py
    
    # Configuration (mostly data)
    */models/config.py
    
    # Utilities with minimal logic
    */utils/logger_helper.py
    */utils/error_handler.py
```

### Coverage Targets by Module Type

- **Services**: 90%+ (business logic)
- **Core Logic**: 85%+ (algorithms)
- **Data Access**: 75%+ (I/O operations)
- **UI Controllers**: 80%+ (business logic)
- **UI Widgets**: 60%+ (focus on logic, not rendering)
- **Legacy Code**: Exclude or mark deprecated

## Tools and Commands

### Generate Coverage Report
```bash
cd src
pytest --cov=cuepoint --cov-report=html --cov-report=term-missing
```

### View Coverage by File
```bash
pytest --cov=cuepoint --cov-report=term-missing | grep -E "cuepoint.*\s+\d+\s+\d+\s+\d+%"
```

### Find Untested Functions
```bash
# After running coverage, check htmlcov/index.html
# Or use coverage.py directly:
coverage report --show-missing
```

### Run Tests for Specific Module
```bash
# Test specific module
pytest tests/unit/data/test_beatport.py -v

# Test with coverage for specific module
pytest tests/unit/data/test_beatport.py --cov=cuepoint.data.beatport --cov-report=term-missing
```

## Expected Impact

### If We Exclude Legacy Code
- Current: 51.07%
- After exclusion: ~55-60% (processor.py is 767 statements)

### If We Add Core Tests
- `beatport_search.py`: +5-7% overall
- `main_controller.py`: +2-3% overall
- `beatport.py`: +3-5% overall
- `output_writer.py`: +2-3% overall

**Total Potential**: 65-75% coverage

### To Reach 80%
- Need additional UI tests
- Need edge case coverage
- Need integration tests

## Next Steps

1. **Immediate**: Exclude `processor.py` from coverage
2. **Week 1**: Create `test_beatport_search.py`
3. **Week 2**: Expand `test_beatport.py` and `test_main_controller.py`
4. **Week 3**: Add edge cases and error handling tests
5. **Week 4**: UI test improvements

## Notes

- **80% coverage is ambitious** for a project with significant UI code
- **Focus on business logic** rather than UI rendering
- **Legacy code** (`processor.py`) should be excluded or deprecated
- **Integration tests** can help cover complex interactions
- **Quality over quantity**: Better to have fewer, well-written tests than many shallow tests

