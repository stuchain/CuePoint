# Installation

## macOS

1. Download the DMG file from [Releases](https://github.com/stuchain/CuePoint/releases)
2. Open the DMG file
3. Drag CuePoint to Applications
4. Open CuePoint from Applications

**Note**: On first launch, you may need to allow the app in System Preferences > Security & Privacy.

## Windows

1. Download the installer from [Releases](https://github.com/stuchain/CuePoint/releases)
2. Run the installer
3. Follow the installation wizard
4. Launch CuePoint from Start menu

## Linux

1. Download the AppImage from [Releases](https://github.com/stuchain/CuePoint/releases)
2. Make it executable: `chmod +x CuePoint.AppImage`
3. Run: `./CuePoint.AppImage`

## System Requirements

- **macOS**: 10.15 (Catalina) or later
- **Windows**: Windows 10 or later
- **Linux**: Modern Linux distribution with GTK support
- **RAM**: 4GB minimum, 8GB recommended
- **Disk Space**: 100MB for application, additional space for exports

## Troubleshooting Installation

### macOS: "App is damaged" Error

If you see "App is damaged" error:
1. Open Terminal
2. Run: `xattr -cr /Applications/CuePoint.app`
3. Try opening again

### Windows: Installation Blocked

If Windows blocks the installation:
1. Right-click the installer
2. Select "Properties"
3. Check "Unblock" if available
4. Run installer as Administrator if needed

