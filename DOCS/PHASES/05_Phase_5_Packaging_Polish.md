# Phase 5: Packaging & Polish (2-3 weeks)

**Status**: 📝 Planned  
**Priority**: 🚀 P2 - LOWER PRIORITY (Do after features are complete)  
**Dependencies**: Phase 1 (GUI Foundation), Phase 2 (User Experience), Phase 3 (Reliability)

## Goal
Create distributable executables and add polish features for a professional finish.

## Success Criteria
- [ ] Executable builds successfully for all platforms
- [ ] Windows installer works
- [ ] macOS app bundle works
- [ ] Linux AppImage works
- [ ] Icons and branding complete
- [ ] Settings persist between sessions
- [ ] Recent files menu works
- [ ] Dark mode works (if implemented)
- [ ] Keyboard shortcuts work
- [ ] Help system accessible
- [ ] All features tested on clean systems

---

## Implementation Steps

### Step 5.1: Create Executable Packaging (1 week)
**Files**: `build/CuePoint.spec` (NEW), `build/build_windows.bat` (NEW), `build/build_macos.sh` (NEW), `build/build_linux.sh` (NEW)

**Dependencies**: Phase 1 Step 1.10 (application entry point), Phase 2 complete, PyInstaller installed

**What to create - EXACT STRUCTURE:**

**Create `build/CuePoint.spec`:**

```python
# -*- mode: python ; coding: utf-8 -*-

block_cipher = None

a = Analysis(
    ['SRC/gui_app.py'],
    pathex=[],
    binaries=[],
    datas=[
        ('config.yaml.template', '.'),
        ('assets/icon.ico', 'assets'),
        ('assets/icon.png', 'assets'),
    ],
    hiddenimports=[
        'PySide6.QtCore',
        'PySide6.QtGui',
        'PySide6.QtWidgets',
        'openpyxl',
        'yaml',
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
    console=False,  # No console window for GUI app
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon='assets/icon.ico'  # Windows icon
)
```

**Create `build/build_windows.bat`:**

```batch
@echo off
echo Building CuePoint for Windows...

REM Check if PyInstaller is installed
python -c "import PyInstaller" 2>nul
if errorlevel 1 (
    echo PyInstaller not found. Installing...
    pip install pyinstaller
)

REM Clean previous builds
if exist dist rmdir /s /q dist
if exist build rmdir /s /q build

REM Build executable
pyinstaller --clean CuePoint.spec

REM Check if build succeeded
if exist dist\CuePoint\CuePoint.exe (
    echo Build successful!
    echo Executable: dist\CuePoint\CuePoint.exe
) else (
    echo Build failed!
    exit /b 1
)

pause
```

**Create `build/build_macos.sh`:**

```bash
#!/bin/bash

echo "Building CuePoint for macOS..."

# Check if PyInstaller is installed
if ! python3 -c "import PyInstaller" 2>/dev/null; then
    echo "PyInstaller not found. Installing..."
    pip3 install pyinstaller
fi

# Clean previous builds
rm -rf dist build

# Build executable
pyinstaller --clean CuePoint.spec

# Check if build succeeded
if [ -f "dist/CuePoint/CuePoint.app" ]; then
    echo "Build successful!"
    echo "App bundle: dist/CuePoint/CuePoint.app"
    
    # Create DMG (optional, requires create-dmg)
    if command -v create-dmg &> /dev/null; then
        echo "Creating DMG..."
        create-dmg dist/CuePoint.dmg dist/CuePoint.app
    fi
else
    echo "Build failed!"
    exit 1
fi
```

**Create `build/build_linux.sh`:**

```bash
#!/bin/bash

echo "Building CuePoint for Linux..."

# Check if PyInstaller is installed
if ! python3 -c "import PyInstaller" 2>/dev/null; then
    echo "PyInstaller not found. Installing..."
    pip3 install pyinstaller
fi

# Clean previous builds
rm -rf dist build

# Build executable
pyinstaller --clean CuePoint.spec

# Check if build succeeded
if [ -f "dist/CuePoint/CuePoint" ]; then
    echo "Build successful!"
    echo "Executable: dist/CuePoint/CuePoint"
    
    # Create AppImage (optional, requires appimagetool)
    if command -v appimagetool &> /dev/null; then
        echo "Creating AppImage..."
        # AppImage setup would go here
    fi
else
    echo "Build failed!"
    exit 1
fi
```

