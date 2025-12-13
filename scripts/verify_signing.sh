#!/bin/bash
# macOS Signing Verification Script
# Verifies code signing and notarization for macOS artifacts
# Usage: ./verify_signing.sh [APP_PATH] [DMG_PATH]

set -e

APP_PATH="${1:-dist/CuePoint.app}"
DMG_PATH="${2:-}"

echo "Verifying code signing for: $APP_PATH"

# Verify app bundle signing
echo "Checking app bundle signature..."
if ! codesign --verify --deep --strict --verbose=2 "$APP_PATH"; then
    echo "ERROR: Code signing verification failed"
    exit 1
fi

# Verify Gatekeeper
echo "Checking Gatekeeper acceptance..."
if ! spctl -a -vv --type execute "$APP_PATH"; then
    echo "ERROR: Gatekeeper verification failed"
    exit 1
fi

# Check entitlements
echo "Checking entitlements..."
if ! codesign -d --entitlements - "$APP_PATH" > /dev/null 2>&1; then
    echo "WARNING: Could not verify entitlements"
fi

# If DMG provided, verify notarization
if [ -n "$DMG_PATH" ] && [ -f "$DMG_PATH" ]; then
    echo "Verifying DMG notarization..."
    if ! spctl -a -vv -t install "$DMG_PATH"; then
        echo "ERROR: DMG notarization verification failed"
        exit 1
    fi
    
    # Check stapled ticket
    if ! stapler validate "$DMG_PATH" 2>/dev/null; then
        echo "WARNING: Notarization ticket not stapled"
    fi
fi

echo "All signing verifications passed!"
