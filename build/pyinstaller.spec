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
    # Include Rekordbox instruction images (if they exist)
    (str(project_root / 'SRC' / 'cuepoint' / 'ui' / 'resources'), 'resources'),
    # Include UI assets (icons, logos, etc.)
    (str(project_root / 'SRC' / 'cuepoint' / 'ui' / 'assets'), 'assets'),
    # Include update launcher scripts (for visible installation and reopen dialog)
    (str(project_root / 'SRC' / 'cuepoint' / 'update' / 'update_launcher.py'), 'update'),
    (str(project_root / 'SRC' / 'cuepoint' / 'update' / 'update_launcher.bat'), 'update'),
    (str(project_root / 'SRC' / 'cuepoint' / 'update' / 'update_launcher.ps1'), 'update'),
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

# Collect Python DLLs explicitly for Windows (Python 3.13)
# PyInstaller sometimes fails to auto-detect Python 3.13 DLLs
# We'll add it both in the initial binaries list AND post-analysis to ensure it's included
binaries = []
if is_windows:
    import sys
    python_dir = Path(sys.executable).parent
    dlls_dir = python_dir / 'DLLs'
    
    # Include python313.dll (or python3XX.dll for current version)
    python_dll_name = f'python{sys.version_info.major}{sys.version_info.minor}.dll'
    python_dll_path = python_dir / python_dll_name
    if python_dll_path.exists():
        # Format for Analysis constructor: (src_path, dest_dir)
        # This is a 2-tuple format used when passing to Analysis()
        # dest_dir '.' means it will be placed in the root of the bundle
        binaries.append((str(python_dll_path), '.'))
        print(f"[PyInstaller] Including Python DLL in binaries: {python_dll_name}")
        print(f"[PyInstaller]   Source: {python_dll_path}")
        print(f"[PyInstaller]   Destination: root ('.')")
    else:
        print(f"[PyInstaller] WARNING: Python DLL not found at {python_dll_path}")
    
    # Also include python3.dll if it exists
    python3_dll_path = python_dir / 'python3.dll'
    if python3_dll_path.exists():
        # Format for Analysis constructor: (src_path, dest_dir)
        binaries.append((str(python3_dll_path), '.'))
        print(f"[PyInstaller] Including Python3 DLL: python3.dll")

# Analysis phase
a = Analysis(
    [str(project_root / 'SRC' / 'gui_app.py')],  # Main entry point
    pathex=[str(project_root / 'SRC')],
    binaries=binaries,
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

# Ensure Python DLL is included (post-analysis fix for Python 3.13)
# PyInstaller sometimes doesn't auto-detect Python 3.13 DLL
# We need to add it after Analysis but ensure it's in the right format
if is_windows:
    import sys
    python_dll_name = f'python{sys.version_info.major}{sys.version_info.minor}.dll'
    python_dir = Path(sys.executable).parent
    
    # Check if Python DLL is already in binaries
    dll_found = False
    for binary in a.binaries:
        # Check both the name and if it contains python313.dll
        if python_dll_name.lower() in str(binary[0]).lower() or 'python313.dll' in str(binary[0]).lower():
            dll_found = True
            print(f"[PyInstaller] Python DLL already found in binaries: {binary[0]} -> {binary[1]}")
            break
    
    # If not found, add it explicitly
    if not dll_found:
        python_dll_path = python_dir / python_dll_name
        if python_dll_path.exists():
            # Add to binaries - format: (name_in_bundle, full_path, type)
            # For one-file mode, place in root ('.') so it extracts to _MEIPASS root
            # CRITICAL: The name must match exactly what PyInstaller expects
            # Use the exact DLL name (python313.dll) as the bundle name
            a.binaries.append((python_dll_name, str(python_dll_path), 'BINARY'))
            print(f"[PyInstaller] Added Python DLL to binaries: {python_dll_name}")
            print(f"[PyInstaller]   Source: {python_dll_path}")
            print(f"[PyInstaller]   Destination: root (extracts to _MEIPASS root)")
            print(f"[PyInstaller]   Bundle name: {python_dll_name}")
        else:
            print(f"[PyInstaller] ERROR: Python DLL not found at {python_dll_path}")
            # Try alternative locations
            for alt_dir in [python_dir / 'DLLs', python_dir]:
                alt_path = alt_dir / python_dll_name
                if alt_path.exists():
                    a.binaries.append((python_dll_name, str(alt_path), 'BINARY'))
                    print(f"[PyInstaller] Found Python DLL at alternative location: {alt_path}")
                    break

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
    
    # Ensure Python DLL is in binaries before creating EXE
    # Double-check it's there (post-analysis verification)
    if is_windows:
        import sys
        python_dll_name = f'python{sys.version_info.major}{sys.version_info.minor}.dll'
        dll_in_binaries = any(python_dll_name.lower() in str(b[0]).lower() for b in a.binaries)
        if not dll_in_binaries:
            print(f"[PyInstaller] WARNING: {python_dll_name} not found in binaries before EXE creation!")
            print(f"[PyInstaller] Binaries count: {len(a.binaries)}")
            print(f"[PyInstaller] First few binaries: {[b[0] for b in a.binaries[:5]]}")
        else:
            print(f"[PyInstaller] Verified: {python_dll_name} is in binaries list")
    
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