**Update `CuePoint.spec` for macOS:**

```python
# For macOS, modify the EXE section:
exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='CuePoint',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='CuePoint',
)

app = BUNDLE(
    coll,
    name='CuePoint.app',
    icon='assets/icon.icns',
    bundle_identifier='com.cuepoint.app',
)
```

**Implementation Checklist**:
- [ ] Install PyInstaller: `pip install pyinstaller`
- [ ] Create `build/` directory
- [ ] Create `CuePoint.spec` file
- [ ] Create Windows build script
- [ ] Create macOS build script
- [ ] Create Linux build script
- [ ] Test Windows build
- [ ] Test macOS build (if available)
- [ ] Test Linux build (if available)
- [ ] Verify all dependencies included
- [ ] Test executable on clean system (no Python installed)
- [ ] Fix any missing dependencies
- [ ] Optimize executable size

**Acceptance Criteria**:
- ✅ PyInstaller spec file created
- ✅ Windows executable builds successfully
- ✅ macOS app bundle builds successfully (if on macOS)
- ✅ Linux executable builds successfully (if on Linux)
- ✅ Executable runs on clean system (no Python)
- ✅ All dependencies bundled correctly
- ✅ Icons display correctly
- ✅ File size reasonable (< 200MB)

**Design Reference**: `DOCS/DESIGNS/17_Executable_Packaging_Design.md`

**Dependencies**: 
- PyInstaller: `pip install pyinstaller`
- UPX (optional, for compression): Download from https://upx.github.io/

---

### Step 5.2: Create Windows Installer (2-3 days)
**Files**: `build/installer.nsi` (NEW) - NSIS script, or `build/installer.iss` (NEW) - Inno Setup script

**Dependencies**: Step 5.1 (executable builds), NSIS or Inno Setup installed

**What to create - EXACT STRUCTURE:**

**Option 1: NSIS Script (`build/installer.nsi`):**

```nsis
; CuePoint Windows Installer Script (NSIS)

!define APP_NAME "CuePoint"
!define APP_VERSION "1.0.0"
!define APP_PUBLISHER "CuePoint Development Team"
!define APP_EXE "CuePoint.exe"
!define APP_DIR "CuePoint"

Name "${APP_NAME}"
OutFile "${APP_NAME}_Setup_${APP_VERSION}.exe"
InstallDir "$PROGRAMFILES\${APP_DIR}"
RequestExecutionLevel admin

Page directory
Page instfiles

Section "Install"
    SetOutPath "$INSTDIR"
    
    ; Copy executable and files
    File /r "dist\${APP_DIR}\*.*"
    
    ; Create shortcuts
    CreateDirectory "$SMPROGRAMS\${APP_DIR}"
    CreateShortcut "$SMPROGRAMS\${APP_DIR}\${APP_NAME}.lnk" "$INSTDIR\${APP_EXE}"
    CreateShortcut "$DESKTOP\${APP_NAME}.lnk" "$INSTDIR\${APP_EXE}"
    
    ; Write registry for uninstaller
    WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" \
        "DisplayName" "${APP_NAME}"
    WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" \
        "UninstallString" "$INSTDIR\Uninstall.exe"
    
    ; Create uninstaller
    WriteUninstaller "$INSTDIR\Uninstall.exe"
SectionEnd

Section "Uninstall"
    Delete "$INSTDIR\*.*"
    RMDir /r "$INSTDIR"
    Delete "$SMPROGRAMS\${APP_DIR}\*.*"
    RMDir "$SMPROGRAMS\${APP_DIR}"
    Delete "$DESKTOP\${APP_NAME}.lnk"
    DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}"
SectionEnd
```

**Option 2: Inno Setup Script (`build/installer.iss`):**

