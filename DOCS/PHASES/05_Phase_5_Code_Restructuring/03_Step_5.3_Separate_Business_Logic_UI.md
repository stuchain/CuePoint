# Step 5.3: Separate Business Logic from UI

**Status**: 📝 Planned  
**Priority**: 🚀 P1 - HIGH PRIORITY  
**Estimated Duration**: 4-5 days  
**Dependencies**: Step 5.2 (Dependency Injection & Service Layer)

---

## Goal

Move all business logic out of UI components into dedicated service classes and controllers. UI components should only handle presentation, user input, and display logic.

---

## Success Criteria

- [ ] All business logic extracted from UI files
- [ ] Controllers created to mediate between UI and services
- [ ] UI components only handle presentation
- [ ] Business logic is testable without UI
- [ ] UI is testable with mocked controllers
- [ ] No business logic in UI event handlers
- [ ] Clear separation between UI and business logic

---

## Current Problems

### Business Logic in UI Components

**Example Issues:**
- Processing logic in `main_window.py`
- Export logic in `export_dialog.py`
- Filter logic in `results_view.py`
- Configuration logic in `config_panel.py`
- Data validation in UI components
- API calls directly from UI

### Problems This Causes
- **Hard to Test**: UI logic mixed with business logic
- **Hard to Reuse**: Business logic tied to specific UI
- **Hard to Maintain**: Changes require UI knowledge
- **Tight Coupling**: UI depends on implementation details

---

## Target Architecture

### MVC Pattern

```
UI Layer (View)
    ↓ (user actions)
Controller Layer
    ↓ (method calls)
Service Layer
    ↓ (data access)
Data Layer
```

### Component Responsibilities

**UI Components (View)**
- Display data
- Capture user input
- Handle UI events (clicks, key presses)
- Update UI state
- Show/hide widgets
- Format display

**Controllers**
- Mediate between UI and services
- Handle UI events
- Call appropriate services
- Transform data for display
- Handle UI-specific logic (navigation, dialogs)

**Services**
- Business logic
- Data processing
- Validation
- Algorithm execution
- External API calls

---

## Refactoring Strategy

### 5.3.1: Identify Business Logic in UI

**Areas to Refactor:**

1. **Main Window (`main_window.py`)**
   - Processing logic
   - File loading logic
   - Result handling
   - Status updates

2. **Results View (`results_view.py`)**
   - Filtering logic
   - Sorting logic
   - Search logic
   - Data transformation

3. **Export Dialog (`export_dialog.py`)**
   - Export format logic
   - File writing logic
   - Data serialization

4. **Config Panel (`config_panel.py`)**
   - Configuration validation
   - Default value logic
   - Configuration transformation

### 5.3.2: Create Controllers

**Controller Responsibilities:**
- Handle UI events
- Call services
- Transform data for UI
- Manage UI state
- Coordinate between UI components

### 5.3.3: Extract Business Logic

**Extraction Process:**
1. Identify business logic in UI
2. Move to appropriate service
3. Create controller method
4. Update UI to call controller
5. Test functionality

---

## Implementation Details

### Main Window Controller

