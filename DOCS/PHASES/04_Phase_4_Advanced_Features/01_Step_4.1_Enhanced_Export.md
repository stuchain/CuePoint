# Step 4.1: Enhanced Export Features

**Status**: 📝 Planned  
**Priority**: 🚀 High Priority  
**Estimated Duration**: 2-3 days  
**Dependencies**: Phase 2 Step 2.3 (export dialog exists), Phase 0 (output_writer), Phase 3 (performance monitoring)

## Goal
Enhance export functionality with additional options including metadata inclusion, processing information, compression, and custom delimiters to provide users with more flexible export capabilities.

## Success Criteria
- [ ] Enhanced export options available in export dialog
- [ ] Metadata inclusion works correctly
- [ ] Processing info inclusion works correctly
- [ ] Compression works for JSON files
- [ ] Custom delimiter works for CSV files
- [ ] All export operations tracked in Phase 3 performance metrics
- [ ] Error handling robust for all export operations
- [ ] Backward compatibility maintained (existing exports still work)
- [ ] All features tested (unit tests, integration tests)
- [ ] Documentation updated (user guide, API docs)

---

## Analysis and Design Considerations

### Current State Analysis
- **Existing Export Formats**: CSV, JSON, Excel (implemented in Phase 2)
- **Current Limitations**: 
  - No option to include/exclude metadata
  - No processing information in exports
  - No compression option
  - Fixed CSV delimiter (comma only)
- **User Needs**: More control over export content and format

### Performance Considerations (Phase 3 Integration)
- **Export Time Tracking**: All export operations must be tracked in performance metrics
- **Large File Handling**: Compression can significantly reduce file size for large exports
- **Memory Usage**: Streaming writes for large datasets to avoid memory issues
- **Metrics to Track**:
  - Export operation duration
  - File size before/after compression
  - Export format used
  - Number of tracks exported

### Error Handling Strategy
1. **File Write Errors**: Handle permission errors, disk full, invalid paths
2. **Compression Errors**: Handle gzip compression failures gracefully
3. **Data Serialization Errors**: Handle JSON encoding errors for special characters
4. **User Feedback**: Provide clear error messages with actionable guidance

### Backward Compatibility
- Existing export functions must continue to work unchanged
- New parameters are optional with sensible defaults
- Old export formats remain fully supported

---

## Implementation Steps

### Substep 4.1.1: Update Export Dialog UI (4-6 hours)
**File**: `SRC/gui/export_dialog.py` (MODIFY)

**What to add:**

```python
# Add new export options group to ExportDialog

class ExportDialog(QDialog):
    """Enhanced export dialog with additional options"""
    
    def __init__(self, parent=None):
        super().__init__(parent)
        self.file_path = ""
        self.init_ui()
    
    def init_ui(self):
        """Initialize export dialog with enhanced options"""
        layout = QVBoxLayout(self)
        
        # ... existing format and column selection ...
        
        # NEW: Export Options Group
        options_group = QGroupBox("Export Options")
        options_layout = QVBoxLayout()
        
        # Include metadata
        self.include_metadata_checkbox = QCheckBox("Include full metadata (genres, labels, release dates)")
        self.include_metadata_checkbox.setChecked(True)
        self.include_metadata_checkbox.setToolTip(
            "Include additional metadata fields like genres, labels, and release dates"
        )
        options_layout.addWidget(self.include_metadata_checkbox)
        
        # Include processing info
        self.include_processing_info_checkbox = QCheckBox("Include processing information (timestamps, settings)")
        self.include_processing_info_checkbox.setChecked(False)
        self.include_processing_info_checkbox.setToolTip(
            "Include processing metadata like timestamps and search settings used"
        )
        options_layout.addWidget(self.include_processing_info_checkbox)
        
        # Compression option (for JSON)
        self.compress_checkbox = QCheckBox("Compress output (gzip)")
        self.compress_checkbox.setChecked(False)
        self.compress_checkbox.setToolTip(
            "Compress JSON output using gzip (reduces file size significantly)"
        )
        options_layout.addWidget(self.compress_checkbox)
        
        # Custom delimiter (for CSV)
        delimiter_layout = QHBoxLayout()
        delimiter_layout.addWidget(QLabel("CSV Delimiter:"))
        self.delimiter_combo = QComboBox()
        self.delimiter_combo.addItems([",", ";", "\t", "|"])
        self.delimiter_combo.setCurrentText(",")
        self.delimiter_combo.setToolTip("Select the delimiter character for CSV files")
        delimiter_layout.addWidget(self.delimiter_combo)
        delimiter_layout.addStretch()
        options_layout.addLayout(delimiter_layout)
        
        options_group.setLayout(options_layout)
        layout.addWidget(options_group)
        
        # ... rest of existing UI ...
    
    def get_export_options(self) -> Dict[str, Any]:
        """Get selected export options with enhancements"""
        options = {
            # ... existing options ...
            "include_metadata": self.include_metadata_checkbox.isChecked(),
            "include_processing_info": self.include_processing_info_checkbox.isChecked(),
            "compress": self.compress_checkbox.isChecked(),
            "delimiter": self.delimiter_combo.currentText(),
        }
        return options
```

**Implementation Checklist**:
- [ ] Add export options group to dialog
- [ ] Add metadata inclusion checkbox
- [ ] Add processing info inclusion checkbox
- [ ] Add compression checkbox (with format-specific enable/disable)
- [ ] Add delimiter combo box (CSV only)
- [ ] Add tooltips for all new options
- [ ] Connect options to export logic
- [ ] Test UI layout and responsiveness

**Error Handling**:
- Validate checkbox states
- Handle missing UI elements gracefully
- Provide default values if options not available

---

### Substep 4.1.2: Enhance JSON Export with Metadata and Compression (4-6 hours)
**File**: `SRC/output_writer.py` (MODIFY)

**What to implement:**