```pascal
[Setup]
AppName=CuePoint
AppVersion=1.0.0
AppPublisher=CuePoint Development Team
DefaultDirName={pf}\CuePoint
DefaultGroupName=CuePoint
OutputBaseFilename=CuePoint_Setup_1.0.0
Compression=lzma
SolidCompression=yes
PrivilegesRequired=admin

[Files]
Source: "dist\CuePoint\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs

[Icons]
Name: "{group}\CuePoint"; Filename: "{app}\CuePoint.exe"
Name: "{commondesktop}\CuePoint"; Filename: "{app}\CuePoint.exe"

[Run]
Filename: "{app}\CuePoint.exe"; Description: "Launch CuePoint"; Flags: nowait postinstall skipifsilent
```

**Create `build/build_installer.bat`:**

```batch
@echo off
echo Building Windows Installer...

REM Check if NSIS is installed
where nsis 2>nul
if errorlevel 1 (
    echo NSIS not found. Please install NSIS from https://nsis.sourceforge.io/
    echo Or use Inno Setup from https://jrsoftware.org/isinfo.php
    pause
    exit /b 1
)

REM Build installer
makensis installer.nsi

if exist CuePoint_Setup_1.0.0.exe (
    echo Installer created: CuePoint_Setup_1.0.0.exe
) else (
    echo Installer build failed!
    exit /b 1
)

pause
```

**Implementation Checklist**:
- [ ] Choose installer tool (NSIS or Inno Setup)
- [ ] Install chosen tool
- [ ] Create installer script
- [ ] Test installer creation
- [ ] Test installation on clean Windows system
- [ ] Test uninstallation
- [ ] Verify shortcuts created
- [ ] Verify registry entries
- [ ] Test installer with existing installation

**Acceptance Criteria**:
- ✅ Installer script created
- ✅ Installer builds successfully
- ✅ Installation works on clean system
- ✅ Shortcuts created correctly
- ✅ Uninstallation works correctly
- ✅ No leftover files after uninstall

**Design Reference**: `DOCS/DESIGNS/17_Executable_Packaging_Design.md`

**Dependencies**:
- NSIS: https://nsis.sourceforge.io/ (free, open-source)
- Inno Setup: https://jrsoftware.org/isinfo.php (free, open-source)

---

### Step 5.3: Application Icons and Branding (1-2 days)
**Files**: `assets/icon.ico` (NEW), `assets/icon.icns` (NEW), `assets/icon.png` (NEW), `assets/splash.png` (NEW)

**Dependencies**: Phase 1 (GUI), graphics design tools

**What to create - EXACT STRUCTURE:**

**Icon Requirements:**
- **Windows**: `icon.ico` - Multiple sizes (16x16, 32x32, 48x48, 256x256)
- **macOS**: `icon.icns` - Multiple sizes (16x16 to 512x512)
- **Linux**: `icon.png` - 256x256 or 512x512

**Splash Screen:**
- **Size**: 800x600 or 1024x768
- **Format**: PNG with transparency support

**Modify `SRC/gui/main_window.py`:**

```python
from PySide6.QtGui import QIcon, QPixmap
from PySide6.QtWidgets import QSplashScreen
from PySide6.QtCore import Qt, QTimer
import os

class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        
        # Set application icon
        icon_path = self._get_icon_path()
        if icon_path and os.path.exists(icon_path):
            self.setWindowIcon(QIcon(icon_path))
        
        # Show splash screen
        self._show_splash()
        
        # ... rest of initialization ...
        
        # Close splash screen after initialization
        QTimer.singleShot(2000, self._close_splash)
    
    def _get_icon_path(self) -> Optional[str]:
        """Get path to application icon based on platform"""
        base_dir = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
        
        if sys.platform == "win32":
            return os.path.join(base_dir, "assets", "icon.ico")
        elif sys.platform == "darwin":
            return os.path.join(base_dir, "assets", "icon.icns")
        else:
            return os.path.join(base_dir, "assets", "icon.png")
    
    def _show_splash(self):
        """Show splash screen"""
        splash_path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
            "assets", "splash.png"
        )
        
        if os.path.exists(splash_path):
            pixmap = QPixmap(splash_path)
            self.splash = QSplashScreen(pixmap, Qt.WindowStaysOnTopHint)
            self.splash.show()
        else:
            self.splash = None
    
    def _close_splash(self):
        """Close splash screen"""
        if self.splash:
            self.splash.finish(self)
            self.splash = None
```

