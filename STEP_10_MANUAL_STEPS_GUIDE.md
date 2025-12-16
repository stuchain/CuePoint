# Step 10: Manual Steps - Complete Guide

This guide provides detailed, step-by-step instructions for all manual steps in Step 10.

---

## Step 10.3: Obtain Certificates and Credentials

### ⚠️ macOS Signing: SKIPPED

**Decision: Skip macOS signing (no Apple Developer account)**

- **Reason**: Apple Developer account costs $99/year
- **Result**: App will build and work, but users will see "unidentified developer" warnings
- **User workaround**: Right-click → Open (first time only)
- **Workflow**: Already configured to skip signing if secrets don't exist

**Action Required**: 
- **SKIP** sections 10.3.1 and 10.3.2 (macOS certificates)
- **ONLY** configure Windows certificates (10.3.3) if you have a Windows code signing certificate
- **SKIP** all 7 macOS secrets in Step 10.4

---

### 10.3.1 macOS Certificates - ⚠️ SKIP THIS SECTION

**Status**: Skipped - Not using Apple Developer account

**You can skip this entire section.** The workflow is already configured to build unsigned macOS apps.

**⚠️ IMPORTANT CLARIFICATION:**
- **Developer ID Application** certificate is for apps distributed OUTSIDE the App Store
- You do NOT need to submit your app to the App Store
- You just need the Developer account ($99/year) to get the certificate
- This allows users to download from GitHub and run without security warnings

#### A. Developer ID Application Certificate (.p12)

**What you need:**
- An active Apple Developer account ($99/year)
- Access to a macOS machine

**Steps:**

1. **Log in to Apple Developer Portal**
   - Go to: https://developer.apple.com/account
   - Sign in with your Apple ID

2. **Create/Download Certificate**
   - Navigate to: **Certificates, Identifiers & Profiles**
   - Click **Certificates** in the left sidebar
   - Click the **+** button to create a new certificate
   - Select **Developer ID Application** (NOT "Mac App Distribution")
   - Follow the instructions to create a Certificate Signing Request (CSR)
   - Download the certificate (it will be a `.cer` file)

3. **Install Certificate in Keychain**
   - Double-click the downloaded `.cer` file
   - It will open in Keychain Access
   - Find the certificate in **login** keychain under **My Certificates**
   - Verify it shows "Developer ID Application: [Your Name]"

