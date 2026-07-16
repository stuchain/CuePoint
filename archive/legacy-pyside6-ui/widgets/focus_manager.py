#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Focus Manager (Step 9.2)

Manages focus order, keyboard navigation, and focus visibility for accessibility.
"""

from typing import List, Optional

from PySide6.QtCore import Qt
from PySide6.QtWidgets import QScrollArea, QWidget


class FocusManager:
    """Manages focus behavior and visibility for accessibility."""

    def __init__(self, parent: QWidget):
        """Initialize focus manager.

        Args:
            parent: Parent widget to manage focus for.
        """
        self.parent = parent
        self.tab_order: List[QWidget] = []

    def set_tab_order(self, widgets: List[QWidget]):
        """Set explicit tab order for widgets.

        Args:
            widgets: List of widgets in desired tab order.
        """
        self.tab_order = widgets
        for i in range(len(widgets) - 1):
            self.parent.setTabOrder(widgets[i], widgets[i + 1])

    def get_next_focusable(self, current: QWidget) -> Optional[QWidget]:
        """Get next focusable widget in tab order.

        Args:
            current: Currently focused widget.

        Returns:
            Next widget in tab order, or None if at end.
        """
        try:
            index = self.tab_order.index(current)
            if index < len(self.tab_order) - 1:
                return self.tab_order[index + 1]
        except ValueError:
            pass
        return None

    def get_previous_focusable(self, current: QWidget) -> Optional[QWidget]:
        """Get previous focusable widget in tab order.

        Args:
            current: Currently focused widget.

        Returns:
            Previous widget in tab order, or None if at start.
        """
        try:
            index = self.tab_order.index(current)
            if index > 0:
                return self.tab_order[index - 1]
        except ValueError:
            pass
        return None

    def ensure_focus_visible(self, widget: QWidget):
        """Ensure focus indicator is visible on widget.

        Args:
            widget: Widget to focus.
        """
        widget.setFocusPolicy(Qt.StrongFocus)
        widget.setFocus()

        # Scroll to widget if needed
        self._scroll_to_widget(widget)

    def trap_focus(self, container: QWidget, widgets: List[QWidget]):
        """Trap focus within a container (e.g., modal dialog).

        Args:
            container: Container widget to trap focus in.
            widgets: List of focusable widgets within container.
        """
        # Set focus policy
        for widget in widgets:
            widget.setFocusPolicy(Qt.StrongFocus)

        # Store original keyPressEvent
        original_key_press = container.keyPressEvent

        def handle_tab(event):
            """Handle Tab key to cycle within container."""
            if event.key() == Qt.Key_Tab:
                current = container.focusWidget()
                if current in widgets:
                    index = widgets.index(current)
                    if event.modifiers() & Qt.ShiftModifier:
                        # Shift+Tab: go backwards
                        next_index = (index - 1) % len(widgets)
                    else:
                        # Tab: go forwards
                        next_index = (index + 1) % len(widgets)
                    widgets[next_index].setFocus()
                    event.accept()
                    return
            # Call original handler for other keys
            if original_key_press:
                original_key_press(event)

        container.keyPressEvent = handle_tab

    def restore_focus(self, widget: QWidget):
        """Restore focus to widget after dialog/modal closes.

        Args:
            widget: Widget to restore focus to.
        """
        if widget and widget.isVisible():
            widget.setFocus()

    def _scroll_to_widget(self, widget: QWidget):
        """Scroll widget into view if in scrollable container.

        Args:
            widget: Widget to scroll to.
        """
        parent = widget.parent()
        while parent:
            if isinstance(parent, QScrollArea):
                parent.ensureWidgetVisible(widget)
                break
            parent = parent.parent()
