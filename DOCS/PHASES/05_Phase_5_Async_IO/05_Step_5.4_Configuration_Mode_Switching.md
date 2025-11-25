# Step 5.4: Add Configuration and Mode Switching with UI Integration

**Status**: 📝 Planned  
**Priority**: 🚀 Medium (Only if Step 5.0 recommends implementation)  
**Estimated Duration**: 1-2 days  
**Dependencies**: Step 5.3 (async processor wrapper), Phase 1 (config panel exists)

---

## Goal

Add UI configuration for async I/O and mode switching between sync/async. This allows users to enable async I/O through the settings panel and provides helpful guidance.

---

## Success Criteria

- [ ] Async I/O configuration added to `config.py`
- [ ] UI controls added to config panel
- [ ] Settings persistence works
- [ ] Mode switching works correctly
- [ ] Helpful tooltips and information dialogs
- [ ] Integration with main window processing
- [ ] All tests passing
- [ ] Documentation complete

---

## Implementation Details

### Part A: Configuration Module Updates

**File**: `SRC/config.py` (MODIFY)

**Location**: Add after existing configuration constants

**Exact Implementation**:

```python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Add this section to SRC/config.py
Place it after existing configuration constants
"""

from typing import Dict, Any

# ============================================================================
# Async I/O Configuration
# ============================================================================
# These settings control async I/O behavior
# Default to sync mode for backward compatibility

ASYNC_IO_ENABLED = False  # Default to sync mode (backward compatible)
ASYNC_MAX_CONCURRENT_TRACKS = 5  # Max tracks processed concurrently
ASYNC_MAX_CONCURRENT_REQUESTS = 10  # Max HTTP requests per track
ASYNC_REQUEST_TIMEOUT = 30  # Timeout in seconds for async requests
ASYNC_RETRY_ATTEMPTS = 3  # Number of retry attempts for failed requests


def get_async_config() -> Dict[str, Any]:
    """
    Get async I/O configuration.
    
    Returns:
        Dictionary with async I/O settings:
        - enabled: bool - Whether async I/O is enabled
        - max_concurrent_tracks: int - Max tracks processed concurrently
        - max_concurrent_requests: int - Max HTTP requests per track
        - request_timeout: int - Request timeout in seconds
        - retry_attempts: int - Number of retry attempts
    """
    return {
        "enabled": ASYNC_IO_ENABLED,
        "max_concurrent_tracks": ASYNC_MAX_CONCURRENT_TRACKS,
        "max_concurrent_requests": ASYNC_MAX_CONCURRENT_REQUESTS,
        "request_timeout": ASYNC_REQUEST_TIMEOUT,
        "retry_attempts": ASYNC_RETRY_ATTEMPTS
    }


def set_async_config(
    enabled: bool,
    max_tracks: int = 5,
    max_requests: int = 10,
    timeout: int = 30,
    retry_attempts: int = 3
):
    """
    Set async I/O configuration.
    
    Args:
        enabled: Whether to enable async I/O
        max_tracks: Maximum tracks to process concurrently (1-20)
        max_requests: Maximum requests per track (1-20)
        timeout: Request timeout in seconds (10-120)
        retry_attempts: Number of retry attempts (1-5)
    
    Raises:
        ValueError: If parameters are out of valid range
    """
    global ASYNC_IO_ENABLED, ASYNC_MAX_CONCURRENT_TRACKS
    global ASYNC_MAX_CONCURRENT_REQUESTS, ASYNC_REQUEST_TIMEOUT, ASYNC_RETRY_ATTEMPTS
    
    # Validate parameters
    if not (1 <= max_tracks <= 20):
        raise ValueError(f"max_tracks must be between 1 and 20, got {max_tracks}")
    if not (1 <= max_requests <= 20):
        raise ValueError(f"max_requests must be between 1 and 20, got {max_requests}")
    if not (10 <= timeout <= 120):
        raise ValueError(f"timeout must be between 10 and 120, got {timeout}")
    if not (1 <= retry_attempts <= 5):
        raise ValueError(f"retry_attempts must be between 1 and 5, got {retry_attempts}")
    
    ASYNC_IO_ENABLED = enabled
    ASYNC_MAX_CONCURRENT_TRACKS = max_tracks
    ASYNC_MAX_CONCURRENT_REQUESTS = max_requests
    ASYNC_REQUEST_TIMEOUT = timeout
    ASYNC_RETRY_ATTEMPTS = retry_attempts
```

