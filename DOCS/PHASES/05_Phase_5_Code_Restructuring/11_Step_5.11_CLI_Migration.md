# Step 5.11: CLI Migration to Phase 5 Architecture

## Overview

This step migrates the Command-Line Interface (CLI) from the legacy `processor.py` module to use the new Phase 5 architecture with dependency injection, service layer, and new data models.

## Goals

1. **Migrate CLI to Phase 5 Architecture**: Replace direct calls to `processor.run()` with `ProcessorService` from the DI container
2. **Unify Code Paths**: Ensure both GUI and CLI use the same processing pipeline
3. **Maintain CLI Features**: Preserve all existing CLI functionality (progress bars, file output, auto-research, etc.)
4. **Remove Legacy Code**: Deprecate or remove the old `processor.py` module after migration
5. **Improve Maintainability**: Single source of truth for processing logic

## Current State

### CLI Entry Point (`main.py`)
- ✅ Bootstraps services (`bootstrap_services()`)
- ❌ Uses old `processor.run()` function
- ❌ Bypasses DI container and service layer
- ❌ Uses old `SETTINGS` dictionary directly

### Legacy Processor (`processor.py`)
- ❌ Contains `process_playlist()` function (old implementation)
- ❌ Contains `run()` function (CLI wrapper)
- ❌ Uses old data models (`RBTrack`, old `TrackResult`)
- ❌ Directly imports and uses services (not via DI)
- ❌ Mixed concerns (processing + CLI output + file writing)

### GUI Entry Point (`gui_app.py`)
- ✅ Bootstraps services
- ✅ Uses `ProcessorService` from DI container
- ✅ Uses new data models
- ✅ Clean separation of concerns

## Target State

### CLI Entry Point (`main.py`)
- ✅ Bootstraps services
- ✅ Uses `ProcessorService.process_playlist_from_xml()` from DI container
- ✅ Uses `ConfigService` for configuration management
- ✅ Uses `ExportService` for file output
- ✅ Uses `LoggingService` for logging
- ✅ Maintains all existing CLI features

### New CLI Service Layer
- ✅ `CLIProcessor` class: Handles CLI-specific concerns (progress bars, file output, user prompts)
- ✅ Uses `ProcessorService` for actual processing
- ✅ Uses `ExportService` for CSV/JSON export
- ✅ Uses `ConfigService` for configuration
- ✅ Clean separation: CLI concerns vs. processing logic

### Legacy Code Removal
- ⚠️ `processor.py` can be deprecated/removed after migration
- ⚠️ Old `SETTINGS` dictionary can be removed (replaced by `ConfigService`)

## Architecture Design

### High-Level Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    CLI Entry Point (main.py)                │
│  - Parse command-line arguments                              │
│  - Bootstrap services                                        │
│  - Apply configuration presets                              │
│  - Create CLIProcessor                                       │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                  CLIProcessor (New Class)                    │
│  - CLI-specific progress callbacks (tqdm)                    │
│  - File output orchestration                                 │
│  - User prompts (auto-research)                             │
│  - Summary statistics                                        │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       │ Uses
                       ▼
┌─────────────────────────────────────────────────────────────┐
│              ProcessorService (via DI)                       │
│  - process_playlist_from_xml()                              │
│  - Uses: BeatportService, MatcherService, etc.              │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       │ Uses
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                  ExportService (via DI)                      │
│  - export_to_csv()                                           │
│  - export_to_json()                                          │
│  - Review file generation                                    │
└─────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

#### 1. `main.py` (CLI Entry Point)
**Responsibilities:**
- Parse command-line arguments
- Bootstrap services
- Apply configuration presets (--fast, --turbo, --myargs, etc.)
- Create and configure `CLIProcessor`
- Handle startup errors

**Changes:**
- Remove: `from cuepoint.services.processor import run`
- Add: `from cuepoint.cli.cli_processor import CLIProcessor`
- Add: Use `ConfigService` instead of `SETTINGS` dictionary
- Update: Configuration preset application to use `ConfigService.set()`

#### 2. `CLIProcessor` (New Class)
**Location:** `SRC/cuepoint/cli/cli_processor.py`

