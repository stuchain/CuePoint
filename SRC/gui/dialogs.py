#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Dialogs Module - Error dialogs and confirmations

This module contains error dialogs and confirmation dialogs for the GUI.
"""

from PySide6.QtWidgets import (
    QDialog, QVBoxLayout, QHBoxLayout, QLabel, QPushButton, QTextEdit
)
from PySide6.QtCore import Qt
from PySide6.QtGui import QIcon
from typing import Optional

from gui_interface import ProcessingError, ErrorType


class ErrorDialog(QDialog):
    """User-friendly error dialog for displaying ProcessingError objects"""
    
    def __init__(self, error: ProcessingError, parent=None):
        """
        Initialize error dialog.
        
        Args:
            error: ProcessingError object to display
            parent: Parent widget
        """
        super().__init__(parent)
        self.error = error
        self.init_ui()
    
    def init_ui(self):
        """Initialize UI components"""
        layout = QVBoxLayout(self)
        layout.setSpacing(15)
        layout.setContentsMargins(20, 20, 20, 20)
        
        # Error icon and title
        title_layout = QHBoxLayout()
        error_icon = QLabel("⚠️")
        error_icon.setStyleSheet("font-size: 24px;")
        title_label = QLabel("Error")
        title_label.setStyleSheet("font-size: 16px; font-weight: bold;")
        title_layout.addWidget(error_icon)
        title_layout.addWidget(title_label)
        title_layout.addStretch()
        layout.addLayout(title_layout)
        
        # Error message
        message_label = QLabel(self.error.message)
        message_label.setWordWrap(True)
        message_label.setStyleSheet("font-size: 12px; padding: 10px;")
        layout.addWidget(message_label)
        
        # Error type badge (optional, for visual distinction)
        error_type_label = QLabel(f"Type: {self.error.error_type.value.replace('_', ' ').title()}")
        error_type_label.setStyleSheet(
            "background-color: #ffebee; color: #c62828; "
            "padding: 5px 10px; border-radius: 3px; font-size: 10px;"
        )
        layout.addWidget(error_type_label)
        
        # Details section (if available)
        if self.error.details:
            details_label = QLabel("Details:")
            details_label.setStyleSheet("font-weight: bold; margin-top: 10px;")
            layout.addWidget(details_label)
            
            details_text = QTextEdit(self.error.details)
            details_text.setReadOnly(True)
            details_text.setMaximumHeight(100)
            details_text.setStyleSheet("background-color: #f5f5f5; padding: 5px;")
            layout.addWidget(details_text)
        
        # Suggestions section (if available)
        if self.error.suggestions:
            suggestions_label = QLabel("Suggestions:")
            suggestions_label.setStyleSheet("font-weight: bold; margin-top: 10px;")
            layout.addWidget(suggestions_label)
            
            suggestions_container = QVBoxLayout()
            suggestions_container.setSpacing(5)
            for suggestion in self.error.suggestions:
                sug_label = QLabel(f"• {suggestion}")
                sug_label.setWordWrap(True)
                sug_label.setStyleSheet("padding-left: 10px; color: #1976d2;")
                suggestions_container.addWidget(sug_label)
            layout.addLayout(suggestions_container)
        
        # Recoverable indicator
        if self.error.recoverable:
            recoverable_label = QLabel("This error is recoverable. You can try again after fixing the issue.")
            recoverable_label.setStyleSheet("color: #388e3c; font-style: italic; padding: 5px;")
            layout.addWidget(recoverable_label)
        
        # OK button
        button_layout = QHBoxLayout()
        button_layout.addStretch()
        ok_btn = QPushButton("OK")
        ok_btn.setMinimumWidth(100)
        ok_btn.setDefault(True)
        ok_btn.clicked.connect(self.accept)
        button_layout.addWidget(ok_btn)
        layout.addLayout(button_layout)
        
        # Window properties
        self.setWindowTitle("Error - CuePoint")
        self.setMinimumWidth(500)
        self.setMaximumWidth(700)
        self.setModal(True)


def show_error_dialog(error: ProcessingError, parent=None) -> None:
    """
    Convenience function to show an error dialog.
    
    Args:
        error: ProcessingError object to display
        parent: Parent widget
    """
    dialog = ErrorDialog(error, parent)
    dialog.exec()
