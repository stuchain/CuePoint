# Step 6.4: Improve Progress Bar Display

**Status**: 📝 Planned  
**Duration**: 1-2 days  
**Dependencies**: None (can be done in parallel)

## Goal

Make the progress bar cleaner and more informative with better elapsed/remaining time display. Fix cancel button to prevent crashes.

## Implementation

### 1. Improve ProgressWidget Layout

**File**: `SRC/cuepoint/ui/widgets/progress_widget.py` (MODIFY)

Improve the layout and styling:

```python
def init_ui(self):
    """Initialize UI components"""
    layout = QVBoxLayout(self)
    layout.setSpacing(15)
    layout.setContentsMargins(15, 15, 15, 15)

    # Overall progress bar - improved styling
    self.overall_progress = QProgressBar()
    self.overall_progress.setMinimum(0)
    self.overall_progress.setMaximum(100)
    self.overall_progress.setValue(0)
    self.overall_progress.setFormat("%p% (%v/%m tracks)")
    self.overall_progress.setStyleSheet(
        """
        QProgressBar {
            border: 2px solid #ccc;
            border-radius: 5px;
            text-align: center;
            font-weight: bold;
            height: 25px;
        }
        QProgressBar::chunk {
            background-color: #4A90E2;
            border-radius: 3px;
        }
        """
    )
    layout.addWidget(self.overall_progress)

    # Current track info - improved styling
    self.current_track_label = QLabel("Ready to start...")
    self.current_track_label.setWordWrap(True)
    self.current_track_label.setStyleSheet(
        "font-size: 14px; "
        "color: #333; "
        "padding: 5px;"
    )
    layout.addWidget(self.current_track_label)

    # Time information - improved layout
    time_container = QWidget()
    time_layout = QHBoxLayout(time_container)
    time_layout.setContentsMargins(0, 0, 0, 0)
    time_layout.setSpacing(20)

    # Elapsed time
    elapsed_container = QWidget()
    elapsed_layout = QVBoxLayout(elapsed_container)
    elapsed_layout.setContentsMargins(0, 0, 0, 0)
    elapsed_layout.setSpacing(2)
    elapsed_title = QLabel("Elapsed Time")
    elapsed_title.setStyleSheet("font-size: 11px; color: #666;")
    self.elapsed_label = QLabel("0s")
    self.elapsed_label.setStyleSheet("font-size: 16px; font-weight: bold; color: #333;")
    elapsed_layout.addWidget(elapsed_title)
    elapsed_layout.addWidget(self.elapsed_label)
    time_layout.addWidget(elapsed_container)

    # Remaining time
    remaining_container = QWidget()
    remaining_layout = QVBoxLayout(remaining_container)
    remaining_layout.setContentsMargins(0, 0, 0, 0)
    remaining_layout.setSpacing(2)
    remaining_title = QLabel("Estimated Remaining")
    remaining_title.setStyleSheet("font-size: 11px; color: #666;")
    self.remaining_label = QLabel("--")
    self.remaining_label.setStyleSheet("font-size: 16px; font-weight: bold; color: #333;")
    remaining_layout.addWidget(remaining_title)
    remaining_layout.addWidget(self.remaining_label)
    time_layout.addWidget(remaining_container)

    time_layout.addStretch()
    layout.addWidget(time_container)

    # Statistics group - improved layout
    stats_group = QGroupBox("Statistics")
    stats_layout = QHBoxLayout()
    stats_layout.setSpacing(15)

    self.matched_label = QLabel("Matched: 0")
    self.matched_label.setStyleSheet("color: #4CAF50; font-weight: bold; font-size: 13px;")
    self.unmatched_label = QLabel("Unmatched: 0")
    self.unmatched_label.setStyleSheet("color: #F44336; font-weight: bold; font-size: 13px;")
    self.processing_label = QLabel("Processing: 0")
    self.processing_label.setStyleSheet("color: #2196F3; font-weight: bold; font-size: 13px;")

    stats_layout.addWidget(self.matched_label)
    stats_layout.addWidget(self.unmatched_label)
    stats_layout.addWidget(self.processing_label)
    stats_layout.addStretch()

    stats_group.setLayout(stats_layout)
    layout.addWidget(stats_group)

    # Cancel button - improved styling and positioning
    button_layout = QHBoxLayout()
    button_layout.addStretch()
    self.cancel_button = QPushButton("Cancel Processing")
    self.cancel_button.setMinimumWidth(150)
    self.cancel_button.setStyleSheet(
        """
        QPushButton {
            background-color: #F44336;
            color: white;
            border: none;
            border-radius: 5px;
            padding: 8px 20px;
            font-weight: bold;
        }
        QPushButton:hover {
            background-color: #D32F2F;
        }
        QPushButton:pressed {
            background-color: #B71C1C;
        }
        QPushButton:disabled {
            background-color: #ccc;
            color: #666;
        }
        """
    )
    self.cancel_button.clicked.connect(self._on_cancel_clicked)
    button_layout.addWidget(self.cancel_button)
    button_layout.addStretch()
    layout.addLayout(button_layout)

def _on_cancel_clicked(self):
    """Handle cancel button click with error handling"""
    try:
        # Emit cancel signal
        self.cancel_requested.emit()
        # Disable button to prevent multiple clicks
        self.cancel_button.setEnabled(False)
        self.cancel_button.setText("Cancelling...")
    except Exception as e:
        # Log error but don't crash
        import traceback
        print(f"Error in cancel button: {e}")
        print(traceback.format_exc())
```