**Responsibilities:**
- Orchestrate CLI processing workflow
- Create CLI-specific progress callbacks (tqdm integration)
- Handle file output (using `ExportService`)
- Display summary statistics
- Handle unmatched tracks (prompts or auto-research)
- Error handling and user-friendly messages

**Interface:**
```python
class CLIProcessor:
    def __init__(
        self,
        processor_service: IProcessorService,
        export_service: IExportService,
        config_service: IConfigService,
        logging_service: ILoggingService,
    ):
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
        
        Args:
            xml_path: Path to Rekordbox XML file
            playlist_name: Name of playlist to process
            out_csv_base: Base filename for output CSV files
            auto_research: If True, auto-research unmatched tracks
        """
```

**Key Methods:**
- `_create_progress_callback()`: Creates tqdm progress bar callback
- `_write_output_files()`: Orchestrates file writing using `ExportService`
- `_generate_review_files()`: Creates review-specific CSV files
- `_handle_unmatched_tracks()`: Handles unmatched tracks (prompt or auto-research)
- `_display_summary()`: Displays processing summary statistics

#### 3. `ProcessorService` (Existing)
**No changes needed** - already supports:
- `process_playlist_from_xml()` method
- Progress callbacks
- Processing controller (cancellation)
- Auto-research support

#### 4. `ExportService` (Existing)
**May need enhancements:**
- Review file generation (if not already supported)
- Multiple file output (main, candidates, queries, review variants)
- Timestamp handling

#### 5. `ConfigService` (Existing)
**No changes needed** - already supports:
- Configuration loading from file
- Configuration presets
- Setting overrides

## Implementation Plan

### Phase 1: Create CLI Service Layer (2-3 days)

#### Step 1.1: Create CLI Module Structure
- Create `SRC/cuepoint/cli/` directory
- Create `SRC/cuepoint/cli/__init__.py`
- Create `SRC/cuepoint/cli/cli_processor.py`

#### Step 1.2: Implement `CLIProcessor` Class
- Implement `__init__()` with service injection
- Implement `process_playlist()` method
- Implement `_create_progress_callback()` with tqdm integration
- Implement basic error handling

#### Step 1.3: Extract File Output Logic
- Move file writing logic from `processor.run()` to `CLIProcessor`
- Use `ExportService` for CSV export
- Handle review file generation
- Handle timestamp generation

#### Step 1.4: Extract Summary Statistics
- Move summary calculation logic to `CLIProcessor`
- Implement `_display_summary()` method
- Format output for console

### Phase 2: Update CLI Entry Point (1-2 days)

#### Step 2.1: Update `main.py` Imports
- Remove: `from cuepoint.services.processor import run`
- Add: `from cuepoint.cli.cli_processor import CLIProcessor`
- Add: Service imports from DI container

#### Step 2.2: Update Configuration Handling
- Replace `SETTINGS` dictionary usage with `ConfigService`
- Update preset application to use `ConfigService.set()`
- Update YAML config loading to use `ConfigService.load()`

#### Step 2.3: Update Main Function
- Resolve services from DI container
- Create `CLIProcessor` instance
- Call `cli_processor.process_playlist()` instead of `processor.run()`

#### Step 2.4: Update Error Handling
- Use `ErrorHandler` for consistent error messages
- Use `LoggingService` for logging
- Maintain user-friendly CLI error messages

### Phase 3: Testing & Validation (2-3 days)

#### Step 3.1: Unit Tests
- Test `CLIProcessor` initialization
- Test progress callback creation
- Test file output orchestration
- Test summary statistics calculation
- Test error handling

#### Step 3.2: Integration Tests
- Test full CLI workflow (argument parsing → processing → output)
- Test configuration preset application
- Test YAML config loading
- Test auto-research functionality
- Test review file generation

#### Step 3.3: Manual Testing
- Test all CLI flags (--fast, --turbo, --myargs, etc.)
- Test with various XML files and playlists
- Test error scenarios (invalid XML, missing playlist, etc.)
- Test output file generation
- Compare output with old CLI (regression testing)

#### Step 3.4: Performance Testing
- Ensure no performance regression
- Compare processing times (old vs. new)
- Verify memory usage is acceptable

### Phase 4: Cleanup & Documentation (1 day)

