#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Test script for ConfigPanel widget

Tests the ConfigPanel widget with different presets and settings.
"""

import sys
from PySide6.QtWidgets import QApplication, QWidget, QVBoxLayout, QPushButton, QLabel
from gui.config_panel import ConfigPanel


def test_config_panel():
    """Test ConfigPanel widget"""
    app = QApplication(sys.argv)
    
    window = QWidget()
    window.setWindowTitle("ConfigPanel Test")
    window.setGeometry(100, 100, 600, 700)
    
    layout = QVBoxLayout(window)
    
    # Create config panel
    config_panel = ConfigPanel()
    layout.addWidget(config_panel)
    
    # Test buttons
    button_layout = QVBoxLayout()
    
    get_settings_btn = QPushButton("Get Current Settings")
    settings_label = QLabel("Settings will appear here")
    settings_label.setWordWrap(True)
    
    def show_settings():
        settings = config_panel.get_settings()
        auto_research = config_panel.get_auto_research()
        settings_text = f"Settings:\n{settings}\n\nAuto-research: {auto_research}"
        settings_label.setText(settings_text)
    
    get_settings_btn.clicked.connect(show_settings)
    button_layout.addWidget(get_settings_btn)
    button_layout.addWidget(settings_label)
    
    reset_btn = QPushButton("Reset to Defaults")
    reset_btn.clicked.connect(config_panel.reset_to_defaults)
    button_layout.addWidget(reset_btn)
    
    layout.addLayout(button_layout)
    
    # Show initial settings
    show_settings()
    
    window.show()
    sys.exit(app.exec())


if __name__ == "__main__":
    test_config_panel()