4. **Export as .p12 File**
   - Right-click the certificate in Keychain Access
   - Select **Export "[Certificate Name]"**
   - Choose **Personal Information Exchange (.p12)** format
   - Save it (e.g., `DeveloperID.p12`)
   - **Set a password** when prompted (remember this password!)
   - Save the password securely (you'll need it for GitHub Secrets)

5. **Base64 Encode the Certificate** (for GitHub Secrets)
   ```bash
   # On macOS or Linux:
   base64 -i DeveloperID.p12 -o DeveloperID.p12.b64
   
   # Or using openssl:
   openssl base64 -in DeveloperID.p12 -out DeveloperID.p12.b64
   ```
   
   **On Windows (PowerShell):**
   ```powershell
   $certBytes = [System.IO.File]::ReadAllBytes("DeveloperID.p12")
   $base64 = [System.Convert]::ToBase64String($certBytes)
   $base64 | Out-File -FilePath "DeveloperID.p12.b64" -Encoding ASCII
   ```
   
   - Open `DeveloperID.p12.b64` in a text editor
   - Copy the entire contents (it's one long line)
   - Save this for Step 10.4

#### B. App Store Connect API Key (.p8)

**⚠️ Note**: This is for notarization (malware scanning), NOT for App Store submission. You're still distributing outside the App Store.

**What you need:**
- Access to App Store Connect (same Apple Developer account)

**Steps:**

1. **Log in to App Store Connect**
   - Go to: https://appstoreconnect.apple.com
   - Sign in with your Apple ID

2. **Navigate to API Keys**
   - Click **Users and Access** in the top menu
   - Click **Keys** tab
   - Click the **+** button to create a new key

3. **Create API Key**
   - Enter a name (e.g., "CuePoint Notarization")
   - Select **App Manager** or **Admin** access
   - Click **Generate**
   - **IMPORTANT**: Download the `.p8` file immediately (you can only download it once!)
   - Save it securely (e.g., `AuthKey_ABC123DEF4.p8`)

4. **Record the Credentials**
   - **Issuer ID**: Shown on the Keys page (UUID format, e.g., `12345678-1234-1234-1234-123456789abc`)
   - **Key ID**: From the filename or shown in the UI (10 characters, e.g., `ABC123DEF4`)
   - **Key Contents**: Open the `.p8` file and copy its entire contents (includes `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----`)

5. **Save All Information**
   - Issuer ID: `[Your Issuer ID]`
   - Key ID: `[Your Key ID]`
   - Key contents: `[Full .p8 file contents]`
   - Save these for Step 10.4

#### C. Apple Developer Account Information

**Steps:**

1. **Get Team ID / Developer ID**
   - Go to: https://developer.apple.com/account
   - Click **Membership** in the left sidebar
   - Find **Team ID** (10-character alphanumeric, e.g., `ABC123DEF4`)
   - This is usually the same as your Developer ID
   - Save this for Step 10.4

### 10.3.2 macOS Signing: SKIPPED ✅

**If you don't want to pay for an Apple Developer account**, you can skip macOS signing:

**What this means:**
- ✅ App will still build and work
- ✅ Users can still download and run it
- ⚠️ Users will see "unidentified developer" warning
- ⚠️ Users must right-click → Open (first time only)
- ⚠️ Less professional appearance

**macOS signing is being skipped - no action needed!**

1. **Workflow Already Configured** ✅
   - The workflow (`.github/workflows/build-macos.yml`) is already set up to skip signing
   - Signing steps will automatically skip if secrets don't exist
   - No code changes needed

2. **Skip GitHub Secrets for macOS**
   - Do NOT add the 7 macOS secrets in Step 10.4
   - Only add Windows secrets (if you have a Windows certificate)

3. **What Users Will See**
   - Warning: "CuePoint.app cannot be opened because the developer cannot be verified"
   - **Workaround**: Right-click → Open → Click "Open" in the dialog
   - After first launch, it works normally

4. **Build Will Still Work**
   - App builds successfully
   - DMG is created
   - App functions normally
   - Just unsigned (no security impact, just user warnings)

**You can add signing later** if you decide to get an Apple Developer account ($99/year).

---

### 10.3.3 Windows Certificate

**What you need:**
- A code signing certificate from a Certificate Authority (CA)
- Common CAs: DigiCert, Sectigo, GlobalSign, etc.
- Cost: Typically $200-400/year (EV certificates cost more but provide better SmartScreen reputation)

**Steps:**

1. **Purchase a Code Signing Certificate**
   - Choose a Certificate Authority (DigiCert is popular)
   - Select **Code Signing Certificate** (not SSL/TLS)
   - **EV (Extended Validation) recommended** for better Windows SmartScreen reputation
   - Complete the purchase and identity verification process

2. **Receive Certificate**
   - The CA will send you the certificate file or instructions
   - You may need to install it in Windows Certificate Store first

3. **Export as .pfx File**
   
   **If certificate is in Certificate Store:**
   - Open **certmgr.msc** (Windows Certificate Manager)
   - Navigate to **Personal** → **Certificates**
   - Find your code signing certificate
   - Right-click → **All Tasks** → **Export**
   - Choose **Yes, export the private key**
   - Select **Personal Information Exchange - PKCS #12 (.PFX)**
   - Check **Include all certificates in the certification path if possible**
   - Set a password (remember this!)
   - Save as `CodeSigning.pfx`

   **If you received a .p7b or .cer file:**
   - Install it first, then export as above

4. **Base64 Encode the Certificate** (for GitHub Secrets)
   ```powershell
   # On Windows (PowerShell):
   $certBytes = [System.IO.File]::ReadAllBytes("CodeSigning.pfx")
   $base64 = [System.Convert]::ToBase64String($certBytes)
   $base64 | Out-File -FilePath "CodeSigning.pfx.b64" -Encoding ASCII
   ```
   
   **On macOS/Linux:**
   ```bash
   base64 -i CodeSigning.pfx -o CodeSigning.pfx.b64
   ```
   
   - Open `CodeSigning.pfx.b64` in a text editor
   - Copy the entire contents (one long line)
   - Save this for Step 10.4

---

## Step 10.4: Configure GitHub Secrets

### Prerequisites
- Certificates obtained (Step 10.3)
  - **Option A**: macOS + Windows certificates (if using full signing)
  - **Option B**: Windows certificate only (if skipping macOS signing)
- Base64-encoded certificate files ready
- All passwords and IDs written down

### Steps

1. **Navigate to GitHub Secrets**
   - Go to your repository on GitHub: `https://github.com/[username]/CuePoint`
   - Click **Settings** (top menu bar)
   - In the left sidebar, click **Secrets and variables** → **Actions**
   - Click **New repository secret** button

2. **Add macOS Secrets (7 total) - ⚠️ SKIP THIS SECTION**

   **Status**: macOS signing is being skipped (no Apple Developer account)
   
   **Action**: Skip all 7 macOS secrets below. Go directly to section 3 (Windows Secrets).
   
   ~~The following secrets are only needed if you have an Apple Developer account:~~

   **Secret 1: `MACOS_SIGNING_CERT_P12`**
   - **Name**: `MACOS_SIGNING_CERT_P12` (exact, case-sensitive)
   - **Value**: Paste the entire contents of `DeveloperID.p12.b64` (one long line, no line breaks)
   - Click **Add secret**

   **Secret 2: `MACOS_SIGNING_CERT_PASSWORD`**
   - **Name**: `MACOS_SIGNING_CERT_PASSWORD`
   - **Value**: The password you set when exporting the .p12 file
   - Click **Add secret**

   **Secret 3: `APPLE_DEVELOPER_ID`**
   - **Name**: `APPLE_DEVELOPER_ID`
   - **Value**: Your Team ID from Apple Developer (10 characters, e.g., `ABC123DEF4`)
   - Click **Add secret**

   **Secret 4: `APPLE_TEAM_ID`**
   - **Name**: `APPLE_TEAM_ID`
   - **Value**: Usually the same as Developer ID (10 characters)
   - Click **Add secret**

   **Secret 5: `APPLE_NOTARYTOOL_ISSUER_ID`**
   - **Name**: `APPLE_NOTARYTOOL_ISSUER_ID`
   - **Value**: The Issuer ID from App Store Connect (UUID format)
   - Click **Add secret**

   **Secret 6: `APPLE_NOTARYTOOL_KEY_ID`**
   - **Name**: `APPLE_NOTARYTOOL_KEY_ID`
   - **Value**: The Key ID from App Store Connect (10 characters)
   - Click **Add secret**

   **Secret 7: `APPLE_NOTARYTOOL_KEY`**
   - **Name**: `APPLE_NOTARYTOOL_KEY`
   - **Value**: The entire contents of your `.p8` file (include the `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----` lines)
   - Click **Add secret**

3. **Add Windows Secrets (2 total)**

   **Secret 8: `WINDOWS_CERT_PFX`**
   - **Name**: `WINDOWS_CERT_PFX` (exact, case-sensitive)
   - **Value**: Paste the entire contents of `CodeSigning.pfx.b64` (one long line, no line breaks)
   - Click **Add secret**

   **Secret 9: `WINDOWS_CERT_PASSWORD`**
   - **Name**: `WINDOWS_CERT_PASSWORD`
   - **Value**: The password you set when exporting the .pfx file
   - Click **Add secret**

4. **Verify All Secrets**
   - Go back to **Settings** → **Secrets and variables** → **Actions**
   - You should see:
     - **0 macOS secrets** (skipped - no Apple Developer account)
     - **0-2 Windows secrets** (only if you have a Windows certificate)
   - If you have no certificates at all, you'll have 0 secrets (that's fine!)
   - Secret values are masked (shown as `••••••••`)
   - Verify the names are exactly correct (case-sensitive)

---

## Step 10.5: Test Signed Builds

### Prerequisites
- Step 10.3 complete (certificates obtained)
- Step 10.4 complete (GitHub Secrets configured)

### Test macOS Build (Unsigned)

**Note**: Since macOS signing is skipped, the build will be unsigned.

1. **Create a Test Tag**
   ```bash
   git tag v1.0.0-test-unsigned
   git push origin v1.0.0-test-unsigned
   ```

2. **Monitor the Workflow**
   - Go to GitHub → **Actions** tab
   - Find the **Build macOS** workflow run
   - Click on it to see details
   - Watch for these steps:
     - ✅ Build with PyInstaller
     - ⏭️ Import signing certificate (SKIPPED - no secrets)
     - ⏭️ Sign app (SKIPPED - no secrets)
     - ✅ Create DMG
     - ⏭️ Notarize DMG (SKIPPED - no secrets)
     - ✅ Upload artifact

3. **Expected Behavior**
   - Build should complete successfully
   - Signing steps will be skipped (this is expected)
   - DMG will be created (unsigned)
   - No errors should occur

4. **Test the Unsigned DMG**
   - Download the DMG artifact from GitHub Actions
   - On macOS, try to open it
   - You should see: "CuePoint.app cannot be opened because the developer cannot be verified"
   - **Workaround**: Right-click → Open → Click "Open"
   - App should launch and work normally

### Test Windows Build

1. **Use Same Test Tag** (or create new one)
   ```bash
   git tag v1.0.0-test-signing
   git push origin v1.0.0-test-signing
   ```

2. **Monitor the Workflow**
   - Go to GitHub → **Actions** tab
   - Find the **Build Windows** workflow run
   - Click on it to see details
   - Watch for these steps:
     - ✅ Build with PyInstaller
     - ✅ Import certificate
     - ✅ Sign executable
     - ✅ Build installer
     - ✅ Sign installer
     - ✅ Upload artifact

3. **Check for Errors**
   - If **signing fails**:
     - Verify `WINDOWS_CERT_PFX` is correctly base64-encoded
     - Verify `WINDOWS_CERT_PASSWORD` is correct
     - Check certificate hasn't expired
     - Verify certificate is valid for code signing

4. **Verify Signing** (if build succeeds)
   - Download the installer artifact from GitHub Actions
   - On Windows, verify signature:
     ```powershell
     signtool verify /pa /v CuePoint-installer.exe
     ```

---

## Step 10.6: Test Release Workflow

### Prerequisites
- Step 10.5 complete (signed builds working)

### Steps

1. **Create a Test Release Tag**
   ```bash
   git tag v1.0.0-test-release
   git push origin v1.0.0-test-release
   ```

2. **Monitor Release Workflow**
   - Go to GitHub → **Actions** tab
   - Find the **Release** workflow run
   - Verify it:
     - ✅ Downloads macOS artifact
     - ✅ Downloads Windows artifact
     - ✅ Generates release notes
     - ✅ Creates GitHub Release
     - ✅ Uploads both DMG and installer

3. **Verify GitHub Release**
   - Go to GitHub → **Releases** (right sidebar or `/releases` URL)
   - Find the test release (`v1.0.0-test-release`)
   - Verify:
     - Both artifacts are attached (DMG and installer)
     - Release notes are correct
     - Version tag is correct

4. **Test Artifact Download**
   - Download the DMG (macOS) and installer (Windows)
   - Test installation:
     - **macOS**: Open DMG, drag app to Applications, launch
     - **Windows**: Run installer, verify installation works
   - Verify signatures:
     - **macOS**: Should launch without Gatekeeper warnings
     - **Windows**: Should show valid signature in Properties → Digital Signatures

5. **Clean Up Test Release** (optional)
   ```bash
   git tag -d v1.0.0-test-release
   git push origin --delete v1.0.0-test-release
   ```
   - Or delete the release on GitHub (Releases → Edit → Delete)

---

## Step 10.13: Localization & Accessibility Verification

### Prerequisites
- Built application (from Step 10.5 or 10.6)

### Localization Testing

1. **Test Default Locale (English)**
   - Launch the application
   - Verify all UI text displays correctly
   - Check for any missing translations or placeholders

2. **Test Additional Locales** (if implemented)
   - Change system locale to a supported language
   - Launch application
   - Verify translations are displayed
   - Check for text overflow or layout issues

3. **Verify Translation Files**
   - Check that translation files are included in the build
   - Verify file structure is correct

### Accessibility Testing

1. **Keyboard Navigation**
   - Launch application
   - Use **Tab** to navigate through all interactive elements
   - Verify focus indicators are visible
   - Test **Enter** and **Space** for activation
   - Verify **Escape** closes dialogs
   - Test arrow keys in lists/tables

2. **Screen Reader Compatibility** (if applicable)
   - Enable screen reader (VoiceOver on macOS, Narrator on Windows)
   - Navigate through the application
   - Verify all elements are announced correctly
   - Check that labels and descriptions are read

3. **Focus Management**
   - Open dialogs and verify focus moves to first element
   - Close dialogs and verify focus returns to previous element
   - Test modal dialogs trap focus correctly

4. **High Contrast Mode** (if applicable)
   - Enable high contrast mode in system settings
   - Launch application
   - Verify UI is still readable and functional

5. **Accessibility Shortcuts**
   - Test any keyboard shortcuts defined
   - Verify they work as expected

### Checklist
- [ ] Keyboard navigation functional
- [ ] Focus indicators visible
- [ ] Screen reader compatible (if applicable)
- [ ] Focus management correct
- [ ] High contrast mode works (if applicable)
- [ ] Accessibility shortcuts work
- [ ] No accessibility regressions

---

## Step 10.15: Post-Release Monitoring Setup

### Options for Monitoring

1. **Error Monitoring**
   - **Option A**: Use built-in error handling (already implemented)
   - **Option B**: Integrate external service (Sentry, Rollbar, etc.)
   - **Option C**: GitHub Issues for error reports

2. **Analytics** (if applicable)
   - **Option A**: No analytics (privacy-focused)
   - **Option B**: Privacy-respecting analytics (if needed)
   - **Option C**: Self-hosted analytics

3. **User Feedback Channels**
   - GitHub Issues for bug reports
   - GitHub Discussions for questions
   - Email support (if applicable)
   - Documentation site comments

### Recommended Setup

1. **GitHub Issues**
   - Already available
   - Create issue templates for:
     - Bug reports
     - Feature requests
     - Support questions

2. **Support Documentation**
   - Ensure README.md has support information
   - Create FAQ if needed
   - Document known issues

3. **Monitoring Checklist**
   - [ ] Error monitoring configured (if applicable)
   - [ ] Analytics configured (if applicable)
   - [ ] User feedback channels ready
   - [ ] Support documentation available
   - [ ] Issue tracking system ready

---

## Step 10.16: Rollback Plan Preparation

### Document Rollback Procedures

1. **Create Rollback Documentation**
   - Document how to revert a release
   - Prepare rollback scripts (if needed)
   - Document emergency contacts

2. **Rollback Scenarios**

   **Scenario A: Critical Bug**
   - Steps:
     1. Identify the issue
     2. Create hotfix branch
     3. Fix the issue
     4. Create patch release
     5. Update release notes

   **Scenario B: Security Issue**
   - Steps:
     1. Immediately remove release artifacts
     2. Notify users if necessary
     3. Create security patch
     4. Release fixed version

   **Scenario C: Update Feed Issues**
   - Steps:
     1. Fix update feed
     2. Verify feed is accessible
     3. Test update process

3. **Emergency Contacts**
   - List key personnel
   - Document escalation procedures
   - Prepare communication templates

4. **Rollback Checklist**
   - [ ] Rollback procedures documented
   - [ ] Rollback scripts prepared (if needed)
   - [ ] Emergency contacts identified
   - [ ] Communication plan prepared
   - [ ] Team trained on rollback procedures

---

## Step 10.17: Communication Preparation

### Prepare Release Announcement

1. **Announcement Content**
   - Highlight key features
   - List improvements
   - Note bug fixes
   - Include download links
   - Note any breaking changes

2. **Communication Channels**
   - GitHub Release notes (automatic)
   - Social media (if applicable)
   - Email list (if applicable)
   - Website/blog (if applicable)
   - Community forums (if applicable)

3. **Timing**
   - Plan announcement timing
   - Coordinate with team
   - Consider time zones

4. **Communication Checklist**
   - [ ] Release announcement prepared
   - [ ] Communication channels identified
   - [ ] Announcement timing planned
   - [ ] Team notified
   - [ ] Stakeholders informed (if applicable)

---

## Step 10.18: Create First Production Release

### Prerequisites
- All previous steps complete (10.1-10.17)
- All tests passing
- Ready for production release

### Steps

1. **Final Verification**
   ```bash
   # Run comprehensive checks
   python scripts/step10_release_readiness.py
   python scripts/release_readiness.py
   python scripts/validate_compliance.py
   ```

2. **Update Version** (if not already 1.0.0)
   - Edit `SRC/cuepoint/version.py`
   - Set `__version__ = "1.0.0"`
   - Commit:
     ```bash
     git add SRC/cuepoint/version.py
     git commit -m "Bump version to 1.0.0"
     git push origin main
     ```

3. **Update CHANGELOG.md**
   - Edit `CHANGELOG.md`
   - Move items from `[Unreleased]` to `[1.0.0]`
   - Add release date
   - Commit:
     ```bash
     git add CHANGELOG.md
     git commit -m "Update CHANGELOG for v1.0.0"
     git push origin main
     ```

4. **Run Final Release Readiness Check**
   ```bash
   python scripts/release_readiness.py
   ```
   - Fix any issues before proceeding

5. **Create Version Tag**
   ```bash
   git tag -a v1.0.0 -m "Release version 1.0.0"
   git push origin v1.0.0
   ```

6. **Monitor GitHub Actions**
   - Go to GitHub → **Actions** tab
   - Monitor all workflows:
     - Build macOS
     - Build Windows
     - Release
     - Release Gates (if applicable)
   - Wait for all to complete successfully

7. **Verify Release**
   - Go to GitHub → **Releases**
   - Find `v1.0.0` release
   - Verify:
     - Both artifacts attached (DMG and installer)
     - Release notes are correct
     - Version is correct

8. **Test Installation**
   - Download DMG (macOS) and installer (Windows)
   - Test on clean systems (VMs recommended)
   - Verify:
     - Installation works
     - Application launches
     - Core features work
     - Signatures are valid

9. **Announce Release**
   - Publish release announcement
   - Notify users (if applicable)
   - Update website/social media (if applicable)

10. **Post-Release Monitoring**
    - Monitor error reports
    - Monitor user feedback
    - Watch for any issues
    - Be ready to respond to problems

### Success Criteria
- ✅ All workflows complete successfully
- ✅ Release artifacts created and signed
- ✅ Release published on GitHub
- ✅ Installation tested and working
- ✅ No critical issues reported

---

## Troubleshooting

### Common Issues

**Issue: Build fails at signing step**
- Check certificate encoding (must be base64, single line)
- Verify password is correct
- Check certificate hasn't expired
- Verify certificate type is correct

**Issue: Notarization fails**
- Verify App Store Connect API key credentials
- Check API key permissions
- Review notarization logs
- Ensure hardened runtime is enabled

**Issue: Release workflow fails**
- Verify build workflows completed
- Check artifacts were uploaded
- Ensure GITHUB_TOKEN has permissions
- Review workflow logs for specific errors

**Issue: Update feed not accessible**
- Verify GitHub Pages is enabled
- Check `gh-pages` branch exists
- Verify feed URLs are correct
- Test feed accessibility

---

## Quick Reference Checklist

### Before Release
- [ ] Step 10.3: Certificates obtained
- [ ] Step 10.4: GitHub Secrets configured
- [ ] Step 10.5: Signed builds tested
- [ ] Step 10.6: Release workflow tested
- [ ] Step 10.7: Pre-release checklist complete
- [ ] Step 10.8: License compliance verified
- [ ] Step 10.9: Update feeds configured
- [ ] Step 10.10: Performance validated
- [ ] Step 10.11: Security scans pass
- [ ] Step 10.12: Documentation complete
- [ ] Step 10.13: Localization & accessibility tested
- [ ] Step 10.14: CHANGELOG updated
- [ ] Step 10.15: Monitoring setup
- [ ] Step 10.16: Rollback plan ready
- [ ] Step 10.17: Communication prepared

### Release Day
- [ ] Version updated
- [ ] CHANGELOG updated
- [ ] Final checks run
- [ ] Tag created and pushed
- [ ] Workflows monitored
- [ ] Release verified
- [ ] Installation tested
- [ ] Release announced

---

**For detailed troubleshooting, see:**
- `DOCS/DESIGNS/SHIP v1.0/10_Final_Configuration_and_Release_Readiness.md`
- `DOCS/GUIDES/GitHub_Secrets_Setup.md`