```python
import gzip
import json
from datetime import datetime
from typing import List, Optional, Dict, Any

def write_json_file(
    results: List[TrackResult],
    base_filename: str,
    output_dir: str = "output",
    include_metadata: bool = True,
    include_processing_info: bool = False,
    compress: bool = False,
    settings: Optional[Dict[str, Any]] = None
) -> str:
    """
    Write results to JSON file with enhanced options.
    
    Args:
        results: List of TrackResult objects
        base_filename: Base filename (without extension)
        output_dir: Output directory path
        include_metadata: Include full metadata (genres, labels, etc.)
        include_processing_info: Include processing information
        compress: Compress output using gzip
        settings: Processing settings to include (if include_processing_info is True)
    
    Returns:
        Path to created file
    
    Raises:
        OSError: If file cannot be written (permissions, disk full, etc.)
        ValueError: If invalid parameters provided
    """
    import os
    from SRC.performance import performance_collector
    
    # Start performance tracking
    export_start_time = time.time()
    
    try:
        os.makedirs(output_dir, exist_ok=True)
        
        # Build JSON structure
        json_data = {
            "version": "1.0",
            "generated": datetime.now().isoformat(),
            "total_tracks": len(results),
            "matched_tracks": sum(1 for r in results if r.matched),
            "tracks": []
        }
        
        # Add processing info if requested
        if include_processing_info:
            json_data["processing_info"] = {
                "timestamp": datetime.now().isoformat(),
                "settings": settings or {},
                "export_format": "json",
                "compressed": compress
            }
        
        # Add track data
        for result in results:
            track_data = {
                "playlist_index": result.playlist_index,
                "title": result.title,
                "artist": result.artist,
                "matched": result.matched,
            }
            
            if result.matched:
                track_data["match"] = {
                    "beatport_title": result.beatport_title,
                    "beatport_artists": result.beatport_artists,
                    "beatport_url": result.beatport_url,
                    "match_score": result.match_score,
                    "confidence": result.confidence,
                    "key": result.beatport_key,
                    "bpm": result.beatport_bpm,
                    "year": result.beatport_year,
                }
                
                # Include full metadata if requested
                if include_metadata:
                    track_data["match"]["metadata"] = {
                        "label": result.beatport_label or "",
                        "genres": result.beatport_genres or [],
                        "release": result.beatport_release or "",
                        "release_date": result.beatport_release_date or "",
                    }
            
            # Add candidates if available
            if result.candidates:
                track_data["candidates"] = [
                    {
                        "title": c.get("beatport_title", ""),
                        "artists": c.get("beatport_artists", ""),
                        "url": c.get("beatport_url", ""),
                        "score": c.get("match_score", 0),
                    }
                    for c in result.candidates[:10]  # Top 10 candidates
                ]
            
            json_data["tracks"].append(track_data)
        
        # Determine filename
        filename = f"{base_filename}.json"
        if compress:
            filename += ".gz"
        
        filepath = os.path.join(output_dir, filename)
        
        # Serialize to JSON
        json_str = json.dumps(json_data, indent=2, ensure_ascii=False)
        
        # Write to file (with compression if requested)
        try:
            if compress:
                with gzip.open(filepath, 'wt', encoding='utf-8') as f:
                    f.write(json_str)
            else:
                with open(filepath, 'w', encoding='utf-8') as f:
                    f.write(json_str)
        except OSError as e:
            raise OSError(f"Failed to write export file: {e}")
        
        # Track performance
        export_duration = time.time() - export_start_time
        file_size = os.path.getsize(filepath)
        
        # Record export metrics (if performance tracking enabled)
        if hasattr(performance_collector, 'record_export'):
            performance_collector.record_export(
                format="json",
                compressed=compress,
                file_size=file_size,
                duration=export_duration,
                track_count=len(results)
            )
        
        return filepath
        
    except Exception as e:
        # Log error and re-raise with context
        raise RuntimeError(f"JSON export failed: {e}") from e
```

**Implementation Checklist**:
- [ ] Update `write_json_file` function signature
- [ ] Add metadata inclusion logic
- [ ] Add processing info inclusion logic
- [ ] Add compression support using gzip
- [ ] Add error handling for file operations
- [ ] Add performance tracking integration
- [ ] Test with various data sizes
- [ ] Test compression effectiveness
- [ ] Test error conditions

**Error Handling**:
- Handle `OSError` for file write failures
- Handle `gzip` compression errors
- Handle JSON serialization errors (special characters)
- Provide user-friendly error messages

---

### Substep 4.1.3: Enhance CSV Export with Custom Delimiter (3-4 hours)
**File**: `SRC/output_writer.py` (MODIFY)

**What to implement:**

```python
import csv
from typing import List, Dict, Any, Optional

def write_csv_files(
    results: List[TrackResult],
    base_filename: str,
    output_dir: str = "output",
    delimiter: str = ",",
    include_metadata: bool = True
) -> Dict[str, str]:
    """
    Write CSV files with custom delimiter.
    
    Args:
        results: List of TrackResult objects
        base_filename: Base filename (without extension)
        output_dir: Output directory path
        delimiter: CSV delimiter character (default: ",")
        include_metadata: Include metadata columns
    
    Returns:
        Dictionary mapping file type to file path
    
    Raises:
        OSError: If file cannot be written
        ValueError: If invalid delimiter provided
    """
    import os
    import time
    from SRC.performance import performance_collector
    
    # Validate delimiter
    if delimiter not in [",", ";", "\t", "|"]:
        raise ValueError(f"Invalid delimiter: {delimiter}. Must be one of: , ; \\t |")
    
    export_start_time = time.time()
    
    try:
        os.makedirs(output_dir, exist_ok=True)
        
        # Determine file extension based on delimiter
        ext_map = {
            ",": ".csv",
            ";": ".csv",
            "\t": ".tsv",
            "|": ".psv"
        }
        extension = ext_map.get(delimiter, ".csv")
        
        # Main results file
        main_filepath = os.path.join(output_dir, f"{base_filename}{extension}")
        
        # Build headers
        headers = [
            "Index", "Title", "Artist", "Matched", "Beatport Title",
            "Beatport Artists", "Score", "Confidence", "Key", "BPM", "Year"
        ]
        
        if include_metadata:
            headers.extend(["Label", "Genres", "Release", "Release Date"])
        
        # Write main CSV file
        try:
            with open(main_filepath, 'w', newline='', encoding='utf-8') as f:
                writer = csv.writer(f, delimiter=delimiter)
                writer.writerow(headers)
                
                for result in results:
                    row = [
                        result.playlist_index,
                        result.title,
                        result.artist,
                        "Yes" if result.matched else "No",
                        result.beatport_title or "",
                        result.beatport_artists or "",
                        result.match_score or 0.0,
                        result.confidence or "",
                        result.beatport_key or "",
                        result.beatport_bpm or "",
                        result.beatport_year or "",
                    ]
                    
                    if include_metadata:
                        row.extend([
                            result.beatport_label or "",
                            ", ".join(result.beatport_genres) if result.beatport_genres else "",
                            result.beatport_release or "",
                            result.beatport_release_date or "",
                        ])
                    
                    writer.writerow(row)
        except OSError as e:
            raise OSError(f"Failed to write CSV file: {e}")
        
        # Write candidates file (if candidates exist)
        candidates_filepath = None
        if any(r.candidates for r in results):
            candidates_filepath = os.path.join(output_dir, f"{base_filename}_candidates{extension}")
            try:
                with open(candidates_filepath, 'w', newline='', encoding='utf-8') as f:
                    writer = csv.writer(f, delimiter=delimiter)
                    writer.writerow([
                        "Index", "Title", "Artist", "Candidate Title",
                        "Candidate Artists", "Candidate URL", "Score", "Rank"
                    ])
                    
                    for result in results:
                        if result.candidates:
                            for rank, candidate in enumerate(result.candidates[:10], 1):
                                writer.writerow([
                                    result.playlist_index,
                                    result.title,
                                    result.artist,
                                    candidate.get("beatport_title", ""),
                                    candidate.get("beatport_artists", ""),
                                    candidate.get("beatport_url", ""),
                                    candidate.get("match_score", 0.0),
                                    rank
                                ])
            except OSError as e:
                # Log warning but don't fail entire export
                print(f"Warning: Failed to write candidates file: {e}")
        
        # Track performance
        export_duration = time.time() - export_start_time
        file_size = os.path.getsize(main_filepath)
        
        if hasattr(performance_collector, 'record_export'):
            performance_collector.record_export(
                format="csv",
                compressed=False,
                file_size=file_size,
                duration=export_duration,
                track_count=len(results)
            )
        
        return {
            "main": main_filepath,
            "candidates": candidates_filepath
        }
        
    except Exception as e:
        raise RuntimeError(f"CSV export failed: {e}") from e
```