```python
# src/cuepoint/ui/controllers/main_controller.py

from typing import List, Optional, Callable
from cuepoint.services.interfaces import (
    IProcessorService, IExportService, IConfigService, ILoggingService
)
from cuepoint.models.track import Track
from cuepoint.models.result import TrackResult
from cuepoint.core.parser import parse_playlist_xml

class MainController:
    """Controller for main window."""
    
    def __init__(
        self,
        processor_service: IProcessorService,
        export_service: IExportService,
        config_service: IConfigService,
        logging_service: ILoggingService
    ):
        self.processor_service = processor_service
        self.export_service = export_service
        self.config_service = config_service
        self.logging_service = logging_service
        
        # Progress callbacks
        self.on_progress: Optional[Callable[[int, int], None]] = None
        self.on_track_complete: Optional[Callable[[TrackResult], None]] = None
        self.on_complete: Optional[Callable[[List[TrackResult]], None]] = None
        self.on_error: Optional[Callable[[Exception], None]] = None
    
    def load_playlist(self, filepath: str) -> List[Track]:
        """Load playlist from XML file."""
        try:
            self.logging_service.info(f"Loading playlist from: {filepath}")
            tracks = parse_playlist_xml(filepath)
            self.logging_service.info(f"Loaded {len(tracks)} tracks")
            return tracks
        except Exception as e:
            self.logging_service.error(f"Error loading playlist: {e}")
            if self.on_error:
                self.on_error(e)
            raise
    
    def process_playlist(
        self,
        tracks: List[Track],
        progress_callback: Optional[Callable[[int, int], None]] = None
    ) -> List[TrackResult]:
        """Process a playlist of tracks."""
        results = []
        total = len(tracks)
        
        for i, track in enumerate(tracks):
            try:
                # Process track
                result = self.processor_service.process_track(track)
                results.append(result)
                
                # Update progress
                if progress_callback:
                    progress_callback(i + 1, total)
                
                # Notify track complete
                if self.on_track_complete:
                    self.on_track_complete(result)
                
            except Exception as e:
                self.logging_service.error(f"Error processing track {track.title}: {e}")
                if self.on_error:
                    self.on_error(e)
        
        # Notify complete
        if self.on_complete:
            self.on_complete(results)
        
        return results
    
    def export_results(
        self,
        results: List[TrackResult],
        filepath: str,
        format: str
    ) -> None:
        """Export results to file."""
        try:
            self.logging_service.info(f"Exporting {len(results)} results to {filepath}")
            
            if format == "csv":
                self.export_service.export_to_csv(results, filepath)
            elif format == "json":
                self.export_service.export_to_json(results, filepath)
            elif format == "excel":
                self.export_service.export_to_excel(results, filepath)
            else:
                raise ValueError(f"Unsupported export format: {format}")
            
            self.logging_service.info("Export completed successfully")
        except Exception as e:
            self.logging_service.error(f"Error exporting results: {e}")
            if self.on_error:
                self.on_error(e)
            raise
    
    def get_config(self, key: str, default=None):
        """Get configuration value."""
        return self.config_service.get(key, default)
    
    def set_config(self, key: str, value) -> None:
        """Set configuration value."""
        self.config_service.set(key, value)
        self.config_service.save()
```

### Results View Controller

```python
# src/cuepoint/ui/controllers/results_controller.py

from typing import List, Optional, Dict, Any
from cuepoint.models.result import TrackResult

class ResultsController:
    """Controller for results view."""
    
    def __init__(self):
        self.all_results: List[TrackResult] = []
        self.filtered_results: List[TrackResult] = []
        self.current_filters: Dict[str, Any] = {}
    
    def set_results(self, results: List[TrackResult]) -> None:
        """Set the results to display."""
        self.all_results = results
        self.apply_filters()
    
    def apply_filters(
        self,
        search_text: Optional[str] = None,
        confidence_min: Optional[float] = None,
        year_min: Optional[int] = None,
        year_max: Optional[int] = None,
        bpm_min: Optional[float] = None,
        bpm_max: Optional[float] = None,
        key: Optional[str] = None
    ) -> List[TrackResult]:
        """Apply filters to results."""
        self.current_filters = {
            "search_text": search_text,
            "confidence_min": confidence_min,
            "year_min": year_min,
            "year_max": year_max,
            "bpm_min": bpm_min,
            "bpm_max": bpm_max,
            "key": key
        }
        
        filtered = self.all_results.copy()
        
        # Apply search filter
        if search_text:
            search_lower = search_text.lower()
            filtered = [
                r for r in filtered
                if (search_lower in r.track.title.lower() or
                    search_lower in r.track.artist.lower() or
                    (r.best_match and search_lower in r.best_match.get("title", "").lower()))
            ]
        
        # Apply confidence filter
        if confidence_min is not None:
            filtered = [
                r for r in filtered
                if r.confidence >= confidence_min
            ]
        
        # Apply year filter
        if year_min is not None or year_max is not None:
            filtered = [
                r for r in filtered
                if self._year_in_range(r, year_min, year_max)
            ]
        
        # Apply BPM filter
        if bpm_min is not None or bpm_max is not None:
            filtered = [
                r for r in filtered
                if self._bpm_in_range(r, bpm_min, bpm_max)
            ]
        
        # Apply key filter
        if key:
            filtered = [
                r for r in filtered
                if r.best_match and r.best_match.get("key") == key
            ]
        
        self.filtered_results = filtered
        return self.filtered_results
    
    def _year_in_range(
        self,
        result: TrackResult,
        year_min: Optional[int],
        year_max: Optional[int]
    ) -> bool:
        """Check if result's year is in range."""
        if not result.best_match:
            return False
        year = result.best_match.get("release_date")
        if not year:
            return False
        try:
            year_int = int(str(year)[:4])  # Extract year from date
            if year_min and year_int < year_min:
                return False
            if year_max and year_int > year_max:
                return False
            return True
        except (ValueError, TypeError):
            return False
    
    def _bpm_in_range(
        self,
        result: TrackResult,
        bpm_min: Optional[float],
        bpm_max: Optional[float]
    ) -> bool:
        """Check if result's BPM is in range."""
        if not result.best_match:
            return False
        bpm = result.best_match.get("bpm")
        if not bpm:
            return False
        try:
            bpm_float = float(bpm)
            if bpm_min and bpm_float < bpm_min:
                return False
            if bpm_max and bpm_float > bpm_max:
                return False
            return True
        except (ValueError, TypeError):
            return False
    
    def clear_filters(self) -> List[TrackResult]:
        """Clear all filters."""
        self.current_filters = {}
        self.filtered_results = self.all_results.copy()
        return self.filtered_results
    
    def sort_results(self, key: str, ascending: bool = True) -> List[TrackResult]:
        """Sort results by key."""
        reverse = not ascending
        
        if key == "title":
            self.filtered_results.sort(key=lambda r: r.track.title.lower(), reverse=reverse)
        elif key == "artist":
            self.filtered_results.sort(key=lambda r: r.track.artist.lower(), reverse=reverse)
        elif key == "confidence":
            self.filtered_results.sort(key=lambda r: r.confidence, reverse=reverse)
        elif key == "year":
            self.filtered_results.sort(
                key=lambda r: self._get_year(r),
                reverse=reverse
            )
        elif key == "bpm":
            self.filtered_results.sort(
                key=lambda r: self._get_bpm(r),
                reverse=reverse
            )
        
        return self.filtered_results
    
    def _get_year(self, result: TrackResult) -> int:
        """Get year from result."""
        if result.best_match:
            year = result.best_match.get("release_date")
            if year:
                try:
                    return int(str(year)[:4])
                except (ValueError, TypeError):
                    pass
        return 0
    
    def _get_bpm(self, result: TrackResult) -> float:
        """Get BPM from result."""
        if result.best_match:
            bpm = result.best_match.get("bpm")
            if bpm:
                try:
                    return float(bpm)
                except (ValueError, TypeError):
                    pass
        return 0.0
```

