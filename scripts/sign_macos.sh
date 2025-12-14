#!/bin/bash
# Enhanced macOS signing script
# Signs all nested items and the app bundle with proper error handling

set -e

APP_PATH="$1"
IDENTITY="${APPLE_DEVELOPER_ID:-Developer ID Application: StuChain (TEAM_ID)}"
ENTITLEMENTS="${ENTITLEMENTS_FILE:-build/entitlements.plist}"

if [ -z "$APP_PATH" ]; then
    echo "Usage: $0 <path-to-app> [identity] [entitlements]"
    exit 1
fi

if [ ! -d "$APP_PATH" ]; then
    echo "Error: App not found: $APP_PATH"
    exit 1
fi

echo "=========================================="
echo "Signing macOS Application"
echo "=========================================="
echo "App: $APP_PATH"
echo "Identity: $IDENTITY"
echo ""

# Step 1: Sign nested binaries
echo "Step 1: Signing nested binaries..."
BINARY_COUNT=0
find "$APP_PATH/Contents/MacOS" -type f -perm +111 2>/dev/null | while read binary; do
    echo "  Signing: $binary"
    if ! codesign --force --sign "$IDENTITY" \
        --options runtime \
        --timestamp \
        "$binary" 2>&1; then
        echo "ERROR: Failed to sign $binary"
        exit 1
    fi
    BINARY_COUNT=$((BINARY_COUNT + 1))
done

# Step 2: Sign frameworks
echo ""
echo "Step 2: Signing frameworks..."
FRAMEWORK_COUNT=0
if [ -d "$APP_PATH/Contents/Frameworks" ]; then
    find "$APP_PATH/Contents/Frameworks" -name "*.framework" -type d | while read framework; do
        echo "  Signing: $framework"
        if ! codesign --force --sign "$IDENTITY" \
            --options runtime \
            --timestamp \
            "$framework" 2>&1; then
            echo "ERROR: Failed to sign $framework"
            exit 1
        fi
        FRAMEWORK_COUNT=$((FRAMEWORK_COUNT + 1))
    done
fi

# Step 3: Sign app bundle
echo ""
echo "Step 3: Signing app bundle..."
SIGN_CMD="codesign --force --deep --sign \"$IDENTITY\" --options runtime --timestamp"
if [ -f "$ENTITLEMENTS" ]; then
    SIGN_CMD="$SIGN_CMD --entitlements \"$ENTITLEMENTS\""
    echo "  Using entitlements: $ENTITLEMENTS"
fi

if ! eval "$SIGN_CMD \"$APP_PATH\"" 2>&1; then
    echo "ERROR: Failed to sign app bundle"
    exit 1
fi

# Step 4: Verify signing
echo ""
echo "Step 4: Verifying signatures..."
if ! codesign --verify --deep --strict --verbose "$APP_PATH" 2>&1; then
    echo "ERROR: Signature verification failed"
    exit 1
fi

# Step 5: Gatekeeper assessment
echo ""
echo "Step 5: Gatekeeper assessment..."
if ! spctl -a -vv --type execute "$APP_PATH" 2>&1; then
    echo "WARNING: Gatekeeper assessment failed (may need notarization)"
fi

echo ""
echo "=========================================="
echo "✓ Signing complete"
echo "=========================================="
