#!/bin/bash
# Import macOS signing certificate
# Used in CI to import certificate from GitHub Secrets

set -e

CERT_P12="${MACOS_SIGNING_CERT_P12}"
CERT_PASSWORD="${MACOS_SIGNING_CERT_PASSWORD}"
KEYCHAIN="build.keychain"
KEYCHAIN_PASSWORD=""

if [ -z "$CERT_P12" ] || [ -z "$CERT_PASSWORD" ]; then
    echo "ERROR: Certificate or password not set"
    echo "Required environment variables:"
    echo "  MACOS_SIGNING_CERT_P12"
    echo "  MACOS_SIGNING_CERT_PASSWORD"
    exit 1
fi

echo "Creating keychain..."
security create-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN"
security default-keychain -s "$KEYCHAIN"
security unlock-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN"
security set-keychain-settings -t 3600 -u "$KEYCHAIN"

echo "Importing certificate..."
echo "$CERT_P12" | base64 --decode > cert.p12
security import cert.p12 -k "$KEYCHAIN" -P "$CERT_PASSWORD" -T /usr/bin/codesign
security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$KEYCHAIN_PASSWORD" "$KEYCHAIN"

echo "Cleaning up..."
rm -f cert.p12

echo "Certificate imported successfully"
