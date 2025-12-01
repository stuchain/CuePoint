# Step 6.8: Add Animations & Transitions

**Status**: 📝 Planned  
**Priority**: 🚀 P1 - HIGH PRIORITY  
**Estimated Duration**: 3-4 days  
**Dependencies**: Step 6.7 (Implement Custom Widgets & Components)

---

## Goal

Add smooth, engaging animations and transitions throughout the UI to enhance user experience. Animations should be subtle, performant, and maintain the pixel art aesthetic.

---

## Success Criteria

- [ ] Page transitions implemented
- [ ] Button animations working
- [ ] Loading animations created
- [ ] Progress animations smooth
- [ ] Micro-interactions added
- [ ] Animation performance optimized (60fps)
- [ ] Animations are optional (can be disabled)
- [ ] All animations maintain pixel art style

---

## Analytical Design

### Animation Types

```
Animations
├── Transitions
│   ├── Page changes
│   ├── Panel open/close
│   └── View switching
├── Loading
│   ├── Spinner
│   ├── Progress bar
│   └── Skeleton screens
├── Feedback
│   ├── Button press
│   ├── Hover effects
│   └── Status changes
└── Micro-interactions
    ├── Tooltip fade
    ├── Badge pulse
    └── Icon bounce
```

### Implementation

```python
# src/cuepoint/ui/animations/animation_utils.py
"""
Animation utilities and helpers.
"""

from typing import Optional, Callable
from PySide6.QtCore import (
    QPropertyAnimation, QEasingCurve, QAbstractAnimation,
    QParallelAnimationGroup, QSequentialAnimationGroup,
    Property, QObject
)
from PySide6.QtWidgets import QWidget


class AnimationUtils:
    """Utility class for common animations."""
    
    @staticmethod
    def fade_in(
        widget: QWidget,
        duration: int = 300,
        callback: Optional[Callable] = None
    ) -> QPropertyAnimation:
        """Fade in a widget."""
        animation = QPropertyAnimation(widget, b"windowOpacity")
        animation.setDuration(duration)
        animation.setStartValue(0.0)
        animation.setEndValue(1.0)
        animation.setEasingCurve(QEasingCurve.OutCubic)
        
        if callback:
            animation.finished.connect(callback)
        
        animation.start()
        return animation
    
    @staticmethod
    def fade_out(
        widget: QWidget,
        duration: int = 300,
        callback: Optional[Callable] = None
    ) -> QPropertyAnimation:
        """Fade out a widget."""
        animation = QPropertyAnimation(widget, b"windowOpacity")
        animation.setDuration(duration)
        animation.setStartValue(1.0)
        animation.setEndValue(0.0)
        animation.setEasingCurve(QEasingCurve.InCubic)
        
        if callback:
            animation.finished.connect(callback)
        
        animation.start()
        return animation
    
    @staticmethod
    def slide_in(
        widget: QWidget,
        direction: str = "right",
        duration: int = 300
    ) -> QPropertyAnimation:
        """Slide in a widget from a direction."""
        # Implementation for slide animation
        pass
    
    @staticmethod
    def bounce(
        widget: QWidget,
        intensity: float = 10.0,
        duration: int = 500
    ) -> QSequentialAnimationGroup:
        """Bounce animation for widget."""
        # Implementation for bounce
        pass


class PixelSpinner(QWidget):
    """Pixel art styled loading spinner."""
    
    def __init__(self, parent: Optional[QWidget] = None):
        super().__init__(parent)
        
        self.frame = 0
        self.total_frames = 8
        self.animation_timer = None
        
        self.setFixedSize(32, 32)
        self.start_animation()
    
    def start_animation(self):
        """Start spinner animation."""
        from PySide6.QtCore import QTimer
        self.animation_timer = QTimer(self)
        self.animation_timer.timeout.connect(self.next_frame)
        self.animation_timer.start(100)  # 10 FPS for pixel art
    
    def next_frame(self):
        """Advance to next frame."""
        self.frame = (self.frame + 1) % self.total_frames
        self.update()
    
    def paintEvent(self, event):
        """Paint spinner frame."""
        from PySide6.QtGui import QPainter, QColor
        
        painter = QPainter(self)
        painter.setRenderHint(QPainter.Antialiasing, False)
        
        # Draw spinner based on current frame
        # Load frame from assets
        # (Implementation depends on asset format)
        pass
```

```python
# src/cuepoint/ui/animations/transition_manager.py
"""
Manages page transitions and view changes.
"""

from typing import Optional, Callable
from PySide6.QtCore import QObject, Signal
from PySide6.QtWidgets import QWidget

from cuepoint.ui.animations.animation_utils import AnimationUtils


class TransitionManager(QObject):
    """Manages transitions between views."""
    
    transition_complete = Signal()
    
    def __init__(self, parent: Optional[QObject] = None):
        super().__init__(parent)
        
        self.animations_enabled = True
    
    def set_animations_enabled(self, enabled: bool):
        """Enable or disable animations."""
        self.animations_enabled = enabled
    
    def transition_views(
        self,
        old_view: QWidget,
        new_view: QWidget,
        transition_type: str = "fade",
        callback: Optional[Callable] = None
    ):
        """Transition between two views."""
        if not self.animations_enabled:
            old_view.hide()
            new_view.show()
            if callback:
                callback()
            return
        
        if transition_type == "fade":
            # Fade out old, fade in new
            AnimationUtils.fade_out(
                old_view,
                callback=lambda: self._show_new_view(new_view, callback)
            )
        elif transition_type == "slide":
            # Slide animation
            AnimationUtils.slide_in(new_view)
            old_view.hide()
            if callback:
                callback()
    
    def _show_new_view(self, new_view: QWidget, callback: Optional[Callable]):
        """Show new view after transition."""
        new_view.show()
        AnimationUtils.fade_in(new_view)
        if callback:
            callback()
        self.transition_complete.emit()
```

---

## File Structure

```
src/cuepoint/ui/animations/
├── __init__.py
├── animation_utils.py        # Animation utilities
├── transition_manager.py      # Transition management
└── pixel_spinner.py          # Loading spinner
```

---

## Testing Requirements

### Functional Testing
- [ ] All animations work correctly
- [ ] Animations can be disabled
- [ ] Performance is acceptable (60fps)
- [ ] No visual glitches
- [ ] Animations complete properly

### Performance Testing
- [ ] Frame rate maintained
- [ ] No lag during animations
- [ ] Memory usage acceptable
- [ ] CPU usage reasonable

---

## Implementation Checklist

- [ ] Create AnimationUtils class
- [ ] Implement fade animations
- [ ] Implement slide animations
- [ ] Create PixelSpinner widget
- [ ] Create TransitionManager
- [ ] Add button animations
- [ ] Add progress animations
- [ ] Add micro-interactions
- [ ] Optimize performance
- [ ] Add animation toggle
- [ ] Test all animations
- [ ] Verify performance

---

## Dependencies

- **Step 6.7**: Implement Custom Widgets & Components
- **PySide6**: For animation framework

---

## Notes

- **Performance**: Keep animations lightweight
- **Optional**: Allow users to disable animations
- **Style**: Maintain pixel art aesthetic
- **Timing**: Use appropriate durations (200-300ms)

---

## Next Steps

After completing this step:
1. Proceed to Step 6.9: Implement Empty States & Error States
2. Empty/error states will use animations
3. Test complete UI experience