### Refactored Main Window

```python
# src/cuepoint/ui/main_window.py (refactored)

from PySide6.QtWidgets import QMainWindow, QFileDialog, QMessageBox
from cuepoint.ui.controllers.main_controller import MainController
from cuepoint.models.track import Track

class MainWindow(QMainWindow):
    """Main application window."""
    
    def __init__(self, controller: MainController, parent=None):
        super().__init__(parent)
        self.controller = controller
        self.tracks: List[Track] = []
        self.results: List[TrackResult] = []
        
        # Connect controller callbacks
        self.controller.on_track_complete = self.on_track_complete
        self.controller.on_complete = self.on_playlist_complete
        self.controller.on_error = self.on_error
        
        self.init_ui()
        self.setup_connections()
    
    def init_ui(self):
        """Initialize UI components."""
        # ... UI setup code ...
        pass
    
    def setup_connections(self):
        """Connect signals and slots."""
        self.start_button.clicked.connect(self.on_start_clicked)
        self.open_file_button.clicked.connect(self.on_open_file_clicked)
        # ... other connections ...
    
    def on_open_file_clicked(self):
        """Handle open file button click."""
        filepath, _ = QFileDialog.getOpenFileName(
            self,
            "Open Playlist",
            "",
            "XML Files (*.xml)"
        )
        
        if filepath:
            try:
                # Use controller to load playlist
                self.tracks = self.controller.load_playlist(filepath)
                self.update_track_list()
                self.statusBar().showMessage(f"Loaded {len(self.tracks)} tracks", 2000)
            except Exception as e:
                QMessageBox.critical(self, "Error", f"Failed to load playlist: {e}")
    
    def on_start_clicked(self):
        """Handle start processing button click."""
        if not self.tracks:
            QMessageBox.warning(self, "Warning", "No tracks loaded")
            return
        
        # Disable UI during processing
        self.start_button.setEnabled(False)
        self.progress_widget.reset()
        self.progress_widget.setMaximum(len(self.tracks))
        
        # Process in background thread (use QThread)
        # For now, process synchronously
        try:
            self.results = self.controller.process_playlist(
                self.tracks,
                progress_callback=self.on_progress
            )
        except Exception as e:
            QMessageBox.critical(self, "Error", f"Processing failed: {e}")
        finally:
            self.start_button.setEnabled(True)
    
    def on_progress(self, current: int, total: int):
        """Update progress bar."""
        self.progress_widget.setValue(current)
        self.statusBar().showMessage(f"Processing: {current}/{total}", 0)
    
    def on_track_complete(self, result: TrackResult):
        """Handle track processing complete."""
        # Update UI with new result
        # This could add to a results table, etc.
        pass
    
    def on_playlist_complete(self, results: List[TrackResult]):
        """Handle playlist processing complete."""
        self.results = results
        self.results_view.set_results(results)
        self.statusBar().showMessage("Processing complete", 2000)
    
    def on_error(self, error: Exception):
        """Handle error from controller."""
        QMessageBox.critical(self, "Error", str(error))
```

