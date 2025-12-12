## 4. Windows Packaging & Signing (Ship v1.0)

### 4.1 Goals
- Clean Windows installer UX.
- Signed binaries to avoid SmartScreen warnings as much as possible.
- Upgrade/uninstall support.

### 4.1.1 Definition of “success”
- Fresh Windows 10/11 machine:
  - user downloads installer
  - installer runs without scary warnings as much as practical (signing)
  - app launches and can complete a run
  - upgrade from vX.Y.Z → vX.Y.(Z+1) preserves settings/history

### 4.2 Build output
- `CuePoint.exe` (PyInstaller)
- Installer:
  - Prefer **NSIS** for v1.0 (simple + reliable)
  - Optionally WiX for enterprise MSI

### 4.2.1 Installer choice matrix (NSIS vs WiX)
- **NSIS**:
  - Pros: simpler, fewer moving parts, good for indie apps
  - Cons: less enterprise-friendly than MSI
- **WiX/MSI**:
  - Pros: enterprise deployment, Group Policy friendliness
  - Cons: higher complexity

Recommendation for v1.0: **NSIS** (switch to WiX later if needed).

### 4.3 App identity
- Product name: CuePoint
- Publisher: Stuchain (example)
- Version: `X.Y.Z` in file metadata and installer metadata.

### 4.3.1 Install scope strategy
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

### 4.4 Signing
1) Sign the main exe:
   - `signtool sign /fd SHA256 /tr <timestamp_url> /td SHA256 CuePoint.exe`
2) Sign installer exe/msi:
   - same command
3) Verify signature:
   - `signtool verify /pa /v CuePoint.exe`

### 4.4.1 SmartScreen mitigation
- SmartScreen reputation improves over time for a consistent signing cert.
- EV cert improves initial trust but is more expensive.
- Ensure you timestamp signatures so they remain valid after cert expiry.

### 4.5 Installer behavior
- Install location: `%LOCALAPPDATA%\\CuePoint` (user install) for fewer admin prompts in v1.0.
- Start menu shortcut + optional desktop shortcut.
- Uninstaller entry in “Add/Remove Programs”.
- Preserve user data/config across upgrades.

### 4.5.1 Upgrade behavior requirements
- Installer should:
  - close running app (prompt user) or require user to close it
  - replace binaries
  - keep `%APPDATA%` / `%LOCALAPPDATA%` config and caches intact

### 4.5.2 Data locations (Windows conventions)
Use platform standard locations:
- Config: `%APPDATA%\\CuePoint`
- Cache: `%LOCALAPPDATA%\\CuePoint\\Cache`
- Logs: `%LOCALAPPDATA%\\CuePoint\\Logs`
- Exports: `Documents\\CuePoint` by default

### 4.6 Update compatibility
If using WinSparkle:
- Host update feed (appcast) + signed update packages.
- Ensure upgrade flow doesn’t require manual uninstall.

### 4.6.1 Update model (v1.0)
Recommended: **installer-based updates**
- WinSparkle prompts user, downloads the signed installer, runs it.
- Avoids complex in-place patching for v1.0.

### 4.7 Common pitfalls
- Antivirus false positives on unsigned PyInstaller bundles.
- Missing VC runtime dependencies (bundle where needed).
- Writing into Program Files without admin handling.

### 4.7.1 Hardening checklist
- Run Windows Defender scan on release artifacts.
- Sign both the main exe and installer.
- Avoid bundling unnecessary binaries to reduce false positives.


