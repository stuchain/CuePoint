## Ship v1.0 – Design Index

This folder contains **ship-ready** designs for delivering CuePoint as a professional desktop app on **macOS + Windows**, including packaging, signing, CI/CD, and an auto-update mechanism.

### Implementation Order

These documents are structured as **ordered implementation steps** with analytical substeps:

1. **Step 1: Product Requirements & Definition** (`01_Product_Requirements_and_Definition.md`)
   - Foundation: defines what we're building, target users, and success criteria
   - **Implement first** - all other steps depend on this

2. **Step 2: Build System & Release Pipeline** (`02_Build_System_and_Release_Pipeline.md`)
   - Infrastructure: CI/CD, versioning, artifact generation
   - **Implement second** - required for all packaging steps

3. **Step 3: macOS Packaging, Signing & Notarization** (`03_macOS_Packaging_Signing_Notarization.md`)
   - Platform-specific: macOS distribution
   - **Implement third** - depends on Step 2

4. **Step 4: Windows Packaging & Signing** (`04_Windows_Packaging_Signing.md`)
   - Platform-specific: Windows distribution
   - **Implement fourth** - depends on Step 2, can be parallel with Step 3

5. **Step 5: Auto-Update System** (`05_Auto_Update_System.md`)
   - Update mechanism: in-app updates
   - **Implement fifth** - depends on Steps 3 and 4

6. **Step 6: Runtime Operational Design** (`06_Runtime_Operational_Design.md`)
   - App behavior: file locations, logging, networking
   - **Implement sixth** - can be done in parallel with Steps 3-5

7. **Step 7: QA Testing and Release Gates** (`07_QA_Testing_and_Release_Gates.md`)
   - Validation: testing strategy and release criteria
   - **Implement seventh** - validates all previous steps

8. **Step 8: Security, Privacy and Compliance** (`08_Security_Privacy_and_Compliance.md`)
   - Security: threat model, secure defaults, compliance
   - **Implement eighth** - should be considered throughout, formalized here

9. **Step 9: UX Polish, Accessibility and Localization** (`09_UX_Polish_Accessibility_and_Localization.md`)
   - Polish: visual consistency, accessibility, localization hooks
   - **Implement ninth** - final touches before release

10. **Step 10: Final Configuration & Release Readiness** (`10_Final_Configuration_and_Release_Readiness.md`)
   - Configuration: GitHub Secrets, certificates, final testing
   - **Implement last** - after all other steps are complete

### How to Use These Docs

- **For implementation**: Follow steps 1-10 in order
- **For reference**: Each document contains ordered substeps (1.1, 1.2, etc.) and analytical substeps (1.1.1, 1.1.2, etc.)
- **For planning**: Review Step 1 first to understand scope, then plan implementation sequence

### Scope (v1.0)

- **Professional installers**: `.dmg` (macOS), `.exe`/`.msi` (Windows)
- **Code signing & notarization**: required for a trustworthy UX
- **Reproducible builds**: pinned toolchain + dependency strategy
- **Auto-update**: in-app "Update available" prompt and guided update flow
- **Operational readiness**: logs, crash handling, safe file locations, privacy
- **QA**: smoke tests, CI checks, release gates

### High-level Architecture (v1.0)

**App**
- Qt/PySide6 GUI + background worker(s) for network/matching
- Local cache + local output files
- Built-in update checker (Sparkle/WinSparkle recommended)

**Release System**
- GitHub Actions builds signed artifacts for macOS + Windows
- Release artifacts uploaded to GitHub Releases
- Update feed (appcast) hosted on GitHub Pages (or CDN)

### Documents

- `01_Product_Requirements_and_Definition.md` - Step 1: Foundation
- `02_Build_System_and_Release_Pipeline.md` - Step 2: Infrastructure
- `03_macOS_Packaging_Signing_Notarization.md` - Step 3: macOS Distribution
- `04_Windows_Packaging_Signing.md` - Step 4: Windows Distribution
- `05_Auto_Update_System.md` - Step 5: Update Mechanism
- `06_Runtime_Operational_Design.md` - Step 6: App Behavior
- `07_QA_Testing_and_Release_Gates.md` - Step 7: Validation
- `08_Security_Privacy_and_Compliance.md` - Step 8: Security
- `09_UX_Polish_Accessibility_and_Localization.md` - Step 9: Polish
- `10_Final_Configuration_and_Release_Readiness.md` - Step 10: Final Configuration

### Glossary

- **Artifact**: the file users download (DMG/EXE/MSI) published per release.
- **Appcast**: an update feed describing available versions (commonly XML for Sparkle).
- **Notarization**: Apple's malware scanning + approval stamp.
- **Stapling**: embedding notarization approval into the artifact.
- **Hardened runtime**: macOS requirement for notarized apps; restricts runtime behavior.
- **Code signing**: cryptographic identity of publisher for OS trust.
- **Delta update**: update that downloads only the differences between versions.

### Decision Log (Key Choices)

These docs assume:
- **PyInstaller** for packaging (both OS).
- **Sparkle (macOS)** + **WinSparkle (Windows)** for auto-update.
- **GitHub Releases** for hosting artifacts; **GitHub Pages/CDN** for update feed.
If you prefer different tools, update `02_...` and `05_...` first.

### Non-goals for v1.0 (Defer Unless Needed)

- Full delta updates on Windows (optional enhancement)
- Multi-language localization (basic i18n hooks only)
- Telemetry/analytics (optional and opt-in only)
