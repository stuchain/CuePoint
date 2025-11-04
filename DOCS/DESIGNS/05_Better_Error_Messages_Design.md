# Design: Better Error Messages with GUI Dialogs

**Number**: 5  
**Status**: ✅ Complete (CLI) - 📝 Needs GUI Integration  
**Priority**: 🔥 P0 - Critical for User Experience  
**Effort**: 1-2 days  
**Impact**: Medium-High - Reduces user frustration  
**Phase**: 2 (GUI User Experience)

---

## 1. Overview

### 1.1 Problem Statement

Current error handling uses CLI-based `print_error()` calls that display technical messages in the console. For a GUI application, users need:
- **Visual error dialogs** instead of console output
- **User-friendly language** instead of technical jargon
- **Actionable suggestions** on how to fix problems
- **Recovery options** (e.g., "Try Again", "Browse File")
- **Contextual help** explaining what went wrong
- **Error categorization** (warning vs. critical)

### 1.2 Solution Overview

Implement a comprehensive GUI error handling system that:
1. **Custom Error Dialog**: Professional error dialog widget
2. **Error Categories**: Classify errors by type and severity
3. **Actionable Suggestions**: Provide specific fixes for each error type
4. **Recovery Actions**: Buttons for common recovery operations
5. **Error Logging**: Log errors for debugging while showing user-friendly messages
6. **Integration**: Replace CLI `print_error()` calls with GUI dialogs

---

## 2. Architecture Design

### 2.1 Error Types

**Location**: `SRC/gui/error_dialogs.py` (NEW)

```python
from enum import Enum

class ErrorSeverity(Enum):
    """Error severity levels"""
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"
    CRITICAL = "critical"

class ErrorCategory(Enum):
    """Error categories"""
    FILE_NOT_FOUND = "file_not_found"
    PLAYLIST_NOT_FOUND = "playlist_not_found"
    XML_PARSE_ERROR = "xml_parse_error"
    NETWORK_ERROR = "network_error"
    BEATPORT_ERROR = "beatport_error"
    PROCESSING_ERROR = "processing_error"
    PERMISSION_ERROR = "permission_error"
    VALIDATION_ERROR = "validation_error"
```

### 2.2 Error Mapping

Map backend `ProcessingError` types to GUI-friendly messages:

```python
ERROR_MESSAGES = {
    ErrorCategory.FILE_NOT_FOUND: {
        'title': 'File Not Found',
        'message': 'The file could not be found.',
        'details': 'The specified file path does not exist or is not accessible.',
        'suggestions': [
            'Check that the file path is correct',
            'Verify the file exists at the specified location',
            'Ensure you have permission to access the file'
        ],
        'actions': ['browse_file', 'retry']
    },
    ErrorCategory.PLAYLIST_NOT_FOUND: {
        'title': 'Playlist Not Found',
        'message': 'The specified playlist was not found in the XML file.',
        'details': 'The playlist name does not match any playlist in the Rekordbox XML export.',
        'suggestions': [
            'Check the playlist name spelling (case-sensitive)',
            'Open the XML file to see available playlists',
            'Verify the XML file contains playlists'
        ],
        'actions': ['show_playlists', 'retry']
    },
    ErrorCategory.NETWORK_ERROR: {
        'title': 'Network Error',
        'message': 'Failed to connect to Beatport.',
        'details': 'The application could not reach Beatport servers.',
        'suggestions': [
            'Check your internet connection',
            'Verify Beatport is accessible in your browser',
            'Check firewall settings',
            'Try again in a few moments'
        ],
        'actions': ['retry', 'cancel']
    },
    # ... more error types
}
```

---

## 3. Implementation Details

### 3.1 Error Dialog Widget

**Location**: `SRC/gui/error_dialogs.py` (NEW)

