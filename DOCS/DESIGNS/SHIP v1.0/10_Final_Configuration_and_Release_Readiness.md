## Step 10: Final Configuration & Release Readiness (Ship v1.0)

**Implementation Order**: This is the **tenth and final step** - configure secrets, test workflows, and prepare for first release.

### Prerequisites

**Before starting Step 10, ensure Steps 1-9 are complete:**
- ✅ Step 1: Product Requirements & Definition
- ✅ Step 2: Build System & Release Pipeline
- ✅ Step 3: macOS Packaging, Signing & Notarization
- ✅ Step 4: Windows Packaging & Signing
- ✅ Step 5: Auto-Update System
- ✅ Step 6: Runtime Operational Design
- ✅ Step 7: QA Testing and Release Gates
- ✅ Step 8: Security, Privacy and Compliance
- ✅ Step 9: UX Polish, Accessibility and Localization

**Why this order matters:**
- Steps 3-4 refine packaging requirements that may affect build scripts
- Steps 5-9 ensure the app is feature-complete and ready for release
- Step 10 configures the final release infrastructure

### Step 10.1: Goals

**10.1.1 Primary Goals**
- Configure all required secrets and certificates for code signing
- Test build workflows end-to-end
- Verify signing and notarization processes
- Prepare for first production release

**10.1.2 Definition of "Success"**
- All GitHub Secrets configured correctly
- Test builds complete successfully on both platforms
- Signed and notarized artifacts are created
- Release workflow publishes artifacts to GitHub Releases
- Ready to create first production release

### Step 10.2: Test Build System (Without Secrets)

**10.2.1 Local Build Testing**

Before configuring secrets, verify the build system works:

```bash
# Set build info
python scripts/set_build_info.py

# Build with PyInstaller (local test)
python scripts/build_pyinstaller.py
```

**Expected Results:**
- Build completes without errors
- Artifacts are created in `dist/` directory
- Version information is embedded correctly

**10.2.2 CI Workflow Testing (No Secrets Required)**

Test the CI workflows without signing:

1. **Push to GitHub** to trigger test workflow:
   ```bash
   git push origin main
   ```

2. **Verify test workflow**:
   - Go to GitHub → Actions tab
   - Verify "Test" workflow runs successfully
   - Check that tests pass on both macOS and Windows

**10.2.3 Build Workflow Testing (Unsigned Builds)**

Test build workflows without secrets (builds will be unsigned):

1. **Create a test tag**:
   ```bash
   git tag v1.0.0-test
   git push origin v1.0.0-test
   ```

2. **Verify build workflows**:
   - Check "Build macOS" workflow completes
   - Check "Build Windows" workflow completes
   - Artifacts should be created (unsigned)

**Note**: Builds will fail at signing steps if secrets aren't configured, but you can verify the build process works up to that point.

### Step 10.3: Obtain Certificates and Credentials

**10.3.1 macOS Certificates and Credentials**

**Required:**
1. **Developer ID Application Certificate** (.p12 file)
   - Location: Apple Developer → Certificates, Identifiers & Profiles
   - Type: Developer ID Application
   - Export from Keychain Access on macOS

2. **App Store Connect API Key**
   - Location: App Store Connect → Users and Access → Keys
   - Create new API key
   - Download .p8 file immediately (can only download once)
   - Note: Issuer ID, Key ID, and .p8 file contents

3. **Apple Developer Account Information**
   - Team ID (10-character alphanumeric)
   - Developer ID (usually same as Team ID)

**10.3.2 Windows Certificate**

**Required:**
1. **Code Signing Certificate** (.pfx file)
   - Obtain from certificate authority (e.g., DigiCert, Sectigo)
   - Type: Code Signing Certificate
   - EV certificate recommended for better SmartScreen reputation
   - Export as .pfx with password

**10.3.3 Certificate Preparation**

**macOS Certificate Encoding:**
```bash
# Base64 encode the .p12 certificate
base64 -i certificate.p12 -o certificate.p12.b64
# Copy contents of certificate.p12.b64
```

**Windows Certificate Encoding:**
```powershell
# Base64 encode the .pfx certificate
$certBytes = [System.IO.File]::ReadAllBytes("certificate.pfx")
$base64 = [System.Convert]::ToBase64String($certBytes)
$base64 | Out-File -FilePath "certificate.pfx.b64" -Encoding ASCII
# Copy contents of certificate.pfx.b64
```

### Step 10.4: Configure GitHub Secrets

**10.4.1 Navigate to GitHub Secrets**

1. Go to your repository on GitHub
2. Click **Settings** (top menu)
3. In the left sidebar, click **Secrets and variables** → **Actions**
4. Click **New repository secret**

**10.4.2 macOS Secrets (7 required)**

Add each secret with exact name (case-sensitive):

1. **`MACOS_SIGNING_CERT_P12`**
   - Value: Base64-encoded contents of .p12 certificate file
   - Format: Single line, no line breaks

