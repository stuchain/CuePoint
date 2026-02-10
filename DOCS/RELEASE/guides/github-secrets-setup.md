# GitHub Secrets Setup Guide

This guide provides step-by-step instructions for configuring GitHub Secrets required for automated code signing and notarization in the CuePoint build system.

## Overview

The build system requires several secrets to be configured in GitHub Actions for:
- **macOS**: Code signing and notarization
- **Windows**: Code signing

These secrets are only used when building from version tags (e.g., `v1.0.0`), not during regular development builds.

## Required Secrets

### macOS Secrets

#### 1. `MACOS_SIGNING_CERT_P12`
- **Description**: Base64-encoded macOS Developer ID Application certificate (.p12 file)
- **How to obtain**:
  1. Export your certificate from Keychain Access on macOS
  2. Base64 encode the file:
     ```bash
     base64 -i certificate.p12 -o certificate.p12.b64
     ```
  3. Copy the contents of `certificate.p12.b64`
- **Format**: Base64-encoded binary
- **Location**: Apple Developer → Certificates, Identifiers & Profiles

#### 2. `MACOS_SIGNING_CERT_PASSWORD`
- **Description**: Password for the .p12 certificate file
- **Format**: Plain text password
- **Security**: High - keep this secure

#### 3. `APPLE_DEVELOPER_ID`
- **Description**: Your Apple Developer ID (10-character alphanumeric)
- **Format**: `ABC123DEF4` (example)
- **Location**: Apple Developer → Membership
- **Note**: This is your Team ID, not your Apple ID email

#### 4. `APPLE_TEAM_ID`
- **Description**: Apple Team ID (same as Developer ID for individual accounts)
- **Format**: `ABC123DEF4` (example)
- **Location**: Apple Developer → Membership
- **Note**: Usually the same as `APPLE_DEVELOPER_ID`

