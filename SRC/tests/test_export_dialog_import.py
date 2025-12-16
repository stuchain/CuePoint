#!/usr/bin/env python3
"""Integration test: ExportDialog import shape."""

from __future__ import annotations

import inspect


def test_export_dialog_import_has_controller_param() -> None:
    from cuepoint.ui.dialogs.export_dialog import ExportDialog

    sig = inspect.signature(ExportDialog.__init__)
    params = list(sig.parameters.keys())
    assert "export_controller" in params

