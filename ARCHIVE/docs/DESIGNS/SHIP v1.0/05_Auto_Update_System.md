## Step 5: Auto-Update System (Ship v1.0)

**Implementation Order**: This is the **fifth step** - depends on Steps 3 and 4 (Packaging).

### Step 5.1: Goals

**5.1.1 Primary Goal**
When a new version is released, installed users see:
- "**Update available**" popup
- release notes summary
- one-click "Download & Install" (or "Download & Open Installer" depending on platform)

**5.1.2 UX Requirements**
- Non-blocking: user can skip now ("Later") and continue using the app.
- Clear: show current version → new version, short notes, and a "More details" link.
- Safe: never auto-install silently in v1.0 (unless explicitly enabled later).
- Configurable cadence:
  - check on startup
  - and/or once per day

### Step 5.2: Constraints

**5.2.1 Platform Constraints**
- **Cross-platform**: macOS + Windows.
- **Secure**: updates must be authenticity-checked.
- **Simple hosting**: GitHub Releases is acceptable.
- **Non-admin** where possible (especially on Windows user installs).

### Step 5.3: Recommended Architecture (Professional)

**5.3.1 Update Framework Choice**
Use the same mature update feed format on both OS:
- **Sparkle** on macOS (industry standard)
- **WinSparkle** on Windows (Sparkle-compatible feed)

Both read an **appcast** XML feed.

**5.3.2 Channels (Stable/Beta)**
Support multiple feeds:
- Stable: default feed users get
- Beta: opt-in via Settings (advanced)

Suggested URLs:
- `.../updates/macos/stable/appcast.xml`
- `.../updates/macos/beta/appcast.xml`
- `.../updates/windows/stable/appcast.xml`
- `.../updates/windows/beta/appcast.xml`

### Step 5.4: Update Metadata (Appcast)

**5.4.1 Appcast Hosting**
Host:
- `https://<your-domain>/cuepoint/updates/macos/appcast.xml`
- `https://<your-domain>/cuepoint/updates/windows/appcast.xml`

**5.4.2 Appcast Entry Fields**
Each release entry includes:
- version `X.Y.Z`
- short release notes (HTML)
- download URL (GitHub release asset)
- file size
- cryptographic signature / checksum

**5.4.3 Appcast Hosting Options**
You can host appcast on:
- GitHub Pages
- your own site
- an S3 bucket / CDN

**5.4.4 Concrete Appcast Entry Fields (Sparkle-style)**
For each item:
- `sparkle:version` / `sparkle:shortVersionString`
- `enclosure url="..." length="..." type="..."`
- `sparkle:edSignature="..."` (EdDSA signature) or appropriate signature field
- `sparkle:releaseNotesLink` (optional)
- `pubDate`

Windows entries can use the same structure with WinSparkle, pointing to `.exe` installer assets.

### Step 5.5: How It Works In-App

**5.5.1 Update Check Process**
At app startup (and optionally daily):
1) Read current app version.
2) Fetch update feed (appcast).
3) Compare latest version vs current.
4) If newer:
   - show dialog with notes + buttons
   - allow "Remind me later"

**5.5.2 Check Logic Details**
- Compare versions using SemVer rules (avoid string comparison bugs).
- Skip "pre-release" builds unless user is on beta channel.
- Persist:
  - last check timestamp
  - ignored version (if user clicks "Skip this version")

### Step 5.6: macOS Flow (Sparkle)

**5.6.1 Sparkle Integration**
- Sparkle downloads the update, verifies signature, and applies it.
- Requires:
  - properly signed app
  - Sparkle framework bundled
  - appcast signed (recommended)

**5.6.2 Sparkle Integration Notes**
- Configure `SUFeedURL` in Info.plist (or at runtime for channels).
- Ensure Sparkle is embedded and signed with the app.
- Prefer EdDSA signatures and signed appcast for stronger security.

### Step 5.7: Windows Flow (WinSparkle)

**5.7.1 Update Method Choice**
Two choices:
1) **Installer download** (v1.0): download signed installer and run it.
2) **Delta updates** (later): more complex; not necessary for v1.0.

WinSparkle can show UI + download; the installer performs the upgrade.

**5.7.2 Windows Installer-Based Update Requirements**
- Installer must support upgrade-in-place:
  - same app ID
  - preserve config/history
- If app is running:
  - prompt user to close
  - or installer requests close

### Step 5.8: Security Model

**5.8.1 Minimum Security**
- HTTPS + checksum validation.

**5.8.2 Recommended Security**
- cryptographically signed update packages:
  - Sparkle provides EdDSA signatures (or DSA legacy)
  - WinSparkle uses Sparkle-compatible signatures

The update UI must display:
- version
- publisher
- notes

**5.8.3 Security "Must-Haves" for Professional Shipping**
- Signed apps (mac + win).
- Timestamped signatures (Windows).
- Update feed hosted over HTTPS.
- Update packages verified via cryptographic signature.
- Ability to revoke a bad release quickly by removing it from appcast.

### Step 5.9: Release Pipeline Integration

**5.9.1 CI Integration**
On tagging `vX.Y.Z`, CI will:
- build and sign artifacts
- publish to GitHub Release:
  - `CuePoint-vX.Y.Z-macos.dmg`
  - `CuePoint-vX.Y.Z-windows-setup.exe`
- update appcast files:
  - insert new entry with URLs, size, signatures, notes

**5.9.2 GitHub Releases + Appcast Hosting (Recommended)**
- GitHub Releases hosts the binaries (assets).
- GitHub Pages hosts appcast and release notes HTML.

Release automation writes:
- `updates/<platform>/<channel>/appcast.xml`
- optional `release-notes/vX.Y.Z.html`

### Step 5.10: Rollback Strategy

**5.10.1 Rollback Process**
- Keep last N releases available.
- If a release is broken:
  - pull the appcast entry
  - optionally mark as "withdrawn"

**5.10.2 Staged Rollout (Recommended "Even More Professional")**
Add phased rollout with a separate feed:
- `stable-rollout-10%` → `stable-rollout-50%` → `stable`
Mechanism:
- app chooses feed based on a stable machine identifier hash (deterministic bucketing)
- allows you to stop rollout quickly if issues appear

### Step 5.11: Alternative (Simpler, Less "Native")

**5.11.1 Custom Implementation**
If you don't want Sparkle/WinSparkle:
- implement your own "check GitHub Releases API" + "open download link" UI.
- Pros: easiest
- Cons: less seamless, more manual, fewer security guarantees unless you implement signature verification yourself.
