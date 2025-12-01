# Step 6.7: Implement Custom Widgets & Components

**Status**: 📝 Planned  
**Priority**: 🚀 P1 - HIGH PRIORITY  
**Estimated Duration**: 5-6 days  
**Dependencies**: Step 6.2 (Implement Theme System)

---

## Goal

Create custom pixel art styled widgets that provide a cohesive, visually appealing UI. These widgets will replace standard Qt widgets with pixel-perfect, Pokemon-inspired designs.

---

## Success Criteria

- [ ] PixelButton widget created
- [ ] PixelProgressBar widget created
- [ ] PixelInput widget created
- [ ] PixelCheckbox widget created
- [ ] PixelCard widget created
- [ ] PixelBadge widget created
- [ ] All widgets styled consistently
- [ ] Widgets integrate with theme system
- [ ] Widgets are reusable
- [ ] Widgets maintain Qt compatibility

---

## Analytical Design

### Widget Architecture

```
Custom Widgets
├── PixelButton
│   ├── Primary, Secondary, Success, Danger variants
│   ├── Icon support
│   └── Hover/Active states
├── PixelProgressBar
│   ├── Animated progress
│   ├── Text overlay
│   └── Custom styling
├── PixelInput
│   ├── Text input
│   ├── Validation states
│   └── Placeholder support
├── PixelCheckbox
│   ├── Custom appearance
│   └── States (checked, unchecked, disabled)
├── PixelCard
│   ├── Container widget
│   ├── Header/Footer support
│   └── Shadow effects
└── PixelBadge
    ├── Status badges
    ├── Color variants
    └── Icon support
```

### Implementation

