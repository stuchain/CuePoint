#!/bin/bash
# Sign macOS application

set -e

APP_PATH="$1"
IDENTITY="${APPLE_DEVELOPER_ID:-Developer ID Application: StuChain (TEAM_ID)}"

if [ -z "$APP_PATH" ]; then
    echo "Usage: $0 <path-to-app>"
    exit 1
fi

if [ ! -d "$APP_PATH" ]; then
    echo "Error: App not found: $APP_PATH"
    exit 1
fi

echo "Signing application: $APP_PATH"
echo "Using identity: $IDENTITY"

# Sign all nested binaries
echo "Signing nested binaries..."
find "$APP_PATH" -type f -perm +111 -exec codesign --force --sign "$IDENTITY" --options runtime {} \; 2>/dev/null || true

# Sign frameworks
echo "Signing frameworks..."
find "$APP_PATH" -name "*.framework" -exec codesign --force --sign "$IDENTITY" --options runtime {} \; 2>/dev/null || true

# Sign the app bundle
echo "Signing app bundle..."
codesign --force --deep --sign "$IDENTITY" --options runtime --timestamp "$APP_PATH"

# Verify signing
echo "Verifying signature..."
codesign --verify --verbose "$APP_PATH"
spctl --assess --verbose "$APP_PATH" || echo "Warning: spctl assessment failed (may need notarization)"

echo "Signing complete"
