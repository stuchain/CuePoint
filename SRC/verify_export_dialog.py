#!/usr/bin/env python3
"""Verify ExportDialog signature"""
import sys
import inspect
sys.path.insert(0, '.')

from cuepoint.ui.dialogs.export_dialog import ExportDialog

sig = inspect.signature(ExportDialog.__init__)
params = list(sig.parameters.keys())
print("ExportDialog.__init__ parameters:", params)

# Try to instantiate
try:
    dialog = ExportDialog(export_controller=None)
    print("✅ ExportDialog can be instantiated with export_controller=None")
except TypeError as e:
    print(f"❌ Error: {e}")

