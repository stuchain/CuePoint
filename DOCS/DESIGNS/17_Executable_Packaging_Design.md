# Design: Executable Packaging and Distribution

**Number**: 17  
**Status**: 📝 Planned  
**Priority**: 🔥 P0 - Critical for GUI Distribution  
**Effort**: 1 week  
**Impact**: Very High - Enables standalone application distribution

---

## 1. Overview

### 1.1 Problem Statement

Users need to install Python and dependencies to run the application, which creates a barrier to entry for non-technical users. A standalone executable eliminates this requirement.

### 1.2 Solution Overview

Package the GUI application as standalone executables:
1. **Windows**: `.exe` file with installer
2. **macOS**: `.app` bundle in DMG
3. **Linux**: `.AppImage` or package manager formats
4. No Python installation required
5. All dependencies bundled

---

## 2. Packaging Tools

### 2.1 PyInstaller (Recommended)

**Pros:**
- Cross-platform (Windows, macOS, Linux)
- Well-documented and maintained
- Supports PySide6/Qt applications (PySide6 is the free LGPL version)
- Single-file or directory mode
- Code signing support

**Cons:**
- Large executable size (~100-200MB)
- Slower startup time (extraction phase)
- Antivirus false positives possible

**Usage:**
```bash
pip install pyinstaller
pyinstaller --name=CuePoint --windowed --onefile gui_app.py
```

**Note:** The GUI application uses PySide6 (free LGPL license), not PyQt6 which requires commercial licensing.

### 2.2 cx_Freeze (Alternative)

**Pros:**
- Cross-platform
- Faster startup than PyInstaller
- More control over bundling

**Cons:**
- More complex configuration
- Less community support
- Requires more setup

**Verdict**: ⚠️ Good alternative, but PyInstaller is more straightforward

### 2.3 Nuitka (Alternative)

**Pros:**
- Compiles to native code (C++)
- Faster execution
- Smaller size potential

**Cons:**
- Longer compilation time
- More complex setup
- Less mature for Qt apps

**Verdict**: ⚠️ Promising but may have compatibility issues

---

## 3. PyInstaller Configuration

### 3.1 Spec File

**Location**: `build/CuePoint.spec`

```python
# -*- mode: python ; coding: utf-8 -*-

block_cipher = None

a = Analysis(
    ['SRC/gui_app.py'],
    pathex=[],
    binaries=[],
    datas=[
        ('config.yaml.template', '.'),
        ('DOCS/LICENSE', '.'),
    ],
    hiddenimports=[
        'PySide6.QtCore',      # Qt Core functionality
        'PySide6.QtGui',       # Qt GUI components
        'PySide6.QtWidgets',  # Qt Widgets (free LGPL license)
        'requests',
        'beautifulsoup4',
        'rapidfuzz',
        'tqdm',
        'ddgs',
        'yaml',
        'playwright',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
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
    name='CuePoint',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,  # No console window for GUI
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon='assets/icon.ico',  # Windows icon
)

app = BUNDLE(
    exe,
    name='CuePoint.app',
    icon='assets/icon.icns',  # macOS icon
    bundle_identifier='com.cuepoint.app',
    info_plist={
        'NSPrincipalClass': 'NSApplication',
        'NSHighResolutionCapable': 'True',
        'NSRequiresAquaSystemAppearance': 'False',
    },
)
```

### 3.2 Build Script

**Location**: `build/build_executable.py`

```python
#!/usr/bin/env python3
"""
Build script for creating executables
"""

import os
import sys
import subprocess
import platform
import shutil

def build_executable():
    """Build executable for current platform"""
    system = platform.system()
    
    print(f"Building for {system}...")
    
    # Ensure we're in project root
    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    os.chdir(project_root)
    
    # Build command
    if system == "Windows":
        cmd = [
            "pyinstaller",
            "--name=CuePoint",
            "--windowed",
            "--onefile",
            "--icon=assets/icon.ico",
            "--add-data=config.yaml.template;.",
            "--hidden-import=PySide6.QtCore",
            "--hidden-import=PySide6.QtGui",
            "--hidden-import=PySide6.QtWidgets",
            "SRC/gui_app.py"
        ]
    elif system == "Darwin":  # macOS
        cmd = [
            "pyinstaller",
            "--name=CuePoint",
            "--windowed",
            "--onefile",
            "--icon=assets/icon.icns",
            "--add-data=config.yaml.template:.",
            "--hidden-import=PySide6.QtCore",
            "--hidden-import=PySide6.QtGui",
            "--hidden-import=PySide6.QtWidgets",
            "SRC/gui_app.py"
        ]
    else:  # Linux
        cmd = [
            "pyinstaller",
            "--name=CuePoint",
            "--onefile",
            "--icon=assets/icon.png",
            "--add-data=config.yaml.template:.",
            "--hidden-import=PySide6.QtCore",
            "--hidden-import=PySide6.QtGui",
            "--hidden-import=PySide6.QtWidgets",
            "SRC/gui_app.py"
        ]
    
    # Run PyInstaller
    result = subprocess.run(cmd, check=True)
    
    print("Build complete!")
    print(f"Executable location: dist/CuePoint{'.exe' if system == 'Windows' else ''}")
    
    return result.returncode == 0


if __name__ == "__main__":
    success = build_executable()
    sys.exit(0 if success else 1)
```