**Implementation Checklist**:
- [ ] Update `write_csv_files` function signature
- [ ] Add delimiter parameter validation
- [ ] Update CSV writing to use custom delimiter
- [ ] Add metadata column inclusion logic
- [ ] Update file extension based on delimiter
- [ ] Add error handling
- [ ] Add performance tracking
- [ ] Test with all delimiter options
- [ ] Test with special characters in data

**Error Handling**:
- Validate delimiter parameter
- Handle CSV writing errors
- Handle special characters in data
- Handle file write failures

---

### Substep 4.1.4: Integrate Enhanced Export into GUI (1-2 days)
**Files**: `SRC/gui/export_dialog.py` (MODIFY), `SRC/gui/main_window.py` (MODIFY), `SRC/gui_controller.py` (MODIFY)

**Dependencies**: Phase 2 Step 2.3 (export dialog exists), Substep 4.1.1 (enhanced dialog UI), Substep 4.1.2 (JSON export), Substep 4.1.3 (CSV export)

**What to implement - EXACT STRUCTURE:**

#### Part A: Update Export Dialog to Show Enhanced Options

**In `SRC/gui/export_dialog.py`:**

```python
from PySide6.QtWidgets import (
    QDialog, QVBoxLayout, QHBoxLayout, QGroupBox, QCheckBox,
    QComboBox, QLabel, QPushButton, QFileDialog, QButtonGroup,
    QRadioButton, QMessageBox
)
from PySide6.QtCore import Qt
from typing import Dict, Any, Optional

class ExportDialog(QDialog):
    """Enhanced export dialog with additional options"""
    
    def __init__(self, parent=None, current_format: str = "csv"):
        super().__init__(parent)
        self.file_path = ""
        self.selected_format = current_format
        self.init_ui()
        self._setup_connections()
    
    def init_ui(self):
        """Initialize export dialog with enhanced options"""
        self.setWindowTitle("Export Results")
        self.setMinimumWidth(500)
        
        layout = QVBoxLayout(self)
        
        # Format selection (existing)
        format_group = QGroupBox("Export Format")
        format_layout = QVBoxLayout()
        
        self.format_group = QButtonGroup()
        self.csv_radio = QRadioButton("CSV")
        self.json_radio = QRadioButton("JSON")
        self.excel_radio = QRadioButton("Excel")
        
        # Set default based on current_format
        if self.selected_format == "csv":
            self.csv_radio.setChecked(True)
        elif self.selected_format == "json":
            self.json_radio.setChecked(True)
        elif self.selected_format == "excel":
            self.excel_radio.setChecked(True)
        else:
            self.csv_radio.setChecked(True)
        
        self.format_group.addButton(self.csv_radio, 0)
        self.format_group.addButton(self.json_radio, 1)
        self.format_group.addButton(self.excel_radio, 2)
        
        format_layout.addWidget(self.csv_radio)
        format_layout.addWidget(self.json_radio)
        format_layout.addWidget(self.excel_radio)
        format_group.setLayout(format_layout)
        layout.addWidget(format_group)
        
        # NEW: Export Options Group
        options_group = QGroupBox("Export Options")
        options_layout = QVBoxLayout()
        
        # Include metadata
        self.include_metadata_checkbox = QCheckBox("Include full metadata (genres, labels, release dates)")
        self.include_metadata_checkbox.setChecked(True)
        self.include_metadata_checkbox.setToolTip(
            "Include additional metadata fields like genres, labels, and release dates in the export"
        )
        options_layout.addWidget(self.include_metadata_checkbox)
        
        # Include processing info
        self.include_processing_info_checkbox = QCheckBox("Include processing information (timestamps, settings)")
        self.include_processing_info_checkbox.setChecked(False)
        self.include_processing_info_checkbox.setToolTip(
            "Include processing metadata like timestamps and search settings used during processing"
        )
        options_layout.addWidget(self.include_processing_info_checkbox)
        
        # Compression option (for JSON only)
        self.compress_checkbox = QCheckBox("Compress output (gzip)")
        self.compress_checkbox.setChecked(False)
        self.compress_checkbox.setToolTip(
            "Compress JSON output using gzip compression (significantly reduces file size for large exports)"
        )
        # Initially disabled, enabled when JSON is selected
        self.compress_checkbox.setEnabled(self.json_radio.isChecked())
        options_layout.addWidget(self.compress_checkbox)
        
        # Custom delimiter (for CSV only)
        delimiter_layout = QHBoxLayout()
        delimiter_layout.addWidget(QLabel("CSV Delimiter:"))
        self.delimiter_combo = QComboBox()
        self.delimiter_combo.addItems([",", ";", "\t", "|"])
        self.delimiter_combo.setCurrentText(",")
        self.delimiter_combo.setToolTip("Select the delimiter character for CSV files")
        # Initially disabled, enabled when CSV is selected
        self.delimiter_combo.setEnabled(self.csv_radio.isChecked())
        delimiter_layout.addWidget(self.delimiter_combo)
        delimiter_layout.addStretch()
        options_layout.addLayout(delimiter_layout)
        
        options_group.setLayout(options_layout)
        layout.addWidget(options_group)
        
        # File path selection
        file_layout = QHBoxLayout()
        file_layout.addWidget(QLabel("Output File:"))
        self.file_path_edit = QLineEdit()
        self.file_path_edit.setPlaceholderText("Select output file location...")
        file_layout.addWidget(self.file_path_edit)
        
        browse_button = QPushButton("Browse...")
        browse_button.clicked.connect(self.browse_file)
        file_layout.addWidget(browse_button)
        
        layout.addLayout(file_layout)
        
        # Buttons
        button_layout = QHBoxLayout()
        button_layout.addStretch()
        
        self.export_button = QPushButton("Export")
        self.export_button.setDefault(True)
        self.export_button.clicked.connect(self.accept)
        button_layout.addWidget(self.export_button)
        
        cancel_button = QPushButton("Cancel")
        cancel_button.clicked.connect(self.reject)
        button_layout.addWidget(cancel_button)
        
        layout.addLayout(button_layout)
    
    def _setup_connections(self):
        """Setup signal connections for dynamic UI updates"""
        # Enable/disable compression based on format
        self.json_radio.toggled.connect(lambda checked: self.compress_checkbox.setEnabled(checked))
        
        # Enable/disable delimiter based on format
        self.csv_radio.toggled.connect(lambda checked: self.delimiter_combo.setEnabled(checked))
        
        # Update file extension hint when format changes
        self.format_group.buttonClicked.connect(self._update_file_extension_hint)
    
    def _update_file_extension_hint(self):
        """Update file path extension hint based on selected format"""
        current_path = self.file_path_edit.text()
        if not current_path:
            return
        
        # Get selected format
        if self.json_radio.isChecked():
            new_ext = ".json"
            if self.compress_checkbox.isChecked():
                new_ext = ".json.gz"
        elif self.csv_radio.isChecked():
            delimiter = self.delimiter_combo.currentText()
            if delimiter == "\t":
                new_ext = ".tsv"
            elif delimiter == "|":
                new_ext = ".psv"
            else:
                new_ext = ".csv"
        else:  # Excel
            new_ext = ".xlsx"
        
        # Update path if it has an extension
        if "." in current_path:
            base_path = current_path.rsplit(".", 1)[0]
            self.file_path_edit.setText(base_path + new_ext)
    
    def browse_file(self):
        """Open file dialog to select output file"""
        # Determine file filter based on selected format
        if self.json_radio.isChecked():
            if self.compress_checkbox.isChecked():
                file_filter = "Compressed JSON Files (*.json.gz);;All Files (*.*)"
            else:
                file_filter = "JSON Files (*.json);;All Files (*.*)"
            default_ext = ".json"
        elif self.csv_radio.isChecked():
            delimiter = self.delimiter_combo.currentText()
            if delimiter == "\t":
                file_filter = "TSV Files (*.tsv);;All Files (*.*)"
                default_ext = ".tsv"
            elif delimiter == "|":
                file_filter = "PSV Files (*.psv);;All Files (*.*)"
                default_ext = ".psv"
            else:
                file_filter = "CSV Files (*.csv);;All Files (*.*)"
                default_ext = ".csv"
        else:  # Excel
            file_filter = "Excel Files (*.xlsx);;All Files (*.*)"
            default_ext = ".xlsx"
        
        file_path, _ = QFileDialog.getSaveFileName(
            self,
            "Export Results",
            "",
            file_filter
        )
        
        if file_path:
            # Ensure correct extension
            if not file_path.endswith(default_ext):
                file_path += default_ext
            self.file_path_edit.setText(file_path)
            self.file_path = file_path
    
    def get_export_options(self) -> Dict[str, Any]:
        """Get selected export options with enhancements"""
        # Determine format
        if self.json_radio.isChecked():
            format_type = "json"
        elif self.csv_radio.isChecked():
            format_type = "csv"
        else:
            format_type = "excel"
        
        options = {
            "format": format_type,
            "file_path": self.file_path_edit.text() or self.file_path,
            "include_metadata": self.include_metadata_checkbox.isChecked(),
            "include_processing_info": self.include_processing_info_checkbox.isChecked(),
            "compress": self.compress_checkbox.isChecked() if format_type == "json" else False,
            "delimiter": self.delimiter_combo.currentText() if format_type == "csv" else ",",
        }
        
        return options
    
    def validate(self) -> bool:
        """Validate export options"""
        file_path = self.file_path_edit.text() or self.file_path
        if not file_path:
            QMessageBox.warning(
                self,
                "Invalid Options",
                "Please select an output file location."
            )
            return False
        
        # Check if directory exists and is writable
        output_dir = os.path.dirname(file_path)
        if output_dir and not os.path.exists(output_dir):
            try:
                os.makedirs(output_dir, exist_ok=True)
            except OSError:
                QMessageBox.warning(
                    self,
                    "Invalid Path",
                    f"Cannot create output directory:\n{output_dir}"
                )
                return False
        
        return True
    
    def accept(self):
        """Override accept to validate before closing"""
        if self.validate():
            super().accept()
```

