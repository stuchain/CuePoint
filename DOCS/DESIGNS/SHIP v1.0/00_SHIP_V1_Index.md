## Ship v1.0 – Design Index

This folder contains **ship-ready** designs for delivering CuePoint as a professional desktop app on **macOS + Windows**, including packaging, signing, CI/CD, and an auto-update mechanism.

### How to use these docs
- If you’re building **releases**: start with `02_Build_System_and_Release_Pipeline.md`, then `03_...macOS...` / `04_...Windows...`, then `05_Auto_Update_System.md`.
- If you’re polishing the **product**: start with `01_Product_Requirements_and_Definition.md` and `09_UX_...`.
- If you’re preparing for **support**: start with `06_Runtime_Operational_Design.md` and `08_Security_...`.

### Scope (v1.0)
- **Professional installers**: `.dmg` (macOS), `.exe`/`.msi` (Windows)
- **Code signing & notarization**: required for a trustworthy UX
- **Reproducible builds**: pinned toolchain + dependency strategy
- **Auto-update**: in-app “Update available” prompt and guided update flow
- **Operational readiness**: logs, crash handling, safe file locations, privacy
- **QA**: smoke tests, CI checks, release gates

### High-level architecture (v1.0)
**App**
- Qt/PySide6 GUI + background worker(s) for network/matching
- Local cache + local output files
- Built-in update checker (Sparkle/WinSparkle recommended)

**Release system**
- GitHub Actions builds signed artifacts for macOS + Windows
- Release artifacts uploaded to GitHub Releases
- Update feed (appcast) hosted on GitHub Pages (or CDN)

### Documents
- `01_Product_Requirements_and_Definition.md`
- `02_Build_System_and_Release_Pipeline.md`
- `03_macOS_Packaging_Signing_Notarization.md`
- `04_Windows_Packaging_Signing.md`
- `05_Auto_Update_System.md`
- `06_Runtime_Operational_Design.md`
- `07_QA_Testing_and_Release_Gates.md`
- `08_Security_Privacy_and_Compliance.md`
- `09_UX_Polish_Accessibility_and_Localization.md`

### Glossary
- **Artifact**: the file users download (DMG/EXE/MSI) published per release.
- **Appcast**: an update feed describing available versions (commonly XML for Sparkle).
- **Notarization**: Apple’s malware scanning + approval stamp.
- **Stapling**: embedding notarization approval into the artifact.
- **Hardened runtime**: macOS requirement for notarized apps; restricts runtime behavior.
- **Code signing**: cryptographic identity of publisher for OS trust.
- **Delta update**: update that downloads only the differences between versions.

### Decision log (key choices)
These docs assume:
- **PyInstaller** for packaging (both OS).
- **Sparkle (macOS)** + **WinSparkle (Windows)** for auto-update.
- **GitHub Releases** for hosting artifacts; **GitHub Pages/CDN** for update feed.
If you prefer different tools, update `02_...` and `05_...` first.

### Non-goals for v1.0 (defer unless needed)
- Full delta updates on Windows (optional enhancement)
- Multi-language localization (basic i18n hooks only)
- Telemetry/analytics (optional and opt-in only)