```python
# src/cuepoint/ui/widgets/pixel_widgets.py
"""
Custom pixel art styled widgets.
"""

from typing import Optional
from enum import Enum

from PySide6.QtCore import Qt, QPropertyAnimation, QRect, Property
from PySide6.QtWidgets import (
    QWidget, QPushButton, QProgressBar, QLineEdit,
    QCheckBox, QFrame, QLabel, QHBoxLayout, QVBoxLayout
)
from PySide6.QtGui import QPainter, QColor, QPen, QBrush, QIcon, QFont

from cuepoint.ui.theme.theme_manager import ThemeManager


class ButtonVariant(Enum):
    """Button style variants."""
    PRIMARY = "primary"
    SECONDARY = "secondary"
    SUCCESS = "success"
    DANGER = "danger"


class PixelButton(QPushButton):
    """Pixel art styled button."""
    
    def __init__(
        self,
        text: str = "",
        parent: Optional[QWidget] = None,
        class_name: str = "primary"
    ):
        super().__init__(text, parent)
        
        self.theme_manager = ThemeManager()
        self.variant = ButtonVariant(class_name)
        self._hovered = False
        self._pressed = False
        
        self.setMinimumHeight(40)
        self.setCursor(Qt.PointingHandCursor)
    
    def enterEvent(self, event):
        """Handle mouse enter."""
        self._hovered = True
        self.update()
        super().enterEvent(event)
    
    def leaveEvent(self, event):
        """Handle mouse leave."""
        self._hovered = False
        self.update()
        super().leaveEvent(event)
    
    def mousePressEvent(self, event):
        """Handle mouse press."""
        self._pressed = True
        self.update()
        super().mousePressEvent(event)
    
    def mouseReleaseEvent(self, event):
        """Handle mouse release."""
        self._pressed = False
        self.update()
        super().mouseReleaseEvent(event)
    
    def paintEvent(self, event):
        """Custom paint event for pixel art style."""
        painter = QPainter(self)
        painter.setRenderHint(QPainter.Antialiasing, False)  # Pixel-perfect
        
        rect = self.rect()
        
        # Get colors based on variant
        bg_color, border_color, text_color = self.get_colors()
        
        # Adjust for state
        if self._pressed:
            bg_color = self.darken_color(bg_color, 0.2)
        elif self._hovered:
            bg_color = self.lighten_color(bg_color, 0.1)
        
        # Draw background
        painter.fillRect(rect, QColor(bg_color))
        
        # Draw border (2px for pixel art)
        pen = QPen(QColor(border_color), 2)
        painter.setPen(pen)
        painter.drawRect(rect.adjusted(1, 1, -1, -1))
        
        # Draw text
        painter.setPen(QColor(text_color))
        font = QFont()
        font.setBold(True)
        painter.setFont(font)
        painter.drawText(rect, Qt.AlignCenter, self.text())
    
    def get_colors(self):
        """Get colors for current variant."""
        palette = self.theme_manager.color_palette
        
        if self.variant == ButtonVariant.PRIMARY:
            return (
                palette.get_color("primary", "blue"),
                palette.get_color("primary", "blue"),  # Darker for border
                "#FFFFFF"
            )
        elif self.variant == ButtonVariant.SECONDARY:
            return (
                palette.get_color("background", "card_bg"),
                palette.get_color("text", "secondary"),
                palette.get_color("text", "primary")
            )
        elif self.variant == ButtonVariant.SUCCESS:
            return (
                palette.get_color("status", "success"),
                palette.get_color("status", "success"),
                "#FFFFFF"
            )
        else:  # DANGER
            return (
                palette.get_color("status", "error"),
                palette.get_color("status", "error"),
                "#FFFFFF"
            )
    
    def lighten_color(self, hex_color: str, factor: float) -> str:
        """Lighten a hex color."""
        # Implementation (same as in theme)
        pass
    
    def darken_color(self, hex_color: str, factor: float) -> str:
        """Darken a hex color."""
        # Implementation (same as in theme)
        pass


class PixelProgressBar(QProgressBar):
    """Pixel art styled progress bar."""
    
    def __init__(self, parent: Optional[QWidget] = None):
        super().__init__(parent)
        
        self.theme_manager = ThemeManager()
        self.setMinimumHeight(24)
        self.setTextVisible(True)
    
    def paintEvent(self, event):
        """Custom paint event."""
        painter = QPainter(self)
        painter.setRenderHint(QPainter.Antialiasing, False)
        
        rect = self.rect()
        
        # Background
        bg_color = self.theme_manager.get_color("background", "card_bg")
        painter.fillRect(rect, QColor(bg_color))
        
        # Border
        border_color = self.theme_manager.get_color("text", "secondary")
        pen = QPen(QColor(border_color), 2)
        painter.setPen(pen)
        painter.drawRect(rect.adjusted(1, 1, -1, -1))
        
        # Progress fill
        if self.maximum() > 0:
            progress_rect = QRect(
                rect.left() + 2,
                rect.top() + 2,
                int((rect.width() - 4) * self.value() / self.maximum()),
                rect.height() - 4
            )
            
            fill_color = self.theme_manager.get_color("primary", "blue")
            painter.fillRect(progress_rect, QColor(fill_color))
        
        # Text
        text_color = self.theme_manager.get_color("text", "primary")
        painter.setPen(QColor(text_color))
        painter.drawText(rect, Qt.AlignCenter, self.text())


class PixelCard(QFrame):
    """Pixel art styled card container."""
    
    def __init__(self, parent: Optional[QWidget] = None):
        super().__init__(parent)
        
        self.theme_manager = ThemeManager()
        self.setFrameStyle(QFrame.Box)
        self.setLineWidth(2)
    
    def paintEvent(self, event):
        """Custom paint event."""
        painter = QPainter(self)
        painter.setRenderHint(QPainter.Antialiasing, False)
        
        rect = self.rect()
        
        # Background
        bg_color = self.theme_manager.get_color("background", "card_bg")
        painter.fillRect(rect, QColor(bg_color))
        
        # Border
        border_color = self.theme_manager.get_color("text", "secondary")
        pen = QPen(QColor(border_color), 2)
        painter.setPen(pen)
        painter.drawRect(rect.adjusted(1, 1, -1, -1))


class PixelBadge(QLabel):
    """Pixel art styled badge."""
    
    def __init__(
        self,
        text: str,
        variant: str = "info",
        parent: Optional[QWidget] = None
    ):
        super().__init__(text, parent)
        
        self.theme_manager = ThemeManager()
        self.variant = variant
        self.setAlignment(Qt.AlignCenter)
        self.setMinimumHeight(24)
        self.setStyleSheet(self.get_badge_style())
    
    def get_badge_style(self) -> str:
        """Get style sheet for badge."""
        palette = self.theme_manager.color_palette
        
        if self.variant == "success":
            bg = palette.get_color("status", "success")
            text = "#FFFFFF"
        elif self.variant == "error":
            bg = palette.get_color("status", "error")
            text = "#FFFFFF"
        elif self.variant == "warning":
            bg = palette.get_color("status", "warning")
            text = "#000000"
        else:  # info
            bg = palette.get_color("status", "info")
            text = "#FFFFFF"
        
        return f"""
            background-color: {bg};
            color: {text};
            border: 2px solid {self.darken_color(bg, 0.2)};
            border-radius: 4px;
            padding: 4px 8px;
            font-weight: bold;
            font-size: 12px;
        """
    
    def darken_color(self, hex_color: str, factor: float) -> str:
        """Darken a hex color."""
        # Implementation
        pass
```

---

## File Structure

```
src/cuepoint/ui/widgets/
├── pixel_widgets.py           # All custom pixel widgets
└── ...
```

---

## Testing Requirements

### Functional Testing
- [ ] All widgets render correctly
- [ ] Widgets respond to interactions
- [ ] Widgets integrate with theme
- [ ] Widgets maintain Qt compatibility
- [ ] Widgets are reusable

### Visual Testing
- [ ] Widgets match pixel art style
- [ ] Colors are consistent
- [ ] Borders are pixel-perfect
- [ ] States (hover, active) work correctly

---

## Implementation Checklist

- [ ] Create PixelButton widget
- [ ] Create PixelProgressBar widget
- [ ] Create PixelInput widget
- [ ] Create PixelCheckbox widget
- [ ] Create PixelCard widget
- [ ] Create PixelBadge widget
- [ ] Integrate with theme system
- [ ] Test all widgets
- [ ] Document widget usage
- [ ] Replace standard widgets in UI

---

## Dependencies

- **Step 6.2**: Implement Theme System
- **PySide6**: For widget base classes

---

## Notes

- **Pixel-Perfect**: Disable anti-aliasing for crisp edges
- **Consistency**: All widgets should follow same design language
- **Performance**: Optimize paint events
- **Accessibility**: Maintain keyboard navigation

---

## Next Steps

After completing this step:
1. Proceed to Step 6.8: Add Animations & Transitions
2. Animations will enhance custom widgets
3. Test complete UI with animations