**Update About Dialog (`SRC/gui/dialogs.py`):**

```python
class AboutDialog(QDialog):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWindowTitle("About CuePoint")
        layout = QVBoxLayout()
        
        # Logo/Icon
        logo_label = QLabel()
        icon_path = self._get_icon_path()
        if icon_path and os.path.exists(icon_path):
            pixmap = QPixmap(icon_path)
            pixmap = pixmap.scaled(128, 128, Qt.KeepAspectRatio, Qt.SmoothTransformation)
            logo_label.setPixmap(pixmap)
        logo_label.setAlignment(Qt.AlignCenter)
        layout.addWidget(logo_label)
        
        # Application name and version
        name_label = QLabel("<h1>CuePoint</h1>")
        name_label.setAlignment(Qt.AlignCenter)
        layout.addWidget(name_label)
        
        version_label = QLabel("Version 1.0.0")
        version_label.setAlignment(Qt.AlignCenter)
        layout.addWidget(version_label)
        
        # Description
        desc_label = QLabel(
            "CuePoint is a desktop application for matching Rekordbox playlists\n"
            "with Beatport track metadata."
        )
        desc_label.setAlignment(Qt.AlignCenter)
        desc_label.setWordWrap(True)
        layout.addWidget(desc_label)
        
        # Copyright
        copyright_label = QLabel("© 2025 CuePoint Development Team")
        copyright_label.setAlignment(Qt.AlignCenter)
        layout.addWidget(copyright_label)
        
        # Close button
        close_btn = QPushButton("Close")
        close_btn.clicked.connect(self.accept)
        layout.addWidget(close_btn)
        
        self.setLayout(layout)
    
    def _get_icon_path(self) -> Optional[str]:
        """Get path to application icon"""
        # Same logic as MainWindow
        pass
```

**Implementation Checklist**:
- [ ] Design application icon (or use placeholder)
- [ ] Create `icon.ico` for Windows (multiple sizes)
- [ ] Create `icon.icns` for macOS (multiple sizes)
- [ ] Create `icon.png` for Linux
- [ ] Create splash screen image
- [ ] Update `MainWindow` to use icons
- [ ] Update `AboutDialog` to show logo
- [ ] Test icons display correctly on all platforms
- [ ] Verify splash screen works

**Acceptance Criteria**:
- ✅ Icons created for all platforms
- ✅ Icons display correctly in application
- ✅ Splash screen displays correctly
- ✅ About dialog shows logo
- ✅ Window icon displays in taskbar
- ✅ Icons work in executable

**Design Reference**: `DOCS/DESIGNS/18_GUI_Enhancements_Design.md`

**Note**: If you don't have design tools, you can use:
- **Online Icon Generators**: https://www.favicon-generator.org/, https://iconverticons.com/
- **Free Icon Libraries**: https://www.flaticon.com/, https://icons8.com/
- **Placeholder Icons**: Use simple geometric shapes for initial testing

---

### Step 5.4: Settings Persistence (Already Implemented - Verify) (1 day)
**Files**: `SRC/gui/main_window.py` (VERIFY), `SRC/gui/config_panel.py` (VERIFY)

**Dependencies**: Phase 1 (GUI), Phase 2 (Settings panel)

**Status Note**: Settings persistence using `QSettings` was already implemented in Phase 2. This step verifies and enhances it.

**What to verify - EXACT STRUCTURE:**

**Verify `QSettings` usage in `SRC/gui/main_window.py`:**

