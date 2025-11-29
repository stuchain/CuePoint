# CLI Migration to Phase 5 Architecture - Design Document

## Executive Summary

This design document outlines the migration of the Command-Line Interface (CLI) from the legacy `processor.py` module to the new Phase 5 architecture. The migration will unify the codebase so both GUI and CLI use the same processing pipeline, reducing maintenance burden and ensuring consistency.

## Current Architecture

### CLI Entry Point (`main.py`)
```
main.py
  ├── Parse CLI arguments
  ├── Bootstrap services (✅ already done)
  ├── Apply configuration presets (uses SETTINGS dict ❌)
  ├── Call processor.run() (❌ legacy code)
  └── Exit
```

### Legacy Processor (`processor.py`)
```
processor.py
  ├── process_playlist() - Old implementation
  │   ├── Uses old data models (RBTrack, old TrackResult)
  │   ├── Direct service imports (not via DI)
  │   └── Mixed concerns (processing + CLI output)
  └── run() - CLI wrapper
      ├── Creates tqdm progress bar
      ├── Calls process_playlist()
      ├── Writes CSV files
      ├── Displays summary
      └── Handles unmatched tracks
```

### GUI Entry Point (Reference - Already Migrated)
```
gui_app.py
  ├── Bootstrap services (✅)
  └── MainWindow
      └── MainController
          └── ProcessingWorker
              └── ProcessorService.process_playlist_from_xml() (✅)
```

## Target Architecture

### CLI Entry Point (`main.py`)
```
main.py
  ├── Parse CLI arguments
  ├── Bootstrap services (✅)
  ├── Resolve services from DI container (✅)
  ├── Apply configuration presets (uses ConfigService ✅)
  ├── Create CLIProcessor (✅)
  └── Call CLIProcessor.process_playlist() (✅)
```

### New CLI Service Layer
```
cuepoint/cli/
  └── cli_processor.py
      └── CLIProcessor
          ├── Uses ProcessorService (via DI) ✅
          ├── Uses ExportService (via DI) ✅
          ├── Uses ConfigService (via DI) ✅
          ├── Uses LoggingService (via DI) ✅
          ├── CLI-specific concerns:
          │   ├── tqdm progress bars
          │   ├── File output orchestration
          │   ├── Summary statistics
          │   └── User prompts
          └── Delegates processing to ProcessorService
```

### Unified Processing Pipeline
```
Both GUI and CLI
  └── ProcessorService.process_playlist_from_xml()
      ├── Uses BeatportService (via DI)
      ├── Uses MatcherService (via DI)
      ├── Uses ConfigService (via DI)
      └── Uses LoggingService (via DI)
```

## Design Decisions

### Decision 1: Create Separate CLI Module
**Rationale:**
- Keeps CLI-specific concerns (progress bars, file output, prompts) separate from processing logic
- Follows Single Responsibility Principle
- Makes it easier to test CLI functionality independently
- Allows future CLI enhancements without affecting processing logic

**Alternative Considered:**
- Put CLI logic directly in `main.py`
- **Rejected**: Would make `main.py` too large and harder to test

### Decision 2: Use Existing Services
**Rationale:**
- `ProcessorService` already supports all needed functionality
- `ExportService` can handle file output
- `ConfigService` manages configuration
- No need to duplicate functionality

**Alternative Considered:**
- Create CLI-specific services
- **Rejected**: Would duplicate code and increase maintenance burden

### Decision 3: Maintain Backward Compatibility
**Rationale:**
- All existing CLI flags and features must work identically
- Users should not notice any difference in behavior
- Output files should be identical (format and content)

**Implementation:**
- Comprehensive regression testing
- Side-by-side output comparison
- Feature parity verification

### Decision 4: Gradual Migration
**Rationale:**
- Lower risk than big-bang migration
- Can test incrementally
- Easier to roll back if issues arise

**Implementation:**
- Phase 1: Create CLI module (no changes to main.py)
- Phase 2: Update main.py to use CLI module
- Phase 3: Test and validate
- Phase 4: Remove legacy code

## Component Specifications

### CLIProcessor Class

**Location:** `SRC/cuepoint/cli/cli_processor.py`

**Purpose:** Orchestrate CLI-specific processing workflow while delegating actual processing to `ProcessorService`.