#### Part B: Integrate into Main Window Export Action

**In `SRC/gui/main_window.py`:**

```python
from SRC.gui.export_dialog import ExportDialog

class MainWindow(QMainWindow):
    """Main application window"""
    
    def __init__(self):
        super().__init__()
        # ... existing initialization ...
    
    def on_export_results(self):
        """Handle export results action"""
        if not self.results or len(self.results) == 0:
            QMessageBox.information(
                self,
                "No Results",
                "No results to export. Please process a playlist first."
            )
            return
        
        # Show export dialog
        dialog = ExportDialog(self, current_format="csv")
        
        if dialog.exec() == QDialog.Accepted:
            options = dialog.get_export_options()
            
            # Show progress if large dataset
            if len(self.results) > 100:
                progress = QProgressDialog("Exporting results...", "Cancel", 0, 0, self)
                progress.setWindowModality(Qt.WindowModal)
                progress.show()
                QApplication.processEvents()
            else:
                progress = None
            
            try:
                # Perform export
                self._perform_export(options, progress)
                
                if progress:
                    progress.close()
                
                # Show success message
                QMessageBox.information(
                    self,
                    "Export Complete",
                    f"Results exported successfully to:\n{options['file_path']}"
                )
                
            except Exception as e:
                if progress:
                    progress.close()
                
                QMessageBox.critical(
                    self,
                    "Export Failed",
                    f"Failed to export results:\n{str(e)}\n\n"
                    f"Please check that:\n"
                    f"- The file path is valid\n"
                    f"- You have write permissions\n"
                    f"- There is sufficient disk space"
                )
    
    def _perform_export(self, options: Dict[str, Any], progress: Optional[QProgressDialog] = None):
        """Perform the actual export operation"""
        from SRC.output_writer import write_json_file, write_csv_files, write_excel_file
        from SRC.config import get_config
        import os
        
        format_type = options["format"]
        file_path = options["file_path"]
        
        # Get settings for processing info if needed
        settings = None
        if options.get("include_processing_info", False):
            settings = get_config()
        
        if format_type == "json":
            write_json_file(
                self.results,
                base_filename=os.path.splitext(os.path.basename(file_path))[0],
                output_dir=os.path.dirname(file_path) or ".",
                include_metadata=options.get("include_metadata", True),
                include_processing_info=options.get("include_processing_info", False),
                compress=options.get("compress", False),
                settings=settings
            )
        elif format_type == "csv":
            write_csv_files(
                self.results,
                base_filename=os.path.splitext(os.path.basename(file_path))[0],
                output_dir=os.path.dirname(file_path) or ".",
                delimiter=options.get("delimiter", ","),
                include_metadata=options.get("include_metadata", True)
            )
        elif format_type == "excel":
            write_excel_file(
                self.results,
                file_path,
                include_metadata=options.get("include_metadata", True)
            )
```

