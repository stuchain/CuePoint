## 5. Auto-Update System (Ship v1.0)

### 5.1 Goal
When a new version is released, installed users see:
- “**Update available**” popup
- release notes summary
- one-click “Download & Install” (or “Download & Open Installer” depending on platform)

### 5.1.1 UX requirements
- Non-blocking: user can skip now (“Later”) and continue using the app.
- Clear: show current version → new version, short notes, and a “More details” link.
- Safe: never auto-install silently in v1.0 (unless explicitly enabled later).
- Configurable cadence:
  - check on startup
  - and/or once per day

### 5.2 Constraints
- **Cross-platform**: macOS + Windows.
- **Secure**: updates must be authenticity-checked.
- **Simple hosting**: GitHub Releases is acceptable.
- **Non-admin** where possible (especially on Windows user installs).

### 5.3 Recommended architecture (professional)
Use the same mature update feed format on both OS:
- **Sparkle** on macOS (industry standard)
- **WinSparkle** on Windows (Sparkle-compatible feed)

Both read an **appcast** XML feed.

### 5.3.1 Channels (stable/beta)
Support multiple feeds:
- Stable: default feed users get
- Beta: opt-in via Settings (advanced)

Suggested URLs:
- `.../updates/macos/stable/appcast.xml`
- `.../updates/macos/beta/appcast.xml`
- `.../updates/windows/stable/appcast.xml`
- `.../updates/windows/beta/appcast.xml`

### 5.4 Update metadata (Appcast)
Host:
- `https://<your-domain>/cuepoint/updates/macos/appcast.xml`
- `https://<your-domain>/cuepoint/updates/windows/appcast.xml`

Each release entry includes:
- version `X.Y.Z`
- short release notes (HTML)
- download URL (GitHub release asset)
- file size
- cryptographic signature / checksum

You can host appcast on:
- GitHub Pages
- your own site
- an S3 bucket / CDN

### 5.4.1 Concrete appcast entry fields (Sparkle-style)
For each item:
- `sparkle:version` / `sparkle:shortVersionString`
- `enclosure url="..." length="..." type="..."`
- `sparkle:edSignature="..."` (EdDSA signature) or appropriate signature field
- `sparkle:releaseNotesLink` (optional)
- `pubDate`

Windows entries can use the same structure with WinSparkle, pointing to `.exe` installer assets.

### 5.5 How it works in-app
At app startup (and optionally daily):
1) Read current app version.
2) Fetch update feed (appcast).
3) Compare latest version vs current.
4) If newer:
   - show dialog with notes + buttons
   - allow “Remind me later”

### 5.5.1 Check logic details
- Compare versions using SemVer rules (avoid string comparison bugs).
- Skip “pre-release” builds unless user is on beta channel.
- Persist:
  - last check timestamp
  - ignored version (if user clicks “Skip this version”)

### 5.6 macOS flow (Sparkle)
- Sparkle downloads the update, verifies signature, and applies it.
- Requires:
  - properly signed app
  - Sparkle framework bundled
  - appcast signed (recommended)

### 5.6.1 Sparkle integration notes
- Configure `SUFeedURL` in Info.plist (or at runtime for channels).
- Ensure Sparkle is embedded and signed with the app.
- Prefer EdDSA signatures and signed appcast for stronger security.

### 5.7 Windows flow (WinSparkle)
Two choices:
1) **Installer download** (v1.0): download signed installer and run it.
2) **Delta updates** (later): more complex; not necessary for v1.0.

WinSparkle can show UI + download; the installer performs the upgrade.

### 5.7.1 Windows installer-based update requirements
- Installer must support upgrade-in-place:
  - same app ID
  - preserve config/history
- If app is running:
  - prompt user to close
  - or installer requests close

### 5.8 Security model
Minimum:
- HTTPS + checksum validation.

Recommended:
- cryptographically signed update packages:
  - Sparkle provides EdDSA signatures (or DSA legacy)
  - WinSparkle uses Sparkle-compatible signatures

The update UI must display:
- version
- publisher
- notes

### 5.8.1 Security “must-haves” for professional shipping
- Signed apps (mac + win).
- Timestamped signatures (Windows).
- Update feed hosted over HTTPS.
- Update packages verified via cryptographic signature.
- Ability to revoke a bad release quickly by removing it from appcast.

### 5.9 Release pipeline integration
On tagging `vX.Y.Z`, CI will:
- build and sign artifacts
- publish to GitHub Release:
  - `CuePoint-vX.Y.Z-macos.dmg`
  - `CuePoint-vX.Y.Z-windows-setup.exe`
- update appcast files:
  - insert new entry with URLs, size, signatures, notes

### 5.9.1 GitHub Releases + appcast hosting (recommended)
- GitHub Releases hosts the binaries (assets).
- GitHub Pages hosts appcast and release notes HTML.

Release automation writes:
- `updates/<platform>/<channel>/appcast.xml`
- optional `release-notes/vX.Y.Z.html`

### 5.10 Rollback strategy
- Keep last N releases available.
- If a release is broken:
  - pull the appcast entry
  - optionally mark as “withdrawn”

### 5.10.1 Staged rollout (recommended “even more professional”)
Add phased rollout with a separate feed:
- `stable-rollout-10%` → `stable-rollout-50%` → `stable`
Mechanism:
- app chooses feed based on a stable machine identifier hash (deterministic bucketing)
- allows you to stop rollout quickly if issues appear

### 5.11 Alternative (simpler, less “native”)
If you don’t want Sparkle/WinSparkle:
- implement your own “check GitHub Releases API” + “open download link” UI.
Pros: easiest
Cons: less seamless, more manual, fewer security guarantees unless you implement signature verification yourself.