**Dependencies:**
- `IProcessorService` (via DI)
- `IExportService` (via DI)
- `IConfigService` (via DI)
- `ILoggingService` (via DI)
- `tqdm` (for progress bars)
- `cuepoint.models.result.TrackResult`
- `cuepoint.ui.gui_interface.ProgressInfo`

**Public Interface:**
```python
class CLIProcessor:
    def __init__(
        self,
        processor_service: IProcessorService,
        export_service: IExportService,
        config_service: IConfigService,
        logging_service: ILoggingService,
    ) -> None:
        """Initialize CLI processor with required services."""
    
    def process_playlist(
        self,
        xml_path: str,
        playlist_name: str,
        out_csv_base: str,
        auto_research: bool = False,
    ) -> None:
        """
        Process playlist and generate output files.
        
        This is the main entry point for CLI processing.
        It orchestrates the entire workflow:
        1. Creates progress callback
        2. Processes playlist via ProcessorService
        3. Writes output files via ExportService
        4. Displays summary statistics
        5. Handles unmatched tracks
        """
```

**Private Methods:**
- `_create_progress_callback() -> Callable[[ProgressInfo], None]`
- `_get_settings_dict() -> Dict[str, Any]`
- `_write_output_files(results: List[TrackResult], out_csv_base: str) -> Dict[str, Path]`
- `_get_review_indices(results: List[TrackResult]) -> set`
- `_write_review_files(...) -> Dict[str, Path]`
- `_display_summary(results: List[TrackResult], output_files: Dict[str, Path]) -> None`
- `_handle_unmatched_tracks(results: List[TrackResult]) -> None`
- `_handle_processing_error(error: Exception, xml_path: str, playlist_name: str) -> None`

### Updated main.py

**Changes:**
1. **Imports:**
   - Remove: `from cuepoint.services.processor import run`
   - Remove: `from cuepoint.models.config import SETTINGS`
   - Add: `from cuepoint.cli.cli_processor import CLIProcessor`
   - Add: Service interface imports for DI

2. **Configuration Handling:**
   - Replace `SETTINGS.update()` with `config_service.set()`
   - Replace `SETTINGS["KEY"]` with `config_service.get("KEY")`
   - Update YAML loading to use `config_service.load()`

3. **Main Function:**
   - Resolve services from DI container
   - Create `CLIProcessor` instance
   - Call `cli_processor.process_playlist()` instead of `processor.run()`

### ExportService Enhancements

**Current State:**
- Supports `export_to_csv()` and `export_to_json()`
- May need enhancements for review file generation

**Potential Enhancements:**
- `export_candidates_csv()` - Export candidates data
- `export_queries_csv()` - Export queries data
- `export_review_csv()` - Export review tracks only
- Support for multiple file outputs in single call

**Decision:** Evaluate during implementation - may be able to use existing methods with filtering.

## Data Flow

### Processing Flow
```
1. User runs: python main.py --xml file.xml --playlist "My Playlist"
2. main.py:
   - Parses arguments
   - Bootstraps services
   - Resolves services from DI
   - Applies configuration presets
   - Creates CLIProcessor
   - Calls cli_processor.process_playlist()

3. CLIProcessor.process_playlist():
   - Creates progress callback (tqdm)
   - Calls processor_service.process_playlist_from_xml()
     - ProcessorService processes tracks
     - Emits progress via callback
     - Returns List[TrackResult]
   - Writes output files via export_service
   - Displays summary
   - Handles unmatched tracks

4. Exit with appropriate code
```

### Configuration Flow
```
1. CLI arguments parsed
2. YAML config loaded (if --config specified)
   - config_service.load(yaml_path)
3. Configuration presets applied (--fast, --turbo, etc.)
   - config_service.set("KEY", value)
4. Settings passed to ProcessorService
   - CLIProcessor._get_settings_dict() converts to dict
   - Passed to processor_service.process_playlist_from_xml(settings=...)
```

### File Output Flow
```
1. Processing completes → List[TrackResult]
2. CLIProcessor._write_output_files():
   - Main CSV: export_service.export_to_csv(results, main_path)
   - Candidates CSV: export_service.export_to_csv(candidates_data, candidates_path)
   - Queries CSV: export_service.export_to_csv(queries_data, queries_path)
   - Review CSV: export_service.export_to_csv(review_results, review_path)
   - Review candidates/queries: Similar pattern
3. File paths returned for summary display
```

