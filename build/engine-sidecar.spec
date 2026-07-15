# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller spec for CuePoint HTTP engine sidecar (Electron desktop)."""

import sys
from pathlib import Path

from PyInstaller.utils.hooks import collect_data_files, collect_submodules

project_root = Path(SPECPATH).resolve().parent
src_root = project_root / "src"
sys.path.insert(0, str(src_root))

is_windows = sys.platform == "win32"
exe_name = "cuepoint-engine.exe" if is_windows else "cuepoint-engine"

datas = []
logging_yaml = project_root / "config" / "logging.yaml"
if logging_yaml.exists():
    datas.append((str(logging_yaml), "config"))

try:
    datas.extend(collect_data_files("fake_useragent"))
except Exception:
    pass

hiddenimports = (
    collect_submodules("cuepoint.engine")
    + collect_submodules("cuepoint.services")
    + [
        "cuepoint.models.result",
        "cuepoint.models.run_summary",
        "cuepoint.utils.support_bundle",
        "cuepoint.utils.diagnostics",
        "cuepoint.utils.paths",
        "cuepoint.utils.logger",
        "cuepoint.utils.run_context",
        "cuepoint.utils.privacy",
        "cuepoint.ui.gui_interface",
        "cuepoint.ui.controllers.export_controller",
    ]
)

block_cipher = None

a = Analysis(
    [str(src_root / "cuepoint" / "engine" / "__main__.py")],
    pathex=[str(src_root)],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        "PySide6",
        "PyQt6",
        "PyQt5",
        "matplotlib",
        "tkinter",
        "cuepoint.ui.main_window",
        "cuepoint.ui.widgets",
        "cuepoint.ui.dialogs",
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name=exe_name.replace(".exe", ""),
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