```python
# SRC/gui/error_dialogs.py
from PySide6.QtWidgets import (
    QDialog, QVBoxLayout, QHBoxLayout, QLabel,
    QPushButton, QTextEdit, QMessageBox, QGroupBox
)
from PySide6.QtCore import Qt, Signal
from PySide6.QtGui import QIcon, QPixmap, QColor

class ErrorDialog(QDialog):
    """Custom error dialog with actionable suggestions"""
    
    retry_requested = Signal()
    browse_file_requested = Signal()
    show_playlists_requested = Signal()
    
    def __init__(self, error_category: ErrorCategory, 
                 error_details: str = "", parent=None):
        super().__init__(parent)
        self.error_category = error_category
        self.error_details = error_details
        self._setup_ui()
    
    def _setup_ui(self):
        """Set up error dialog UI"""
        self.setWindowTitle("Error")
        self.setMinimumSize(500, 400)
        self.setModal(True)
        
        layout = QVBoxLayout()
        
        # Error icon and title
        header_layout = QHBoxLayout()
        
        # Error icon
        icon_label = QLabel()
        icon_pixmap = self._get_error_icon()
        icon_label.setPixmap(icon_pixmap)
        icon_label.setAlignment(Qt.AlignTop)
        header_layout.addWidget(icon_label)
        
        # Title and message
        text_layout = QVBoxLayout()
        
        title_label = QLabel(self._get_error_title())
        title_label.setStyleSheet("font-size: 18px; font-weight: bold;")
        text_layout.addWidget(title_label)
        
        message_label = QLabel(self._get_error_message())
        message_label.setWordWrap(True)
        text_layout.addWidget(message_label)
        
        header_layout.addLayout(text_layout)
        header_layout.addStretch()
        
        layout.addLayout(header_layout)
        
        # Details section (expandable)
        details_group = QGroupBox("What went wrong?")
        details_layout = QVBoxLayout()
        
        details_text = QTextEdit()
        details_text.setReadOnly(True)
        details_text.setMaximumHeight(100)
        details_text.setPlainText(self._get_error_details())
        details_layout.addWidget(details_text)
        
        details_group.setLayout(details_layout)
        layout.addWidget(details_group)
        
        # Suggestions section
        suggestions_group = QGroupBox("How to fix:")
        suggestions_layout = QVBoxLayout()
        
        suggestions = self._get_suggestions()
        for suggestion in suggestions:
            suggestion_label = QLabel(f"• {suggestion}")
            suggestion_label.setWordWrap(True)
            suggestions_layout.addWidget(suggestion_label)
        
        suggestions_group.setLayout(suggestions_layout)
        layout.addWidget(suggestions_group)
        
        # Action buttons
        button_layout = QHBoxLayout()
        button_layout.addStretch()
        
        # Dynamic action buttons based on error type
        actions = self._get_available_actions()
        
        if 'browse_file' in actions:
            browse_btn = QPushButton("Browse File...")
            browse_btn.clicked.connect(self._on_browse_file)
            button_layout.addWidget(browse_btn)
        
        if 'show_playlists' in actions:
            playlists_btn = QPushButton("Show Playlists...")
            playlists_btn.clicked.connect(self._on_show_playlists)
            button_layout.addWidget(playlists_btn)
        
        if 'retry' in actions:
            retry_btn = QPushButton("Try Again")
            retry_btn.clicked.connect(self._on_retry)
            button_layout.addWidget(retry_btn)
        
        cancel_btn = QPushButton("Close")
        cancel_btn.clicked.connect(self.reject)
        button_layout.addWidget(cancel_btn)
        
        layout.addLayout(button_layout)
        
        self.setLayout(layout)
    
    def _get_error_icon(self) -> QPixmap:
        """Get error icon based on severity"""
        severity = self._get_error_severity()
        
        # Create colored icon based on severity
        # For now, use standard icons
        if severity == ErrorSeverity.CRITICAL:
            return QMessageBox.standardIcon(QMessageBox.Critical)
        elif severity == ErrorSeverity.ERROR:
            return QMessageBox.standardIcon(QMessageBox.Critical)
        elif severity == ErrorSeverity.WARNING:
            return QMessageBox.standardIcon(QMessageBox.Warning)
        else:
            return QMessageBox.standardIcon(QMessageBox.Information)
    
    def _get_error_title(self) -> str:
        """Get error title"""
        error_info = ERROR_MESSAGES.get(self.error_category, {})
        return error_info.get('title', 'Error')
    
    def _get_error_message(self) -> str:
        """Get error message"""
        error_info = ERROR_MESSAGES.get(self.error_category, {})
        return error_info.get('message', 'An error occurred.')
    
    def _get_error_details(self) -> str:
        """Get error details"""
        error_info = ERROR_MESSAGES.get(self.error_category, {})
        base_details = error_info.get('details', '')
        
        if self.error_details:
            return f"{base_details}\n\nTechnical Details:\n{self.error_details}"
        return base_details
    
    def _get_suggestions(self) -> list:
        """Get suggestions list"""
        error_info = ERROR_MESSAGES.get(self.error_category, {})
        return error_info.get('suggestions', [])
    
    def _get_available_actions(self) -> list:
        """Get available action buttons"""
        error_info = ERROR_MESSAGES.get(self.error_category, {})
        return error_info.get('actions', [])
    
    def _get_error_severity(self) -> ErrorSeverity:
        """Get error severity"""
        # Map category to severity
        severity_map = {
            ErrorCategory.FILE_NOT_FOUND: ErrorSeverity.ERROR,
            ErrorCategory.PLAYLIST_NOT_FOUND: ErrorSeverity.WARNING,
            ErrorCategory.NETWORK_ERROR: ErrorSeverity.WARNING,
            ErrorCategory.XML_PARSE_ERROR: ErrorSeverity.ERROR,
            ErrorCategory.CRITICAL: ErrorSeverity.CRITICAL,
        }
        return severity_map.get(self.error_category, ErrorSeverity.ERROR)
    
    def _on_browse_file(self):
        """Handle browse file action"""
        self.browse_file_requested.emit()
        self.accept()
    
    def _on_show_playlists(self):
        """Handle show playlists action"""
        self.show_playlists_requested.emit()
        self.accept()
    
    def _on_retry(self):
        """Handle retry action"""
        self.retry_requested.emit()
        self.accept()
```

