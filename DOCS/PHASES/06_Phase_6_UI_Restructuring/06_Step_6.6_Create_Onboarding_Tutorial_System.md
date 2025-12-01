# Step 6.6: Create Onboarding & Tutorial System

**Status**: 📝 Planned  
**Priority**: 🚀 P1 - HIGH PRIORITY  
**Estimated Duration**: 4-5 days  
**Dependencies**: Step 6.3 (Redesign Main Window - Simple Mode)

---

## Goal

Create an interactive onboarding and tutorial system that helps new users understand how to use the application. The system should be optional, skippable, and provide contextual help throughout the application.

---

## Success Criteria

- [ ] Welcome screen created
- [ ] Interactive tutorial implemented
- [ ] Tooltips and hints throughout UI
- [ ] Help documentation accessible
- [ ] First-time user detection
- [ ] Tutorial can be skipped
- [ ] Tutorial progress saved
- [ ] Contextual help available
- [ ] Help content is clear and helpful

---

## Analytical Design

### Tutorial Flow

```
Welcome Screen
    ↓
Tutorial Step 1: Select File
    ↓
Tutorial Step 2: Process Playlist
    ↓
Tutorial Step 3: View Results
    ↓
Tutorial Step 4: Export Results
    ↓
Tutorial Complete
```

### Implementation

```python
# src/cuepoint/ui/onboarding/tutorial_manager.py
"""
Tutorial and onboarding system.
"""

from typing import List, Optional, Dict, Any
from enum import Enum
from pathlib import Path

from PySide6.QtCore import QObject, Signal, QSettings, QPoint
from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel,
    QPushButton, QDialog, QProgressBar, QFrame
)

from cuepoint.ui.theme.theme_manager import ThemeManager
from cuepoint.ui.widgets.pixel_widgets import PixelButton


class TutorialStep:
    """Represents a single tutorial step."""
    
    def __init__(
        self,
        step_id: str,
        title: str,
        description: str,
        target_widget: Optional[QWidget] = None,
        highlight_rect: Optional[tuple] = None,
        action_required: bool = False
    ):
        self.step_id = step_id
        self.title = title
        self.description = description
        self.target_widget = target_widget
        self.highlight_rect = highlight_rect
        self.action_required = action_required
        self.completed = False


class TutorialManager(QObject):
    """Manages tutorial flow and progress."""
    
    step_completed = Signal(str)  # Step ID
    tutorial_completed = Signal()
    
    def __init__(self, parent: Optional[QObject] = None):
        super().__init__(parent)
        
        self.settings = QSettings()
        self.steps: List[TutorialStep] = []
        self.current_step_index = 0
        self.tutorial_active = False
        
        self.init_tutorial_steps()
    
    def init_tutorial_steps(self):
        """Initialize tutorial steps."""
        self.steps = [
            TutorialStep(
                "welcome",
                "Welcome to CuePoint!",
                "CuePoint helps you enrich your music playlists with metadata from Beatport. Let's get started!",
                action_required=False
            ),
            TutorialStep(
                "select_file",
                "Step 1: Select Your Playlist File",
                "Click 'Browse Files' to select your XML playlist file. This is the file you want to enrich with metadata.",
                action_required=True
            ),
            TutorialStep(
                "process",
                "Step 2: Process Your Playlist",
                "Once you've selected a file, click 'Process Playlist' to start enriching your tracks with Beatport metadata.",
                action_required=True
            ),
            TutorialStep(
                "view_results",
                "Step 3: View Results",
                "After processing, you'll see your results here. Matched tracks will show a green checkmark, unmatched tracks will show a red X.",
                action_required=False
            ),
            TutorialStep(
                "export",
                "Step 4: Export Results",
                "Finally, click 'Export Results' to save your enriched playlist data to a CSV file.",
                action_required=False
            ),
        ]
    
    def should_show_tutorial(self) -> bool:
        """Check if tutorial should be shown."""
        return not self.settings.value("tutorial/completed", False, type=bool)
    
    def start_tutorial(self):
        """Start the tutorial."""
        self.tutorial_active = True
        self.current_step_index = 0
        self.show_current_step()
    
    def show_current_step(self):
        """Show current tutorial step."""
        if self.current_step_index >= len(self.steps):
            self.complete_tutorial()
            return
        
        step = self.steps[self.current_step_index]
        # Show step dialog or overlay
        # Implementation depends on UI framework
    
    def complete_step(self):
        """Mark current step as complete and move to next."""
        if self.current_step_index < len(self.steps):
            self.steps[self.current_step_index].completed = True
            self.step_completed.emit(self.steps[self.current_step_index].step_id)
            self.current_step_index += 1
            self.show_current_step()
    
    def complete_tutorial(self):
        """Complete the tutorial."""
        self.tutorial_active = False
        self.settings.setValue("tutorial/completed", True)
        self.tutorial_completed.emit()
    
    def skip_tutorial(self):
        """Skip the tutorial."""
        self.complete_tutorial()
    
    def reset_tutorial(self):
        """Reset tutorial progress."""
        self.settings.setValue("tutorial/completed", False)
        self.current_step_index = 0
        for step in self.steps:
            step.completed = False
```