### Refactored Results View

```python
# src/cuepoint/ui/widgets/results_view.py (refactored)

from PySide6.QtWidgets import QWidget, QVBoxLayout, QLineEdit, QPushButton
from cuepoint.ui.controllers.results_controller import ResultsController
from cuepoint.models.result import TrackResult

class ResultsView(QWidget):
    """Results display widget."""
    
    def __init__(self, controller: ResultsController, parent=None):
        super().__init__(parent)
        self.controller = controller
        self.init_ui()
        self.setup_connections()
    
    def init_ui(self):
        """Initialize UI components."""
        layout = QVBoxLayout(self)
        
        # Search box
        self.search_box = QLineEdit()
        self.search_box.setPlaceholderText("Search tracks...")
        layout.addWidget(self.search_box)
        
        # Filter controls
        # ... filter widgets ...
        
        # Results table
        # ... table widget ...
        
        # Clear filters button
        self.clear_button = QPushButton("Clear Filters")
        layout.addWidget(self.clear_button)
    
    def setup_connections(self):
        """Connect signals and slots."""
        self.search_box.textChanged.connect(self.on_search_changed)
        self.clear_button.clicked.connect(self.on_clear_filters)
        # ... other connections ...
    
    def set_results(self, results: List[TrackResult]):
        """Set results to display."""
        # Use controller to set results
        self.controller.set_results(results)
        self.update_display()
    
    def on_search_changed(self, text: str):
        """Handle search text change."""
        # Use controller to filter
        filtered = self.controller.apply_filters(search_text=text if text else None)
        self.update_display()
    
    def on_clear_filters(self):
        """Handle clear filters button click."""
        # Use controller to clear filters
        self.controller.clear_filters()
        self.search_box.clear()
        self.update_display()
    
    def update_display(self):
        """Update the display with filtered results."""
        results = self.controller.filtered_results
        # Update table with results
        # ... table update code ...
```

---

## Testing Strategy

### Test Controllers Independently

```python
# tests/unit/test_main_controller.py

from unittest.mock import Mock
from cuepoint.ui.controllers.main_controller import MainController
from cuepoint.models.track import Track

def test_load_playlist():
    # Create mocks
    mock_processor = Mock()
    mock_export = Mock()
    mock_config = Mock()
    mock_logging = Mock()
    
    controller = MainController(
        processor_service=mock_processor,
        export_service=mock_export,
        config_service=mock_config,
        logging_service=mock_logging
    )
    
    # Test
    tracks = controller.load_playlist("test.xml")
    
    # Verify
    assert len(tracks) > 0
    mock_logging.info.assert_called()
```

### Test UI with Mocked Controllers

```python
# tests/ui/test_main_window.py

from unittest.mock import Mock
from cuepoint.ui.main_window import MainWindow
from cuepoint.ui.controllers.main_controller import MainController

def test_main_window():
    # Create mock controller
    mock_controller = Mock(spec=MainController)
    mock_controller.load_playlist.return_value = []
    
    # Create window
    window = MainWindow(mock_controller)
    
    # Test
    window.on_open_file_clicked()
    
    # Verify controller was called
    # (assuming file dialog returns a path)
```

---

## Implementation Checklist

- [ ] Identify all business logic in UI files
- [ ] Create main controller
- [ ] Create results controller
- [ ] Create export controller (if needed)
- [ ] Create config controller (if needed)
- [ ] Extract processing logic from main window
- [ ] Extract filter logic from results view
- [ ] Extract export logic from export dialog
- [ ] Extract config logic from config panel
- [ ] Update main window to use controller
- [ ] Update results view to use controller
- [ ] Update export dialog to use controller
- [ ] Update config panel to use controller
- [ ] Remove business logic from UI components
- [ ] Write unit tests for controllers
- [ ] Write UI tests with mocked controllers
- [ ] Verify all functionality works
- [ ] Document controller interfaces

---

## Common Issues and Solutions

### Issue 1: UI Still Contains Business Logic
**Solution**: Review UI code carefully. If logic is needed for display formatting, it's OK. If it's business logic, move to controller or service.

### Issue 2: Controllers Too Large
**Solution**: Split controllers into smaller, focused controllers. One controller per major UI component.

### Issue 3: Circular Dependencies
**Solution**: Use dependency injection. Controllers depend on services, not vice versa.

---

## Next Steps

After completing this step:
1. Verify UI works correctly
2. Verify business logic is testable
3. Run all tests
4. Proceed to Step 5.4: Implement Comprehensive Testing