### 3.2 Error Handler Integration

**Location**: `SRC/gui/main_window.py` (MODIFY)

```python
# SRC/gui/main_window.py
from .error_dialogs import ErrorDialog, ErrorCategory

class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        # ... existing code ...
    
    def _handle_error(self, error_category: ErrorCategory, error_details: str = ""):
        """Handle error by showing dialog"""
        dialog = ErrorDialog(error_category, error_details, self)
        
        # Connect signals
        dialog.browse_file_requested.connect(self._on_browse_file_requested)
        dialog.show_playlists_requested.connect(self._on_show_playlists_requested)
        dialog.retry_requested.connect(self._on_retry_requested)
        
        dialog.exec_()
    
    def _on_browse_file_requested(self):
        """Handle browse file request from error dialog"""
        self._open_xml_file()
    
    def _on_show_playlists_requested(self):
        """Handle show playlists request from error dialog"""
        # Show available playlists dialog
        self._show_playlists_dialog()
    
    def _on_retry_requested(self):
        """Handle retry request from error dialog"""
        # Retry the last operation
        if self.processing_thread and not self.processing_thread.isRunning():
            self._start_processing()
```

### 3.3 Backend Error Integration

**Location**: `SRC/processor.py` (MODIFY)

The backend `ProcessingError` exceptions should be caught and converted to GUI error dialogs:

```python
# SRC/gui/main_window.py
from gui_interface import ProcessingError, ErrorType

class ProcessingThread(QThread):
    """Thread for running processing"""
    
    error_occurred = Signal(ErrorCategory, str)  # Emit error category and details
    
    def run(self):
        try:
            # ... processing code ...
            results = process_playlist(...)
        except ProcessingError as e:
            # Map ProcessingError to ErrorCategory
            error_category = self._map_error_type(e.error_type)
            self.error_occurred.emit(error_category, str(e))
        except Exception as e:
            # Catch unexpected errors
            self.error_occurred.emit(ErrorCategory.PROCESSING_ERROR, str(e))
    
    def _map_error_type(self, error_type: ErrorType) -> ErrorCategory:
        """Map backend ErrorType to GUI ErrorCategory"""
        mapping = {
            ErrorType.FILE_NOT_FOUND: ErrorCategory.FILE_NOT_FOUND,
            ErrorType.PLAYLIST_NOT_FOUND: ErrorCategory.PLAYLIST_NOT_FOUND,
            ErrorType.NETWORK_ERROR: ErrorCategory.NETWORK_ERROR,
            ErrorType.XML_PARSE_ERROR: ErrorCategory.XML_PARSE_ERROR,
            # ... more mappings
        }
        return mapping.get(error_type, ErrorCategory.PROCESSING_ERROR)
```

### 3.4 Error Logging

**Location**: `SRC/gui/error_dialogs.py` (MODIFY)

Log errors for debugging while showing user-friendly messages:

```python
import logging

logger = logging.getLogger(__name__)

class ErrorDialog(QDialog):
    def __init__(self, error_category: ErrorCategory, 
                 error_details: str = "", parent=None):
        super().__init__(parent)
        # ... existing code ...
        
        # Log error for debugging
        logger.error(
            f"Error Category: {error_category.value}, "
            f"Details: {error_details}"
        )
```

