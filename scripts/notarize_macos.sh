#!/bin/bash
# Notarize macOS application or DMG

set -e

FILE_PATH="$1"
APPLE_ID="${APPLE_NOTARYTOOL_ISSUER_ID}"
TEAM_ID="${APPLE_TEAM_ID}"
KEY_ID="${APPLE_NOTARYTOOL_KEY_ID}"
KEY="${APPLE_NOTARYTOOL_KEY}"
PROFILE="notarytool-profile"

if [ -z "$FILE_PATH" ]; then
    echo "Usage: $0 <path-to-file>"
    exit 1
fi

if [ ! -f "$FILE_PATH" ]; then
    echo "Error: File not found: $FILE_PATH"
    exit 1
fi

if [ -z "$APPLE_ID" ] || [ -z "$TEAM_ID" ] || [ -z "$KEY_ID" ] || [ -z "$KEY" ]; then
    echo "Error: Notarization credentials not set"
    echo "Required environment variables:"
    echo "  APPLE_NOTARYTOOL_ISSUER_ID"
    echo "  APPLE_TEAM_ID"
    echo "  APPLE_NOTARYTOOL_KEY_ID"
    echo "  APPLE_NOTARYTOOL_KEY"
    exit 1
fi

echo "Notarizing: $FILE_PATH"

# Configure notarytool
echo "Configuring notarytool..."
xcrun notarytool store-credentials \
    --apple-id "$APPLE_ID" \
    --team-id "$TEAM_ID" \
    --key-id "$KEY_ID" \
    --key "$KEY" \
    "$PROFILE"

# Submit for notarization
echo "Submitting for notarization (this may take several minutes)..."
xcrun notarytool submit "$FILE_PATH" \
    --keychain-profile "$PROFILE" \
    --wait

# Staple (for DMG)
if [[ "$FILE_PATH" == *.dmg ]]; then
    echo "Stapling notarization ticket..."
    xcrun stapler staple "$FILE_PATH"
    xcrun stapler validate "$FILE_PATH"
fi

echo "Notarization complete"