#### Step 4.1: Deprecate Legacy Code
- Add deprecation warnings to `processor.run()`
- Document migration path
- Create migration guide

#### Step 4.2: Update Documentation
- Update CLI usage documentation
- Update architecture diagrams
- Update developer guide

#### Step 4.3: Remove Legacy Code (Optional)
- Remove `processor.py` (after verification period)
- Remove old `SETTINGS` dictionary
- Clean up unused imports

## Detailed Implementation

### CLIProcessor Class Implementation

```python
"""
CLI Processor - Handles CLI-specific processing concerns.

This class orchestrates the CLI workflow, including progress display,
file output, and user interaction, while delegating actual processing
to ProcessorService.
"""

from typing import Optional, Dict, Any, List
from pathlib import Path
from tqdm import tqdm

from cuepoint.services.interfaces import (
    IProcessorService,
    IExportService,
    IConfigService,
    ILoggingService,
)
from cuepoint.models.result import TrackResult
from cuepoint.ui.gui_interface import ProgressInfo, ProcessingController


class CLIProcessor:
    """CLI processor that orchestrates playlist processing for command-line use."""
    
    def __init__(
        self,
        processor_service: IProcessorService,
        export_service: IExportService,
        config_service: IConfigService,
        logging_service: ILoggingService,
    ):
        """Initialize CLI processor with required services.
        
        Args:
            processor_service: Service for processing playlists
            export_service: Service for exporting results
            config_service: Service for configuration management
            logging_service: Service for logging
        """
        self.processor_service = processor_service
        self.export_service = export_service
        self.config_service = config_service
        self.logging_service = logging_service
        self.controller = ProcessingController()
    
    def process_playlist(
        self,
        xml_path: str,
        playlist_name: str,
        out_csv_base: str,
        auto_research: bool = False,
    ) -> None:
        """Process playlist and generate output files.
        
        Args:
            xml_path: Path to Rekordbox XML file
            playlist_name: Name of playlist to process
            out_csv_base: Base filename for output CSV files
            auto_research: If True, auto-research unmatched tracks
        """
        # Create progress callback
        progress_callback = self._create_progress_callback()
        
        # Process playlist
        try:
            results = self.processor_service.process_playlist_from_xml(
                xml_path=xml_path,
                playlist_name=playlist_name,
                settings=self._get_settings_dict(),
                progress_callback=progress_callback,
                controller=self.controller,
                auto_research=auto_research,
            )
        except Exception as e:
            self._handle_processing_error(e, xml_path, playlist_name)
            return
        finally:
            # Close progress bar if it exists
            if hasattr(self, '_pbar') and self._pbar:
                self._pbar.close()
        
        # Write output files
        output_files = self._write_output_files(results, out_csv_base)
        
        # Display summary
        self._display_summary(results, output_files)
        
        # Handle unmatched tracks
        if not auto_research:
            self._handle_unmatched_tracks(results)
    
    def _create_progress_callback(self):
        """Create CLI progress callback with tqdm integration."""
        self._pbar = None
        
        def callback(progress_info: ProgressInfo):
            if self._pbar is None:
                self._pbar = tqdm(
                    total=progress_info.total_tracks,
                    desc="Processing tracks",
                    unit="track",
                    bar_format="{l_bar}{bar}| {n_fmt}/{total_fmt} [{elapsed}<{remaining}, {rate_fmt}]",
                )
            
            self._pbar.n = progress_info.completed_tracks
            self._pbar.refresh()
            
            current_track = progress_info.current_track
            title = current_track.get("title", "") if current_track else ""
            if len(title) > 30:
                title = title[:30] + "..."
            
            self._pbar.set_postfix({
                "matched": progress_info.matched_count,
                "unmatched": progress_info.unmatched_count,
                "current": title or f"Track {progress_info.completed_tracks}",
            })
        
        return callback
    
    def _get_settings_dict(self) -> Dict[str, Any]:
        """Get settings dictionary from ConfigService."""
        # Convert ConfigService settings to dict format
        # This maintains compatibility with ProcessorService interface
        settings = {}
        # Map ConfigService keys to settings dict
        # Implementation depends on ConfigService API
        return settings
    
    def _write_output_files(
        self,
        results: List[TrackResult],
        out_csv_base: str,
    ) -> Dict[str, Path]:
        """Write output files using ExportService.
        
        Returns:
            Dictionary mapping file type to file path
        """
        output_dir = Path("output")
        output_dir.mkdir(exist_ok=True)
        
        # Generate timestamped filename
        from cuepoint.utils.utils import with_timestamp
        base_filename = with_timestamp(out_csv_base)
        
        output_files = {}
        
        # Write main CSV file
        main_path = output_dir / f"{base_filename}.csv"
        self.export_service.export_to_csv(results, main_path)
        output_files["main"] = main_path
        
        # Write candidates file
        candidates_path = output_dir / f"{base_filename}_candidates.csv"
        # Use ExportService to write candidates
        # (May need to extend ExportService for this)
        output_files["candidates"] = candidates_path
        
        # Write queries file
        queries_path = output_dir / f"{base_filename}_queries.csv"
        # Use ExportService to write queries
        output_files["queries"] = queries_path
        
        # Write review files
        review_indices = self._get_review_indices(results)
        if review_indices:
            review_files = self._write_review_files(
                results, review_indices, base_filename, output_dir
            )
            output_files.update(review_files)
        
        return output_files
    
    def _get_review_indices(self, results: List[TrackResult]) -> set:
        """Get indices of tracks that need review."""
        review_indices = set()
        for result in results:
            needs_review = False
            
            if result.match_score and result.match_score < 70:
                needs_review = True
            if result.artist_sim and result.artist_sim < 35:
                needs_review = True
            if not result.matched or not result.beatport_url:
                needs_review = True
            
            if needs_review:
                review_indices.add(result.playlist_index)
        
        return review_indices
    
    def _write_review_files(
        self,
        results: List[TrackResult],
        review_indices: set,
        base_filename: str,
        output_dir: Path,
    ) -> Dict[str, Path]:
        """Write review-specific files."""
        review_results = [
            r for r in results if r.playlist_index in review_indices
        ]
        
        review_files = {}
        
        # Write review CSV
        review_path = output_dir / f"{base_filename}_review.csv"
        self.export_service.export_to_csv(review_results, review_path)
        review_files["review"] = review_path
        
        # Write review candidates
        # (Implementation depends on ExportService capabilities)
        
        # Write review queries
        # (Implementation depends on ExportService capabilities)
        
        return review_files
    
    def _display_summary(
        self,
        results: List[TrackResult],
        output_files: Dict[str, Path],
    ) -> None:
        """Display processing summary statistics."""
        total = len(results)
        matched = sum(1 for r in results if r.matched)
        unmatched = total - matched
        
        self.logging_service.info(f"\nDone. Processed {total} tracks")
        self.logging_service.info(f"Matched: {matched}, Unmatched: {unmatched}")
        
        if output_files.get("main"):
            self.logging_service.info(f"Main results: {output_files['main']}")
        if output_files.get("candidates"):
            self.logging_service.info(f"Candidates: {output_files['candidates']}")
        if output_files.get("queries"):
            self.logging_service.info(f"Queries: {output_files['queries']}")
        if output_files.get("review"):
            review_count = len([
                r for r in results if r.playlist_index in self._get_review_indices(results)
            ])
            self.logging_service.info(f"Review list ({review_count} tracks): {output_files['review']}")
    
    def _handle_unmatched_tracks(self, results: List[TrackResult]) -> None:
        """Handle unmatched tracks (display and prompt for re-search)."""
        unmatched = [r for r in results if not r.matched]
        if not unmatched:
            return
        
        self.logging_service.warning(f"\n{'=' * 80}")
        self.logging_service.warning(f"Found {len(unmatched)} unmatched track(s):")
        self.logging_service.warning(f"{'=' * 80}")
        
        for result in unmatched:
            artists = result.artist or "(no artists)"
            self.logging_service.warning(
                f"  [{result.playlist_index}] {result.title} - {artists}"
            )
        
        # Prompt for re-search (if not auto-research)
        # Implementation depends on desired UX
    
    def _handle_processing_error(
        self,
        error: Exception,
        xml_path: str,
        playlist_name: str,
    ) -> None:
        """Handle processing errors with user-friendly messages."""
        from cuepoint.utils.errors import (
            error_file_not_found,
            error_playlist_not_found,
            print_error,
        )
        from cuepoint.exceptions.cuepoint_exceptions import ProcessingError, ErrorType
        
        if isinstance(error, ProcessingError):
            if error.error_type == ErrorType.FILE_NOT_FOUND:
                print_error(error_file_not_found(xml_path, "XML", "Check the --xml file path"))
            elif error.error_type == ErrorType.PLAYLIST_NOT_FOUND:
                print_error(error_playlist_not_found(playlist_name, []))
            else:
                print_error(f"Processing error: {error.message}", exit_code=None)
        else:
            # Handle unexpected errors
            self.logging_service.error(f"Unexpected error: {error}")
            print_error(f"Unexpected error: {error}", exit_code=None)
```

