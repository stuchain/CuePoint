# Reproducible Builds


This guide explains how to reproduce CuePoint release builds locally and how to verify installer integrity.

## Overview

Reproducible builds ensure that given the same source code and toolchain, anyone can produce bit-identical or verifiably equivalent artifacts. CuePoint implements:

- **Deterministic dependency installation** via `pip --require-hashes`
- **Build provenance** (commit SHA, tool versions) in `dist/build_info.json`
- **Installer verification** (checksums and code signatures)

## Toolchain Versions

Use these versions for reproducible builds:

| Tool | Version | Source |
| --- | --- | --- |
| Python | 3.13.7 | `.github/workflows/build-*.yml` |
| PyInstaller | 6.17.0 | `requirements-build.txt` |
| NSIS (Windows) | Latest from Chocolatey | Build workflow installs via `choco install nsis` |
| macOS runner | `macos-latest` | GitHub Actions |
| Windows runner | `windows-latest` | GitHub Actions |

## Deterministic Dependency Installation

Release builds use hash-checked pip installs to ensure dependencies are exactly as specified.

### Generate Hashed Requirements

```bash
pip install hashin
python scripts/generate_requirements_hashes.py
```

This produces `requirements-build-hashed.txt` with `--hash=sha256:...` for each package.

### Install with Hash Checking

```bash
pip install -r requirements-build-hashed.txt --require-hashes
```

This fails if any package does not match its declared hash, preventing supply-chain tampering.

### CI Integration

The build workflows (`build-macos.yml`, `build-windows.yml`) automatically use hash checking when building from a version tag (`v*`). The release-gates workflow validates that hash generation and install succeed before release.

## Build Provenance

Each release build emits `dist/build_info.json`:

```json
{
  "version": "1.2.3",
  "commit_sha": "abc123...",
  "build_time": "2026-02-04T12:00:00Z",
  "workflow_run_id": "123456789",
  "builder": "GitHub Actions",
  "python_version": "3.13.7",
  "pyinstaller_version": "6.17.0"
}
```

Use this to trace any artifact back to its source commit and build environment.

## Verifying Installers

### Checksums

Every release includes `SHA256SUMS` (or `SHA256SUMS.txt`) with SHA256 hashes of all artifacts.

**Verify a downloaded installer:**

```bash
# Linux/macOS
sha256sum -c SHA256SUMS

# Or manually
sha256sum CuePoint-v1.2.3.dmg
# Compare output to the line in SHA256SUMS for that file
```

**Generate checksums locally:**

```bash
python scripts/generate_checksums.py --output SHA256SUMS.txt --algorithms sha256
```

### Code Signatures

**macOS (codesign):**

```bash
codesign --verify --deep --strict --verbose=2 dist/CuePoint.app
codesign --verify --verbose=2 dist/CuePoint-v1.2.3.dmg
spctl --assess --type execute --verbose=2 dist/CuePoint.app
```

**Windows (signtool):**

```powershell
signtool verify /pa dist/CuePoint-Setup-v1.2.3.exe
```

### Automated Verification

The `verify_installer.py` script runs checksum and signature verification:

```bash
python scripts/verify_installer.py --dir dist/ --checksums dist/SHA256SUMS.txt
python scripts/validate_signatures.py --dir dist/
```

Use `--require-signature` to fail if artifacts are unsigned (e.g. in a signing-enabled pipeline).

## Local Build (Approximate Reproducibility)

For local development builds (not bit-identical to CI):

1. **Install Python 3.13** (or the version in `build-macos.yml` / `build-windows.yml`).

2. **Install dependencies:**
   ```bash
   pip install -r requirements-build.txt
   ```

3. **Build:**
   ```bash
   python scripts/build_pyinstaller.py
   ```

4. **macOS:** Create DMG with `scripts/create_dmg.sh`.
5. **Windows:** Build NSIS installer with `makensis scripts/installer.nsi`.

Local builds may differ from CI due to:

- Different OS patch levels
- Different Python micro-version
- Timestamps in binaries
- Signing (CI uses secrets; local may be unsigned)

For maximum reproducibility, run builds in GitHub Actions or use the same runner image locally (e.g. via `act` or a container).

## Build Containers (Optional)

For stricter reproducibility, use a container with pinned toolchain:

```dockerfile
FROM python:3.13.7-slim
RUN pip install --no-cache-dir hashin
COPY requirements-build.txt .
RUN pip install hashin && \
    hashin -r requirements-build.txt && \
    pip install -r requirements-build-hashed.txt --require-hashes
# ... build steps
```

Lock the base image digest (e.g. `python:3.13.7-slim@sha256:...`) for full reproducibility.

## Related Documentation

- [Release Deployment Runbook](../release-deployment-runbook.md) – Full release process and build
- [Checksum Signing](../checksum-signing.md) – GPG signing of SHA256SUMS
- [Key Management](../key-management.md) – Certificate handling
