# Making macOS Signing Optional

This guide explains how to modify the build workflow to make macOS signing optional, so you can build and release without an Apple Developer account.

## Why Skip Signing?

- **Cost**: Apple Developer account costs $99/year
- **Personal projects**: May not need professional signing
- **Open source**: Users can still run unsigned apps

## Trade-offs

### ✅ Pros of Skipping Signing:
- No cost
- App still works perfectly
- Users can still download and run

### ⚠️ Cons of Skipping Signing:
- Users see "unidentified developer" warning
- Users must right-click → Open (first time)
- Less professional appearance
- macOS may quarantine the app

## How to Make Signing Optional

### Step 1: Modify `.github/workflows/build-macos.yml`

Update the signing steps to check if secrets exist:

```yaml
      - name: Import signing certificate
        if: startsWith(github.ref, 'refs/tags/v') && secrets.MACOS_SIGNING_CERT_P12 != ''
        env:
          MACOS_CERT_P12: ${{ secrets.MACOS_SIGNING_CERT_P12 }}
          MACOS_CERT_PASSWORD: ${{ secrets.MACOS_SIGNING_CERT_PASSWORD }}
        run: |
          # ... existing code ...
      
      - name: Sign app
        if: startsWith(github.ref, 'refs/tags/v') && secrets.APPLE_DEVELOPER_ID != ''
        env:
          APPLE_DEVELOPER_ID: ${{ secrets.APPLE_DEVELOPER_ID }}
        run: |
          bash scripts/sign_macos.sh dist/CuePoint.app
      
      - name: Create DMG
        if: startsWith(github.ref, 'refs/tags/v')
        run: |
          # ... existing code ...
      
      - name: Notarize DMG
        if: startsWith(github.ref, 'refs/tags/v') && secrets.APPLE_NOTARYTOOL_ISSUER_ID != ''
        env:
          APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
          APPLE_NOTARYTOOL_ISSUER_ID: ${{ secrets.APPLE_NOTARYTOOL_ISSUER_ID }}
          APPLE_NOTARYTOOL_KEY_ID: ${{ secrets.APPLE_NOTARYTOOL_KEY_ID }}
          APPLE_NOTARYTOOL_KEY: ${{ secrets.APPLE_NOTARYTOOL_KEY }}
        run: |
          # ... existing code ...
```

### Step 2: Don't Add macOS Secrets

When configuring GitHub Secrets (Step 10.4):
- **Skip** all 7 macOS secrets
- **Only add** the 2 Windows secrets (if you have a Windows certificate)

### Step 3: Test the Build

1. Create a test tag:
   ```bash
   git tag v1.0.0-test-unsigned
   git push origin v1.0.0-test-unsigned
   ```

2. Monitor the workflow:
   - Signing steps should be skipped
   - Build should complete successfully
   - DMG should be created (unsigned)

3. Test the DMG:
   - Download from GitHub Actions artifacts
   - Try to open it
   - You should see the warning
   - Right-click → Open to bypass

## User Instructions (for Unsigned Apps)

If you release an unsigned app, provide these instructions to users:

### macOS Users:

1. **Download the DMG** from GitHub Releases

2. **Open the DMG** (you may see a warning)

3. **If you see "CuePoint.app cannot be opened":**
   - **Right-click** on `CuePoint.app`
   - Select **Open**
   - Click **Open** in the dialog
   - The app will launch and work normally

4. **Drag to Applications** folder

5. **First Launch:**
   - You may need to right-click → Open again
   - After first launch, it will work normally

### Alternative: Remove Quarantine Attribute

Users can also remove the quarantine attribute via Terminal:

```bash
xattr -d com.apple.quarantine /Applications/CuePoint.app
```

## Adding Signing Later

If you decide to get an Apple Developer account later:

1. Get the Developer account ($99/year)
2. Follow Step 10.3.1 to get certificates
3. Add the 7 macOS secrets to GitHub
4. The workflow will automatically start signing (no code changes needed)

## Summary

- **No Developer Account**: Skip macOS secrets, modify workflow, users see warnings
- **With Developer Account**: Add all secrets, full signing, no user warnings
- **You can switch anytime**: Just add/remove secrets