**Implementation Checklist**:
- [ ] Update ExportDialog with enhanced options UI
- [ ] Add format-specific option enabling/disabling
- [ ] Add file extension hint updates
- [ ] Add validation logic
- [ ] Integrate into main window export action
- [ ] Add progress indication for large exports
- [ ] Add comprehensive error handling
- [ ] Test all UI interactions
- [ ] Test format switching
- [ ] Test option combinations

---

### Substep 4.1.5: Comprehensive Testing (1-2 days)

**Dependencies**: All previous substeps must be completed

#### Part A: Unit Tests (`SRC/test_enhanced_export.py`)

```python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Comprehensive unit tests for enhanced export features.

Tests all export options, error conditions, and edge cases.
"""

import unittest
import os
import tempfile
import gzip
import json
import csv
from pathlib import Path
from SRC.output_writer import write_json_file, write_csv_files
from SRC.processor import TrackResult
from dataclasses import dataclass
from typing import List, Optional

@dataclass
class MockTrackResult:
    """Mock TrackResult for testing"""
    playlist_index: int
    title: str
    artist: str
    matched: bool
    beatport_title: Optional[str] = None
    beatport_artists: Optional[str] = None
    beatport_url: Optional[str] = None
    match_score: Optional[float] = None
    confidence: Optional[str] = None
    beatport_key: Optional[str] = None
    beatport_bpm: Optional[str] = None
    beatport_year: Optional[int] = None
    beatport_label: Optional[str] = None
    beatport_genres: Optional[List[str]] = None
    beatport_release: Optional[str] = None
    beatport_release_date: Optional[str] = None
    candidates: Optional[List[dict]] = None

class TestEnhancedExport(unittest.TestCase):
    """Comprehensive tests for enhanced export functionality"""
    
    def setUp(self):
        """Set up test fixtures"""
        self.temp_dir = tempfile.mkdtemp()
        self.test_results = [
            MockTrackResult(
                playlist_index=1,
                title="Test Track 1",
                artist="Test Artist",
                matched=True,
                beatport_title="Test Track 1",
                beatport_artists="Test Artist",
                beatport_url="https://beatport.com/track/test/123",
                match_score=95.5,
                confidence="High",
                beatport_key="C Major",
                beatport_bpm="128",
                beatport_year=2023,
                beatport_label="Test Label",
                beatport_genres=["House", "Deep House"],
                beatport_release="Test Release",
                beatport_release_date="2023-01-15"
            ),
            MockTrackResult(
                playlist_index=2,
                title="Test Track 2",
                artist="Another Artist",
                matched=False,
                beatport_title=None,
                beatport_artists=None
            ),
            MockTrackResult(
                playlist_index=3,
                title="Track with Special Chars: émojis 🎵 & symbols <>&\"'",
                artist="Artist with 'quotes' & \"double quotes\"",
                matched=True,
                beatport_title="Track with Special Chars: émojis 🎵 & symbols <>&\"'",
                beatport_artists="Artist with 'quotes' & \"double quotes\"",
                beatport_url="https://beatport.com/track/test/456",
                match_score=88.0,
                confidence="Medium",
                beatport_key="A Minor",
                beatport_bpm="130",
                beatport_year=2024
            )
        ]
    
    def tearDown(self):
        """Clean up test fixtures"""
        import shutil
        shutil.rmtree(self.temp_dir, ignore_errors=True)
    
    def test_json_export_basic(self):
        """Test basic JSON export without options"""
        filepath = write_json_file(
            self.test_results,
            "test_export",
            self.temp_dir,
            include_metadata=False,
            include_processing_info=False,
            compress=False
        )
        
        self.assertTrue(os.path.exists(filepath))
        self.assertTrue(filepath.endswith(".json"))
        
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        self.assertEqual(data["total_tracks"], 3)
        self.assertEqual(data["matched_tracks"], 2)
        self.assertEqual(len(data["tracks"]), 3)
        self.assertIn("version", data)
        self.assertIn("generated", data)
    
    def test_json_export_with_metadata(self):
        """Test JSON export with metadata inclusion"""
        filepath = write_json_file(
            self.test_results,
            "test_export_metadata",
            self.temp_dir,
            include_metadata=True,
            include_processing_info=False,
            compress=False
        )
        
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        # Check that matched tracks have metadata
        matched_track = next(t for t in data["tracks"] if t["matched"])
        self.assertIn("match", matched_track)
        self.assertIn("metadata", matched_track["match"])
        self.assertIn("label", matched_track["match"]["metadata"])
        self.assertIn("genres", matched_track["match"]["metadata"])
    
    def test_json_export_with_processing_info(self):
        """Test JSON export with processing information"""
        settings = {"setting1": "value1", "setting2": "value2"}
        
        filepath = write_json_file(
            self.test_results,
            "test_export_processing",
            self.temp_dir,
            include_metadata=False,
            include_processing_info=True,
            compress=False,
            settings=settings
        )
        
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        self.assertIn("processing_info", data)
        self.assertEqual(data["processing_info"]["settings"], settings)
        self.assertIn("timestamp", data["processing_info"])
    
    def test_json_export_with_compression(self):
        """Test JSON export with gzip compression"""
        filepath = write_json_file(
            self.test_results,
            "test_export_compressed",
            self.temp_dir,
            include_metadata=True,
            include_processing_info=False,
            compress=True
        )
        
        self.assertTrue(os.path.exists(filepath))
        self.assertTrue(filepath.endswith(".json.gz"))
        
        # Verify it's actually compressed (smaller than uncompressed)
        compressed_size = os.path.getsize(filepath)
        
        # Create uncompressed version for comparison
        uncompressed_path = write_json_file(
            self.test_results,
            "test_export_uncompressed",
            self.temp_dir,
            include_metadata=True,
            include_processing_info=False,
            compress=False
        )
        uncompressed_size = os.path.getsize(uncompressed_path)
        
        # Compressed should be smaller (for this test data)
        self.assertLess(compressed_size, uncompressed_size)
        
        # Verify we can read compressed file
        with gzip.open(filepath, 'rt', encoding='utf-8') as f:
            data = json.load(f)
        
        self.assertEqual(data["total_tracks"], 3)
    
    def test_json_export_special_characters(self):
        """Test JSON export handles special characters correctly"""
        filepath = write_json_file(
            self.test_results,
            "test_export_special",
            self.temp_dir,
            include_metadata=True,
            include_processing_info=False,
            compress=False
        )
        
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        # Find track with special characters
        special_track = next(
            t for t in data["tracks"]
            if "émojis" in t.get("title", "")
        )
        
        self.assertIn("émojis", special_track["title"])
        self.assertIn("🎵", special_track["title"])
    
    def test_csv_export_basic(self):
        """Test basic CSV export"""
        result = write_csv_files(
            self.test_results,
            "test_csv",
            self.temp_dir,
            delimiter=",",
            include_metadata=False
        )
        
        self.assertIn("main", result)
        self.assertTrue(os.path.exists(result["main"]))
        
        # Verify CSV content
        with open(result["main"], 'r', encoding='utf-8', newline='') as f:
            reader = csv.reader(f)
            rows = list(reader)
        
        self.assertEqual(len(rows), 4)  # Header + 3 tracks
        self.assertEqual(rows[0][0], "Index")
    
    def test_csv_export_custom_delimiter_comma(self):
        """Test CSV export with comma delimiter"""
        result = write_csv_files(
            self.test_results,
            "test_csv_comma",
            self.temp_dir,
            delimiter=",",
            include_metadata=True
        )
        
        with open(result["main"], 'r', encoding='utf-8', newline='') as f:
            content = f.read()
        
        # Verify comma delimiter
        lines = content.split('\n')
        self.assertGreater(len(lines[0].split(',')), 5)
    
    def test_csv_export_custom_delimiter_semicolon(self):
        """Test CSV export with semicolon delimiter"""
        result = write_csv_files(
            self.test_results,
            "test_csv_semicolon",
            self.temp_dir,
            delimiter=";",
            include_metadata=True
        )
        
        with open(result["main"], 'r', encoding='utf-8', newline='') as f:
            content = f.read()
        
        # Verify semicolon delimiter
        lines = content.split('\n')
        self.assertGreater(len(lines[0].split(';')), 5)
    
    def test_csv_export_custom_delimiter_tab(self):
        """Test CSV export with tab delimiter (TSV)"""
        result = write_csv_files(
            self.test_results,
            "test_csv_tab",
            self.temp_dir,
            delimiter="\t",
            include_metadata=True
        )
        
        self.assertTrue(result["main"].endswith(".tsv"))
        
        with open(result["main"], 'r', encoding='utf-8', newline='') as f:
            reader = csv.reader(f, delimiter='\t')
            rows = list(reader)
        
        self.assertEqual(len(rows), 4)  # Header + 3 tracks
    
    def test_csv_export_custom_delimiter_pipe(self):
        """Test CSV export with pipe delimiter"""
        result = write_csv_files(
            self.test_results,
            "test_csv_pipe",
            self.temp_dir,
            delimiter="|",
            include_metadata=True
        )
        
        self.assertTrue(result["main"].endswith(".psv"))
        
        with open(result["main"], 'r', encoding='utf-8', newline='') as f:
            reader = csv.reader(f, delimiter='|')
            rows = list(reader)
        
        self.assertEqual(len(rows), 4)
    
    def test_csv_export_with_metadata(self):
        """Test CSV export with metadata columns"""
        result = write_csv_files(
            self.test_results,
            "test_csv_metadata",
            self.temp_dir,
            delimiter=",",
            include_metadata=True
        )
        
        with open(result["main"], 'r', encoding='utf-8', newline='') as f:
            reader = csv.reader(f)
            header = next(reader)
        
        # Check metadata columns are present
        self.assertIn("Label", header)
        self.assertIn("Genres", header)
        self.assertIn("Release", header)
        self.assertIn("Release Date", header)
    
    def test_csv_export_candidates_file(self):
        """Test CSV export creates candidates file when candidates exist"""
        # Add candidates to test results
        self.test_results[0].candidates = [
            {"beatport_title": "Candidate 1", "match_score": 85.0},
            {"beatport_title": "Candidate 2", "match_score": 80.0}
        ]
        
        result = write_csv_files(
            self.test_results,
            "test_csv_candidates",
            self.temp_dir,
            delimiter=",",
            include_metadata=False
        )
        
        self.assertIn("candidates", result)
        self.assertIsNotNone(result["candidates"])
        self.assertTrue(os.path.exists(result["candidates"]))
    
    def test_export_error_handling_invalid_path(self):
        """Test error handling for invalid file path"""
        invalid_path = "/nonexistent/directory/file.json"
        
        with self.assertRaises(OSError):
            write_json_file(
                self.test_results,
                "test",
                invalid_path,
                include_metadata=False,
                include_processing_info=False,
                compress=False
            )
    
    def test_export_error_handling_invalid_delimiter(self):
        """Test error handling for invalid delimiter"""
        with self.assertRaises(ValueError):
            write_csv_files(
                self.test_results,
                "test",
                self.temp_dir,
                delimiter="invalid",
                include_metadata=False
            )
    
    def test_export_performance_tracking(self):
        """Test that export operations are tracked in performance metrics"""
        from SRC.performance import performance_collector
        
        # Reset collector
        performance_collector.reset()
        performance_collector.start_session()
        
        try:
            filepath = write_json_file(
                self.test_results,
                "test_perf",
                self.temp_dir,
                include_metadata=True,
                include_processing_info=False,
                compress=False
            )
            
            # Check if performance was tracked (if method exists)
            stats = performance_collector.get_stats()
            # Note: This test depends on performance_collector having record_export method
            # which may be added in Phase 3 or this step
            
        finally:
            performance_collector.end_session()
    
    def test_export_empty_results(self):
        """Test export with empty results list"""
        filepath = write_json_file(
            [],
            "test_empty",
            self.temp_dir,
            include_metadata=False,
            include_processing_info=False,
            compress=False
        )
        
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        self.assertEqual(data["total_tracks"], 0)
        self.assertEqual(data["matched_tracks"], 0)
        self.assertEqual(len(data["tracks"]), 0)
    
    def test_export_large_dataset(self):
        """Test export with large dataset (performance test)"""
        import time
        
        # Create large dataset
        large_results = [
            MockTrackResult(
                playlist_index=i,
                title=f"Track {i}",
                artist=f"Artist {i % 10}",
                matched=(i % 2 == 0),
                beatport_title=f"Track {i}" if i % 2 == 0 else None
            )
            for i in range(1000)
        ]
        
        start_time = time.time()
        filepath = write_json_file(
            large_results,
            "test_large",
            self.temp_dir,
            include_metadata=True,
            include_processing_info=False,
            compress=True
        )
        export_time = time.time() - start_time
        
        # Export should complete in reasonable time (< 10 seconds for 1000 tracks)
        self.assertLess(export_time, 10.0)
        
        # Verify file was created and is readable
        self.assertTrue(os.path.exists(filepath))
        with gzip.open(filepath, 'rt', encoding='utf-8') as f:
            data = json.load(f)
        
        self.assertEqual(data["total_tracks"], 1000)

if __name__ == '__main__':
    unittest.main()
```

