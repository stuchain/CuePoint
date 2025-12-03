#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Settings Dialog Module

This module contains the SettingsDialog class for displaying settings in a dialog window.
"""

from PySide6.QtWidgets import (
    QDialog,
    QDialogButtonBox,
    QVBoxLayout,
)

from cuepoint.ui.controllers.config_controller import ConfigController
from cuepoint.ui.widgets.config_panel import ConfigPanel


class SettingsDialog(QDialog):
    """Dialog for application settings"""

    def __init__(self, config_controller: ConfigController, parent=None):
        super().__init__(parent)
        self.config_controller = config_controller
        self.setWindowTitle("Settings")
        self.setMinimumSize(700, 600)
        self.init_ui()

    def init_ui(self):
        """Initialize UI components"""
        layout = QVBoxLayout(self)
        layout.setContentsMargins(10, 10, 10, 10)
        layout.setSpacing(10)

        # Add config panel
        self.config_panel = ConfigPanel(config_controller=self.config_controller)
        layout.addWidget(self.config_panel)

        # Add button box
        button_box = QDialogButtonBox(
            QDialogButtonBox.Ok | QDialogButtonBox.Cancel | QDialogButtonBox.Apply
        )
        button_box.accepted.connect(self.accept)
        button_box.rejected.connect(self.reject)
        
        # Apply button
        apply_button = button_box.button(QDialogButtonBox.Apply)
        apply_button.clicked.connect(self.apply_settings)
        
        layout.addWidget(button_box)

    def apply_settings(self):
        """Apply settings without closing dialog"""
        # Settings are applied automatically by ConfigPanel
        # This method can be used for additional validation or feedback
        pass

    def get_settings(self):
        """Get current settings from config panel"""
        return self.config_panel.get_settings()

    def get_auto_research(self):
        """Get auto research setting from config panel"""
        return self.config_panel.get_auto_research()