### Updated `main.py` Implementation

```python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
CLI entry point for Rekordbox → Beatport metadata enricher

Migrated to use Phase 5 architecture with dependency injection.
"""

import argparse
import sys
import os

# Add src to path for imports
if __name__ == "__main__":
    src_path = os.path.dirname(os.path.abspath(__file__))
    if src_path not in sys.path:
        sys.path.insert(0, src_path)

from cuepoint.utils.di_container import get_container
from cuepoint.services.interfaces import (
    IProcessorService,
    IExportService,
    IConfigService,
    ILoggingService,
)
from cuepoint.cli.cli_processor import CLIProcessor
from cuepoint.utils.errors import (
    error_file_not_found,
    error_config_invalid,
    error_missing_dependency,
    print_error,
)
from cuepoint.utils.utils import startup_banner
from cuepoint.services.bootstrap import bootstrap_services


def main():
    """Main CLI entry point."""
    # Bootstrap services (dependency injection setup)
    bootstrap_services()
    
    # Get services from DI container
    container = get_container()
    processor_service = container.resolve(IProcessorService)  # type: ignore
    export_service = container.resolve(IExportService)  # type: ignore
    config_service = container.resolve(IConfigService)  # type: ignore
    logging_service = container.resolve(ILoggingService)  # type: ignore
    
    # Create CLI processor
    cli_processor = CLIProcessor(
        processor_service=processor_service,
        export_service=export_service,
        config_service=config_service,
        logging_service=logging_service,
    )
    
    # Parse command-line arguments
    args = _parse_arguments()
    
    # Load configuration from YAML file if specified
    if args.config:
        _load_config_file(args.config, config_service)
    
    # Apply configuration presets
    _apply_presets(args, config_service)
    
    # Display startup banner
    startup_banner(sys.argv[0], args)
    
    # Process playlist
    cli_processor.process_playlist(
        xml_path=args.xml,
        playlist_name=args.playlist,
        out_csv_base=args.out,
        auto_research=args.auto_research,
    )


def _parse_arguments() -> argparse.Namespace:
    """Parse command-line arguments."""
    ap = argparse.ArgumentParser(
        description="Enrich Rekordbox playlist with Beatport metadata"
    )
    
    # Required arguments
    ap.add_argument("--xml", required=True, help="Path to Rekordbox XML export file")
    ap.add_argument("--playlist", required=True, help="Playlist name in the XML file")
    ap.add_argument("--out", default="beatport_enriched.csv", help="Output CSV base name")
    
    # Performance presets
    ap.add_argument("--fast", action="store_true", help="Faster defaults")
    ap.add_argument("--turbo", action="store_true", help="Maximum speed")
    ap.add_argument("--exhaustive", action="store_true", help="Maximum accuracy")
    ap.add_argument("--all-queries", action="store_true", help="Run all query variations")
    ap.add_argument("--myargs", action="store_true", help="Ultra-aggressive preset")
    
    # Logging options
    ap.add_argument("--verbose", action="store_true", help="Verbose logs")
    ap.add_argument("--trace", action="store_true", help="Very detailed logs")
    
    # Configuration
    ap.add_argument("--config", type=str, default=None, help="Path to YAML configuration file")
    ap.add_argument("--seed", type=int, default=0, help="Random seed for determinism")
    ap.add_argument("--auto-research", action="store_true", help="Auto-research unmatched tracks")
    
    return ap.parse_args()


def _load_config_file(config_path: str, config_service: IConfigService) -> None:
    """Load configuration from YAML file."""
    try:
        config_service.load(config_path)
        print(f"Loaded configuration from: {config_path}")
    except FileNotFoundError:
        print_error(error_file_not_found(config_path, "Configuration", "Check the --config file path"))
    except Exception as e:
        print_error(error_config_invalid(config_path, e))


def _apply_presets(args: argparse.Namespace, config_service: IConfigService) -> None:
    """Apply configuration presets based on CLI flags."""
    if args.fast:
        config_service.set("MAX_SEARCH_RESULTS", 12)
        config_service.set("CANDIDATE_WORKERS", 8)
        config_service.set("TRACK_WORKERS", 4)
        config_service.set("PER_TRACK_TIME_BUDGET_SEC", 15)
        config_service.set("ENABLE_CACHE", True)
    
    if args.turbo:
        config_service.set("MAX_SEARCH_RESULTS", 12)
        config_service.set("CANDIDATE_WORKERS", 12)
        config_service.set("TRACK_WORKERS", 8)
        config_service.set("PER_TRACK_TIME_BUDGET_SEC", 10)
        config_service.set("ENABLE_CACHE", True)
    
    if args.exhaustive:
        config_service.set("MAX_SEARCH_RESULTS", 100)
        config_service.set("CANDIDATE_WORKERS", 16)
        config_service.set("TRACK_WORKERS", 8)
        config_service.set("PER_TRACK_TIME_BUDGET_SEC", 100)
        config_service.set("ENABLE_CACHE", True)
        config_service.set("CROSS_TITLE_GRAMS_WITH_ARTISTS", True)
    
    if args.all_queries:
        config_service.set("RUN_ALL_QUERIES", True)
        config_service.set("PER_TRACK_TIME_BUDGET_SEC", None)
        config_service.set("CROSS_SMALL_ONLY", False)
        config_service.set("TITLE_GRAM_MAX", 3)
        config_service.set("MAX_SEARCH_RESULTS", 20)
        config_service.set("CANDIDATE_WORKERS", 16)
        config_service.set("TRACK_WORKERS", 10)
        config_service.set("ENABLE_CACHE", True)
    
    if args.myargs:
        # Ultra-aggressive preset
        config_service.set("CANDIDATE_WORKERS", 20)
        config_service.set("TRACK_WORKERS", 16)
        config_service.set("PER_TRACK_TIME_BUDGET_SEC", 60)
        config_service.set("EARLY_EXIT_SCORE", 88)
        config_service.set("EARLY_EXIT_MIN_QUERIES", 6)
        config_service.set("TITLE_GRAM_MAX", 3)
        config_service.set("CROSS_TITLE_GRAMS_WITH_ARTISTS", True)
        config_service.set("MAX_QUERIES_PER_TRACK", 60)
        config_service.set("MAX_SEARCH_RESULTS", 75)
        config_service.set("MIN_ACCEPT_SCORE", 65)
    
    # Apply logging settings
    config_service.set("VERBOSE", args.verbose)
    config_service.set("TRACE", args.trace)
    config_service.set("SEED", args.seed)


if __name__ == "__main__":
    main()
```

