# Update System

## What it is (high-level)

CuePoint can **check for updates** (e.g. on startup or via Help → Check for updates), show an **“Update Available”** dialog with version and download size, and let the user **download** and **install** the update:

- **Check**: fetch an **appcast** (Sparkle-style XML) from a configurable URL; parse items (version, shortVersionString, enclosure url, length, sparkle:edSignature, sparkle:sha256). Compare **base version** (X.Y.Z) with current app version; only offer an update when the appcast’s base version is **newer** (e.g. 1.0.2 offered when current is 1.0.0; 1.0.0-feb10 not offered when current is 1.0.0-feb1). Prerelease vs stable channel can be supported (e.g. different appcast URL).
- **Download**: when the user clicks “Download” (or “Update Now”), the app downloads the installer (DMG on macOS, EXE on Windows) via HTTPS, with a **progress dialog**. Optionally **checksum** (sparkle:sha256) is verified after download; if the appcast has no checksum, the user can still choose “Update manually” (open folder) or “Install anyway” with a warning.
- **Install**: on **Windows**, a PowerShell launcher (or direct run) closes the app and runs the installer (visible, not silent). On **macOS**, the app uses **hdiutil** (full path `/usr/bin/hdiutil` so it works with minimal PATH in a packaged app) to mount the DMG, copy the .app to `/Applications`, unmount, and launch the new app. If automatic install is not supported (e.g. hdiutil not found), a dialog shows **“Update manually”** with a button to **open the folder** containing the downloaded DMG and **Cancel** (no path shown in message).
- **Preferences**: “skip this version” and “check on startup” are stored (update_preferences); appcast URL and channel may be configurable.

## How it is implemented (code)

- **Update checker**  
  - **File:** `src/cuepoint/update/update_checker.py` — fetches appcast URL (HTTPS), parses XML (Sparkle namespace), finds enclosure, reads version, shortVersionString, url, length, sparkle:edSignature, sparkle:dsaSignature, **sparkle:sha256** (checksum). Builds list of items; sorts by short_version (semantic); filters to “newer than current” using **base version** comparison (version_utils). Returns latest update dict (version, download_url, file_size, checksum, release_notes_url, etc.).  
  - **File:** `src/cuepoint/update/version_utils.py` — parse_version, base version comparison (only offer update when base X.Y.Z is strictly greater).

- **Update manager**  
  - **File:** `src/cuepoint/update/update_manager.py` — orchestrates check (on main thread with QNetworkAccessManager on macOS frozen app to avoid crashes; certifi for SSL). Emits signals (no-arg) when update available or check complete; UI reads update info via `get_update_info()` / `has_update()` / `_last_check_error`. Runs check on startup (if enabled) and when user clicks “Check for updates”.

- **Update UI**  
  - **File:** `src/cuepoint/update/update_ui.py` — “Checking for updates” dialog with current version, status (Update available / No update / Error), and **Download** (renamed from “Download & Install”) and Close buttons; connects to update_manager and main_window for download/install.

- **Download**  
  - **File:** `src/cuepoint/update/update_downloader.py` — `UpdateDownloader` uses QNetworkAccessManager (or fallback) to download the enclosure URL; progress signals; returns path to downloaded file.  
  - **File:** `src/cuepoint/ui/dialogs/download_progress_dialog.py` — progress dialog during download.

- **Install**  
  - **File:** `src/cuepoint/update/update_installer.py` — `UpdateInstaller.can_install()`: on Windows returns True; on macOS runs `/usr/bin/hdiutil -version` (full path). `install(installer_path)`: Windows launches PowerShell script or installer; macOS mounts DMG with hdiutil, copies .app to /Applications, unmounts, launches new app, exits.  
  - **File:** `src/cuepoint/ui/main_window.py` — after download, verifies checksum if present (`PackageIntegrityVerifier.verify_checksum`); if no checksum, shows warning with “Install anyway” or “Update manually”. Then `_install_update(path)`: if not `can_install()`, shows **manual install dialog** (message without path, **Cancel** left, **Update manually** right — opens folder via `_open_installer_folder()`). If can_install, confirms then calls `installer.install()`.

- **Security**  
  - **File:** `src/cuepoint/update/security.py` — `PackageIntegrityVerifier.verify_checksum(file_path, expected_checksum)` (SHA256). Feed integrity (HTTPS only for appcast and download URL) in update_checker.

- **Preferences**  
  - **File:** `src/cuepoint/update/update_preferences.py` — ignore version list, check on startup, etc.; persisted.

- **Appcast generation**  
  - **File:** `scripts/generate_appcast.py` — generates Sparkle XML with enclosure, version, shortVersionString, length, edSignature/dsaSignature, and **sparkle:sha256** (computed from DMG file). Release workflow uses this to publish appcast to gh-pages.

So: **what the feature is** = “check appcast, compare base version, download with optional checksum verify, install (Windows EXE / macOS DMG) or open folder for manual install”; **how it’s implemented** = update_checker + version_utils + update_manager + update_ui + update_downloader + update_installer + main_window (verify, manual dialog, open folder) + security + update_preferences + generate_appcast.