## Error Handling Strategy

### Error Types
1. **File Not Found**: XML file doesn't exist
2. **Playlist Not Found**: Playlist name not in XML
3. **XML Parse Error**: Invalid XML format
4. **Processing Error**: Error during track processing
5. **Export Error**: Error writing output files
6. **Configuration Error**: Invalid configuration

### Error Handling Approach
- Use `ErrorHandler` for consistent error messages
- Convert `ProcessingError` exceptions to user-friendly CLI messages
- Use `LoggingService` for error logging
- Maintain existing error message format for backward compatibility
- Exit with appropriate exit codes (0 = success, 1 = error)

## Testing Strategy

### Unit Tests
**File:** `SRC/tests/unit/cli/test_cli_processor.py`

**Test Cases:**
- `test_initialization()` - Verify services are injected correctly
- `test_process_playlist_success()` - Test successful processing
- `test_process_playlist_file_not_found()` - Test file error handling
- `test_process_playlist_playlist_not_found()` - Test playlist error handling
- `test_progress_callback_creation()` - Test tqdm integration
- `test_progress_callback_updates()` - Test progress bar updates
- `test_review_indices_calculation()` - Test review logic
- `test_output_file_generation()` - Test file writing
- `test_summary_display()` - Test summary statistics
- `test_unmatched_tracks_handling()` - Test unmatched track handling
- `test_error_handling()` - Test error conversion

### Integration Tests
**File:** `SRC/tests/integration/test_cli_migration.py`

**Test Cases:**
- `test_cli_processor_uses_di_services()` - Verify DI integration
- `test_cli_workflow_integration()` - Test full workflow
- `test_configuration_presets()` - Test preset application
- `test_yaml_config_loading()` - Test YAML config loading
- `test_auto_research_functionality()` - Test auto-research
- `test_output_file_generation()` - Test all output files
- `test_error_scenarios()` - Test various error cases

### Regression Tests
**File:** `SRC/tests/regression/test_cli_output_comparison.py`

**Test Cases:**
- Compare output files (old vs. new CLI)
- Verify file formats are identical
- Verify file contents are identical
- Verify summary statistics match
- Verify error messages match

### Manual Testing Checklist
- [ ] Test all CLI flags (--fast, --turbo, --myargs, etc.)
- [ ] Test with various XML files
- [ ] Test with various playlist names
- [ ] Test error scenarios (invalid XML, missing playlist)
- [ ] Test configuration file loading
- [ ] Test auto-research functionality
- [ ] Verify output files are created correctly
- [ ] Verify progress bar displays correctly
- [ ] Verify summary statistics are accurate
- [ ] Compare output with old CLI (regression)

## Migration Plan

### Phase 1: Preparation (1 day)
- [ ] Create `cuepoint/cli/` directory structure
- [ ] Create `cuepoint/cli/__init__.py`
- [ ] Review existing `processor.run()` implementation
- [ ] Document all CLI features and flags
- [ ] Create test cases for regression testing

### Phase 2: Implement CLIProcessor (2-3 days)
- [ ] Implement `CLIProcessor` class skeleton
- [ ] Implement `__init__()` with service injection
- [ ] Implement `process_playlist()` method
- [ ] Implement `_create_progress_callback()` with tqdm
- [ ] Implement `_write_output_files()` using ExportService
- [ ] Implement `_get_review_indices()` logic
- [ ] Implement `_write_review_files()` logic
- [ ] Implement `_display_summary()` method
- [ ] Implement `_handle_unmatched_tracks()` method
- [ ] Implement `_handle_processing_error()` method
- [ ] Write unit tests for CLIProcessor

### Phase 3: Update main.py (1-2 days)
- [ ] Update imports in `main.py`
- [ ] Replace `SETTINGS` usage with `ConfigService`
- [ ] Update configuration preset application
- [ ] Update YAML config loading
- [ ] Update main function to use CLIProcessor
- [ ] Update error handling
- [ ] Test configuration handling