## Testing Strategy

### Unit Tests

**File:** `SRC/tests/unit/cli/test_cli_processor.py`

```python
"""Unit tests for CLIProcessor."""

import pytest
from unittest.mock import Mock, MagicMock
from pathlib import Path

from cuepoint.cli.cli_processor import CLIProcessor
from cuepoint.models.result import TrackResult
from cuepoint.ui.gui_interface import ProgressInfo


class TestCLIProcessor:
    """Test CLIProcessor class."""
    
    @pytest.fixture
    def mock_services(self):
        """Create mock services."""
        return {
            'processor_service': Mock(),
            'export_service': Mock(),
            'config_service': Mock(),
            'logging_service': Mock(),
        }
    
    @pytest.fixture
    def cli_processor(self, mock_services):
        """Create CLIProcessor instance."""
        return CLIProcessor(**mock_services)
    
    def test_initialization(self, cli_processor, mock_services):
        """Test CLIProcessor initialization."""
        assert cli_processor.processor_service == mock_services['processor_service']
        assert cli_processor.export_service == mock_services['export_service']
        assert cli_processor.config_service == mock_services['config_service']
        assert cli_processor.logging_service == mock_services['logging_service']
    
    def test_process_playlist_success(self, cli_processor, mock_services, tmp_path):
        """Test successful playlist processing."""
        # Setup mocks
        mock_results = [
            TrackResult(playlist_index=1, title="Track 1", artist="Artist 1", matched=True),
            TrackResult(playlist_index=2, title="Track 2", artist="Artist 2", matched=False),
        ]
        mock_services['processor_service'].process_playlist_from_xml.return_value = mock_results
        mock_services['export_service'].export_to_csv.return_value = None
        
        # Create temporary XML file
        xml_path = tmp_path / "test.xml"
        xml_path.write_text("<DJ_PLAYLISTS></DJ_PLAYLISTS>")
        
        # Process playlist
        cli_processor.process_playlist(
            xml_path=str(xml_path),
            playlist_name="Test Playlist",
            out_csv_base="test_output",
            auto_research=False,
        )
        
        # Verify processor service was called
        mock_services['processor_service'].process_playlist_from_xml.assert_called_once()
        
        # Verify export service was called
        assert mock_services['export_service'].export_to_csv.call_count > 0
    
    def test_progress_callback_creation(self, cli_processor):
        """Test progress callback creation."""
        callback = cli_processor._create_progress_callback()
        assert callable(callback)
        
        # Test callback invocation
        progress_info = ProgressInfo(
            total_tracks=10,
            completed_tracks=5,
            matched_count=3,
            unmatched_count=2,
            current_track={"title": "Test Track"},
        )
        callback(progress_info)
        
        # Verify progress bar was created
        assert cli_processor._pbar is not None
    
    def test_review_indices_calculation(self, cli_processor):
        """Test review indices calculation."""
        results = [
            TrackResult(playlist_index=1, match_score=50.0, matched=True),  # Low score
            TrackResult(playlist_index=2, match_score=90.0, matched=True),  # High score
            TrackResult(playlist_index=3, matched=False),  # No match
        ]
        
        review_indices = cli_processor._get_review_indices(results)
        
        assert 1 in review_indices  # Low score
        assert 2 not in review_indices  # High score
        assert 3 in review_indices  # No match
```

