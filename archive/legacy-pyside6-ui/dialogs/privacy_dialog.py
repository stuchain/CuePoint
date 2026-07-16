#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Privacy dialog (Step 8.4).

Provides:
- Transparent disclosure of network requests & local storage
- User controls to clear cache/logs/config
- Preferences for clearing cache/logs on exit (stored locally via QSettings)
"""

from __future__ import annotations

from typing import Optional

from PySide6.QtCore import QSettings, QUrl
from PySide6.QtGui import QDesktopServices
from PySide6.QtWidgets import (
    QCheckBox,
    QDialog,
    QDialogButtonBox,
    QGroupBox,
    QHBoxLayout,
    QLabel,
    QMessageBox,
    QPushButton,
    QTextEdit,
    QVBoxLayout,
    QWidget,
)

from cuepoint.utils.paths import AppPaths
from cuepoint.utils.privacy import DataDeletionManager, PrivacyAuditor


class PrivacyDialog(QDialog):
    SETTINGS_ORG = "CuePoint"
    SETTINGS_APP = "CuePoint"
    KEY_CLEAR_CACHE_ON_EXIT = "privacy/clear_cache_on_exit"
    KEY_CLEAR_LOGS_ON_EXIT = "privacy/clear_logs_on_exit"

    def __init__(self, parent: Optional[QWidget] = None):
        super().__init__(parent)
        self.setWindowTitle("Privacy")
        self.setMinimumSize(650, 520)
        self._settings = QSettings(self.SETTINGS_ORG, self.SETTINGS_APP)
        self._init_ui()
        self._load_settings()

    def _init_ui(self) -> None:
        layout = QVBoxLayout(self)
        layout.setContentsMargins(12, 12, 12, 12)
        layout.setSpacing(12)

        title = QLabel("Privacy")
        title_font = title.font()
        title_font.setPointSize(16)
        title_font.setBold(True)
        title.setFont(title_font)
        layout.addWidget(title)

        # Info
        info_group = QGroupBox("What CuePoint does (v1.0)")
        info_layout = QVBoxLayout(info_group)
        info_text = QTextEdit()
        info_text.setReadOnly(True)
        info_text.setPlainText(self._build_privacy_text())
        info_layout.addWidget(info_text)
        layout.addWidget(info_group)

        # Optional: show full privacy notice (markdown rendered as plain text)
        notice_row = QHBoxLayout()
        notice_row.addStretch()
        btn_notice = QPushButton("View Privacy Notice…")
        btn_notice.clicked.connect(self._on_view_privacy_notice)
        notice_row.addWidget(btn_notice)
        layout.addLayout(notice_row)

        # Preferences
        prefs_group = QGroupBox("Privacy controls")
        prefs_layout = QVBoxLayout(prefs_group)
        self.clear_cache_on_exit = QCheckBox("Clear cache on exit")
        self.clear_logs_on_exit = QCheckBox("Clear logs on exit")
        prefs_layout.addWidget(self.clear_cache_on_exit)
        prefs_layout.addWidget(self.clear_logs_on_exit)
        layout.addWidget(prefs_group)

        # Data management buttons (Design 4.39: Clear Cache, Clear Logs, Open Data Folder)
        manage_group = QGroupBox("Data management")
        manage_layout = QHBoxLayout(manage_group)
        self.btn_clear_cache = QPushButton("Clear cache now")
        self.btn_clear_logs = QPushButton("Clear logs now")
        self.btn_clear_all = QPushButton("Clear all app data")
        self.btn_open_data_folder = QPushButton("Open Data Folder…")
        manage_layout.addWidget(self.btn_clear_cache)
        manage_layout.addWidget(self.btn_clear_logs)
        manage_layout.addWidget(self.btn_clear_all)
        manage_layout.addWidget(self.btn_open_data_folder)
        layout.addWidget(manage_group)

        self.btn_clear_cache.clicked.connect(self._on_clear_cache)
        self.btn_clear_logs.clicked.connect(self._on_clear_logs)
        self.btn_clear_all.clicked.connect(self._on_clear_all)
        self.btn_open_data_folder.clicked.connect(self._on_open_data_folder)

        # Dialog buttons
        button_box = QDialogButtonBox(
            QDialogButtonBox.Ok | QDialogButtonBox.Cancel, self
        )
        button_box.accepted.connect(self.accept)
        button_box.rejected.connect(self.reject)
        layout.addWidget(button_box)

    def _on_view_privacy_notice(self) -> None:
        """Open privacy notice in a simple viewer (Design 4.4, 4.118)."""
        from pathlib import Path

        try:
            # src/cuepoint/ui/dialogs/privacy_dialog.py -> project root is parents[4]
            repo_root = Path(__file__).resolve().parents[4]
            for candidate in ("PRIVACY_NOTICE.md", "docs/policy/privacy-notice.md"):
                notice_path = repo_root / candidate
                if notice_path.exists():
                    text = notice_path.read_text(encoding="utf-8", errors="replace")
                    break
            else:
                text = "Privacy notice could not be loaded. See docs/policy/privacy-notice.md in the project."
        except Exception:
            text = "Privacy notice could not be loaded."

        dlg = QDialog(self)
        dlg.setWindowTitle("Privacy Notice")
        dlg.setMinimumSize(700, 520)
        v = QVBoxLayout(dlg)
        view = QTextEdit()
        view.setReadOnly(True)
        view.setPlainText(text)
        v.addWidget(view)
        bb = QDialogButtonBox(QDialogButtonBox.Ok)
        bb.accepted.connect(dlg.accept)
        v.addWidget(bb)
        dlg.exec()

    def _build_privacy_text(self) -> str:
        points = PrivacyAuditor.audit_data_collection()
        lines = [
            "CuePoint respects your privacy.",
            "",
            "Data collection:",
            "- No telemetry or analytics in v1.0",
            "- No background data collection",
            "",
            "Network requests:",
            "- Beatport scraping/search: user-initiated",
            "- Update checking: user-initiated / optional (future integration)",
            "",
            "Local storage (what may exist on disk):",
        ]
        for p in points:
            lines.append(f"- {p.name}: {p.data_type} ({p.purpose})")
            lines.append(f"  Location: {p.storage_location}")
            lines.append(f"  Retention: {p.retention_period}")
        lines.append("")
        lines.append("You can clear cache/logs at any time from this dialog.")
        return "\n".join(lines)

    def _load_settings(self) -> None:
        self.clear_cache_on_exit.setChecked(
            bool(self._settings.value(self.KEY_CLEAR_CACHE_ON_EXIT, False, type=bool))
        )
        self.clear_logs_on_exit.setChecked(
            bool(self._settings.value(self.KEY_CLEAR_LOGS_ON_EXIT, False, type=bool))
        )

    def _save_settings(self) -> None:
        self._settings.setValue(
            self.KEY_CLEAR_CACHE_ON_EXIT, self.clear_cache_on_exit.isChecked()
        )
        self._settings.setValue(
            self.KEY_CLEAR_LOGS_ON_EXIT, self.clear_logs_on_exit.isChecked()
        )
        self._settings.sync()

    def accept(self) -> None:
        self._save_settings()
        super().accept()

    def _on_clear_cache(self) -> None:
        if (
            QMessageBox.question(
                self,
                "Clear cache",
                "Clear cache now?\n\nThis only affects cached data and can improve privacy at the cost of performance.",
                QMessageBox.Yes | QMessageBox.No,
                QMessageBox.No,
            )
            == QMessageBox.Yes
        ):
            DataDeletionManager.clear_cache()
            QMessageBox.information(self, "Cache cleared", "Cache was cleared.")

    def _on_clear_logs(self) -> None:
        if (
            QMessageBox.question(
                self,
                "Clear logs",
                "Clear logs now?\n\nLogs are used for debugging and support; clearing them may reduce diagnosability.",
                QMessageBox.Yes | QMessageBox.No,
                QMessageBox.No,
            )
            == QMessageBox.Yes
        ):
            DataDeletionManager.clear_logs()
            QMessageBox.information(self, "Logs cleared", "Logs were cleared.")

    def _on_open_data_folder(self) -> None:
        """Open app data folder in system file manager (Design 4.39)."""
        data_dir = AppPaths.config_dir()
        data_dir.mkdir(parents=True, exist_ok=True)
        path = str(data_dir.resolve())
        if not QDesktopServices.openUrl(QUrl.fromLocalFile(path)):
            QMessageBox.information(
                self,
                "Open Data Folder",
                f"The app data folder is:\n\n{path}\n\nOpen it manually in your file manager.",
            )

    def _on_clear_all(self) -> None:
        if (
            QMessageBox.warning(
                self,
                "Clear all app data",
                "This will clear cache, logs, and configuration.\n\n"
                "Your exports will not be deleted.\n\nContinue?",
                QMessageBox.Yes | QMessageBox.No,
                QMessageBox.No,
            )
            == QMessageBox.Yes
        ):
            DataDeletionManager.clear_all()
            QMessageBox.information(self, "Data cleared", "All app data was cleared.")