---

### Part B: GUI Configuration Panel Integration

**File**: `SRC/gui/config_panel.py` (MODIFY)

**Location**: Add to Advanced Settings section (or create new section)

**Exact Implementation**:

```python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Add this code to SRC/gui/config_panel.py
Add to the Advanced Settings section (or create if it doesn't exist)
"""

from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QGroupBox, QCheckBox,
    QSpinBox, QLabel, QPushButton, QMessageBox
)
from PySide6.QtCore import Qt
from typing import Dict, Any

# Import config functions
from config import get_async_config, set_async_config


# In ConfigPanel class, add to init_ui() method:

def _setup_async_io_settings(self, layout: QVBoxLayout):
    """
    Setup async I/O settings group.
    
    Add this method to ConfigPanel class.
    Call it from init_ui() method.
    """
    # Async I/O Settings Group
    async_group = QGroupBox("Async I/O Settings (Advanced)")
    async_group.setToolTip(
        "Configure async I/O for faster processing.\n\n"
        "Only enable if Phase 3 metrics show network I/O is a bottleneck."
    )
    async_layout = QVBoxLayout()
    async_layout.setSpacing(10)
    
    # Async I/O Enable Checkbox
    self.async_io_check = QCheckBox("Enable Async I/O for faster processing")
    self.async_io_check.setChecked(False)
    self.async_io_check.setToolTip(
        "Enable async I/O for parallel network requests.\n\n"
        "Benefits:\n"
        "• Faster processing for multiple tracks (30-60% speedup)\n"
        "• Parallel network requests\n"
        "• Better resource utilization\n\n"
        "When to use:\n"
        "• Network I/O is a bottleneck (>40% of total time)\n"
        "• Processing multiple tracks (>10 tracks)\n"
        "• Good network connection\n\n"
        "Considerations:\n"
        "• May increase memory usage\n"
        "• Requires Python 3.7+\n"
        "• May be slower for single tracks"
    )
    self.async_io_check.setAccessibleName("Enable async I/O checkbox")
    self.async_io_check.setAccessibleDescription(
        "Check to enable async I/O for faster processing. "
        "Only enable if network I/O is a bottleneck."
    )
    async_layout.addWidget(self.async_io_check)
    
    # Async settings container (enabled when checkbox is checked)
    self.async_settings_widget = QWidget()
    async_settings_layout = QVBoxLayout(self.async_settings_widget)
    async_settings_layout.setContentsMargins(20, 10, 10, 10)
    async_settings_layout.setSpacing(10)
    
    # Max concurrent tracks
    tracks_layout = QHBoxLayout()
    tracks_label = QLabel("Max Concurrent Tracks:")
    self.async_max_tracks = QSpinBox()
    self.async_max_tracks.setMinimum(1)
    self.async_max_tracks.setMaximum(20)
    self.async_max_tracks.setValue(5)
    self.async_max_tracks.setToolTip(
        "Maximum number of tracks to process concurrently.\n\n"
        "Higher values = faster but more memory usage.\n"
        "Recommended: 3-10 for most systems.\n\n"
        "Memory impact: ~2-5MB per concurrent track."
    )
    self.async_max_tracks.setAccessibleName("Max concurrent tracks spinbox")
    self.async_max_tracks.setAccessibleDescription(
        "Set the maximum number of tracks to process at the same time. "
        "Higher values are faster but use more memory."
    )
    tracks_label.setBuddy(self.async_max_tracks)
    tracks_layout.addWidget(tracks_label)
    tracks_layout.addWidget(self.async_max_tracks)
    tracks_layout.addStretch()
    async_settings_layout.addLayout(tracks_layout)
    
    # Max concurrent requests per track
    requests_layout = QHBoxLayout()
    requests_label = QLabel("Max Concurrent Requests per Track:")
    self.async_max_requests = QSpinBox()
    self.async_max_requests.setMinimum(1)
    self.async_max_requests.setMaximum(20)
    self.async_max_requests.setValue(10)
    self.async_max_requests.setToolTip(
        "Maximum number of HTTP requests per track.\n\n"
        "Higher values = faster but more network load.\n"
        "Recommended: 5-15 for most cases.\n\n"
        "Note: Too high may trigger rate limiting."
    )
    self.async_max_requests.setAccessibleName("Max concurrent requests spinbox")
    self.async_max_requests.setAccessibleDescription(
        "Set the maximum number of HTTP requests per track. "
        "Higher values are faster but may trigger rate limiting."
    )
    requests_label.setBuddy(self.async_max_requests)
    requests_layout.addWidget(requests_label)
    requests_layout.addWidget(self.async_max_requests)
    requests_layout.addStretch()
    async_settings_layout.addLayout(requests_layout)
    
    # Performance recommendation label
    self.async_recommendation_label = QLabel("")
    self.async_recommendation_label.setWordWrap(True)
    self.async_recommendation_label.setStyleSheet(
        "color: #1976d2; font-style: italic; padding: 5px;"
    )
    self.async_recommendation_label.setAccessibleName("Async I/O recommendation label")
    async_settings_layout.addWidget(self.async_recommendation_label)
    
    # Info button
    info_button = QPushButton("ℹ️ When to Use Async I/O")
    info_button.setToolTip("Show detailed information about async I/O")
    info_button.setAccessibleName("Async I/O information button")
    info_button.setAccessibleDescription("Click to see detailed information about async I/O")
    info_button.clicked.connect(self.show_async_info)
    async_settings_layout.addWidget(info_button)
    
    # Add settings widget to async group
    async_layout.addWidget(self.async_settings_widget)
    
    # Set initial state (disabled by default)
    self.async_settings_widget.setEnabled(False)
    
    # Set layout
    async_group.setLayout(async_layout)
    
    # Add to main layout (in Advanced Settings section)
    layout.addWidget(async_group)
    
    # Connect signals
    self.async_io_check.toggled.connect(self._on_async_io_toggled)
    self.async_max_tracks.valueChanged.connect(self._update_recommendation)
    self.async_max_requests.valueChanged.connect(self._update_recommendation)


def _on_async_io_toggled(self, checked: bool):
    """
    Handle async I/O checkbox toggle.
    
    Add this method to ConfigPanel class.
    """
    self.async_settings_widget.setEnabled(checked)
    self._update_recommendation()
    
    if checked:
        # Show warning if Phase 3 metrics suggest it's not needed
        self._check_async_recommendation()


def _check_async_recommendation(self):
    """
    Check if async I/O is recommended based on Phase 3 metrics.
    
    Add this method to ConfigPanel class.
    """
    try:
        from performance import performance_collector
        from performance_analyzer import analyze_network_time_percentage
        
        stats = performance_collector.get_stats()
        if stats and stats.query_metrics:
            # Try to analyze network time
            # This would require exported metrics JSON
            # For now, just show general recommendation
            pass
    except Exception:
        # If metrics not available, that's okay
        pass


def _update_recommendation(self):
    """
    Update performance recommendation label.
    
    Add this method to ConfigPanel class.
    """
    if not self.async_io_check.isChecked():
        self.async_recommendation_label.setText("")
        return
    
    max_tracks = self.async_max_tracks.value()
    max_requests = self.async_max_requests.value()
    
    estimated_memory = max_tracks * max_requests * 2  # Rough estimate in MB
    
    recommendation = (
        f"Recommended for processing {max_tracks}+ tracks. "
        f"Expected speedup: 30-60% for multi-track playlists. "
        f"Memory usage: ~{estimated_memory}MB additional."
    )
    
    self.async_recommendation_label.setText(recommendation)


def show_async_info(self):
    """
    Show information dialog about async I/O.
    
    Add this method to ConfigPanel class.
    """
    info_text = """
    <html>
    <head>
        <style>
            body { font-family: Arial, sans-serif; }
            h3 { color: #1976d2; }
            ul { line-height: 1.8; }
            li { margin-bottom: 5px; }
        </style>
    </head>
    <body>
        <h3>Async I/O Information</h3>
        
        <p><b>What is Async I/O?</b></p>
        <p>Async I/O allows the application to make multiple network requests simultaneously, 
        instead of waiting for each request to complete before starting the next one.</p>
        
        <p><b>When to Enable:</b></p>
        <ul>
            <li>Network I/O takes >40% of total processing time (check Phase 3 performance metrics)</li>
            <li>Processing playlists with 10+ tracks</li>
            <li>You have a stable, fast internet connection</li>
            <li>You want faster processing and don't mind higher memory usage</li>
        </ul>
        
        <p><b>When NOT to Enable:</b></p>
        <ul>
            <li>Processing single tracks</li>
            <li>Network I/O is not a bottleneck</li>
            <li>You have limited memory</li>
            <li>You have an unstable or slow internet connection</li>
        </ul>
        
        <p><b>Performance:</b></p>
        <ul>
            <li>Expected speedup: 30-60% for multi-track playlists</li>
            <li>Memory usage: Increases with concurrent requests</li>
            <li>CPU usage: Slightly higher due to parallel processing</li>
        </ul>
        
        <p><b>Configuration:</b></p>
        <ul>
            <li><b>Max Concurrent Tracks:</b> How many tracks to process at once (3-10 recommended)</li>
            <li><b>Max Concurrent Requests:</b> How many HTTP requests per track (5-15 recommended)</li>
        </ul>
        
        <p><b>Note:</b> Async I/O is disabled by default. Enable it only if you've verified 
        that network I/O is a bottleneck using Phase 3 performance metrics.</p>
    </body>
    </html>
    """
    
    msg = QMessageBox(self)
    msg.setWindowTitle("Async I/O Information")
    msg.setTextFormat(Qt.RichText)
    msg.setText(info_text)
    msg.setStandardButtons(QMessageBox.Ok)
    msg.setMinimumWidth(500)
    msg.exec()


# Update get_settings() method to include async I/O:
def get_settings(self) -> Dict[str, Any]:
    """
    Get all settings including async I/O.
    
    Update existing get_settings() method in ConfigPanel class.
    """
    settings = {
        # ... existing settings from current implementation ...
        "async_io_enabled": self.async_io_check.isChecked(),
        "async_max_concurrent_tracks": self.async_max_tracks.value(),
        "async_max_concurrent_requests": self.async_max_requests.value(),
    }
    return settings


# Update load_settings() method:
def load_settings(self):
    """
    Load settings from config.
    
    Update existing load_settings() method in ConfigPanel class.
    """
    from config import get_async_config
    
    config = get_async_config()
    self.async_io_check.setChecked(config.get("enabled", False))
    self.async_max_tracks.setValue(config.get("max_concurrent_tracks", 5))
    self.async_max_requests.setValue(config.get("max_concurrent_requests", 10))
    
    # Update widget state
    self._on_async_io_toggled(self.async_io_check.isChecked())


# Update save_settings() method:
def save_settings(self):
    """
    Save settings to config.
    
    Update existing save_settings() method in ConfigPanel class.
    """
    from config import set_async_config
    
    set_async_config(
        enabled=self.async_io_check.isChecked(),
        max_tracks=self.async_max_tracks.value(),
        max_requests=self.async_max_requests.value()
    )
```