#### Part B: GUI Integration Tests (`SRC/test_export_dialog.py`)

```python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
GUI integration tests for export dialog.

Tests UI interactions, validation, and integration with export functions.
"""

import unittest
from unittest.mock import Mock, patch, MagicMock
from PySide6.QtWidgets import QApplication
from PySide6.QtTest import QTest
from PySide6.QtCore import Qt
import sys
import os

# Initialize QApplication for tests
if not QApplication.instance():
    app = QApplication(sys.argv)

from SRC.gui.export_dialog import ExportDialog

class TestExportDialog(unittest.TestCase):
    """Tests for ExportDialog GUI component"""
    
    def setUp(self):
        """Set up test fixtures"""
        self.dialog = ExportDialog()
    
    def tearDown(self):
        """Clean up test fixtures"""
        self.dialog.close()
    
    def test_dialog_initialization(self):
        """Test dialog initializes correctly"""
        self.assertIsNotNone(self.dialog)
        self.assertEqual(self.dialog.windowTitle(), "Export Results")
    
    def test_format_selection_csv(self):
        """Test CSV format selection"""
        self.dialog.csv_radio.setChecked(True)
        options = self.dialog.get_export_options()
        self.assertEqual(options["format"], "csv")
        self.assertTrue(self.dialog.delimiter_combo.isEnabled())
        self.assertFalse(self.dialog.compress_checkbox.isEnabled())
    
    def test_format_selection_json(self):
        """Test JSON format selection"""
        self.dialog.json_radio.setChecked(True)
        options = self.dialog.get_export_options()
        self.assertEqual(options["format"], "json")
        self.assertFalse(self.dialog.delimiter_combo.isEnabled())
        self.assertTrue(self.dialog.compress_checkbox.isEnabled())
    
    def test_format_selection_excel(self):
        """Test Excel format selection"""
        self.dialog.excel_radio.setChecked(True)
        options = self.dialog.get_export_options()
        self.assertEqual(options["format"], "excel")
        self.assertFalse(self.dialog.delimiter_combo.isEnabled())
        self.assertFalse(self.dialog.compress_checkbox.isEnabled())
    
    def test_metadata_checkbox(self):
        """Test metadata inclusion checkbox"""
        self.dialog.include_metadata_checkbox.setChecked(True)
        options = self.dialog.get_export_options()
        self.assertTrue(options["include_metadata"])
        
        self.dialog.include_metadata_checkbox.setChecked(False)
        options = self.dialog.get_export_options()
        self.assertFalse(options["include_metadata"])
    
    def test_processing_info_checkbox(self):
        """Test processing info inclusion checkbox"""
        self.dialog.include_processing_info_checkbox.setChecked(True)
        options = self.dialog.get_export_options()
        self.assertTrue(options["include_processing_info"])
    
    def test_compression_checkbox(self):
        """Test compression checkbox (JSON only)"""
        self.dialog.json_radio.setChecked(True)
        self.dialog.compress_checkbox.setChecked(True)
        options = self.dialog.get_export_options()
        self.assertTrue(options["compress"])
        
        # Compression should be False for non-JSON formats
        self.dialog.csv_radio.setChecked(True)
        options = self.dialog.get_export_options()
        self.assertFalse(options["compress"])
    
    def test_delimiter_selection(self):
        """Test delimiter selection (CSV only)"""
        self.dialog.csv_radio.setChecked(True)
        self.dialog.delimiter_combo.setCurrentText(";")
        options = self.dialog.get_export_options()
        self.assertEqual(options["delimiter"], ";")
    
    def test_validation_no_file_path(self):
        """Test validation fails when no file path provided"""
        self.dialog.file_path_edit.clear()
        self.assertFalse(self.dialog.validate())
    
    def test_validation_with_file_path(self):
        """Test validation passes with valid file path"""
        import tempfile
        temp_file = tempfile.NamedTemporaryFile(delete=False, suffix='.csv')
        temp_file.close()
        
        self.dialog.file_path_edit.setText(temp_file.name)
        self.assertTrue(self.dialog.validate())
        
        os.unlink(temp_file.name)
    
    def test_file_extension_update_json(self):
        """Test file extension updates when format changes to JSON"""
        self.dialog.file_path_edit.setText("/path/to/file.csv")
        self.dialog.json_radio.setChecked(True)
        
        # Extension should be updated
        path = self.dialog.file_path_edit.text()
        self.assertTrue(path.endswith(".json") or path.endswith(".json.gz"))
    
    def test_file_extension_update_csv(self):
        """Test file extension updates when format changes to CSV"""
        self.dialog.file_path_edit.setText("/path/to/file.json")
        self.dialog.csv_radio.setChecked(True)
        
        path = self.dialog.file_path_edit.text()
        self.assertTrue(path.endswith(".csv") or path.endswith(".tsv") or path.endswith(".psv"))

if __name__ == '__main__':
    unittest.main()
```