```python
from PySide6.QtCore import QSettings

class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        
        # Initialize settings
        self.settings = QSettings("CuePoint", "CuePoint")
        
        # Load window geometry
        self._load_window_state()
        
        # ... rest of initialization ...
    
    def _load_window_state(self):
        """Load window state from settings"""
        geometry = self.settings.value("geometry")
        if geometry:
            self.restoreGeometry(geometry)
        
        window_state = self.settings.value("windowState")
        if window_state:
            self.restoreState(window_state)
    
    def closeEvent(self, event):
        """Save window state before closing"""
        self.settings.setValue("geometry", self.saveGeometry())
        self.settings.setValue("windowState", self.saveState())
        
        # Save recent files
        recent_files = [self.file_selector.get_file_path()]  # Add logic to get all recent files
        self.settings.setValue("recentFiles", recent_files)
        
        super().closeEvent(event)
```

**Verify settings persistence in `SRC/gui/config_panel.py`:**

```python
from PySide6.QtCore import QSettings

class ConfigPanel(QWidget):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.settings = QSettings("CuePoint", "CuePoint")
        # ... initialization ...
        self._load_settings()
    
    def _load_settings(self):
        """Load settings from QSettings"""
        # Load all config values
        # ...
        pass
    
    def _save_settings(self):
        """Save settings to QSettings"""
        # Save all config values
        # ...
        self.settings.sync()  # Ensure settings are written to disk
```

**Implementation Checklist**:
- [ ] Verify `QSettings` is used for window state
- [ ] Verify `QSettings` is used for recent files
- [ ] Verify `QSettings` is used for config panel settings
- [ ] Test settings persist after application restart
- [ ] Test settings work on different platforms
- [ ] Verify settings file location is correct
- [ ] Add settings migration if needed (for version upgrades)

**Acceptance Criteria**:
- ✅ Window geometry persists
- ✅ Window state persists
- ✅ Recent files persist
- ✅ Config settings persist
- ✅ Settings work on Windows, macOS, Linux
- ✅ Settings file location is correct

**Note**: `QSettings` automatically handles platform-specific storage:
- **Windows**: Registry (`HKEY_CURRENT_USER\Software\CuePoint\CuePoint`)
- **macOS**: `~/Library/Preferences/com.cuepoint.CuePoint.plist`
- **Linux**: `~/.config/CuePoint/CuePoint.conf`

---

### Step 5.5: Help System Enhancement (2 days)
**Files**: `SRC/gui/dialogs.py` (MODIFY), `DOCS/USER_GUIDE.md` (NEW or UPDATE)

**Dependencies**: Phase 2 Step 2.4 (Help menu exists)

**Status Note**: Basic help dialogs were implemented in Phase 2. This step enhances them.

**What to enhance - EXACT STRUCTURE:**

**Enhance `UserGuideDialog` in `SRC/gui/dialogs.py`:**

