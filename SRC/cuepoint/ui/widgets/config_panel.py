#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Config Panel Module - Settings panel widget

This module contains the ConfigPanel class for configuring processing settings.
"""

from typing import Any, Dict, Optional

from PySide6.QtCore import Qt, Signal
from PySide6.QtWidgets import (
    QButtonGroup,
    QCheckBox,
    QDoubleSpinBox,
    QGroupBox,
    QHBoxLayout,
    QLabel,
    QPushButton,
    QRadioButton,
    QSpinBox,
    QVBoxLayout,
    QWidget,
)

from cuepoint.models.config import SETTINGS
from cuepoint.ui.controllers.config_controller import ConfigController


class ConfigPanel(QWidget):
    """Widget for configuring processing settings"""

    # Signal emitted when settings change
    settings_changed = Signal(dict)

    def __init__(
        self, config_controller: Optional[ConfigController] = None, parent=None
    ):
        super().__init__(parent)
        # Use provided controller or create a new one
        self.config_controller = config_controller or ConfigController()
        self.init_ui()
        self.load_defaults()

    def init_ui(self):
        """Initialize UI components"""
        layout = QVBoxLayout(self)
        layout.setSpacing(10)

        # Message at top
        message_label = QLabel(
            "We don't touch what already works, if it takes too much time go touch some grass :)"
        )
        message_label.setWordWrap(True)
        message_label.setAlignment(Qt.AlignCenter)
        message_label.setStyleSheet(
            "color: #666; font-style: italic; padding: 15px; font-size: 14px;"
        )
        layout.addWidget(message_label)

        layout.addSpacing(10)

        # Note: Auto-research is ALWAYS ON (removed checkbox)
        # Note: Performance Preset and Verbose logging moved to advanced settings

        # Show Advanced Settings button
        self.show_advanced_btn = QPushButton("Show Advanced Settings")
        self.show_advanced_btn.clicked.connect(self._toggle_advanced_settings)
        layout.addWidget(self.show_advanced_btn)

        # Advanced Settings (hidden by default) - ALL SETTINGS HERE
        self.advanced_group = QGroupBox("Advanced Settings")
        advanced_layout = QVBoxLayout()

        # Performance Presets (moved to advanced)
        preset_group = QGroupBox("Performance Preset")
        preset_layout = QVBoxLayout()

        self.preset_group = QButtonGroup()
        preset_buttons_layout = QHBoxLayout()

        presets = [
            ("Balanced", "balanced"),
            ("Fast", "fast"),
            ("Turbo", "turbo"),
            ("Exhaustive", "exhaustive"),
        ]

        for text, value in presets:
            radio = QRadioButton(text)
            radio.setObjectName(f"preset_{value}")
            if value == "balanced":
                radio.setChecked(True)
            self.preset_group.addButton(radio)
            preset_buttons_layout.addWidget(radio)

        preset_layout.addLayout(preset_buttons_layout)
        preset_group.setLayout(preset_layout)
        advanced_layout.addWidget(preset_group)

        # Connect preset changes
        self.preset_group.buttonClicked.connect(self._on_preset_changed)

        # Processing Options (moved to advanced)
        options_group = QGroupBox("Processing Options")
        options_layout = QVBoxLayout()

        self.verbose_check = QCheckBox("Enable verbose logging")
        self.verbose_check.setChecked(False)
        self.verbose_check.setToolTip("Show detailed progress information during processing")
        options_layout.addWidget(self.verbose_check)

        self.track_performance_check = QCheckBox("Track performance statistics")
        self.track_performance_check.setChecked(False)
        self.track_performance_check.setToolTip(
            "Enable real-time performance monitoring dashboard during processing"
        )
        options_layout.addWidget(self.track_performance_check)

        options_group.setLayout(options_layout)
        advanced_layout.addWidget(options_group)

        # Track Workers
        workers_layout = QHBoxLayout()
        workers_label = QLabel("Parallel Track Workers:")
        workers_label.setToolTip("Number of tracks to process simultaneously (1-20)")
        self.track_workers_spin = QSpinBox()
        self.track_workers_spin.setMinimum(1)
        self.track_workers_spin.setMaximum(20)
        self.track_workers_spin.setValue(12)
        self.track_workers_spin.setToolTip("Higher = faster but more memory usage")
        workers_layout.addWidget(workers_label)
        workers_layout.addWidget(self.track_workers_spin)
        workers_layout.addStretch()
        advanced_layout.addLayout(workers_layout)

        # Time Budget
        time_layout = QHBoxLayout()
        time_label = QLabel("Time Budget per Track (seconds):")
        time_label.setToolTip("Maximum time to spend searching for each track")
        self.time_budget_spin = QSpinBox()
        self.time_budget_spin.setMinimum(10)
        self.time_budget_spin.setMaximum(300)
        self.time_budget_spin.setValue(45)
        self.time_budget_spin.setSuffix(" sec")
        self.time_budget_spin.setToolTip("Higher = more thorough search but slower")
        time_layout.addWidget(time_label)
        time_layout.addWidget(self.time_budget_spin)
        time_layout.addStretch()
        advanced_layout.addLayout(time_layout)

        # Min Accept Score
        score_layout = QHBoxLayout()
        score_label = QLabel("Minimum Accept Score:")
        score_label.setToolTip("Minimum score required to accept a match (0-200+)")
        self.min_score_spin = QDoubleSpinBox()
        self.min_score_spin.setMinimum(0.0)
        self.min_score_spin.setMaximum(200.0)
        self.min_score_spin.setValue(70.0)
        self.min_score_spin.setDecimals(1)
        self.min_score_spin.setToolTip("Lower = more matches but potentially lower quality")
        score_layout.addWidget(score_label)
        score_layout.addWidget(self.min_score_spin)
        score_layout.addStretch()
        advanced_layout.addLayout(score_layout)

        # Max Search Results
        results_layout = QHBoxLayout()
        results_label = QLabel("Max Search Results per Query:")
        results_label.setToolTip("Maximum number of search results to fetch per query")
        self.max_results_spin = QSpinBox()
        self.max_results_spin.setMinimum(10)
        self.max_results_spin.setMaximum(200)
        self.max_results_spin.setValue(50)
        self.max_results_spin.setToolTip("Higher = more candidates but slower")
        results_layout.addWidget(results_label)
        results_layout.addWidget(self.max_results_spin)
        results_layout.addStretch()
        advanced_layout.addLayout(results_layout)

        self.advanced_group.setLayout(advanced_layout)
        self.advanced_group.setVisible(False)  # Hidden by default
        layout.addWidget(self.advanced_group)

        # Reset button
        reset_layout = QHBoxLayout()
        reset_layout.addStretch()
        self.reset_btn = QPushButton("Reset to Defaults")
        self.reset_btn.clicked.connect(self.reset_to_defaults)
        self.reset_btn.setToolTip("Reset all settings to default values from config.py")
        reset_layout.addWidget(self.reset_btn)
        reset_layout.addStretch()
        layout.addLayout(reset_layout)

        # Connect advanced settings changes
        self.track_workers_spin.valueChanged.connect(self._on_setting_changed)
        self.time_budget_spin.valueChanged.connect(self._on_setting_changed)
        self.min_score_spin.valueChanged.connect(self._on_setting_changed)
        self.max_results_spin.valueChanged.connect(self._on_setting_changed)
        self.verbose_check.stateChanged.connect(self._on_setting_changed)

        layout.addStretch()

    def load_defaults(self):
        """Load default settings from config.py SETTINGS"""
        # Load from global SETTINGS (actual defaults from config.py)
        self.track_workers_spin.setValue(SETTINGS.get("TRACK_WORKERS", 12))
        self.time_budget_spin.setValue(SETTINGS.get("PER_TRACK_TIME_BUDGET_SEC", 45))
        self.min_score_spin.setValue(float(SETTINGS.get("MIN_ACCEPT_SCORE", 70)))
        self.max_results_spin.setValue(SETTINGS.get("MAX_SEARCH_RESULTS", 50))

        # Also set verbose from defaults
        self.verbose_check.setChecked(SETTINGS.get("VERBOSE", False))

    def get_settings(self) -> Dict[str, Any]:
        """
        Get current settings as dictionary using ConfigController.

        Returns:
            Dictionary of settings to pass to process_playlist()
        """
        # Auto-research is always enabled
        settings = {"auto_research": True}

        # Get preset
        preset = self._get_selected_preset()

        # Use controller to get preset values or merge with custom settings
        if preset == "balanced":
            # For balanced, use advanced settings values (which should match defaults when reset)
            custom_settings = {
                "TRACK_WORKERS": self.track_workers_spin.value(),
                "PER_TRACK_TIME_BUDGET_SEC": self.time_budget_spin.value(),
                "MIN_ACCEPT_SCORE": self.min_score_spin.value(),
                "MAX_SEARCH_RESULTS": self.max_results_spin.value(),
            }
            settings.update(
                self.config_controller.merge_settings_with_preset(preset, custom_settings)
            )

            # Also include other default settings from config.py
            settings["CANDIDATE_WORKERS"] = SETTINGS.get("CANDIDATE_WORKERS", 15)
            settings["TITLE_WEIGHT"] = SETTINGS.get("TITLE_WEIGHT", 0.55)
            settings["ARTIST_WEIGHT"] = SETTINGS.get("ARTIST_WEIGHT", 0.45)
            settings["EARLY_EXIT_SCORE"] = SETTINGS.get("EARLY_EXIT_SCORE", 90)
            settings["EARLY_EXIT_MIN_QUERIES"] = SETTINGS.get("EARLY_EXIT_MIN_QUERIES", 8)
        else:
            # For other presets, use controller to get preset values
            settings.update(self.config_controller.get_preset_values(preset))

        # Get advanced settings (always read checkbox state, regardless of visibility)
        # The checkboxes maintain their state even when the group is hidden
        settings["VERBOSE"] = self.verbose_check.isChecked()
        settings["track_performance"] = self.track_performance_check.isChecked()

        settings["ENABLE_CACHE"] = SETTINGS.get("ENABLE_CACHE", True)

        return settings

    def get_auto_research(self) -> bool:
        """Get auto-research setting - always returns True"""
        return True

    def _get_selected_preset(self) -> str:
        """Get currently selected preset"""
        checked_button = self.preset_group.checkedButton()
        if checked_button:
            # Extract preset name from object name
            obj_name = checked_button.objectName()
            if obj_name.startswith("preset_"):
                return obj_name.replace("preset_", "")
        return "balanced"

    def _on_preset_changed(self, button):
        """Handle preset selection change using ConfigController"""
        preset = self._get_selected_preset()

        # Use controller to get preset values
        if preset == "balanced":
            # Reset to actual defaults from config.py
            self.load_defaults()
        else:
            # Get preset values from controller
            preset_values = self.config_controller.get_preset_values(preset)
            self.track_workers_spin.setValue(preset_values.get("TRACK_WORKERS", 12))
            self.time_budget_spin.setValue(preset_values.get("PER_TRACK_TIME_BUDGET_SEC", 45))
            self.min_score_spin.setValue(float(preset_values.get("MIN_ACCEPT_SCORE", 70.0)))
            self.max_results_spin.setValue(preset_values.get("MAX_SEARCH_RESULTS", 50))

        # Disable advanced settings when preset is selected (except balanced)
        # Only disable if advanced settings are visible
        if self.advanced_group.isVisible():
            enabled = preset == "balanced"
            self.track_workers_spin.setEnabled(enabled)
            self.time_budget_spin.setEnabled(enabled)
            self.min_score_spin.setEnabled(enabled)
            self.max_results_spin.setEnabled(enabled)

        self._on_setting_changed()

    def _on_setting_changed(self):
        """Handle any setting change"""
        # Emit signal with current settings
        settings = self.get_settings()
        self.settings_changed.emit(settings)

    def _toggle_advanced_settings(self):
        """Toggle visibility of advanced settings"""
        is_visible = self.advanced_group.isVisible()
        self.advanced_group.setVisible(not is_visible)

        if not is_visible:
            self.show_advanced_btn.setText("Hide Advanced Settings")
            # Enable/disable based on preset when showing
            preset = self._get_selected_preset()
            enabled = preset == "balanced"
            self.track_workers_spin.setEnabled(enabled)
            self.time_budget_spin.setEnabled(enabled)
            self.min_score_spin.setEnabled(enabled)
            self.max_results_spin.setEnabled(enabled)
        else:
            self.show_advanced_btn.setText("Show Advanced Settings")

    def reset_to_defaults(self):
        """Reset all settings to defaults from config.py"""
        # Reset to balanced preset (uses actual defaults)
        balanced_button = self.findChild(QRadioButton, "preset_balanced")
        if balanced_button:
            balanced_button.setChecked(True)

        # Reset verbose checkbox to defaults (auto-research is always on, no checkbox)
        self.verbose_check.setChecked(SETTINGS.get("VERBOSE", False))

        # Reset to actual default values from config.py
        self.load_defaults()

        self._on_setting_changed()