### Phase 4: Testing & Validation (2-3 days)
- [ ] Run unit tests
- [ ] Run integration tests
- [ ] Run regression tests
- [ ] Manual testing of all CLI flags
- [ ] Side-by-side comparison with old CLI
- [ ] Performance testing
- [ ] Error scenario testing
- [ ] Fix any issues found

### Phase 5: Cleanup & Documentation (1 day)
- [ ] Add deprecation warnings to `processor.run()`
- [ ] Update CLI usage documentation
- [ ] Update architecture diagrams
- [ ] Create migration guide
- [ ] Update developer documentation
- [ ] (Optional) Remove `processor.py` after verification period

## Risk Assessment

### Risk 1: Breaking Changes
**Probability:** Medium  
**Impact:** High  
**Mitigation:**
- Comprehensive regression testing
- Side-by-side output comparison
- Feature parity verification
- Gradual migration with rollback plan

### Risk 2: Configuration Migration Issues
**Probability:** Medium  
**Impact:** Medium  
**Mitigation:**
- Maintain backward compatibility during transition
- Provide migration script if needed
- Clear documentation of changes
- Test all configuration presets

### Risk 3: Performance Regression
**Probability:** Low  
**Impact:** Medium  
**Mitigation:**
- Performance benchmarks before/after
- Profile critical paths
- Optimize if needed
- Monitor memory usage

### Risk 4: Missing Features
**Probability:** Low  
**Impact:** High  
**Mitigation:**
- Detailed feature audit
- Test all CLI flags
- User acceptance testing
- Comprehensive test coverage

### Risk 5: ExportService Limitations
**Probability:** Medium  
**Impact:** Low  
**Mitigation:**
- Evaluate ExportService capabilities early
- Extend ExportService if needed
- Alternative: Implement file writing in CLIProcessor (temporary)

## Success Metrics

1. **Functionality:**
   - ✅ All CLI flags work identically
   - ✅ Output files are identical (format and content)
   - ✅ Error messages are user-friendly
   - ✅ Performance is maintained or improved

2. **Code Quality:**
   - ✅ >80% test coverage for CLI code
   - ✅ No code duplication
   - ✅ Clean separation of concerns
   - ✅ Type hints throughout

3. **Architecture:**
   - ✅ CLI uses DI container
   - ✅ CLI uses service layer
   - ✅ Single source of truth for processing
   - ✅ GUI and CLI share same codebase

4. **Maintainability:**
   - ✅ Easy to add new CLI features
   - ✅ Easy to modify processing logic (affects both GUI and CLI)
   - ✅ Clear code organization
   - ✅ Comprehensive documentation

## Timeline

**Total Duration:** 5-7 days

- **Day 1:** Preparation and CLIProcessor skeleton
- **Day 2-3:** Implement CLIProcessor methods
- **Day 4:** Update main.py and configuration handling
- **Day 5-6:** Testing and validation
- **Day 7:** Cleanup and documentation

## Dependencies

- ✅ Phase 5.2: Dependency Injection (completed)
- ✅ Phase 5.8: Configuration Management (completed)
- ✅ Phase 5.9: Data Models (completed)
- ✅ GUI Migration (completed - can use as reference)

## Related Documentation

- `11_Step_5.11_CLI_Migration.md`: Implementation guide
- `02_Step_5.2_Dependency_Injection_Service_Layer.md`: DI usage
- `08_Step_5.8_Configuration_Management.md`: ConfigService usage
- `09_Step_5.9_Refactor_Data_Models.md`: Data models
- `SRC/cuepoint/ui/controllers/main_controller.py`: GUI reference

## Open Questions

1. **ExportService Enhancements:**
   - Does ExportService support candidates/queries export?
   - Do we need to extend ExportService or implement in CLIProcessor?

2. **Settings Dictionary:**
   - How to convert ConfigService settings to dict for ProcessorService?
   - Should ProcessorService accept ConfigService directly?

3. **Progress Callback:**
   - Should progress callback be abstracted further?
   - Can we reuse progress callback logic between GUI and CLI?

4. **Legacy Code Removal:**
   - When to remove `processor.py`?
   - Should we keep it as deprecated for a grace period?

## Next Steps

1. Review and approve this design
2. Create implementation task list
3. Start Phase 1: Preparation
4. Implement incrementally with testing at each step
5. Validate with regression testing
6. Deploy and monitor