```python
class UserGuideDialog(QDialog):
    """Enhanced user guide dialog with navigation"""
    
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWindowTitle("CuePoint User Guide")
        self.setMinimumSize(800, 600)
        layout = QVBoxLayout(self)
        
        # Navigation toolbar
        nav_layout = QHBoxLayout()
        
        self.back_btn = QPushButton("← Back")
        self.back_btn.clicked.connect(self._go_back)
        self.back_btn.setEnabled(False)
        nav_layout.addWidget(self.back_btn)
        
        self.forward_btn = QPushButton("Forward →")
        self.forward_btn.clicked.connect(self._go_forward)
        self.forward_btn.setEnabled(False)
        nav_layout.addWidget(self.forward_btn)
        
        nav_layout.addStretch()
        
        # Table of contents
        self.toc_combo = QComboBox()
        self.toc_combo.addItems([
            "Getting Started",
            "Loading Playlists",
            "Processing Tracks",
            "Viewing Results",
            "Exporting Data",
            "Batch Processing",
            "Settings",
            "Troubleshooting"
        ])
        self.toc_combo.currentTextChanged.connect(self._navigate_to_section)
        nav_layout.addWidget(QLabel("Section:"))
        nav_layout.addWidget(self.toc_combo)
        
        layout.addLayout(nav_layout)
        
        # Content browser
        self.browser = QTextBrowser()
        self.browser.setOpenExternalLinks(True)
        self._load_user_guide()
        layout.addWidget(self.browser)
        
        # Close button
        close_btn = QPushButton("Close")
        close_btn.clicked.connect(self.accept)
        layout.addWidget(close_btn)
        
        # History for back/forward
        self.history = []
        self.history_index = -1
    
    def _load_user_guide(self):
        """Load user guide content"""
        guide_path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
            "DOCS", "USER_GUIDE.md"
        )
        
        if os.path.exists(guide_path):
            with open(guide_path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            # Convert Markdown to HTML (simple conversion)
            html = self._markdown_to_html(content)
            self.browser.setHtml(html)
        else:
            self.browser.setHtml("<h1>User Guide</h1><p>User guide not found.</p>")
    
    def _markdown_to_html(self, markdown: str) -> str:
        """Simple Markdown to HTML converter"""
        # Basic conversion - can use markdown library for full support
        html = markdown.replace("\n", "<br>")
        html = html.replace("# ", "<h1>").replace("#", "</h1>")
        html = html.replace("**", "<b>").replace("**", "</b>")
        return f"<html><body>{html}</body></html>"
    
    def _navigate_to_section(self, section: str):
        """Navigate to a specific section"""
        # Add to history
        self.history = self.history[:self.history_index + 1]
        self.history.append(section)
        self.history_index = len(self.history) - 1
        
        # Update navigation buttons
        self.back_btn.setEnabled(self.history_index > 0)
        self.forward_btn.setEnabled(False)
        
        # Scroll to section (implementation depends on content structure)
        # ...
    
    def _go_back(self):
        """Go back in history"""
        if self.history_index > 0:
            self.history_index -= 1
            section = self.history[self.history_index]
            self.toc_combo.setCurrentText(section)
            self.back_btn.setEnabled(self.history_index > 0)
            self.forward_btn.setEnabled(True)
    
    def _go_forward(self):
        """Go forward in history"""
        if self.history_index < len(self.history) - 1:
            self.history_index += 1
            section = self.history[self.history_index]
            self.toc_combo.setCurrentText(section)
            self.back_btn.setEnabled(True)
            self.forward_btn.setEnabled(self.history_index < len(self.history) - 1)
```

**Create `DOCS/USER_GUIDE.md`:**

```markdown
# CuePoint User Guide

## Getting Started

### Installation

1. Download the installer for your platform
2. Run the installer
3. Launch CuePoint from the Start Menu (Windows) or Applications folder (macOS)

### First Launch

When you first launch CuePoint:
1. Select your Rekordbox XML file
2. Choose a playlist to process
3. Click "Start Processing"

## Loading Playlists

### Selecting XML File

1. Click "Browse" next to "Rekordbox XML File"
2. Navigate to your Rekordbox XML export file
3. Select the file and click "Open"

### Choosing Playlist

1. After loading the XML file, playlists will appear in the dropdown
2. Select the playlist you want to process
3. The track count will be displayed

## Processing Tracks

### Basic Processing

1. Select your playlist
2. Review settings (optional)
3. Click "Start Processing"
4. Wait for processing to complete

### Understanding Progress

- **Progress Bar**: Shows overall progress
- **Current Track**: Displays the track being processed
- **Time Elapsed**: Shows how long processing has taken
- **Estimated Remaining**: Estimated time to completion

## Viewing Results

### Results Table

The results table shows:
- **Index**: Track position in playlist
- **Title**: Original track title
- **Artist**: Original track artist
- **Matched**: Whether a match was found (✓ or ✗)
- **Beatport Title**: Matched track title
- **Beatport Artist**: Matched track artist
- **Score**: Match confidence score
- **Confidence**: High/Medium/Low
- **Key**: Musical key
- **BPM**: Beats per minute
- **Year**: Release year

### Filtering Results

- **Search Box**: Filter by title or artist
- **Confidence Filter**: Filter by confidence level
- **Sort**: Click column headers to sort

### Viewing Candidates

1. Double-click a track row
2. Or right-click and select "View Candidates"
3. Compare multiple candidate matches
4. Select a different candidate if needed

## Exporting Data

### Export Options

1. Click "Export" button
2. Choose format (CSV, JSON, Excel)
3. Select columns to include
4. Choose file location
5. Click "Export"

### Export Formats

- **CSV**: Comma-separated values (spreadsheet compatible)
- **JSON**: Structured data format
- **Excel**: Microsoft Excel format (.xlsx)

## Batch Processing

### Processing Multiple Playlists

1. Select "Multiple Playlists" mode
2. Check the playlists you want to process
3. Click "Start Batch Processing"
4. Monitor progress for each playlist
5. View results in separate tabs

## Settings

### Basic Settings

- **Performance Preset**: Fast/Balanced/Thorough
- **Auto-Research**: Automatically research unmatched tracks

### Advanced Settings

- **Max Results per Query**: Limit search results
- **Match Threshold**: Minimum score for match
- **Timeout Settings**: Network timeout values

## Troubleshooting

### Common Issues

**No matches found:**
- Check your internet connection
- Verify XML file is valid
- Try adjusting match threshold

**Slow processing:**
- Use "Fast" performance preset
- Reduce max results per query
- Check network connection

**Application crashes:**
- Check error logs
- Verify XML file format
- Reinstall application

## Keyboard Shortcuts

- **Ctrl+O**: Open XML file
- **Ctrl+S**: Save/Export results
- **Ctrl+F**: Focus search box
- **F11**: Toggle fullscreen
- **F1**: Show help

## Support

For additional help, visit: [GitHub Issues](https://github.com/your-repo/issues)
```

