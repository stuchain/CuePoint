## Step 3: macOS Packaging, Signing & Notarization (Ship v1.0)

**Implementation Order**: This is the **third step** - depends on Step 2 (Build System).

### Step 3.1: Goals

**3.1.1 Primary Goals**
- User can download and run without Gatekeeper warnings.
- App is properly signed, notarized, and stapled.
- Consistent bundle metadata (name, version, identifiers).

**3.1.2 Definition of "Success"**
- On a fresh macOS machine:
  - user downloads DMG
  - drags app to Applications
  - launches without "unidentified developer" warning
  - update mechanism works (if enabled)

### Step 3.2: Build Output

**3.2.1 App Bundle**
- `CuePoint.app` (PyInstaller one-folder / one-file app bundle)

**3.2.2 Distribution Format**
- `CuePoint.dmg` containing the app and Applications shortcut

**3.2.3 Recommended DMG Layout**
- Left: `CuePoint.app`
- Right: `/Applications` symlink
- Background: branded image
- Window sizing and icon positions fixed (polished install UX)

### Step 3.3: Bundle Identity

**3.3.1 Bundle Configuration**
- Bundle ID: `com.stuchain.cuepoint` (example)
- Team ID: from Apple Developer account
- CFBundleShortVersionString: `X.Y.Z`
- CFBundleVersion: build number (e.g., CI run number)

**3.3.2 Hardened Runtime & Entitlements**
- Notarized apps should enable hardened runtime.
- Typical entitlements (tighten as much as possible):
  - No special entitlements by default.
  - Add only if required:
    - network client (usually implicit)
    - file access via user-selected dialogs (no entitlement needed)
    - if using embedded browser/automation, review requirements carefully
- Key principle: **minimal entitlements** → fewer notarization issues and better security posture.

### Step 3.4: Signing Steps

**3.4.1 Signing Process**
1) Build `.app` with PyInstaller.
2) Sign nested frameworks/binaries first (PyInstaller + Qt bundles include many).
3) Sign the `.app` bundle:
   - `codesign --deep` is not enough alone; prefer explicit signing of nested items.
4) Verify:
   - `codesign --verify --deep --strict CuePoint.app`
   - `spctl -a -vv CuePoint.app`

**3.4.2 Concrete Signing Recipe (CI-friendly)**
1) Import Developer ID cert into a temporary keychain.
2) Sign nested items:
   - Qt frameworks under `CuePoint.app/Contents/Frameworks`
   - embedded `.dylib` and helper binaries
3) Sign the main executable and the app bundle.

Example (conceptual):
- `codesign --force --options runtime --timestamp --sign "Developer ID Application: ..." <path>`
- Use `--entitlements` only if necessary.

Verify:
- `codesign --verify --deep --strict --verbose=2 CuePoint.app`
- `spctl -a -vv --type execute CuePoint.app`

### Step 3.5: Notarization Steps

**3.5.1 Notarization Process**
1) Zip the app or submit the DMG to notarization:
   - preferred: notarize the `.dmg`
2) Submit:
   - `xcrun notarytool submit CuePoint.dmg --keychain-profile <profile> --wait`
3) Staple:
   - `xcrun stapler staple CuePoint.dmg`
   - optionally also staple `.app`
4) Validate:
   - `spctl -a -vv CuePoint.dmg`

**3.5.2 Notarization Troubleshooting Checklist**
- If notarization fails:
  - inspect the notary log output
  - common causes:
    - unsigned nested framework
    - missing hardened runtime
    - invalid bundle structure
    - disallowed entitlements
- Tools:
  - `xcrun notarytool log <submission-id>`
  - `codesign -dv --verbose=4 CuePoint.app`

### Step 3.6: Runtime Requirements

**3.6.1 Architecture Requirements**
- Ensure embedded Qt frameworks match target architecture.
- If shipping universal2:
  - build universal2 or merge arm64/x64 builds carefully and re-sign.

**3.6.2 Architecture Strategy**
Pick one:
- **Universal2** (recommended for "professional"): one DMG supports Intel + Apple Silicon.
- **Two builds**: publish `-arm64` and `-x64` separately (simpler build pipeline, slightly worse UX).

Universal2 notes:
- all nested frameworks and binaries must be universal too, or you must bundle architecture-specific builds.

### Step 3.7: Update Compatibility

**3.7.1 Update Requirements**
If using Sparkle/WinSparkle-style updates:
- Keep stable bundle ID.
- Ensure updates are signed and delivered via a signed appcast.
- Ensure the update mechanism validates signatures.

**3.7.2 Gatekeeper + Updates**
- Updates must preserve signing identity and hardened runtime.
- Sparkle update packages should be signed and validated by Sparkle.

### Step 3.8: Common Pitfalls

**3.8.1 Technical Pitfalls**
- Missing hardened runtime entitlements.
- Unsigned nested libs (Qt frameworks).
- Not stapling notarization ticket to DMG.
- Architecture mismatch (Intel vs Apple Silicon).

**3.8.2 Operational "Gotchas"**
- If you run from a DMG without dragging to Applications, some update flows may refuse to run.
- Ensure app writes to `Application Support` / `Caches`, not inside the `.app` bundle.
