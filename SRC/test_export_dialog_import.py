#!/usr/bin/env python3
"""Test which ExportDialog is being imported"""
import sys
import inspect
sys.path.insert(0, '.')

try:
    from cuepoint.ui.dialogs.export_dialog import ExportDialog
    file_path = inspect.getfile(ExportDialog)
    print(f"ExportDialog imported from: {file_path}")
    sig = inspect.signature(ExportDialog.__init__)
    params = list(sig.parameters.keys())
    print(f"Parameters: {params}")
    
    if 'export_controller' in params:
        print("✅ export_controller parameter found!")
    else:
        print("❌ export_controller parameter NOT found!")
        
except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()

