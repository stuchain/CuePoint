#!/bin/bash
# Enhanced macOS notarization script
# Submits app/DMG for notarization, waits for approval, and staples ticket

set -e

FILE_PATH="$1"
APPLE_ID="${APPLE_NOTARYTOOL_ISSUER_ID}"
TEAM_ID="${APPLE_TEAM_ID}"
KEY_ID="${APPLE_NOTARYTOOL_KEY_ID}"
KEY="${APPLE_NOTARYTOOL_KEY}"
PROFILE="notarytool-profile"
TIMEOUT="${NOTARIZATION_TIMEOUT:-3600}"

if [ -z "$FILE_PATH" ]; then
    echo "Usage: $0 <path-to-file>"
    exit 1
fi

if [ ! -f "$FILE_PATH" ] && [ ! -d "$FILE_PATH" ]; then
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

echo "=========================================="
echo "Notarizing macOS Artifact"
echo "=========================================="
echo "File: $FILE_PATH"
echo "Profile: $PROFILE"
echo "Timeout: ${TIMEOUT}s"
echo ""

# Pre-notarization validation
echo "Step 1: Pre-notarization validation..."
if command -v python3 &> /dev/null; then
    if python3 scripts/validate_pre_notarization.py "$FILE_PATH" 2>&1; then
        echo "  ✓ Pre-notarization checks passed"
    else
        echo "  WARNING: Pre-notarization validation failed (continuing anyway)"
    fi
else
    echo "  INFO: Python not available, skipping pre-validation"
fi

# Configure notarytool
echo ""
echo "Step 2: Configuring notarytool credentials..."
if ! xcrun notarytool store-credentials \
    --apple-id "$APPLE_ID" \
    --team-id "$TEAM_ID" \
    --key-id "$KEY_ID" \
    --key "$KEY" \
    "$PROFILE" 2>&1; then
    echo "ERROR: Failed to configure notarytool credentials"
    exit 1
fi
echo "  ✓ Credentials configured"

# Submit for notarization
echo ""
echo "Step 3: Submitting for notarization..."
echo "  (This may take 5-30 minutes)"
SUBMISSION_OUTPUT=$(xcrun notarytool submit "$FILE_PATH" \
    --keychain-profile "$PROFILE" \
    --wait \
    --timeout "$TIMEOUT" 2>&1)

SUBMISSION_EXIT=$?
if [ $SUBMISSION_EXIT -ne 0 ]; then
    echo "ERROR: Notarization submission failed"
    echo "$SUBMISSION_OUTPUT"
    exit 1
fi

# Extract submission ID if available
SUBMISSION_ID=$(echo "$SUBMISSION_OUTPUT" | grep -i "id:" | head -1 | awk '{print $2}' || echo "")

if echo "$SUBMISSION_OUTPUT" | grep -qi "status: Accepted"; then
    echo "  ✓ Notarization approved"
elif echo "$SUBMISSION_OUTPUT" | grep -qi "status: Invalid"; then
    echo "ERROR: Notarization was rejected"
    if [ -n "$SUBMISSION_ID" ]; then
        echo "Retrieving notarization log..."
        xcrun notarytool log "$SUBMISSION_ID" --keychain-profile "$PROFILE" || true
    fi
    exit 1
else
    echo "  WARNING: Could not determine notarization status"
    echo "$SUBMISSION_OUTPUT"
fi

# Staple (for DMG or app)
echo ""
if [[ "$FILE_PATH" == *.dmg ]] || [[ "$FILE_PATH" == *.app ]]; then
    echo "Step 4: Stapling notarization ticket..."
    if ! xcrun stapler staple "$FILE_PATH" 2>&1; then
        echo "ERROR: Failed to staple notarization ticket"
        exit 1
    fi
    echo "  ✓ Ticket stapled"
    
    # Validate stapling
    echo ""
    echo "Step 5: Validating stapling..."
    if ! xcrun stapler validate "$FILE_PATH" 2>&1; then
        echo "ERROR: Stapling validation failed"
        exit 1
    fi
    echo "  ✓ Stapling validated"
    
    # Final Gatekeeper check
    echo ""
    echo "Step 6: Final Gatekeeper assessment..."
    if spctl -a -vv "$FILE_PATH" 2>&1; then
        echo "  ✓ Gatekeeper assessment passed"
    else
        echo "  WARNING: Gatekeeper assessment failed"
    fi
fi

echo ""
echo "=========================================="
echo "✓ Notarization complete"
echo "=========================================="
if [ -n "$SUBMISSION_ID" ]; then
    echo "Submission ID: $SUBMISSION_ID"
fi