2. **`MACOS_SIGNING_CERT_PASSWORD`**
   - Value: Password used when exporting .p12 certificate
   - Format: Plain text

3. **`APPLE_DEVELOPER_ID`**
   - Value: Your Apple Developer ID (10-character alphanumeric)
   - Format: `ABC123DEF4` (example)
   - Location: Apple Developer → Membership

4. **`APPLE_TEAM_ID`**
   - Value: Apple Team ID (usually same as Developer ID)
   - Format: `ABC123DEF4` (example)
   - Location: Apple Developer → Membership

5. **`APPLE_NOTARYTOOL_ISSUER_ID`**
   - Value: App Store Connect API Key Issuer ID
   - Format: UUID (e.g., `12345678-1234-1234-1234-123456789abc`)
   - Location: App Store Connect → Users and Access → Keys

6. **`APPLE_NOTARYTOOL_KEY_ID`**
   - Value: App Store Connect API Key ID
   - Format: 10-character alphanumeric (e.g., `ABC123DEF4`)
   - Location: App Store Connect → Users and Access → Keys

7. **`APPLE_NOTARYTOOL_KEY`**
   - Value: Contents of .p8 file (PEM format private key)
   - Format: Full key including `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----`
   - Location: Downloaded from App Store Connect when creating API key

**10.4.3 Windows Secrets (2 required)**

1. **`WINDOWS_CERT_PFX`**
   - Value: Base64-encoded contents of .pfx certificate file
   - Format: Single line, no line breaks

2. **`WINDOWS_CERT_PASSWORD`**
   - Value: Password used when exporting .pfx certificate
   - Format: Plain text

**10.4.4 Verify Secrets Configuration**

After adding all secrets:
1. Go to **Settings** → **Secrets and variables** → **Actions**
2. Verify all 9 secrets are listed:
   - 7 macOS secrets
   - 2 Windows secrets
3. Secret values are masked (shown as `••••••••`)

**Detailed Instructions**: See `DOCS/GUIDES/GitHub_Secrets_Setup.md` for step-by-step instructions.

### Step 10.5: Test Signed Builds

**10.5.1 Test macOS Build with Signing**

1. **Create a test tag**:
   ```bash
   git tag v1.0.0-test-signing
   git push origin v1.0.0-test-signing
   ```

2. **Monitor the workflow**:
   - Go to GitHub → Actions tab
   - Find "Build macOS" workflow run
   - Verify each step completes:
     - ✅ Build with PyInstaller
     - ✅ Import signing certificate
     - ✅ Sign app
     - ✅ Create DMG
     - ✅ Notarize DMG
     - ✅ Upload artifact

3. **Check for errors**:
   - If signing fails: verify certificate and password
   - If notarization fails: verify App Store Connect API key credentials
   - Review workflow logs for specific error messages

**10.5.2 Test Windows Build with Signing**

1. **Same test tag triggers both workflows** (or create separate tag):
   ```bash
   git tag v1.0.0-test-signing
   git push origin v1.0.0-test-signing
   ```

2. **Monitor the workflow**:
   - Go to GitHub → Actions tab
   - Find "Build Windows" workflow run
   - Verify each step completes:
     - ✅ Build with PyInstaller
     - ✅ Import certificate
     - ✅ Sign executable
     - ✅ Build installer
     - ✅ Sign installer
     - ✅ Upload artifact

3. **Check for errors**:
   - If signing fails: verify certificate and password
   - Review workflow logs for specific error messages

**10.5.3 Verify Signing**

**macOS Verification:**
```bash
# Download artifact from GitHub Actions
# Verify signature
codesign --verify --deep --strict --verbose=2 CuePoint.app
spctl -a -vv --type execute CuePoint.app

# Verify notarization
spctl -a -vv CuePoint.dmg
```

**Windows Verification:**
```powershell
# Download artifact from GitHub Actions
# Verify signature
signtool verify /pa /v CuePoint.exe
```

### Step 10.6: Test Release Workflow

**10.6.1 Test Release Creation**

1. **Create a test release tag**:
   ```bash
   git tag v1.0.0-test-release
   git push origin v1.0.0-test-release
   ```

2. **Monitor release workflow**:
   - Go to GitHub → Actions tab
   - Find "Release" workflow run
   - Verify:
     - ✅ Downloads macOS artifact
     - ✅ Downloads Windows artifact
     - ✅ Generates release notes
     - ✅ Creates GitHub Release
     - ✅ Uploads both DMG and installer

3. **Verify GitHub Release**:
   - Go to GitHub → Releases
   - Find the test release
   - Verify both artifacts are attached
   - Verify release notes are correct

**10.6.2 Test Artifact Download**

1. **Download artifacts** from the test release
2. **Test installation**:
   - macOS: Open DMG, drag app to Applications, launch
   - Windows: Run installer, verify installation works
3. **Verify signatures**:
   - macOS: Should launch without Gatekeeper warnings
   - Windows: Should show valid signature in Properties