#### Part C: Integration Tests (`SRC/test_export_integration.py`)

```python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Integration tests for export functionality.

Tests end-to-end export workflow from GUI to file system.
"""

import unittest
import tempfile
import os
from unittest.mock import Mock, patch
from PySide6.QtWidgets import QApplication
import sys

if not QApplication.instance():
    app = QApplication(sys.argv)

from SRC.gui.main_window import MainWindow
from SRC.gui.export_dialog import ExportDialog

class TestExportIntegration(unittest.TestCase):
    """Integration tests for export workflow"""
    
    def setUp(self):
        """Set up test fixtures"""
        self.temp_dir = tempfile.mkdtemp()
        self.main_window = MainWindow()
        # Mock results
        self.main_window.results = [
            Mock(
                playlist_index=1,
                title="Test Track",
                artist="Test Artist",
                matched=True,
                beatport_title="Test Track",
                beatport_artists="Test Artist"
            )
        ]
    
    def tearDown(self):
        """Clean up test fixtures"""
        import shutil
        self.main_window.close()
        shutil.rmtree(self.temp_dir, ignore_errors=True)
    
    @patch('SRC.gui.main_window.QFileDialog.getSaveFileName')
    def test_export_workflow_json(self, mock_dialog):
        """Test complete export workflow for JSON"""
        # Mock file dialog
        test_file = os.path.join(self.temp_dir, "test_export.json")
        mock_dialog.return_value = (test_file, "JSON Files (*.json)")
        
        # Mock export dialog
        with patch('SRC.gui.main_window.ExportDialog') as mock_dialog_class:
            mock_dialog_instance = Mock()
            mock_dialog_instance.exec.return_value = ExportDialog.Accepted
            mock_dialog_instance.get_export_options.return_value = {
                "format": "json",
                "file_path": test_file,
                "include_metadata": True,
                "include_processing_info": False,
                "compress": False,
                "delimiter": ","
            }
            mock_dialog_class.return_value = mock_dialog_instance
            
            # Execute export
            self.main_window.on_export_results()
            
            # Verify dialog was shown
            mock_dialog_class.assert_called_once()
            mock_dialog_instance.exec.assert_called_once()

if __name__ == '__main__':
    unittest.main()
```

#### Part D: Manual Testing Checklist

