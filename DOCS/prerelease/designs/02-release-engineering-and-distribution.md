 # Step 2: Release Engineering and Distribution Design
 
 ## Purpose
 Ensure builds are deterministic, signed, verifiable, and automatically
 published with clear rollback and integrity guarantees.
 
 ## Current State
 - GitHub Actions builds for macOS and Windows.
 - Version sync exists via `scripts/sync_version.py`.
 - Update feeds/appcast generation scripts exist.
 
 ## Proposed Implementation
 
 ### 2.1 Deterministic Builds
 - Pin dependencies in build requirements and record hashes.
 - Emit build metadata (commit SHA, build timestamp, tool versions).
 
 ### 2.2 Signing and Notarization
 - macOS: sign + notarize + staple DMG/APP.
 - Windows: Authenticode signing with timestamp.
 - Document key storage and rotation.
 
 ### 2.3 Release Gates
 - Add a CI gate to block releases if:
   - Version mismatch is detected
   - Changelog missing entries
   - SBOM not generated
   - Signing checks fail
 
 ### 2.4 Rollback Plan
 - Document removing appcast entries and pulling release assets.
 - Provide emergency version bump for critical hotfixes.
 
 ## Code Touchpoints
 - `.github/workflows/build-macos.yml`
 - `.github/workflows/build-windows.yml`
 - `.github/workflows/release.yml`
 - `scripts/sync_version.py`
 - `scripts/generate_appcast.py`
 - `scripts/generate_update_feed.py`
 
 ## Example CI Gate (Pseudocode)
 ```yaml
 - name: Verify version sync
   run: python scripts/validate_version.py
 - name: Generate SBOM
   run: python scripts/generate_sbom.py
 - name: Fail if missing changelog
   run: python scripts/validate_changelog.py
 ```
 
 ## Testing Plan
 - CI tests for version sync and SBOM generation.
 - Smoke test release artifacts: signature verification and checksum.
 - Manual verification on a clean machine (install, run, update).
 
 ## Acceptance Criteria
 - Releases are reproducible and signed.
 - CI blocks incomplete releases.
 - Rollback steps are documented and tested.
 
 ---
 
 ## 2.5 Release Engineering Principles
 
 - Deterministic inputs produce deterministic artifacts.
 - All artifacts are traceable to a commit SHA.
 - Every public artifact is signed or checksum-verified.
 - Release creation is automated and repeatable.
 - No manual steps without documented justification.
 
 ## 2.6 Release Lifecycle Overview
 
 ### Lifecycle Stages
 1. Prepare: version sync, changelog update, preflight tests.
 2. Build: compile, package, sign, notarize.
 3. Verify: artifact checks, install checks, update feed checks.
 4. Publish: upload to GitHub Releases, publish appcast.
 5. Monitor: verify download integrity, update check, install.
 6. Rollback: invalidate appcast, replace artifacts.
 
 ### Artifact Types
 - macOS: `.dmg`, `.app` bundle.
 - Windows: `.exe` or `.msi` installer.
 - Update feeds: appcast XML and JSON.
 - SBOM: `spdx.json` or `cyclonedx.json`.
 - Checksums: `SHA256SUMS`.
 
 ## 2.7 Versioning Strategy
 
 ### SemVer Policy
 - Major: breaking changes.
 - Minor: new features.
 - Patch: bug fixes.
 - Optional pre-release suffix: `-beta.N`, `-rc.N`.
 
 ### Source of Truth
 - `SRC/cuepoint/version.py` remains authoritative.
 - CI syncs from git tag if present.
 - Release tag must match version.
 
 ### Version Sync Rules
 - Tag format: `vX.Y.Z` or `vX.Y.Z-rc.N`.
 - `scripts/sync_version.py` validates version format.
 - `scripts/validate_version.py` ensures consistency across files.
 
 ## 2.8 Deterministic Build Inputs
 
 ### Dependency Pinning
 - Pin versions in `requirements*.txt`.
 - Use hash checking (`pip --require-hashes`) for release builds.
 - Freeze build tool versions (PyInstaller, Python).
 
 ### Toolchain Lock
 - Record Python version and build environment.
 - Lock OS runner version in CI if possible.
 
 ### Build Metadata
 - Emit build info file:
   - commit SHA
   - version
   - build timestamp
   - tool versions
 
 ## 2.9 Build Provenance
 
 ### Provenance Record Format
 - JSON file embedded in artifacts.
 - Example fields:
   - `version`
   - `commit_sha`
   - `build_time`
   - `builder`
   - `workflow_run_id`
 
 ### Example Build Info
 ```json
 {
   "version": "1.2.3",
   "commit_sha": "abc123",
   "build_time": "2026-01-31T13:00:00Z",
   "workflow_run_id": "987654321"
 }
 ```
 
 ## 2.10 Artifact Naming Conventions
 
 ### Naming Rules
 - Include product, version, OS, arch.
 - Include signing state if unsigned.
 - Avoid spaces.
 
 ### Examples
 - `CuePoint-1.2.3-macos-universal.dmg`
 - `CuePoint-1.2.3-windows-x64.exe`
 - `CuePoint-1.2.3-windows-x64-unsigned.exe`
 
 ## 2.11 Signing and Notarization (macOS)
 
 ### Requirements
 - Apple Developer ID Application certificate.
 - Notarization with Apple notary service.
 - Stapling to bundle and DMG.
 
 ### Steps
 1. Sign the `.app` bundle.
 2. Build `.dmg`.
 3. Notarize `.dmg`.
 4. Staple `.dmg`.
 5. Validate with `spctl`.
 
 ### Verification Commands
 ```
 codesign --verify --deep --strict --verbose=2 CuePoint.app
 spctl --assess --type execute --verbose=2 CuePoint.app
 ```
 
 ## 2.12 Signing (Windows)
 
 ### Requirements
 - Authenticode certificate.
 - Timestamping service.
 
 ### Verification Commands
 ```
 signtool verify /pa CuePoint-1.2.3-windows-x64.exe
 ```
 
 ## 2.13 Key Management
 
 - Store certs in CI secrets.
 - Avoid storing private keys in repository.
 - Rotate keys annually or after incident.
 - Document key usage and access.
 
 ## 2.14 Release Gates (Detailed)
 
 ### Required Gates
 - Version sync check.
 - Changelog entry present.
 - Tests pass (unit + integration + release readiness).
 - Build artifacts signed.
 - Appcast generated and validated.
 - SBOM generated.
 - Checksums generated.
 
 ### Optional Gates
 - Performance benchmark thresholds.
 - Accessibility checks.
 
 ## 2.15 CI Pipeline Structure
 
 ### Stages
 - `lint`
 - `tests`
 - `build`
 - `sign`
 - `verify`
 - `publish`
 
 ### Example Workflow Ordering
 - Run tests before build.
 - Build before signing.
 - Sign before publish.
 - Verify after signing.
 
 ## 2.16 SBOM Generation
 
 ### Format
 - SPDX or CycloneDX.
 
 ### Contents
 - All Python dependencies.
 - Build tools.
 - Packaging tools.
 
 ### Publication
 - Attach to GitHub release assets.
 - Link in release notes.
 
 ## 2.17 Checksums
 
 - Generate `SHA256SUMS`.
 - Sign checksum file if possible.
 - Publish alongside artifacts.
 
 ## 2.18 Release Notes
 
 - Auto-generate from merged PRs.
 - Include breaking changes and migration notes.
 - Include security fixes section.
 
 ## 2.19 Appcast Integrity
 
 - Appcast served over HTTPS.
 - Appcast includes checksums and version metadata.
 - Appcast entries for pre-release separated from stable channel.
 
 ## 2.20 Rollback Plan (Detailed)
 
 - Remove appcast entry.
 - Mark GitHub release as withdrawn.
 - Publish hotfix version.
 - Document incident and root cause.
 
 ## 2.21 Release Checklist (Expanded)
 
 - [ ] Version bump committed.
 - [ ] Changelog updated.
 - [ ] Tags created and pushed.
 - [ ] CI tests passed.
 - [ ] Build artifacts signed.
 - [ ] Appcast validated.
 - [ ] SBOM attached.
 - [ ] Checksums attached.
 - [ ] Release notes generated.
 - [ ] Manual install test passed.
 - [ ] Update test passed.
 
 ## 2.22 Sample CI Workflow (Annotated)
 
 ```yaml
 name: Release
 on:
   push:
     tags:
       - "v*"
 jobs:
   build:
     runs-on: ubuntu-latest
     steps:
       - uses: actions/checkout@v4
       - name: Set up Python
         uses: actions/setup-python@v5
         with:
           python-version: "3.13"
       - name: Sync version
         run: python scripts/sync_version.py --validate-only
       - name: Run tests
         run: python -m pytest
       - name: Build artifacts
         run: python scripts/build_pyinstaller.py
 ```
 
 ## 2.23 Build Artifact Verification
 
 - Verify file size within expected range.
 - Verify signature.
 - Verify checksum matches.
 - Verify app launches.
 
 ## 2.24 Clean Install Testing
 
 - Test on fresh VM or clean machine.
 - No existing config or cache.
 - Verify app creates default folders.
 
 ## 2.25 Upgrade Testing
 
 - Install previous version.
 - Trigger update check.
 - Apply update.
 - Verify data preserved.
 
 ## 2.26 Release Channels
 
 - `stable`: default.
 - `beta`: for early testers.
 - `internal`: internal QA.
 
 ## 2.27 Channel Selection Rules
 
 - Beta channel should not auto-update to stable.
 - Stable should not accept pre-release unless explicitly enabled.
 
 ## 2.28 Release Automation Scripts
 
 - `scripts/sync_version.py`
 - `scripts/generate_appcast.py`
 - `scripts/generate_update_feed.py`
 - `scripts/publish_feeds.py`
 
 ## 2.29 Build Environment
 
 - Use official GitHub Actions runners.
 - Record OS version and tool versions.
 - Avoid mutable global state between jobs.
 
 ## 2.30 Release Data Model
 
 ```json
 {
   "version": "1.2.3",
   "channel": "stable",
   "artifacts": [
     "CuePoint-1.2.3-macos-universal.dmg",
     "CuePoint-1.2.3-windows-x64.exe"
   ],
   "checksums": "SHA256SUMS",
   "sbom": "spdx.json"
 }
 ```
 
 ## 2.31 Error Taxonomy (Release)
 
 - R001: Version mismatch
 - R002: Changelog missing
 - R003: SBOM generation failed
 - R004: Signature invalid
 - R005: Appcast validation failed
 - R006: Artifact upload failed
 
 ## 2.32 Retry Strategy
 
 - Transient CI failures can be retried once.
 - Signing failures require manual inspection.
 - Appcast failures block release.
 
 ## 2.33 Pipeline Metrics
 
 - Build time per OS.
 - Signing time.
 - Release time from tag to publish.
 - Artifact size.
 
 ## 2.34 Audit Trail
 
 - Release is traceable to commit SHA.
 - CI run logs preserved.
 - Appcast entries include build metadata.
 
 ## 2.35 Compliance Requirements
 
 - Include third-party licenses in distribution.
 - Include privacy notice in Help menu.
 - Keep license bundle updated per release.
 
 ## 2.36 Manual Verification Checklist
 
 - Open installer.
 - Launch app.
 - Run sample XML.
 - Verify update check.
 - Verify uninstall.
 
 ## 2.37 Rollback Drill
 
 - Simulate a bad release.
 - Remove appcast entry.
 - Publish hotfix.
 - Verify update to hotfix.
 
 ## 2.38 Build Script Hardening
 
 - Fail if build outputs missing.
 - Fail if PyInstaller version mismatch.
 - Fail if required hook missing.
 
 ## 2.39 Release Notes Template
 
 - Highlights
 - Fixes
 - Known issues
 - Upgrade notes
 - Checksums
 
 ## 2.40 Changelog Policy
 
 - Each PR must include changelog entry.
 - Release notes are generated from changelog.
 
 ## 2.41 Security Release Flow
 
 - Separate security hotfix pipeline.
 - Limited disclosure until patch is available.
 
 ## 2.42 Future Enhancements
 
 - Delta updates (Windows).
 - Automated rollback tests.
 - Release analytics dashboard.
 
 ## 2.43 macOS Packaging Workflow (Detailed)
 
 ### Inputs
 - Signed `.app` bundle.
 - App icon set.
 - `Info.plist` with version and bundle ID.
 
 ### Steps
 1. Build `.app` bundle with PyInstaller.
 2. Validate bundle structure (Resources, Frameworks, etc.).
 3. Sign bundle with Developer ID.
 4. Create `.dmg` with proper volume name.
 5. Notarize the `.dmg`.
 6. Staple notarization to `.dmg`.
 7. Verify with `spctl`.
 
 ### Example Commands (Reference)
 ```
 codesign --force --deep --sign "$MACOS_CERT_ID" CuePoint.app
 hdiutil create -volname "CuePoint" -srcfolder CuePoint.app CuePoint.dmg
 xcrun notarytool submit CuePoint.dmg --keychain-profile "$NOTARY_PROFILE" --wait
 xcrun stapler staple CuePoint.dmg
 spctl --assess --type open --verbose=2 CuePoint.dmg
 ```
 
 ### Failure Modes
 - Missing entitlements.
 - Invalid bundle ID.
 - Notary service timeout.
 - Staple failure.
 
 ### Mitigations
 - Retry notarization.
 - Validate entitlements in CI.
 - Fail build if notarization fails.
 
 ## 2.44 Windows Packaging Workflow (Detailed)
 
 ### Inputs
 - PyInstaller output.
 - Installer script (NSIS/WinSparkle-compatible).
 
 ### Steps
 1. Build `.exe` or `.msi`.
 2. Sign with Authenticode cert.
 3. Timestamp signature.
 4. Verify signature with `signtool`.
 
 ### Example Commands
 ```
 signtool sign /fd SHA256 /a /tr http://timestamp.digicert.com /td SHA256 CuePoint.exe
 signtool verify /pa CuePoint.exe
 ```
 
 ### Failure Modes
 - Cert expired.
 - Timestamp server unreachable.
 - Unsigned artifact uploaded.
 
 ## 2.45 Update Feed Design (Appcast)
 
 ### Required Fields
 - Version
 - Download URL
 - Checksum
 - Release notes URL
 - Signature (if used)
 
 ### Example Appcast Entry
 ```xml
 <item>
   <title>CuePoint 1.2.3</title>
   <pubDate>Sat, 31 Jan 2026 12:00:00 GMT</pubDate>
   <sparkle:version>1.2.3</sparkle:version>
   <sparkle:shortVersionString>1.2.3</sparkle:shortVersionString>
   <sparkle:releaseNotesLink>https://example.com/release-notes</sparkle:releaseNotesLink>
   <enclosure
     url="https://example.com/CuePoint-1.2.3-macos-universal.dmg"
     sparkle:version="1.2.3"
     sparkle:dsaSignature="SIGNATURE"
     length="123456789"
     type="application/octet-stream" />
 </item>
 ```
 
 ### Appcast Validation Checks
 - Required tags exist.
 - URL is HTTPS.
 - Version is valid.
 - Enclosure length matches artifact size.
 
 ## 2.46 Update Feed JSON (Optional)
 
 ### Example
 ```json
 {
   "version": "1.2.3",
   "channel": "stable",
   "artifacts": {
     "macos": "CuePoint-1.2.3-macos-universal.dmg",
     "windows": "CuePoint-1.2.3-windows-x64.exe"
   },
   "checksums": {
     "macos": "sha256:...",
     "windows": "sha256:..."
   }
 }
 ```
 
 ## 2.47 Release Channel Routing
 
 - Stable channel uses `appcast.xml`.
 - Beta channel uses `appcast-beta.xml`.
 - Internal channel uses `appcast-internal.xml`.
 
 ## 2.48 CI Matrix Design
 
 ### Matrix Dimensions
 - OS: macOS, Windows.
 - Arch: x64, arm64 (macOS).
 - Channel: stable, beta.
 
 ### Example Matrix
 ```yaml
 strategy:
   matrix:
     os: [macos-latest, windows-latest]
     channel: [stable, beta]
 ```
 
 ## 2.49 Secrets and Certificates
 
 ### Required Secrets
 - `MACOS_CERT_P12`
 - `MACOS_CERT_PASSWORD`
 - `NOTARY_APPLE_ID`
 - `NOTARY_PASSWORD`
 - `WINDOWS_CERT_PFX`
 - `WINDOWS_CERT_PASSWORD`
 
 ### Handling Rules
 - Store only in GitHub Secrets.
 - Restrict access to release workflow.
 - Rotate on schedule or incident.
 
 ## 2.50 Release Workflow Guards
 
 - Protect main branch.
 - Require PR checks to pass.
 - Restrict tag creation to maintainers.
 
 ## 2.51 Release Assets Checklist
 
 - Signed macOS DMG.
 - Signed Windows installer.
 - Appcast files.
 - SBOM.
 - Checksums.
 - Release notes.
 - License bundle.
 
 ## 2.52 SBOM Details (Expanded)
 
 ### Required Fields
 - Package name
 - Version
 - License
 - Hash
 - Dependency relationships
 
 ### Example Tooling
 - `cyclonedx-bom`
 - `pip-licenses`
 
 ## 2.53 Artifact Integrity Verification
 
 ### Steps
 - Compute checksum after build.
 - Compare checksum after upload.
 - Validate signature.
 - Validate appcast references.
 
 ### Example Script (Pseudocode)
 ```python
 def verify_artifact(path, expected_hash):
     actual = sha256(path)
     if actual != expected_hash:
         raise ValueError("Checksum mismatch")
 ```
 
 ## 2.54 Release Notes Automation
 
 - Use PR labels to group changes.
 - Generate "Highlights" section automatically.
 - Include upgrade notes from `DOCS/RELEASE/`.
 
 ## 2.55 Changelog Automation
 
 - Enforce `CHANGELOG.md` updates on PR.
 - Validate version section exists.
 - Fail CI if changelog missing.
 
 ## 2.56 Release Validation Scripts
 
 - `scripts/validate_version.py`
 - `scripts/validate_changelog.py`
 - `scripts/validate_appcast.py`
 - `scripts/validate_signatures.py`
 
 ## 2.57 Release Metadata
 
 - Version
 - Commit SHA
 - Build ID
 - Build environment
 - Artifact hashes
 
 ## 2.58 Example Release Metadata File
 
 ```json
 {
   "version": "1.2.3",
   "commit": "abc123",
   "build_id": "gh-123456",
   "artifacts": {
     "macos": {
       "file": "CuePoint-1.2.3-macos-universal.dmg",
       "sha256": "..."
     }
   }
 }
 ```
 
 ## 2.59 Release Verification Matrix
 
 | Stage | Check | Tool |
 | --- | --- | --- |
 | Build | Output exists | CI |
 | Sign | Signature valid | signtool/codesign |
 | Notarize | Notarized | notarytool |
 | Publish | Assets uploaded | GitHub API |
 | Feed | Appcast valid | validate_appcast |
 
 ## 2.60 Build Cache Strategy
 
 - Avoid caching build outputs between releases.
 - Cache dependencies to speed up builds.
 - Clear caches when tool versions change.
 
 ## 2.61 Packaging Artifacts (macOS)
 
 - `.app` bundle
 - `.dmg` installer
 - `Info.plist` metadata
 - Icon resources
 
 ## 2.62 Packaging Artifacts (Windows)
 
 - `.exe` installer
 - Uninstaller entry
 - Start menu shortcuts
 
 ## 2.63 Installer Requirements
 
 - Install per-user by default.
 - Not require admin unless necessary.
 - Provide clean uninstall.
 
 ## 2.64 Release Health Checks
 
 - Download integrity
 - Install integrity
 - Launch success
 - Update check success
 
 ## 2.65 Release Observability
 
 - Track failed update rates.
 - Track install failures.
 - Monitor appcast fetch errors.
 
 ## 2.66 Release Gate Failures
 
 ### Common Causes
 - Changelog missing
 - Version mismatch
 - Signature failure
 - Appcast invalid
 
 ### Required Action
 - Fix issue and restart release pipeline.
 - Do not publish partial releases.
 
 ## 2.67 Release Runbooks
 
 - Standard release runbook
 - Hotfix runbook
 - Rollback runbook
 
 ## 2.68 Hotfix Strategy
 
 - Branch from last release tag.
 - Apply minimal fix.
 - Release patch version.
 
 ## 2.69 Beta Strategy
 
 - Use beta channel appcast.
 - Limit distribution to test group.
 - Promote to stable after verification.
 
 ## 2.70 Update Compatibility Testing
 
 - Update from N-1 to N.
 - Update from N-2 to N.
 - Update from beta to stable (if allowed).
 
 ## 2.71 Artifact Size Budgets
 
 - macOS DMG < 250MB.
 - Windows installer < 300MB.
 - Warn if exceeded.
 
 ## 2.72 Release Documentation Requirements
 
 - Update `DOCS/RELEASE/changelog.md`.
 - Update `DOCS/RELEASE/release-notes-template.md`.
 - Update `DOCS/RELEASE/release-strategy.md`.
 
 ## 2.73 Compatibility Matrix
 
 - macOS versions supported.
 - Windows versions supported.
 - Processor architectures supported.
 
 ## 2.74 Sample Release Checklist (Operator)
 
 - [ ] Validate version.
 - [ ] Run tests.
 - [ ] Build artifacts.
 - [ ] Sign artifacts.
 - [ ] Validate signatures.
 - [ ] Generate appcast.
 - [ ] Upload artifacts.
 - [ ] Publish release.
 
 ## 2.75 Change Control
 
 - Release changes must be reviewed.
 - No unreviewed manual edits to appcast.
 
 ## 2.76 Build Failure Policies
 
 - If build fails, stop pipeline.
 - Do not retry without investigation.
 
 ## 2.77 Release Failure Policies
 
 - If publish fails, do not partially release.
 - If appcast fails, do not update.
 
 ## 2.78 Distribution Mirrors (Optional)
 
 - Mirror releases to a CDN.
 - Validate mirror integrity.
 
 ## 2.79 Artifact Retention Policy
 
 - Keep last 10 releases.
 - Archive older releases.
 
 ## 2.80 CI Environment Variables
 
 - `CUEPOINT_VERSION`
 - `CUEPOINT_BUILD_ID`
 - `CUEPOINT_COMMIT_SHA`
 - `CUEPOINT_CHANNEL`
 
 ## 2.81 Release Branching Model
 
 - `main`: stable.
 - `release/x.y`: release prep.
 - `hotfix/x.y.z`: critical fixes.
 
 ## 2.82 Release Promotion
 
 - Promote beta to stable by copying appcast entries.
 - Verify signatures and checksums.
 
 ## 2.83 Signing Verification Script (Outline)
 
 ```python
 def verify_signatures(artifact_paths):
     for path in artifact_paths:
         if path.suffix == ".dmg":
             verify_codesign(path)
         if path.suffix in [".exe", ".msi"]:
             verify_signtool(path)
 ```
 
 ## 2.84 Appcast Validation Script (Outline)
 
 ```python
 def validate_appcast(path):
     xml = parse_xml(path)
     assert xml.has("sparkle:version")
     assert xml.enclosure.url.startswith("https://")
 ```
 
 ## 2.85 Release Test Matrix
 
 | Test | macOS | Windows |
 | --- | --- | --- |
 | Install | Yes | Yes |
 | Launch | Yes | Yes |
 | Update | Yes | Yes |
 | Uninstall | Yes | Yes |
 
 ## 2.86 Build Performance
 
 - Target build time < 20 minutes per OS.
 - Alert if builds exceed 30 minutes.
 
 ## 2.87 Risk Register (Release)
 
 | Risk | Impact | Likelihood | Mitigation |
 | --- | --- | --- | --- |
 | Cert expired | High | Medium | Monitor expiry |
 | Appcast invalid | High | Low | CI validation |
 | Unsigned artifact | High | Low | Signature gate |
 | Version mismatch | Medium | Medium | Version validation |
 
 ## 2.88 Release Audit Checklist
 
 - All assets signed.
 - Appcast entries correct.
 - Release notes correct.
 - Checksums verified.
 
 ## 2.89 Incident Response for Release
 
 - Identify broken version.
 - Remove appcast entry.
 - Publish hotfix.
 - Notify users.
 
 ## 2.90 Distribution Security
 
 - Serve appcast over HTTPS.
 - Validate hashes before install.
 - Monitor for tampered releases.
 
 ## 2.91 Documentation for Operators
 
 - How to run release workflow.
 - How to fix a failed build.
 - How to rollback a release.
 
 ## 2.92 Automated Rollback Tests (Future)
 
 - Simulate rollback in CI.
 - Validate appcast removal.
 
 ## 2.93 Release Observability Metrics
 
 - Update success rate.
 - Install success rate.
 - Download error rate.
 
 ## 2.94 Tooling References
 
 - PyInstaller
 - Sparkle/WinSparkle
 - GitHub Actions
 
 ## 2.95 Checklist Appendix (Condensed)
 
 - Version sync
 - Changelog update
 - Build + sign
 - Appcast + checksums
 - Release notes
 
 ## 2.96 Example Release Timeline
 
 - Day 0: Feature freeze
 - Day 1: Release candidate build
 - Day 2: QA verification
 - Day 3: Release publish
 
 ## 2.97 Troubleshooting Guide
 
 - If notarization fails, verify bundle ID.
 - If signing fails, verify certificate.
 - If appcast fails, validate XML.
 
 ## 2.98 Appendix: Required Files
 
 - `scripts/sync_version.py`
 - `scripts/generate_appcast.py`
 - `scripts/publish_feeds.py`
 - `.github/workflows/release.yml`
 
 ## 2.99 Appendix: Release Environment Setup
 
 - Install Xcode for notarization.
 - Install Windows SDK for signtool.
 
 ## 2.100 Appendix: Example Build Log Snippet
 
 ```
 [build] version=1.2.3
 [build] commit=abc123
 [build] artifact=CuePoint-1.2.3-macos-universal.dmg
 [sign] notarization=success
 ```
 
 ## 2.101 Appendix: Release Roles
 
 - **Release manager**: owns schedule and go/no-go.
 - **Build engineer**: owns CI configuration and signing.
 - **QA lead**: owns verification checklist.
 - **Docs owner**: owns release notes and user docs updates.
 
 ## 2.102 Appendix: Go/No-Go Criteria
 
 - All release gates pass.
 - No known critical bugs unresolved.
 - Installer verification succeeds.
 - Update flow works on both OS.
 
 ## 2.103 Appendix: Post-Release Verification
 
 - Download from release page.
 - Install and launch.
 - Run a small XML sample.
 - Confirm update check shows latest version.
 
 ## 2.104 Appendix: Emergency Hotfix Checklist
 
 - Create hotfix branch.
 - Apply minimal fix.
 - Build and sign.
 - Publish hotfix release.
 - Update appcast with hotfix entry.
 
 ## 2.105 Appendix: Release Communication
 
 - Post release notes.
 - Notify beta testers if applicable.
 - Update documentation links.
 
 ## 2.106 Appendix: Release Artifacts Inventory
 
 - macOS DMG
 - Windows installer
 - Appcast (stable/beta)
 - SBOM
 - Checksums
 - Release notes