### Integration Tests

**File:** `SRC/tests/integration/test_cli_migration.py`

```python
"""Integration tests for CLI migration."""

import pytest
import tempfile
import os
from pathlib import Path

from cuepoint.utils.di_container import reset_container, get_container
from cuepoint.services.bootstrap import bootstrap_services
from cuepoint.cli.cli_processor import CLIProcessor


class TestCLIMigration:
    """Test CLI migration to Phase 5 architecture."""
    
    def setup_method(self):
        """Reset container before each test."""
        reset_container()
        bootstrap_services()
    
    def test_cli_processor_uses_di_services(self):
        """Test that CLIProcessor uses services from DI container."""
        container = get_container()
        
        processor_service = container.resolve(IProcessorService)  # type: ignore
        export_service = container.resolve(IExportService)  # type: ignore
        config_service = container.resolve(IConfigService)  # type: ignore
        logging_service = container.resolve(ILoggingService)  # type: ignore
        
        cli_processor = CLIProcessor(
            processor_service=processor_service,
            export_service=export_service,
            config_service=config_service,
            logging_service=logging_service,
        )
        
        assert cli_processor.processor_service is processor_service
        assert cli_processor.export_service is export_service
        assert cli_processor.config_service is config_service
        assert cli_processor.logging_service is logging_service
    
    def test_cli_workflow_integration(self, tmp_path):
        """Test full CLI workflow integration."""
        # Create test XML file
        xml_content = """<?xml version="1.0"?>
<DJ_PLAYLISTS>
    <COLLECTION>
        <TRACK TrackID="1" Name="Test Track" Artist="Test Artist"/>
    </COLLECTION>
    <PLAYLISTS>
        <NODE Name="ROOT">
            <NODE Name="Test Playlist">
                <TRACK Key="1"/>
            </NODE>
        </NODE>
    </PLAYLISTS>
</DJ_PLAYLISTS>"""
        
        xml_path = tmp_path / "test.xml"
        xml_path.write_text(xml_content)
        
        # Create CLI processor
        container = get_container()
        cli_processor = CLIProcessor(
            processor_service=container.resolve(IProcessorService),  # type: ignore
            export_service=container.resolve(IExportService),  # type: ignore
            config_service=container.resolve(IConfigService),  # type: ignore
            logging_service=container.resolve(ILoggingService),  # type: ignore
        )
        
        # Process playlist
        output_dir = tmp_path / "output"
        output_dir.mkdir()
        
        cli_processor.process_playlist(
            xml_path=str(xml_path),
            playlist_name="Test Playlist",
            out_csv_base="test_output",
            auto_research=True,
        )
        
        # Verify output files were created
        assert output_dir.exists()
        # Check for CSV files (implementation depends on ExportService)
```