---

## 4. Windows Distribution

### 4.1 NSIS Installer

**Location**: `build/installer.nsi`

```nsis
; CuePoint Windows Installer Script
!include "MUI2.nsh"

; Installer Information
Name "CuePoint"
OutFile "CuePoint-Setup.exe"
InstallDir "$PROGRAMFILES\CuePoint"
RequestExecutionLevel admin

; Interface Settings
!define MUI_ABORTWARNING
!define MUI_ICON "assets\icon.ico"
!define MUI_UNICON "assets\icon.ico"

; Pages
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_WELCOME
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_UNPAGE_FINISH

!insertmacro MUI_LANGUAGE "English"

; Installer Sections
Section "MainSection" SEC01
    SetOutPath "$INSTDIR"
    File "dist\CuePoint.exe"
    
    ; Create Start Menu shortcut
    CreateDirectory "$SMPROGRAMS\CuePoint"
    CreateShortcut "$SMPROGRAMS\CuePoint\CuePoint.lnk" "$INSTDIR\CuePoint.exe"
    CreateShortcut "$SMPROGRAMS\CuePoint\Uninstall.lnk" "$INSTDIR\Uninstall.exe"
    
    ; Create Desktop shortcut
    CreateShortcut "$DESKTOP\CuePoint.lnk" "$INSTDIR\CuePoint.exe"
    
    ; Register uninstaller
    WriteUninstaller "$INSTDIR\Uninstall.exe"
    WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\CuePoint" "DisplayName" "CuePoint"
    WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\CuePoint" "UninstallString" "$INSTDIR\Uninstall.exe"
SectionEnd

; Uninstaller Section
Section "Uninstall"
    Delete "$INSTDIR\CuePoint.exe"
    Delete "$INSTDIR\Uninstall.exe"
    Delete "$SMPROGRAMS\CuePoint\CuePoint.lnk"
    Delete "$SMPROGRAMS\CuePoint\Uninstall.lnk"
    RMDir "$SMPROGRAMS\CuePoint"
    Delete "$DESKTOP\CuePoint.lnk"
    RMDir "$INSTDIR"
    
    DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\CuePoint"
SectionEnd
```

### 4.2 Inno Setup (Alternative)

**Location**: `build/installer.iss`

```iss
[Setup]
AppName=CuePoint
AppVersion=1.0.0
DefaultDirName={pf}\CuePoint
DefaultGroupName=CuePoint
OutputDir=dist
OutputBaseFilename=CuePoint-Setup
Compression=lzma
SolidCompression=yes
SetupIconFile=assets\icon.ico

[Files]
Source: "dist\CuePoint.exe"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\CuePoint"; Filename: "{app}\CuePoint.exe"
Name: "{commondesktop}\CuePoint"; Filename: "{app}\CuePoint.exe"

[Run]
Filename: "{app}\CuePoint.exe"; Description: "Launch CuePoint"; Flags: nowait postinstall skipifsilent
```

---

## 5. macOS Distribution

### 5.1 App Bundle Structure

```
CuePoint.app/
├── Contents/
│   ├── Info.plist
│   ├── MacOS/
│   │   └── CuePoint
│   ├── Resources/
│   │   └── icon.icns
│   └── Frameworks/
│       └── [Qt frameworks]
```

### 5.2 Info.plist

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>CuePoint</string>
    <key>CFBundleIdentifier</key>
    <string>com.cuepoint.app</string>
    <key>CFBundleName</key>
    <string>CuePoint</string>
    <key>CFBundleVersion</key>
    <string>1.0.0</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0.0</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleIconFile</key>
    <string>icon.icns</string>
    <key>LSMinimumSystemVersion</key>
    <string>10.13</string>
    <key>NSHighResolutionCapable</key>
    <true/>
    <key>NSRequiresAquaSystemAppearance</key>
    <false/>
</dict>
</plist>
```

### 5.3 DMG Creation

**Location**: `build/create_dmg.sh`

```bash
#!/bin/bash

