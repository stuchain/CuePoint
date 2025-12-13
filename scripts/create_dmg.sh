#!/bin/bash
# macOS DMG Creation Script
# Creates a distributable DMG file for CuePoint
# Usage: ./create_dmg.sh [VERSION]
# Example: ./create_dmg.sh 1.0.0

set -e

APP_NAME="CuePoint"
VERSION="${1:-1.0.0}"
DMG_NAME="${APP_NAME}-v${VERSION}-macos-universal"
TEMP_DIR=$(mktemp -d)
DMG_DIR="${TEMP_DIR}/${APP_NAME}"
MOUNT_POINT="/Volumes/${APP_NAME}"

# Cleanup function
cleanup() {
    # Unmount if mounted
    if [ -d "$MOUNT_POINT" ]; then
        hdiutil detach "$MOUNT_POINT" || true
    fi
    rm -rf "${TEMP_DIR}"
}
trap cleanup EXIT

echo "Creating DMG for ${APP_NAME} ${VERSION}..."

# Verify app bundle exists
if [ ! -d "dist/${APP_NAME}.app" ]; then
    echo "Error: App bundle not found at dist/${APP_NAME}.app"
    echo "Please build the app first using PyInstaller"
    exit 1
fi

# Create DMG directory structure
mkdir -p "${DMG_DIR}"

# Copy app bundle
echo "Copying app bundle..."
cp -R "dist/${APP_NAME}.app" "${DMG_DIR}/"

# Create Applications symlink
echo "Creating Applications symlink..."
ln -s /Applications "${DMG_DIR}/Applications"

# Create README
cat > "${DMG_DIR}/README.txt" << EOF
CuePoint ${VERSION}

Installation:
1. Drag CuePoint.app to the Applications folder
2. Open Applications and launch CuePoint

System Requirements:
- macOS 10.15 or later
- 100MB free disk space

For support, visit: https://github.com/yourusername/cuepoint
EOF

# Create initial DMG (read-write for layout configuration)
echo "Creating DMG image..."
hdiutil create -volname "${APP_NAME}" \
  -srcfolder "${DMG_DIR}" \
  -ov -format UDRW \
  -fs HFS+ \
  "${TEMP_DIR}/${DMG_NAME}-temp.dmg"

# Mount DMG for layout configuration
echo "Mounting DMG for layout configuration..."
hdiutil attach "${TEMP_DIR}/${DMG_NAME}-temp.dmg" -mountpoint "$MOUNT_POINT" -readwrite

# Configure layout with AppleScript
echo "Configuring DMG layout..."
osascript <<EOF || true
tell application "Finder"
    tell disk "${APP_NAME}"
        open
        set current view of container window to icon view
        set toolbar visible of container window to false
        set statusbar visible of container window to false
        set bounds of container window to {400, 100, 900, 420}
        
        set view options of container window to icon view options
        set icon size of view options to 72
        
        -- Position CuePoint.app
        set position of item "CuePoint.app" to {120, 205}
        
        -- Position Applications symlink
        set position of item "Applications" to {380, 205}
        
        -- Update without registering positions
        close
        open
        update without registering applications
        delay 1
    end tell
end tell
EOF

# Unmount
echo "Unmounting DMG..."
hdiutil detach "$MOUNT_POINT"

# Convert to compressed DMG
echo "Compressing DMG..."
hdiutil convert "${TEMP_DIR}/${DMG_NAME}-temp.dmg" \
  -format UDZO \
  -imagekey zlib-level=9 \
  -o "dist/${DMG_NAME}.dmg"

# Ensure dist directory exists
mkdir -p dist

# Move final DMG to dist if not already there
if [ ! -f "dist/${DMG_NAME}.dmg" ]; then
    mv "${TEMP_DIR}/${DMG_NAME}.dmg" "dist/${DMG_NAME}.dmg"
fi

echo ""
echo "✓ DMG created successfully: dist/${DMG_NAME}.dmg"
echo ""
echo "Next steps:"
echo "  1. Sign the DMG (if not already signed): scripts/sign_macos.sh dist/${DMG_NAME}.dmg"
echo "  2. Notarize the DMG: scripts/notarize_macos.sh dist/${DMG_NAME}.dmg"
echo "  3. Validate the DMG: scripts/validate_dmg.sh dist/${DMG_NAME}.dmg"
