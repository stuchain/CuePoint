"""Appearance settings widget — theme, scale, custom themes (Rollout Phase D)."""

from __future__ import annotations

from typing import Optional, Tuple

from PySide6.QtCore import Signal
from PySide6.QtWidgets import (
    QComboBox,
    QFormLayout,
    QGroupBox,
    QHBoxLayout,
    QLabel,
    QListWidget,
    QListWidgetItem,
    QPushButton,
    QVBoxLayout,
    QWidget,
)

from cuepoint.ui.appearance.appearance_manager import apply_appearance, theme_option_labels
from cuepoint.ui.appearance.appearance_store import (
    CUSTOM_THEME_PREFIX,
    AppearanceStore,
    CustomThemeRecord,
    DEFAULT_UI_SCALE,
    SCALE_OPTIONS,
    custom_theme_storage_id,
    is_custom_theme_id,
)
from cuepoint.ui.appearance.theme_derivation import CustomThemeColors, derive_theme_tokens
from cuepoint.ui.widgets.custom_theme_editor_dialog import CustomThemeEditorDialog
from cuepoint.ui.widgets.styles import apply_theme_tokens


class AppearanceSettingsWidget(QWidget):
    """Theme and UI scale controls for Settings → Appearance."""

    appearance_changed = Signal()

    def __init__(self, parent: Optional[QWidget] = None) -> None:
        super().__init__(parent)
        self._store = AppearanceStore()
        self._preview_theme_id: Optional[str] = None
        self._init_ui()
        self.reload_from_store()

    def _init_ui(self) -> None:
        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(8)

        group = QGroupBox("Appearance")
        group_layout = QVBoxLayout(group)

        form = QFormLayout()
        self._theme_combo = QComboBox()
        self._theme_combo.currentIndexChanged.connect(self._on_theme_changed)
        form.addRow("Active theme", self._theme_combo)

        self._scale_combo = QComboBox()
        for scale in SCALE_OPTIONS:
            label = {1: "1× (compact)", 2: "2× (default)", 3: "3× (large)"}[scale]
            self._scale_combo.addItem(label, scale)
        self._scale_combo.currentIndexChanged.connect(self._on_scale_changed)
        form.addRow("UI scale", self._scale_combo)
        group_layout.addLayout(form)

        actions = QHBoxLayout()
        self._create_btn = QPushButton("Create custom theme…")
        self._create_btn.clicked.connect(self._create_custom_theme)
        actions.addWidget(self._create_btn)
        actions.addStretch()
        group_layout.addLayout(actions)

        self._custom_list = QListWidget()
        self._custom_list.setMaximumHeight(140)
        group_layout.addWidget(self._custom_list)

        row_actions = QHBoxLayout()
        self._apply_custom_btn = QPushButton("Apply")
        self._edit_custom_btn = QPushButton("Edit")
        self._delete_custom_btn = QPushButton("Delete")
        self._apply_custom_btn.clicked.connect(self._apply_selected_custom)
        self._edit_custom_btn.clicked.connect(self._edit_selected_custom)
        self._delete_custom_btn.clicked.connect(self._delete_selected_custom)
        row_actions.addWidget(self._apply_custom_btn)
        row_actions.addWidget(self._edit_custom_btn)
        row_actions.addWidget(self._delete_custom_btn)
        row_actions.addStretch()
        group_layout.addLayout(row_actions)

        self._hint = QLabel(
            "No custom themes yet. Create one with eight colors — borders and bevels "
            "are derived automatically."
        )
        self._hint.setWordWrap(True)
        self._hint.setStyleSheet("color: #888888;")
        group_layout.addWidget(self._hint)

        layout.addWidget(group)

    def reload_from_store(self) -> None:
        """Refresh controls from QSettings without applying."""
        self._populate_theme_combo()
        theme_id = self._store.load_theme_id()
        index = self._theme_combo.findData(theme_id)
        self._theme_combo.blockSignals(True)
        self._theme_combo.setCurrentIndex(index if index >= 0 else 0)
        self._theme_combo.blockSignals(False)

        scale = self._store.load_ui_scale()
        scale_index = self._scale_combo.findData(scale)
        self._scale_combo.blockSignals(True)
        self._scale_combo.setCurrentIndex(
            scale_index if scale_index >= 0 else self._scale_combo.findData(DEFAULT_UI_SCALE)
        )
        self._scale_combo.blockSignals(False)
        self._refresh_custom_list()

    def _populate_theme_combo(self) -> None:
        current = self._theme_combo.currentData()
        self._theme_combo.blockSignals(True)
        self._theme_combo.clear()
        for theme_id, label in theme_option_labels():
            self._theme_combo.addItem(label, theme_id)
        if current is not None:
            idx = self._theme_combo.findData(current)
            if idx >= 0:
                self._theme_combo.setCurrentIndex(idx)
        self._theme_combo.blockSignals(False)

    def _refresh_custom_list(self) -> None:
        self._custom_list.clear()
        themes = self._store.load_custom_themes()
        for theme in themes:
            item = QListWidgetItem(theme.name)
            item.setData(256, theme.id)
            self._custom_list.addItem(item)
        has_custom = bool(themes)
        self._custom_list.setVisible(has_custom)
        self._apply_custom_btn.setVisible(has_custom)
        self._edit_custom_btn.setVisible(has_custom)
        self._delete_custom_btn.setVisible(has_custom)
        self._hint.setVisible(not has_custom)

    def get_snapshot(self) -> Tuple[str, int]:
        """Comparable snapshot for Settings Apply button state."""
        return (self.get_theme_id(), self.get_ui_scale())

    def get_theme_id(self) -> str:
        value = self._theme_combo.currentData()
        return str(value) if value is not None else self._store.load_theme_id()

    def get_ui_scale(self) -> int:
        value = self._scale_combo.currentData()
        return int(value) if value is not None else self._store.load_ui_scale()

    def persist(self) -> None:
        """Save current selection to QSettings."""
        self._store.save_theme_id(self.get_theme_id())
        self._store.save_ui_scale(self.get_ui_scale())

    def preview_current(self) -> None:
        """Apply current widget values to the running app (live preview)."""
        from PySide6.QtWidgets import QApplication

        app = QApplication.instance()
        if app is None:
            return
        apply_appearance(
            app,
            theme_id=self.get_theme_id(),
            scale=self.get_ui_scale(),
            store=self._store,
        )

    def _on_theme_changed(self, _index: int) -> None:
        if is_custom_theme_id(self.get_theme_id()):
            self._select_custom_in_list(self.get_theme_id())
        self._emit_preview()

    def _on_scale_changed(self, _index: int) -> None:
        self._emit_preview()

    def _emit_preview(self) -> None:
        self.preview_current()
        self.appearance_changed.emit()

    def _select_custom_in_list(self, theme_id: str) -> None:
        bare = custom_theme_storage_id(theme_id)
        for row in range(self._custom_list.count()):
            item = self._custom_list.item(row)
            if item is not None and item.data(256) == bare:
                self._custom_list.setCurrentItem(item)
                break

    def _preview_custom_colors(self, colors: CustomThemeColors) -> None:
        tokens = derive_theme_tokens(colors)
        apply_theme_tokens(tokens)
        self._emit_preview()

    def _create_custom_theme(self) -> None:
        dialog = CustomThemeEditorDialog(
            on_preview=self._preview_custom_colors,
            parent=self,
        )
        if dialog.exec() != dialog.DialogCode.Accepted:
            self._emit_preview()
            return
        record = CustomThemeRecord(
            id=self._store.new_custom_theme_id(),
            name=dialog.get_name(),
            colors=dialog.get_colors(),
        )
        self._store.upsert_custom_theme(record)
        self._populate_theme_combo()
        theme_id = f"{CUSTOM_THEME_PREFIX}{record.id}"
        idx = self._theme_combo.findData(theme_id)
        if idx >= 0:
            self._theme_combo.setCurrentIndex(idx)
        self._refresh_custom_list()
        self._emit_preview()

    def _selected_custom_record(self) -> Optional[CustomThemeRecord]:
        item = self._custom_list.currentItem()
        if item is None:
            return None
        theme_id = item.data(256)
        if not theme_id:
            return None
        return self._store.get_custom_theme(str(theme_id))

    def _apply_selected_custom(self) -> None:
        record = self._selected_custom_record()
        if record is None:
            return
        theme_id = f"{CUSTOM_THEME_PREFIX}{record.id}"
        idx = self._theme_combo.findData(theme_id)
        if idx >= 0:
            self._theme_combo.setCurrentIndex(idx)

    def _edit_selected_custom(self) -> None:
        record = self._selected_custom_record()
        if record is None:
            return
        dialog = CustomThemeEditorDialog(
            name=record.name,
            colors=record.colors,
            on_preview=self._preview_custom_colors,
            parent=self,
        )
        if dialog.exec() != dialog.DialogCode.Accepted:
            self._emit_preview()
            return
        updated = CustomThemeRecord(
            id=record.id,
            name=dialog.get_name(),
            colors=dialog.get_colors(),
        )
        self._store.upsert_custom_theme(updated)
        self._populate_theme_combo()
        self._refresh_custom_list()
        self._emit_preview()

    def _delete_selected_custom(self) -> None:
        record = self._selected_custom_record()
        if record is None:
            return
        active = self.get_theme_id()
        self._store.delete_custom_theme(record.id)
        self._populate_theme_combo()
        self._refresh_custom_list()
        if active == f"{CUSTOM_THEME_PREFIX}{record.id}":
            self._theme_combo.setCurrentIndex(0)
        self._emit_preview()
