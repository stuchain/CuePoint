# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller specification file for CuePoint
Supports both macOS and Windows builds
"""

import sys
import os
from pathlib import Path
from PyInstaller.utils.hooks import collect_submodules, collect_data_files

# Get project root
# When PyInstaller runs, it changes to the directory containing the spec file
# The spec file is in build/, so project root is parent of current working directory
# But we need to handle both cases: running from project root or from build/
if Path('SRC').exists():
    project_root = Path.cwd()
else:
    project_root = Path.cwd().parent
sys.path.insert(0, str(project_root / 'SRC'))

# Import version
try:
    from cuepoint.version import __version__, __build_number__
except ImportError:
    # Fallback if version module not available
    __version__ = "1.0.0"
    __build_number__ = "1"

# Platform detection
is_macos = sys.platform == 'darwin'
is_windows = sys.platform == 'win32'

# Application name
app_name = 'CuePoint'

# Data files to include (relative to project root)
datas = [
    (str(project_root / 'config' / 'logging.yaml'), 'config'),
    # Step 8.5: generated at build time (if present)
    (str(project_root / 'THIRD_PARTY_LICENSES.txt'), 'licenses'),
    # Step 8.5: privacy notice (if present)
    (str(project_root / 'PRIVACY_NOTICE.md'), 'docs'),
    # Include duckduckgo_search compatibility shim module
    (str(project_root / 'SRC' / 'duckduckgo_search.py'), 'SRC'),
    # Include test script for diagnostic purposes
    (str(project_root / 'scripts' / 'test_search_dependencies.py'), 'scripts'),
]

# Collect data files from fake_useragent (browsers.json, etc.)
# This is required for ddgs to work properly
try:
    fake_useragent_datas = collect_data_files('fake_useragent')
    datas.extend(fake_useragent_datas)
except Exception:
    # If fake_useragent is not installed, skip (will fail at runtime if needed)
    pass

# Note: Playwright browser binaries are NOT included in the bundle because:
# 1. They are very large (100+ MB)
# 2. They are platform-specific
# 3. The app has fallback search methods (DuckDuckGo, direct search)
# If Playwright is not available, the app will automatically fall back to other methods

# Only include data files that exist (prevents build failures when optional artifacts aren't generated)
datas = [(src, dst) for src, dst in datas if Path(src).exists()]

# Hidden imports (modules PyInstaller can't auto-detect)
hiddenimports = [
    'PySide6.QtCore',
    'PySide6.QtGui',
    'PySide6.QtWidgets',
    'PySide6.QtNetwork',
    'requests',
    'requests_cache',
    'bs4',
    'rapidfuzz',
    'rapidfuzz.fuzz',
    'rapidfuzz.process',
    'dateutil',
    'dateutil.parser',
    'yaml',
    'openpyxl',
    'playwright',
    'selenium',
    'aiohttp',
    # DuckDuckGo search - ddgs package and all submodules
    # Note: collect_submodules('ddgs') causes crashes, so we explicitly list all modules
    'ddgs',
    'ddgs.ddgs',
    'ddgs.engines',
    # Explicitly include all engine modules (they're dynamically discovered)
    'ddgs.engines.duckduckgo',
    'ddgs.engines.duckduckgo_images',
    'ddgs.engines.duckduckgo_news',
    'ddgs.engines.duckduckgo_videos',
    'ddgs.engines.bing',
    'ddgs.engines.bing_news',
    'ddgs.engines.google',
    'ddgs.engines.brave',
    'ddgs.engines.yahoo',
    'ddgs.engines.yahoo_news',
    'ddgs.engines.yandex',
    'ddgs.engines.mojeek',
    'ddgs.engines.wikipedia',
    'ddgs.engines.annasarchive',
    'ddgs.engines.mullvad_leta',
    'ddgs.api',
    # Compatibility shim (must be included as a data file, not just hidden import)
    'duckduckgo_search',
    # SSL certificates for HTTPS requests (required for ddgs and requests)
    'certifi',
    'certifi.core',
    # urllib3 (used by requests and ddgs)
    'urllib3',
    'urllib3.util',
    'urllib3.util.ssl_',
    'urllib3.poolmanager',
    # CuePoint data modules (PyInstaller may not auto-detect these)
    'cuepoint.data',
    'cuepoint.data.beatport',
    'cuepoint.data.beatport_search',
    'cuepoint.data.rekordbox',
    # Collect all cuepoint submodules to ensure nothing is missed
    *collect_submodules('cuepoint'),
    # fake_useragent (used by ddgs for user agent strings)
    'fake_useragent',
    'fake_useragent.data',
    'tqdm',
]

# Binaries to exclude (reduce size)
excludes = [
    'matplotlib',
    'numpy',
    'pandas',
    'scipy',
    'PIL',
    'tkinter',
    'pytest',
    'pytest_qt',
    'pytest_cov',
    'pytest_mock',
    'pytest_asyncio',
    'pytest_timeout',
    'pytest_xdist',
]

# Analysis phase
a = Analysis(
    [str(project_root / 'SRC' / 'gui_app.py')],  # Main entry point
    pathex=[str(project_root / 'SRC')],
    binaries=[],
    datas=[(str(project_root / src), dst) for src, dst in datas] if datas else [],
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=excludes,
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=None,
    noarchive=False,
)

# Remove duplicates
pyz = PYZ(a.pure, a.zipped_data, cipher=None)

# Executable configuration
if is_macos:
    # macOS app bundle
    icon_path = project_root / 'build' / 'icon.icns'
    icon_file = str(icon_path) if icon_path.exists() else None
    exe = EXE(
        pyz,
        a.scripts,
        a.binaries,
        a.zipfiles,
        a.datas,
        [],
        name=app_name,
        debug=False,
        bootloader_ignore_signals=False,
        strip=False,
        upx=False,  # Disabled: UPX causes extraction errors with PySide6 DLLs
        upx_exclude=[],
        runtime_tmpdir=None,
        console=False,  # No console window
        icon=icon_file,
    )
    
    # macOS app bundle
    app = BUNDLE(
        exe,
        name=f'{app_name}.app',
        icon=icon_file,
        bundle_identifier='com.stuchain.cuepoint',
        info_plist={
            'CFBundleName': app_name,
            'CFBundleDisplayName': app_name,
            'CFBundleVersion': __build_number__ or '1',
            'CFBundleShortVersionString': __version__,
            'CFBundlePackageType': 'APPL',
            'CFBundleExecutable': app_name,
            'CFBundleIdentifier': 'com.stuchain.cuepoint',
            'LSMinimumSystemVersion': '10.15',
            'NSHighResolutionCapable': True,
            'NSHumanReadableCopyright': 'Copyright © 2024 StuChain. All rights reserved.',
        },
    )
else:
    # Windows executable
    version_file_path = project_root / 'build' / 'version_info.txt'
    version_file = str(version_file_path) if version_file_path.exists() else None
    icon_path = project_root / 'build' / 'icon.ico'
    icon_file = str(icon_path) if icon_path.exists() else None
    exe = EXE(
        pyz,
        a.scripts,
        a.binaries,
        a.zipfiles,
        a.datas,
        [],
        name=f'{app_name}.exe',
        debug=False,
        bootloader_ignore_signals=False,
        strip=False,
        upx=False,  # Disabled: UPX causes extraction errors with PySide6 DLLs (return code -3)
        upx_exclude=[],
        runtime_tmpdir=None,
        console=False,  # No console window
        icon=icon_file,
        version=version_file,
    )
