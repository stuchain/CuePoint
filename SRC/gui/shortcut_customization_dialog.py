#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Shortcut Customization Dialog

Allows users to customize keyboard shortcuts.
"""

from PySide6.QtWidgets import (
    QDialog, QVBoxLayout, QHBoxLayout, QTableWidget, QTableWidgetItem,
    QPushButton, QLabel, QLineEdit, QMessageBox, QGroupBox, QHeaderView
)
from PySide6.QtCore import Qt
from PySide6.QtGui import QKeySequence, QKeyEvent
from typing import Dict, Tuple, Optional
from gui.shortcut_manager import ShortcutManager


class ShortcutCustomizationDialog(QDialog):
    """Dialog for customizing keyboard shortcuts"""
    
    def __init__(self, shortcut_manager: ShortcutManager, parent=None):
        super().__init__(parent)
        self.shortcut_manager = shortcut_manager
        self.changes: Dict[str, str] = {}
        self.init_ui()
        self.load_shortcuts()
    
    def init_ui(self):
        """Initialize UI"""
        self.setWindowTitle("Customize Keyboard Shortcuts")
        self.setMinimumSize(700, 500)
        
        layout = QVBoxLayout(self)
        
        # Instructions
        instructions = QLabel(
            "Double-click a shortcut to edit it. Press the desired key combination, "
            "then press Enter to confirm or Esc to cancel."
        )
        instructions.setWordWrap(True)
        layout.addWidget(instructions)
        
        # Shortcuts table
        self.table = QTableWidget()
        self.table.setColumnCount(3)
        self.table.setHorizontalHeaderLabels(["Action", "Description", "Shortcut"])
        self.table.setEditTriggers(QTableWidget.NoEditTriggers)
        self.table.setSelectionBehavior(QTableWidget.SelectRows)
        self.table.setAlternatingRowColors(True)
        self.table.horizontalHeader().setStretchLastSection(True)
        self.table.setColumnWidth(0, 200)
        self.table.setColumnWidth(1, 300)
        self.table.doubleClicked.connect(self.on_edit_shortcut)
        layout.addWidget(self.table)
        
        # Buttons
        button_layout = QHBoxLayout()
        
        self.reset_button = QPushButton("Reset Selected")
        self.reset_button.clicked.connect(self.on_reset_selected)
        button_layout.addWidget(self.reset_button)
        
        self.reset_all_button = QPushButton("Reset All")
        self.reset_all_button.clicked.connect(self.on_reset_all)
        button_layout.addWidget(self.reset_all_button)
        
        button_layout.addStretch()
        
        self.save_button = QPushButton("Save")
        self.save_button.clicked.connect(self.on_save)
        button_layout.addWidget(self.save_button)
        
        self.cancel_button = QPushButton("Cancel")
        self.cancel_button.clicked.connect(self.reject)
        button_layout.addWidget(self.cancel_button)
        
        layout.addLayout(button_layout)
    
    def load_shortcuts(self):
        """Load shortcuts into table"""
        all_shortcuts = self.shortcut_manager.get_all_shortcuts()
        self.table.setRowCount(len(all_shortcuts))
        
        for row, (action_id, (sequence, description, context)) in enumerate(all_shortcuts.items()):
            self.table.setItem(row, 0, QTableWidgetItem(action_id))
            self.table.setItem(row, 1, QTableWidgetItem(description))
            shortcut_item = QTableWidgetItem(sequence)
            shortcut_item.setData(Qt.UserRole, action_id)  # Store action ID
            self.table.setItem(row, 2, shortcut_item)
    
    def on_edit_shortcut(self, index):
        """Edit shortcut for selected row"""
        if index.column() != 2:  # Only edit shortcut column
            return
        
        action_id = self.table.item(index.row(), 0).text()
        current_shortcut = self.table.item(index.row(), 2).text()
        
        # Create input dialog
        dialog = ShortcutInputDialog(current_shortcut, self)
        if dialog.exec() == QDialog.Accepted:
            new_shortcut = dialog.get_shortcut()
            if new_shortcut:
                # Check for conflicts
                if self.check_conflict(action_id, new_shortcut):
                    QMessageBox.warning(
                        self,
                        "Conflict",
                        f"Shortcut '{new_shortcut}' is already in use."
                    )
                    return
                
                # Update table
                self.table.setItem(index.row(), 2, QTableWidgetItem(new_shortcut))
                self.changes[action_id] = new_shortcut
    
    def check_conflict(self, action_id: str, sequence: str) -> bool:
        """Check if shortcut conflicts with another"""
        for row in range(self.table.rowCount()):
            other_action_id = self.table.item(row, 0).text()
            other_sequence = self.table.item(row, 2).text()
            if other_action_id != action_id and other_sequence == sequence:
                return True
        return False
    
    def on_reset_selected(self):
        """Reset selected shortcut to default"""
        selected = self.table.selectedItems()
        if selected:
            row = selected[0].row()
            action_id = self.table.item(row, 0).text()
            # Get default from shortcut manager
            default = None
            for context, shortcuts in self.shortcut_manager.DEFAULT_SHORTCUTS.items():
                if action_id in shortcuts:
                    default = shortcuts[action_id][0]
                    break
            if default:
                # Adapt for platform
                import sys
                if sys.platform == "darwin":
                    default = default.replace("Ctrl+", "Meta+")
                self.table.setItem(row, 2, QTableWidgetItem(default))
                if action_id in self.changes:
                    del self.changes[action_id]
    
    def on_reset_all(self):
        """Reset all shortcuts to defaults"""
        reply = QMessageBox.question(
            self,
            "Reset All",
            "Reset all shortcuts to defaults?",
            QMessageBox.Yes | QMessageBox.No
        )
        if reply == QMessageBox.Yes:
            self.changes.clear()
            self.load_shortcuts()
    
    def on_save(self):
        """Save changes"""
        for action_id, sequence in self.changes.items():
            if not self.shortcut_manager.set_custom_shortcut(action_id, sequence):
                QMessageBox.warning(
                    self,
                    "Error",
                    f"Failed to set shortcut for '{action_id}'"
                )
                return
        
        QMessageBox.information(self, "Saved", "Shortcuts saved successfully.")
        self.accept()


class ShortcutInputDialog(QDialog):
    """Dialog for inputting a keyboard shortcut"""
    
    def __init__(self, current_shortcut: str, parent=None):
        super().__init__(parent)
        self.current_shortcut = current_shortcut
        self.new_shortcut = ""
        self.init_ui()
    
    def init_ui(self):
        """Initialize UI"""
        self.setWindowTitle("Edit Shortcut")
        self.setModal(True)
        
        layout = QVBoxLayout(self)
        
        # Instructions
        instructions = QLabel("Press the key combination you want to use:")
        layout.addWidget(instructions)
        
        # Input field
        self.input_field = QLineEdit()
        self.input_field.setReadOnly(True)
        self.input_field.setText(self.current_shortcut)
        self.input_field.setPlaceholderText("Press keys...")
        self.input_field.keyPressEvent = self.on_key_press
        layout.addWidget(self.input_field)
        
        # Buttons
        button_layout = QHBoxLayout()
        button_layout.addStretch()
        
        ok_button = QPushButton("OK")
        ok_button.clicked.connect(self.accept)
        button_layout.addWidget(ok_button)
        
        cancel_button = QPushButton("Cancel")
        cancel_button.clicked.connect(self.reject)
        button_layout.addWidget(cancel_button)
        
        layout.addLayout(button_layout)
    
    def on_key_press(self, event: QKeyEvent):
        """Handle key press"""
        key = event.key()
        modifiers = event.modifiers()
        
        # Ignore modifier-only keys
        if key in (Qt.Key_Control, Qt.Key_Alt, Qt.Key_Shift, Qt.Key_Meta):
            return
        
        # Build shortcut string
        parts = []
        if modifiers & Qt.ControlModifier:
            parts.append("Ctrl")
        if modifiers & Qt.AltModifier:
            parts.append("Alt")
        if modifiers & Qt.ShiftModifier:
            parts.append("Shift")
        if modifiers & Qt.MetaModifier:
            parts.append("Meta")
        
        # Get key name
        key_name = QKeySequence(key).toString()
        if key_name:
            parts.append(key_name)
            self.new_shortcut = "+".join(parts)
            self.input_field.setText(self.new_shortcut)
    
    def get_shortcut(self) -> str:
        """Get the entered shortcut"""
        return self.new_shortcut if self.new_shortcut else self.current_shortcut