---

### Part C: Main Window Integration

**File**: `SRC/gui/main_window.py` (MODIFY)

**Location**: Update `start_processing()` method

**Exact Implementation**:

```python
# In MainWindow class, update start_processing() method:

def start_processing(self):
    """Start processing with async I/O support"""
    # Get file path and playlist name
    xml_path = self.file_selector.get_file_path()
    playlist_name = self.playlist_selector.get_selected_playlist()
    
    # Validate inputs
    if not xml_path or not self.file_selector.validate_file(xml_path):
        self.statusBar().showMessage("Please select a valid XML file")
        return
    
    if not playlist_name:
        self.statusBar().showMessage("Please select a playlist")
        return
    
    # Get settings from config panel
    settings = self.config_panel.get_settings()
    auto_research = self.config_panel.get_auto_research()
    
    # Check if async I/O is enabled
    use_async = settings.get("async_io_enabled", False)
    
    if use_async:
        # Show info message about async mode
        reply = QMessageBox.information(
            self,
            "Async I/O Enabled",
            "Processing will use async I/O for faster performance.\n\n"
            "This may increase memory usage but should significantly "
            "reduce processing time for multiple tracks.\n\n"
            "Continue with async processing?",
            QMessageBox.Yes | QMessageBox.No,
            QMessageBox.Yes
        )
        
        if reply == QMessageBox.No:
            # User cancelled, don't start processing
            return
    
    # Reset progress widget
    self.progress_widget.reset()
    
    # Show progress section, hide results
    self.progress_group.setVisible(True)
    self.results_group.setVisible(False)
    
    # Disable start button during processing
    self.start_button.setEnabled(False)
    
    # Enable cancel button
    self.progress_widget.set_enabled(True)
    
    # Update status
    mode_text = "async I/O" if use_async else "sync"
    self.statusBar().showMessage(f"Starting processing ({mode_text}): {playlist_name}...")
    
    # Pass async setting to controller
    # The controller will use async mode if enabled
    self.controller.start_processing(
        xml_path=xml_path,
        playlist_name=playlist_name,
        settings=settings,
        auto_research=auto_research
    )
```