### Step 10.7: Final Pre-Release Checklist

**10.7.1 Build System Checklist**

- [ ] All scripts tested and working
- [ ] All workflows created and validated
- [ ] GitHub Secrets configured (9 secrets total)
- [ ] Test build completes successfully (unsigned)
- [ ] Signed macOS build completes successfully
- [ ] Signed Windows build completes successfully
- [ ] Release workflow creates GitHub release
- [ ] Artifacts download and install correctly

**10.7.2 Application Checklist**

- [ ] All features from Steps 1-9 implemented
- [ ] Version number is correct in `SRC/cuepoint/version.py`
- [ ] Application metadata is correct (name, bundle ID, etc.)
- [ ] Icons and branding are in place
- [ ] Documentation is up to date

**10.7.3 Security Checklist**

- [ ] Certificates are valid and not expired
- [ ] Secrets are stored securely (GitHub Secrets only)
- [ ] No secrets committed to repository
- [ ] Signing and notarization work correctly
- [ ] Artifacts pass security scans

**10.7.4 Release Readiness Checklist**

- [ ] CHANGELOG.md is updated
- [ ] Release notes template is ready
- [ ] Update feed generation works (if Step 5 implemented)
- [ ] Test release created and verified
- [ ] Team is notified of release process

### Step 10.8: Create First Production Release

**10.8.1 Pre-Release Steps**

1. **Update version**:
   - Update `SRC/cuepoint/version.py` with final version (e.g., `1.0.0`)
   - Commit and push to main branch

2. **Update CHANGELOG**:
   - Document all changes since last release
   - Commit and push

3. **Final testing**:
   - Run full test suite
   - Verify all workflows pass
   - Test on both platforms locally if possible

**10.8.2 Create Release Tag**

1. **Create version tag**:
   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```

2. **Monitor workflows**:
   - Watch GitHub Actions for all three workflows:
     - Build macOS
     - Build Windows
     - Release

3. **Verify release**:
   - Check GitHub Releases page
   - Verify artifacts are attached
   - Verify release notes are correct
   - Download and test artifacts

**10.8.3 Post-Release Steps**

1. **Verify release**:
   - Download DMG and installer
   - Test installation on clean systems
   - Verify signatures and notarization
   - Test application functionality

2. **Update documentation**:
   - Update README with release information
   - Update installation instructions if needed

3. **Announce release**:
   - Notify users (if applicable)
   - Update website/social media (if applicable)

### Step 10.9: Troubleshooting

**10.9.1 Common Issues**

**Build Fails:**
- Check GitHub Actions logs for specific errors
- Verify all dependencies are installed
- Check PyInstaller spec file is correct

**Signing Fails (macOS):**
- Verify `MACOS_SIGNING_CERT_P12` is correctly base64-encoded
- Verify `MACOS_SIGNING_CERT_PASSWORD` is correct
- Check certificate hasn't expired
- Verify certificate is Developer ID Application type

**Notarization Fails (macOS):**
- Verify all App Store Connect API key credentials are correct
- Check API key has proper permissions
- Review notarization logs: `xcrun notarytool log <submission-id>`
- Ensure hardened runtime is enabled

**Signing Fails (Windows):**
- Verify `WINDOWS_CERT_PFX` is correctly base64-encoded
- Verify `WINDOWS_CERT_PASSWORD` is correct
- Check certificate hasn't expired
- Verify certificate is valid for code signing

**Release Workflow Fails:**
- Verify build workflows completed successfully
- Check artifacts were uploaded
- Ensure GITHUB_TOKEN has release creation permissions
- Check artifact download step for errors

**10.9.2 Getting Help**

1. Review workflow logs in GitHub Actions
2. Check `DOCS/GUIDES/GitHub_Secrets_Setup.md` for detailed instructions
3. Review `DOCS/GUIDES/Build_System_Next_Steps.md` for troubleshooting
4. Check design documents for Steps 2-4 for build system details

### Step 10.10: Success Criteria

**Step 10 is complete when:**

- ✅ All GitHub Secrets configured correctly
- ✅ Test builds complete successfully (unsigned)
- ✅ Signed builds complete successfully on both platforms
- ✅ Release workflow creates GitHub release
- ✅ Artifacts are signed and notarized correctly
- ✅ Test release verified and working
- ✅ Ready to create first production release

### Next Steps After Step 10

Once Step 10 is complete:
1. **Create first production release** (v1.0.0)
2. **Monitor release** for any issues
3. **Iterate on improvements** based on feedback
4. **Plan next release** (v1.1.0, etc.)

### References

- **GitHub Secrets Setup**: `DOCS/GUIDES/GitHub_Secrets_Setup.md`
- **Build System Next Steps**: `DOCS/GUIDES/Build_System_Next_Steps.md`
- **Step 2**: Build System & Release Pipeline
- **Step 3**: macOS Packaging, Signing & Notarization
- **Step 4**: Windows Packaging & Signing

