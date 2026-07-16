"""Tests for Settings dialog scroll behavior (Rollout Phase A)."""

from PySide6.QtWidgets import QApplication

from cuepoint.ui.controllers.config_controller import ConfigController
from cuepoint.ui.dialogs.settings_dialog import SettingsDialog


def test_settings_dialog_resets_scroll_on_show(qtbot):
    app = QApplication.instance() or QApplication([])
    controller = ConfigController()
    dialog = SettingsDialog(config_controller=controller)
    qtbot.addWidget(dialog)

    bar = dialog._scroll_area.verticalScrollBar()
    bar.setValue(120)
    dialog.show()
    qtbot.waitExposed(dialog)

    assert bar.value() == 0