#### 5. `APPLE_NOTARYTOOL_ISSUER_ID`
- **Description**: App Store Connect API Key Issuer ID (UUID format)
- **Format**: `12345678-1234-1234-1234-123456789abc`
- **How to obtain**:
  1. Go to [App Store Connect](https://appstoreconnect.apple.com)
  2. Navigate to Users and Access → Keys
  3. Create a new API key (or use existing)
  4. Copy the Issuer ID
- **Location**: App Store Connect → Users and Access → Keys

#### 6. `APPLE_NOTARYTOOL_KEY_ID`
- **Description**: App Store Connect API Key ID (10-character alphanumeric)
- **Format**: `ABC123DEF4` (example)
- **How to obtain**:
  1. Go to [App Store Connect](https://appstoreconnect.apple.com)
  2. Navigate to Users and Access → Keys
  3. Create a new API key (or use existing)
  4. Copy the Key ID
- **Location**: App Store Connect → Users and Access → Keys

#### 7. `APPLE_NOTARYTOOL_KEY`
- **Description**: App Store Connect API Key (PEM format private key)
- **Format**: PEM-encoded private key (starts with `-----BEGIN PRIVATE KEY-----`)
- **How to obtain**:
  1. Go to [App Store Connect](https://appstoreconnect.apple.com)
  2. Navigate to Users and Access → Keys
  3. Create a new API key
  4. **Download the .p8 file immediately** (you can only download it once)
  5. The contents of the .p8 file is your `APPLE_NOTARYTOOL_KEY`
- **Security**: High - this is a private key, download and store securely
- **Note**: You can only download this once when creating the key

### Windows Secrets

#### 8. `WINDOWS_CERT_PFX`
- **Description**: Base64-encoded Windows code signing certificate (.pfx file)
- **How to obtain**:
  1. Export your certificate from Windows Certificate Store or obtain from certificate authority
  2. Base64 encode the file:
     ```powershell
     $certBytes = [System.IO.File]::ReadAllBytes("certificate.pfx")
     $base64 = [System.Convert]::ToBase64String($certBytes)
     $base64 | Out-File -FilePath "certificate.pfx.b64" -Encoding ASCII
     ```
  3. Copy the contents of `certificate.pfx.b64`
- **Format**: Base64-encoded binary
- **Location**: Certificate authority or Windows Certificate Store

#### 9. `WINDOWS_CERT_PASSWORD`
- **Description**: Password for the .pfx certificate file
- **Format**: Plain text password
- **Security**: High - keep this secure

## Setup Instructions

### Step 1: Navigate to GitHub Secrets

1. Go to your repository on GitHub
2. Click **Settings** (top menu)
3. In the left sidebar, click **Secrets and variables** → **Actions**
4. Click **New repository secret**

### Step 2: Add Each Secret

For each secret listed above:

1. **Name**: Enter the exact secret name (case-sensitive)
2. **Secret**: Paste the secret value
3. **Add secret**: Click the button

**Important Notes**:
- Secret names are case-sensitive
- For base64-encoded certificates, paste the entire base64 string (no line breaks)
- For PEM keys, include the full key including `-----BEGIN` and `-----END` lines

### Step 3: Verify Secrets

After adding all secrets, verify they're configured:

1. Go to **Settings** → **Secrets and variables** → **Actions**
2. You should see all 9 secrets listed
3. Secret values are masked (shown as `••••••••`)

## Testing Secrets

### Test macOS Build

1. Create a test tag:
   ```bash
   git tag v1.0.0-test
   git push origin v1.0.0-test
   ```

2. Check the GitHub Actions workflow:
   - Go to **Actions** tab
   - Find the "Build macOS" workflow run
   - Verify it completes successfully

3. Check for errors:
   - If signing fails, verify certificate and password
   - If notarization fails, verify App Store Connect API key credentials

### Test Windows Build

1. Create a test tag:
   ```bash
   git tag v1.0.0-test
   git push origin v1.0.0-test
   ```

2. Check the GitHub Actions workflow:
   - Go to **Actions** tab
   - Find the "Build Windows" workflow run
   - Verify it completes successfully

3. Check for errors:
   - If signing fails, verify certificate and password
   - Verify signtool is available in the Windows runner

## Troubleshooting

### macOS Issues

**Error: "No signing certificate found"**
- Verify `MACOS_SIGNING_CERT_P12` is correctly base64-encoded
- Verify `MACOS_SIGNING_CERT_PASSWORD` is correct
- Check certificate hasn't expired

**Error: "Notarization failed"**
- Verify all App Store Connect API key credentials are correct
- Check API key has "App Manager" or "Admin" role
- Verify API key hasn't been revoked

**Error: "Team ID mismatch"**
- Verify `APPLE_TEAM_ID` matches your Apple Developer account
- Check certificate was issued to the correct team

### Windows Issues

**Error: "Certificate import failed"**
- Verify `WINDOWS_CERT_PFX` is correctly base64-encoded
- Verify `WINDOWS_CERT_PASSWORD` is correct
- Check certificate hasn't expired

**Error: "signtool not found"**
- This should be automatically available in GitHub Actions Windows runners
- If issue persists, check workflow file

**Error: "Signing failed"**
- Verify certificate is valid for code signing
- Check certificate hasn't been revoked
- Verify timestamp server is accessible

## Security Best Practices

1. **Never commit secrets to the repository**
   - Secrets should only be in GitHub Secrets
   - Don't include them in code, config files, or documentation

2. **Rotate secrets regularly**
   - Certificates: Before expiry (30 days before)
   - API keys: Every 90 days (recommended)
   - Passwords: If compromised

3. **Limit access**
   - Only repository admins should have access to secrets
   - Review who has admin access regularly

4. **Monitor usage**
   - Check GitHub Actions logs for secret usage
   - Alert on unusual access patterns

5. **Backup secrets securely**
   - Keep encrypted backups of certificates and keys
   - Store backups in secure location (password manager, encrypted storage)

## Secret Rotation

When rotating secrets:

1. **Generate new secret** (certificate, API key, etc.)
2. **Test new secret** in a test environment or with a test tag
3. **Update secret** in GitHub Secrets
4. **Verify build** with new secret
5. **Archive old secret** for 30 days (for rollback)
6. **Delete old secret** after verification period

## Additional Resources

- [GitHub Secrets Documentation](https://docs.github.com/en/actions/security-guides/encrypted-secrets)
- [Apple Code Signing Guide](https://developer.apple.com/documentation/security)
- [App Store Connect API Keys](https://developer.apple.com/documentation/appstoreconnectapi/creating_api_keys_for_app_store_connect_api)
- [Windows Code Signing](https://docs.microsoft.com/en-us/windows/win32/win_cert/code-signing)

## Quick Reference Checklist

- [ ] `MACOS_SIGNING_CERT_P12` - Base64-encoded .p12 certificate
- [ ] `MACOS_SIGNING_CERT_PASSWORD` - Certificate password
- [ ] `APPLE_DEVELOPER_ID` - Developer ID (10 chars)
- [ ] `APPLE_TEAM_ID` - Team ID (10 chars)
- [ ] `APPLE_NOTARYTOOL_ISSUER_ID` - API key issuer ID (UUID)
- [ ] `APPLE_NOTARYTOOL_KEY_ID` - API key ID (10 chars)
- [ ] `APPLE_NOTARYTOOL_KEY` - API key private key (PEM)
- [ ] `WINDOWS_CERT_PFX` - Base64-encoded .pfx certificate
- [ ] `WINDOWS_CERT_PASSWORD` - Certificate password

## Support

If you encounter issues:
1. Check the troubleshooting section above
2. Review GitHub Actions workflow logs
3. Verify all secrets are correctly formatted
4. Test with a test tag before using for production releases

