#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Keyboard Shortcut Manager

Centralized system for managing keyboard shortcuts with context awareness
and customization support.
"""

from typing import Dict, Optional, Callable, List, Tuple
from PySide6.QtGui import QKeySequence, QShortcut
from PySide6.QtCore import Qt, QObject, Signal
from PySide6.QtWidgets import QWidget
import json
import os
import sys
from pathlib import Path


class ShortcutContext:
    """Context for keyboard shortcuts"""
    GLOBAL = "global"
    MAIN_WINDOW = "main_window"
    RESULTS_VIEW = "results_view"
    BATCH_PROCESSOR = "batch_processor"
    SETTINGS = "settings"
    HISTORY_VIEW = "history_view"
    EXPORT_DIALOG = "export_dialog"
    CANDIDATE_DIALOG = "candidate_dialog"


class ShortcutManager(QObject):
    """Manages keyboard shortcuts with context awareness and customization"""
    
    shortcut_conflict = Signal(str, str)  # Emitted when shortcuts conflict
    
    # Default shortcuts by context
    DEFAULT_SHORTCUTS = {
        ShortcutContext.GLOBAL: {
            "open_file": ("Ctrl+O", "Open XML file"),
            "export_results": ("Ctrl+E", "Export results"),
            "quit": ("Ctrl+Q", "Quit application"),
            "help": ("F1", "Show help"),
            "shortcuts": ("Ctrl+?", "Show keyboard shortcuts"),
            "fullscreen": ("F11", "Toggle fullscreen"),
            "cancel": ("Esc", "Cancel operation"),
        },
        ShortcutContext.MAIN_WINDOW: {
            "new_session": ("Ctrl+N", "New session"),
            "save_settings": ("Ctrl+S", "Save settings"),
            "start_processing": ("F5", "Start processing"),
            "restart_processing": ("Ctrl+R", "Restart processing"),
        },
        ShortcutContext.RESULTS_VIEW: {
            "focus_search": ("Ctrl+F", "Focus search box"),
            "clear_filters": ("Ctrl+Shift+F", "Clear all filters"),
            "focus_year_filter": ("Ctrl+Y", "Focus year filter"),
            "focus_bpm_filter": ("Ctrl+B", "Focus BPM filter"),
            "focus_key_filter": ("Ctrl+K", "Focus key filter"),
            "select_all": ("Ctrl+A", "Select all"),
            "copy": ("Ctrl+C", "Copy selected"),
            "view_candidates": ("Enter", "View candidates"),
        },
        ShortcutContext.BATCH_PROCESSOR: {
            "open_batch": ("Ctrl+B", "Open batch processor"),
            "pause": ("Ctrl+P", "Pause processing"),
            "resume": ("Ctrl+Shift+P", "Resume processing"),
            "cancel": ("Ctrl+Shift+C", "Cancel processing"),
        },
        ShortcutContext.SETTINGS: {
            "open_settings": ("Ctrl+,", "Open settings"),
            "save_settings": ("Ctrl+Shift+S", "Save settings"),
            "reset_defaults": ("Ctrl+Shift+R", "Reset to defaults"),
        },
        ShortcutContext.HISTORY_VIEW: {
            "toggle_history": ("Ctrl+H", "Toggle history view"),
            "clear_history": ("Ctrl+Shift+H", "Clear history"),
            "load_item": ("Enter", "Load history item"),
        },
        ShortcutContext.EXPORT_DIALOG: {
            "confirm": ("Enter", "Confirm export"),
            "cancel": ("Esc", "Cancel export"),
        },
        ShortcutContext.CANDIDATE_DIALOG: {
            "select": ("Enter", "Select candidate"),
            "select_and_close": ("Ctrl+Enter", "Select and close"),
            "cancel": ("Esc", "Close dialog"),
        },
    }
    
    def __init__(self, parent: Optional[QWidget] = None):
        super().__init__(parent)
        self.parent_widget = parent
        self.shortcuts: Dict[str, QShortcut] = {}
        self.shortcut_actions: Dict[str, Callable] = {}
        self.custom_shortcuts: Dict[str, str] = {}
        self.current_context = ShortcutContext.GLOBAL
        self.context_shortcuts: Dict[str, List[str]] = {}  # Track shortcuts by context
        self.config_path = Path.home() / ".cuepoint" / "shortcuts.json"
        self.load_custom_shortcuts()
    
    def register_shortcut(
        self,
        action_id: str,
        default_sequence: str,
        callback: Callable,
        context: str = ShortcutContext.GLOBAL,
        description: str = ""
    ):
        """
        Register a keyboard shortcut.
        
        Args:
            action_id: Unique identifier for the action
            default_sequence: Default key sequence (e.g., "Ctrl+O")
            callback: Function to call when shortcut is activated
            context: Context where shortcut is active
            description: Human-readable description
        """
        # Use custom shortcut if available, otherwise use default
        sequence = self.custom_shortcuts.get(action_id, default_sequence)
        
        # Adapt for platform (Cmd on macOS, Ctrl on others)
        sequence = self._adapt_for_platform(sequence)
        
        # Create shortcut
        shortcut = QShortcut(QKeySequence(sequence), self.parent_widget)
        # Use WindowShortcut for global shortcuts, WidgetShortcut for context-specific
        if context == ShortcutContext.GLOBAL:
            shortcut.setContext(Qt.WindowShortcut)  # Active anywhere in the window
        else:
            shortcut.setContext(Qt.WidgetShortcut)  # Only active when widget has focus
        
        # Store callback
        self.shortcut_actions[action_id] = callback
        shortcut.activated.connect(callback)
        
        # Store shortcut
        self.shortcuts[action_id] = shortcut
        
        # Track by context
        if context not in self.context_shortcuts:
            self.context_shortcuts[context] = []
        if action_id not in self.context_shortcuts[context]:
            self.context_shortcuts[context].append(action_id)
        
        # Check for conflicts
        self._check_conflicts(action_id, sequence)
    
    def _adapt_for_platform(self, sequence: str) -> str:
        """Adapt key sequence for platform (Cmd on macOS, Ctrl on others)"""
        if sys.platform == "darwin":  # macOS
            return sequence.replace("Ctrl+", "Meta+")
        return sequence
    
    def _check_conflicts(self, action_id: str, sequence: str):
        """Check for shortcut conflicts"""
        for other_id, other_shortcut in self.shortcuts.items():
            if other_id != action_id:
                if other_shortcut.key().toString() == sequence:
                    self.shortcut_conflict.emit(action_id, other_id)
    
    def set_context(self, context: str):
        """Set the current context for shortcuts"""
        self.current_context = context
        # Enable/disable shortcuts based on context
        for action_id, shortcut in self.shortcuts.items():
            # Find which context this shortcut belongs to
            shortcut_context = None
            for ctx, shortcuts in self.context_shortcuts.items():
                if action_id in shortcuts:
                    shortcut_context = ctx
                    break
            
            # Enable if global or matches current context
            if shortcut_context == ShortcutContext.GLOBAL or shortcut_context == context:
                shortcut.setEnabled(True)
            else:
                shortcut.setEnabled(False)
    
    def get_shortcut(self, action_id: str) -> Optional[QShortcut]:
        """Get shortcut by action ID"""
        return self.shortcuts.get(action_id)
    
    def get_shortcut_sequence(self, action_id: str) -> str:
        """Get key sequence for an action"""
        shortcut = self.shortcuts.get(action_id)
        if shortcut:
            return shortcut.key().toString()
        # Check defaults
        for context_shortcuts in self.DEFAULT_SHORTCUTS.values():
            if action_id in context_shortcuts:
                sequence = context_shortcuts[action_id][0]
                return self._adapt_for_platform(sequence)
        return ""
    
    def set_custom_shortcut(self, action_id: str, sequence: str) -> bool:
        """
        Set a custom shortcut for an action.
        
        Returns:
            True if successful, False if conflict
        """
        # Adapt for platform
        sequence = self._adapt_for_platform(sequence)
        
        # Check for conflicts
        for other_id, other_shortcut in self.shortcuts.items():
            if other_id != action_id:
                if other_shortcut.key().toString() == sequence:
                    return False  # Conflict
        
        # Update shortcut
        if action_id in self.shortcuts:
            self.shortcuts[action_id].setKey(QKeySequence(sequence))
            self.custom_shortcuts[action_id] = sequence
            self.save_custom_shortcuts()
            return True
        return False
    
    def reset_shortcut(self, action_id: str):
        """Reset shortcut to default"""
        if action_id in self.custom_shortcuts:
            del self.custom_shortcuts[action_id]
            # Restore default
            for context, shortcuts in self.DEFAULT_SHORTCUTS.items():
                if action_id in shortcuts:
                    default = shortcuts[action_id][0]
                    default = self._adapt_for_platform(default)
                    if action_id in self.shortcuts:
                        self.shortcuts[action_id].setKey(QKeySequence(default))
                    self.save_custom_shortcuts()
                    return
    
    def get_all_shortcuts(self) -> Dict[str, Tuple[str, str, str]]:
        """Get all shortcuts with descriptions and contexts"""
        all_shortcuts = {}
        for context, shortcuts in self.DEFAULT_SHORTCUTS.items():
            for action_id, (sequence, description) in shortcuts.items():
                # Use custom if available
                custom_sequence = self.custom_shortcuts.get(action_id)
                if custom_sequence:
                    sequence = custom_sequence
                # Adapt for platform
                sequence = self._adapt_for_platform(sequence)
                all_shortcuts[action_id] = (sequence, description, context)
        return all_shortcuts
    
    def get_shortcuts_for_context(self, context: str) -> Dict[str, Tuple[str, str]]:
        """Get shortcuts for a specific context"""
        shortcuts = {}
        context_shortcuts = self.DEFAULT_SHORTCUTS.get(context, {})
        for action_id, (sequence, description) in context_shortcuts.items():
            # Use custom if available
            custom_sequence = self.custom_shortcuts.get(action_id)
            if custom_sequence:
                sequence = custom_sequence
            # Adapt for platform
            sequence = self._adapt_for_platform(sequence)
            shortcuts[action_id] = (sequence, description)
        return shortcuts
    
    def load_custom_shortcuts(self):
        """Load custom shortcuts from file"""
        if self.config_path.exists():
            try:
                with open(self.config_path, 'r', encoding='utf-8') as f:
                    self.custom_shortcuts = json.load(f)
            except Exception as e:
                print(f"Error loading shortcuts: {e}")
    
    def save_custom_shortcuts(self):
        """Save custom shortcuts to file"""
        self.config_path.parent.mkdir(parents=True, exist_ok=True)
        try:
            with open(self.config_path, 'w', encoding='utf-8') as f:
                json.dump(self.custom_shortcuts, f, indent=2, ensure_ascii=False)
        except Exception as e:
            print(f"Error saving shortcuts: {e}")

