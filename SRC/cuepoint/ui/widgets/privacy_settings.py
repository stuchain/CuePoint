#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Privacy settings widget (Step 8.4, Step 14).

This is intended for embedding in Settings UI so users can manage privacy
preferences in one place (in addition to Help → Privacy).
Step 14: Adds telemetry opt-in toggle.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Optional

from PySide6.QtCore import Signal
from PySide6.QtWidgets import QCheckBox, QGroupBox, QHBoxLayout, QPushButton, QVBoxLayout, QWidget

from cuepoint.services.privacy_service import PrivacyService

if TYPE_CHECKING:
    from cuepoint.ui.controllers.config_controller import ConfigController


class PrivacySettingsWidget(QWidget):
    open_privacy_dialog_requested = Signal()

    def __init__(
        self,
        parent: Optional[QWidget] = None,
        privacy_service: Optional[PrivacyService] = None,
        config_controller: Optional["ConfigController"] = None,
    ) -> None:
        super().__init__(parent)
        self._privacy = privacy_service or PrivacyService()
        self._config_controller = config_controller
        self._init_ui()
        self._load()

    def _init_ui(self) -> None:
        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(8)

        group = QGroupBox("Privacy")
        group_layout = QVBoxLayout(group)

        # Step 14: Telemetry opt-in (Design 14.14, 14.110)
        self.chk_telemetry = QCheckBox("Help improve CuePoint by sharing anonymous usage data")
        self.chk_telemetry.setToolTip(
            "When enabled, sends anonymized usage events (app start, run stats, error rates). "
            "No personal data, file paths, or playlist names are collected."
        )
        group_layout.addWidget(self.chk_telemetry)

        self.chk_clear_cache = QCheckBox("Clear cache on exit")
        self.chk_clear_logs = QCheckBox("Clear logs on exit")

        group_layout.addWidget(self.chk_clear_cache)
        group_layout.addWidget(self.chk_clear_logs)

        row = QHBoxLayout()
        row.addStretch()
        self.btn_manage = QPushButton("Manage data…")
        self.btn_manage.setToolTip("Open the Privacy dialog for data deletion controls and disclosures")
        row.addWidget(self.btn_manage)
        group_layout.addLayout(row)

        layout.addWidget(group)

        self.chk_telemetry.toggled.connect(self._on_telemetry_changed)
        self.chk_clear_cache.toggled.connect(self._on_changed)
        self.chk_clear_logs.toggled.connect(self._on_changed)
        self.btn_manage.clicked.connect(self.open_privacy_dialog_requested.emit)

    def _load(self) -> None:
        prefs = self._privacy.get_preferences()
        self.chk_clear_cache.setChecked(bool(prefs.clear_cache_on_exit))
        self.chk_clear_logs.setChecked(bool(prefs.clear_logs_on_exit))
        if self._config_controller:
            enabled = self._config_controller.get_config_value("telemetry.enabled", False)
            self.chk_telemetry.setChecked(bool(enabled))

    def _on_telemetry_changed(self, checked: bool) -> None:
        if self._config_controller:
            self._config_controller.set_config_value("telemetry.enabled", bool(checked))
            if not checked:
                try:
                    from cuepoint.utils.telemetry_helper import get_telemetry
                    telemetry = get_telemetry()
                    telemetry.delete_local_data()
                except Exception:
                    pass

    def _on_changed(self) -> None:
        self._privacy.set_clear_cache_on_exit(self.chk_clear_cache.isChecked())
        self._privacy.set_clear_logs_on_exit(self.chk_clear_logs.isChecked())







