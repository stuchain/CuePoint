## Step 4: Windows Packaging & Signing (Ship v1.0)

**Implementation Order**: This is the **fourth step** - depends on Step 2 (Build System), can be parallel with Step 3.

### Step 4.1: Goals

**4.1.1 Primary Goals**
- Clean Windows installer UX.
- Signed binaries to avoid SmartScreen warnings as much as possible.
- Upgrade/uninstall support.

**4.1.2 Definition of "Success"**
- Fresh Windows 10/11 machine:
  - user downloads installer
  - installer runs without scary warnings as much as practical (signing)
  - app launches and can complete a run
  - upgrade from vX.Y.Z → vX.Y.(Z+1) preserves settings/history

### Step 4.2: Build Output

**4.2.1 Executable**
- `CuePoint.exe` (PyInstaller)

**4.2.2 Installer Options**
- Installer:
  - Prefer **NSIS** for v1.0 (simple + reliable)
  - Optionally WiX for enterprise MSI

**4.2.3 Installer Choice Matrix (NSIS vs WiX)**
- **NSIS**:
  - Pros: simpler, fewer moving parts, good for indie apps
  - Cons: less enterprise-friendly than MSI
- **WiX/MSI**:
  - Pros: enterprise deployment, Group Policy friendliness
  - Cons: higher complexity

Recommendation for v1.0: **NSIS** (switch to WiX later if needed).

### Step 4.3: App Identity

**4.3.1 App Metadata**
- Product name: CuePoint
- Publisher: Stuchain (example)
- Version: `X.Y.Z` in file metadata and installer metadata.

**4.3.2 Install Scope Strategy**
Pick one and be consistent:
- **Per-user install** (recommended for v1.0):
  - install to `%LOCALAPPDATA%\\CuePoint`
  - avoids admin prompts
  - easier updates
- **Per-machine install**:
  - install to `Program Files`
  - needs admin privileges
  - can complicate auto-updates

Recommendation for v1.0: **per-user**.

### Step 4.4: Signing

**4.4.1 Signing Process**
1) Sign the main exe:
   - `signtool sign /fd SHA256 /tr <timestamp_url> /td SHA256 CuePoint.exe`
2) Sign installer exe/msi:
   - same command
3) Verify signature:
   - `signtool verify /pa /v CuePoint.exe`

**4.4.2 SmartScreen Mitigation**
- SmartScreen reputation improves over time for a consistent signing cert.
- EV cert improves initial trust but is more expensive.
- Ensure you timestamp signatures so they remain valid after cert expiry.

### Step 4.5: Installer Behavior

**4.5.1 Install Location**
- Install location: `%LOCALAPPDATA%\\CuePoint` (user install) for fewer admin prompts in v1.0.
- Start menu shortcut + optional desktop shortcut.
- Uninstaller entry in "Add/Remove Programs".
- Preserve user data/config across upgrades.

**4.5.2 Upgrade Behavior Requirements**
- Installer should:
  - close running app (prompt user) or require user to close it
  - replace binaries
  - keep `%APPDATA%` / `%LOCALAPPDATA%` config and caches intact

**4.5.3 Data Locations (Windows Conventions)**
Use platform standard locations:
- Config: `%APPDATA%\\CuePoint`
- Cache: `%LOCALAPPDATA%\\CuePoint\\Cache`
- Logs: `%LOCALAPPDATA%\\CuePoint\\Logs`
- Exports: `Documents\\CuePoint` by default

### Step 4.6: Update Compatibility

**4.6.1 Update Requirements**
If using WinSparkle:
- Host update feed (appcast) + signed update packages.
- Ensure upgrade flow doesn't require manual uninstall.

**4.6.2 Update Model (v1.0)**
Recommended: **installer-based updates**
- WinSparkle prompts user, downloads the signed installer, runs it.
- Avoids complex in-place patching for v1.0.

### Step 4.7: Common Pitfalls

**4.7.1 Technical Pitfalls**
- Antivirus false positives on unsigned PyInstaller bundles.
- Missing VC runtime dependencies (bundle where needed).
- Writing into Program Files without admin handling.

**4.7.2 Hardening Checklist**
- Run Windows Defender scan on release artifacts.
- Sign both the main exe and installer.
- Avoid bundling unnecessary binaries to reduce false positives.
