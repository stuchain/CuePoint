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

# Cleanup any existing mounts or temp files
echo "Cleaning up any existing DMG mounts and temp files..."
# Unmount if already mounted
if [ -d "$MOUNT_POINT" ]; then
    echo "Unmounting existing mount point: $MOUNT_POINT"
    hdiutil detach "$MOUNT_POINT" -force 2>/dev/null || true
    # Wait a moment for unmount to complete
    sleep 1
fi

# Remove any existing temp DMG files
if [ -f "${TEMP_DIR}/${DMG_NAME}-temp.dmg" ]; then
    echo "Removing existing temp DMG: ${TEMP_DIR}/${DMG_NAME}-temp.dmg"
    rm -f "${TEMP_DIR}/${DMG_NAME}-temp.dmg"
fi

# Remove any existing final DMG in dist (we'll recreate it)
if [ -f "dist/${DMG_NAME}.dmg" ]; then
    echo "Removing existing DMG: dist/${DMG_NAME}.dmg"
    rm -f "dist/${DMG_NAME}.dmg"
fi

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

# Create README (gatekeeper / unsigned app instructions)
cat > "${DMG_DIR}/README.txt" << 'EOF'
CuePoint - Installation (unsigned app)

Step 1: Drag CuePoint into the Applications folder.

Step 2: Try to open the app - it will not let you. DO NOT MOVE TO BIN.

Step 3: Go to Settings -> Privacy & Security -> scroll until you see CuePoint and click "Always open".

Step 4: Try again opening the app from the Applications folder.

For support, visit: https://github.com/StuChain/CuePoint
EOF

# Create initial DMG (read-write for layout configuration)
echo "Creating DMG image..."
# Use -ov to overwrite any existing file, and add retry logic
MAX_RETRIES=3
RETRY_COUNT=0
while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if hdiutil create -volname "${APP_NAME}" \
      -srcfolder "${DMG_DIR}" \
      -ov -format UDRW \
      -fs HFS+ \
      "${TEMP_DIR}/${DMG_NAME}-temp.dmg" 2>&1; then
        echo "DMG created successfully"
        break
    else
        RETRY_COUNT=$((RETRY_COUNT + 1))
        if [ $RETRY_COUNT -lt $MAX_RETRIES ]; then
            echo "DMG creation failed, retrying in 2 seconds... (attempt $RETRY_COUNT/$MAX_RETRIES)"
            sleep 2
            # Clean up any partial files
            rm -f "${TEMP_DIR}/${DMG_NAME}-temp.dmg"
            # Check for and unmount any mounts that might have been created
            if [ -d "$MOUNT_POINT" ]; then
                hdiutil detach "$MOUNT_POINT" -force 2>/dev/null || true
                sleep 1
            fi
        else
            echo "Error: Failed to create DMG after $MAX_RETRIES attempts"
            echo "Checking for mounted volumes..."
            hdiutil info | grep -A 5 "${APP_NAME}" || true
            exit 1
        fi
    fi
done

# Mount DMG for layout configuration
echo "Mounting DMG for layout configuration..."
# Ensure mount point doesn't exist
if [ -d "$MOUNT_POINT" ]; then
    echo "Mount point already exists, forcing unmount..."
    hdiutil detach "$MOUNT_POINT" -force 2>/dev/null || true
    sleep 1
fi

# Mount with retry logic (capture disk id for reliable unmount in CI)
ATTACH_OUTPUT=""
MAX_RETRIES=3
RETRY_COUNT=0
while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    ATTACH_OUTPUT=$(hdiutil attach "${TEMP_DIR}/${DMG_NAME}-temp.dmg" -mountpoint "$MOUNT_POINT" -readwrite -nobrowse 2>&1) && true
    if [ -d "$MOUNT_POINT" ]; then
        echo "DMG mounted successfully"
        break
    else
        RETRY_COUNT=$((RETRY_COUNT + 1))
        if [ $RETRY_COUNT -lt $MAX_RETRIES ]; then
            echo "DMG mount failed, retrying in 2 seconds... (attempt $RETRY_COUNT/$MAX_RETRIES)"
            sleep 2
        else
            echo "Error: Failed to mount DMG after $MAX_RETRIES attempts"
            echo "$ATTACH_OUTPUT"
            ls -lh "${TEMP_DIR}/${DMG_NAME}-temp.dmg" || true
            exit 1
        fi
    fi
done
# Capture disk identifier for unmount (e.g. disk6 from "/dev/disk6" or "disk6")
MOUNTED_DISK=""
if echo "$ATTACH_OUTPUT" | grep -qE '/dev/disk[0-9]+'; then
    MOUNTED_DISK=$(echo "$ATTACH_OUTPUT" | grep -oE 'disk[0-9]+' | head -1)
    echo "Mounted disk identifier: $MOUNTED_DISK"
fi

# Configure layout with AppleScript
echo "Configuring DMG layout..."
# Check if we're in a headless environment (CI)
if [ -z "$DISPLAY" ] && [ -z "$SSH_CONNECTION" ] && [ -n "$CI" ]; then
    echo "Running in CI environment, skipping AppleScript layout configuration..."
    echo "DMG will be created with default layout"
else
    # Try to configure layout, but don't fail if it doesn't work
    osascript <<'APPLESCRIPT' 2>/dev/null || echo "Warning: AppleScript layout configuration failed, continuing with default layout..."
tell application "Finder"
    try
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
            
            -- Update and close
            close
            delay 0.5
        end tell
    on error errMsg
        -- Ignore errors in headless environments
    end try
end tell
APPLESCRIPT
fi