# Create DMG for macOS distribution
APP_NAME="CuePoint"
DMG_NAME="${APP_NAME}-1.0.0-macOS"
VOLUME_NAME="${APP_NAME}"

# Create temporary directory
TEMP_DIR=$(mktemp -d)
DMG_DIR="${TEMP_DIR}/${VOLUME_NAME}"
mkdir -p "${DMG_DIR}"

# Copy app bundle
cp -R "dist/${APP_NAME}.app" "${DMG_DIR}/"

# Create Applications symlink
ln -s /Applications "${DMG_DIR}/Applications"

# Copy README
cp "README.md" "${DMG_DIR}/"

# Create DMG
hdiutil create -volname "${VOLUME_NAME}" \
    -srcfolder "${DMG_DIR}" \
    -ov -format UDZO \
    "dist/${DMG_NAME}.dmg"

# Cleanup
rm -rf "${TEMP_DIR}"

echo "DMG created: dist/${DMG_NAME}.dmg"
```

### 5.4 Code Signing (macOS)

```bash
# Sign the app bundle
codesign --deep --force --verify --verbose \
    --sign "Developer ID Application: Your Name (TEAM_ID)" \
    dist/CuePoint.app

# Notarize (for distribution outside App Store)
xcrun notarytool submit dist/CuePoint.dmg \
    --apple-id your@email.com \
    --team-id TEAM_ID \
    --password "app-specific-password"
```

---

## 6. Linux Distribution

### 6.1 AppImage

**Location**: `build/create_appimage.sh`

```bash
#!/bin/bash

# Create AppImage for Linux
APP_NAME="CuePoint"
APPIMAGE_NAME="${APP_NAME}-1.0.0-x86_64.AppImage"

# Create AppDir structure
APPDIR="AppDir"
mkdir -p "${APPDIR}/usr/bin"
mkdir -p "${APPDIR}/usr/share/applications"
mkdir -p "${APPDIR}/usr/share/icons/hicolor/256x256/apps"

# Copy executable
cp "dist/${APP_NAME}" "${APPDIR}/usr/bin/${APP_NAME}"

# Create desktop entry
cat > "${APPDIR}/usr/share/applications/${APP_NAME}.desktop" << EOF
[Desktop Entry]
Name=CuePoint
Comment=Beatport Metadata Enricher
Exec=${APP_NAME}
Icon=${APP_NAME}
Type=Application
Categories=Audio;Music;
EOF

# Copy icon
cp "assets/icon.png" "${APPDIR}/usr/share/icons/hicolor/256x256/apps/${APP_NAME}.png"

# Download AppImageTool
if [ ! -f "appimagetool-x86_64.AppImage" ]; then
    wget https://github.com/AppImage/AppImageKit/releases/download/continuous/appimagetool-x86_64.AppImage
    chmod +x appimagetool-x86_64.AppImage
fi

# Create AppImage
./appimagetool-x86_64.AppImage "${APPDIR}" "dist/${APPIMAGE_NAME}"

echo "AppImage created: dist/${APPIMAGE_NAME}"
```

### 6.2 .deb Package

**Location**: `build/create_deb.sh`

```bash
#!/bin/bash

# Create .deb package for Debian/Ubuntu
APP_NAME="cuepoint"
VERSION="1.0.0"
DEB_DIR="deb_package"

mkdir -p "${DEB_DIR}/usr/bin"
mkdir -p "${DEB_DIR}/usr/share/applications"
mkdir -p "${DEB_DIR}/DEBIAN"

# Copy executable
cp "dist/CuePoint" "${DEB_DIR}/usr/bin/cuepoint"
chmod +x "${DEB_DIR}/usr/bin/cuepoint"

# Create desktop entry
cat > "${DEB_DIR}/usr/share/applications/cuepoint.desktop" << EOF
[Desktop Entry]
Name=CuePoint
Comment=Beatport Metadata Enricher
Exec=cuepoint
Icon=cuepoint
Type=Application
Categories=Audio;Music;
EOF

# Create control file
cat > "${DEB_DIR}/DEBIAN/control" << EOF
Package: ${APP_NAME}
Version: ${VERSION}
Section: multimedia
Priority: optional
Architecture: amd64
Depends: libqt6core6, libqt6gui6, libqt6widgets6
Maintainer: Your Name <your@email.com>
Description: Rekordbox to Beatport metadata enricher
 GUI application for enriching Rekordbox playlists with Beatport metadata.
EOF

# Build package
dpkg-deb --build "${DEB_DIR}" "dist/${APP_NAME}_${VERSION}_amd64.deb"