---

### Part D: Controller Integration

**File**: `SRC/gui_controller.py` (MODIFY)

**Location**: Update `start_processing()` method to check async setting

**Exact Implementation**:

```python
# In GUIController class, update start_processing() method:

def start_processing(
    self,
    xml_path: str,
    playlist_name: str,
    settings: Optional[Dict[str, Any]] = None,
    auto_research: bool = True
):
    """
    Start processing with async I/O support.
    
    Update existing start_processing() method to check async setting
    and call appropriate processor function.
    """
    # Check if async I/O is enabled
    use_async = settings.get("async_io_enabled", False) if settings else False
    
    if use_async:
        # Use async processing
        from processor import process_playlist_async
        
        max_concurrent_tracks = settings.get("async_max_concurrent_tracks", 5)
        max_concurrent_requests = settings.get("async_max_concurrent_requests", 10)
        
        # Start async processing in thread
        # (Implementation depends on your threading model)
        # This is a simplified example
        results = process_playlist_async(
            xml_path,
            playlist_name,
            settings=settings,
            max_concurrent_tracks=max_concurrent_tracks,
            max_concurrent_requests=max_concurrent_requests
        )
        
        # Emit completion signal
        self.processing_complete.emit(results)
    else:
        # Use sync processing (existing code)
        # ... existing sync processing code ...
        pass
```