## Migration Checklist

### Pre-Migration
- [ ] Review current CLI functionality
- [ ] Document all CLI features and flags
- [ ] Create test cases for regression testing
- [ ] Backup current `main.py` and `processor.py`

### Phase 1: CLI Service Layer
- [ ] Create `cuepoint/cli/` directory structure
- [ ] Implement `CLIProcessor` class
- [ ] Implement progress callback with tqdm
- [ ] Implement file output orchestration
- [ ] Implement summary statistics
- [ ] Implement error handling
- [ ] Write unit tests for `CLIProcessor`

### Phase 2: Update CLI Entry Point
- [ ] Update `main.py` imports
- [ ] Replace `SETTINGS` with `ConfigService`
- [ ] Update configuration preset application
- [ ] Update YAML config loading
- [ ] Update main function to use `CLIProcessor`
- [ ] Update error handling

### Phase 3: Testing
- [ ] Run unit tests
- [ ] Run integration tests
- [ ] Manual testing of all CLI flags
- [ ] Regression testing (compare output with old CLI)
- [ ] Performance testing
- [ ] Error scenario testing

### Phase 4: Cleanup
- [ ] Add deprecation warnings to `processor.run()`
- [ ] Update documentation
- [ ] Create migration guide
- [ ] (Optional) Remove `processor.py` after verification period