```python
# src/cuepoint/ui/onboarding/welcome_screen.py
"""
Welcome screen for first-time users.
"""

from typing import Optional

from PySide6.QtWidgets import (
    QDialog, QVBoxLayout, QHBoxLayout, QLabel,
    QPushButton, QFrame
)
from PySide6.QtCore import Qt

from cuepoint.ui.theme.theme_manager import ThemeManager
from cuepoint.ui.widgets.pixel_widgets import PixelButton


class WelcomeScreen(QDialog):
    """Welcome screen shown to first-time users."""
    
    def __init__(self, parent: Optional[QWidget] = None):
        super().__init__(parent)
        
        self.setWindowTitle("Welcome to CuePoint!")
        self.setModal(True)
        self.resize(600, 400)
        
        self.init_ui()
    
    def init_ui(self):
        """Initialize UI."""
        layout = QVBoxLayout(self)
        layout.setSpacing(24)
        layout.setContentsMargins(32, 32, 32, 32)
        
        # Logo/Title
        title_label = QLabel("🎵 CuePoint")
        title_label.setAlignment(Qt.AlignCenter)
        title_label.setStyleSheet("font-size: 48px; font-weight: bold;")
        layout.addWidget(title_label)
        
        subtitle_label = QLabel("Beatport Metadata Enricher")
        subtitle_label.setAlignment(Qt.AlignCenter)
        subtitle_label.setStyleSheet("font-size: 18px; color: #666;")
        layout.addWidget(subtitle_label)
        
        layout.addSpacing(24)
        
        # Description
        desc_label = QLabel(
            "CuePoint helps you enrich your music playlists with metadata "
            "from Beatport. Get BPM, key, genre, and more for your tracks!"
        )
        desc_label.setAlignment(Qt.AlignCenter)
        desc_label.setWordWrap(True)
        desc_label.setStyleSheet("font-size: 14px; padding: 16px;")
        layout.addWidget(desc_label)
        
        layout.addStretch()
        
        # Buttons
        button_layout = QHBoxLayout()
        button_layout.setSpacing(16)
        
        skip_btn = PixelButton("Skip Tutorial", class_name="secondary")
        skip_btn.clicked.connect(lambda: self.accept())
        
        start_btn = PixelButton("Start Tutorial", class_name="primary")
        start_btn.clicked.connect(lambda: self.accept())
        
        button_layout.addStretch()
        button_layout.addWidget(skip_btn)
        button_layout.addWidget(start_btn)
        button_layout.addStretch()
        
        layout.addLayout(button_layout)
```

```python
# src/cuepoint/ui/onboarding/tooltip_manager.py
"""
Contextual tooltip and help system.
"""

from typing import Dict, Optional
from PySide6.QtCore import QObject
from PySide6.QtWidgets import QWidget, QToolTip


class TooltipManager(QObject):
    """Manages contextual tooltips and help."""
    
    def __init__(self, parent: Optional[QObject] = None):
        super().__init__(parent)
        
        self.tooltips: Dict[str, str] = {
            "file_select": "Select your XML playlist file. This file contains the tracks you want to enrich.",
            "playlist_select": "Choose a specific playlist from your file, or leave as 'All Playlists' to process everything.",
            "process_btn": "Click to start processing your playlist. This will search Beatport for each track.",
            "results_view": "View your enriched tracks here. Green checkmarks mean a match was found.",
            "export_btn": "Export your results to a CSV file for use in other applications.",
            "advanced_settings": "Click to show advanced options for power users.",
        }
    
    def get_tooltip(self, widget_id: str) -> Optional[str]:
        """Get tooltip text for a widget."""
        return self.tooltips.get(widget_id)
    
    def set_tooltip(self, widget: QWidget, widget_id: str):
        """Set tooltip for a widget."""
        tooltip_text = self.get_tooltip(widget_id)
        if tooltip_text:
            widget.setToolTip(tooltip_text)
```

---

## File Structure

```
src/cuepoint/ui/onboarding/
├── __init__.py
├── tutorial_manager.py      # Tutorial flow management
├── welcome_screen.py         # Welcome dialog
├── tooltip_manager.py        # Contextual help
└── tutorial_overlay.py       # Tutorial step overlay (optional)
```

---

## Testing Requirements

### Functional Testing
- [ ] Welcome screen shows for first-time users
- [ ] Tutorial steps progress correctly
- [ ] Tutorial can be skipped
- [ ] Tutorial progress saves
- [ ] Tooltips display correctly
- [ ] Help documentation accessible

### Usability Testing
- [ ] Tutorial is helpful for new users
- [ ] Steps are clear
- [ ] Tooltips are informative
- [ ] Help is easy to find

---

## Implementation Checklist

- [ ] Create TutorialManager class
- [ ] Create WelcomeScreen dialog
- [ ] Create TooltipManager
- [ ] Implement tutorial step flow
- [ ] Add first-time detection
- [ ] Add tutorial persistence
- [ ] Create help documentation
- [ ] Integrate with main window
- [ ] Test tutorial flow
- [ ] Get user feedback

---

## Dependencies

- **Step 6.3**: Redesign Main Window - Simple Mode
- **Theme System**: For styling

---

## Notes

- **Optional**: Tutorial should be skippable
- **Progressive**: Show help as needed
- **Contextual**: Help should be relevant to current action
- **Non-intrusive**: Don't interrupt workflow unnecessarily

---

## Next Steps

After completing this step:
1. Proceed to Step 6.7: Implement Custom Widgets & Components
2. Custom widgets will enhance tutorial and overall UI
3. Test complete onboarding flow