**Implementation Checklist**:
- [ ] Enhance `UserGuideDialog` with navigation
- [ ] Create comprehensive user guide document
- [ ] Add table of contents
- [ ] Add search functionality (optional)
- [ ] Test help system
- [ ] Verify all links work
- [ ] Update help content based on actual features

**Acceptance Criteria**:
- ✅ User guide displays correctly
- ✅ Navigation works
- ✅ Content is comprehensive
- ✅ Links work correctly
- ✅ Help accessible from menu
- ✅ Keyboard shortcut works (F1)

---

### Step 5.6: Final Testing and Quality Assurance (2-3 days)
**Files**: `tests/` directory (UPDATE), `TESTING.md` (NEW)

**Dependencies**: All previous steps complete

**What to create - EXACT STRUCTURE:**

**Create `TESTING.md`:**

```markdown
# CuePoint Testing Guide

## Pre-Release Testing Checklist

### Installation Testing
- [ ] Windows installer works on clean system
- [ ] macOS app bundle works on clean system
- [ ] Linux AppImage works on clean system
- [ ] Installation doesn't require admin (if possible)
- [ ] Uninstallation works correctly
- [ ] No leftover files after uninstall

### Functionality Testing
- [ ] Load XML file works
- [ ] Playlist selection works
- [ ] Single playlist processing works
- [ ] Batch processing works
- [ ] Results display correctly
- [ ] Filtering works
- [ ] Sorting works
- [ ] Export to CSV works
- [ ] Export to JSON works
- [ ] Export to Excel works
- [ ] Candidate viewing works
- [ ] Settings persistence works
- [ ] Recent files work
- [ ] Help system accessible

### Performance Testing
- [ ] Processing completes in reasonable time
- [ ] No memory leaks
- [ ] GUI remains responsive during processing
- [ ] Large playlists (500+ tracks) work
- [ ] Batch processing handles multiple playlists

### Error Handling Testing
- [ ] Invalid XML file handled gracefully
- [ ] Network errors handled gracefully
- [ ] Missing files handled gracefully
- [ ] Invalid settings handled gracefully
- [ ] Error messages are user-friendly

### Cross-Platform Testing
- [ ] Windows 10/11 tested
- [ ] macOS tested (if available)
- [ ] Linux tested (if available)
- [ ] Different screen resolutions tested
- [ ] Different DPI settings tested

### User Experience Testing
- [ ] UI is intuitive
- [ ] Tooltips are helpful
- [ ] Error messages are clear
- [ ] Progress indicators are accurate
- [ ] Keyboard shortcuts work
- [ ] Icons display correctly
- [ ] Text is readable
- [ ] Layout works on different window sizes
```

**Create test script `tests/test_executable.py`:**