### 2. Improve Time Formatting

**File**: `SRC/cuepoint/ui/widgets/progress_widget.py` (MODIFY)

Enhance the `_format_time` method:

```python
def _format_time(self, seconds: float) -> str:
    """Format time in human-readable format"""
    if seconds < 0:
        return "--"
    
    if seconds < 60:
        return f"{int(seconds)}s"
    elif seconds < 3600:
        minutes = int(seconds // 60)
        secs = int(seconds % 60)
        if secs == 0:
            return f"{minutes}m"
        return f"{minutes}m {secs}s"
    else:
        hours = int(seconds // 3600)
        minutes = int((seconds % 3600) // 60)
        if minutes == 0:
            return f"{hours}h"
        return f"{hours}h {minutes}m"
```

### 3. Fix Cancel Handling in MainWindow

**File**: `SRC/cuepoint/ui/main_window.py` (MODIFY)

Improve cancel handling to prevent crashes:

```python
def on_cancel_requested(self) -> None:
    """Handle cancel button click from ProgressWidget."""
    try:
        # Disable cancel button immediately to prevent multiple clicks
        self.progress_widget.cancel_button.setEnabled(False)
        self.progress_widget.cancel_button.setText("Cancelling...")
        
        # Cancel processing
        if self.controller.is_processing():
            self.controller.cancel_processing()
        
        self.statusBar().showMessage("Cancelling processing...")
        
        # Re-enable start button after a short delay
        # (processing cancellation is asynchronous)
        from PySide6.QtCore import QTimer
        QTimer.singleShot(500, self._on_cancel_complete)
        
    except Exception as e:
        # Log error but don't crash
        import traceback
        error_msg = f"Error cancelling processing: {str(e)}"
        print(error_msg)
        print(traceback.format_exc())
        self.statusBar().showMessage(error_msg, 5000)
        # Still try to re-enable UI
        self._on_cancel_complete()

def _on_cancel_complete(self) -> None:
    """Called after cancellation is complete"""
    try:
        # Re-enable start button
        self.start_button.setEnabled(True)
        # Reset cancel button
        self.progress_widget.cancel_button.setEnabled(True)
        self.progress_widget.cancel_button.setText("Cancel Processing")
        # Disable progress widget
        self.progress_widget.set_enabled(False)
        # Hide progress section
        self.progress_group.setVisible(False)
        self.statusBar().showMessage("Processing cancelled", 2000)
    except Exception as e:
        import traceback
        print(f"Error in cancel complete: {e}")
        print(traceback.format_exc())
```

## Testing Checklist

- [ ] Progress bar displays correctly with improved styling
- [ ] Elapsed time displays correctly
- [ ] Remaining time displays correctly
- [ ] Time formatting is clear and readable
- [ ] Cancel button works without crashes
- [ ] Cancel button is disabled during cancellation
- [ ] UI state is properly reset after cancellation
- [ ] No crashes occur during cancellation
- [ ] Error handling works for edge cases

## Acceptance Criteria

- ✅ Progress bar is cleaner and more informative
- ✅ Time display is clear and easy to read
- ✅ Cancel button works reliably
- ✅ No crashes occur when cancelling
- ✅ UI state is properly managed during cancellation