## Success Criteria

1. ✅ **CLI uses Phase 5 architecture**: All processing goes through `ProcessorService` via DI
2. ✅ **No functionality loss**: All existing CLI features work identically
3. ✅ **Code unification**: GUI and CLI use the same processing pipeline
4. ✅ **Maintainability**: Single source of truth for processing logic
5. ✅ **Test coverage**: >80% test coverage for new CLI code
6. ✅ **Performance**: No performance regression
7. ✅ **Documentation**: All changes documented

## Risks & Mitigation

### Risk 1: Breaking Changes
**Mitigation:**
- Comprehensive regression testing
- Side-by-side comparison of outputs
- Gradual migration with feature flags

### Risk 2: Configuration Migration
**Mitigation:**
- Maintain backward compatibility during transition
- Provide migration script if needed
- Clear documentation of changes

### Risk 3: Performance Regression
**Mitigation:**
- Performance benchmarks before/after
- Profile critical paths
- Optimize if needed

### Risk 4: Missing Features
**Mitigation:**
- Detailed feature audit
- Test all CLI flags
- User acceptance testing

## Estimated Duration

**Total: 5-7 days**

- Phase 1 (CLI Service Layer): 2-3 days
- Phase 2 (Update Entry Point): 1-2 days
- Phase 3 (Testing): 2-3 days
- Phase 4 (Cleanup): 1 day

## Dependencies

- ✅ Phase 5.2: Dependency Injection (completed)
- ✅ Phase 5.8: Configuration Management (completed)
- ✅ Phase 5.9: Data Models (completed)
- ✅ GUI Migration (completed - can use as reference)

## Related Documentation

- `02_Step_5.2_Dependency_Injection_Service_Layer.md`: DI implementation
- `08_Step_5.8_Configuration_Management.md`: ConfigService usage
- `09_Step_5.9_Refactor_Data_Models.md`: New data models
- `SRC/cuepoint/ui/controllers/main_controller.py`: GUI implementation (reference)

## Notes

- This migration completes the Phase 5 architecture adoption
- After migration, `processor.py` can be deprecated/removed
- CLI and GUI will share the same codebase, reducing maintenance burden
- Future enhancements only need to be implemented once

