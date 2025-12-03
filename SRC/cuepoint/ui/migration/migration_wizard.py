#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Migration wizard for guiding users through UI migration.

This module provides the MigrationWizard dialog that guides users
through the migration process from the old UI to the new UI.
"""

from typing import Optional
import logging

from PySide6.QtWidgets import (
    QDialog, QVBoxLayout, QHBoxLayout, QLabel,
    QTextEdit, QMessageBox, QWidget
)
from PySide6.QtCore import Qt

from cuepoint.ui.widgets.pixel_widgets import PixelButton, PixelCard, PixelProgressBar
from cuepoint.ui.migration.migration_manager import MigrationManager, MigrationStatus

logger = logging.getLogger(__name__)


class MigrationWizard(QDialog):
    """Wizard for migrating from old UI to new UI.
    
    This dialog guides users through the migration process,
    showing what will be migrated and providing options to
    migrate now, remind later, or skip migration.
    
    Usage:
        wizard = MigrationWizard(parent_window)
        if wizard.exec() == QDialog.Accepted:
            # Migration completed or skipped
            pass
    """
    
    def __init__(self, parent: Optional[QWidget] = None):
        """Initialize migration wizard.
        
        Args:
            parent: Parent widget
        """
        super().__init__(parent)
        
        self.migration_manager = MigrationManager()
        self.setWindowTitle("Welcome to the New CuePoint UI!")
        self.setMinimumSize(500, 400)
        self.resize(600, 450)
        
        # Make modal
        self.setModal(True)
        
        self.init_ui()
        self.setup_connections()
        
        logger.info("MigrationWizard initialized")
    
    def init_ui(self):
        """Initialize UI."""
        layout = QVBoxLayout(self)
        layout.setSpacing(24)
        layout.setContentsMargins(32, 32, 32, 32)
        
        # Welcome message
        welcome = QLabel("Welcome to the New CuePoint UI!")
        welcome.setStyleSheet("font-size: 20px; font-weight: bold;")
        layout.addWidget(welcome)
        
        # Description
        description = QLabel(
            "We've redesigned CuePoint with a simpler, more intuitive interface. "
            "Your settings and preferences will be migrated automatically."
        )
        description.setWordWrap(True)
        layout.addWidget(description)
        
        # Migration info card
        info_card = PixelCard()
        info_layout = QVBoxLayout(info_card)
        info_layout.setSpacing(12)
        
        info_label = QLabel("What will be migrated:")
        info_label.setStyleSheet("font-weight: bold;")
        info_layout.addWidget(info_label)
        
        info_text = QTextEdit()
        info_text.setReadOnly(True)
        info_text.setMaximumHeight(150)
        info_text.setPlainText(
            "• Application settings\n"
            "• User preferences\n"
            "• Recent files\n"
            "• Keyboard shortcuts\n"
            "• Window layout"
        )
        info_layout.addWidget(info_text)
        
        layout.addWidget(info_card)
        
        # Progress bar (hidden initially)
        self.progress_bar = PixelProgressBar()
        self.progress_bar.setVisible(False)
        self.progress_bar.setTextVisible(True)
        layout.addWidget(self.progress_bar)
        
        # Buttons
        button_layout = QHBoxLayout()
        button_layout.setSpacing(12)
        
        self.migrate_btn = PixelButton("Migrate Now", class_name="primary")
        self.later_btn = PixelButton("Remind Me Later", class_name="secondary")
        self.skip_btn = PixelButton("Skip Migration", class_name="secondary")
        
        button_layout.addWidget(self.later_btn)
        button_layout.addWidget(self.skip_btn)
        button_layout.addStretch()
        button_layout.addWidget(self.migrate_btn)
        
        layout.addLayout(button_layout)
    
    def setup_connections(self):
        """Setup signal connections."""
        self.migrate_btn.clicked.connect(self.start_migration)
        self.later_btn.clicked.connect(self.accept)
        self.skip_btn.clicked.connect(self.skip_migration)
        
        self.migration_manager.migration_complete.connect(self.on_migration_complete)
        self.migration_manager.migration_failed.connect(self.on_migration_failed)
    
    def start_migration(self):
        """Start migration process."""
        logger.info("Starting migration from wizard...")
        
        # Show progress
        self.progress_bar.setVisible(True)
        self.progress_bar.setRange(0, 0)  # Indeterminate
        self.progress_bar.setFormat("Migrating...")
        
        # Disable buttons
        self.migrate_btn.setEnabled(False)
        self.later_btn.setEnabled(False)
        self.skip_btn.setEnabled(False)
        
        # Execute migration (this is synchronous, but we show progress anyway)
        success = self.migration_manager.execute_migration()
        
        if not success:
            # Re-enable buttons if migration failed
            self.progress_bar.setVisible(False)
            self.migrate_btn.setEnabled(True)
            self.later_btn.setEnabled(True)
            self.skip_btn.setEnabled(True)
    
    def on_migration_complete(self):
        """Handle migration completion."""
        logger.info("Migration completed successfully")
        
        self.progress_bar.setRange(0, 100)
        self.progress_bar.setValue(100)
        self.progress_bar.setFormat("Migration Complete!")
        
        # Show success message
        QMessageBox.information(
            self,
            "Migration Complete",
            "Your settings have been successfully migrated to the new UI!\n\n"
            "You can now enjoy the improved interface."
        )
        
        # Close wizard
        self.accept()
    
    def on_migration_failed(self, error_msg: str):
        """Handle migration failure.
        
        Args:
            error_msg: Error message from migration manager
        """
        logger.error(f"Migration failed: {error_msg}")
        
        self.progress_bar.setVisible(False)
        
        # Show error message
        QMessageBox.warning(
            self,
            "Migration Failed",
            f"Migration encountered an error:\n\n{error_msg}\n\n"
            "You can continue using the old UI or try again later."
        )
        
        # Re-enable buttons
        self.migrate_btn.setEnabled(True)
        self.later_btn.setEnabled(True)
        self.skip_btn.setEnabled(True)
    
    def skip_migration(self):
        """Skip migration."""
        reply = QMessageBox.question(
            self,
            "Skip Migration",
            "Are you sure you want to skip migration?\n\n"
            "You can migrate later from the settings menu.",
            QMessageBox.Yes | QMessageBox.No,
            QMessageBox.No
        )
        
        if reply == QMessageBox.Yes:
            logger.info("User skipped migration")
            self.accept()