```python
#!/usr/bin/env python3
"""Test executable on clean system"""

import subprocess
import sys
import os

def test_executable():
    """Test that executable runs without errors"""
    
    # Find executable
    if sys.platform == "win32":
        exe_path = "dist/CuePoint/CuePoint.exe"
    elif sys.platform == "darwin":
        exe_path = "dist/CuePoint/CuePoint.app/Contents/MacOS/CuePoint"
    else:
        exe_path = "dist/CuePoint/CuePoint"
    
    if not os.path.exists(exe_path):
        print(f"ERROR: Executable not found at {exe_path}")
        return False
    
    # Test that executable can be launched
    try:
        # Launch with --version or --help flag if available
        result = subprocess.run([exe_path, "--help"], 
                              capture_output=True, 
                              timeout=10)
        if result.returncode == 0:
            print("✓ Executable launches successfully")
            return True
        else:
            print(f"✗ Executable returned error code {result.returncode}")
            return False
    except Exception as e:
        print(f"✗ Error launching executable: {e}")
        return False

if __name__ == "__main__":
    success = test_executable()
    sys.exit(0 if success else 1)
```

**Implementation Checklist**:
- [ ] Create testing checklist
- [ ] Test installation on clean systems
- [ ] Test all functionality
- [ ] Test error handling
- [ ] Test performance
- [ ] Test cross-platform compatibility
- [ ] Fix any issues found
- [ ] Document known issues
- [ ] Create release notes

**Acceptance Criteria**:
- ✅ All tests pass
- ✅ No critical bugs
- ✅ Performance acceptable
- ✅ User experience is good
- ✅ Documentation complete
- ✅ Ready for release

---

## Phase 5 Deliverables Checklist
- [ ] Executable builds for Windows
- [ ] Executable builds for macOS (if on macOS)
- [ ] Executable builds for Linux (if on Linux)
- [ ] Windows installer works
- [ ] macOS app bundle works (if on macOS)
- [ ] Linux AppImage works (if on Linux)
- [ ] Icons and branding complete
- [ ] Settings persistence verified
- [ ] Recent files menu works
- [ ] Help system complete
- [ ] All features tested on clean systems
- [ ] Release notes created
- [ ] Documentation updated

---

## Testing Strategy

### Executable Testing
- Test on clean Windows system (no Python installed)
- Test on clean macOS system (if available)
- Test on clean Linux system (if available)
- Verify all dependencies included
- Test file associations (if applicable)
- Test installer/uninstaller
- Test with different user permissions

### Polish Features Testing
- Test settings persistence across restarts
- Test recent files menu
- Test help system navigation
- Test keyboard shortcuts
- Test icons display correctly
- Test splash screen
- Test about dialog

### User Experience Testing
- Test with real-world data
- Test with various playlist sizes
- Test error scenarios
- Test edge cases
- Get user feedback

---

## Common Issues and Solutions

### Issue: Executable too large
**Solution**: 
- Use PyInstaller's `--exclude-module` to remove unused modules
- Use UPX compression
- Use `--onefile` mode (but slower startup)

### Issue: Missing dependencies in executable
**Solution**: 
- Check PyInstaller spec file
- Add hidden imports
- Test on clean system
- Use `--collect-all` for problematic packages

### Issue: Settings not persisting
**Solution**: 
- Check file permissions
- Verify QSettings path
- Test on different platforms
- Check QSettings organization/application names

### Issue: Icons not displaying
**Solution**: 
- Verify icon file paths
- Check resource compilation
- Test on different platforms
- Use absolute paths in spec file

### Issue: Antivirus false positives
**Solution**: 
- Code sign executable (Windows)
- Submit to antivirus vendors
- Use reputable build tools
- Provide checksums for verification

---

## Release Checklist

Before releasing:
- [ ] All tests pass
- [ ] Version number updated
- [ ] Release notes written
- [ ] Executables built for all platforms
- [ ] Installers created
- [ ] Checksums generated
- [ ] Documentation updated
- [ ] GitHub release created
- [ ] Announcement prepared

---

*For complete design details, see the referenced design documents in `DOCS/DESIGNS/`.*
