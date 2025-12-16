#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Keyboard Shortcuts Dialog (Step 9.2)

Dialog for displaying and discovering all keyboard shortcuts.
"""

from typing import Dict, List, Optional

from PySide6.QtCore import Qt
from PySide6.QtGui import QKeySequence
from PySide6.QtWidgets import (
    QDialog,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QPushButton,
    QTableWidget,
    QTableWidgetItem,
    QVBoxLayout,
    QWidget,
)

from cuepoint.ui.widgets.shortcut_manager import ShortcutContext, ShortcutManager
from cuepoint.utils.i18n import tr


class ShortcutsDialog(QDialog):
    """Dialog for displaying keyboard shortcuts."""

    def __init__(self, shortcut_manager: Optional[ShortcutManager] = None, parent=None):
        """Initialize shortcuts dialog.

        Args:
            shortcut_manager: ShortcutManager instance (optional).
            parent: Parent widget.
        """
        super().__init__(parent)
        self.shortcut_manager = shortcut_manager
        self._setup_ui()
        self._load_shortcuts()

    def _setup_ui(self):
        """Set up UI components."""
        self.setWindowTitle(tr("shortcuts.title", "Keyboard Shortcuts"))
        self.setModal(True)
        self.resize(700, 600)

        layout = QVBoxLayout(self)
        layout.setSpacing(16)
        layout.setContentsMargins(20, 20, 20, 20)

        # Title
        title = QLabel(tr("shortcuts.title", "Keyboard Shortcuts"))
        title_font = title.font()
        title_font.setPointSize(18)
        title_font.setBold(True)
        title.setFont(title_font)
        layout.addWidget(title)

        # Search box
        search_layout = QHBoxLayout()
        search_label = QLabel(tr("shortcuts.search", "Search:"))
        search_layout.addWidget(search_label)

        self.search_input = QLineEdit()
        self.search_input.setPlaceholderText(tr("shortcuts.search_placeholder", "Search shortcuts..."))
        self.search_input.textChanged.connect(self._filter_shortcuts)
        search_layout.addWidget(self.search_input)
        layout.addLayout(search_layout)

        # Shortcuts table
        self.shortcuts_table = QTableWidget()
        self.shortcuts_table.setColumnCount(3)
        self.shortcuts_table.setHorizontalHeaderLabels(
            [
                tr("shortcuts.context", "Context"),
                tr("shortcuts.action", "Action"),
                tr("shortcuts.shortcut", "Shortcut"),
            ]
        )
        self.shortcuts_table.setColumnWidth(0, 150)
        self.shortcuts_table.setColumnWidth(1, 300)
        self.shortcuts_table.setColumnWidth(2, 150)
        self.shortcuts_table.setAlternatingRowColors(True)
        self.shortcuts_table.setSelectionBehavior(QTableWidget.SelectRows)
        self.shortcuts_table.setEditTriggers(QTableWidget.NoEditTriggers)
        layout.addWidget(self.shortcuts_table)

        # Close button
        button_layout = QHBoxLayout()
        button_layout.addStretch()

        close_button = QPushButton(tr("button.close", "Close"))
        close_button.setDefault(True)
        close_button.clicked.connect(self.accept)
        button_layout.addWidget(close_button)

        layout.addLayout(button_layout)

    def _load_shortcuts(self):
        """Load shortcuts from shortcut manager or defaults."""
        shortcuts_data: List[Dict] = []

        if self.shortcut_manager:
            # Get shortcuts from manager
            all_shortcuts = self.shortcut_manager.get_all_shortcuts()
            for shortcut_id, shortcut_tuple in all_shortcuts.items():
                # get_all_shortcuts returns (sequence, description, context)
                if isinstance(shortcut_tuple, tuple) and len(shortcut_tuple) >= 3:
                    sequence, description, context = shortcut_tuple[0], shortcut_tuple[1], shortcut_tuple[2]
                else:
                    # Fallback for different return format
                    context = ShortcutContext.GLOBAL
                    description = shortcut_id
                    sequence = shortcut_tuple[0] if isinstance(shortcut_tuple, tuple) and len(shortcut_tuple) > 0 else ""

                shortcuts_data.append(
                    {
                        "context": context,
                        "action": description,
                        "shortcut": sequence,
                    }
                )
        else:
            # Use default shortcuts
            default_shortcuts = ShortcutManager.DEFAULT_SHORTCUTS
            for context, shortcuts in default_shortcuts.items():
                for shortcut_id, (sequence, description) in shortcuts.items():
                    shortcuts_data.append(
                        {
                            "context": context,
                            "action": description,
                            "shortcut": sequence,
                        }
                    )

        # Sort by context, then action
        shortcuts_data.sort(key=lambda x: (x["context"], x["action"]))

        # Populate table
        self.all_shortcuts = shortcuts_data
        self._populate_table(shortcuts_data)

    def _populate_table(self, shortcuts_data: List[Dict]):
        """Populate table with shortcuts data.

        Args:
            shortcuts_data: List of shortcut dictionaries.
        """
        self.shortcuts_table.setRowCount(len(shortcuts_data))

        for row, shortcut in enumerate(shortcuts_data):
            # Context
            context_item = QTableWidgetItem(self._format_context(shortcut["context"]))
            self.shortcuts_table.setItem(row, 0, context_item)

            # Action
            action_item = QTableWidgetItem(shortcut["action"])
            self.shortcuts_table.setItem(row, 1, action_item)

            # Shortcut
            shortcut_item = QTableWidgetItem(shortcut["shortcut"])
            self.shortcuts_table.setItem(row, 2, shortcut_item)

    def _format_context(self, context: str) -> str:
        """Format context name for display.

        Args:
            context: Context identifier.

        Returns:
            Formatted context name.
        """
        context_names = {
            ShortcutContext.GLOBAL: tr("shortcuts.context.global", "Global"),
            ShortcutContext.MAIN_WINDOW: tr("shortcuts.context.main", "Main Window"),
            ShortcutContext.RESULTS_VIEW: tr("shortcuts.context.results", "Results View"),
            ShortcutContext.BATCH_PROCESSOR: tr("shortcuts.context.batch", "Batch Processor"),
            ShortcutContext.SETTINGS: tr("shortcuts.context.settings", "Settings"),
            ShortcutContext.HISTORY_VIEW: tr("shortcuts.context.history", "History View"),
            ShortcutContext.EXPORT_DIALOG: tr("shortcuts.context.export", "Export Dialog"),
            ShortcutContext.CANDIDATE_DIALOG: tr("shortcuts.context.candidate", "Candidate Dialog"),
        }
        return context_names.get(context, context.replace("_", " ").title())

    def _filter_shortcuts(self, search_text: str):
        """Filter shortcuts based on search text.

        Args:
            search_text: Text to search for.
        """
        if not search_text:
            self._populate_table(self.all_shortcuts)
            return

        search_lower = search_text.lower()
        filtered = [
            s
            for s in self.all_shortcuts
            if search_lower in s["action"].lower()
            or search_lower in s["shortcut"].lower()
            or search_lower in s["context"].lower()
        ]

        self._populate_table(filtered)
