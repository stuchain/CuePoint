# Step 6.9: Implement Empty States & Error States

**Status**: 📝 Planned  
**Priority**: 🚀 P1 - HIGH PRIORITY  
**Estimated Duration**: 2-3 days  
**Dependencies**: Step 6.1 (Design System & Asset Creation), Step 6.8 (Add Animations & Transitions)

---

## Goal

Create engaging, helpful empty states and error states using pixel art character sprites. These states should be informative, provide clear next steps, and maintain the Pokemon-inspired aesthetic.

---

## Success Criteria

- [ ] Empty state screens designed
- [ ] Error state screens created
- [ ] Helpful messages included
- [ ] Character sprites integrated
- [ ] Action buttons provided
- [ ] States are informative
- [ ] States match pixel art style
- [ ] All error types handled

---

## Analytical Design

### Empty States

```
Empty States
├── No File Selected
│   ├── Character sprite
│   ├── Message
│   └── Action button
├── No Results
│   ├── Character sprite
│   ├── Message
│   └── Action button
├── No Matches Found
│   ├── Character sprite
│   ├── Message
│   └── Suggestions
└── Empty History
    ├── Character sprite
    ├── Message
    └── Action button
```

### Error States

```
Error States
├── File Not Found
│   ├── Character sprite
│   ├── Error message
│   └── Retry button
├── Processing Error
│   ├── Character sprite
│   ├── Error details
│   └── Retry button
├── Network Error
│   ├── Character sprite
│   ├── Error message
│   └── Retry button
└── Invalid File Format
    ├── Character sprite
    ├── Error message
    └── Help link
```

### Implementation

```python
# src/cuepoint/ui/widgets/empty_state.py
"""
Empty state widget with character sprite.
"""

from typing import Optional
from pathlib import Path

from PySide6.QtCore import Qt
from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QLabel, QPushButton
)
from PySide6.QtGui import QPixmap, QPainter

from cuepoint.ui.theme.theme_manager import ThemeManager
from cuepoint.ui.widgets.pixel_widgets import PixelButton


class EmptyStateType:
    """Types of empty states."""
    NO_FILE = "no_file"
    NO_RESULTS = "no_results"
    NO_MATCHES = "no_matches"
    EMPTY_HISTORY = "empty_history"


class EmptyStateWidget(QWidget):
    """Empty state widget with character sprite."""
    
    action_requested = Signal(str)  # Action type
    
    def __init__(
        self,
        state_type: str,
        parent: Optional[QWidget] = None
    ):
        super().__init__(parent)
        
        self.theme_manager = ThemeManager()
        self.state_type = state_type
        
        self.init_ui()
    
    def init_ui(self):
        """Initialize UI."""
        layout = QVBoxLayout(self)
        layout.setSpacing(24)
        layout.setAlignment(Qt.AlignCenter)
        
        # Character sprite
        self.create_character_sprite(layout)
        
        # Message
        self.create_message(layout)
        
        # Action button
        self.create_action_button(layout)
    
    def create_character_sprite(self, parent_layout: QVBoxLayout):
        """Create character sprite display."""
        sprite_path = self.get_sprite_path()
        
        if sprite_path and sprite_path.exists():
            sprite_label = QLabel()
            pixmap = QPixmap(str(sprite_path))
            # Scale if needed
            sprite_label.setPixmap(pixmap)
            sprite_label.setAlignment(Qt.AlignCenter)
            parent_layout.addWidget(sprite_label)
    
    def create_message(self, parent_layout: QVBoxLayout):
        """Create message label."""
        message = self.get_message()
        
        message_label = QLabel(message)
        message_label.setAlignment(Qt.AlignCenter)
        message_label.setWordWrap(True)
        message_label.setStyleSheet("""
            font-size: 16px;
            color: #666;
            padding: 16px;
        """)
        
        parent_layout.addWidget(message_label)
    
    def create_action_button(self, parent_layout: QVBoxLayout):
        """Create action button."""
        button_text, action_type = self.get_action_info()
        
        if button_text:
            action_btn = PixelButton(button_text, class_name="primary")
            action_btn.clicked.connect(
                lambda: self.action_requested.emit(action_type)
            )
            parent_layout.addWidget(action_btn)
    
    def get_sprite_path(self) -> Optional[Path]:
        """Get path to character sprite."""
        assets_path = self.theme_manager.assets_path
        sprite_name = f"empty_state_{self.state_type}.png"
        return assets_path / "sprites" / "characters" / sprite_name
    
    def get_message(self) -> str:
        """Get message for state type."""
        messages = {
            EmptyStateType.NO_FILE: "No playlist file selected. Click 'Browse Files' to get started!",
            EmptyStateType.NO_RESULTS: "No results yet. Process your playlist to see enriched tracks.",
            EmptyStateType.NO_MATCHES: "No matches found. Try adjusting your search settings.",
            EmptyStateType.EMPTY_HISTORY: "No search history. Your past searches will appear here.",
        }
        return messages.get(self.state_type, "Empty state")
    
    def get_action_info(self) -> tuple:
        """Get action button text and type."""
        actions = {
            EmptyStateType.NO_FILE: ("Browse Files", "browse_file"),
            EmptyStateType.NO_RESULTS: ("Process Playlist", "process"),
            EmptyStateType.NO_MATCHES: ("Adjust Settings", "settings"),
            EmptyStateType.EMPTY_HISTORY: ("Start Searching", "search"),
        }
        return actions.get(self.state_type, (None, None))
```