---

## 4. Error Dialog Examples

### 4.1 File Not Found Error

**Appearance**:
- **Icon**: Red error icon (critical)
- **Title**: "File Not Found"
- **Message**: "The file could not be found."
- **Details**: "The specified file path does not exist or is not accessible."
- **Suggestions**:
  - Check that the file path is correct
  - Verify the file exists at the specified location
  - Ensure you have permission to access the file
- **Actions**: "Browse File..." button, "Close" button

### 4.2 Playlist Not Found Error

**Appearance**:
- **Icon**: Yellow warning icon
- **Title**: "Playlist Not Found"
- **Message**: "The specified playlist was not found in the XML file."
- **Details**: "The playlist name does not match any playlist in the Rekordbox XML export."
- **Suggestions**:
  - Check the playlist name spelling (case-sensitive)
  - Open the XML file to see available playlists
  - Verify the XML file contains playlists
- **Actions**: "Show Playlists..." button, "Close" button

### 4.3 Network Error

**Appearance**:
- **Icon**: Yellow warning icon
- **Title**: "Network Error"
- **Message**: "Failed to connect to Beatport."
- **Details**: "The application could not reach Beatport servers."
- **Suggestions**:
  - Check your internet connection
  - Verify Beatport is accessible in your browser
  - Check firewall settings
  - Try again in a few moments
- **Actions**: "Try Again" button, "Close" button

---

## 5. Integration Points

### 5.1 Replace CLI Error Calls

**Before** (CLI):
```python
# SRC/processor.py
if not os.path.exists(xml_path):
    print_error("File not found", xml_path)
    return
```

**After** (GUI):
```python
# SRC/processor.py
if not os.path.exists(xml_path):
    raise ProcessingError(
        ErrorType.FILE_NOT_FOUND,
        f"File not found: {xml_path}"
    )
```

**GUI catches and displays**:
```python
# SRC/gui/main_window.py
try:
    results = process_playlist(...)
except ProcessingError as e:
    error_category = map_error_type(e.error_type)
    self._handle_error(error_category, str(e))
```

### 5.2 Error Handling in Processing Thread

```python
# SRC/gui/main_window.py
class ProcessingThread(QThread):
    error_occurred = Signal(ErrorCategory, str)
    progress_updated = Signal(ProgressInfo)
    processing_complete = Signal(list)
    
    def run(self):
        try:
            controller = ProcessingController()
            results = process_playlist(
                xml_path=self.xml_path,
                playlist_name=self.playlist_name,
                progress_callback=self._on_progress,
                controller=controller
            )
            self.processing_complete.emit(results)
        except ProcessingError as e:
            error_category = self._map_error_type(e.error_type)
            self.error_occurred.emit(error_category, str(e))
        except Exception as e:
            self.error_occurred.emit(ErrorCategory.PROCESSING_ERROR, str(e))
    
    def _on_progress(self, progress_info: ProgressInfo):
        """Forward progress updates"""
        self.progress_updated.emit(progress_info)
```

---

## 6. Testing Strategy

### Unit Tests
- Error dialog creation: All error types display correctly
- Error messages: All messages are user-friendly
- Action buttons: Correct buttons shown for each error type
- Signal emission: Signals emit correctly

### Integration Tests
- Error handling: Backend errors caught and displayed
- Action buttons: Browse/retry actions work correctly
- Error logging: Errors logged correctly

### Manual Testing
- Visual appearance: Error dialogs look professional
- User experience: Error messages are clear and helpful
- Action buttons: Actions work as expected

---

## 7. Acceptance Criteria

- [ ] Error dialogs display for all error types
- [ ] Error messages are user-friendly
- [ ] Suggestions are actionable
- [ ] Action buttons work correctly
- [ ] Errors are logged for debugging
- [ ] Error dialogs are visually consistent
- [ ] Integration with backend error handling works
- [ ] Error recovery actions function correctly

---

## 8. Dependencies

- **Requires**: Phase 1 GUI Foundation (MainWindow, widgets)
- **Requires**: Phase 0 Backend (ProcessingError, ErrorType)
- **Used By**: All GUI error handling

---

## 9. Future Enhancements

- **Error history**: Track recent errors
- **Error reporting**: Allow users to report errors
- **Auto-recovery**: Automatically retry certain errors
- **Error analytics**: Track common errors for improvement
- **Multi-language**: Error messages in multiple languages

---

*This design is essential for Phase 2 completion and user experience.*

