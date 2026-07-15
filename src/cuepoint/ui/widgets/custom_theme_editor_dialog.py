"""Dialog for creating or editing a custom theme (8-color editor)."""

from __future__ import annotations

from typing import Optional

from PySide6.QtCore import Qt
from PySide6.QtGui import QColor
from PySide6.QtWidgets import (
    QDialog,
    QDialogButtonBox,
    QFormLayout,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QPushButton,
    QVBoxLayout,
    QWidget,
)

from cuepoint.ui.appearance.theme_derivation import CustomThemeColors

COLOR_FIELDS: list[tuple[str, str]] = [
    ("bg_app", "App background"),
    ("bg_panel", "Panel background"),
    ("bg_input", "Input background"),
    ("fg_primary", "Primary text"),
    ("fg_muted", "Muted text"),
    ("accent_primary", "Accent"),
    ("accent_success", "Success"),
    ("accent_warning", "Warning"),
    ("accent_danger", "Danger"),
]


class _ColorField(QWidget):
    def __init__(self, label: str, initial: str, parent=None) -> None:
        super().__init__(parent)
        layout = QHBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.addWidget(QLabel(label))
        self._hex_edit = QLineEdit(initial)
        self._hex_edit.setMaximumWidth(100)
        self._pick_btn = QPushButton("Pick…")
        self._pick_btn.clicked.connect(self._pick_color)
        layout.addWidget(self._hex_edit)
        layout.addWidget(self._pick_btn)
        layout.addStretch()

    def _pick_color(self) -> None:
        from PySide6.QtWidgets import QColorDialog

        current = QColor(self._hex_edit.text().strip() or "#ffffff")
        chosen = QColorDialog.getColor(current, self, "Choose color")
        if chosen.isValid():
            self._hex_edit.setText(chosen.name())

    def value(self) -> str:
        return self._hex_edit.text().strip()


class CustomThemeEditorDialog(QDialog):
    """Eight-color custom theme editor with live preview callback."""

    def __init__(
        self,
        *,
        name: str = "",
        colors: Optional[CustomThemeColors] = None,
        on_preview=None,
        parent=None,
    ) -> None:
        super().__init__(parent)
        self._on_preview = on_preview
        self.setWindowTitle("Custom theme")
        self.setMinimumWidth(420)

        seed = colors or CustomThemeColors(
            bg_app="#18181b",
            bg_panel="#27272a",
            bg_input="#18181b",
            fg_primary="#fafafa",
            fg_muted="#a1a1aa",
            accent_primary="#8b5cf6",
            accent_success="#22c55e",
            accent_warning="#eab308",
            accent_danger="#ef4444",
        )

        layout = QVBoxLayout(self)
        form = QFormLayout()
        self._name_edit = QLineEdit(name)
        form.addRow("Theme name", self._name_edit)
        layout.addLayout(form)

        self._fields: dict[str, _ColorField] = {}
        for key, label in COLOR_FIELDS:
            field = _ColorField(label, getattr(seed, key), self)
            field._hex_edit.textChanged.connect(self._emit_preview)
            self._fields[key] = field
            layout.addWidget(field)

        hint = QLabel(
            "Borders and bevels are derived automatically from these colors."
        )
        hint.setWordWrap(True)
        hint.setStyleSheet("color: #888888;")
        layout.addWidget(hint)

        buttons = QDialogButtonBox(QDialogButtonBox.Save | QDialogButtonBox.Cancel)
        buttons.accepted.connect(self.accept)
        buttons.rejected.connect(self.reject)
        layout.addWidget(buttons)

    def _emit_preview(self, *_args) -> None:
        if self._on_preview is not None:
            try:
                self._on_preview(self.get_colors())
            except ValueError:
                pass

    def get_name(self) -> str:
        return self._name_edit.text().strip() or "My theme"

    def get_colors(self) -> CustomThemeColors:
        values = {key: field.value() for key, field in self._fields.items()}
        return CustomThemeColors(**values)
