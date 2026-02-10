#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Settings Dialog Module

This module contains the SettingsDialog class for displaying settings in a dialog window.
"""

from PySide6.QtCore import Qt
from PySide6.QtWidgets import (
    QDialog,
    QDialogButtonBox,
    QFrame,
    QHBoxLayout,
    QScrollArea,
    QVBoxLayout,
    QWidget,
)

from cuepoint.ui.controllers.config_controller import ConfigController
from cuepoint.ui.widgets.config_panel import ConfigPanel
from cuepoint.ui.widgets.privacy_settings import PrivacySettingsWidget


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

        # Scrollable content area to prevent overlap when advanced settings expand
        scroll_area = QScrollArea()
        scroll_area.setWidgetResizable(True)
        scroll_area.setFrameShape(QFrame.Shape.NoFrame)
        scroll_area.setHorizontalScrollBarPolicy(Qt.ScrollBarAlwaysOff)
        scroll_content = QWidget()
        scroll_layout = QVBoxLayout(scroll_content)
        scroll_layout.setContentsMargins(0, 0, 0, 0)
        scroll_layout.setSpacing(10)

        # Add config panel
        self.config_panel = ConfigPanel(config_controller=self.config_controller)
        scroll_layout.addWidget(self.config_panel)

        # Step 8.4, Step 14: Add privacy settings (clear cache/logs, telemetry opt-in)
        self.privacy_settings = PrivacySettingsWidget(
            self, config_controller=self.config_controller
        )
        self.privacy_settings.open_privacy_dialog_requested.connect(
            self._open_privacy_dialog
        )
        scroll_layout.addWidget(self.privacy_settings)

        # Show Advanced Settings and Reset to Defaults at bottom
        scroll_layout.addSpacing(16)
        scroll_layout.addWidget(self.config_panel.show_advanced_btn)
        reset_row = QHBoxLayout()
        reset_row.addStretch()
        reset_row.addWidget(self.config_panel.reset_btn)
        reset_row.addStretch()
        scroll_layout.addLayout(reset_row)

        scroll_area.setWidget(scroll_content)
        layout.addWidget(scroll_area)

        # Add button box
        button_box = QDialogButtonBox(
            QDialogButtonBox.Ok | QDialogButtonBox.Cancel | QDialogButtonBox.Apply
        )
        button_box.accepted.connect(self._on_ok)
        button_box.rejected.connect(self.reject)

        # Apply button - enabled only when there are unsaved changes
        self._apply_button = button_box.button(QDialogButtonBox.Apply)
        self._apply_button.clicked.connect(self.apply_settings)
        self._apply_button.setEnabled(False)
        self._last_applied_snapshot = self._get_full_snapshot()

        layout.addWidget(button_box)

        # Connect change signals to update Apply button state
        self.config_panel.settings_changed.connect(self._update_apply_button)
        self.config_panel.preflight_check.stateChanged.connect(self._update_apply_button)
        self.config_panel.checkpoint_every_spin.valueChanged.connect(
            self._update_apply_button
        )
        self.config_panel.max_retries_spin.valueChanged.connect(
            self._update_apply_button
        )
        self.config_panel.resume_enabled_check.stateChanged.connect(
            self._update_apply_button
        )
        self.privacy_settings.chk_telemetry.toggled.connect(self._update_apply_button)
        self.privacy_settings.chk_clear_cache.toggled.connect(self._update_apply_button)
        self.privacy_settings.chk_clear_logs.toggled.connect(self._update_apply_button)

    def _open_privacy_dialog(self) -> None:
        from cuepoint.ui.dialogs.privacy_dialog import PrivacyDialog

        PrivacyDialog(self).exec()

    def _on_ok(self):
        """Apply any unsaved changes, then close."""
        if self._apply_button.isEnabled():
            self.apply_settings()
        self.accept()

    def _get_full_snapshot(self):
        """Get comparable snapshot of all settings that trigger Apply."""
        return (
            self.config_panel.get_persisted_snapshot(),
            self.privacy_settings.get_snapshot(),
        )

    def _update_apply_button(self, *args):
        """Enable Apply only when current state differs from last applied."""
        current = self._get_full_snapshot()
        self._apply_button.setEnabled(current != self._last_applied_snapshot)

    def apply_settings(self):
        """Apply settings without closing dialog"""
        self.config_panel.apply_and_persist()
        # Privacy settings save on change; update snapshot so Apply disables
        self._last_applied_snapshot = self._get_full_snapshot()
        self._apply_button.setEnabled(False)

    def get_settings(self):
        """Get current settings from config panel"""
        return self.config_panel.get_settings()

    def get_auto_research(self):
        """Get auto research setting from config panel"""
        return self.config_panel.get_auto_research()