```python
# src/cuepoint/ui/widgets/error_state.py
"""
Error state widget with character sprite.
"""

from typing import Optional
from pathlib import Path

from PySide6.QtCore import Qt, Signal
from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QLabel, QPushButton, QTextEdit
)

from cuepoint.ui.theme.theme_manager import ThemeManager
from cuepoint.ui.widgets.pixel_widgets import PixelButton, PixelBadge


class ErrorStateWidget(QWidget):
    """Error state widget with character sprite."""
    
    retry_requested = Signal()
    help_requested = Signal()
    
    def __init__(
        self,
        error_type: str,
        error_message: str,
        error_details: Optional[str] = None,
        parent: Optional[QWidget] = None
    ):
        super().__init__(parent)
        
        self.theme_manager = ThemeManager()
        self.error_type = error_type
        self.error_message = error_message
        self.error_details = error_details
        
        self.init_ui()
    
    def init_ui(self):
        """Initialize UI."""
        layout = QVBoxLayout(self)
        layout.setSpacing(24)
        layout.setAlignment(Qt.AlignCenter)
        
        # Character sprite
        self.create_character_sprite(layout)
        
        # Error badge
        self.create_error_badge(layout)
        
        # Error message
        self.create_error_message(layout)
        
        # Error details (if available)
        if self.error_details:
            self.create_error_details(layout)
        
        # Action buttons
        self.create_action_buttons(layout)
    
    def create_character_sprite(self, parent_layout: QVBoxLayout):
        """Create character sprite display."""
        sprite_path = self.get_sprite_path()
        
        if sprite_path and sprite_path.exists():
            sprite_label = QLabel()
            pixmap = QPixmap(str(sprite_path))
            sprite_label.setPixmap(pixmap)
            sprite_label.setAlignment(Qt.AlignCenter)
            parent_layout.addWidget(sprite_label)
    
    def create_error_badge(self, parent_layout: QVBoxLayout):
        """Create error badge."""
        badge = PixelBadge("Error", "error")
        badge.setAlignment(Qt.AlignCenter)
        parent_layout.addWidget(badge)
    
    def create_error_message(self, parent_layout: QVBoxLayout):
        """Create error message."""
        message_label = QLabel(self.error_message)
        message_label.setAlignment(Qt.AlignCenter)
        message_label.setWordWrap(True)
        message_label.setStyleSheet("""
            font-size: 16px;
            color: #E24A4A;
            padding: 16px;
            font-weight: bold;
        """)
        parent_layout.addWidget(message_label)
    
    def create_error_details(self, parent_layout: QVBoxLayout):
        """Create error details display."""
        details_text = QTextEdit()
        details_text.setPlainText(self.error_details)
        details_text.setReadOnly(True)
        details_text.setMaximumHeight(150)
        details_text.setStyleSheet("""
            background-color: #F5F5F5;
            border: 2px solid #E24A4A;
            border-radius: 4px;
            padding: 8px;
            font-family: monospace;
            font-size: 12px;
        """)
        parent_layout.addWidget(details_text)
    
    def create_action_buttons(self, parent_layout: QVBoxLayout):
        """Create action buttons."""
        button_layout = QHBoxLayout()
        button_layout.setSpacing(16)
        
        # Retry button
        retry_btn = PixelButton("Retry", class_name="primary")
        retry_btn.clicked.connect(self.retry_requested.emit)
        button_layout.addWidget(retry_btn)
        
        # Help button
        help_btn = PixelButton("Get Help", class_name="secondary")
        help_btn.clicked.connect(self.help_requested.emit)
        button_layout.addWidget(help_btn)
        
        button_layout.addStretch()
        parent_layout.addLayout(button_layout)
    
    def get_sprite_path(self) -> Optional[Path]:
        """Get path to error character sprite."""
        assets_path = self.theme_manager.assets_path
        return assets_path / "sprites" / "characters" / "error_character.png"
```

---

## File Structure

```
src/cuepoint/ui/widgets/
├── empty_state.py          # Empty state widget
├── error_state.py          # Error state widget
└── ...
```

---

## Testing Requirements

### Functional Testing
- [ ] Empty states display correctly
- [ ] Error states display correctly
- [ ] Character sprites load
- [ ] Action buttons work
- [ ] Messages are helpful
- [ ] All state types handled

### Visual Testing
- [ ] States match pixel art style
- [ ] Character sprites are clear
- [ ] Layout is centered
- [ ] Text is readable

---

## Implementation Checklist

- [ ] Create EmptyStateWidget class
- [ ] Create ErrorStateWidget class
- [ ] Design empty state messages
- [ ] Design error state messages
- [ ] Integrate character sprites
- [ ] Add action buttons
- [ ] Test all empty states
- [ ] Test all error states
- [ ] Verify helpfulness

---

## Dependencies

- **Step 6.1**: Design System & Asset Creation (for sprites)
- **Step 6.8**: Add Animations & Transitions (for smooth transitions)

---

## Notes

- **Helpful**: States should guide users to next steps
- **Friendly**: Use friendly, non-technical language
- **Visual**: Character sprites add personality
- **Actionable**: Always provide clear actions

---

## Next Steps

After completing this step:
1. Proceed to Step 6.10: User Testing & Refinement
2. Test all states with real users
3. Refine based on feedback

