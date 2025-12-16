#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Accessibility Helpers (Step 9.2)

Helper functions for setting accessible names, descriptions, and semantic structure.
"""

from typing import Optional

from PySide6.QtWidgets import QLabel, QWidget


class AccessibilityHelper:
    """Helper for setting accessible names and descriptions."""

    @staticmethod
    def set_accessible_name(widget: QWidget, name: str):
        """Set accessible name for widget.

        Args:
            widget: Widget to set accessible name for.
            name: Accessible name (should be descriptive).
        """
        widget.setAccessibleName(name)

    @staticmethod
    def set_accessible_description(widget: QWidget, description: str):
        """Set accessible description for widget.

        Args:
            widget: Widget to set accessible description for.
            description: Accessible description (provides context).
        """
        widget.setAccessibleDescription(description)

    @staticmethod
    def set_label_buddy(label: QLabel, widget: QWidget):
        """Associate label with widget for accessibility.

        Args:
            label: Label widget.
            widget: Widget to associate label with.
        """
        label.setBuddy(widget)
        # Qt automatically uses label text as accessible name

    @staticmethod
    def set_table_accessible_name(table: QWidget, name: str, description: Optional[str] = None):
        """Set accessible name and description for table.

        Args:
            table: Table widget.
            name: Accessible name for table.
            description: Optional description of table structure.
        """
        table.setAccessibleName(name)
        if description:
            table.setAccessibleDescription(description)

    @staticmethod
    def set_button_accessible_name(button: QWidget, name: str, description: Optional[str] = None):
        """Set accessible name and description for button.

        Args:
            button: Button widget.
            name: Accessible name (action description).
            description: Optional description of button action.
        """
        button.setAccessibleName(name)
        if description:
            button.setAccessibleDescription(description)

    @staticmethod
    def set_input_accessible_name(input_widget: QWidget, name: str, description: Optional[str] = None):
        """Set accessible name and description for input field.

        Args:
            input_widget: Input widget (QLineEdit, QTextEdit, etc.).
            name: Accessible name (field purpose).
            description: Optional description of expected input.
        """
        input_widget.setAccessibleName(name)
        if description:
            input_widget.setAccessibleDescription(description)