echo "Debian package created: dist/${APP_NAME}_${VERSION}_amd64.deb"
```

---

## 7. Build Automation

### 7.1 GitHub Actions Workflow

**Location**: `.github/workflows/build.yml`

```yaml
name: Build Executables

on:
  release:
    types: [created]
  workflow_dispatch:

jobs:
  build-windows:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-python@v4
        with:
          python-version: '3.11'
      - name: Install dependencies
        run: |
          pip install -r requirements.txt
          pip install pyinstaller
      - name: Build executable
        run: python build/build_executable.py
      - name: Create installer
        run: |
          # Install NSIS
          choco install nsis
          makensis build/installer.nsi
      - name: Upload artifact
        uses: actions/upload-artifact@v3
        with:
          name: CuePoint-Windows
          path: dist/CuePoint-Setup.exe

  build-macos:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-python@v4
        with:
          python-version: '3.11'
      - name: Install dependencies
        run: |
          pip install -r requirements.txt
          pip install pyinstaller
      - name: Build executable
        run: python build/build_executable.py
      - name: Create DMG
        run: bash build/create_dmg.sh
      - name: Upload artifact
        uses: actions/upload-artifact@v3
        with:
          name: CuePoint-macOS
          path: dist/*.dmg

  build-linux:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-python@v4
        with:
          python-version: '3.11'
      - name: Install dependencies
        run: |
          pip install -r requirements.txt
          pip install pyinstaller
      - name: Build executable
        run: python build/build_executable.py
      - name: Create AppImage
        run: bash build/create_appimage.sh
      - name: Upload artifact
        uses: actions/upload-artifact@v3
        with:
          name: CuePoint-Linux
          path: dist/*.AppImage
```

---

## 8. Testing Executables

### 8.1 Pre-Release Checklist

- [ ] Test on clean Windows VM (no Python installed)
- [ ] Test on clean macOS VM (no Python installed)
- [ ] Test on clean Linux VM (no Python installed)
- [ ] Verify all dependencies are bundled
- [ ] Test file operations (read XML, write CSV)
- [ ] Test GUI functionality
- [ ] Verify icons display correctly
- [ ] Test installer/uninstaller
- [ ] Check file size (should be reasonable)
- [ ] Test startup time

### 8.2 Automated Testing

```python
# tests/test_executable.py
import subprocess
import os
import sys

def test_executable_exists():
    """Test that executable exists"""
    exe_path = "dist/CuePoint.exe" if sys.platform == "win32" else "dist/CuePoint"
    assert os.path.exists(exe_path), f"Executable not found: {exe_path}"

def test_executable_runs():
    """Test that executable runs without errors"""
    exe_path = "dist/CuePoint.exe" if sys.platform == "win32" else "dist/CuePoint"
    result = subprocess.run([exe_path, "--version"], capture_output=True, timeout=10)
    assert result.returncode == 0, f"Executable failed to run: {result.stderr}"
```

---

## 9. Distribution Channels

### 9.1 GitHub Releases

- Upload executables to GitHub Releases
- Provide download links on website
- Include release notes and changelog

### 9.2 Direct Downloads

- Host on project website
- Provide download page with platform detection
- Include checksums for verification

### 9.3 Package Managers (Optional)

- **Homebrew** (macOS): `brew install cuepoint`
- **Chocolatey** (Windows): `choco install cuepoint`
- **AUR** (Arch Linux): `yay -S cuepoint`

---

## 10. Size Optimization

### 10.1 Reducing Size

- **UPX Compression**: Compress executable (may trigger antivirus)
- **Exclude Unused Modules**: Remove unnecessary imports
- **Use Directory Mode**: Instead of one-file mode (smaller, faster)
- **Strip Binaries**: Remove debug symbols

### 10.2 Expected Sizes

- **Windows**: ~150-200MB (one-file) or ~100MB (directory)
- **macOS**: ~200-250MB (app bundle)
- **Linux**: ~150-200MB (AppImage)

---

## 11. Security Considerations

### 11.1 Code Signing

- **Windows**: Use Authenticode signing certificate
- **macOS**: Use Developer ID certificate
- **Linux**: GPG signing for packages

### 11.2 Antivirus Handling

- Submit to antivirus vendors for whitelisting
- Provide checksums for verification
- Consider using directory mode (less suspicious)

---

## 12. Dependencies

### 12.1 Build Tools

```
pyinstaller>=5.0
```

### 12.2 Platform-Specific Tools

- **Windows**: NSIS or Inno Setup
- **macOS**: Xcode Command Line Tools
- **Linux**: AppImageTool, dpkg-deb

---

**Document Version**: 1.0  
**Last Updated**: 2025-11-03  
**Author**: CuePoint Development Team