# Unmount
echo "Unmounting DMG..."
# Wait a moment for any Finder operations to complete
sleep 2

# Close any Finder windows that might be holding the mount
if [ -n "$CI" ]; then
    # In CI, try to close Finder windows programmatically
    osascript -e 'tell application "Finder" to close every window' 2>/dev/null || true
    sleep 1
fi

# Unmount with retry logic (try mount point first, then disk id in CI)
MAX_RETRIES=5
RETRY_COUNT=0
UNMOUNTED=0
while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    # Try detach by mount point first
    if hdiutil detach "$MOUNT_POINT" -force 2>&1; then
        echo "DMG unmounted successfully"
        UNMOUNTED=1
        break
    fi
    # If mount point is gone but we have disk id, detach by disk (image may still be open)
    if [ ! -d "$MOUNT_POINT" ] && [ -n "$MOUNTED_DISK" ]; then
        echo "Mount point gone, detaching by disk: $MOUNTED_DISK"
        if hdiutil detach "$MOUNTED_DISK" -force 2>&1; then
            echo "DMG detached by disk id successfully"
            UNMOUNTED=1
            break
        fi
        diskutil unmountDisk force "$MOUNTED_DISK" 2>/dev/null || true
        sleep 1
    fi
    RETRY_COUNT=$((RETRY_COUNT + 1))
    if [ $RETRY_COUNT -lt $MAX_RETRIES ]; then
        echo "DMG unmount failed, retrying in 2 seconds... (attempt $RETRY_COUNT/$MAX_RETRIES)"
        [ -n "$MOUNTED_DISK" ] && hdiutil detach "$MOUNTED_DISK" -force 2>/dev/null || true
        osascript -e 'tell application "Finder" to close every window' 2>/dev/null || true
        sleep 2
    else
        echo "Trying alternative unmount methods..."
        DISK_NUM="${MOUNTED_DISK:-$(diskutil list | grep -A 1 "${APP_NAME}" | grep -oE 'disk[0-9]+' | head -1)}"
        if [ -n "$DISK_NUM" ]; then
            echo "Attempting diskutil unmountDisk force $DISK_NUM"
            diskutil unmountDisk force "$DISK_NUM" 2>/dev/null || true
            sleep 2
            echo "Attempting hdiutil detach $DISK_NUM -force"
            hdiutil detach "$DISK_NUM" -force 2>/dev/null || true
            sleep 2
        fi
        hdiutil detach "$MOUNT_POINT" -force 2>/dev/null || true
        if [ ! -d "$MOUNT_POINT" ]; then
            echo "DMG unmounted using alternative method"
            UNMOUNTED=1
        fi
    fi
done
# In CI, give the system time to release the image before convert
if [ -n "$CI" ]; then
    echo "CI: waiting 5s for image to be released before compression..."
    sleep 5
fi

# Convert to compressed DMG
echo "Compressing DMG..."

# Verify DMG is not mounted before compression
if [ -d "$MOUNT_POINT" ]; then
    echo "Error: DMG is still mounted at $MOUNT_POINT, cannot compress"
    echo "Attempting emergency unmount..."
    hdiutil detach "$MOUNT_POINT" -force 2>/dev/null || true
    [ -n "$MOUNTED_DISK" ] && hdiutil detach "$MOUNTED_DISK" -force 2>/dev/null || true
    [ -n "$MOUNTED_DISK" ] && diskutil unmountDisk force "$MOUNTED_DISK" 2>/dev/null || true
    sleep 3
    if [ -d "$MOUNT_POINT" ]; then
        echo "Error: Cannot unmount DMG, compression will fail"
        exit 1
    fi
fi
# If image is still attached (e.g. mount point gone but image open), detach by disk id
if [ -n "$MOUNTED_DISK" ] && hdiutil info 2>/dev/null | grep -qF "${TEMP_DIR}/${DMG_NAME}-temp.dmg"; then
    echo "Image still attached, detaching disk $MOUNTED_DISK..."
    hdiutil detach "$MOUNTED_DISK" -force 2>/dev/null || true
    diskutil unmountDisk force "$MOUNTED_DISK" 2>/dev/null || true
    sleep 3
fi

# Verify temp DMG exists
if [ ! -f "${TEMP_DIR}/${DMG_NAME}-temp.dmg" ]; then
    echo "Error: Temp DMG file not found: ${TEMP_DIR}/${DMG_NAME}-temp.dmg"
    exit 1
fi

# Compress with retry logic
MAX_RETRIES=3
RETRY_COUNT=0
while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if hdiutil convert "${TEMP_DIR}/${DMG_NAME}-temp.dmg" \
      -format UDZO \
      -imagekey zlib-level=9 \
      -o "dist/${DMG_NAME}.dmg" 2>&1; then
        echo "DMG compressed successfully"
        break
    else
        RETRY_COUNT=$((RETRY_COUNT + 1))
        if [ $RETRY_COUNT -lt $MAX_RETRIES ]; then
            echo "DMG compression failed, retrying in 2 seconds... (attempt $RETRY_COUNT/$MAX_RETRIES)"
            # Check if DMG is mounted
            if [ -d "$MOUNT_POINT" ]; then
                echo "DMG is still mounted, attempting to unmount..."
                hdiutil detach "$MOUNT_POINT" -force 2>/dev/null || true
                sleep 2
            fi
            sleep 2
        else
            echo "Error: Failed to compress DMG after $MAX_RETRIES attempts"
            echo "Checking DMG status..."
            hdiutil info | grep -A 5 "${APP_NAME}" || true
            exit 1
        fi
    fi
done

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