---

## Implementation Checklist

- [ ] Add async I/O configuration to `config.py`
- [ ] Add `get_async_config()` function
- [ ] Add `set_async_config()` function
- [ ] Add async I/O settings group to config panel
- [ ] Add enable checkbox with tooltip
- [ ] Add concurrent tracks/requests spinboxes
- [ ] Add recommendation label
- [ ] Add info dialog button
- [ ] Connect signals for dynamic updates
- [ ] Update `get_settings()` to include async I/O
- [ ] Update `load_settings()` to load async config
- [ ] Update `save_settings()` to save async config
- [ ] Integrate into main window `start_processing()`
- [ ] Update controller to use async mode
- [ ] Test configuration persistence
- [ ] Test UI interactions
- [ ] Test mode switching
- [ ] Test with real processing

---

## Testing Requirements

### Unit Tests

```python
# Test config functions
def test_get_async_config():
    config = get_async_config()
    assert "enabled" in config
    assert isinstance(config["enabled"], bool)

def test_set_async_config():
    set_async_config(True, max_tracks=10, max_requests=15)
    config = get_async_config()
    assert config["enabled"] == True
    assert config["max_concurrent_tracks"] == 10
```

### Integration Tests

```python
# Test UI integration
def test_async_io_ui():
    # Create config panel
    # Check async I/O checkbox
    # Verify settings widget enables
    # Verify settings are saved/loaded
```

---

## Acceptance Criteria

- ✅ Configuration module updated
- ✅ UI controls added and functional
- ✅ Settings persistence works
- ✅ Mode switching works
- ✅ Helpful tooltips and dialogs
- ✅ Integration with processing works
- ✅ All tests passing

---

## Next Steps

After completing this step:

1. **Test UI** thoroughly
2. **Test mode switching** between sync/async
3. **Proceed to Step 5.5** for comprehensive testing

---

**This step enables users to configure and use async I/O through the UI.**