**UI Testing Checklist**:
- [ ] Open export dialog from main window
- [ ] Verify all format options are visible
- [ ] Verify export options group is visible
- [ ] Test format switching (CSV/JSON/Excel)
- [ ] Verify compression checkbox enables/disables based on format
- [ ] Verify delimiter combo enables/disables based on format
- [ ] Test metadata checkbox
- [ ] Test processing info checkbox
- [ ] Test compression checkbox (JSON only)
- [ ] Test delimiter selection (CSV only)
- [ ] Test file browser dialog
- [ ] Test file extension updates when format changes
- [ ] Test validation (no file path)
- [ ] Test validation (invalid path)
- [ ] Test validation (valid path)
- [ ] Test export button with valid options
- [ ] Test cancel button
- [ ] Test export with real data
- [ ] Test export progress indication (large datasets)
- [ ] Test success message
- [ ] Test error message display
- [ ] Verify exported files are created
- [ ] Verify exported files contain correct data
- [ ] Test with special characters in track data
- [ ] Test with empty results
- [ ] Test with large datasets (1000+ tracks)

**Functional Testing Checklist**:
- [ ] JSON export without options works
- [ ] JSON export with metadata works
- [ ] JSON export with processing info works
- [ ] JSON export with compression works
- [ ] JSON export with all options works
- [ ] CSV export with comma delimiter works
- [ ] CSV export with semicolon delimiter works
- [ ] CSV export with tab delimiter works
- [ ] CSV export with pipe delimiter works
- [ ] CSV export with metadata works
- [ ] CSV export without metadata works
- [ ] Excel export works (if implemented)
- [ ] Export handles special characters correctly
- [ ] Export handles empty results correctly
- [ ] Export handles large datasets efficiently
- [ ] Export creates candidates file when candidates exist
- [ ] Export error handling works for invalid paths
- [ ] Export error handling works for permission errors
- [ ] Export error handling works for disk full
- [ ] Performance tracking records export operations

**Cross-Step Integration Testing**:
- [ ] Export works after Step 4.2 (Advanced Filtering) - verify filtered results export correctly
- [ ] Export works with Step 4.3 (Async I/O) - verify performance metrics in processing info
- [ ] Export integrates with Phase 3 performance dashboard
- [ ] Export files can be imported/read by other tools
- [ ] Export maintains backward compatibility with existing export code

**Performance Testing**:
- [ ] Export 100 tracks: < 2 seconds
- [ ] Export 1000 tracks: < 10 seconds
- [ ] Export 10000 tracks: < 60 seconds
- [ ] Compressed JSON is smaller than uncompressed
- [ ] Memory usage acceptable for large exports
- [ ] No memory leaks during export operations

**Error Scenario Testing**:
- [ ] Invalid file path → Shows error message
- [ ] No write permissions → Shows error message
- [ ] Disk full → Shows error message
- [ ] Network drive unavailable → Shows error message
- [ ] Invalid delimiter → Raises ValueError
- [ ] JSON serialization error → Handles gracefully
- [ ] CSV writing error → Handles gracefully
- [ ] Compression error → Falls back or shows error

**Acceptance Criteria Verification**:
- ✅ All export options available in dialog
- ✅ All options work correctly
- ✅ Error handling robust
- ✅ Performance acceptable
- ✅ UI intuitive and responsive
- ✅ All tests passing
- ✅ Manual testing complete

---

## Testing Requirements

### Unit Tests
- [ ] Test JSON export with all option combinations
- [ ] Test CSV export with all delimiter options
- [ ] Test compression functionality
- [ ] Test metadata inclusion/exclusion
- [ ] Test processing info inclusion
- [ ] Test error handling for all error paths
- [ ] Test performance tracking integration
- [ ] Minimum 80% code coverage

### Integration Tests
- [ ] Test export dialog integration
- [ ] Test export with real processing results
- [ ] Test all export formats
- [ ] Test with large datasets
- [ ] Test backward compatibility

### Performance Tests
- [ ] Measure export time for various dataset sizes
- [ ] Measure compression effectiveness
- [ ] Validate performance metrics are recorded
- [ ] Test memory usage with large exports

---

## Error Handling

### Error Scenarios
1. **File Write Errors**
   - Permission denied → Show user-friendly message
   - Disk full → Show error with disk space info
   - Invalid path → Validate path before export

2. **Compression Errors**
   - Gzip failure → Fall back to uncompressed
   - Memory error → Stream compression for large files

3. **Data Serialization Errors**
   - JSON encoding errors → Handle special characters
   - CSV delimiter conflicts → Escape or quote fields

4. **User Feedback**
   - All errors show clear messages
   - Provide actionable guidance
   - Log errors for debugging

---

## Backward Compatibility

### Compatibility Requirements
- [ ] Existing `write_json_file` calls work unchanged
- [ ] Existing `write_csv_files` calls work unchanged
- [ ] Default behavior matches previous implementation
- [ ] Old export files can still be read
- [ ] No breaking changes to function signatures

### Migration Path
- New parameters are optional with defaults
- Old code continues to work
- No configuration migration needed

---

## Documentation Requirements

### User Guide Updates
- [ ] Document new export options
- [ ] Explain metadata inclusion
- [ ] Explain processing info inclusion
- [ ] Explain compression option
- [ ] Explain custom delimiter option
- [ ] Provide usage examples
- [ ] Update screenshots

### API Documentation
- [ ] Document new function parameters
- [ ] Document return values
- [ ] Document error conditions
- [ ] Document performance tracking

### Code Documentation
- [ ] Inline comments for complex logic
- [ ] Docstrings for all functions
- [ ] Type hints for all parameters

---

## Phase 3 Integration

### Performance Metrics
- [ ] Export operations tracked in performance dashboard
- [ ] Export duration recorded
- [ ] File size recorded
- [ ] Export format tracked
- [ ] Compression ratio calculated

### Performance Reports
- [ ] Export statistics included in reports
- [ ] Export time breakdown
- [ ] File size statistics

---

## Acceptance Criteria
- ✅ Enhanced export options available in dialog
- ✅ Metadata inclusion works correctly
- ✅ Processing info inclusion works correctly
- ✅ Compression works for JSON
- ✅ Custom delimiter works for CSV
- ✅ All options tested and working
- ✅ Error handling robust
- ✅ Performance tracking integrated
- ✅ Backward compatibility maintained
- ✅ Documentation updated

---

## Implementation Checklist Summary
- [ ] Substep 4.1.1: Update Export Dialog UI
- [ ] Substep 4.1.2: Enhance JSON Export
- [ ] Substep 4.1.3: Enhance CSV Export
- [ ] Substep 4.1.4: Integrate into GUI Controller
- [ ] Substep 4.1.5: Testing
- [ ] Documentation updated
- [ ] User guide updated
- [ ] All tests passing

---

**Next Step**: After completing Step 4.1, proceed to Step 4.2 (Advanced Filtering) or Step 4.3 (Async I/O) based on priority and Phase 3 metrics analysis.

